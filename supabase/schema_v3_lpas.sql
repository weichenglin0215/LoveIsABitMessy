-- schema_v3_lpas.sql
-- LoveIsABitMessy - LPAS v3 遷移腳本
--
-- v3 改動：
--   1. lpas_sessions.schema_version 可填 3
--   2. lpas_answers.axis 已在 v2 schema 加入；v3 使用值：
--      initiative / pace / expression / possess / sex_emotion / sex_openness
--   3. lpas_results 沿用 v2 欄位，engine_version = 'v3'
--      type_code 格式：phase_codes 三聯 e.g. "A-F-O-H_P-S-O-H_A-S-I-L"
--      triple_code 同上
--      axis_scores: { phase_1: {...}, phase_2: {...}, phase_3: {...} }
--      sex_label: 深情專一型 / 鍾情博愛型 / 靈肉分離型 / 遊戲人間型 / NULL
--   4. characters.source 新增可能值 'lpas_v3'
--
-- 本檔案前置條件：已執行 schema.sql + schema_add.sql + schema_v2_lpas.sql
-- 安全：本檔案僅做檢查與註解更新，不改變任何資料

-- ============================================================
-- 1. 驗證必要欄位存在
-- ============================================================

DO $$
BEGIN
  -- lpas_answers.axis（v2 已新增）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='lpas_answers' AND column_name='axis'
  ) THEN
    RAISE EXCEPTION '錯誤：lpas_answers.axis 欄位不存在。請先執行 schema_v2_lpas.sql';
  END IF;

  -- lpas_answers.skipped（v2 已新增）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='lpas_answers' AND column_name='skipped'
  ) THEN
    RAISE EXCEPTION '錯誤：lpas_answers.skipped 欄位不存在。請先執行 schema_v2_lpas.sql';
  END IF;

  -- lpas_results.engine_version（v2 已新增）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='lpas_results' AND column_name='engine_version'
  ) THEN
    RAISE EXCEPTION '錯誤：lpas_results.engine_version 欄位不存在。請先執行 schema_v2_lpas.sql';
  END IF;

  RAISE NOTICE 'v3 schema 驗證通過，所需欄位均已就緒。';
END $$;


-- ============================================================
-- 2. 索引（針對 v3 查詢加速）
-- ============================================================

-- 按 engine_version 查詢的 partial index
CREATE INDEX IF NOT EXISTS idx_lpas_results_v3
  ON public.lpas_results(engine_version)
  WHERE engine_version = 'v3';

-- 按角色 source 查詢
CREATE INDEX IF NOT EXISTS idx_characters_source
  ON public.characters(source);


-- ============================================================
-- 3. 註解更新
-- ============================================================

COMMENT ON COLUMN public.lpas_answers.axis IS
  'v2/v3 軸代碼：attachment/channel/frame(v2) 或 initiative/pace/expression/possess/sex_emotion/sex_openness(v3)';

COMMENT ON COLUMN public.lpas_results.engine_version IS
  'v1 = 舊版 16 型 × 3 階段；v2 = 8 型三聯 + 性象限；v3 = 16 天候型 × 3 階段 + 4 性象限';

COMMENT ON COLUMN public.lpas_results.type_code IS
  'v3 格式：三期 4 字母代碼以底線串接，例如 A-F-O-H_P-S-O-H_A-S-I-L';

COMMENT ON COLUMN public.lpas_results.triple_code IS
  'v3 等同於 type_code（三期串接）';

COMMENT ON COLUMN public.lpas_results.axis_scores IS
  'v3: { phase_1:{initiative,pace,expression,possess}, phase_2:{...}, phase_3:{...}, sex:{...} }';

COMMENT ON COLUMN public.lpas_results.sex_label IS
  'v3 性象限：深情專一型 / 鍾情博愛型 / 靈肉分離型 / 遊戲人間型 / NULL（跳過或不可分析）';

COMMENT ON COLUMN public.characters.source IS
  'manual / lpas / lpas_v2 / lpas_v3 / import';


-- ============================================================
-- 4. 驗證查詢（執行後可手動跑這些查 v3 資料）
-- ============================================================
-- SELECT id, name, source, card_json->>'lpas_version' AS lpas_version
-- FROM public.characters
-- WHERE source = 'lpas_v3'
-- ORDER BY created_at DESC LIMIT 10;
--
-- SELECT id, type_code, type_name, sex_label, engine_version
-- FROM public.lpas_results
-- WHERE engine_version = 'v3'
-- ORDER BY created_at DESC LIMIT 10;
--
-- SELECT period, axis, COUNT(*) AS n
-- FROM public.lpas_answers a
-- JOIN public.lpas_sessions s ON s.id = a.lpas_session_id
-- WHERE s.schema_version = 3
-- GROUP BY period, axis
-- ORDER BY period, axis;
