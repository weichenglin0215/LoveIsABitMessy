-- schema_v3_strip_intimacy_type.sql
-- LoveIsABitMessy - 資料遷移：personality_type 移除親密關係結尾的「型」字
--
-- 背景：
--   舊格式 personality_type = "PFOL_AFOL_PSOL_深情專一型"
--   新格式 personality_type = "PFOL_AFOL_PSOL_深情專一"（刪除最後一個「型」字）
--   親密關係四象限：深情專一 / 鍾情博愛 / 靈肉分離 / 遊戲人間
--
-- 影響欄位（皆為資料內容，無需更改欄位型別）：
--   1. public.characters.card_json ->> 'personality_type'（JSONB 內字串）
--   2. public.characters.lpas（鏡射 personality_type 的文字欄）
--
-- 安全性：只對「以四象限名稱 + 型 結尾」的列做截尾，避免誤改其他格式。
-- 本檔可重複執行（已處理過的列不再符合條件，不會被重複截尾）。

-- ============================================================
-- 1. 更新 card_json 內的 personality_type（JSONB）
-- ============================================================
update public.characters
set card_json = jsonb_set(
        card_json,
        '{personality_type}',
        to_jsonb( left(card_json->>'personality_type', length(card_json->>'personality_type') - 1) )
    )
where card_json ? 'personality_type'
  and card_json->>'personality_type' ~ '_(深情專一|鍾情博愛|靈肉分離|遊戲人間)型$';

-- ============================================================
-- 2. 更新 lpas 文字欄（與 personality_type 同步）
-- ============================================================
update public.characters
set lpas = left(lpas, length(lpas) - 1)
where lpas is not null
  and lpas ~ '_(深情專一|鍾情博愛|靈肉分離|遊戲人間)型$';

-- ============================================================
-- 3.（可選）同步 card_json.lpas_v3.intimacy：去除結尾「型」
--    新格式 lpas_v3.intimacy 已不含「型」；此段修正歷史殘留的含「型」資料。
-- ============================================================
update public.characters
set card_json = jsonb_set(
        card_json,
        '{lpas_v3,intimacy}',
        to_jsonb( left(card_json #>> '{lpas_v3,intimacy}', length(card_json #>> '{lpas_v3,intimacy}') - 1) )
    )
where card_json #>> '{lpas_v3,intimacy}' ~ '(深情專一|鍾情博愛|靈肉分離|遊戲人間)型$';
