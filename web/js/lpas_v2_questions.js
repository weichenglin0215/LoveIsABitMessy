/**
 * lpas_v2_questions.js
 * LPAS v2 - 雙版本題庫
 *
 * 兩個全域常數：
 *   - LPAS_QUESTIONS_PART1：正式版（中性、書面、略含蓄）
 *   - LPAS_QUESTIONS_PART2：生活版（口語、閨蜜口吻、語氣詞多）
 *
 * 兩版規格：
 *   - 同 id 對應同一個測量目標
 *   - 同 id 必須同 period / axis / direction
 *   - 計分時兩版題目分數等價
 *
 * 題目結構：55 題
 *   ┌ 曖昧期 (period 1)  15 題：黏度 5 + 愛之語 5 + 浪漫度 5
 *   ┌ 熱戀期 (period 2)  15 題：黏度 5 + 愛之語 5 + 浪漫度 5
 *   ┌ 失戀期 (period 3)  15 題：黏度 5 + 愛之語 5 + 浪漫度 5
 *   └ 性象限 (period 4)  10 題：情感依附 5 + 開放度 5（可跳過）
 *
 * 軸代碼：
 *   "attachment"     → 黏度（Fuse=+, Free=-）
 *   "channel"        → 愛之語（Ver=+, Act=-）
 *   "frame"          → 浪漫度（Rom=+, Pra=-）
 *   "sex_emotion"    → 情感依附（High=+, Low=-）
 *   "sex_openness"   → 開放度（Open=+, Exclusive=-）
 *
 * 方向：
 *   direction = 1  → 該題正分代表正向標籤（Fuse / Ver / Rom / High / Open）
 *   direction = -1 → 該題正分代表反向標籤（Free / Act / Pra / Low / Exclusive），計分時翻轉
 */

// ============================================================
// PART 1：正式版（中性、書面）
// ============================================================

