# ❤️ LoveIsABitMessy (愛是有點亂)

一個基於 AI 驅動的動態人格故事生成系統，結合了 LPAS 愛情性格評量、大型語言模型與影像生成技術，旨在打造具備深度的虛擬角色與沉浸式的互動體驗。

---

## 🎯 專案目標

1.  **深度人格建模**：透過 LPAS (Love Personality Assessment System) 評量，精確定義角色在不同階段的情感反應。
2.  **角色資料編輯器**：管理雲端角色卡、生日、血型與各階段人格特質。
3.  **每日日記生成**：根據情境 (Scenario) 自動生成細膩的角色日記與對應的插圖。
4.  **loveline 聊天功能**：整合大型語言模型，提供基於角色與使用者人設的文字互動對話功能。
5.  **小說創作工具**：提供多角色、多章節的故事大綱設計與內容自動編寫功能。
6.  **雲端/本地混合架構**：整合 Supabase 雲端資料庫與本地 Ollama / ComfyUI 引擎。

---

## 🏗️ 系統架構

### 1. 前端網頁 (Web Interface)
-   **`lpas_v3.html`**: 愛情人格評量測驗。生成具備性格演化邏輯的「角色卡 (Character Card)」。
-   **`characters_editor.html`**: 進階角色資料編輯功能，包括由AI生成角色圖片。
-   **`daily_run.html`**: 每日日記執行中心。選擇演員、設定情境，即時監控後台生成進度。
-   **`loveline.html`**: 聊天互動中心。選擇角色，進行 AI 角色文字互動。
-   **`novel_generator.html`**: 小說自動產生器。支援章節規劃、AI 生成大綱與小節內文創作，並提供「評論小說」功能，可切換出版社老闆／編輯、中文系老師、愛心家教等多種審稿立場（或依序全跑一輪比較差異）審評稿件；頂部工具列的次要功能（作者備註／比對多本小說／評論小說／多文改寫／網路搜尋並依序改寫）統一收攏在「🧰 額外功能」下拉選單中，並提供 DuckDuckGo 免費搜尋、Tavily API 搜尋兩種可自動整合進提示詞的網路搜尋來源。

### 2. 後端核心 (Python Backend)
-   **`debug_server.py`**: 本地 HTTP 伺服器 (Port 8000)。管理任務異步執行請求。
-   **`generate_daily.py`**: 每日日記生成引擎。
-   **`daily_page_build.py`**: 網頁編譯器。將生成的 JSON 日記轉換為 HTML 靜態頁面並輸出至 `docs/`。
-   **`generate_image.py`**: 影像生成引擎。與 ComfyUI 溝通產出插圖。
-   **`daily_run.py`**: 每日一鍵執行腳本（含故事生成、生圖、網頁編譯）。
-   **`web_search_utils.py`**: 網路搜尋輔助工具（DuckDuckGo HTML 版 / Tavily API / 網頁抓取），供「多文改寫」「網路搜尋並依序改寫」在改寫前先取得事實資料，並內建品質篩選（丟棄驗證頁／導覽列雜訊）、內容淨化（去 URL／Markdown 連結）與長度截斷（單筆 ≤2000 字），完整搜尋原文另會列印到 CMD 供檢視。

### 3. 資料與環境 (Services)
-   **Supabase**: 雲端資料庫 (characters, diary_entries, lpas_sessions)。
-   **Ollama**: 本地 LLM 執行環境 (推薦模型：gemma4)。
-   **ComfyUI**: 本地影像生成環境。

---

## 🧠 提示詞與開源AI大模型的思考衝突
### **prompt_utils.py 要求太多且互相牴觸**
- 盡量減少 system_prompt 的 【核心指令】、【寫作技巧】、【禁止】，並避免互相干擾，造成開源AI大模型過度thinking而卡住或進入無窮迴圈。例如：
    - 禁止使用第一人稱，又要用第一人稱寫日記。
    - 強調字數限制，又要分段。

實測在 Ollama 上跑同一份「日記生成」提示詞時發現：
- **非推理模型**（如 `qwen2.5`、`llama3.1`、`gemma2`）：約 16 秒順利輸出。
- **推理模型**（如 `DeepSeek-R1`、`QwQ`、`Qwen3-thinking`、`GLM-Z1`）：思考兩分鐘以上仍未輸出，或不斷重複思考內容陷入無窮迴圈。

> ⚠️ **註：Qwen3.5、Qwen3.6 系列大模型目前無法用於分析圖片產生提示詞**（不支援 vision / multimodal 輸入），執行 `build_diary_image_prompt_text` 與 `build_analyze_image_prompt_text` 相關功能時請改用支援視覺的模型（如 `llava`、`qwen2.5-vl`、`minicpm-v` 等）。

### 卡死的三個典型原因

1. **規則自我糾結** — 例如同時要求「以內心獨白形式撰寫」+「禁止使用『我』『你』字」，內心獨白本身極難避開第一/第二人稱，推理模型會在 `<think>` 中反覆嘗試、否決、重來，永遠不收斂到 `</think>`。
2. **內容審查內耗** — 提示詞含「出軌、一夜情、亂倫、暴力」等敏感詞，推理模型會在思考階段自我審查、糾結是否該寫，token 用光在思考裡。
3. **規則對撞** — 「分成段節」與「字數約 300 字」互斥；「8 條寫作技巧 + 5 條禁止」規則數量過多，推理模型會逐條對齊耗盡 token。

