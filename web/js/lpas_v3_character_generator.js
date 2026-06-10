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
        // V1 風格的簡潔卡片，只保留必要識別資料
        return {
            id: generateCharacterUUID(),                      // 標準 UUID（給 characters.id）
            name: alias || '匿名',
            alias: alias || '匿名',
            age_range: ageRange || '',
            relationship_experience: relationshipExp || '',
            personality_type: buildPersonalityType(resultData),  // V3 三聯字串
            lpas_version: 'v3',
            source: 'lpas_v3',
            created_at: new Date().toISOString()
        };
    };


    /**
     * 把 V3 完整詳細資料 + 答案陣列轉換成 lpas_record_json 格式
     * 寫入 characters.lpas_record_json 欄位
     * 包含：作答、分數、三期詳細描述、markdown 摘要
     */
    window.generateV3RecordJson = function (alias, ageRange, exp, sessionId, sessionStartedAt, answers, resultData, feedbackScores) {
        const types = window.TYPE_MAPPING_V3 || {};
        const sexInfo = (window.SEX_QUADRANTS_V3 || {})[resultData.sex && resultData.sex.label] || null;

        // 三期完整描述
        const phaseDetails = {};
        for (const p of [1, 2, 3]) {
            const code = resultData.phase_codes[p];
            const typeInfo = types[code];
            if (typeInfo) {
                const phaseKey = ['ambiguity', 'love', 'breakup'][p - 1];
                phaseDetails[p] = {
                    code:     code,
                    code_full: typeInfo.code,   // 含中文軸標：「A-F-O-H_主動-快-外放-佔有」
                    name:     typeInfo.name,
                    short:    typeInfo.short,
                    desc:     typeInfo[phaseKey] ? typeInfo[phaseKey].desc : '',
                    roleplay: typeInfo.roleplay ? typeInfo.roleplay.desc : ''
                };
            }
        }

        // 性象限資訊（含完整描述）
        const sexDetail = {
            displayable: resultData.sex ? resultData.sex.displayable : false,
            label:       resultData.sex ? resultData.sex.label : null,
            emotion:     resultData.sex ? resultData.sex.emotion : null,
            openness:    resultData.sex ? resultData.sex.openness : null,
            tagline:     sexInfo ? sexInfo.tagline : '',
            desc:        sexInfo ? sexInfo.desc : ''
        };

        const record = {
            meta: {
                schema_version: 3,
                session_id: sessionId,
                started_at: sessionStartedAt,
                finished_at: new Date().toISOString(),
                alias: alias || null,
                age_range: ageRange,
                relationship_experience: exp,
                total_questions: answers.length,
                feedback_scores: feedbackScores || {},
                engine_version: 'v3'
            },
            answers: answers.slice().sort((a, b) => (a.id || '').localeCompare(b.id || '')),
            scores: {
                phase_codes:  resultData.phase_codes,
                phase_types:  resultData.phase_types,
                axis_scores:  resultData.axis_scores,
                sex:          resultData.sex,
                radar_data:   resultData.radar_data,
                triple_code:  `${resultData.phase_codes[1]}_${resultData.phase_codes[2]}_${resultData.phase_codes[3]}`,
                triple_name:  `${resultData.phase_types[1]}・${resultData.phase_types[2]}・${resultData.phase_types[3]}`
            },
            phase_details: phaseDetails,
            sex_detail:    sexDetail,
            markdown_summary: ''   // 由下方 generateV3Markdown 填入
        };

        record.markdown_summary = window.generateV3Markdown(record);
        return record;
    };


    /**
     * 產生 markdown 格式的角色描述
     * 輸入：record（lpas_record_json 結構）
     */
    window.generateV3Markdown = function (record) {
        const details = record.phase_details || {};
        const sex     = record.sex_detail || {};
        const meta    = record.meta || {};
        const scores  = record.scores || {};
        const axis    = scores.axis_scores || {};

        let md = '';

        // 標題
        md += `# 角色卡：${meta.alias || '匿名'}\n\n`;

        // 基本資料
        md += `## 基本資料\n`;
        md += `- **暱稱**：${meta.alias || '—'}\n`;
        md += `- **年齡區間**：${meta.age_range || '—'}\n`;
        md += `- **感情經驗**：${meta.relationship_experience === 'yes' ? '有' : '尚無'}\n`;
        md += `- **LPAS 版本**：v3 (16 天候型 × 4 性象限)\n\n`;

        // 三聯人格
        md += `## 戀愛三聯人格\n`;
        const phaseNames = { 1: '曖昧期', 2: '熱戀期', 3: '失戀期' };
        for (const p of [1, 2, 3]) {
            const d = details[p];
            if (d) {
                md += `- **${phaseNames[p]}**：${d.code} ${d.name}　《${d.short}》\n`;
            }
        }
        if (sex.label && sex.displayable) {
            md += `- **性象限**：${sex.label}　《${sex.tagline}》\n`;
        }
        md += '\n';

        // 三階段詳細
        md += `## 三階段樣貌\n\n`;
        for (const p of [1, 2, 3]) {
            const d = details[p];
            if (!d) continue;
            md += `### Chapter ${p} · ${phaseNames[p]}：${d.name}\n`;
            md += `> 《${d.short}》\n\n`;
            md += `${d.desc}\n\n`;
            md += `**角色扮演指引**：${d.roleplay}\n\n`;
        }

        // 性象限
        if (sex.label && sex.displayable) {
            md += `### Bonus · 性象限：${sex.label}\n`;
            md += `> 《${sex.tagline}》\n\n`;
            md += `${sex.desc}\n\n`;
        }

        // 軸向強度
        md += `## 軸向強度（1–7）\n\n`;
        md += `| 軸 | 曖昧期 | 熱戀期 | 失戀期 |\n`;
        md += `|---|---:|---:|---:|\n`;
        const axisNames = {
            initiative: '主動/被動',
            pace:       '快/慢',
            expression: '外放/內斂',
            possess:    '佔有/自由'
        };
        for (const a in axisNames) {
            const v1 = axis.phase_1 ? axis.phase_1[a] : null;
            const v2 = axis.phase_2 ? axis.phase_2[a] : null;
            const v3v= axis.phase_3 ? axis.phase_3[a] : null;
            md += `| ${axisNames[a]} | ${v1 != null ? v1.toFixed(1) : '—'} | ${v2 != null ? v2.toFixed(1) : '—'} | ${v3v != null ? v3v.toFixed(1) : '—'} |\n`;
        }
        md += '\n';

        // AI 寫作參考
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

        return md;
    };

})();