window.LPAS_QUESTIONS_PART1 = [
    // ===== 曖昧期 - 黏度 =====
    { id: "Q01", period: 1, axis: "attachment", direction: 1, text: "你會經常查看訊息，\n怕錯過對方回覆。" },
    { id: "Q02", period: 1, axis: "attachment", direction: 1, text: "你希望每天都與對方聯絡。" },
    { id: "Q03", period: 1, axis: "attachment", direction: 1, text: "對方與異性互動，\n你會感到不舒服。" },
    { id: "Q04", period: 1, axis: "attachment", direction: -1, text: "對方太靠近時，\n你想保留距離。" },
    { id: "Q05", period: 1, axis: "attachment", direction: -1, text: "曖昧期，\n你重視各自的空間。" },

    // ===== 曖昧期 - 愛之語 =====
    { id: "Q06", period: 1, axis: "channel", direction: 1, text: "你會直接告訴對方感受。" },
    { id: "Q07", period: 1, axis: "channel", direction: 1, text: "你習慣用訊息表達好感，\n不想直接開口。" },
    { id: "Q08", period: 1, axis: "channel", direction: 1, text: "你希望對方能直接告白，\n盡快確認這段感情。" },
    { id: "Q09", period: 1, axis: "channel", direction: -1, text: "比起說出來，\n你更傾向用行動表達。" },
    { id: "Q10", period: 1, axis: "channel", direction: -1, text: "你默默為對方做事傳達心意。" },

    // ===== 曖昧期 - 浪漫度 =====
    { id: "Q11", period: 1, axis: "frame", direction: 1, text: "你相信遇到對的人，\n一見面就能感受到。" },
    { id: "Q12", period: 1, axis: "frame", direction: 1, text: "你會被「命中註定」打動。" },
    { id: "Q13", period: 1, axis: "frame", direction: 1, text: "你希望感情有故事感與儀式感。" },
    { id: "Q14", period: 1, axis: "frame", direction: -1, text: "你會謹慎評估，\n對方的生活方式是否契合。" },
    { id: "Q15", period: 1, axis: "frame", direction: -1, text: "你認為彼此的條件契合很重要。" },

    // ===== 熱戀期 - 黏度 =====
    { id: "Q16", period: 2, axis: "attachment", direction: 1, text: "在一起後，\n你希望隨時保持聯繫。" },
    { id: "Q17", period: 2, axis: "attachment", direction: 1, text: "另一半與異性聚會，\n你會不自在。" },
    { id: "Q18", period: 2, axis: "attachment", direction: 1, text: "你希望兩人生活完整交織。" },
    { id: "Q19", period: 2, axis: "attachment", direction: -1, text: "你希望週末碰面，平日仍保留個人時間。" },
    { id: "Q20", period: 2, axis: "attachment", direction: -1, text: "過於黏膩，\n會讓你不舒服。" },

    // ===== 熱戀期 - 愛之語 =====
    { id: "Q21", period: 2, axis: "channel", direction: 1, text: "你常主動表達愛意與想念。" },
    { id: "Q22", period: 2, axis: "channel", direction: 1, text: "你需要常常聽到對方的情話。" },
    { id: "Q23", period: 2, axis: "channel", direction: 1, text: "你和對方有大量訊息交流。" },
    { id: "Q24", period: 2, axis: "channel", direction: -1, text: "你主要透過默默照顧表達愛。" },
    { id: "Q25", period: 2, axis: "channel", direction: -1, text: "你比較難把愛說出口，\n傾向以陪伴代替。" },

    // ===== 熱戀期 - 浪漫度 =====
    { id: "Q26", period: 2, axis: "frame", direction: 1, text: "你和對方規劃富想像的未來。" },
    { id: "Q27", period: 2, axis: "frame", direction: 1, text: "這段感情有命中註定的特質。" },
    { id: "Q28", period: 2, axis: "frame", direction: 1, text: "儀式感很重要，\n維持感情溫度。" },
    { id: "Q29", period: 2, axis: "frame", direction: -1, text: "熱戀中，你仍會衡量實際條件。" },
    { id: "Q30", period: 2, axis: "frame", direction: -1, text: "比起短暫浪漫，\n你更重視長期經營。" },

    // ===== 失戀期 - 黏度 =====
    { id: "Q31", period: 3, axis: "attachment", direction: 1, text: "當不成男女朋友，\n你仍會關注對方近況。" },
    { id: "Q32", period: 3, axis: "attachment", direction: 1, text: "你需要很久才能真正放下。" },
    { id: "Q33", period: 3, axis: "attachment", direction: 1, text: "失戀後，\n你會反覆回想細節。" },
    { id: "Q34", period: 3, axis: "attachment", direction: -1, text: "分了就分了，\n你能迅速放下對方。" },
    { id: "Q35", period: 3, axis: "attachment", direction: -1, text: "分手只是一件小事，\n你能快速展開新生活。" },

    // ===== 失戀期 - 愛之語 =====
    { id: "Q36", period: 3, axis: "channel", direction: 1, text: "失戀後，\n你需要向朋友傾訴才能復原。" },
    { id: "Q37", period: 3, axis: "channel", direction: 1, text: "你會在社群抒發失戀狀態。" },
    { id: "Q38", period: 3, axis: "channel", direction: 1, text: "你讓自己獨處來梳理情緒。" },
    { id: "Q39", period: 3, axis: "channel", direction: -1, text: "你把時間塞滿來宣洩失戀情緒。" },
    { id: "Q40", period: 3, axis: "channel", direction: -1, text: "失戀後，\n你以行動來轉移注意力。" },

    // ===== 失戀期 - 浪漫度 =====
    { id: "Q41", period: 3, axis: "frame", direction: 1, text: "失戀後，\n你仍相信下段感情更好。" },
    { id: "Q42", period: 3, axis: "frame", direction: 1, text: "你視這段感情為人生篇章。" },
    { id: "Q43", period: 3, axis: "frame", direction: 1, text: "你記得許多細節，\n賦予感情詩意。" },
    { id: "Q44", period: 3, axis: "frame", direction: -1, text: "你會理性分析失敗原因。" },
    { id: "Q45", period: 3, axis: "frame", direction: -1, text: "你把失戀歸於條件不合。" },

    // ===== 性象限 - 情感依附 =====
    { id: "Q46", period: 4, axis: "sex_emotion", direction: 1, text: "你需要感情基礎，\n才能進一步的親密關係。" },
    { id: "Q47", period: 4, axis: "sex_emotion", direction: 1, text: "對你而言，\n性是感情的延伸。" },
    { id: "Q48", period: 4, axis: "sex_emotion", direction: 1, text: "你無法與剛認識的人上床。" },
    { id: "Q49", period: 4, axis: "sex_emotion", direction: -1, text: "你認為性與愛可以分開。" },
    { id: "Q50", period: 4, axis: "sex_emotion", direction: -1, text: "你可以接受「先性後愛」。" },

    // ===== 性象限 - 開放度 =====
    { id: "Q51", period: 4, axis: "sex_openness", direction: 1, text: "你能接受開放式關係。" },
    { id: "Q52", period: 4, axis: "sex_openness", direction: 1, text: "一對一並不是愛情唯一形式。" },
    { id: "Q53", period: 4, axis: "sex_openness", direction: 1, text: "你可以同時喜歡兩個人，\n保持開放態度。" },
    { id: "Q54", period: 4, axis: "sex_openness", direction: -1, text: "你堅持感情必須專一。" },
    { id: "Q55", period: 4, axis: "sex_openness", direction: -1, text: "與多人發展親密關係，會讓你覺得不安。" }
];


