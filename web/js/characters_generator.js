/**
 * characters_generator.js
 * 負責從 LPAS 結果中初步產生角色卡物件
 *
 * 本檔案提供三個工具函式：
 * 1. generateProfile   - 依據 LPAS 測驗結果，產生一份初步的角色卡物件
 * 2. downloadJSON      - 將任意資料物件包裝成 JSON 檔並觸發瀏覽器下載
 * 3. downloadMarkdown  - 將角色卡資料轉成 Markdown 文字並複製到剪貼簿
 */

/**
 * generateProfile 函式
 * 依據使用者輸入的暱稱(alias)與 LPAS 測驗結果(resultData)，
 * 產生一份符合系統預設格式的角色卡物件。
 *
 * @param {string} alias - 使用者為角色取的名稱（暱稱），若未輸入則使用預設值「新角色」
 * @param {object} resultData - LPAS 測驗計算後的結果物件，內含 personality_type 等欄位
 * @returns {object} 已套用預設欄位值的完整角色卡物件
 */
function generateProfile(alias, resultData) {
    // 產生隨機 ID，優先使用 UUID 格式以符合資料庫 uuid 類型要求
    // 若瀏覽器不支援 crypto.randomUUID，則退回使用時間戳記 + 亂數字串組合的替代 ID
    const newId = crypto?.randomUUID ? crypto.randomUUID() : `char-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

    // 使用中央定義的預設結構（window.createDefaultCharacter）
    // 這樣可確保所有角色卡欄位齊全，避免後續存取時因欄位缺失而出錯
    return window.createDefaultCharacter({
        id: newId,
        name: alias || "新角色",
        personality_type: resultData.personality_type || "",
        // 其他欄位會自動套用預設值，或由後續編輯器調整
    });
}

/**
 * downloadJSON 函式
 * 將傳入的資料物件（dataObj）序列化為格式化的 JSON 字串，
 * 並透過建立暫時性的 <a> 連結標籤，觸發瀏覽器將其下載為檔案。
 *
 * @param {object} dataObj - 欲匯出的資料物件（例如角色卡完整內容）
 * @param {string} filename - 下載時使用的檔案名稱
 */
function downloadJSON(dataObj, filename) {
    // 將物件轉成 JSON 字串，並使用 4 個空格縮排以利閱讀
    const jsonStr = JSON.stringify(dataObj, null, 4);
    // 建立 Blob 物件，指定 MIME 類型為 application/json
    const blob = new Blob([jsonStr], { type: "application/json" });
    // 產生指向該 Blob 的暫時性 URL
    const url = URL.createObjectURL(blob);
    // 動態建立一個隱藏的 <a> 標籤，設定下載連結與檔名
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    // 將 <a> 標籤加入頁面，模擬點擊以觸發下載，再從頁面移除
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // 釋放暫時性 URL 所佔用的記憶體資源
    URL.revokeObjectURL(url);
}

/**
 * downloadMarkdown 函式
 * 將角色卡資料物件（dataObj）轉換為 Markdown 格式的文字說明，
 * 並呼叫 copyToClipboard 將其複製到系統剪貼簿，方便使用者貼到其他地方。
 *
 * 注意：此函式名稱雖為 download，但實際行為是「複製到剪貼簿」而非下載檔案。
 *
 * @param {object} dataObj - 角色卡資料物件，需包含 id、name、age、occupation、personality_type、image_prompt 等欄位
 */
function downloadMarkdown(dataObj) {
    // 組合 Markdown 標題與角色 ID
    let md = `## 角色卡\n### 人格角色卡：${dataObj.id}\n`;
    // 依序附加姓名、年齡、職業、人格類型、生圖 Prompt 等欄位資訊
    md += `**姓名**：${dataObj.name}\n`;
    md += `**年齡**：${dataObj.age}\n`;
    md += `**職業**：${dataObj.occupation}\n`;
    md += `**人格類型**：${dataObj.personality_type}\n`;
    md += `**生圖 Prompt**：\`${dataObj.image_prompt}\` \n`;

    // 將組合完成的 Markdown 文字複製到剪貼簿
    copyToClipboard(md);
}

/**
 * copyToClipboard 函式
 * 將指定文字（text）複製到系統剪貼簿。
 * 採用建立暫時性 <textarea> 元素、選取內容、執行複製指令的傳統作法，
 * 相容性較 navigator.clipboard API 更廣泛。
 *
 * @param {string} text - 欲複製到剪貼簿的文字內容
 */
function copyToClipboard(text) {
    // 建立隱藏（透明、固定定位）的 textarea 元素作為複製媒介
    const ta = document.createElement("textarea");
    ta.style.position = 'fixed'; ta.style.opacity = 0;
    ta.value = text;
    // 將 textarea 加入頁面，選取其內容，執行瀏覽器複製指令
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    // 複製完成後移除暫時性元素，並提示使用者複製成功
    document.body.removeChild(ta);
    alert('角色設定已複製到剪貼簿！');
}
