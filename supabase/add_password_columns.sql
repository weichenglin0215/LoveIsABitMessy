-- 替 love_line_users 增加密碼欄位
ALTER TABLE love_line_users 
ADD COLUMN IF NOT EXISTS password TEXT;

-- 替 novel_entries 增加密碼欄位
ALTER TABLE novel_entries 
ADD COLUMN IF NOT EXISTS password TEXT;
