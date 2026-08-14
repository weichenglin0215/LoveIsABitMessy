---
name: LoveIsABitMessy 專案規範
description: 開始任何任務前必讀，所有修改必須符合本規範
---

# 專案規範

## lpas.html/lpas_app.js/lpas_v3.html/lpas_v3_app.js 介面設計
- 手機瀏覽器與PC瀏覽器皆可顯示滿畫面，套用screen_adaptive.js
- 採用 web/css/lpas_styles.css
- 使用 px 單位
- 使用 flexbox 佈局

## 其他網頁的介面設計
- 主要以PC瀏覽器為準
- 採用 web/css/editer.css
- 使用 rem 單位
- 使用 flexbox 和 grid 佈局

## 介面樣式準則（characters_editor / daily_run / novel_generator / loveline 共用）

### 一、最高指導原則

1. **優先使用 `editer.css` 既有 class**。修改 HTML/JS 之前先 `grep` 一輪 editer.css，確認沒有現成可用的 class 才考慮新增。
2. **禁止在 HTML/JS 寫死 `style="…"`**，除非該樣式：
   - 屬於該元素獨有且不會在其他地方重複出現（一次性 layout）；或
   - 是與該元素內容強耦合的數值（如 textarea 的特定 `height:400px`，三種高度各表不同內容區段）。
   - **警示色 `color:red`、`border-color:red` 之類已有 `.text-warn` 對應，請改用 class。**
3. **新增 class 前先檢查是否有近似既有 class**。CSS 體積過去因「每個頁面寫自己的 class」而膨脹一倍以上，已於 V0.9.8.0 清理過 412 行死碼，後續維護必須守住這個底線。

### 二、現有 class 系統（V0.9.8.0 後定案）

| 類別 | class | 用途 |
| :--- | :--- | :--- |
| **按鈕 (大)** | `.primary-btn` `.secondary-btn` `.ai-btn` `.ai-btn-bluepink` | 4 種顏色變體；默認大尺寸 |
| **按鈕 (中)** | 大按鈕 + `.size-md` ／ `.small-btn` ／ `.btn-modal.primary\|.cancel\|.delete` ／ `.btn-send-circle` | 用尺寸修飾或專用 class |
| **按鈕 (小)** | `.btn-icon` `.btn-circle` `.btn-circle-sm` `.btn-del-sec` `.collapse-btn` `.reload-btn` `.modal-close-btn` | 圖示按鈕家族 |
| **標題 5 級** | `.title-xl` `.title-lg` `.title-md` `.title-sm` `.title-hint` | 取代 `.app-title / .form-label / .field-label / .hint` 等舊類別；h2/h3 仍可由 `.col-header h2/h3` 等上下文選擇器處理 |
| **輸入欄寬度** | `.w-fill` `.w-half` `.w-60p` `.w-80p` ／ `.w-60` `.w-70` `.w-72` `.w-80` `.w-160` `.w-200` `.w-240` `.w-300` `.w-400` `.w-500` `.w-600` | 唯一可用的寬度設定方式；HTML 不再寫 `style="width:…"` |
| **數字輸入** | `input.input-num` `input.input-num-sm` | 置中對齊 + 標準 padding；用 `input.X` 元素+class 才能贏過基底 `input[type=number]` 選擇器 |
| **通用文字** | `.text-center` `.text-warn` `.text-pink` `.text-muted-sm` | 警示色／粉色強調／灰色小註解 |
| **比對彈窗** | `.cmp-modal` `.cmp-toolbar` `.cmp-title` `.cmp-label` `.cmp-icon` `select.cmp-select` `.cmp-body` `.cmp-col` `.cmp-col-header` `.cmp-content` | 兩個 4 欄 Compare modal 共用版型（小說 / 日記） |
| **比對欄內標籤** | `.cd-col-label` (+`.with-top`) `.cd-col-textarea` | daily_run 比對日記彈窗內，「故事 / 圖片提示詞 / AI 參數」三段標籤與平面 textarea |
| **全面搜尋面板** | `.gs-panel` (+`.hidden`) `.gs-header` `.gs-row` `.gs-results` `.gs-cat-header` `.gs-cat-count` `.gs-item` `.gs-loc` | novel_generator 的 Ctrl+Shift+F 浮動搜尋面板（非 modal、可拖曳；`z-index:90` 低於 `.modal-overlay`。因專案 `.hidden` 僅對 `.modal-overlay` 生效，故另定義 `.gs-panel.hidden`） |
| **全畫面編輯** | `.fs-body` `.fs-row` `.fs-chapter` `.fs-desc` `.fs-content` `.fs-row-resizer` | novel_generator「全畫面編輯」彈窗：每小節一橫行（章編號直排／小節描述 1/3 寬／內文），行間夾可上下拖曳的分隔線；外層沿用既有 `.cmp-modal` + `.cmp-toolbar`，`.fs-body` 捲動軸覆寫為 12px |
| **尋找／取代面板** | `.fr-panel` (+`.hidden`) | novel_generator 由 Alt+A 快顯功能表呼叫的小型浮動面板（420px 寬、可拖曳）；內部列沿用 `.gs-header` / `.gs-row`。`z-index:120` **高於** `.modal-overlay`(100)，這樣「全畫面編輯」彈窗開著時仍能操作 |
| **快顯功能表選單** | `.qk-menu` (+`.hidden`) `.qk-scope` `.qk-item` `.qk-key` | novel_generator 的 Alt+A 選單，於游標附近彈出；`.qk-scope` 顯示作用範圍（主介面／全畫面編輯），`.qk-item` 左名稱右熱鍵（`.qk-key`）。`z-index:130` 高於 `.fr-panel` |
| **內文編輯器橫向分隔線** | `.editor-side-resizer` | novel_generator「🖋️內文」欄，`#active-section-title`（節標題）與 `#main-editor`（內文）之間可拖曳的分隔線，外觀沿用全畫面編輯 `.fs-row-resizer` 的樣式；預設節標題佔 1/3、內文佔 2/3（`#editor-side` 改為直向 flex 容器，欄位本身不再捲動） |
| **禁止匯出按鈕** | `.no-export-toggle` `.fs-noexport-badge` `.fs-row.no-export` | novel_generator 的「🔕 禁止匯出」：`.no-export-toggle` 併入 § 15「幽靈圖示按鈕」共用規則（`.btn-icon`/`.btn-lock-ch`/`.sec-lock` 同一組選擇器），與 🔓/🔒 鎖頭按鈕**同字級同 padding**；純 `<span>` 點擊切換、不用 checkbox，開關狀態以 inline `style="opacity:0.5/1"` 表示（JS 內嵌，比照鎖頭按鈕的既有寫法）。全畫面編輯彈窗中 `.fs-row.no-export` 讓該行的 `.fs-desc`/`.fs-content` 改用 `--c-err` 紅色邊框，`.fs-noexport-badge` 為章編號框上緣的 🔕 標記（`position:absolute` + `writing-mode:horizontal-tb` 轉回橫排、`pointer-events:none` 純顯示不可勾選） |
| **評論小說立場切換** | `.review-stance-toggle-group` `.review-stance-toggle` | novel_generator「🎯評論小說」彈窗，「使用NovelReviewSkill列表」／「使用者編輯提示詞」互斥切換，外觀為膠囊型分段按鈕（參考 `Japanese50Sounds/index.html` 的 `.script-toggle`/`.toggle-btn`），選中項底色 `var(--c-secondary)`＋白字、未選中項卡片底色＋`var(--c-secondary-light)` 文字；底層仍是兩個 `<input type="checkbox">`（用絕對定位＋`opacity:0` 隱藏，不影響既有 `qs('#review-use-skills').checked` 之類的讀寫邏輯）。同彈窗另外兩個獨立勾選框（加入使用者自訂提示詞／整合最終評審意見）改用 `.review-option-toggle`（原 `.review-mode-toggle` 更名，外觀不變：字級與勾選框同步放大為 `--font-size-lg`），與這組分段按鈕互不干擾 |
| **全畫面編輯章編號 tooltip** | `.fs-chapter-tooltip` (+`.hidden`) | novel_generator 全畫面編輯彈窗，滑鼠移入左側「第X章」直排欄時顯示的自訂浮動框（跟隨游標定位），取代原生 `title` 屬性以便控制字級（`--font-size-lg`）；內容含章節編號／章標題／章描述，`white-space:pre-line` 換行顯示 |

