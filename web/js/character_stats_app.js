/**
 * character_stats_app.js — 角色卡類型分析統計
 * 功能：
 *   1. 從 Supabase 抓取 characters 與 lpas_results 資料
 *   2. 統計星座/血型/MBTI/LPAS 三期出現次數
 *   3. 統計 feedback_scores 三期分數分布
 *   4. 點擊統計項目顯示對應角色卡列表
 *   5. 點擊角色卡列表項目顯示 card_json 內容
 */

/* global ZODIAC_SIGNS, BLOOD_TYPES, MBTI_TYPES, TYPE_MAPPING_SHORT */

(function () {
    'use strict';

    // 內部資料快取
    let charsCache = [];          // characters 全部資料
    let lpasResultsCache = [];    // lpas_results 全部資料
    let dataLoaded = false;       // 是否已載入過

    // ===== DOM 工具 =====
    function $(id) { return document.getElementById(id); }

    // 取得 Supabase client（與 characters_editor_app.js 共用）
    function getSb() {
        if (window.SupabaseClient && window.SupabaseClient.getClient) {
            return window.SupabaseClient.getClient();
        }
        return null;
    }

    // ===== 解析輔助 =====
    /** 將 card_json 字串/物件統一轉成物件 */
    function parseCard(card) {
        if (!card) return {};
        if (typeof card === 'string') {
            try { return JSON.parse(card); } catch { return {}; }
        }
        return card;
    }

    /**
     * 從 lpas 字串或 personality_type 抽出三期代碼
     * 格式範例：AOCF_AOCS_POCF-煙火_太陽_流星
     * 回傳：{ t1: 'AOCF', t2: 'AOCS', t3: 'POCF' }
     */
    function parseLpasCodes(lpasStr) {
        if (!lpasStr) return { t1: '', t2: '', t3: '' };
        const rawCodes = lpasStr.split('-')[0];
        if (rawCodes.includes('_')) {
            const parts = rawCodes.split('_');
            if (parts.length >= 3 && parts[0].length === 4) {
                return { t1: parts[0], t2: parts[1], t3: parts[2] };
            }
        }
        // 單一代碼 (例: AOCF) 視為三期相同
        if (rawCodes.length === 4) {
            return { t1: rawCodes, t2: rawCodes, t3: rawCodes };
        }
        return { t1: '', t2: '', t3: '' };
    }

    /** 將 LPAS 4字代碼轉為中文型名稱，例如 AOCF -> 煙火型 */
    function codeToTypeName(code) {
        if (!code || code.length !== 4) return code || '';
        const key = code.split('').join('-');
        const m = (window.TYPE_MAPPING_SHORT || {})[key];
        return m ? m.name : code;
    }

    /** 格式化日期 YYYY-MM-DD -> YYYYMMDD */
    function fmtDate(iso) {
        if (!iso) return '';
        return iso.split('T')[0].replace(/-/g, '');
    }

    /** 取得角色卡顯示用 label：name-LPAS代碼-LPAS中文-日期 */
    function charLabel(row) {
        const card = parseCard(row.card_json);
        const lpasStr = row.lpas || card.personality_type || '';
        const codes = parseLpasCodes(lpasStr);
        const codePart = (codes.t1 && codes.t2 && codes.t3)
            ? `${codes.t1}_${codes.t2}_${codes.t3}`
            : '無LPAS';
        const namePart = (codes.t1 && codes.t2 && codes.t3)
            ? `${codeToTypeName(codes.t1).replace(/型$/, '')}_${codeToTypeName(codes.t2).replace(/型$/, '')}_${codeToTypeName(codes.t3).replace(/型$/, '')}`
            : '';
        const dateStr = fmtDate(row.updated_at);
        const name = row.name || card.name || '未命名';
        return namePart
            ? `${name}-${codePart}-${namePart}-${dateStr}`
            : `${name}-${codePart}-${dateStr}`;
    }

    // ===== 統計計算 =====
    /** 對 characters 進行各維度計次，並分桶角色卡列表 */
    function buildCharStats() {
        // 各維度 bucket：key -> 角色卡陣列
        const stats = {
            zodiac: {},     // A 星座
            blood: {},      // B 血型
            mbti: {},       // C MBTI
            lpas1: {},      // D 曖昧期
            lpas2: {},      // E 熱戀期
            lpas3: {}       // F 失戀期
        };

        charsCache.forEach(row => {
            const card = parseCard(row.card_json);
            const zodiac = card.zodiac || '';
            const blood = card.blood_type || '';
            const mbtiRaw = card.MBTI_type || '';
            // MBTI 取前四字代碼
            const mbti = mbtiRaw ? mbtiRaw.trim().substring(0, 4).toUpperCase() : '';
            const lpasStr = row.lpas || card.personality_type || '';
            const codes = parseLpasCodes(lpasStr);

            if (zodiac) {
                (stats.zodiac[zodiac] = stats.zodiac[zodiac] || []).push(row);
            }
            if (blood) {
                (stats.blood[blood] = stats.blood[blood] || []).push(row);
            }
            if (mbti) {
                (stats.mbti[mbti] = stats.mbti[mbti] || []).push(row);
            }
            if (codes.t1) (stats.lpas1[codes.t1] = stats.lpas1[codes.t1] || []).push(row);
            if (codes.t2) (stats.lpas2[codes.t2] = stats.lpas2[codes.t2] || []).push(row);
            if (codes.t3) (stats.lpas3[codes.t3] = stats.lpas3[codes.t3] || []).push(row);
        });

        return stats;
    }

    /**
     * 對 lpas_results 進行 feedback_scores 三期分桶
     * 區間：0-1, 1-2, 2-3, 3-4, 4-5
     */
    function buildScoreStats() {
        // 與 renderScoreSection 的 ranges 一致：以 1~5 五個整數分數為桶
        const ranges = ['1', '2', '3', '4', '5'];
        const empty = () => ranges.reduce((o, k) => { o[k] = []; return o; }, {});
        const stats = {
            ambiguity: empty(),
            love: empty(),
            breakup: empty()
        };
        const bucketOf = (score) => {
            if (score == null || isNaN(score)) return null;
            // 四捨五入到最近的整數分數，再夾到 1~5
            const n = Math.round(Number(score));
            if (n <= 1) return '1';
            if (n >= 5) return '5';
            return String(n);
        };

        lpasResultsCache.forEach(row => {
            const fb = row.feedback_scores || {};
            ['ambiguity', 'love', 'breakup'].forEach(phase => {
                const b = bucketOf(fb[phase]);
                if (b) stats[phase][b].push(row);
            });
        });
        return stats;
    }

    // ===== 細項顯示標籤輔助 =====
    /**
     * 依大項目類型，把細項 key 轉成「英文 中文」顯示
     * - MBTI: INTJ -> "INTJ 建築師"
     * - LPAS (lpas1/lpas2/lpas3): AOCF -> "AOCF 煙火"
     * - 其它: 原樣回傳
     */
    function formatKeyLabel(dictKey, k) {
        if (!k) return '';
        if (dictKey === 'mbti') {
            const found = (window.MBTI_TYPES || []).find(t => t.substring(0, 4).toUpperCase() === k.toUpperCase());
            if (found) {
                const parts = found.split('-');
                if (parts.length >= 2) return `${parts[0]} ${parts.slice(1).join('-')}`;
            }
            return k;
        }
        if (dictKey === 'lpas1' || dictKey === 'lpas2' || dictKey === 'lpas3') {
            if (k.length === 4) {
                const cnName = codeToTypeName(k).replace(/型$/, '');
                if (cnName && cnName !== k) return `${k} ${cnName}`;
            }
            return k;
        }
        return k;
    }

    // ===== Tableau 10 經典顏色（每個大項目一色） =====
    const TABLEAU_COLORS = {
        A: '#4E79A7', // 藍
        B: '#F28E2B', // 橘
        C: '#E15759', // 紅
        D: '#76B7B2', // 青
        E: '#59A14F', // 綠
        F: '#EDC948', // 黃
        G: '#B07AA1', // 紫
        H: '#FF9DA7', // 粉
        I: '#9C755F'  // 棕
    };

    // ===== 渲染 =====
    /**
     * 渲染統計區塊 (左/中直排) — 含橫條圖
     * 大項目標題整段可點擊，點擊後右欄顯示該大項目所有細項分組的角色卡列表
     */
    function renderCharSection(containerId, sectionLetter, title, dictKey, statsDict, orderedKeys) {
        const box = $(containerId);
        if (!box) return;
        const color = TABLEAU_COLORS[sectionLetter] || '#888';

        // 排序：先依指定順序，剩餘 key 附加
        const keys = (orderedKeys || []).slice();
        Object.keys(statsDict).forEach(k => { if (!keys.includes(k)) keys.push(k); });

        // 找出最大值作為橫條基準
        let maxCount = 0;
        keys.forEach(k => { maxCount = Math.max(maxCount, (statsDict[k] || []).length); });
        if (maxCount === 0) maxCount = 1;

        // 大項目標題：整段可點擊
        let html = `<div class="char-stats-section-header"
            data-section="${dictKey}" data-letter="${sectionLetter}"
            style="cursor:pointer; margin:10px 0 6px; padding:4px 6px; border-left:4px solid ${color};
                   background:#2a2a2a; border-radius:5px; transition:background 0.15s;"
            title="點擊顯示此分類的所有角色卡列表">
            <span style="color:${color}; font-weight:600;">${escapeHtml(title)}</span>
        </div>`;

        // 細項橫條
        html += '<div class="char-stats-bars" style="padding:0 4px;">';
        keys.forEach(k => {
            const list = statsDict[k] || [];
            if (!k) return;
            const cnt = list.length;
            const widthPct = (cnt / maxCount * 100).toFixed(1);
            const label = formatKeyLabel(dictKey, k);
            html += `<div style="display:flex; align-items:center; gap:6px; padding:2px 0; font-size:1.0rem;">
                <div style="width:120px; flex-shrink:0; color:#ccc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
                    title="${escapeHtml(label)}">${escapeHtml(label)}</div>
                <div style="flex:1; background:#1a1a1a; height:14px; border-radius:4px; position:relative;">
                    <div style="width:${widthPct}%; height:100%; background:${color}; border-radius:4px;"></div>
                </div>
                <div style="width:32px; flex-shrink:0; text-align:right; color:#fbb;">${cnt}</div>
            </div>`;
        });
        html += '</div>';
        box.innerHTML = html;

        // 綁定大項目點擊事件
        const header = box.querySelector('.char-stats-section-header');
        if (header) {
            header.addEventListener('click', () => {
                showCharSectionDetail(dictKey, title, keys, color);
            });
            header.addEventListener('mouseover', () => header.style.background = 'hsla(0, 0%, 36%, 1.00)');
            header.addEventListener('mouseout', () => header.style.background = 'hsla(0, 0%, 17%, 1.00)');
        }
    }

    /** 渲染分數統計區塊（含橫條） */
    function renderScoreSection(containerId, sectionLetter, title, phaseKey, scoreStats) {
        const box = $(containerId);
        if (!box) return;
        const color = TABLEAU_COLORS[sectionLetter] || '#888';
        const ranges = ['1', '2', '3', '4', '5'];

        // 計算最大值
        let maxCount = 0;
        ranges.forEach(r => {
            const list = (scoreStats[phaseKey] || {})[r] || [];
            maxCount = Math.max(maxCount, list.length);
        });
        if (maxCount === 0) maxCount = 1;
        //評價分數中標題 G~I
        let html = `<div class="char-stats-section-header"
            data-section="score:${phaseKey}" data-letter="${sectionLetter}"
            style="cursor:pointer; margin:10px 0 6px; padding:4px 6px; border-left:4px solid ${color};
                   background:#2a2a2a; border-radius:5px; transition:background 0.15s;"
            title="點擊顯示此分類的所有分數區間明細">
            <span style="color:${color}; font-weight:600;">${escapeHtml(title)}</span>
        </div>`;

        //評價分數細項
        html += '<div class="char-stats-bars" style="padding:0 4px;">';
        ranges.forEach(r => {
            const list = (scoreStats[phaseKey] || {})[r] || [];
            const cnt = list.length;
            const widthPct = (cnt / maxCount * 100).toFixed(1);
            html += `<div style="display:flex; align-items:center; gap:6px; padding:2px 0; font-size:1.0rem;">
                <div style="width:64px; flex-shrink:0; color:#ccc;">分數 ${r}</div>
                <div style="flex:1; background:#1a1a1a; height:14px; border-radius:4px; position:relative;">
                    <div style="width:${widthPct}%; height:100%; background:${color}; border-radius:4px;"></div>
                </div>
                <div style="width:32px; flex-shrink:0; text-align:right; color:#fbb;">${cnt}</div>
            </div>`;
        });
        html += '</div>';
        box.innerHTML = html;

        const header = box.querySelector('.char-stats-section-header');
        if (header) {
            header.addEventListener('click', () => {
                showScoreSectionDetail(phaseKey, title, ranges, color);
            });
            header.addEventListener('mouseover', () => header.style.background = 'hsla(0, 0%, 36%, 1.00)');
            header.addEventListener('mouseout', () => header.style.background = 'hsla(0, 0%, 17%, 1.00)');
        }
    }

    /**
     * 渲染 D/E/F LPAS 三期合併區塊
     * 共用同一個 label，下方三個子欄（曖昧/熱戀/失戀）橫向並排
     * 每個子欄各自可點擊，點擊後右欄顯示該期的角色卡分組列表
     */
    function renderLpasCombined(containerId, title, charStats, lpasCodeOrder) {
        const box = $(containerId);
        if (!box) return;

        // 三期定義：letter / dictKey / 顏色 / 期別中文
        const periods = [
            { letter: 'D', dictKey: 'lpas1', label: '曖昧期', dict: charStats.lpas1 },
            { letter: 'E', dictKey: 'lpas2', label: '熱戀期', dict: charStats.lpas2 },
            { letter: 'F', dictKey: 'lpas3', label: '失戀期', dict: charStats.lpas3 }
        ];

        // 找出三期合計的最大值，使三個子欄共用同一比例尺
        let maxCount = 0;
        periods.forEach(p => {
            lpasCodeOrder.forEach(k => {
                maxCount = Math.max(maxCount, (p.dict[k] || []).length);
            });
        });
        if (maxCount === 0) maxCount = 1;

        // 共用大 label（不可點，僅作分組標題）
        box.innerHTML = '';
        const header = document.createElement('div');
        header.style.cssText = 'margin:10px 0 6px; padding:4px 6px; background:#2a2a2a; border-radius:3px;';
        header.innerHTML = `<span style="color:#ccc; font-weight:600;">${escapeHtml(title)}</span>
            <span style="color:#888; font-size:1.0rem; margin-left:6px;">（點擊各期標題顯示細節）</span>`;
        box.appendChild(header);

        // 三欄橫排容器
        const row = document.createElement('div');
        row.style.cssText = 'display:flex; gap:36px; padding:0 4px;';
        box.appendChild(row);

        periods.forEach(p => {
            const color = TABLEAU_COLORS[p.letter] || '#888';
            const col = document.createElement('div');
            col.style.cssText = 'flex:1; min-width:0;';

            // 子欄標題（可點擊）
            const subHead = document.createElement('div');
            subHead.style.cssText = `cursor:pointer; padding:3px 6px; margin-bottom:4px;
                border-left:4px solid ${color}; background:#262626; border-radius:6px;
                transition:background 0.15s; font-size:1.4rem;`;
            subHead.innerHTML = `<span style="color:${color}; font-weight:600;">${p.letter}. ${p.label}</span>`;
            subHead.title = `點擊顯示 ${p.label} 所有 LPAS 類型的角色卡列表`;
            subHead.addEventListener('click', () => {
                showCharSectionDetail(p.dictKey, `${p.letter}. LPAS ${p.label}出現次數`, lpasCodeOrder.slice(), color);
            });
            subHead.addEventListener('mouseover', () => subHead.style.background = 'hsla(0, 0%, 36%, 1.00)');
            subHead.addEventListener('mouseout', () => subHead.style.background = 'hsla(0, 0%, 17%, 1.00)');
            col.appendChild(subHead);

            // 細項橫條
            lpasCodeOrder.forEach(k => {
                const cnt = (p.dict[k] || []).length;
                const widthPct = (cnt / maxCount * 100).toFixed(1);
                const lineLabel = formatKeyLabel(p.dictKey, k);
                const line = document.createElement('div');
                line.style.cssText = 'display:flex; align-items:center; gap:4px; padding:1px 0; font-size:1.0rem;';
                line.innerHTML = `
                    <div style="width:78px; flex-shrink:0; color:#ccc; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"
                        title="${escapeHtml(lineLabel)}">${escapeHtml(lineLabel)}</div>
                    <div style="flex:1; background:#1a1a1a; height:12px; border-radius:4px;">
                        <div style="width:${widthPct}%; height:100%; background:${color}; border-radius:4px;"></div>
                    </div>
                    <div style="width:24px; flex-shrink:0; text-align:right; color:#fbb;">${cnt}</div>`;
                col.appendChild(line);
            });

            row.appendChild(col);
        });
    }

    /** 將所有統計區塊渲染到 modal */
    function renderAll() {
        const charStats = buildCharStats();
        const scoreStats = buildScoreStats();

        const lpasCodeOrder = Object.keys(window.TYPE_MAPPING_SHORT || {}).map(k => k.replace(/-/g, ''));

        renderCharSection('char-stats-section-A', 'A', 'A. 星座出現次數', 'zodiac',
            charStats.zodiac, window.ZODIAC_SIGNS || []);
        renderCharSection('char-stats-section-B', 'B', 'B. 血型出現次數', 'blood',
            charStats.blood, window.BLOOD_TYPES || []);
        renderCharSection('char-stats-section-C', 'C', 'C. MBTI 出現次數', 'mbti',
            charStats.mbti, (window.MBTI_TYPES || []).map(t => t.substring(0, 4)));
        // D/E/F 三期 LPAS 共用同一 label，橫向三欄並排
        renderLpasCombined('char-stats-section-DEF', 'D/E/F. LPAS 三期出現次數', charStats, lpasCodeOrder);

        renderScoreSection('char-stats-section-G', 'G', 'G. 曖昧期評價分數', 'ambiguity', scoreStats);
        renderScoreSection('char-stats-section-H', 'H', 'H. 熱戀期評價分數', 'love', scoreStats);
        renderScoreSection('char-stats-section-I', 'I', 'I. 失戀期評價分數', 'breakup', scoreStats);

        // 快取以供右欄顯示
        window._charStatsCache = charStats;
        window._scoreStatsCache = scoreStats;
    }

    // ===== 右側細節顯示 =====
    /**
     * 顯示一個大項目的全部細項分組（左直排點擊大項目）
     * 例如點擊 B. 血型 -> 列出 A型/B型/AB型/O型 四組角色卡列表
     */
    function showCharSectionDetail(dictKey, title, keys, color) {
        const stats = window._charStatsCache || {};
        const dict = stats[dictKey] || {};
        $('char-stats-detail-title').innerHTML =
            `<span style="border-left:4px solid ${color}; padding-left:6px;">📋 ${escapeHtml(title)}</span>`;

        const body = $('char-stats-detail-body');
        const groups = keys.filter(k => k && (dict[k] || []).length > 0);

        if (!groups.length) {
            body.innerHTML = '<div style="color:#888;">此分類沒有任何角色卡。</div>';
            return;
        }

        // 用 DOM API 程序化建構，避免 key 含特殊字元時 querySelector 找不到對應 ul
        body.innerHTML = '';
        groups.forEach(k => {
            const list = dict[k] || [];
            const wrap = document.createElement('div');
            wrap.style.cssText = 'margin-bottom:14px;';

            const head = document.createElement('div');
            head.style.cssText = `background:${color}; color:#fff; padding:4px 8px; border-radius:6px; font-weight:600; text-shadow: 0 2px 2px rgba(0,0,0,0.8);margin-bottom:4px;`;
            head.textContent = `${formatKeyLabel(dictKey, k)}（${list.length}）`;
            wrap.appendChild(head);

            const ul = document.createElement('ul');
            ul.style.cssText = 'list-style:none; padding:0; margin:0;';
            list.forEach(row => {
                const li = document.createElement('li');
                li.style.cssText = 'padding:5px 8px; border-bottom:1px solid #333; cursor:pointer; color:#cce; font-size:1.0rem;';
                li.textContent = charLabel(row);
                li.addEventListener('click', () => openCharCardView(row));
                li.addEventListener('mouseover', () => li.style.background = '#333');
                li.addEventListener('mouseout', () => li.style.background = '');
                ul.appendChild(li);
            });
            wrap.appendChild(ul);
            body.appendChild(wrap);
        });
    }

    /**
     * 顯示一個 feedback_scores 大項目的所有分數區間（中直排點擊大項目）
     */
    function showScoreSectionDetail(phaseKey, title, ranges, color) {
        const phaseName = { ambiguity: '曖昧期', love: '熱戀期', breakup: '失戀期' }[phaseKey] || phaseKey;
        const stats = window._scoreStatsCache || {};
        const dict = stats[phaseKey] || {};

        $('char-stats-detail-title').innerHTML =
            `<span style="border-left:4px solid ${color}; padding-left:6px;">📋 ${escapeHtml(title)}</span>`;

        const body = $('char-stats-detail-body');
        const groups = ranges.filter(r => (dict[r] || []).length > 0);

        if (!groups.length) {
            body.innerHTML = '<div style="color:#888;">此分類沒有任何資料。</div>';
            return;
        }

        // 以 DOM API 建構，與左欄列表使用相同的 charLabel 格式並可點擊開啟角色卡內容
        body.innerHTML = '';
        groups.forEach(r => {
            const list = dict[r] || [];
            const wrap = document.createElement('div');
            wrap.style.cssText = 'margin-bottom:14px;';

            const head = document.createElement('div');
            head.style.cssText = `background:${color}; color:#fff; padding:4px 8px; border-radius:3px; font-weight:600; margin-bottom:4px;`;
            head.textContent = `分數 ${r}（${list.length}）`;
            wrap.appendChild(head);

            const ul = document.createElement('ul');
            ul.style.cssText = 'list-style:none; padding:0; margin:0;';

            // 建立 id -> name 對照表（以 characters 資料表為準）
            const charIdToName = {};
            charsCache.forEach(c => { if (c.id != null) charIdToName[String(c.id)] = c.name; });

            list.forEach(row => {
                // 把 lpas_results 列改寫成 charLabel 認得的格式
                const card = parseCard(row.character_card);
                // 以 character_card.id 對照 characters.id 取得最新 name
                // 若找不到對應 id，視為角色卡已被刪除
                const cardId = card.id != null ? String(card.id) : '';
                let resolvedName;
                if (!cardId) {
                    resolvedName = card.name || row.type_name || '未命名';
                } else if (charIdToName[cardId] != null) {
                    resolvedName = charIdToName[cardId];
                } else {
                    resolvedName = '已刪除該角色';
                }
                const adapted = {
                    name: resolvedName,
                    lpas: row.type_code || card.personality_type || '',
                    card_json: card,
                    updated_at: row.created_at
                };
                const li = document.createElement('li');
                li.style.cssText = 'padding:5px 8px; border-bottom:1px solid #333; cursor:pointer; color:#cce; font-size:1.0rem;';
                li.textContent = charLabel(adapted);
                li.addEventListener('click', () => openCharCardView(adapted));
                li.addEventListener('mouseover', () => li.style.background = '#333');
                li.addEventListener('mouseout', () => li.style.background = '');
                ul.appendChild(li);
            });
            wrap.appendChild(ul);
            body.appendChild(wrap);
        });
    }

    /** 保留：舊版單一細項顯示（已不再使用，但保留以免其他地方呼叫） */
    function showScoreDetail(sectionKey, rangeLabel) {
        const phase = sectionKey.split(':')[1];
        const phaseName = { ambiguity: '曖昧期', love: '熱戀期', breakup: '失戀期' }[phase] || phase;
        const stats = window._scoreStatsCache || {};
        const list = (stats[phase] || {})[rangeLabel] || [];

        $('char-stats-detail-title').textContent =
            `📋 ${phaseName} feedback_scores 分數 ${rangeLabel}（${list.length} 筆）`;

        // lpas_results 沒有 card_json，只列出 type_code/type_name/feedback_scores
        const body = $('char-stats-detail-body');
        if (!list.length) {
            body.innerHTML = '<div style="color:#888;">此區間沒有資料。</div>';
            return;
        }
        let html = '<ul style="list-style:none; padding:0; margin:0;">';
        list.forEach(row => {
            const tCode = row.type_code || '';
            const tName = row.type_name || '';
            const fb = row.feedback_scores || {};
            const dateStr = fmtDate(row.created_at);
            const score = fb[phase] != null ? fb[phase] : '-';
            html += `<li style="padding:6px 8px; border-bottom:1px solid #333; color:#cce;">
                ${escapeHtml(tCode)} - ${escapeHtml(tName)} - ${phaseName}分數 ${escapeHtml(String(score))} - ${dateStr}
            </li>`;
        });
        html += '</ul>';
        body.innerHTML = html;
    }

    /** 渲染角色卡列表（可點擊） */
    function renderCharList(list) {
        const body = $('char-stats-detail-body');
        if (!list.length) {
            body.innerHTML = '<div style="color:#888;">此分類沒有角色卡。</div>';
            return;
        }
        let html = '<ul style="list-style:none; padding:0; margin:0;">';
        list.forEach((row, idx) => {
            html += `<li class="char-stats-card-item" data-idx="${idx}"
                style="padding:6px 8px; border-bottom:1px solid #333; cursor:pointer; color:#cce;">
                ${escapeHtml(charLabel(row))}
            </li>`;
        });
        html += '</ul>';
        body.innerHTML = html;

        body.querySelectorAll('.char-stats-card-item').forEach(li => {
            li.addEventListener('click', () => {
                const idx = parseInt(li.getAttribute('data-idx'), 10);
                openCharCardView(list[idx]);
            });
            li.addEventListener('mouseover', () => li.style.background = '#333');
            li.addEventListener('mouseout', () => li.style.background = '');
        });
    }

    /** 開啟角色卡內容彈窗 */
    function openCharCardView(row) {
        const card = parseCard(row.card_json);
        const name = row.name || card.name || '未命名';
        $('char-card-view-title').textContent = `角色卡內容 - ${name}`;
        $('char-card-view-textarea').value = JSON.stringify(card, null, 2);
        $('modal-char-card-view').classList.remove('hidden');
    }

    // ===== 資料載入 =====
    async function loadAllData() {
        const sb = getSb();
        if (!sb) {
            alert('Supabase 尚未初始化，無法載入資料');
            return false;
        }
        try {
            // 角色卡
            const charsResp = await sb.from('characters')
                .select('id, name, lpas, card_json, updated_at')
                .order('updated_at', { ascending: false })
                .limit(2000);
            if (charsResp.error) throw charsResp.error;
            charsCache = charsResp.data || [];

            // LPAS 結果
            const resResp = await sb.from('lpas_results')
                .select('id, type_code, type_name, feedback_scores, character_card, created_at')
                .order('created_at', { ascending: false })
                .limit(5000);
            if (resResp.error) throw resResp.error;
            lpasResultsCache = resResp.data || [];

            dataLoaded = true;
            return true;
        } catch (e) {
            alert('資料載入失敗：' + (e.message || e));
            return false;
        }
    }

    // ===== HTML escape =====
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // ===== 事件綁定 =====
    function init() {
        const btnOpen = $('btn-open-char-stats');
        const btnClose = $('btn-char-stats-close');
        const btnRefresh = $('btn-char-stats-refresh');
        const btnCardClose = $('btn-char-card-view-close');

        if (btnOpen) {
            btnOpen.addEventListener('click', async () => {
                $('modal-char-stats').classList.remove('hidden');
                if (!dataLoaded) {
                    const ok = await loadAllData();
                    if (ok) renderAll();
                } else {
                    renderAll();
                }
            });
        }
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                $('modal-char-stats').classList.add('hidden');
            });
        }
        if (btnRefresh) {
            btnRefresh.addEventListener('click', async () => {
                btnRefresh.disabled = true;
                btnRefresh.textContent = '⏳ 更新中…';
                const ok = await loadAllData();
                if (ok) renderAll();
                btnRefresh.disabled = false;
                btnRefresh.textContent = '🔄 更新雲端角色卡資料';
            });
        }
        if (btnCardClose) {
            btnCardClose.addEventListener('click', () => {
                $('modal-char-card-view').classList.add('hidden');
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
