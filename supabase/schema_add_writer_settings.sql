-- 建立知名作家寫作風格資料表
CREATE TABLE IF NOT EXISTS writer_styles (
    name TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 建立知名作家寫作範本資料表
CREATE TABLE IF NOT EXISTS writer_samples (
    name TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 啟用 RLS (Row Level Security) - 這裡簡單設定為允許所有人讀寫，實際應用建議根據需求調整
ALTER TABLE writer_styles ENABLE ROW LEVEL SECURITY;
ALTER TABLE writer_samples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all access to writer_styles" ON writer_styles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to writer_samples" ON writer_samples FOR ALL USING (true) WITH CHECK (true);
