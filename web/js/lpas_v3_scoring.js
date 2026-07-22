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

// 使用立即執行函式（IIFE）包裹整個模組，避免內部變數污染全域命名空間，
// 只把最終需要的 window.calculateScoresV3 掛到全域上。
(function () {

    // 軸 → 字母 對應
    // 每一個評分軸（initiative/pace/expression/possess）在平均分 >= 4 時取 positive 字母，
    // 否則取 negative 字母，最終組合成像 "A-F-O-H" 這樣的 4 字母人格代碼。
    const AXIS_TO_LETTER = {
        initiative: { positive: "A", negative: "P" }, // 主動軸：A=主動(Active) / P=被動(Passive)
        pace: { positive: "F", negative: "S" },        // 節奏軸：F=快速(Fast) / S=緩慢(Slow)
        expression: { positive: "O", negative: "I" },  // 表達軸：O=外放(Open) / I=內斂(Introvert)
        possess: { positive: "H", negative: "L" }      // 佔有軸：H=高佔有(High) / L=低佔有(Low)
    };

    // 期間色彩（沿用 V1 配色）
    // 供雷達圖（Chart.js）各資料集使用的填色與邊框色，key 對應 1=曖昧期、2=熱戀期、3=失戀期。
    const PERIOD_COLORS = {
        1: { fill: "rgba(156, 111, 214, 0.3)", border: "hsla(266, 56%, 64%, 1.00)" }, // 曖昧期：紫色
        2: { fill: "rgba(111, 214, 156, 0.3)", border: "hsla(146, 56%, 64%, 1.00)" }, // 熱戀期：綠色
        3: { fill: "rgba(214, 111, 138, 0.3)", border: "hsla(344, 56%, 64%, 1.00)" }  // 失戀期：粉紅色
    };

    // 各期間對應的中文顯示名稱，用於雷達圖圖例（label）
    const PERIOD_NAMES = { 1: "曖昧期", 2: "熱戀期", 3: "失戀期" };


    /**
     * Normalize 一題的分數（含反向題翻轉、跳題回 null）
     *
     * @param {*} raw       原始作答分數（可能是字串、數字、null、undefined）
     * @param {number} direction  題目方向：1 = 正向題（分數照原樣使用）、
     *                            -1 = 反向題（需要翻轉分數）
     * @returns {number|null} 正規化後的 1~7 分數；若該題被跳過或分數無效則回傳 null
     *
     * 說明：
     * 1. 若原始值為 null/undefined（代表使用者跳過該題），直接回傳 null。
     * 2. 將原始值轉成整數，若轉換失敗（NaN/Infinity）也回傳 null。
     * 3. 將分數限制在 1~7 的合法範圍內（超出範圍則夾在邊界值）。
     * 4. 若為反向題（direction === -1），用 8 - s 做翻轉，
     *    例如原始填 1 分，翻轉後變成 7 分，確保正負向題的分數意義一致。
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
     *
     * @param {Object} avgs 四個軸各自的平均分數 { initiative, pace, expression, possess }
     * @returns {string} 4 字母代碼字串，格式如 "A-F-O-H"
     *
     * 判斷規則：每一軸的平均分數 >= 4（滿分 7 分量表的中點以上）視為偏向 positive 字母，
     * 小於 4 則視為偏向 negative 字母。最終用 "-" 串接四個字母，
     * 對應「主動軸-節奏軸-表達軸-佔有軸」的組合代碼。
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
     *
     * @param {Array} answers 全部作答資料陣列，每筆包含 period/axis/score/direction/skipped 等欄位
     * @returns {Object} 性象限分析結果，包含：
     *   - emotion: 情感軸（sex_emotion）平均分，若無法計算則為 null
     *   - openness: 開放軸（sex_openness）平均分，若無法計算則為 null
     *   - label: 分類標籤（深情專一型 / 鍾情博愛型 / 靈肉分離型 / 遊戲人間型），無法分類時為 null
     *   - skipped_count: 跳過的題數
     *   - answered_count: 實際作答的題數
     *   - displayable: 是否可顯示此分析結果（跳題過多或資料不足時為 false）
     *   - reason: 當 displayable 為 false 時，說明不顯示的原因
     *
     * 處理流程：
     * 1. 篩選出 period === 4（性象限題組）的所有題目。
     * 2. 統計已作答（未跳過且分數存在）與跳過的題數。
     * 3. 若跳題數 >= 5（跳題過多，代表資料代表性不足），直接回傳不可顯示的結果。
     * 4. 將已作答題目依 axis 分類（sex_emotion / sex_openness），並用 normalizeScore 正規化分數。
     * 5. 分別計算情感軸與開放軸的平均分數；若任一軸完全沒有有效資料，回傳不可顯示的結果。
     * 6. 依「情感軸、開放軸」是否 >= 4 分（中點）的四種組合，決定性象限分類標籤。
     */
    function classifySex(answers) {
        // 只取性象限題組（period === 4）的作答
        const sexAns = answers.filter(a => a.period === 4);
        // 已作答（未跳過且分數有效）的題目
        const answered = sexAns.filter(a => !a.skipped && a.score !== null && a.score !== undefined);
        // 跳過的題數 = 總題數 - 已作答題數
        const skippedCount = sexAns.length - answered.length;

        // 跳題過多（>=5 題），視為資料不足，不進行性象限分析
        if (skippedCount >= 5) {
            return {
                emotion: null, openness: null, label: null,
                skipped_count: skippedCount, answered_count: answered.length,
                displayable: false,
                reason: "您跳過了較多題目，本次不進行性象限分析。"
            };
        }

        const emotionScores = [];   // 情感軸（sex_emotion）各題正規化後分數
        const opennessScores = [];  // 開放軸（sex_openness）各題正規化後分數

        // 逐題正規化分數，並依軸別分別歸類到對應陣列
        answered.forEach(a => {
            const s = normalizeScore(a.score, a.direction);
            if (s === null) return;
            if (a.axis === "sex_emotion") emotionScores.push(s);
            else if (a.axis === "sex_openness") opennessScores.push(s);
        });

        // 簡單的平均值計算函式：陣列為空時回傳 null，避免除以零
        const avg = arr => arr.length === 0 ? null
            : arr.reduce((sum, x) => sum + x, 0) / arr.length;

        const emotionAvg = avg(emotionScores);
        const opennessAvg = avg(opennessScores);

        // 任一軸完全沒有有效作答資料，無法計算平均分，視為不可顯示
        if (emotionAvg === null || opennessAvg === null) {
            return {
                emotion: emotionAvg, openness: opennessAvg, label: null,
                skipped_count: skippedCount, answered_count: answered.length,
                displayable: false,
                reason: "某一軸的題目作答不足。"
            };
        }

        // 依情感軸（emotionAvg）與開放軸（opennessAvg）是否達到中點 4 分，
        // 組合出四種性象限分類標籤
        let label = null;
        if (emotionAvg >= 4 && opennessAvg < 4) label = "深情專一型";      // 情感濃、開放度低：專一但深情
        else if (emotionAvg >= 4 && opennessAvg >= 4) label = "鍾情博愛型"; // 情感濃、開放度高：對多人都能投入感情
        else if (emotionAvg < 4 && opennessAvg < 4) label = "靈肉分離型";   // 情感淡、開放度低：較理性保守
        else label = "遊戲人間型";                                          // 情感淡、開放度高：較隨性不專一

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
     * 主評分函式（掛載於全域 window，供外部呼叫）
     *
     * @param {Array} answers 使用者全部作答資料，每筆需包含：
     *   - period: 題目所屬期間（1=曖昧期、2=熱戀期、3=失戀期、4=性象限題組）
     *   - axis: 題目對應的評分軸（initiative/pace/expression/possess/sex_emotion/sex_openness）
     *   - score: 使用者填寫的原始分數
     *   - direction: 題目方向（1=正向題、-1=反向題）
     *   - skipped: 是否跳過該題
     * @returns {Object|null} 完整評分結果物件；若 answers 為空則回傳 null。回傳物件結構：
     *   - engine_version: 固定為 "v3"，標示使用的評分引擎版本
     *   - phase_codes: 三個期間（1~3）各自的 4 字母人格代碼，如 { 1: "A-F-O-H", ... }
     *   - phase_types: 三個期間各自對應的中文類型名稱（依 TYPE_MAPPING_V3 查表取得）
     *   - phase_descs: 三個期間各自的類型描述文字
     *   - axis_scores: 三個期間各自四軸的平均分數與代碼
     *   - sex: 性象限分析結果（見 classifySex 函式說明）
     *   - radar_data: 供 Chart.js 雷達圖使用的資料格式（labels + datasets）
     *   - typeCode: 三期代碼以底線串接而成的完整代碼，供資料庫寫入使用
     *   - typeName: 三期類型名稱以頓號串接而成的完整名稱
     */
    window.calculateScoresV3 = function (answers) {
        // 沒有任何作答資料時，無法評分，直接回傳 null
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

        // 依序處理三個期間：1=曖昧期、2=熱戀期、3=失戀期
        for (let p = 1; p <= 3; p++) {
            // 篩選出屬於目前期間 p 的所有作答
            const periodAnswers = answers.filter(a => a.period === p);
            // 四個評分軸各自的加總與計數，用來之後計算平均分
            const buckets = {
                initiative: { sum: 0, count: 0 },
                pace: { sum: 0, count: 0 },
                expression: { sum: 0, count: 0 },
                possess: { sum: 0, count: 0 }
            };

            // 逐題累加分數到對應的軸別 bucket 中
            periodAnswers.forEach(a => {
                if (a.skipped) return; // 跳過的題目不計入統計
                const s = normalizeScore(a.score, a.direction); // 正規化分數（含反向題翻轉）
                if (s === null) return; // 分數無效也不計入
                if (!buckets[a.axis]) return; // 非本期間關注的軸別（防呆）
                buckets[a.axis].sum += s;
                buckets[a.axis].count += 1;
            });

            // 計算四軸的平均分數；若該軸完全沒有有效作答，預設給中間值 4 分（避免偏頗）
            const avgs = {
                initiative: buckets.initiative.count > 0 ? buckets.initiative.sum / buckets.initiative.count : 4,
                pace: buckets.pace.count > 0 ? buckets.pace.sum / buckets.pace.count : 4,
                expression: buckets.expression.count > 0 ? buckets.expression.sum / buckets.expression.count : 4,
                possess: buckets.possess.count > 0 ? buckets.possess.sum / buckets.possess.count : 4
            };

            // 依四軸平均分組成 4 字母代碼（如 "A-F-O-H"）
            const code = buildPhaseCode(avgs);
            // 依代碼查詢全域類型對照表（TYPE_MAPPING_V3），取得該類型的名稱與描述
            const typeInfo = (window.TYPE_MAPPING_V3 || {})[code];

            // 記錄本期間的代碼
            result.phase_codes[p] = code;
            // 記錄本期間的類型名稱；查無對應類型時顯示「未知型」
            result.phase_types[p] = typeInfo ? typeInfo.name : "未知型";
            // 記錄本期間的類型描述文字；依期間 p（1/2/3）對應到
            // typeInfo 底下的 ambiguity（曖昧期）/ love（熱戀期）/ breakup（失戀期）欄位
            result.phase_descs[p] = typeInfo ?
                (typeInfo[['ambiguity', 'love', 'breakup'][p - 1]] || {}).desc || ""
                : "";
            // 記錄本期間四軸的平均分數與代碼，供前端顯示細節數值使用
            result.axis_scores[`phase_${p}`] = {
                initiative: avgs.initiative,
                pace: avgs.pace,
                expression: avgs.expression,
                possess: avgs.possess,
                code: code
            };

            // 組出雷達圖（Chart.js）本期間的資料集：四軸分數 + 對應顏色
            result.radar_data.datasets.push({
                label: PERIOD_NAMES[p],
                data: [avgs.initiative, avgs.pace, avgs.expression, avgs.possess],
                backgroundColor: PERIOD_COLORS[p].fill,
                borderColor: PERIOD_COLORS[p].border,
                pointBackgroundColor: PERIOD_COLORS[p].border,
                fill: true
            });
        }

        // 計算性象限分類結果（情感軸 / 開放軸）
        result.sex = classifySex(answers);

        // typeCode 用於 DB 寫入：三期 4 字母代碼串接（以底線分隔）
        result.typeCode = `${result.phase_codes[1]}_${result.phase_codes[2]}_${result.phase_codes[3]}`;
        // typeName 為三期類型名稱串接（以頓號分隔），供人類閱讀的完整人格類型描述
        result.typeName = `${result.phase_types[1]}・${result.phase_types[2]}・${result.phase_types[3]}`;

        return result;
    };

})();
