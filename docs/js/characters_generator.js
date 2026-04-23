/**
 * characters_generator.js 
 * 負責從 LPAS 結果中初步產生角色卡物件
 */

function generateProfile(alias, resultData) {
    // 使用中央定義的預設結構
    return window.createDefaultCharacter({
        name: alias || "新角色",
        personality_type: resultData.personality_type || "",
        // 其他欄位會自動套用預設值，或由後續編輯器調整
    });
}

function downloadJSON(dataObj, filename) {
    const jsonStr = JSON.stringify(dataObj, null, 4);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function downloadMarkdown(dataObj) {
    let md = `## 角色卡\n### 人格角色卡：${dataObj.id}\n`;
    md += `**姓名**：${dataObj.name}\n`;
    md += `**年齡**：${dataObj.age}\n`;
    md += `**職業**：${dataObj.occupation}\n`;
    md += `**人格類型**：${dataObj.personality_type}\n`;
    md += `**生圖 Prompt**：\`${dataObj.image_prompt}\` \n`;
    
    copyToClipboard(md);
}

function copyToClipboard(text) {
    const ta = document.createElement("textarea");
    ta.style.position = 'fixed'; ta.style.opacity = 0;
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert('角色設定已複製到剪貼簿！');
}
