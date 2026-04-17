function generateProfile(alias, resultData) {
    // resultData.typeCode 現在是 AOLF-AOCF-POCF 格式
    const compactCode = resultData.typeCode.replace(/-/g, '_');
    const charId = compactCode + "_" + (alias ? alias.toLowerCase().replace(/\s+/g, '_') : "user");
    
    // 根據結果類型給予三個階段的個性說明
    const profileObj = {
        "id": charId,
        "name": alias || "新角色",
        "age": 25,
        "position": "自由接案者",
        "appearance": "穿著舒適放鬆，喜歡深紫色等不刺眼的色系。神情帶有一點故事。",
        "personality": {
            "曖昧期": resultData.phaseDescs[1],
            "熱戀期": resultData.phaseDescs[2],
            "失戀期": resultData.phaseDescs[3]
        },
        "speech_style": "說話語氣溫柔但有界線。常用『我通常...』、『沒關係』來應對衝突。",
        "relationship": "剛認識不久的同事或朋友。",
        "habits": [
            "下雨天喜歡躲在咖啡廳角落",
            "遇到問題習慣先安靜再處理",
            "夜深人靜會重看舊照片"
        ],
        "image_prompt": "young asian woman, gentle, aesthetic cinematic lighting, wearing comfortable elegant casual clothes, dark purple background tone, highly detailed face, masterpiece"
    };
    
    return profileObj;
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
    let md = `## 角色卡\n內容說明\n### 人格角色卡：${dataObj.id}\n`;
    md += `**id**: ${dataObj.id}\n`;
    md += `**年齡**：${dataObj.age}\n`;
    md += `**身份**：${dataObj.position}\n`;
    md += `**外貌**：${dataObj.appearance}\n`;
    
    md += `**個性 (曖昧期)**：${dataObj.personality['曖昧期']}\n`;
    md += `**個性 (熱戀期)**：${dataObj.personality['熱戀期']}\n`;
    md += `**個性 (失戀期)**：${dataObj.personality['失戀期']}\n`;
    
    md += `**口吻**：${dataObj.speech_style}\n`;
    md += `**關係**：${dataObj.relationship}\n\n`;
    md += `### 習慣\n`;
    dataObj.habits.forEach(h => md += `- ${h}\n`);
    md += `\n### 生圖 Prompt\n\`${dataObj.image_prompt}\` \n\n### 範例 JSON 檔案：\n\`\`\`json\n${JSON.stringify(dataObj, null, 4)}\n\`\`\``;
    
    copyToClipboard(md);
}

function copyToClipboard(text) {
    const ta = document.createElement("textarea");
    ta.style.position = 'fixed'; ta.style.opacity = 0; // 隱藏
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    alert('角色設定已複製到剪貼簿！(Markdown & JSON 格式)');
}