### 修正方向（V0.9.6.0 → 目前版本的優化）

針對 [prompt_utils.py:284](prompt_utils.py:284) `build_daily_prompt()` 的「日記提示詞」做了三項關鍵調整：

| 類別 | 修改內容 | 目的 |
| :--- | :--- | :--- |
| **核心指令** | 新增第 5 條「**無須思考，直接輸出日記內容**」 | 明確指示推理模型跳過 `<think>` 階段 |
| **核心指令** | 移除「以**內心獨白**形式」 | 解除與「禁用我/你字」的死結 |
| **禁止條款** | 刪除「禁止使用『我』『你』字」（從 5 條精簡為 3 條） | 移除與獨白語感對撞的硬規則 |
| **寫作技巧** | 刪除「將日記分成段節」（從 8 條精簡為 7 條） | 解除與「300 字」的字數衝突 |
| **輸出格式** | 從中段移到所有設定之後，並改為兩行示範 | 讓 AI 更清楚輸出邊界 |
| **指令強化** | 「請撰寫今天 …」改為「**你的唯一任務是**撰寫今天 …」 | 避免模型分心做延伸創作 |

### 提示詞設計通則（後續新增規則前必檢查）

1. **避免主詞限制 × 視角限制併用**（例：禁用「我」+ 第一人稱獨白）。
2. **避免結構限制 × 字數限制併用**（例：分段節 + 300 字）。
3. **規則總數壓在 10 條以內**（寫作技巧 + 禁止條款合計）。
4. **對推理模型，在核心指令最後加上「無須思考，直接輸出」**。
5. **創意寫作首選非推理模型**（推理模型會把創作變成解題，反而更差）。

### 推薦模型搭配
**4060** ⭕建議使用 huihui_ai/gemma-4-abliterated:e4b 9.6GB 文圖提示詞皆能生成，日記16384，速度正常。
⭕使用 VladimirGav/gemma4-26b-16GB-VRAM-Uncensored:latest 13GB 較有變化，但偶爾卡住無輸出，文圖提示詞皆能生成，日記16384，速度較慢點。
⭕gemma4:e4b 日記16384，速度正常，無破解，只能測試用。

**4090** 尚未測試

| 任務 | 推薦模型 |
| :--- | :--- |
| 日記生成 / 小說創作 / LoveLine 聊天 | `qwen2.5:14b`、`qwen2.5:32b`、`gemma2:27b` |
| 圖片分析 / 生圖提示詞 | `qwen2.5-vl`、`llava`、`minicpm-v`（**不可用 Qwen3.5 / Qwen3.6**） |
| JSON 修復 / 結構化輸出 | `qwen2.5:7b` 以上即可 |

---

## 🚀 使用流程

**詳見各網頁右上角的 ？ 按鈕! 會自動開啟該網頁的使用說明。**

1.  **愛情人格評量產生基本角色卡**
    -   執行 `lpas_v3.html`：完成測驗並儲存角色卡（本地或雲端）。
    -   產生足夠的角色之後就不需要再執行此步驟。
2.  **啟動伺服器**
    -   執行 `start_debug_server.bat`。
    -   只需要啟動一次。
    -   啟動後，會自動啟動 Ollama 與 ComfyUI。
3.  **編輯完整的角色卡資料**
    -   執行 `characters_editor.html`：編輯角色卡資料。
    -   產生足夠的角色之後就不需要再執行此步驟。
4.  **產生日記**
    -   透過介面：開啟 `daily_run.html` 進行互動式生成。
    -   (已暫時取消)一鍵腳本：執行 `產生每日故事.bat` 自動完成全流程。
5.  **loveline 聊天**
    -   執行 `loveline.html`：選擇角色，進行 AI 角色文字互動。
6.  **創作小說**
    -   開啟 `novel_generator.html` 規劃您的故事長篇。

---

## 🛠️ 開發規範
-   **檔名規範**：角色 ID 統一為 `姓名-類型-日期-序號`。
-   **目錄結構**：
    -   `diaries/`: 儲存生成的每日日記 JSON。
    -   `characters/`: 儲存本地角色卡。
    -   `docs/`: GitHub Pages 靜態輸出目錄。

---

## 👽 錯誤與修正方法
-   **無法讀取Ollama 模型**：已啟動debug_server.py，但無法讀取Ollama的大模型列表。
    -   方案 A：安裝 requests 套件（最簡單）
        ```bash
        pip install requests
        ```

---


## 📈 更新歷程

