---
name: LoveIsABitMessy 專案規範
description: 開始任何任務前必讀，所有修改必須符合本規範
---

# 專案規範

## 介面設計
- 採用深色模式
- 使用 CSS 變數管理顏色，以hsl()表示
- 使用 rem 單位
- 使用 flexbox 佈局
- 使用 grid 佈局

## 資料儲存
- 使用 Supabase 作為資料庫
- 使用 JSONB 儲存複雜資料
- 使用 RLS (Row Level Security) 保護資料
- 使用 anon 角色進行匿名存取
- 角色卡、日記、小說、劇本都儲存本機與雲端兩份。

## 檔案命名規則
- 角色卡：`characters/role_YYYY-MM-DD_角色id.json`
- 故事檔：`stories/YYYY-MM-DD_角色id.json`
- 圖片檔：`images/YYYY-MM-DD_角色id.png`
- 網頁檔：`web/YYYY-MM-DD.html`

## 禁止事項
- 禁止修改 `characters/` 資料夾內的 JSON
- 禁止修改 `stories/` 資料夾內的 JSON
- 禁止更改 HTML 模板的基本結構
- 禁止新增未在此規範列出的功能
