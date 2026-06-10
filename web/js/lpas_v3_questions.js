/**
 * lpas_v3_questions.js
 * LPAS v3 - 雙版本題庫
 *
 * 結構：4 軸 × 3 期 × 4 題 = 48 題 + 性象限 8 題 = 56 題
 *
 * 兩個全域常數：
 *   LPAS_QUESTIONS_V3_PART1：正式版（書面、中性）
 *   LPAS_QUESTIONS_V3_PART2：生活版（沉浸式情境、口語）
 *
 * 設計原則：
 *   1. 每題只測一條軸（直白、單義、不曖昧）
 *   2. 同軸不同期的題目絕不可互換（每題鎖死該期專屬情境）
 *   3. 每軸 4 題 = 2 正向 + 2 反向（消除 acquiescence bias）
 *   4. 每題 ≤ 28 字、每子句 ≤ 14 字（含標點）
 *   5. 兩版同 id 對應相同測量目標 + 相同 direction
 *   6. 各期被移除的正向題內容不同，避免某種情境只在單期被測
 *
 * 軸代碼：
 *   "initiative" → 主動/被動（+1=主動，-1=被動）
 *   "pace"       → 快速/緩慢    （+1=快速，-1=緩慢）
 *   "expression" → 外放/內斂（+1=外放，-1=內斂）
 *   "possess"    → 佔有/自由（+1=佔有，-1=自由）
 *   "sex_emotion"  → 情感依附（+1=高依附，-1=性愛分離）
 *   "sex_openness" → 開放度  （+1=開放，-1=專一）
 *
 * 各期被移除的正向題（用以避免重複測同一情境）：
 *   主動：曖昧→「主動提議下次見面」/ 熱戀→「主動提議約會安排」/ 失戀→「主動刪聯絡方式」
 *   快速 ：曖昧→「立刻採取行動」    / 熱戀→「才一週覺得真命」  / 失戀→「強迫自己翻篇」
 *   外放：曖昧→「朋友圈察覺」      / 熱戀→「公開場合表達」    / 失戀→「跟大家講感受」
 *   佔有：曖昧→「在意過去交往」    / 熱戀→「在意社群互動」    / 失戀→「找機會聯絡」
 *   性愛：情感依附→「性是感情的延伸」/ 開放度→「一對一不是唯一形式」
 */

// ============================================================
// PART 1：正式版（書面、中性）
// ============================================================

