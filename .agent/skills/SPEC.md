---
name: LoveIsABitMessy 專案規範
description: 開始任何任務前必讀，所有修改必須符合本規範
---

# 專案規範

## lpas.html/lpas_app.js 介面設計
- 手機瀏覽器與PC瀏覽器皆可顯示滿畫面，套用screen_adaptive.js
- 採用 web/css/lpas_styles.css
- 使用 px 單位
- 使用 flexbox 佈局

## 其他網頁的介面設計
- 主要以PC瀏覽器為準
- 採用 web/css/editer.css
- 使用 rem 單位
- 使用 flexbox 和 grid 佈局


## 資料儲存
- 使用 Supabase 作為資料庫
- 使用 JSONB 儲存複雜資料
- 使用 RLS (Row Level Security) 保護資料
- 使用 anon 角色進行匿名存取
- 角色卡、日記、小說、劇本都儲存本機與雲端兩份。

## 檔案命名規則
- 角色卡：`characters/role_YYYY-MM-DD_角色id.json`
- 日記文檔：`diaries/YYYY-MM-DD_角色id.json`
- 圖片檔：`images/YYYY-MM-DD_角色id.png`
- 網頁檔：`web/YYYY-MM-DD.html`

## 其他注意事項
- 所有 JavaScript、HTML、CSS、JSON、SQL 等檔案，其編碼格式均使用 UTF-8，不可使用其他編碼。
- 所有程式碼都必須有詳細的註解。
- 所有變數、函式、檔案的命名都必須使用英文。
- LOG大型彈窗套用統一寫法，請參考 web/daily_run.html 的 <!-- ── Modal: System Message LOG ── --> 區塊。
- LOG欄的寫法請參考 web/daily_run.html 的 textarea id="log-output"，LOG欄的文字只能添加，不能清空或覆蓋。

## 禁止事項
- 禁止更改 HTML 模板的基本結構
- 禁止新增未在此規範列出的功能
