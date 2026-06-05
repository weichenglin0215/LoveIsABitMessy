/**
 * lpas_v2_scoring.js
 * LPAS v2 評分核心
 *
 * 主要 export（全域）：
 *   - calculateScoresV2(answers): 主評分函式
 *   - classifyTripleType(scores): 三聯命名
 *   - classifySexLabel(scores): 性象限分類
 *   - findClassicScript(triple): 經典劇本判定
 *
 * 答案物件格式：
 *   { id: "Q01", score: 1..7 | null, skipped: bool, axis: string, direction: 1|-1, period: 1..4 }
 *
 * 計分輸出：
 *   {
 *     engine_version: 'v2',
 *     triple_code: "公主-女王-浪子",
 *     phase_types: { 1: "公主", 2: "女王", 3: "浪子" },
 *     axis_scores: {
 *       phase_1: { attachment: 6.0, channel: 5.4, frame: 5.8, label: "Fuse-Ver-Rom" },
 *       phase_2: {...}, phase_3: {...}
 *     },
 *     sex: {
 *       sex_emotion: 5.8, sex_openness: 4.2,
 *       label: "深情多元型",
 *       skipped_count: 0,
 *       answered_count: 10,
 *       displayable: true   // 跳過超過 5 題會是 false
 *     },
 *     radar_data: {...},  // Chart.js 格式
 *     script_name: "純真轉黑劇本" | null
 *   }
 */