window.LPAS_QUESTIONS_V3_PART1 = [

    // ════════════ 曖昧期 (period 1) ════════════

    // 主動/被動
    { id: "Q01", period: 1, axis: "initiative", direction: 1, text: "你會主動製造與他偶遇的機會。" },
    { id: "Q02", period: 1, axis: "initiative", direction: 1, text: "當你心動之後，\n你會直接告白。" },
    { id: "Q03", period: 1, axis: "initiative", direction: -1, text: "你習慣等對方先聯絡你。" },
    { id: "Q04", period: 1, axis: "initiative", direction: -1, text: "就算心動，\n你也不會開口約對方。" },

    // 快速/緩慢
    { id: "Q05", period: 1, axis: "pace", direction: 1, text: "才認識一週，\n你就知道對方適不適合交往？" },
    { id: "Q06", period: 1, axis: "pace", direction: 1, text: "曖昧超過一個月，\n你會受不了。" },
    { id: "Q07", period: 1, axis: "pace", direction: -1, text: "你至少要三個月才確認感情。" },
    { id: "Q08", period: 1, axis: "pace", direction: -1, text: "曖昧期拖得久一點，\n反而讓你安心。" },

    // 外放/內斂
    { id: "Q09", period: 1, axis: "expression", direction: 1, text: "曖昧時，\n你會在限動呈現心情。" },
    { id: "Q10", period: 1, axis: "expression", direction: 1, text: "與對方處於曖昧時，\n你能夠當面直接表達心意。" },
    { id: "Q11", period: 1, axis: "expression", direction: -1, text: "你喜歡他，\n會藏得很好。" },
    { id: "Q12", period: 1, axis: "expression", direction: -1, text: "沒人能看出你的曖昧對象。" },

    // 佔有/自由
    { id: "Q13", period: 1, axis: "possess", direction: 1, text: "他跟別的女生互動，\n你會吃醋。" },
    { id: "Q14", period: 1, axis: "possess", direction: 1, text: "曖昧期，\n你會在意他的過去交往對象。" },
    { id: "Q15", period: 1, axis: "possess", direction: -1, text: "他與異性單獨見面，\n你不會在意。" },
    { id: "Q16", period: 1, axis: "possess", direction: -1, text: "在曖昧期每個人都是獨立的，\n各過各的也沒關係。" },


    // ════════════ 熱戀期 (period 2) ════════════

    // 主動/被動
    { id: "Q17", period: 2, axis: "initiative", direction: 1, text: "在一起之後，\n你會主動規劃下一步。" },
    { id: "Q18", period: 2, axis: "initiative", direction: 1, text: "感情有狀況，\n你會主動找對方討論。" },
    { id: "Q19", period: 2, axis: "initiative", direction: -1, text: "重要的事情，\n你習慣讓他決定。" },
    { id: "Q20", period: 2, axis: "initiative", direction: -1, text: "你會先等他開口，\n再表達你的需求。" },

    // 快速/緩慢
    { id: "Q21", period: 2, axis: "pace", direction: 1, text: "交往一個月內，\n你願意帶他見家人。" },
    { id: "Q22", period: 2, axis: "pace", direction: 1, text: "兩個月之內，\n你會決定是否要繼續交往下去？" },
    { id: "Q23", period: 2, axis: "pace", direction: -1, text: "你寧可花半年慢慢確認感情。" },
    { id: "Q24", period: 2, axis: "pace", direction: -1, text: "在一起這件事，\n你考慮了大半年。" },

    // 外放/內斂
    { id: "Q25", period: 2, axis: "expression", direction: 1, text: "在一起後，\n你會在社群放閃。" },
    { id: "Q26", period: 2, axis: "expression", direction: 1, text: "你會跟好朋友分享感情細節。" },
    { id: "Q27", period: 2, axis: "expression", direction: -1, text: "戀愛是私事，\n你覺得不必公開。" },
    { id: "Q28", period: 2, axis: "expression", direction: -1, text: "感情得來不易，\n你要藏起來。" },

    // 佔有/自由
    { id: "Q29", period: 2, axis: "possess", direction: 1, text: "你希望對方別單獨跟異性出去。" },
    { id: "Q30", period: 2, axis: "possess", direction: 1, text: "你會要求對方公開你們的關係。" },
    { id: "Q31", period: 2, axis: "possess", direction: -1, text: "對方可以有自己的異性朋友，\n我不會介意。" },
    { id: "Q32", period: 2, axis: "possess", direction: -1, text: "每個人都是獨立的，\n在感情中各自保有空間。" },


    // ════════════ 失戀期 (period 3) ════════════

    // 主動/被動
    { id: "Q33", period: 3, axis: "initiative", direction: 1, text: "感情走不下去，\n是你先提分手。" },
    { id: "Q34", period: 3, axis: "initiative", direction: 1, text: "才剛分手，\n你會主動展開新生活。" },
    { id: "Q35", period: 3, axis: "initiative", direction: -1, text: "通常是對方先提分手。" },
    { id: "Q36", period: 3, axis: "initiative", direction: -1, text: "你總是拖到最後才願意分手。" },

    // 快速/緩慢
    { id: "Q37", period: 3, axis: "pace", direction: 1, text: "吵完後三天沒訊息，\n你就覺得算了吧！各過各的。" },
    { id: "Q38", period: 3, axis: "pace", direction: 1, text: "一個月後就看開了，\n你能接受新的對象。" },
    { id: "Q39", period: 3, axis: "pace", direction: -1, text: "你至少需要半年才能放下。" },
    { id: "Q40", period: 3, axis: "pace", direction: -1, text: "失戀後，\n你很久才能再相信愛。" },

    // 外放/內斂
    { id: "Q41", period: 3, axis: "expression", direction: 1, text: "失戀後，\n你會找朋友哭訴。" },
    { id: "Q42", period: 3, axis: "expression", direction: 1, text: "你會在限動流露失戀心情。" },
    { id: "Q43", period: 3, axis: "expression", direction: -1, text: "失戀，\n你獨自消化不讓人知。" },
    { id: "Q44", period: 3, axis: "expression", direction: -1, text: "你心裡很痛，\n但外人看不出來。" },

    // 佔有/自由
    { id: "Q45", period: 3, axis: "possess", direction: 1, text: "分手後，\n你還偷追他的動態。" },
    { id: "Q46", period: 3, axis: "possess", direction: 1, text: "他有新對象，\n你會很難受。" },
    { id: "Q47", period: 3, axis: "possess", direction: -1, text: "分手就是結束，\n不再關注他。" },
    { id: "Q48", period: 3, axis: "possess", direction: -1, text: "聽說他展開了新感情，\n我也無所謂。" },


    // ════════════ 性象限 (period 4) ════════════

    // 情感依附
    { id: "Q49", period: 4, axis: "sex_emotion", direction: 1, text: "你需要感情基礎，\n才能與對方親密。" },
    { id: "Q50", period: 4, axis: "sex_emotion", direction: 1, text: "性是感情的延伸，\n沒有感情，你無法發生關係。" },
    { id: "Q51", period: 4, axis: "sex_emotion", direction: -1, text: "性和愛可以分開看待。" },
    { id: "Q52", period: 4, axis: "sex_emotion", direction: -1, text: "「先性後愛」是可以接受的。" },

    // 開放度
    { id: "Q53", period: 4, axis: "sex_openness", direction: 1, text: "你能接受開放式關係。" },
    { id: "Q54", period: 4, axis: "sex_openness", direction: 1, text: "一對一並不是愛情最好的形式，\n偶爾同時喜歡上兩個人是可以的。" },
    { id: "Q55", period: 4, axis: "sex_openness", direction: -1, text: "感情必須維持專一。" },
    { id: "Q56", period: 4, axis: "sex_openness", direction: -1, text: "你不會同時跟兩人發展感情。" }
];


