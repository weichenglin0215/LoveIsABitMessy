/**
 * lpas_v3_scoring.js
 * LPAS v3 評分核心
 *
 * 4 軸：initiative / pace / expression / possess
 * 性象限 2 軸：sex_emotion / sex_openness
 *
 * 輸出：
 *   {
 *     engine_version: 'v3',
 *     phase_codes:  { 1: "A-F-O-H", 2: "...", 3: "..." },
 *     phase_types:  { 1: "潮水型", 2: "...", 3: "..." },
 *     axis_scores:  { phase_1: {initiative, pace, expression, possess}, ... },
 *     sex:          { emotion, openness, label, displayable },
 *     radar_data:   { labels, datasets } // Chart.js 格式
 *   }
 */

(function () {

    // 軸 → 字母 對應
    const AXIS_TO_LETTER = {
        initiative: { positive: "A", negative: "P" },
        pace: { positive: "F", negative: "S" },
        expression: { positive: "O", negative: "I" },
        possess: { positive: "H", negative: "L" }
    };

    // 期間色彩（沿用 V1 配色）
    const PERIOD_COLORS = {
        1: { fill: "rgba(156, 111, 214, 0.3)", border: "hsla(266, 56%, 64%, 1.00)" },
        2: { fill: "rgba(111, 214, 156, 0.3)", border: "hsla(146, 56%, 64%, 1.00)" },
        3: { fill: "rgba(214, 111, 138, 0.3)", border: "hsla(344, 56%, 64%, 1.00)" }
    };

    const PERIOD_NAMES = { 1: "曖昧期", 2: "熱戀期", 3: "失戀期" };


    /**
     * Normalize 一題的分數（含反向題翻轉、跳題回 null）
     */
    function normalizeScore(raw, direction) {
        if (raw === null || raw === undefined) return null;
        let s = parseInt(raw, 10);
        if (!Number.isFinite(s)) return null;
        if (s < 1) s = 1;
        if (s > 7) s = 7;
        if (direction === -1) s = 8 - s;
        return s;
    }


    /**
     * 將四軸平均分轉成 4 字母代碼
     */
    function buildPhaseCode(avgs) {
        const a = avgs.initiative >= 4 ? AXIS_TO_LETTER.initiative.positive : AXIS_TO_LETTER.initiative.negative;
        const f = avgs.pace >= 4 ? AXIS_TO_LETTER.pace.positive : AXIS_TO_LETTER.pace.negative;
        const o = avgs.expression >= 4 ? AXIS_TO_LETTER.expression.positive : AXIS_TO_LETTER.expression.negative;
        const h = avgs.possess >= 4 ? AXIS_TO_LETTER.possess.positive : AXIS_TO_LETTER.possess.negative;
        return `${a}-${f}-${o}-${h}`;
    }


    /**
     * 性象限分類
     */
    function classifySex(answers) {
        const sexAns = answers.filter(a => a.period === 4);
        const answered = sexAns.filter(a => !a.skipped && a.score !== null && a.score !== undefined);
        const skippedCount = sexAns.length - answered.length;

        if (skippedCount >= 5) {
            return {
                emotion: null, openness: null, label: null,
                skipped_count: skippedCount, answered_count: answered.length,
                displayable: false,
                reason: "您跳過了較多題目，本次不進行性象限分析。"
            };
        }

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

        if (emotionAvg === null || opennessAvg === null) {
            return {
                emotion: emotionAvg, openness: opennessAvg, label: null,
                skipped_count: skippedCount, answered_count: answered.length,
                displayable: false,
                reason: "某一軸的題目作答不足。"
            };
        }

        let label = null;
        if (emotionAvg >= 4 && opennessAvg < 4) label = "深情專一型";
        else if (emotionAvg >= 4 && opennessAvg >= 4) label = "鍾情博愛型";
        else if (emotionAvg < 4 && opennessAvg < 4) label = "靈肉分離型";
        else label = "遊戲人間型";

        return {
            emotion: emotionAvg,
            openness: opennessAvg,
            label: label,
            skipped_count: skippedCount,
            answered_count: answered.length,
            displayable: true
        };
    }


    /**
     * 主評分函式
     */
    window.calculateScoresV3 = function (answers) {
        if (!answers || answers.length === 0) return null;

        const result = {
            engine_version: "v3",
            phase_codes: {},
            phase_types: {},
            phase_descs: {},
            axis_scores: {},
            sex: null,
            radar_data: {
                labels: ["主動", "快速", "外放", "佔有"],
                datasets: []
            }
        };

        for (let p = 1; p <= 3; p++) {
            const periodAnswers = answers.filter(a => a.period === p);
            const buckets = {
                initiative: { sum: 0, count: 0 },
                pace: { sum: 0, count: 0 },
                expression: { sum: 0, count: 0 },
                possess: { sum: 0, count: 0 }
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
                initiative: buckets.initiative.count > 0 ? buckets.initiative.sum / buckets.initiative.count : 4,
                pace: buckets.pace.count > 0 ? buckets.pace.sum / buckets.pace.count : 4,
                expression: buckets.expression.count > 0 ? buckets.expression.sum / buckets.expression.count : 4,
                possess: buckets.possess.count > 0 ? buckets.possess.sum / buckets.possess.count : 4
            };

            const code = buildPhaseCode(avgs);
            const typeInfo = (window.TYPE_MAPPING_V3 || {})[code];

            result.phase_codes[p] = code;
            result.phase_types[p] = typeInfo ? typeInfo.name : "未知型";
            result.phase_descs[p] = typeInfo ?
                (typeInfo[['ambiguity', 'love', 'breakup'][p - 1]] || {}).desc || ""
                : "";
            result.axis_scores[`phase_${p}`] = {
                initiative: avgs.initiative,
                pace: avgs.pace,
                expression: avgs.expression,
                possess: avgs.possess,
                code: code
            };

            result.radar_data.datasets.push({
                label: PERIOD_NAMES[p],
                data: [avgs.initiative, avgs.pace, avgs.expression, avgs.possess],
                backgroundColor: PERIOD_COLORS[p].fill,
                borderColor: PERIOD_COLORS[p].border,
                pointBackgroundColor: PERIOD_COLORS[p].border,
                fill: true
            });
        }

        result.sex = classifySex(answers);

        // typeCode 用於 DB 寫入：三期 4 字母代碼串接
        result.typeCode = `${result.phase_codes[1]}_${result.phase_codes[2]}_${result.phase_codes[3]}`;
        result.typeName = `${result.phase_types[1]}・${result.phase_types[2]}・${result.phase_types[3]}`;

        return result;
    };

})();
