/**
 * lpas_v1_to_v3.js
 *
 * 將舊版 LPAS v1 角色卡格式（personality_type: "AOCF_AICS_PILS-煙火_燈塔_深海"）
 * 自動轉換為 LPAS v3 結構化欄位（cardJson.lpas_v3 = {ambiguity, love, breakup, intimacy, ...}）。
 *
 * 軸向對應：
 *   V1 軸序：A/P - O/I - C/L - F/S   （4 字代碼，無連字號，例如 "AOCF"）
 *   V3 軸序：A/P - F/S - O/I - H/L   （V3 內部鍵值含連字號，例如 "A-F-O-L"）
 *   軸 1 A/P 共用；軸 F/S 與 O/I 順序交換；
 *   軸 C/L (乾脆/留戀) → 軸 H/L (佔有/自由)：C → L（自由）、L → H（佔有）
 *
 * 由本檔案統一輸出：
 *   - window.LPAS_V1_TO_V3_MAP            16 型字典（V1 4 字 → V3 含連字號鍵值）
 *   - window.convertV1CodeToV3(v1code)    單一代碼轉換（回傳 V3 含連字號鍵值）
 *   - window.isV1PersonalityType(ptype)   判斷字串是否為 V1 三聯格式
 *   - window.convertCardJsonV1ToV3(c)     就地把 cardJson 補上 lpas_v3（新格式）
 *
 * 重要：本檔案產出的 lpas_v3 採用「統一新格式」——
 *   代碼去除連字號（AFOL）、型名去除結尾「型」、三聯以「_」連接，
 *   與 characters_editor_app.js 的 buildLpasV3() 完全一致。
 *
 * 注意：V1 沒有「親密關係」(type_4 / intimacy) 欄位，轉換後此欄留空，
 *       需使用者後續手動補選 4 性象限之一。
 */

// ============================================================
// 16 型對照表（V1 4 字代碼 → V3 4 軸代碼，V3 端含連字號）
// ============================================================
window.LPAS_V1_TO_V3_MAP = {
    "AOCF": "A-F-O-L", // 煙火型 → 煙火型
    "AOCS": "A-S-O-L", // 太陽型 → 太陽型
    "AOLF": "A-F-O-H", // 潮水型 → 海嘯型
    "AOLS": "A-S-O-H", // 候鳥型 → 岩漿型
    "AICF": "A-F-I-L", // 陣雨型 → 陣雨型
    "AICS": "A-S-I-L", // 燈塔型 → 燈塔型
    "AILF": "A-F-I-H", // 星星型 → 漩渦型
    "AILS": "A-S-I-H", // 月亮型 → 藤蔓型
    "POCF": "P-F-O-L", // 流星型 → 流星型
    "POCS": "P-S-O-L", // 冰川型 → 晚霞型
    "POLF": "P-F-O-H", // 浪花型 → 雷雨型
    "POLS": "P-S-O-H", // 溫泉型 → 梅雨型
    "PICF": "P-F-I-L", // 霜花型 → 晨露型
    "PICS": "P-S-I-L", // 迷霧型 → 迷霧型
    "PILF": "P-F-I-H", // 細雨型 → 流沙型
    "PILS": "P-S-I-H"  // 深海型 → 深海型
};

/**
 * 將單一 V1 4 字代碼（如 "AOCF"）轉成 V3 四軸代碼（含連字號，如 "A-F-O-L"）。
 * 不認得時回傳空字串。
 */
window.convertV1CodeToV3 = function (v1code) {
    if (!v1code) return '';
    return window.LPAS_V1_TO_V3_MAP[String(v1code).toUpperCase()] || '';
};

/**
 * 判斷 personality_type 字串是否屬於 V1 三聯格式
 * 例如："AOCF_AICS_PILS-煙火_燈塔_深海"（連字號前由 3 個 4 字 V1 代碼以底線串接）。
 */
window.isV1PersonalityType = function (ptype) {
    if (!ptype) return false;
    const head = String(ptype).split('-')[0];
    const codes = head.split('_');
    // V1 軸：A/P + O/I + C/L + F/S
    return codes.length === 3 && codes.every(c => /^[AP][OI][CL][FS]$/.test(c));
};

/**
 * 就地將舊 V1 卡片轉成 V3 結構（統一新格式）。
 * 條件：cardJson 沒有 lpas_v3，且 personality_type 為 V1 三聯格式。
 * 副作用：
 *   - 補上 cardJson.lpas_v3（含 converted_from_v1: true 標記）
 *   - 不覆蓋既有 personality_type（保留原始 V1 字串作為追溯來源）
 * 回傳：true 表示有執行轉換；false 表示未作任何事。
 */
window.convertCardJsonV1ToV3 = function (cardJson) {
    if (!cardJson || typeof cardJson !== 'object') return false;
    if (cardJson.lpas_v3) return false; // 已有 V3，跳過
    const ptype = cardJson.personality_type;
    if (!window.isV1PersonalityType(ptype)) return false;

    // 拆解 V1 三聯字串
    const codePart = String(ptype).split('-')[0];
    const v1codes = codePart.split('_'); // ["AOCF", "AICS", "PILS"]
    const v3dashed = v1codes.map(window.convertV1CodeToV3);
    if (v3dashed.some(c => !c)) return false; // 任何一個無法對應就放棄

    // 統一新格式：代碼去連字號、型名去結尾「型」、三聯以「_」連接
    const v3map = window.TYPE_MAPPING_V3 || {};
    const stripType = (s) => (s || '').replace(/型$/, '');
    const nameOf = (k) => (v3map[k] && v3map[k].name) ? stripType(v3map[k].name) : '';

    const v3codes = v3dashed.map(c => c.replace(/-/g, '')); // ["AFOL", ...]
    const tripleCode = v3codes.join('_');                   // AFOL_ASIL_PSIH
    const tripleName = v3dashed.map(nameOf).filter(n => n).join('_'); // 煙火_燈塔_深海

    cardJson.lpas_v3 = {
        engine_version: 'v3',
        converted_from_v1: true,    // 標記此筆為自動轉換而非原生 V3
        ambiguity: v3codes[0],      // 曖昧期 (type_1)
        love: v3codes[1],           // 熱戀期 (type_2)
        breakup: v3codes[2],        // 失戀期 (type_3)
        intimacy: '',               // 親密關係 (type_4)：V1 無對應，留空待補
        triple_code: tripleCode,
        triple_name: tripleName,
        full_code: tripleCode,                       // 無親密關係，full_code 即三聯代碼
        full_name: `${tripleCode}-${tripleName}`     // 無親密關係，省略尾段
    };
    return true;
};
