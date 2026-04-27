-- schema_chat.sql — LoveLine 聊天功能資料表
-- 用途：在 Supabase Dashboard → SQL Editor 中貼上執行即可。
-- 建立時間：2026-04-27
--
-- 設計說明：
-- * chat_sessions     — 每個「聊天對話」(1對1 或 多人聊天室)
-- * chat_participants — 聊天室的參與者（角色卡 or 使用者）
-- * chat_messages     — 每則訊息紀錄
--
-- 使用者身份設計：
--   每個使用者由 user_key (文字) 識別，目前為自訂識別碼
--   (預留欄位供未來接 Supabase Auth 使用)
--
-- 使用者間聊天（user-to-user）：
--   預留規格：participants 中 participant_type='user'
--   實際同步機制（每30秒~1分鐘）未來再實作

-- ====== 聊天 Session ======

CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type  text        NOT NULL DEFAULT 'one_on_one',  -- 'one_on_one' | 'group'
  title         text,                                        -- 聊天室名稱（多人用）
  owner_key     text        NOT NULL,                        -- 建立者 user_key
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_owner ON public.chat_sessions(owner_key);

-- ====== 聊天室成員 ======

CREATE TABLE IF NOT EXISTS public.chat_participants (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id       uuid        NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  participant_type text        NOT NULL DEFAULT 'character', -- 'character' | 'user'
  -- 角色卡成員（character_id 與 characters.id 邏輯關聯，不設外鍵以避免型別衝突）
  character_id     text,                                     -- 儲存 characters.id 的值
  character_name   text,                                     -- 快照，避免角色卡改名
  -- 使用者成員（預留，未來 user-to-user 用）
  user_key         text,
  joined_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_participants_session ON public.chat_participants(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_participants_char    ON public.chat_participants(character_id);

-- ====== 聊天訊息 ======

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     uuid        NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  -- 發送者：使用者本人
  sender_type    text        NOT NULL DEFAULT 'user',   -- 'user' | 'character'
  sender_key     text,        -- user_key (若 sender_type='user')
  sender_char_id text,        -- character id (若 sender_type='character')
  sender_name    text,        -- 顯示名稱快照
  -- 訊息本文
  content        text        NOT NULL,
  -- 元資料
  model_used     text,        -- 使用的 AI 模型名稱（AI 回覆時記錄）
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session    ON public.chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created_at ON public.chat_messages(session_id, created_at);

-- ====== updated_at trigger for chat_sessions ======

DROP TRIGGER IF EXISTS trg_chat_sessions_updated_at ON public.chat_sessions;
CREATE TRIGGER trg_chat_sessions_updated_at
BEFORE UPDATE ON public.chat_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ====== RLS ======

ALTER TABLE public.chat_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages     ENABLE ROW LEVEL SECURITY;

-- 允許匿名讀寫（前端以 anon key 操作，由 owner_key / user_key 邏輯控管隔離）
-- 未來若接 Supabase Auth，可改為 auth.uid() 限制

DROP POLICY IF EXISTS p_chat_sessions_anon_all     ON public.chat_sessions;
CREATE POLICY p_chat_sessions_anon_all
ON public.chat_sessions FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_chat_participants_anon_all ON public.chat_participants;
CREATE POLICY p_chat_participants_anon_all
ON public.chat_participants FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_chat_messages_anon_all     ON public.chat_messages;
CREATE POLICY p_chat_messages_anon_all
ON public.chat_messages FOR ALL TO anon USING (true) WITH CHECK (true);

-- Authenticated 完全存取
DROP POLICY IF EXISTS p_chat_sessions_auth_all     ON public.chat_sessions;
CREATE POLICY p_chat_sessions_auth_all
ON public.chat_sessions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_chat_participants_auth_all ON public.chat_participants;
CREATE POLICY p_chat_participants_auth_all
ON public.chat_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_chat_messages_auth_all     ON public.chat_messages;
CREATE POLICY p_chat_messages_auth_all
ON public.chat_messages FOR ALL TO authenticated USING (true) WITH CHECK (true);
-- ====== 使用者雲端資料表 (跨裝置同步設定) ======

CREATE TABLE IF NOT EXISTS public.love_line_users (
  user_key      text        PRIMARY KEY,             -- 使用者自定義的 ID
  nickname      text        NOT NULL,                -- 顯示暱稱
  char_id       text,                                -- 關聯角色卡 ID
  persona       text,                                -- 資料覆蓋設定
  extra_info    text,                                -- 額外補充資料
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.love_line_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_ll_users_anon_all ON public.love_line_users;
CREATE POLICY p_ll_users_anon_all
ON public.love_line_users FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS p_ll_users_auth_all ON public.love_line_users;
CREATE POLICY p_ll_users_auth_all
ON public.love_line_users FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 觸發器自動更新時間
DROP TRIGGER IF EXISTS trg_ll_users_updated_at ON public.love_line_users;
CREATE TRIGGER trg_ll_users_updated_at
BEFORE UPDATE ON public.love_line_users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 替 love_line_users 增加儲存 AI 設定的欄位
ALTER TABLE love_line_users 
ADD COLUMN IF NOT EXISTS ai_model TEXT,
ADD COLUMN IF NOT EXISTS model_options TEXT,
ADD COLUMN IF NOT EXISTS writer_style TEXT,
ADD COLUMN IF NOT EXISTS writer_sample TEXT;