| 版本 | 日期 | 更新亮點 |
| :--- | :--- | :--- |
| **V0.12.6.0** | 2026-07-22 | 所有程式碼加入詳細的繁體中文註解。 |
| **V0.12.5.0** | 2026-07-22 | 評論小說-所有評論增加"最終評論意見"，並匯出.md，.html簡報增加白板功能。 |
| **V0.12.4.0** | 2026-07-20 | 加大寫作風格與寫作範本的編輯介面尺寸。 |
| **V0.12.3.0** | 2026-07-18 | 雲端角色卡的下拉選單排序修改，小說雲端檔案讀取上限200篇。 |
| **V0.12.2.0** | 2026-07-17 | 新增 小說評審的讀者觀點。 |
| **V0.12.1.0** | 2026-07-17 | 修改LoveIsABitMessy_簡報_2026-07.html |
| **V0.12.0.0** | 2026-07-16 | **novel_generator.html 新增「網路搜尋並依序改寫」+ 多文改寫加上網路搜尋 + 頂部工具列整併為「🧰 額外功能」下拉選單 + 搜尋內容品質篩選**。① **頂部工具列整併**：原本並排的「📝 作者備註」「📚 比對多本小說」「🎯 評論小說」「📝 多文改寫」四個按鈕，收攏進新的「🧰 額外功能 ▾」下拉選單（預設收合，點主按鈕展開／再點一次或點選單內任一按鈕即收合；因本專案 `.hidden` class 僅對 `.modal-overlay` 生效，改用 inline `display:none/flex` 直接控制展開狀態）。② **📝 多文改寫 新增網路搜尋**：右欄新增「🌐 建議搜尋網址」多行輸入（可拖曳調整高度，`resize:both`）＋「DuckDuckGo 免費搜尋」「tavily API 搜尋」兩個勾選框（預設皆不勾選）＋「🔎 搜尋關鍵字」單行輸入（勾選任一引擎時為必填，前端會擋下並提示；後端不再自動從檔名／原文推斷關鍵字，避免搜錯主題）；Tavily API Key 首次使用時以 `prompt()` 詢問並存入 `localStorage.tavily_api_key`，之後重複使用免再輸入。③ **新增「🌐 網路搜尋並依序改寫」功能**：介面版型抄襲多文改寫（左欄 ✏️ 使用者指令 + 🖋️ AI 改寫內容雙欄可拖曳；上方雙欄搜尋列），右欄改為「工作項目區」——一個容錯 JSON 解析器（`parseWebRewriteTasks`，允許 `#`/`//` 整行註解、可省略外層 `[ ]`、自動補鍵值對間漏掉的逗號、自動去除尾端多餘逗號），每筆項目含 `topic`／`keyword`／`specific_urls`；預設帶入「李白《早發白帝城》」「白居易《琵琶行》」兩則範例。執行時依序對每個項目：`{topic}`／`{context}` 佔位符自動替換使用者指令、呼叫既有 `/api/rewrite_content_async`（帶入該項目專屬的 keyword / specific_urls / 搜尋引擎旗標），AI 回傳內容依序累加顯示在「🖋️ AI 改寫內容」（以分隔線區隔），**不匯出檔案**，僅供直接複製使用。④ **新增 `web_search_utils.py`**：`fetch_page()` 抓單頁、`duckduckgo_search()` / `tavily_search()` 兩種搜尋來源、`build_search_context()` 統一組裝參考資料段落供 `prompt_utils.build_rewrite_content_prompt()` 的新參數 `search_context` 嵌入提示詞（無搜尋資料時完全不出現該區塊，行為與原本一致）；`debug_server.py` 的 `_run_rewrite_content_job()` 讀取前端傳入的 `use_duckduckgo` / `use_tavily` / `tavily_api_key` / `suggested_urls` / `search_query` 五個旗標並呼叫上述模組，任一搜尋來源失敗都不影響其他來源或改寫流程本身。⑤ **搜尋內容品質把關**（依實測百度安全驗證頁與維基多語言側欄污染提示詞的問題修正）：新增 `_is_useful()` 判斷是否為低價值內容（命中「百度安全验证」「captcha」「404/403」等黑名單關鍵字、淨化後 <80 字、或中日英文字元密度 <40% 一律整筆捨棄並在 CMD／LOG 註明捨棄原因）；`_clean_snippet()` 移除 Markdown 圖片／連結語法、裸露 URL、維基常見的多國語言側欄與「跳到主要內容」等導覽雜訊；`_truncate_smart()` 將單筆內容控制在 2000 字內，優先於段落／句號／逗號邊界截斷避免斷在半句；送進提示詞的參考資料段落**不再附上網址**（對地端 LLM 無意義），只保留標題與淨化後內容；每一筆搜尋在淨化前的完整原始內容都會透過 `_dump_raw_to_stdout()` 印到 CMD，方便使用者檢視實際搜尋到了什麼。 |
| **V0.11.3.0** | 2026-07-12 | 修改小說提示詞內容，讓粗綱、章、節、內文能各司其職。 |
| **V0.11.2.0** | 2026-07-05 | **novel_generator.html「🎯 評論小說」新增「選擇評論的立場」下拉選單**，讓同一份稿件能依創作階段切換不同審稿人設。① 下拉選單提供 6 個選項：**A. 出版社老闆**（極度嚴厲，沿用原有提示詞，預設）、**B. 出版社編輯**（標準嚴格但提供實質可行的修改建議，並點出優點與可延續之處，即使作品有缺漏也會針對缺漏處提出補寫路徑）、**C. 中文系老師**（將作品當學生作業審讀，找出「藏在沙裡的金塊」，每個缺點提供多條可行補強路徑，並提出優點延續與串接方向）、**D. 愛心家教**（相信每份作品都有獨到之處，深入分析特點的可行性與未來發展方向，提出優點串聯建議，完全不做貶低式批評）、**E. 空白架構**（只列出【審讀立場】【評審面向】【輸出格式】空白骨架，讓使用者自行填寫細節）、**F. 依序執行以上所有選項評論**（一次自動跑完 A→E 五種立場，方便比較差異）。② **各立場提示詞獨立保存**：A~E 五組提示詞內容各自存於 `state.reviewPrompts`，切換下拉選單時不再互相覆蓋、也不會遺失使用者的修改，並隨小說專案一起存進雲端 `novel_entries.edit_data`（與其他專案設定相同，僅在按下「💾 儲存雲端小說」時才落地，平時编辑僅存在瀏覽器記憶體）；「使用者要求」欄位新增即時輸入監聽，隨打隨存回目前立場。③ 新增「♻️ 重置評論提示詞」按鈕（下拉選單右側），可將目前立場的提示詞一鍵還原為程式預設值；若目前為 F 模式，會詢問是否一次重置 A~E 全部立場。④ **AI 編輯的評審建議欄位改為「累加保留」模式**：不再清空既有內容，每次新評論都接續寫在原有文字下方，並在最前面自動加上一行立場標頭與時間戳（例如「===== 【A. 出版社老闆（極度嚴厲，預設）】 2026/7/5 上午10:30:15 =====」），方便使用者一次比較同一份稿件在不同立場下的評論差異；F 模式下五段評論會依序附加、各自附上對應標頭。⑤ 下拉選單寬度統一為 400px。 |
| **V0.11.1.0** | 2026-07-05 | 優化 五個網頁的使用說明。 |
| **V0.11.0.0** | 2026-07-03 | 新增 📝多文改寫，依序讀取外部文檔，依照修改指令一一改寫。 |
| **V0.10.0.0** | 2026-07-03 | **novel_generator.html 新增「🎯 評論小說」功能 + 彈窗鍵盤便利性統一**。① **評論小說**：頂部工具列「📚 比對多本小說」右邊新增「🎯 評論小說」按鈕，彈窗上下兩欄分別為「✏️ 使用者要求」（可自行改寫的評審指令，預設以 30 年資歷主編身分撰寫「最嚴格、絲毫不留情面」的評審立場，涵蓋結構／人物／對白／情感／文字／邏輯／市場七大面向）與「🖋️ AI 編輯的評審建議」；提供「評審目前小說」（自動串接粗綱＋所有章＋所有節＋內文成單一稿件）與「評審外部文檔」（讀取本地 .txt/.md）兩種來源，文件名稱單行欄預設帶入小說名稱，選外部檔案時自動改為檔名。後端新增 `prompt_utils.build_novel_review_prompt()`：**刻意不在 Python 端寫死評審規則**，僅組合「使用者要求 + 待審稿件（逾 10 萬字自動截斷）」骨架，讓評審標準完全交給使用者於前端自由改寫；`debug_server.py` 新增 `/api/review_novel_async` 端點與 `_run_review_novel_job()`，完整遵循既有 Ollama 呼叫規範（讀取 `⚙️ 模型參數` 下拉、`_ollama_with_heartbeat` 心跳、LOG 印出完整提示詞與模型參數、逾時保護）。彈窗支援雙欄橫向搜尋（沿用 LOG 彈窗搜尋列樣式）、上下欄可拖曳調整高度（`.review-resizer`）、雙欄各自「👁️‍🗨️ 隱藏／顯示」按鈕、「📤 匯出」合併兩欄為 `.md` 檔（僅本地彈窗顯示，不寫入雲端）。② **文檔轉條列 / 文檔轉粗綱** 操作順序調整：先跳出 Windows 內建開檔對話框，選檔成功後才顯示「生成參數」彈窗（原本相反，選檔前就先問參數，取消選檔會浪費一次彈窗）。③ **新增 `web/js/modal_focus_helper.js`** 全站共用：所有 `.modal-overlay` 開啟時自動 focus 第一個可見輸入欄；若彈窗僅含單一密碼輸入框，額外綁定 Enter 鍵等同點擊主要確認按鈕，四個頁面（novel_generator / daily_run / loveline / characters_editor）全數套用，無需個別修改既有彈窗邏輯。④ **多本小說比對彈窗**：「🔄 更新雲端列表」右邊新增「👁️‍🗨️ 隱藏AI訊息」按鈕，一鍵同時切換四欄 `.compare-model-info` 藍框顯示狀態，原有四個獨立眼睛按鈕維持不變。 |
| **V0.9.9.1** | 2026-07-02 | 更新LoveIsABitMessy_簡報_2026-07.html 新增多張操作介面圖片 |
| **V0.9.9.0** | 2026-07-01 | **8081 埠衝突排查 + 公用使用說明彈窗（官方 + 雲端新增手冊）+ 多本小說比對彈窗擴充**。① **8081 埠 `WinError 10013` 排查**：`debug_server.py` 啟動時新增列印目前 `_ollama_base_url()` 與 `OLLAMA_HOST` 環境變數，方便確認實際連往哪個 Ollama。診斷發現 8081 落在 Windows Hyper-V／WinNAT 動態保留的 port range（`netsh interface ipv4 show excludedportrange`）內，並非被其他程式佔用；新增 `reserve_port_8081.bat`（自動請求管理員權限）執行 `net stop winnat` → `netsh int ipv4 add excludedportrange ... startport=8081` → `net start winnat`，永久把 8081 從保留範圍中排除，重開機後不會再被搶走；同步寫入 [Document/LoveIsABitMessy系統說明_v2026-06.md](Document/LoveIsABitMessy系統說明_v2026-06.md) § 5.3 常見問題。② **公用「使用說明」彈窗系統**：`web/js/help_modal.js` 提供 `HelpModal.open(section, title)` 全域 API，彈窗為三欄版型（📘 官方使用手冊唯讀 / 👁 新增使用手冊即時預覽 / 📝 新增使用手冊編輯），80% 寬 × 90% 高，頂部沿用 LOG 彈窗的搜尋列（🔍／▲▼／Enter 搜尋），樣式一律引用 `editer.css` 既有 class（`.modal-box-lg`、`.cmp-body`、`.cmp-col`、`.cd-col-label`、`.cd-col-textarea`、`.log-search-*`），僅保留 2 處必要 inline layout（80% 寬度覆寫、狀態文字靠左推）。官方使用手冊固定放在 `note/official_<section>.md`（`novel`／`loveline`／`diary`／`character_editor`／`lpas`），由開發者手動維護、經 `debug_server.py` 新增的 `GET /api/note?name=` 端點讀取，使用者不可編輯；新增使用手冊改存 Supabase `manual_custom_history` 表（`supabase/schema_manuals.sql`），**每次儲存皆為新增一筆 row（保留完整版本歷程）**，讀取時自動取該 `section` 最新一筆，等同一種「聽取使用者意見」的紀錄機制。五份官方手冊已預先撰寫：[note/official_novel.md](note/official_novel.md)、[note/official_loveline.md](note/official_loveline.md)、[note/official_diary.md](note/official_diary.md)、[note/official_character_editor.md](note/official_character_editor.md)、[note/official_lpas.md](note/official_lpas.md)。圓形 **?** 按鈕分別置於：`novel_generator.html` 頂部工具列最右、`loveline.html` 頂部導覽列最右、`daily_run.html`「🎭 AI 生成日記」標題右邊、`characters_editor.html`「🎭 角色資料編輯器」標題右邊；`lpas_v3.html` 首頁右上角先以 `display:none` 預留，尚未對外開放。③ **多本小說比對彈窗擴充**：比對模式選「全部」時，輸出內容改為「粗綱 + 章標題 + 章描述 + 節標題 + 節描述 + 內文」（原本缺粗綱）。每欄新增一個淺藍框 `.compare-model-info` 多行文字框（置於小說下拉選單列與內文比對欄之間），唯讀顯示該小說專案儲存時的 `currentModel`、`modelOptions`、`writerStyle1/2/3`、`writerSample` 六項原始設定值（JSON 字串形式），欄高固定 6 行；每欄「🗑️ 刪除」按鈕右側新增「👁️‍🗨️」切換鈕，點擊以 `display:none` 顯示／隱藏該資訊框，隱藏時高度自動讓給下方的 `.cmp-content` 內文比對欄（`flex:1`）。 |
| **V0.9.8.2** | 2026-06-30 | 更新 挑選大模型的建議值，Ollama大模型的效率品質比拚.md |
| **V0.9.8.1** | 2026-06-30 | loveline.html 字體尺寸更新 |
| **V0.9.8.0** | 2026-06-30 | **editer.css 大型重構 + HTML/JS inline 樣式清理（共 6 批 commit）**。① **批 1 按鈕系統**：建立「基底 + 尺寸修飾」規範，新增 `.ai-btn-bluepink`（藍粉漸層全自動鈕，從 `novel_generator.html` 拔掉 inline gradient）、`.size-md / .size-sm` 通用尺寸修飾、`.btn-send-circle`；移除 `.btn-edit-sm / .ai-btn-sm`；統一 modal 按鈕為 `.btn-modal.primary / .cancel / .delete`。共 39 處 HTML 替換。② **批 2 輸入框寬度**：新增 `.w-fill / .w-half / .w-60p / .w-80p / .w-60..600` 完整寬度修飾類；自動腳本掃描 37 處 `<input/select/textarea>` 的 `style="width:…"`，全部移為 class，HTML inline width 清零。③ **批 3 標題 5 級系統**：建立 `.title-xl / .title-lg / .title-md / .title-sm / .title-hint`，取代 `.app-title / .app-title-small / .form-label / .field-label / .hint / .cloud-status / .conn-status / .conn-desc / .section-desc / .server-status-text`；四頁全面替換，連帶更新 `loveline_app.js` 動態 HTML 內的 `form-label` 字串。④ **批 4 清掉孤兒 class**：依「HTML/JS 是否真的把這個名字當 class 用」為判準（避免 id 屬性的子字串誤判），刪除 55 個整段死規則 + compound selector 中的死 token；保留 `.btn-circle-sm / .size-sm / .btn-send-circle / .w-200/300/500/600` 為未來 API 表面。editer.css 從 2723 行縮到 2311 行（-412）。⑤ **批 5 inline 樣式抽取**：新增 `.text-center / .text-warn / .text-pink / .text-muted-sm / input.input-num / input.input-num-sm / .cd-col-label (+.with-top) / .cd-col-textarea`；自動掃描替換約 35 處寫死樣式；特別修復 `input.input-num` 用元素+class 提高優先序，覆寫基底 `input[type=number]` 的 padding。⑥ **批 6 Compare modal 抽取共用版型**：兩個 4 欄比對彈窗（小說 / 日記）的 inline 樣式抽為 `.cmp-modal / .cmp-toolbar / .cmp-title / .cmp-label / .cmp-icon / select.cmp-select / .cmp-body / .cmp-col / .cmp-col-header / .cmp-content`；novel_generator modal 從 ~90 行濃縮到 ~50，daily_run modal 從 ~140 行濃縮到 ~80；用 `:last-child` 自動處理最後一欄無 border-right。⑦ **驗證**：每批 commit 前用 preview server 開啟四頁 + DOM `getComputedStyle` 採樣確認；Stage 2 物理重排另用「664 組同優先序跨選擇器順序翻轉是否會被同一 DOM 元素同時命中」測試證明 cascade 中性。⑧ **配套**：清理 `:root` 變數（兩個 block 合一，從 ~180 行縮到 ~110），修掉潛在 bug `--ll-font-xl` 未定義、`--c-text-primary` 拼錯；49 個區段標題依實體順序重編為連續 1–49。**設計準則同步寫入 [.agent/skills/SPEC.md](.agent/skills/SPEC.md) 第 § 介面樣式準則。** | 
| **V0.9.7.1** | 2026-06-30 | 測試4090適合那些大模型與文字風格。| 
| **V0.9.7.0** | 2026-06-29 | 優化prompt_utils.py 關於日記，減少 system_prompt 的 【核心指令】、【寫作技巧】、【禁止】，並避免互相干擾，造成開源AI大模型過度thinking而卡住或進入無窮迴圈。 |
| **V0.9.6.0** | 2026-06-28 | 撰寫LoveIsABitMessy_簡報_2026-07.html，重新整理 LPAS愛情人格特質評量表企劃書_V3.md、LoveIsABitMessy系統說明_v2026-06.md |
| **V0.9.5.0** | 2026-06-22 | **演員／劇本角色名稱分離 + 三頁面備註欄 + 角色照片 + 多項雲端載入改進**。① `debug_server.py` 改讀 `OLLAMA_HOST` 環境變數（預設 `127.0.0.1:11434`），支援非預設埠的 Ollama。② `novel_generator.html` 登場角色欄新增「角色名稱」文字輸入欄：角色卡＝演員，角色名稱＝劇本中的角色名（如：角色卡「惠茹」演出劇本中的「寶蓮」）；`state.characters` 改為 `{id, roleName}` 結構並自動相容舊資料；`prompt_utils._enrich_char_data` 統一將 `role_name` 蓋過 `name`，所有 prompt（女主角姓名／配角姓名／scenario 比對）自動使用劇本角色名。③ `novel_generator` / `daily_run` / `loveline` 三頁面載入雲端／本機資料後，於 LOG 欄顯示「雲端原始 AI 設定值」（模型／模型參數／寫作風格／寫作範本），即使該模型已被刪除仍可看到原始字串（如 `gemma4:latest`）方便重新拉模型。④ `novel_generator.html` 新增「📝 作者備註」按鈕（位於儲存小說左側）：彈窗大型 textarea，存進 `state.authorNotes` 隨小說一同儲存／讀取，不會提供給 AI。⑤ `daily_run.html` 新增「6. 專案備註」textarea，寫入 `project_data.project_notes`，不會傳給 AI。⑥ `loveline.html` 編輯使用者資料彈窗改為 1600px 兩欄版型：左欄=暱稱／登入密碼／關聯角色卡，右欄=覆蓋設定／額外補充／**使用者備註**（新增欄位 `love_line_users.notes`，不會傳給 AI）。⑦ `characters_editor.html` 在「角色設定 JSON」上方新增「角色照片」區塊：160×160 縮圖框（深灰底＋淺灰虛線框），支援拖曳上傳或點擊開啟檔案選擇，自動縮放成最長邊 256（縮圖）與 1024（原圖）兩種 JPEG（80% 壓縮），儲存至 `characters.photo_thumb` 與 `characters.photo_full` 兩個新欄位。⑧ `novel_generator` 讀取雲端小說清單由 `.limit(30)` 改為 `.limit(1000)`，解決 30 筆以上看不到後續紀錄的問題。⑨ Supabase 需新增欄位：`love_line_users.notes text`、`characters.photo_thumb text`、`characters.photo_full text`。 |
| **V0.9.4.0** | 2026-06-22 | **角色卡格式統一 + LPAS V1→V3 自動轉換 + LoveLine／結果頁優化**。①角色卡 `lpas_v3` 格式統一去除連字號（`AFOL`）、`intimacy` 去除結尾「型」字（如「深情專一」）；`personality_type` 新格式 `PFOL_AFOL_PSOL_深情專一`（提供 `supabase/schema_v3_strip_intimacy_type.sql` 一次性遷移既有資料）。②新增 `web/js/lpas_v1_to_v3.js` V1→V3 16 型對照轉換器，characters_editor / loveline / daily_run / novel_generator 載入舊角色卡時自動就地補上 `lpas_v3`。③ characters_editor 必填欄位驗證：未填欄位即時套用紅框、儲存前列出缺漏並中斷；V1 轉 V3 後 intimacy 為空時自動補預設。④ `build_analyze_text_character_prompt` 改輸出 V3 規格（`lpas_v3: {ambiguity, love, breakup, intimacy}`、16 天候型 + 4 性象限）。⑤四個頁面的角色下拉統一顯示「角色名稱-`full_name`」。⑥ loveline / novel_generator 新增「從雲端重新下載角色卡」🔄 按鈕，loveline 同步刷新使用者清單。⑦ novel_generator 新增「📋 文檔轉條列」：依起承轉合輸出條列式粗綱，每個關鍵事件含原劇情走向 + 兩條 AI 替代戲劇化走向。⑧ lpas_v3.html 結果頁雷達圖改用各階段專屬色（紫 / 粉橘 / 藍），同色相區分主／從焦點。⑨ LoveLine 對話次選單：刪除前後改為「自訂則數」（彈窗預設 10）、選單定位夾住在聊天區內避免溢出、字級放大 150%。 |
| **V0.9.3.0** | 2026-06-19 | LPAS-v3 與角色卡編輯格式統一。LPAS-V3 結果頁／最終分享頁版面優化。新增 `web/js/lpas_v1_to_v3.js` V1→V3 自動轉換器；`prompt_utils.py` 併入 `TYPE_MAPPING_V3` 解析，提示詞 `personality` 優先取 `lpas_v3`、V1 字串作後備；`characters_editor.html` 新增必填欄位紅框提示與儲存前驗證。 |
| **V0.9.2.0** | 2026-06-09 | LPAS v3 完整體：16 天候型名稱最終定案（**海嘯／煙火／漩渦／陣雨／岩漿／太陽／藤蔓／燈塔／雷雨／流星／流沙／晨露／梅雨／晚霞／深海／迷霧**），4 性象限（深情專一／鍾情博愛／靈肉分離／遊戲人間）。題目縮減為每軸 4 題（2+/2−）消除 acquiescence bias，PART2 完整重寫為沉浸式情境題（具體場景、可代入畫面）。新增 `lpas_v3_character_generator.js` 產出可與既有 characters_editor / novel_generator 相容的角色卡：含 `personality_type`、`v3_data` 完整結構、`markdown_summary` AI 友善摘要。完整 Supabase 雲端儲存（characters / lpas_sessions / lpas_answers / lpas_results 四張表），結果頁加入下載角色卡 JSON / 下載測驗紀錄 / 複製 Markdown 三個按鈕。新增 `supabase/schema_v3_lpas.sql` 驗證 schema 並更新欄位註解。v1/v2/v3 三版可並存於 characters 表，以 `source` 與 `lpas_version` 區分。|
| **V0.9.1.0** | 2026-06-08 | LPAS v3 改版：放棄 v2 的抽象軸（黏度/愛之語/浪漫度），改用 4 條真正獨立的行為軸 — **主動/被動、快/慢、外放/內斂、佔有/自由**，加上性象限 4 類型作為補充。沿用 V1 的 16 個天候名（潮水、煙火、星星、陣雨、候鳥、太陽、月亮、燈塔、浪花、流星、細雨、霜花、溫泉、冰川、深海、迷霧）重新對應 4 軸座標。題目改寫原則：**每題只測一條軸 + 鎖死該期專屬情境**，三期題目絕不可互換。雙題庫 PART1（正式）+ PART2（口語）各 70 題，每題 ≤28 字、每子句 ≤14 字。介面、用色、字體、過場動畫節奏完全沿用 V1 lpas.html，無任何視覺改動。新增檔案：`web/lpas_v3.html`、`web/js/lpas_v3_types.js`、`web/js/lpas_v3_questions.js`、`web/js/lpas_v3_scoring.js`、`web/js/lpas_v3_app.js`。v1/v2/v3 三版並存，互不影響。|
| **V0.9.0.0** | 2026-06-05 | LPAS v2 大改版：三軸架構（黏度／愛之語／浪漫度）+ 8 型角色庫（公主／女王／守護者／寶貝／浪子／貓系／獨行俠／總裁），結果為「三聯命名」(如 公主-女王-浪子) + 4 象限性標示。新增雙題庫 PART1（正式版）/ PART2（生活版）隨機抽題機制，題目共 55 題並支援階段內隨機洗牌。新增「親密與身體」第四階段（粉橘紅底色，可整段或單題跳過）。結果頁改為 4 sub-page 星星評分流程（含過場），完成後進入可截圖分享 IG 的最終頁（含三聯主標題、雷達圖、章節迷你卡、性象限眼睛切換、經典劇本彩蛋、配對地圖）。新增 lpas_v2_quiz.html / lpas_v2_test.html / 6 個 v2 JS 模組，並保留 v1 lpas.html 不受影響。Supabase 新增 schema_v2_lpas.sql 遷移腳本（engine_version、triple_code、axis_scores 等欄位）。完整企劃書於 Document/LPAS愛情人格特質評量表企劃書.md。|
| **V0.8.11.4** | 2026-06-05 | 修改LPAS的題目。|
| **V0.8.11.3** | 2026-06-01 | 修正聊天傳送給AI的提示詞漏失。|
| **V0.8.11.2** | 2026-05-27 | 新增同時生成多篇日記與比對多篇日記功能。優化日記生成圖片的提示詞規則。|
| **V0.8.11.1** | 2026-05-26 | 新增 Ollama大模型的效率品質比拚.md|
| **V0.8.11.0** | 2026-05-25 | 將debug_server.py中_run_job()內生成日記的 subprocess.run 統一改為直接呼叫 _ollama_with_heartbeat()，與小说、Loveline 共用相同的非同步執行與心跳機制，並保留原本的 subprocess 生圖流程。小說的全自動功能加入自動往後添加序號機制。|
| **V0.8.10.0** | 2026-05-25 | 修正debug_server.py的_parse_response()與_try_repair_json()多處JSON解析錯誤，尚未完全解決。|
| **V0.8.9.0** | 2026-05-25 | 修正debug_server.py的_try_repair_json()多處JSON解析錯誤。|
| **V0.8.8.0** | 2026-05-23 | 添加寫作風格的設定個數(最多三個)。修改小說生成的提示詞，讓AI產生更具戲劇張力與懸念的情節。|
| **V0.8.7.0** | 2026-05-22 | 新增AI生成的章、節、內文的數量與字數選項彈窗。|
| **V0.8.6.0** | 2026-05-20 | 新增debug_server心跳功能，避免OLLAMA長時間思考而timeout，LOG欄顯示OLLAMA參數。|
| **V0.8.5.0** | 2026-05-18 | 移除docs目錄的任何讀寫功能(修正無法發布的錯誤)。全自動生成小說提供章節區分，新增novel_generator.html"比對多本小說"功能，新增LoveLine聊天室自動聊天與優化介面。|
| **V0.8.4.0** | 2026-05-18 | Add custom GitHub Actions workflow for Pages deployment。|
| **V0.8.3.0** | 2026-05-18 | Add .nojekyll to disable Jekyll build for GitHub Pages。|
| **V0.8.2.0** | 2026-05-18 | 新增novel_generator.html"文字檔轉粗綱"功能，LOG顯示AI運算總時長。修正 LPAS 移除儲存功能(造成page無法正常更新)，自動化雲端儲存功能。characters_editor.htmlAI分析字串格式不符。|
| **V0.8.1.0** | 2026-05-13 | 新增 characters_editor.html 剪貼簿文字分析成角色卡功能。|
| **V0.8.0.0** | 2026-05-13 | 新增 character_card_analyser.py與 characters_editor.html，支援文字與圖片輸入自動生成角色卡。|
| **V0.7.5.0** | 2026-05-12 | 修正與整併editer.css與其他.html共用CSS樣式檔案，統一LOG顯示。|
| **V0.7.4.0** | 2026-05-11 | 新增LPAS評量正確性增加同意按鈕，確認最後版型。|
| **V0.7.3.0** | 2026-05-11 | 修正LPAS圖表雷達圖各軸標籤格式，調整字體與間距，符合手機版面5:8。|
| **V0.7.2.0** | 2026-05-11 | 新增LOG彈窗搜尋功能，修正AI產生JSON格式轉換錯誤，小說介面寬度。|
| **V0.7.1.0** | 2026-05-07 | 整合editer.css與其他.html共用CSS樣式檔案，統一程式碼結構，減少維護複雜度。|
| **V0.7.0.0** | 2026-05-06 | 將所有網頁js、css、html等檔案，更新為 screen_adaptive.js 與 editer.css 核心檔案，使所有介面尺寸更符合行動裝置與平板介面。|
| **V0.6.5.0** | 2026-05-05 | 修正LPAS套用screen_adaptive.js腳本後，在任何瀏覽器的介面顯示格式，調整字體與間距，符合手機版面5:8。|
| **V0.6.4.0** | 2026-05-03 | 修正小說功能，加入「全自動生成」模式：可指定生成總章數 → 自動生成大綱 → 自動鎖定關鍵章節 → 自動生成各章節內容，並自然銜接上下文與結尾，完全不需手動下達每個按鈕。|
| **V0.6.3.0** | 2026-05-02 | 修正小説頁面介面的元件尺寸，符合PC瀏覽器100%與平板瀏覽器。|
| **V0.6.2.0** | 2026-04-30 | 修正LPAS結果頁面顯示格式，調整字體與間距，符合手機版面5:8。|
| **V0.6.1.0** | 2026-04-29 | localhost:8000在家中被占用，改使用localhost:8081。優化並整合角色資料編輯器跟AI生成日記介面尺寸與間隔。|
| **V0.6.0.0** | 2026-04-29 | 新增LPAS使用者評分介面與雲端紀錄、LPAS後台分析網頁 lpas_analytics.html。|
| **V0.5.3.0** | 2026-04-29 | 優化日記、小說、聊天功能，先將AI提示詞顯示在LOG，再送給AI，新增LOG放大彈窗。|
| **V0.5.2.0** | 2026-04-28 | 修正日記生成prompt，修正日記格式。 |
| **V0.5.1.0** | 2026-04-28 | 新增密碼功能，日記、小說、Lovelne皆需輸入密碼，共用彈窗編輯大模型參數、寫作風格、寫作範本。優化單一化prompt_utils.py分析角色卡資料功能|
| **V0.5.0.0** | 2026-04-27 | 新增LoveLine頁面，可透過對話方式與不同角色AI聊天互動。|
| **V0.4.1.0** | 2026-04-26 | 解決使用者電腦Python 環境沒有安裝 requests 第三方套件的問題(無須安裝即可執行)。優化提供所有已生成的章節，供AI參考，增強劇情連貫性。 |
| **V0.4.0.0** | 2026-04-24 | 重構supabase雲端所有資料表結構，新增其他角色設定，支援多角色劇情寫作。 |
| **V0.3.0.0** | 2026-04-23 | 新增小說頁面，完整編輯儲存功能。所有角色、日記、小說內容，皆有本機與雲端讀取與儲存功能。新增選擇不同大模型功能。AI運算時會同步顯示訊息在網頁與CMD視窗。這是實用的版本。 |
| **V0.2.0.0** | 2026-04-21 | **重組與重命名**：標準化 LPAS 命名，分離角色編輯器與日記管理，新增小說自動產生器，統一 Python 腳本命名規範。 |
| **V0.1.1.0** | 2026-04-17 | SSOT 提示詞架構統一，支援多角色動態性格與流式生成。 |
| **V0.1.0.0** | 2026-04-14 | 專案初始化，建立 LPAS 測驗與基礎日記生成流程。 |
