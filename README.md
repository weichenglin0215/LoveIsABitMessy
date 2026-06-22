# ❤️ LoveIsABitMessy (愛是有點亂)

一個基於 AI 驅動的動態人格故事生成系統，結合了 LPAS 愛情性格評量、大型語言模型與影像生成技術，旨在打造具備深度的虛擬角色與沉浸式的互動體驗。

---

## 🎯 專案目標

1.  **深度人格建模**：透過 LPAS (Love Personality Assessment System) 評量，精確定義角色在不同階段的情感反應。
2.  **每日日記生成**：根據情境 (Scenario) 自動生成細膩的角色日記與對應的插圖。
3.  **小說創作工具**：提供多角色、多章節的故事大綱設計與內容自動編寫功能。
4.  **雲端/本地混合架構**：整合 Supabase 雲端資料庫與本地 Ollama / ComfyUI 引擎。

---

## 🏗️ 系統架構

### 1. 前端網頁 (Web Interface)
-   **`lpas.html`**: 愛情人格評量測驗。生成具備性格演化邏輯的「角色卡 (Character Card)」。
-   **`daily_run.html`**: 每日日記執行中心。選擇演員、設定情境，即時監控後台生成進度。
-   **`characters_editor.html`**: 角色資料編輯器。管理雲端角色卡、生日、血型與各階段人格特質。
-   **`novel_generator.html`**: 小說自動產生器。支援章節規劃、AI 生成大綱與小節內文創作。

### 2. 後端核心 (Python Backend)
-   **`debug_server.py`**: 本地 HTTP 伺服器 (Port 8000)。管理任務異步執行請求。
-   **`generate_daily.py`**: 每日日記生成引擎。
-   **`daily_page_build.py`**: 網頁編譯器。將生成的 JSON 日記轉換為 HTML 靜態頁面並輸出至 `docs/`。
-   **`generate_image.py`**: 影像生成引擎。與 ComfyUI 溝通產出插圖。
-   **`daily_run.py`**: 每日一鍵執行腳本（含故事生成、生圖、網頁編譯）。

### 3. 資料與環境 (Services)
-   **Supabase**: 雲端資料庫 (characters, diary_entries, lpas_sessions)。
-   **Ollama**: 本地 LLM 執行環境 (推薦模型：gemma4)。
-   **ComfyUI**: 本地影像生成環境。

---

## 🚀 使用流程

1.  **愛情人格評量產生基本角色卡**
    -   執行 `lpas.html`：完成測驗並儲存角色卡（本地或雲端）。
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
5.  **創作小說**
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
