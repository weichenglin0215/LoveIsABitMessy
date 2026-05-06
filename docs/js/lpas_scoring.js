/** 
 * 從結構化物件中組裝特定時期的描述 
 * @param {Object} typeInfo TYPE_MAPPING 中的單一類型物件
 * @param {String} phaseName 曖昧期 | 熱戀期 | 失戀期
 */
function extractPhaseDesc(typeInfo, phaseName) {
    if (!typeInfo || !typeInfo.ambiguity) return "未知描述";

    let phaseData;
    if (phaseName === "曖昧期") phaseData = typeInfo.ambiguity;
    else if (phaseName === "熱戀期") phaseData = typeInfo.love;
    else if (phaseName === "失戀期") phaseData = typeInfo.breakup;

    if (!phaseData) return typeInfo.desc;

    // 拼接：核心介紹 + 階段內容 + 角色扮演指引
    return `${typeInfo.desc}\n\n${phaseData.desc}\n\n${typeInfo.roleplay.desc}`;
}

/** 
 * 主要評分邏輯 (LPAS)
 * @param {Array} answers 
 */
function calculateScores(answers) {
    if (!answers || answers.length === 0) return null;

    // 按 id 索引問卷資料
    const answerMap = new Map();
    answers.forEach(a => answerMap.set(a.id, a));

    let res = {
        1: { 1: { t: 0, c: 0 }, 2: { t: 0, c: 0 }, 3: { t: 0, c: 0 }, 4: { t: 0, c: 0 } },
        2: { 1: { t: 0, c: 0 }, 2: { t: 0, c: 0 }, 3: { t: 0, c: 0 }, 4: { t: 0, c: 0 } },
        3: { 1: { t: 0, c: 0 }, 2: { t: 0, c: 0 }, 3: { t: 0, c: 0 }, 4: { t: 0, c: 0 } }
    };

    LPAS_QUESTIONS.forEach(q => {
        const ans = answerMap.get(q.id);
        if (ans) {
            let raw = parseInt(ans.score, 10);
            if (Number.isFinite(raw)) {
                // clamp to 1..7
                if (raw < 1) raw = 1;
                if (raw > 7) raw = 7;

                let score = raw;
                if (q.direction === -1) score = 8 - score; // 反向題翻轉

                res[q.period][q.dimension].t += score;
                res[q.period][q.dimension].c += 1;
            }
        }
    });

    const radarData = {
        labels: ["靠近與表達(主動/被動)", "受傷消化\n(外放/內收)", "告別疏遠(乾脆/拖延)", "關係節奏\n(快/慢)"],
        datasets: []
    };

    const periodNames = { 1: "曖昧期", 2: "熱戀期", 3: "失戀期" };
    const periodColors = {
        1: "rgba(156, 111, 214, 0.2)",
        2: "rgba(111, 214, 156, 0.2)",
        3: "rgba(214, 111, 138, 0.2)"
    };
    const periodBorder = {
        1: "#9C6FD6",
        2: "#6FD69C",
        3: "#D66F8A"
    };

    // 計算各時期的獨立人格代碼
    const thresholds = [
        ['A', 'P'], // Dim 1: >=4 A, <4 P (主動/被動)
        ['O', 'I'], // Dim 2: >=4 O, <4 I (外放/內收)
        ['C', 'L'], // Dim 3: >=4 C, <4 L (乾脆/留戀)
        ['F', 'S']  // Dim 4: >=4 F, <4 S (快速/緩慢)
    ];

    for (let p = 1; p <= 3; p++) {
        let dataPts = [];
        for (let d = 1; d <= 4; d++) {
            let avg = res[p][d].t / (res[p][d].c || 1);
            dataPts.push(avg);
        }
        radarData.datasets.push({
            label: periodNames[p],
            data: dataPts,
            backgroundColor: periodColors[p],
            borderColor: periodBorder[p],
            pointBackgroundColor: periodBorder[p],
            fill: true
        });
    }

    const phaseCodes = {};
    const phaseDescs = {};
    const phaseTypeNames = {};

    for (let p = 1; p <= 3; p++) {
        let pCode = "";
        for (let d = 1; d <= 4; d++) {
            let avg = res[p][d].t / (res[p][d].c || 1);
            let letter = avg >= 4 ? thresholds[d - 1][0] : thresholds[d - 1][1];
            pCode += letter;
        }
        const fullPCode = pCode.split('').join('-');
        phaseCodes[p] = pCode;

        const info = TYPE_MAPPING[fullPCode] || { name: "未知型", desc: "未知描述", ambiguity: {}, love: {}, breakup: {}, roleplay: {} };
        phaseTypeNames[p] = info.name;
        phaseDescs[p] = extractPhaseDesc(info, periodNames[p]);
    }

    const tripleTypeName = `${phaseTypeNames[1]}-${phaseTypeNames[2]}-${phaseTypeNames[3]}`;
    const tripleTypeDesc = `【曖昧期：${phaseTypeNames[1]}】\n${phaseDescs[1]}\n\n【熱戀期：${phaseTypeNames[2]}】\n${phaseDescs[2]}\n\n【失戀期：${phaseTypeNames[3]}】\n${phaseDescs[3]}`;
    const tripleCode = `${phaseCodes[1]}-${phaseCodes[2]}-${phaseCodes[3]}`;

    // 估算總體平均分 (用於雷達圖顯示以外的參考)
    let finalScores = [];
    for (let d = 1; d <= 4; d++) {
        let totalAvg = (res[1][d].t + res[2][d].t + res[3][d].t) / ((res[1][d].c + res[2][d].c + res[3][d].c) || 1);
        finalScores.push(totalAvg);
    }

    const cleanNames = {};
    [1, 2, 3].forEach(p => {
        cleanNames[p] = (phaseTypeNames[p] || "").replace(/型/g, '');
    });
    const personality_type = `${phaseCodes[1]}_${phaseCodes[2]}_${phaseCodes[3]}-${cleanNames[1]}_${cleanNames[2]}_${cleanNames[3]}`;

    return {
        typeCode: tripleCode,
        typeName: tripleTypeName,
        typeDesc: tripleTypeDesc,
        personality_type: personality_type,
        phaseCodes: phaseCodes,
        phaseDescs: phaseDescs,
        phaseTypeNames: phaseTypeNames,
        radarData: radarData,
        averages: finalScores
    };
}
