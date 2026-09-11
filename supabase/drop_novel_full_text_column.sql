-- 移除 novel_entries.novel_full_text 欄位
--
-- 背景：此欄位只在存檔時「純寫入」（web/js/novel_generator_app.js 的
--       confirmSaveProject() / autoSaveBook()），全專案目前沒有任何程式碼會讀取它；
--       小說全文的結構化資料已完整保存在 edit_data.chapters / edit_data.storyPremise，
--       前端已於 V0.12.22.0 起停止寫入這個欄位。
--
-- ⚠️ 警告：此操作【不可逆】，執行後會永久刪除這個欄位裡目前所有小說的全文備份，無法復原。
--
-- 執行前建議：
--   1. 確認瀏覽器實際載入的是 V0.12.22.0（或之後）的 novel_generator_app.js，
--      否則舊版前端仍會嘗試寫入 novel_full_text 欄位，存檔時會失敗。
--   2. 若想留一份備份以防萬一，可先執行下面查詢，把結果另存成檔案：
--        SELECT id, novel_title, novel_full_text, updated_at FROM novel_entries;

ALTER TABLE novel_entries
DROP COLUMN IF EXISTS novel_full_text;
