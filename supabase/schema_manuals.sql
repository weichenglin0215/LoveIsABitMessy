-- ============================================================
-- LoveIsABitMessy — 使用手冊「新增使用手冊」雲端資料表
-- ------------------------------------------------------------
-- 官方使用手冊放在 note/ 目錄下，由開發者手動維護（前端讀取，使用者不可改）。
-- 新增使用手冊放在雲端，使用者可撰寫；每次儲存 = 插入新一 row，保留完整版本歷程。
-- 讀取時：以 section 過濾、取 created_at 最新一筆。
--
-- 到 Supabase → SQL Editor 執行本檔即可。
-- ============================================================

CREATE TABLE IF NOT EXISTS manual_custom_history (
    id           bigserial   PRIMARY KEY,
    -- 對應五個頁面：novel / loveline / diary / character_editor / lpas
    section      text        NOT NULL
                 CHECK (section IN ('novel','loveline','diary','character_editor','lpas')),
    content      text        NOT NULL DEFAULT '',
    -- 選填：儲存者暱稱（LoveLine 已有 user 概念，可以填 currentUser.name；沒登入就 null）
    updated_by   text,
    created_at   timestamptz NOT NULL DEFAULT now()
);

-- 依 section + 時間倒序建立索引，讓「取最新一筆」的查詢 O(log N)
CREATE INDEX IF NOT EXISTS idx_manual_custom_history_section_time
    ON manual_custom_history (section, created_at DESC);

-- ------------------------------------------------------------
-- 開放讀寫（因為前端使用 anon key 直接存取）
-- 若你有啟用 RLS，執行以下政策；沒有可略。
-- ------------------------------------------------------------
ALTER TABLE manual_custom_history ENABLE ROW LEVEL SECURITY;

-- 允許 anon 讀取全部
DROP POLICY IF EXISTS "anon read manual_custom_history" ON manual_custom_history;
CREATE POLICY "anon read manual_custom_history"
    ON manual_custom_history
    FOR SELECT
    TO anon
    USING (true);

-- 允許 anon 新增（僅 INSERT，不允許 UPDATE/DELETE 以保留歷程）
DROP POLICY IF EXISTS "anon insert manual_custom_history" ON manual_custom_history;
CREATE POLICY "anon insert manual_custom_history"
    ON manual_custom_history
    FOR INSERT
    TO anon
    WITH CHECK (true);

-- ------------------------------------------------------------
-- 驗證：查詢五個 section 各自最新一筆
-- ------------------------------------------------------------
-- SELECT DISTINCT ON (section) section, id, created_at, length(content) AS len
--   FROM manual_custom_history
--   ORDER BY section, created_at DESC;
