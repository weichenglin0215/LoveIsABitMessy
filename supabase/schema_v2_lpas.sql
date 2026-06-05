-- schema_v2_lpas.sql
-- LoveIsABitMessy - LPAS v2 遷移腳本
-- 用途：升級 lpas_answers / lpas_results 以支援 v2 評量結構
-- 安全性：全程使用 IF NOT EXISTS / IF EXISTS，可重複執行
-- 執行方式：Supabase Dashboard → SQL Editor → 貼上整份執行

-- ============================================================
-- 1. lpas_answers：支援「跳過題」
-- ============================================================

-- 1.1 解除 score 的 NOT NULL 限制（讓跳過的性題可以存 NULL）
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lpas_answers'
      AND column_name = 'score'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.lpas_answers ALTER COLUMN score DROP NOT NULL;
  END IF;
END $$;

-- 1.2 重寫 CHECK 約束（允許 NULL 或 1-7）
ALTER TABLE public.lpas_answers DROP CONSTRAINT IF EXISTS lpas_answers_score_check;
ALTER TABLE public.lpas_answers
  ADD CONSTRAINT lpas_answers_score_check
  CHECK (score IS NULL OR (score >= 1 AND score <= 7));

-- 1.3 新增 skipped 欄位（明確標示是否為跳過題）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lpas_answers'
      AND column_name = 'skipped'
  ) THEN
    ALTER TABLE public.lpas_answers ADD COLUMN skipped boolean NOT NULL DEFAULT false;
  END IF;
END $$;

-- 1.4 新增 axis 欄位（v2 使用 'attachment' | 'channel' | 'frame' | 'sex_emotion' | 'sex_openness'）
-- 注意：v1 的 dimension 仍保留作 v1 相容
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lpas_answers'
      AND column_name = 'axis'
  ) THEN
    ALTER TABLE public.lpas_answers ADD COLUMN axis text;
  END IF;
END $$;


-- ============================================================
-- 2. lpas_results：新增 v2 結果欄位
-- ============================================================

DO $$
BEGIN
  -- engine_version：區分 v1 / v2 資料
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lpas_results'
      AND column_name = 'engine_version'
  ) THEN
    ALTER TABLE public.lpas_results
      ADD COLUMN engine_version text NOT NULL DEFAULT 'v1';
  END IF;

  -- triple_code：三聯代碼（公主-女王-浪子）
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lpas_results'
      AND column_name = 'triple_code'
  ) THEN
    ALTER TABLE public.lpas_results ADD COLUMN triple_code text;
  END IF;

  -- axis_scores：9 格軸分數 + 性象限分數 + 三聯型號
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lpas_results'
      AND column_name = 'axis_scores'
  ) THEN
    ALTER TABLE public.lpas_results ADD COLUMN axis_scores jsonb;
  END IF;

  -- script_name：命中的經典劇本名
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lpas_results'
      AND column_name = 'script_name'
  ) THEN
    ALTER TABLE public.lpas_results ADD COLUMN script_name text;
  END IF;

  -- sex_label：性象限標籤
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'lpas_results'
      AND column_name = 'sex_label'
  ) THEN
    ALTER TABLE public.lpas_results ADD COLUMN sex_label text;
  END IF;
END $$;


-- ============================================================
-- 3. 索引（加速 v2 統計查詢）
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_lpas_results_engine
  ON public.lpas_results(engine_version);

CREATE INDEX IF NOT EXISTS idx_lpas_results_triple
  ON public.lpas_results(triple_code);

CREATE INDEX IF NOT EXISTS idx_lpas_results_script
  ON public.lpas_results(script_name)
  WHERE script_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_lpas_results_sex
  ON public.lpas_results(sex_label)
  WHERE sex_label IS NOT NULL;


-- ============================================================
-- 4. 註解（給後續維護者）
-- ============================================================

COMMENT ON COLUMN public.lpas_results.engine_version IS 'v1 = 舊版 16 型 × 3 階段；v2 = 新版 8 型三聯 + 性象限';
COMMENT ON COLUMN public.lpas_results.triple_code     IS 'v2 三聯命名，例如「公主-女王-浪子」';
COMMENT ON COLUMN public.lpas_results.axis_scores     IS 'v2 軸分數 JSON：每階段三軸分數 + 型號 + 性象限分數';
COMMENT ON COLUMN public.lpas_results.script_name     IS 'v2 命中的經典劇本名，無則 NULL';
COMMENT ON COLUMN public.lpas_results.sex_label       IS 'v2 性象限標籤（深情專一型 / 深情多元型 / 冷靜遊戲型 / 自由探索型），跳過太多時為 NULL';

COMMENT ON COLUMN public.lpas_answers.skipped IS 'v2 性象限題目可由受測者跳過，true 表示跳過';
COMMENT ON COLUMN public.lpas_answers.axis    IS 'v2 軸代碼：attachment / channel / frame / sex_emotion / sex_openness';


-- ============================================================
-- 5. 完成提示（執行完後可查詢驗證）
-- ============================================================

-- 驗證指令（可選，執行後人工檢查）：
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name IN ('lpas_answers', 'lpas_results')
--   ORDER BY table_name, ordinal_position;
