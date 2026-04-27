-- 替 love_line_users 增加儲存 AI 設定的欄位
ALTER TABLE love_line_users 
ADD COLUMN IF NOT EXISTS ai_model TEXT,
ADD COLUMN IF NOT EXISTS model_options TEXT,
ADD COLUMN IF NOT EXISTS writer_style TEXT,
ADD COLUMN IF NOT EXISTS writer_sample TEXT;