// ============================================================
// PART 2：生活版（沉浸式情境）
// 每題對應一個具體可想像的場景：
//   讓受測者讀題時能浮現畫面、直接判斷「對，這就是你」或「不，這不是你」
// ============================================================

window.LPAS_QUESTIONS_V3_PART2 = [

    // ════════════ 曖昧期 (period 1) ════════════

    // 主動/被動
    { id: "Q01", period: 1, axis: "initiative", direction: 1, text: "知道他常去的咖啡店，\n你會剛好出現。" },
    { id: "Q02", period: 1, axis: "initiative", direction: 1, text: "當你心動了，\n會傳「明天一起吃晚餐？」" },
    { id: "Q03", period: 1, axis: "initiative", direction: -1, text: "明明很想他，\n你也不會先傳訊息。" },
    { id: "Q04", period: 1, axis: "initiative", direction: -1, text: "「晚上有沒有空？」\n你說不出這句話。" },

    // 快速/緩慢
    { id: "Q05", period: 1, axis: "pace", direction: 1, text: "才見過三次面，\n你就覺得戀愛了。" },
    { id: "Q06", period: 1, axis: "pace", direction: 1, text: "曖昧期拖過一個月，\n你就快崩潰了。" },
    { id: "Q07", period: 1, axis: "pace", direction: -1, text: "你觀察了三個月，\n還沒確定喜不喜歡對方。" },
    { id: "Q08", period: 1, axis: "pace", direction: -1, text: "他不急著告白，\n你反而比較輕鬆自在。" },

    // 外放/內斂
    { id: "Q09", period: 1, axis: "expression", direction: 1, text: "「最近有點開心」\n你會故意發這種限動，\n暗示對方。" },
    { id: "Q10", period: 1, axis: "expression", direction: 1, text: "見面時，\n你會直接說「我有點喜歡你」。" },
    { id: "Q11", period: 1, axis: "expression", direction: -1, text: "連閨密都沒發現你喜歡他。" },
    { id: "Q12", period: 1, axis: "expression", direction: -1, text: "朋友突然提到他的名字，\n你會刻意裝作沒事。" },

    // 佔有/自由
    { id: "Q13", period: 1, axis: "possess", direction: 1, text: "看到他跟別女生IG互動，\n你會睡不著。" },
    { id: "Q14", period: 1, axis: "possess", direction: 1, text: "他已讀沒回，\n你會想他在跟誰聊。" },
    { id: "Q15", period: 1, axis: "possess", direction: -1, text: "他週末跟異性去看電影，\n你不會也不想過問。" },
    { id: "Q16", period: 1, axis: "possess", direction: -1, text: "他同時跟別人曖昧，\n你也覺得無所謂。" },


    // ════════════ 熱戀期 (period 2) ════════════

    // 主動/被動
    { id: "Q17", period: 2, axis: "initiative", direction: 1, text: "才剛剛一起度假回來，\n你已查好下一個旅遊行程。" },
    { id: "Q18", period: 2, axis: "initiative", direction: 1, text: "他最近怪怪的，\n你會直接問怎麼了？" },
    { id: "Q19", period: 2, axis: "initiative", direction: -1, text: "週末去哪？晚餐吃啥？\n都讓他決定。" },
    { id: "Q20", period: 2, axis: "initiative", direction: -1, text: "你想要他陪，\n卻寧可等他先問。" },

    // 快速/緩慢
    { id: "Q21", period: 2, axis: "pace", direction: 1, text: "交往一個月，\n你已帶他跟朋友一起吃飯。" },
    { id: "Q22", period: 2, axis: "pace", direction: 1, text: "交往兩個月，\n你就知道他是不是對的人。" },
    { id: "Q23", period: 2, axis: "pace", direction: -1, text: "在一起半年，\n你才敢說「你們穩了」。" },
    { id: "Q24", period: 2, axis: "pace", direction: -1, text: "他想要進一步，\n你得考慮好幾個月。" },

    // 外放/內斂
    { id: "Q25", period: 2, axis: "expression", direction: 1, text: "情人節，\n你會發長文寫他有多好。" },
    { id: "Q26", period: 2, axis: "expression", direction: 1, text: "他傳的肉麻訊息，\n你會截圖給閨密看。" },
    { id: "Q27", period: 2, axis: "expression", direction: -1, text: "朋友問「你有對象嗎？」，\n你笑笑帶過，還不想公開。" },
    { id: "Q28", period: 2, axis: "expression", direction: -1, text: "愛情怕說多就壞掉，\n你連閨密都不講。" },

    // 佔有/自由
    { id: "Q29", period: 2, axis: "possess", direction: 1, text: "他跟女同事下班喝酒，\n你會不高興。" },
    { id: "Q30", period: 2, axis: "possess", direction: 1, text: "他IG沒放你的照片，\n你會問為什麼？" },
    { id: "Q31", period: 2, axis: "possess", direction: -1, text: "他有國中女生死黨，\n你毫不在意。" },
    { id: "Q32", period: 2, axis: "possess", direction: -1, text: "他週末活動不找你，\n你覺得沒關係。" },


    // ════════════ 失戀期 (period 3) ════════════

    // 主動/被動
    { id: "Q33", period: 3, axis: "initiative", direction: 1, text: "感情卡住了，\n是你先說「分手吧」。" },
    { id: "Q34", period: 3, axis: "initiative", direction: 1, text: "覺得對方不夠愛你，\n你會說分就分。" },
    { id: "Q35", period: 3, axis: "initiative", direction: -1, text: "明知道合不來，\n還是等他先開口。" },
    { id: "Q36", period: 3, axis: "initiative", direction: -1, text: "即使幾個星期沒見了，\n你也不會主動提分手。" },

    // 快速/緩慢
    { id: "Q37", period: 3, axis: "pace", direction: 1, text: "才冷戰一個星期，\n你就想分手算了。" },
    { id: "Q38", period: 3, axis: "pace", direction: 1, text: "失戀一個月，\n你已經跟新對象搞曖昧。" },
    { id: "Q39", period: 3, axis: "pace", direction: -1, text: "分手三個月，\n一想起對方，你還是會難過。" },
    { id: "Q40", period: 3, axis: "pace", direction: -1, text: "分手半年了，\n你還是很難接受新的追求者。" },

    // 外放/內斂
    { id: "Q41", period: 3, axis: "expression", direction: 1, text: "分手當晚，\n你找閨密來陪你哭。" },
    { id: "Q42", period: 3, axis: "expression", direction: 1, text: "失戀後，\n你發「爛的去、新的來」的限動。" },
    { id: "Q43", period: 3, axis: "expression", direction: -1, text: "失戀可以躲起來難過大哭，\n但沒必要讓別人看出來。" },
    { id: "Q44", period: 3, axis: "expression", direction: -1, text: "失戀隔天，\n你照常生活，誰也看不出。" },

    // 佔有/自由
    { id: "Q45", period: 3, axis: "possess", direction: 1, text: "你無法接受，\n對方竟然有了新的約會對象。" },
    { id: "Q46", period: 3, axis: "possess", direction: 1, text: "分手之後，他發了新女友合照，\n你會整夜睡不著。" },
    { id: "Q47", period: 3, axis: "possess", direction: -1, text: "分手後，\n對方愛找誰就去找誰，\n你完全不想知道。" },
    { id: "Q48", period: 3, axis: "possess", direction: -1, text: "分手後，在街上巧遇，\n你看也不看，頭也不回。" },


    // ════════════ 性象限 (period 4) ════════════

    // 情感依附
    { id: "Q49", period: 4, axis: "sex_emotion", direction: 1, text: "還沒愛上他，\n你連牽手都會猶豫。" },
    { id: "Q50", period: 4, axis: "sex_emotion", direction: 1, text: "還沒確認關係之前，\n你無法跟對方上床。" },
    { id: "Q51", period: 4, axis: "sex_emotion", direction: -1, text: "性對你來說，\n可以只是一種身體運動。" },
    { id: "Q52", period: 4, axis: "sex_emotion", direction: -1, text: "很多人從床伴變情侶，\n你也想試試看。" },

    // 開放度
    { id: "Q53", period: 4, axis: "sex_openness", direction: 1, text: "就算對方已經有伴侶，\n你還是願意跟對方交往。" },
    { id: "Q54", period: 4, axis: "sex_openness", direction: 1, text: "你可以同時愛上兩個人。" },
    { id: "Q55", period: 4, axis: "sex_openness", direction: -1, text: "就算有機會，\n你不會跟伴侶以外的人曖昧。" },
    { id: "Q56", period: 4, axis: "sex_openness", direction: -1, text: "你不會腳踏兩條船。" }
];


// ============================================================
// 隨機取題：每個 id 從 PART1 / PART2 隨機抽一份
// ============================================================

window.lpasV3PickQuestion = function (id) {
    const p1 = window.LPAS_QUESTIONS_V3_PART1.find(q => q.id === id);
    const p2 = window.LPAS_QUESTIONS_V3_PART2.find(q => q.id === id);
    const pool = [p1, p2].filter(Boolean);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
};

/**
 * 取得某階段所有題目（已隨機洗牌 + 已隨機抽題庫版本）
 * @param {number} period 1=曖昧 / 2=熱戀 / 3=失戀 / 4=性象限
 */
window.lpasV3GetStageQuestions = function (period) {
    const ids = window.LPAS_QUESTIONS_V3_PART1
        .filter(q => q.period === period)
        .map(q => q.id);

    const questions = ids.map(id => window.lpasV3PickQuestion(id));

    // Fisher-Yates 洗牌
    for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
    }
    return questions;
};
