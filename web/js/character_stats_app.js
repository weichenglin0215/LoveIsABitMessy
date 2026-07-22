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
/* 上面這行是給 ESLint 看的宣告：告訴檢查工具這些變數是「全域變數」，
   它們定義在別的 .js 檔（例如常數設定檔），本檔案只是引用，不需要另外宣告。 */

(function () {
    // 使用 IIFE（立即執行函式）把整個檔案包起來，避免這裡宣告的變數/函式
    // 污染到全域（window）名稱空間，造成與其他 .js 檔案的變數衝突。
    'use strict';
    // 開啟嚴格模式：禁止一些容易出錯的寫法（例如未宣告就使用變數），有助於提早抓到錯誤。

    // 內部資料快取（模組級變數，只有這個 IIFE 內的函式看得到）
    let charsCache = [];          // characters 資料表的全部資料（角色卡列表）
    let lpasResultsCache = [];    // lpas_results 資料表的全部資料（LPAS 測驗結果與評分）
    let dataLoaded = false;       // 是否已經成功載入過一次雲端資料，避免每次開視窗都重新抓取

    // ===== DOM 工具 =====
    // 依 id 取得畫面上的 DOM 元素，等同 document.getElementById 的簡寫，方便後面大量呼叫。
    function $(id) { return document.getElementById(id); }

    // 取得 Supabase client（與 characters_editor_app.js 共用同一個連線物件）
    // Supabase 是本專案用來存取雲端資料庫（角色卡、LPAS 結果等）的服務。
    function getSb() {
        if (window.SupabaseClient && window.SupabaseClient.getClient) {
            return window.SupabaseClient.getClient();
        }
        // 若尚未初始化，回傳 null，呼叫端需自行處理「無法連線」的情況。
        return null;
    }

    // ===== 解析輔助 =====
    /**
     * 將 card_json 欄位統一轉成 JavaScript 物件。
     * 資料庫存的 card_json 有時是 JSON 字串、有時已經是物件，這個函式負責「歸一化」，
     * 讓後面的程式碼不用每次都判斷型別。
     * @param {string|object|null} card 原始 card_json 值
     * @returns {object} 轉換後的物件；若輸入為空或解析失敗，回傳空物件 {}
     */
    function parseCard(card) {
        if (!card) return {};
        if (typeof card === 'string') {
            // 字串型態需要用 JSON.parse 轉成物件；若格式不合法（例如空字串、壞掉的 JSON）
            // 則捕捉例外並回傳空物件，避免整個程式因為單一筆壞資料而崩潰。
            try { return JSON.parse(card); } catch { return {}; }
        }
        // 已經是物件的情況，直接原樣回傳。
        return card;
    }

    /**
     * 從 lpas 字串或 personality_type 抽出三期代碼
     * 格式範例：AOCF_AOCS_POCF-煙火_太陽_流星
     * 回傳：{ t1: 'AOCF', t2: 'AOCS', t3: 'POCF' }
     */
    function parseLpasCodes(lpasStr) {
        if (!lpasStr) return { t1: '', t2: '', t3: '' };
        // 字串格式為「代碼部分-中文名稱部分」，用 '-' 分割後只取代碼部分（索引 0）。
        const rawCodes = lpasStr.split('-')[0];
        if (rawCodes.includes('_')) {
            // 含底線代表已經是「曖昧期_熱戀期_失戀期」三段式代碼，例如 AOCF_AOCS_POCF
            const parts = rawCodes.split('_');
            if (parts.length >= 3 && parts[0].length === 4) {
                return { t1: parts[0], t2: parts[1], t3: parts[2] };
            }
        }
        // 單一代碼 (例: AOCF) 視為三期相同（代表這筆資料沒有分期記錄，三期都用同一個代碼）
        if (rawCodes.length === 4) {
            return { t1: rawCodes, t2: rawCodes, t3: rawCodes };
        }
        // 格式不符合預期時，回傳三個空字串，讓呼叫端可以安全地判斷「無資料」。
        return { t1: '', t2: '', t3: '' };
    }

    /** 將 LPAS 4字代碼轉為中文型名稱，例如 AOCF -> 煙火型
     * TYPE_MAPPING_SHORT 這個全域字典的 key 格式是用 '-' 分隔每個字母（例如 "A-O-C-F"），
     * 所以要先把 4 個字元拆開再用 '-' 重新組合，才能對照到正確的中文名稱。
     */
    function codeToTypeName(code) {
        if (!code || code.length !== 4) return code || '';
        const key = code.split('').join('-'); // 例："AOCF" -> "A-O-C-F"
        const m = (window.TYPE_MAPPING_SHORT || {})[key];
        return m ? m.name : code; // 對照不到就直接顯示原代碼，避免畫面出現 undefined
    }

    /** 格式化日期 YYYY-MM-DD -> YYYYMMDD（去掉 ISO 時間部分與橫線，方便當作標籤後綴） */
    function fmtDate(iso) {
        if (!iso) return '';
        return iso.split('T')[0].replace(/-/g, '');
    }

    /**
     * 取得角色卡在列表中顯示用的文字標籤（label）。
     * 組合規則：姓名-LPAS三期代碼-LPAS三期中文名稱-更新日期
     * 例如：「小美-AOCF_AOCS_POCF-煙火_太陽_流星-20260101」
     * @param {object} row 角色卡資料列（來自 characters 或轉接後的 lpas_results）
     * @returns {string} 組合後的顯示字串
     */
    function charLabel(row) {
        const card = parseCard(row.card_json);
        // 優先使用資料列上的 lpas 欄位，若沒有則退而求其次用 card_json 內的 personality_type
        const lpasStr = row.lpas || card.personality_type || '';
        const codes = parseLpasCodes(lpasStr);
        // 三期代碼皆存在時才組出代碼字串，否則顯示「無LPAS」
        const codePart = (codes.t1 && codes.t2 && codes.t3)
            ? `${codes.t1}_${codes.t2}_${codes.t3}`
            : '無LPAS';
        // 同樣地，三期代碼都存在時才轉換出中文型名稱字串（並去掉結尾的「型」字，避免顯示太長）
        const namePart = (codes.t1 && codes.t2 && codes.t3)
            ? `${codeToTypeName(codes.t1).replace(/型$/, '')}_${codeToTypeName(codes.t2).replace(/型$/, '')}_${codeToTypeName(codes.t3).replace(/型$/, '')}`
            : '';
        const dateStr = fmtDate(row.updated_at);
        const name = row.name || card.name || '未命名';
        // 若有中文名稱部分就多加一段，否則只顯示 姓名-代碼-日期
        return namePart
            ? `${name}-${codePart}-${namePart}-${dateStr}`
            : `${name}-${codePart}-${dateStr}`;
    }

    // ===== 統計計算 =====
    /**
     * 對 charsCache（所有角色卡）進行各維度的計次統計，並把每筆角色卡分類到對應的桶（bucket）。
     * 統計維度包含：星座、血型、MBTI、以及 LPAS 三期（曖昧期/熱戀期/失戀期）代碼。
     * @returns {object} stats 物件，每個維度是一個 { 代碼: [角色卡陣列] } 的字典
     */
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

        // 逐一走訪每一筆角色卡資料，依各維度的值把該筆資料 push 進對應的桶陣列中。
        charsCache.forEach(row => {
            const card = parseCard(row.card_json);
            const zodiac = card.zodiac || '';
            const blood = card.blood_type || '';
            const mbtiRaw = card.MBTI_type || '';
            // MBTI 取前四字代碼（例如 "INTJ-建築師" 只取 "INTJ"），並統一轉大寫避免大小寫不一致造成分桶錯誤
            const mbti = mbtiRaw ? mbtiRaw.trim().substring(0, 4).toUpperCase() : '';
            const lpasStr = row.lpas || card.personality_type || '';
            const codes = parseLpasCodes(lpasStr);

            // 以下每個 if 區塊都是同一種寫法：
            // 若該維度的桶（stats.xxx[key]）還不存在就先建立空陣列，再把目前這筆角色卡 push 進去。
            if (zodiac) {
                (stats.zodiac[zodiac] = stats.zodiac[zodiac] || []).push(row);
            }
            if (blood) {
                (stats.blood[blood] = stats.blood[blood] || []).push(row);
            }
            if (mbti) {
                (stats.mbti[mbti] = stats.mbti[mbti] || []).push(row);
            }
            // LPAS 三期：曖昧期(t1)/熱戀期(t2)/失戀期(t3) 各自獨立分桶
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
        // 產生一個 { '1': [], '2': [], ..., '5': [] } 的空物件，供三個期別各自使用一份
        const empty = () => ranges.reduce((o, k) => { o[k] = []; return o; }, {});
        const stats = {
            ambiguity: empty(), // 曖昧期分數分桶
            love: empty(),      // 熱戀期分數分桶
            breakup: empty()    // 失戀期分數分桶
        };
        // 把原始分數（可能含小數）轉換成對應的分桶 key（'1'~'5'）
        const bucketOf = (score) => {
            if (score == null || isNaN(score)) return null; // 沒有分數或非數字則不分桶
            // 四捨五入到最近的整數分數，再夾到 1~5（避免超出範圍的極端值）
            const n = Math.round(Number(score));
            if (n <= 1) return '1';
            if (n >= 5) return '5';
            return String(n);
        };

        // 逐一走訪每筆 LPAS 測驗結果，依 feedback_scores 中三個期別各自的分數分桶
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
            // 在 MBTI_TYPES（格式如 "INTJ-建築師"）中找出前四字代碼相符的項目
            const found = (window.MBTI_TYPES || []).find(t => t.substring(0, 4).toUpperCase() === k.toUpperCase());
            if (found) {
                const parts = found.split('-');
                if (parts.length >= 2) return `${parts[0]} ${parts.slice(1).join('-')}`;
            }
            // 找不到對照資料時，直接顯示原始代碼
            return k;
        }
        if (dictKey === 'lpas1' || dictKey === 'lpas2' || dictKey === 'lpas3') {
            // LPAS 三期共用同一套代碼轉中文名稱的邏輯
            if (k.length === 4) {
                const cnName = codeToTypeName(k).replace(/型$/, '');
                if (cnName && cnName !== k) return `${k} ${cnName}`;
            }
            return k;
        }
        // 其它維度（星座、血型等）不需要額外轉換，直接回傳原值
        return k;
    }

    // ===== Tableau 10 經典顏色（每個大項目一色） =====
    // A~I 對應畫面上九個統計大項目（星座/血型/MBTI/LPAS三期/評價分數三期），
    // 每個字母固定一種顏色，讓使用者用顏色就能快速分辨是哪個分類。
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
     * @param {string} containerId 要渲染進去的 DOM 容器 id
     * @param {string} sectionLetter 區塊代號（A~I），用來查對應顏色
     * @param {string} title 大項目標題文字，例如「A. 星座出現次數」
     * @param {string} dictKey 對應 statsDict 的維度 key（如 'zodiac'、'mbti'）
     * @param {object} statsDict buildCharStats() 產生的某一維度分桶結果 { key: [角色卡陣列] }
     * @param {string[]} [orderedKeys] 想要固定顯示順序的 key 列表（例如星座固定 12 星座順序）
     */
    function renderCharSection(containerId, sectionLetter, title, dictKey, statsDict, orderedKeys) {
        const box = $(containerId);
        if (!box) return;
        const color = TABLEAU_COLORS[sectionLetter] || '#888';

        // 排序：先依指定順序（orderedKeys）排列，statsDict 中若還有未列在指定順序內的 key（例如資料庫出現了非預期值），
        // 則附加在後面，確保所有資料都有機會顯示，不會被遺漏。
        const keys = (orderedKeys || []).slice();
        Object.keys(statsDict).forEach(k => { if (!keys.includes(k)) keys.push(k); });

        // 找出各細項中數量最多的一項，作為橫條圖 100% 寬度的基準值（其餘依比例縮放）
        let maxCount = 0;
        keys.forEach(k => { maxCount = Math.max(maxCount, (statsDict[k] || []).length); });
        if (maxCount === 0) maxCount = 1; // 避免除以 0

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

    /**
     * 渲染分數統計區塊（含橫條圖），用於畫面上 G/H/I 三個「評價分數」區塊。
     * @param {string} containerId 目標容器 id
     * @param {string} sectionLetter 區塊代號（G/H/I），決定顏色
     * @param {string} title 標題文字
     * @param {string} phaseKey 對應 scoreStats 的期別 key（ambiguity/love/breakup）
     * @param {object} scoreStats buildScoreStats() 產生的分數分桶結果
     */
    function renderScoreSection(containerId, sectionLetter, title, phaseKey, scoreStats) {
        const box = $(containerId);
        if (!box) return;
        const color = TABLEAU_COLORS[sectionLetter] || '#888';
        const ranges = ['1', '2', '3', '4', '5'];

        // 計算五個分數桶中數量最多者，作為橫條圖的比例基準
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

    /**
     * 將所有統計區塊（A~I）渲染到統計 modal 視窗中。
     * 每次開啟視窗或按下「更新」按鈕時都會呼叫，重新計算並重繪畫面。
     */
    function renderAll() {
        const charStats = buildCharStats();
        const scoreStats = buildScoreStats();

        // 取得 LPAS 代碼的固定顯示順序（依 TYPE_MAPPING_SHORT 字典的 key 順序，去掉 '-' 符號）
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

    /** 開啟角色卡內容彈窗，顯示該筆角色卡完整的 JSON 內容（唯讀文字框） */
    function openCharCardView(row) {
        const card = parseCard(row.card_json);
        const name = row.name || card.name || '未命名';
        $('char-card-view-title').textContent = `角色卡內容 - ${name}`;
        // 用 JSON.stringify 的第三參數 2 做縮排排版，讓 JSON 內容易於閱讀
        $('char-card-view-textarea').value = JSON.stringify(card, null, 2);
        $('modal-char-card-view').classList.remove('hidden');
    }

    // ===== 資料載入 =====
    /**
     * 從 Supabase 雲端資料庫載入所有需要的資料，存進模組級快取變數
     * （charsCache / lpasResultsCache），供後續統計與畫面渲染使用。
     * @returns {Promise<boolean>} 是否載入成功
     */
    async function loadAllData() {
        const sb = getSb();
        if (!sb) {
            alert('Supabase 尚未初始化，無法載入資料');
            return false;
        }
        try {
            // 角色卡：依最後更新時間新到舊排序，最多抓 2000 筆
            const charsResp = await sb.from('characters')
                .select('id, name, lpas, card_json, updated_at')
                .order('updated_at', { ascending: false })
                .limit(2000);
            if (charsResp.error) throw charsResp.error;
            charsCache = charsResp.data || [];

            // LPAS 結果：依建立時間新到舊排序，最多抓 5000 筆
            const resResp = await sb.from('lpas_results')
                .select('id, type_code, type_name, feedback_scores, character_card, created_at')
                .order('created_at', { ascending: false })
                .limit(5000);
            if (resResp.error) throw resResp.error;
            lpasResultsCache = resResp.data || [];

            dataLoaded = true;
            return true;
        } catch (e) {
            // 捕捉任何連線或查詢錯誤，用 alert 通知使用者，並回傳 false 讓呼叫端不要繼續渲染
            alert('資料載入失敗：' + (e.message || e));
            return false;
        }
    }

    // ===== HTML escape =====
    /**
     * 將字串中會被瀏覽器當作 HTML 標籤解析的特殊字元轉成對應的 HTML 實體，
     * 避免把使用者輸入或資料庫內容直接塞進 innerHTML 時發生 XSS（跨站腳本攻擊）
     * 或畫面跑版的問題。
     */
    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[c]));
    }

    // ===== 事件綁定 =====
    /**
     * 初始化畫面上的按鈕事件綁定。頁面載入完成後只會呼叫一次。
     * 綁定的按鈕包括：開啟統計視窗、關閉統計視窗、更新資料、關閉角色卡內容視窗。
     */
    function init() {
        const btnOpen = $('btn-open-char-stats');
        const btnClose = $('btn-char-stats-close');
        const btnRefresh = $('btn-char-stats-refresh');
        const btnCardClose = $('btn-char-card-view-close');

        if (btnOpen) {
            // 點擊「開啟角色卡統計」按鈕：顯示 modal，並視情況載入資料
            btnOpen.addEventListener('click', async () => {
                $('modal-char-stats').classList.remove('hidden');
                if (!dataLoaded) {
                    // 第一次開啟才需要向雲端抓資料，之後重複開啟直接沿用快取，加快開啟速度
                    const ok = await loadAllData();
                    if (ok) renderAll();
                } else {
                    renderAll();
                }
            });
        }
        if (btnClose) {
            // 點擊關閉按鈕：只是把 modal 隱藏，不清空快取資料
            btnClose.addEventListener('click', () => {
                $('modal-char-stats').classList.add('hidden');
            });
        }
        if (btnRefresh) {
            // 點擊「更新雲端角色卡資料」按鈕：強制重新從雲端抓取最新資料並重繪畫面
            btnRefresh.addEventListener('click', async () => {
                btnRefresh.disabled = true; // 更新期間先停用按鈕，避免重複點擊
                btnRefresh.textContent = '⏳ 更新中…';
                const ok = await loadAllData();
                if (ok) renderAll();
                btnRefresh.disabled = false;
                btnRefresh.textContent = '🔄 更新雲端角色卡資料';
            });
        }
        if (btnCardClose) {
            // 關閉「角色卡內容」彈窗
            btnCardClose.addEventListener('click', () => {
                $('modal-char-card-view').classList.add('hidden');
            });
        }
    }

    // 程式進入點：若 DOM 尚未載入完成則等待 DOMContentLoaded 事件再初始化，
    // 若此腳本是在 DOM 已經載入完成後才被載入（例如動態插入 <script>），則立即執行 init()。
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
