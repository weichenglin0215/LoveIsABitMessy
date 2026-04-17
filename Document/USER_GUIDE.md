# LoveIsABitMessy 系統：新手啟動與操作指南

這份文件將引導您完成本地環境的最後連結，開始您的 AI 角色養成之旅。

---

## 第一階段：環境前置準備 (一次性)

### 1. 啟動 Ollama (大語言模型引擎)
*   **下載與安裝**：若未安裝，請至 [ollama.com](https://ollama.com) 下載。
*   **下載建議模型**：開啟您的命令提示字元 (CMD)，輸入：
    ```bash
    ollama pull dolphin-mistral
    ```
    *💡 為什麼選它？開發手冊指定使用此模型，因為它在處理職場日常與情感對話時較不僵硬。*
*   **確認運行**：在瀏覽器輸入 `http://localhost:11434`，看到 "Ollama is running" 即代表成功。

### 2. 設定 ComfyUI (圖片生成引擎)
*   **使用 Z-image-turbo**：開啟您的 ComfyUI 介面，載入您習慣的 Z-image-turbo workflow。
*   **導出 API 格式**：
    1. 點擊 ComfyUI 介面上的「設置」(小齒輪)。
    2. 勾選 **「Enable Dev mode」**。
    3. 此時側邊選單會出現 **「Save (API format)」** 按鈕。
    4. 點擊它，並將檔案存為 `character_portrait.json`。
    5. **重要**：將此檔案放入專案的 `comfy_workflows/` 資料夾內。

---

## 第二階段：您的核心工作流程 (Master Workflow)

### 步驟 1：產靈魂 (LPAS 測驗)
*   **動作**：直接用瀏覽器開啟專案中的 `web/lpas.html`。
*   **用意**：透過沉浸式的 60 題測驗，鎖定您或受測者的愛情風格。
*   **成果**：在結果頁面點擊 **「下載角色卡 (JSON)」**，您會得到一個類似 `2024-04-14_lin_xiaoqing.json` 的檔案。

### 步驟 2：安置角色 (放置角色卡)
*   **動作**：將剛剛下載的 JSON 檔案，移動或複製到專案根目錄的 `characters/` 資料夾中。
*   **用意**：讓後台 Python 腳本知道目前有哪些「演員」可以挑選。

### 步驟 3：喚醒系統 (執行生成)
*   **動作**：確保 Ollama 和 ComfyUI 都在背景運行，然後在 CMD 執行：
    ```bash
    python run_daily.py
    ```
*   **用意與連鎖反應**：
    1. `generate_story.py`：隨機選一個角色，請 Ollama 根據其性格寫出一篇辦公室週記。
    2. `generate_image.py`：根據角色的外貌敘述，請 ComfyUI 畫出今日插圖。
    3. `build_page.py`：把文字跟圖片打包成一個漂亮的網頁。

### 步驟 4：驗收成果 (閱讀故事)
*   **動作**：開啟 `web/index.html`。
*   **成果**：您會看到一個新的故事列表出現，點擊進去即可享受今日的 AI 自動化故事與配圖。

---

## 常見問答集 (FAQ)
*   **Q: 執行 `run_daily.py` 報錯說缺套件怎麼辦？**
    *   請執行：`pip install requests jinja2`
*   **Q: 產出的圖片角色臉長得不一樣？**
    *   建議在 `image_prompt` 裡加入更細節的描述，或是在 Z-image-turbo workflow 裡固定種子碼 (Seed)。
*   **Q: 想要每天定時執行？**
    *   您可以依照手冊第六章，將 `run_daily.py` 設定在 Windows 的「工作排程器」中。

現在，您可以從 **步驟 1** 開始，親自體驗一次 LPAS 的測驗了！