### 三、新增 class 的時機與規範

允許新增 class 的情況：
1. **重複 3 次以上的 inline 樣式組合**（含已存在的、跨檔案的）。
2. **語意上明確獨立的元件**（例如「全螢幕比對彈窗」、「圓形送出鈕」）。
3. **修飾類** (modifier)，用來組合既有基底 class（如 `.size-md` 套用於 `.ai-btn`）。

不允許的情況：
- 純為了一個元素的 padding/margin 微調而新增 class。
- 命名與既有 class 過度相似（如 `.btn-small` vs 既有 `.small-btn`）。
- 跨檔案 hard-coded 顏色／字級／間距而不使用 `:root` 變數。

### 四、CSS 選擇器優先序陷阱

- 基底 `input[type="number"]`、`input[type="text"]` 等屬性選擇器 specificity = (0,1,1)，
  純 class `.X` = (0,1,0)，會輸給基底；padding/font-size 等覆寫**不會生效**。
- 對策：寫成 `input.X` 拉到 (0,1,1)，靠源序在後而勝出。已採用於 `.input-num / .input-num-sm / .cmp-select`。
- 對於 `body.daily-page X` 這類 body-scope 覆寫，先確認 body 元素**實際上**有那個 class（V0.9.8.0 清理時發現多個頁面從未 set class，相關 CSS 死碼已全數移除）。

### 五、修改流程強制檢查

每次動 HTML/JS 樣式時：
1. **改前** `grep` 一次 editer.css：「我要的效果是否已有 class？」
2. **改後** 不留 inline `style="…"`（前述例外除外）。
3. **新增 class** 必須同步：(a) editer.css 加註用途、(b) 本 SPEC.md「現有 class 系統」表格更新、(c) 若取代既有 class，要在 commit message 列出。
4. **驗證** 用 `web/` 目錄起 `python -m http.server` 開頁面，必要時用 `getComputedStyle` 採樣對照預期值（特別是 input/select/textarea 的 padding/font-size）。
5. **跨頁影響** editer.css 由 4 頁共用（lpas 頁除外，用 `lpas_styles.css`）；任何刪除或改名都要先 `grep` 四頁 HTML 與全部 JS。

### 六、`:root` 變數使用準則

- 顏色、字級、間距、圓角必須引用 `:root` 變數，禁止寫死數字。
- 唯一例外：modal 內極少數品牌色（如 `#7c3aed`、`#f472b6` 漸層）已封裝在 `.ai-btn-bluepink` 內。
- 新增變數前先檢查既有的 `--font-size-* / --gap-* / --pad-* / --radius-* / --c-*` 是否夠用。


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
