-- ============================================================
-- LoveIsABitMessy — 「花小說」已完成小說資料表（published_novels）
-- ------------------------------------------------------------
-- 用途：
--   * novel_generator.html「📤 匯出小說🔽 → ☁️ 發佈到花小說」把「已完成」的小說寫進本表。
--   * novel_reader.html（花小說閱讀網頁）從本表讀取小說列表與內文。
--
-- 與既有 novel_entries 的差別：
--   * novel_entries 存的是「編輯中的完整專案」（粗綱／章描述／節大綱／AI 設定／密碼…），
--     只有作者自己讀取；
--   * published_novels 只存「讀者看得到的成品」（書名＋各章標題＋各章段落），
--     可公開讀取，不含粗綱、作者備註、AI 設定，也沒有密碼欄位。
--
-- 到 Supabase → SQL Editor 執行本檔即可（可重複執行，不會重複建立）。
-- ============================================================

CREATE TABLE IF NOT EXISTS published_novels (
    id           bigserial    PRIMARY KEY,
    -- 書名；同名視為同一本小說，重新發佈時覆蓋（UPDATE），讀者端記錄的閱讀位置以 id 為準，id 不會變
    title        text         NOT NULL UNIQUE,
    -- 小說內容（JSONB）：[{ "title": "第一章 初見", "paragraphs": ["第一段…", "第二段…"] }, ...]
    -- 已由發佈端（novel_generator）整理好：略過「🔕 禁止匯出」的章／節、略過空白、依換行切成段落
    chapters     jsonb        NOT NULL DEFAULT '[]'::jsonb,
    -- 全書字元數（各章標題 + 各段落長度加總），讓閱讀端列表不必下載 chapters 就能顯示字數
    char_count   integer      NOT NULL DEFAULT 0,
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now()
);

-- 列表依「最近更新」排序，建立索引
CREATE INDEX IF NOT EXISTS idx_published_novels_updated
    ON published_novels (updated_at DESC);

-- ------------------------------------------------------------
-- RLS（前端使用 anon key 直接存取）
--   * SELECT ：任何人都能讀（閱讀網頁需要）
--   * INSERT / UPDATE ：開放 anon，讓 novel_generator 能發佈與覆蓋
--   * 不開放 DELETE：前端無法刪除已發佈的小說；要下架請到 Supabase 後台手動刪除
-- ------------------------------------------------------------
ALTER TABLE published_novels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon read published_novels" ON published_novels;
CREATE POLICY "anon read published_novels"
    ON published_novels
    FOR SELECT
    TO anon
    USING (true);

DROP POLICY IF EXISTS "anon insert published_novels" ON published_novels;
CREATE POLICY "anon insert published_novels"
    ON published_novels
    FOR INSERT
    TO anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "anon update published_novels" ON published_novels;
CREATE POLICY "anon update published_novels"
    ON published_novels
    FOR UPDATE
    TO anon
    USING (true)
    WITH CHECK (true);

-- ------------------------------------------------------------
-- 驗證：查詢已發佈的小說（不含內文）
-- ------------------------------------------------------------
-- SELECT id, title, char_count, updated_at FROM published_novels ORDER BY updated_at DESC;