(function () {

    // ---------- 軸向 → 標籤對應 ----------
    const AXIS_LABELS = {
        attachment:    { positive: "Fuse", negative: "Free" },
        channel:       { positive: "Ver",  negative: "Act"  },
        frame:         { positive: "Rom",  negative: "Pra"  },
        sex_emotion:   { positive: "High", negative: "Low"  },
        sex_openness:  { positive: "Open", negative: "Excl" }
    };

    // ---------- 8 型座標 → 中文名 ----------
    const TYPE_LOOKUP = {
        "Fuse-Ver-Rom": "公主",
        "Fuse-Ver-Pra": "女王",
        "Fuse-Act-Pra": "守護者",
        "Fuse-Act-Rom": "寶貝",
        "Free-Ver-Rom": "浪子",
        "Free-Ver-Pra": "貓系",
        "Free-Act-Rom": "獨行俠",
        "Free-Act-Pra": "總裁"
    };

    // ---------- 性象限座標 → 中文名 ----------
    const SEX_LOOKUP = {
        "High-Excl": "深情專一型",
        "High-Open": "深情多元型",
        "Low-Excl":  "探索人性型",
        "Low-Open":  "自由遊戲型"
    };

    // ---------- 期間中文名 / 顏色 ----------
    const PERIOD_NAMES  = { 1: "曖昧期", 2: "熱戀期", 3: "失戀期" };
    const PERIOD_COLORS = {
        1: { fill: "rgba(156, 111, 214, 0.3)",  border: "hsla(266, 56%, 64%, 1.00)" },
        2: { fill: "rgba(111, 214, 156, 0.3)",  border: "hsla(146, 56%, 64%, 1.00)" },
        3: { fill: "rgba(214, 111, 138, 0.3)",  border: "hsla(344, 56%, 64%, 1.00)" }
    };


    // ============================================================
    // 私有：將答案處理為「該軸有效分數」
    // ============================================================
    function normalizeScore(raw, direction) {
        // 跳過題或 NULL 不計分
        if (raw === null || raw === undefined) return null;
        let s = parseInt(raw, 10);
        if (!Number.isFinite(s)) return null;
        if (s < 1) s = 1;
        if (s > 7) s = 7;
        if (direction === -1) s = 8 - s;  // 反向題翻轉
        return s;
    }


    // ============================================================
    // 私有：建立三軸標籤組合 → 8 型查表
    // ============================================================
    function classifyPhaseType(axisAvgs) {
        const aLabel = (axisAvgs.attachment >= 4) ? "Fuse" : "Free";
        const bLabel = (axisAvgs.channel    >= 4) ? "Ver"  : "Act";
        const cLabel = (axisAvgs.frame      >= 4) ? "Rom"  : "Pra";
        const key = `${aLabel}-${bLabel}-${cLabel}`;
        return {
            label: key,
            type_name: TYPE_LOOKUP[key] || "未知型"
        };
    }


    // ============================================================
    // 私有：性象限分類
    // ============================================================
    function classifySex(answers) {
        // 篩出性象限題（period === 4）
        const sexAns = answers.filter(a => a.period === 4);
        const answered = sexAns.filter(a => !a.skipped && a.score !== null && a.score !== undefined);
        const skippedCount = sexAns.length - answered.length;

        // B-3 規則：跳過 ≥ 5 題不顯示
        if (skippedCount >= 5) {
            return {
                sex_emotion: null,
                sex_openness: null,
                label: null,
                skipped_count: skippedCount,
                answered_count: answered.length,
                displayable: false,
                reason: "您跳過了較多性議題，本次不進行性象限分析"
            };
        }

        // 兩軸獨立平均（跳過題不計分母）
        const emotionScores = [];
        const opennessScores = [];

        answered.forEach(a => {
            const s = normalizeScore(a.score, a.direction);
            if (s === null) return;
            if (a.axis === "sex_emotion") emotionScores.push(s);
            else if (a.axis === "sex_openness") opennessScores.push(s);
        });

        const avg = arr => arr.length === 0 ? null
                       : arr.reduce((sum, x) => sum + x, 0) / arr.length;

        const emotionAvg = avg(emotionScores);
        const opennessAvg = avg(opennessScores);

        // 判定象限（任一軸 null 則不可分）
        if (emotionAvg === null || opennessAvg === null) {
            return {
                sex_emotion: emotionAvg,
                sex_openness: opennessAvg,
                label: null,
                skipped_count: skippedCount,
                answered_count: answered.length,
                displayable: false,
                reason: "某軸題目作答數不足，無法分類"
            };
        }

        const emotionLabel  = emotionAvg  >= 4 ? "High" : "Low";
        const opennessLabel = opennessAvg >= 4 ? "Open" : "Excl";
        const key = `${emotionLabel}-${opennessLabel}`;

        return {
            sex_emotion: emotionAvg,
            sex_openness: opennessAvg,
            label: SEX_LOOKUP[key] || "未知象限",
            quadrant_code: key,
            skipped_count: skippedCount,
            answered_count: answered.length,
            displayable: true
        };
    }


    // ============================================================
    // 私有：經典劇本判定
    // ============================================================
    function findClassicScript(triple) {
        if (!triple) return null;
        if (typeof window.CLASSIC_SCRIPTS === "undefined") return null;

        // 直接命中
        if (window.CLASSIC_SCRIPTS[triple]) {
            return {
                name: window.CLASSIC_SCRIPTS[triple].name,
                tagline: window.CLASSIC_SCRIPTS[triple].tagline,
                genre: window.CLASSIC_SCRIPTS[triple].genre,
                triple: triple
            };
        }

        // 同型穩定劇本（三階段同型）
        const parts = triple.split("-");
        if (parts.length === 3 && parts[0] === parts[1] && parts[1] === parts[2]) {
            return {
                name: `${parts[0]}穩定劇本`,
                tagline: `三階段都是 ${parts[0]} 型，是同型穩定型角色`,
                genre: "穩定型",
                triple: triple
            };
        }

        return null;
    }


    // ============================================================
    // 主函式：calculateScoresV2
    // ============================================================
    window.calculateScoresV2 = function (answers) {
        if (!answers || answers.length === 0) return null;

        // 結果結構
        const result = {
            engine_version: "v2",
            triple_code: "",
            phase_types: {},
            axis_scores: {},
            sex: null,
            radar_data: { labels: ["黏度", "愛之語", "浪漫度"], datasets: [] },
            script_name: null,
            script: null
        };

        // 1. 處理三階段（period 1-3）每階段三軸計分
        for (let p = 1; p <= 3; p++) {
            const periodAnswers = answers.filter(a => a.period === p);

            // 三軸累計
            const buckets = {
                attachment: { sum: 0, count: 0 },
                channel:    { sum: 0, count: 0 },
                frame:      { sum: 0, count: 0 }
            };

            periodAnswers.forEach(a => {
                if (a.skipped) return;
                const s = normalizeScore(a.score, a.direction);
                if (s === null) return;
                if (!buckets[a.axis]) return;
                buckets[a.axis].sum += s;
                buckets[a.axis].count += 1;
            });

            const avgs = {
                attachment: buckets.attachment.count > 0 ? buckets.attachment.sum / buckets.attachment.count : 4,
                channel:    buckets.channel.count    > 0 ? buckets.channel.sum    / buckets.channel.count    : 4,
                frame:      buckets.frame.count      > 0 ? buckets.frame.sum      / buckets.frame.count      : 4
            };

            const phaseType = classifyPhaseType(avgs);

            result.axis_scores[`phase_${p}`] = {
                attachment: avgs.attachment,
                channel:    avgs.channel,
                frame:      avgs.frame,
                label:      phaseType.label,
                type_name:  phaseType.type_name
            };
            result.phase_types[p] = phaseType.type_name;

            // 雷達圖資料集
            result.radar_data.datasets.push({
                label: PERIOD_NAMES[p],
                data: [avgs.attachment, avgs.channel, avgs.frame],
                backgroundColor: PERIOD_COLORS[p].fill,
                borderColor:     PERIOD_COLORS[p].border,
                pointBackgroundColor: PERIOD_COLORS[p].border,
                fill: true
            });
        }

        // 2. 三聯命名
        result.triple_code = `${result.phase_types[1]}-${result.phase_types[2]}-${result.phase_types[3]}`;

        // 3. 性象限
        result.sex = classifySex(answers);

        // 4. 經典劇本
        const script = findClassicScript(result.triple_code);
        if (script) {
            result.script = script;
            result.script_name = script.name;
        }

        // 5. 中文友善總結（給結果頁顯示）
        result.summary = {
            主標題: result.triple_code,
            性標示: result.sex && result.sex.label ? result.sex.label : null,
            劇本: result.script_name,
            三階段: {
                曖昧期: result.phase_types[1],
                熱戀期: result.phase_types[2],
                失戀期: result.phase_types[3]
            }
        };

        return result;
    };


    // ============================================================
    // 輔助：給外部讀取的常數 export
    // ============================================================
    window.LPAS_V2_TYPE_LOOKUP    = TYPE_LOOKUP;
    window.LPAS_V2_SEX_LOOKUP     = SEX_LOOKUP;
    window.LPAS_V2_PERIOD_NAMES   = PERIOD_NAMES;
    window.LPAS_V2_PERIOD_COLORS  = PERIOD_COLORS;
    window.LPAS_V2_AXIS_LABELS    = AXIS_LABELS;

})();
