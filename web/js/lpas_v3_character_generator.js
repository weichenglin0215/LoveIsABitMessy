/**
 * lpas_v3_character_generator.js
 * LPAS v3 - 角色卡產生器（簡化版）
 *
 * card_json（寫入 characters 表）：只含基本資料 + personality_type 字串
 *   格式範例：
 *     personality_type: "AFOH_PSOH_ASIL-海嘯_梅雨_燈塔-深情專一型"
 *     （沿用 V1 格式：代碼三聯_中文名三聯-性象限）
 *
 * lpas_record_json（寫入 characters.lpas_record_json 欄位）：含完整 v3 詳細資料
 *   - answers：所有作答紀錄
 *   - scores：軸分數、性象限、雷達資料
 *   - phase_details：三期完整描述（給 AI 用）
 *   - markdown_summary：完整角色卡 markdown
 *
 * 對外 API：
 *   - generateV3Profile()   → 簡化版 card_json
 *   - generateV3RecordJson()→ 含完整詳細資料的 record_json
 *   - generateV3Markdown()  → 完整 markdown 描述
 */

(function () {

    /**
     * 產生標準 UUID（characters.id 是 uuid 型別）
     */
    function generateCharacterUUID() {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
            return crypto.randomUUID();
        }
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            const r = Math.random() * 16 | 0;
            const v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

    /**
     * 移除 4 字母代碼之間的連字號：「A-F-O-H」→「AFOH」
     * 與 V1 格式對齊（V1 是「PICS」、「PICF」）
     */
    function compactCode(code) {
        return (code || '').replace(/-/g, '');
    }

    /**
     * 構造 V3 personality_type 字串
     * 格式：「AFOH_PSOH_ASIL-海嘯_梅雨_燈塔-性象限」
     *   - 三段代碼以底線分隔
     *   - 與三段中文名（去「型」字）以連字號分隔
     *   - 性象限可選，未測時加「未測」
     */
    function buildPersonalityType(resultData) {
        const c1 = compactCode(resultData.phase_codes[1]);
        const c2 = compactCode(resultData.phase_codes[2]);
        const c3 = compactCode(resultData.phase_codes[3]);
        const codeTriple = `${c1}_${c2}_${c3}`;

        const n1 = (resultData.phase_types[1] || '').replace('型', '');
        const n2 = (resultData.phase_types[2] || '').replace('型', '');
        const n3 = (resultData.phase_types[3] || '').replace('型', '');
        const nameTriple = `${n1}_${n2}_${n3}`;

        const sexLabel = (resultData.sex && resultData.sex.displayable) ? resultData.sex.label : '未測';

        return `${codeTriple}-${nameTriple}-${sexLabel}`;
    }


    /**
     * 主函式：產生「簡化版」角色卡物件（寫入 card_json）
     */
    window.generateV3Profile = function (alias, ageRange, relationshipExp, resultData, feedbackScores) {
        // V1 風格的簡潔卡片，只保留必要識別資料（不含完整測驗資料，那些放在 record_json）
        return {
            id: generateCharacterUUID(),                      // 標準 UUID（給 characters.id）
            name: alias || '匿名',                              // 顯示用名稱，未填暱稱時預設「匿名」
            alias: alias || '匿名',                             // 別名欄位，與 name 相同
            age_range: ageRange || '',                         // 年齡區間，例如 "20-25"
            relationship_experience: relationshipExp || '',    // 感情經驗（yes/no 或空字串）
            personality_type: buildPersonalityType(resultData),  // V3 三聯字串
            lpas_version: 'v3',                                 // 標記此角色卡由 LPAS v3 引擎產生
            source: 'lpas_v3',                                  // 資料來源標記
            created_at: new Date().toISOString()                // 建立時間戳記
        };
    };


    /**
     * 把 V3 完整詳細資料 + 答案陣列轉換成 lpas_record_json 格式
     * 寫入 characters.lpas_record_json 欄位
     * 包含：作答、分數、三期詳細描述、markdown 摘要
     */
    window.generateV3RecordJson = function (alias, ageRange, exp, sessionId, sessionStartedAt, answers, resultData, feedbackScores) {
        // types：從全域變數取得「代碼 → 型別詳細資料」對照表（由其他檔案預先掛在 window 上）
        const types = window.TYPE_MAPPING_V3 || {};
        // sexInfo：依使用者的性象限標籤，查出對應的詳細描述（標語、說明文字）
        const sexInfo = (window.SEX_QUADRANTS_V3 || {})[resultData.sex && resultData.sex.label] || null;

        // 三期（曖昧期/熱戀期/失戀期）完整描述，逐期組成物件，key 為期數 1/2/3
        const phaseDetails = {};
        for (const p of [1, 2, 3]) {
            // 該期使用者測出的型別代碼，例如 "AFOH"
            const code = resultData.phase_codes[p];
            // 從對照表查出此代碼的完整型別資料（名稱、描述等）
            const typeInfo = types[code];
            if (typeInfo) {
                // phaseKey：對應期數在 typeInfo 內儲存描述的欄位名稱
                // p=1→曖昧期(ambiguity)、p=2→熱戀期(love)、p=3→失戀期(breakup)
                const phaseKey = ['ambiguity', 'love', 'breakup'][p - 1];
                phaseDetails[p] = {
                    code:     code,
                    code_full: typeInfo.code,   // 含中文軸標：「A-F-O-H_主動-快-外放-佔有」
                    name:     typeInfo.name,    // 型別中文名稱，例如「深情專一型」
                    short:    typeInfo.short,   // 一句話短描述
                    desc:     typeInfo[phaseKey] ? typeInfo[phaseKey].desc : '',       // 該期的詳細描述文字
                    roleplay: typeInfo.roleplay ? typeInfo.roleplay.desc : ''          // 給 AI 用的角色扮演指引
                };
            }
        }

        // 性象限資訊（含完整描述：情感強度、開放程度、標語與說明）
        const sexDetail = {
            displayable: resultData.sex ? resultData.sex.displayable : false,
            label:       resultData.sex ? resultData.sex.label : null,
            emotion:     resultData.sex ? resultData.sex.emotion : null,
            openness:    resultData.sex ? resultData.sex.openness : null,
            tagline:     sexInfo ? sexInfo.tagline : '',
            desc:        sexInfo ? sexInfo.desc : ''
        };

        // record：最終寫入 characters.lpas_record_json 欄位的完整結構
        const record = {
            meta: {
                schema_version: 3,                             // 資料結構版本號，方便未來升級相容判斷
                session_id: sessionId,                          // 測驗場次 ID
                started_at: sessionStartedAt,                   // 測驗開始時間
                finished_at: new Date().toISOString(),          // 測驗結束時間（產生此紀錄當下）
                alias: alias || null,                           // 使用者暱稱
                age_range: ageRange,                            // 年齡區間
                relationship_experience: exp,                   // 感情經驗（yes/no）
                total_questions: answers.length,                // 本次測驗總作答題數
                feedback_scores: feedbackScores || {},          // 使用者對測驗的回饋評分
                engine_version: 'v3'                            // 測驗引擎版本
            },
            // answers：所有作答紀錄，依題目 id 字串排序，方便日後查閱與除錯
            answers: answers.slice().sort((a, b) => (a.id || '').localeCompare(b.id || '')),
            scores: {
                phase_codes:  resultData.phase_codes,   // 三期各自的型別代碼
                phase_types:  resultData.phase_types,   // 三期各自的型別中文名稱
                axis_scores:  resultData.axis_scores,   // 各軸（主動/被動、快/慢…）分數
                sex:          resultData.sex,           // 性象限原始資料
                radar_data:   resultData.radar_data,    // 雷達圖用資料
                // triple_code：三期代碼以底線連接，例如 "AFOH_PSOH_ASIL"
                triple_code:  `${resultData.phase_codes[1]}_${resultData.phase_codes[2]}_${resultData.phase_codes[3]}`,
                // triple_name：三期中文名稱以頓號連接，方便閱讀顯示
                triple_name:  `${resultData.phase_types[1]}・${resultData.phase_types[2]}・${resultData.phase_types[3]}`
            },
            phase_details: phaseDetails,   // 三期完整描述（給 AI 寫作參考用）
            sex_detail:    sexDetail,      // 性象限完整描述
            markdown_summary: ''   // 由下方 generateV3Markdown 填入
        };

        // 產生完整 markdown 格式的角色描述，並寫回 record 中
        record.markdown_summary = window.generateV3Markdown(record);
        return record;
    };


    /**
     * 產生 markdown 格式的角色描述
     * 輸入：record（lpas_record_json 結構）
     */
    window.generateV3Markdown = function (record) {
        const details = record.phase_details || {};   // 三期詳細描述
        const sex     = record.sex_detail || {};       // 性象限詳細描述
        const meta    = record.meta || {};              // 基本資料（暱稱、年齡區間等）
        const scores  = record.scores || {};            // 分數區塊
        const axis    = scores.axis_scores || {};       // 各軸分數（三期分別的數值）

        let md = '';   // 逐段拼接的 markdown 字串，最後回傳

        // 標題
        md += `# 角色卡：${meta.alias || '匿名'}\n\n`;

        // 基本資料
        md += `## 基本資料\n`;
        md += `- **暱稱**：${meta.alias || '—'}\n`;
        md += `- **年齡區間**：${meta.age_range || '—'}\n`;
        md += `- **感情經驗**：${meta.relationship_experience === 'yes' ? '有' : '尚無'}\n`;
        md += `- **LPAS 版本**：v3 (16 天候型 × 4 性象限)\n\n`;

        // 三聯人格：先列出三期各自的代碼與名稱簡表
        md += `## 戀愛三聯人格\n`;
        const phaseNames = { 1: '曖昧期', 2: '熱戀期', 3: '失戀期' };
        for (const p of [1, 2, 3]) {
            const d = details[p];
            if (d) {
                md += `- **${phaseNames[p]}**：${d.code} ${d.name}　《${d.short}》\n`;
            }
        }
        // 只有性象限「可顯示」（displayable）時才輸出，避免未測時顯示空資料
        if (sex.label && sex.displayable) {
            md += `- **性象限**：${sex.label}　《${sex.tagline}》\n`;
        }
        md += '\n';

        // 三階段詳細：逐期輸出完整描述與角色扮演指引，供 AI 寫作參考
        md += `## 三階段樣貌\n\n`;
        for (const p of [1, 2, 3]) {
            const d = details[p];
            if (!d) continue;   // 該期無資料則跳過（理論上不應發生，防呆用）
            md += `### Chapter ${p} · ${phaseNames[p]}：${d.name}\n`;
            md += `> 《${d.short}》\n\n`;
            md += `${d.desc}\n\n`;
            md += `**角色扮演指引**：${d.roleplay}\n\n`;
        }

        // 性象限：作為額外（Bonus）段落輸出完整說明
        if (sex.label && sex.displayable) {
            md += `### Bonus · 性象限：${sex.label}\n`;
            md += `> 《${sex.tagline}》\n\n`;
            md += `${sex.desc}\n\n`;
        }

        // 軸向強度：以表格呈現四個人格軸在三期的分數（1~7 分）
        md += `## 軸向強度（1–7）\n\n`;
        md += `| 軸 | 曖昧期 | 熱戀期 | 失戀期 |\n`;
        md += `|---|---:|---:|---:|\n`;
        // axisNames：軸的內部代號 → 中文顯示名稱對照表
        const axisNames = {
            initiative: '主動/被動',
            pace:       '快/慢',
            expression: '外放/內斂',
            possess:    '佔有/自由'
        };
        for (const a in axisNames) {
            // 分別取出三期在此軸上的分數，若無資料則為 null
            const v1 = axis.phase_1 ? axis.phase_1[a] : null;
            const v2 = axis.phase_2 ? axis.phase_2[a] : null;
            const v3v= axis.phase_3 ? axis.phase_3[a] : null;
            // 有值就四捨五入到小數點後一位，無值則顯示「—」
            md += `| ${axisNames[a]} | ${v1 != null ? v1.toFixed(1) : '—'} | ${v2 != null ? v2.toFixed(1) : '—'} | ${v3v != null ? v3v.toFixed(1) : '—'} |\n`;
        }
        md += '\n';

        // AI 寫作參考：整理成給 AI 小說生成器參考的重點提示
        md += `## AI 寫作參考\n\n`;
        md += `這個角色在三個情境中表現截然不同：\n\n`;
        for (const p of [1, 2, 3]) {
            const d = details[p];
            if (d) md += `- 寫到「${phaseNames[p]}」場景時，角色應呈現「**${d.name}**」的特徵：${d.short}。\n`;
        }
        if (sex.label && sex.displayable) {
            md += `- 涉及親密場景時，採用「**${sex.label}**」的態度：${sex.tagline}。\n`;
        }
        md += `\n切換期間時，請從上述對應段落抓取「角色扮演指引」作為對話風格依據。\n`;

        return md;   // 回傳完整組合好的 markdown 字串
    };

})();
