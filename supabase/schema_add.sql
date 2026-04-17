-- schema_add.sql  —  LoveIsABitMessy 追加欄位 / 政策
-- 用途：在 Supabase Dashboard → SQL Editor 中貼上執行即可。

-- 1. 移除 diary_entries 的 story_json（已改為儲存乾淨欄位）
-- 如果出現 "column does not exist" 錯誤，代表已經成功移除，請忽略。
ALTER TABLE public.diary_entries DROP COLUMN IF EXISTS story_json CASCADE;

-- 2. characters 新增 lpas_record_json（儲存 LPAS 答題過程完整快照）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'characters' AND column_name = 'lpas_record_json'
  ) THEN
    ALTER TABLE public.characters ADD COLUMN lpas_record_json jsonb;
  END IF;
END $$;

-- 3. 開放匿名 (anon) 的 INSERT/UPDATE 權限
--    讓 lpas.html / run_daily.html 等不需要登入就能寫入。

-- characters: anon 可 insert / update（前端 LPAS 生成角色卡）
DROP POLICY IF EXISTS p_characters_anon_insert ON public.characters;
CREATE POLICY p_characters_anon_insert
ON public.characters
FOR INSERT
TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS p_characters_anon_update ON public.characters;
CREATE POLICY p_characters_anon_update
ON public.characters
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- lpas_sessions: anon 可 insert
DROP POLICY IF EXISTS p_lpas_sessions_anon_insert ON public.lpas_sessions;
CREATE POLICY p_lpas_sessions_anon_insert
ON public.lpas_sessions
FOR INSERT
TO anon
WITH CHECK (true);

-- lpas_answers: anon 可 insert
DROP POLICY IF EXISTS p_lpas_answers_anon_insert ON public.lpas_answers;
CREATE POLICY p_lpas_answers_anon_insert
ON public.lpas_answers
FOR INSERT
TO anon
WITH CHECK (true);

-- lpas_results: anon 可 insert
DROP POLICY IF EXISTS p_lpas_results_anon_insert ON public.lpas_results;
CREATE POLICY p_lpas_results_anon_insert
ON public.lpas_results
FOR INSERT
TO anon
WITH CHECK (true);

-- diary_entries: anon 可 insert / update
DROP POLICY IF EXISTS p_diary_entries_anon_insert ON public.diary_entries;
CREATE POLICY p_diary_entries_anon_insert
ON public.diary_entries
FOR INSERT
TO anon
WITH CHECK (true);

DROP POLICY IF EXISTS p_diary_entries_anon_update ON public.diary_entries;
CREATE POLICY p_diary_entries_anon_update
ON public.diary_entries
FOR UPDATE
TO anon
USING (true)
WITH CHECK (true);

-- lpas_sessions / lpas_answers / lpas_results: anon 可 select（方便前端回讀）
DROP POLICY IF EXISTS p_lpas_sessions_anon_read ON public.lpas_sessions;
CREATE POLICY p_lpas_sessions_anon_read
ON public.lpas_sessions
FOR SELECT
TO anon
USING (true);

DROP POLICY IF EXISTS p_lpas_answers_anon_read ON public.lpas_answers;
CREATE POLICY p_lpas_answers_anon_read
ON public.lpas_answers
FOR SELECT
TO anon
USING (true);

DROP POLICY IF EXISTS p_lpas_results_anon_read ON public.lpas_results;
CREATE POLICY p_lpas_results_anon_read
ON public.lpas_results
FOR SELECT
TO anon
USING (true);
