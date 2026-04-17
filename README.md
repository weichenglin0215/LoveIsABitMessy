# ❤️ LoveIsABitMessy (愛是有點亂)

一個基於 AI 驅動的動態人格故事生成系統，結合了LPAS愛情性格評量、大型語言模型與影像生成技術，旨在打造具備深度的虛擬角色與沉浸式的每日戀愛互動體驗。

---

## 🎯 專案目標

1.  **深度人格建模**：透過 LPAS (Love Personality Assessment System) 評量，精確定義角色在「初期曖昧」、「熱戀期」與「失戀期」的不同情感反應。
2.  **自動化日常生成**：每日根據場景 (Scenario) 自動生成細膩的角色日記與對應的插圖。
3.  **雲端/本地混合架構**：提供靈活的資料管理，既能本地除錯，也能同步至雲端供展示與紀錄。
4.  **沉浸式視覺體驗**：結合現代化的 Glassmorphism 網頁介面與高品質 AI 生圖。

---

## 🏗️ 系統架構

本專案由前端 Web 介面、後端 Python 橋接器與 AI 引擎組成：

### 1. 前端網頁 (Web Interface)
-   **`lpas.html`**: 專屬心理測驗頁面。使用者完成 60 題測驗後，系統會生成「角色卡 (Character Card)」，包含複雜的性格演化邏輯。
-   **`run_daily.html`**: 每日任務執行中心。提供視覺化介面供選擇演員、設定情境、預覽提示詞，並即時監控後台生成進度。
-   **`cloud_editor.html`**: 雲端資料管理員。用於直接編輯或修正存儲在 Supabase 中的角色資料與日記紀錄。

### 2. 後端核心 (Python Backend)
-   **`debug_server.py`**: 本地 HTTP 橋接伺服器。負責接收網頁請求、管理異步任務佇列、並將指令轉發給 AI 腳本。
-   **`generate_story.py`**: 故事生成引擎。透過 Ollama API 驅動 LLM (如 Gemma 2 / Llama 3) 按照角色設定撰寫繁體中文日記。
-   **`generate_image.py`**: 影像生成引擎。與 ComfyUI 溝通，根據故事內容產出高品質插圖。
-   **`prompt_utils.py`**: 提示詞 SSOT (Single Source of Truth)。統一所有模組的提示詞建構邏輯，確保生成品質的一致性。

### 3. 資料庫與 AI 引擎 (Support Services)
-   **Supabase**: 雲端託管資料庫，儲存角色卡、答題紀錄與所有生成的日記。
-   **Ollama**: 本地運行 LLM 的環境。
-   **ComfyUI**: 本地跑圖的伺服器環境。

---

## 🚀 使用者作業流程

### 第一階段：人格塑造 (Character Creation)
1.  執行 `lpas.html` 進行人格測試。
2.  測驗結束後，系統根據三階段個性 (曖昧/戀愛/失戀) 產出 **角色卡 JSON**。
3.  點擊「下載」存儲至本地 `characters/` 或點擊「儲存至雲端」。

### 第二階段：情境設定 (Scenario Setup)
1.  開啟 `run_daily.html`。
2.  在「1. 選擇演員」中選擇本地或雲端角色。
3.  設定「伴侶狀態」與「新朋友狀態」，並填寫今日的「情境 (Scenario)」描述。

### 第三階段：生成與同步 (Generation & Sync)
1.  點擊「開始生成」。
2.  `debug_server.py` 會啟動後台流程：
    -   **Ollama** 開始流式生成文本。
    -   **ComfyUI** 繪製插圖。
3.  生成完畢後，網頁會自動讀取產出的 JSON 檔案，並將「乾淨的故事內容」同步回 Supabase 的 `diary_entries` 資料表。

---

## 📈 開發與維護現況

-   [x] **SSOT 提示詞架構**：已完成統一的提示詞入口，確保 UI 預覽與實際生成內容完全一致。
-   [x] **多角色動態性格**：支援同一角色在不同戀愛階段使用完全不同的 AI 性格描述 (Personality Object)。
-   [x] **性能優化**：故事生成支援流式輸出 (Streaming)，大幅降低使用者等待的焦慮感。
-   [x] **資料完整性**：修正了 Supabase 寫入權限與欄位匹配問題，確保每一篇故事都能妥善留檔。
-   [x] **命名規範化**：角色 ID 與檔名統一為 `姓名-類型-日期-序號` 格式，便於管理。

---

## 🛠️ 開發中標註
*   本專案目前專為 **傳統中文 (Traditional Chinese)** 寫作環境優化。
*   本地執行前需確保 `python debug_server.py` 已在 CMD 視窗運作。

## GITHUB 主要更新歷程

| 版本 | 日期 | 更新亮點 |
| :--- | :--- | :--- |
| **V0.1.0.0** | 2026-04-17 | 新增lpas.html用於進行愛情性格評量，run_daily.html用於產出日記，cloud_editor.html用於編輯雲端角色卡與日記資料管理。建立supabase雲端資料庫，用於儲存角色卡與日記。|