// ============================================================
// PART 2：生活版（口語、閨蜜口吻）
// ============================================================

window.LPAS_QUESTIONS_PART2 = [
    // ===== 曖昧期 - 黏度 =====
    { id: "Q01", period: 1, axis: "attachment", direction: 1, text: "你會一直滑手機，\n怕錯過他訊息。" },
    { id: "Q02", period: 1, axis: "attachment", direction: 1, text: "你希望每天都跟他有互動。" },
    { id: "Q03", period: 1, axis: "attachment", direction: 1, text: "看他跟別人互動，\n你會在意。" },
    { id: "Q04", period: 1, axis: "attachment", direction: -1, text: "他靠太近，\n你反而想退一步。" },
    { id: "Q05", period: 1, axis: "attachment", direction: -1, text: "曖昧期，\n各自有空間比較舒服。" },

    // ===== 曖昧期 - 愛之語 =====
    { id: "Q06", period: 1, axis: "channel", direction: 1, text: "你會把感受直接講出來。" },
    { id: "Q07", period: 1, axis: "channel", direction: 1, text: "你喜歡傳長訊息聊心情。" },
    { id: "Q08", period: 1, axis: "channel", direction: 1, text: "你希望他常告訴你他在乎。" },
    { id: "Q09", period: 1, axis: "channel", direction: -1, text: "你寧可默默做，\n不愛說出口。" },
    { id: "Q10", period: 1, axis: "channel", direction: -1, text: "你用做事勝過嘴上講。" },

    // ===== 曖昧期 - 浪漫度 =====
    { id: "Q11", period: 1, axis: "frame", direction: 1, text: "對的人，\n你一見就知道。" },
    { id: "Q12", period: 1, axis: "frame", direction: 1, text: "你會被「命中註定」打中。" },
    { id: "Q13", period: 1, axis: "frame", direction: 1, text: "你希望感情有故事感、儀式感。" },
    { id: "Q14", period: 1, axis: "frame", direction: -1, text: "你會評估他的生活方式。" },
    { id: "Q15", period: 1, axis: "frame", direction: -1, text: "你覺得條件比節奏重要。" },

    // ===== 熱戀期 - 黏度 =====
    { id: "Q16", period: 2, axis: "attachment", direction: 1, text: "在一起後，\n你希望隨時黏在訊息。" },
    { id: "Q17", period: 2, axis: "attachment", direction: 1, text: "他跟異性聚會，\n你會吃醋。" },
    { id: "Q18", period: 2, axis: "attachment", direction: 1, text: "你想把兩人生活完全交織。" },
    { id: "Q19", period: 2, axis: "attachment", direction: -1, text: "週末，\n你想保留自己的一天。" },
    { id: "Q20", period: 2, axis: "attachment", direction: -1, text: "太黏，\n反而讓你喘不過氣。" },

    // ===== 熱戀期 - 愛之語 =====
    { id: "Q21", period: 2, axis: "channel", direction: 1, text: "在一起後，\n你常把愛掛嘴邊。" },
    { id: "Q22", period: 2, axis: "channel", direction: 1, text: "你需要他常告訴你他愛你。" },
    { id: "Q23", period: 2, axis: "channel", direction: 1, text: "你跟他隨時都在訊息裡。" },
    { id: "Q24", period: 2, axis: "channel", direction: -1, text: "你愛他主要靠默默處理事。" },
    { id: "Q25", period: 2, axis: "channel", direction: -1, text: "你難說肉麻話，\n用陪伴代替。" },

    // ===== 熱戀期 - 浪漫度 =====
    { id: "Q26", period: 2, axis: "frame", direction: 1, text: "你跟他規劃天馬行空的未來。" },
    { id: "Q27", period: 2, axis: "frame", direction: 1, text: "這段感情，\n你覺得命中註定。" },
    { id: "Q28", period: 2, axis: "frame", direction: 1, text: "你用儀式感維持感情溫度。" },
    { id: "Q29", period: 2, axis: "frame", direction: -1, text: "感情中，\n你會看清實際條件。" },
    { id: "Q30", period: 2, axis: "frame", direction: -1, text: "比起浪漫，\n你更重視長期穩定。" },

    // ===== 失戀期 - 黏度 =====
    { id: "Q31", period: 3, axis: "attachment", direction: 1, text: "分手後，\n你還偷追他動態。" },
    { id: "Q32", period: 3, axis: "attachment", direction: 1, text: "你要很久才能放下感情。" },
    { id: "Q33", period: 3, axis: "attachment", direction: 1, text: "失戀後，\n你會一直回想以前。" },
    { id: "Q34", period: 3, axis: "attachment", direction: -1, text: "才剛分手後，\n你很快把他忘了。" },
    { id: "Q35", period: 3, axis: "attachment", direction: -1, text: "分手後，\n你能快速投入新生活。" },

    // ===== 失戀期 - 愛之語 =====
    { id: "Q36", period: 3, axis: "channel", direction: 1, text: "失戀後，\n你要說出來才會好。" },
    { id: "Q37", period: 3, axis: "channel", direction: 1, text: "你會在限動流露失戀心情。" },
    { id: "Q38", period: 3, axis: "channel", direction: 1, text: "你用寫字整理失戀情緒。" },
    { id: "Q39", period: 3, axis: "channel", direction: -1, text: "你用運動、\n加班宣洩失戀。" },
    { id: "Q40", period: 3, axis: "channel", direction: -1, text: "失戀後，\n你用行動分散注意力。" },

    // ===== 失戀期 - 浪漫度 =====
    { id: "Q41", period: 3, axis: "frame", direction: 1, text: "失戀後，\n你相信下段更好。" },
    { id: "Q42", period: 3, axis: "frame", direction: 1, text: "你把這感情當人生大章節。" },
    { id: "Q43", period: 3, axis: "frame", direction: 1, text: "你會記得超多細節，\n把感情詩化。" },
    { id: "Q44", period: 3, axis: "frame", direction: -1, text: "你會分析感情失敗原因。" },
    { id: "Q45", period: 3, axis: "frame", direction: -1, text: "你覺得失戀是條件不合。" },

    // ===== 性象限 - 情感依附 =====
    { id: "Q46", period: 4, axis: "sex_emotion", direction: 1, text: "你需要有愛才能親密。" },
    { id: "Q47", period: 4, axis: "sex_emotion", direction: 1, text: "對你而言，\n性是愛的延伸。" },
    { id: "Q48", period: 4, axis: "sex_emotion", direction: 1, text: "沒感情，\n你難有肢體關係。" },
    { id: "Q49", period: 4, axis: "sex_emotion", direction: -1, text: "性跟愛是兩回事。" },
    { id: "Q50", period: 4, axis: "sex_emotion", direction: -1, text: "「先性後愛」你能接受。" },

    // ===== 性象限 - 開放度 =====
    { id: "Q51", period: 4, axis: "sex_openness", direction: 1, text: "你能接受「開放式關係」。" },
    { id: "Q52", period: 4, axis: "sex_openness", direction: 1, text: "一對一不是愛情唯一形式。" },
    { id: "Q53", period: 4, axis: "sex_openness", direction: 1, text: "同時喜歡兩人，\n你保持開放。" },
    { id: "Q54", period: 4, axis: "sex_openness", direction: -1, text: "你堅持感情要專一。" },
    { id: "Q55", period: 4, axis: "sex_openness", direction: -1, text: "你不會同時跟兩人上床。" }
];


// ============================================================
// 隨機取題輔助函式
// ============================================================

/**
 * 從 PART1 / PART2 隨機抽一份該 id 的題目
 * @param {string} id 題目 id (如 "Q01")
 * @returns {object} 該題的物件（含 text）
 */
window.lpasPickQuestion = function (id) {
    const p1 = window.LPAS_QUESTIONS_PART1.find(q => q.id === id);
    const p2 = window.LPAS_QUESTIONS_PART2.find(q => q.id === id);
    const pool = [p1, p2].filter(Boolean);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
};

/**
 * 取得某階段所有題目（已隨機洗牌 + 已隨機抽題庫版本）
 * @param {number} period 1=曖昧 / 2=熱戀 / 3=失戀 / 4=性象限
 * @returns {Array} 該階段的題目陣列（已洗牌）
 */
window.lpasGetStageQuestions = function (period) {
    // 蒐集該階段所有 id
    const ids = window.LPAS_QUESTIONS_PART1
        .filter(q => q.period === period)
        .map(q => q.id);

    // 每個 id 隨機取一個版本
    const questions = ids.map(id => window.lpasPickQuestion(id));

    // Fisher-Yates 洗牌
    for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
    }
    return questions;
};
