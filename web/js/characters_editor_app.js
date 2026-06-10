/**
 * characters_editor_app.js — 角色資料編輯器 JS 邏輯
 * 專注於管理角色卡、性格特質與生物資訊
 */

/* global supabase, TYPE_MAPPING, ZODIAC_SIGNS, BLOOD_TYPES, ZODIAC_RANGES, ZODIAC_DESCRIPTIONS, BLOOD_TYPE_DESCRIPTIONS */

let sb = null;
let currentCharacterId = null;

function qs(sel) { return document.querySelector(sel); }

function prettyJson(obj) {
    try {
        return JSON.stringify(obj, null, 2);
    } catch {
        return String(obj);
    }
}

function setStatus(text) {
    const el = qs('#conn-status');
    if (el) el.textContent = text;
}

/** 將 schema cache 錯誤轉成更友善的訊息 */
function friendlyError(msg) {
    if (msg && msg.includes('schema cache')) {
        return '資料表不存在。請先到 Supabase Dashboard → SQL Editor 執行 schema.sql';
    }
    return msg;
}

// ====== Supabase 初始化 ======
async function initSupabase() {
    if (window.SupabaseClient && window.SupabaseClient.init && window.SupabaseClient.init()) {
        sb = window.SupabaseClient.getClient();
        setStatus('✅ 已連線至 Supabase（角色管理模式）');
    } else {
        setStatus('❌ Supabase 連線失敗。請確認 js/supabaseClient.js。');
        return;
    }

    // 載入資料
    await refreshCharacterList();
}

// ====== 角色卡管理 ======
async function refreshCharacterList() {
    const sel = qs('#char-dropdown');
    sel.innerHTML = '<option value="">-- 選擇角色卡 --</option>';

    if (!sb) return;
    const { data, error } = await sb
        .from('characters')
        .select('id, name, lpas, card_json, updated_at')
        .order('updated_at', { ascending: false })
        .limit(500);
    if (error) {
        console.error('characters load error:', error);
        alert('角色卡載入失敗: ' + friendlyError(error.message));
        return;
    }
    (data || []).forEach(row => {
        const opt = document.createElement('option');
        opt.value = row.id;
        const dateStr = row.updated_at ? row.updated_at.split('T')[0].replace(/-/g, '') : '';

        let lpasStr = row.lpas;
        if (!lpasStr && row.card_json) {
            const card = (typeof row.card_json === 'string') ? JSON.parse(row.card_json) : row.card_json;
            lpasStr = card.personality_type;
        }

        if (lpasStr && lpasStr.includes('-')) {
            lpasStr = lpasStr.split('-')[0];
        }

        opt.textContent = `${row.name || '未命名'}-${lpasStr || '無LPAS'}-${dateStr}`;
        sel.appendChild(opt);
    });
}

function initDropdownOptions() {
    // Populate Zodiac signs
    const zodiacSel = qs('#char-zodiac');
    if (zodiacSel && window.ZODIAC_SIGNS) {
        zodiacSel.innerHTML = '<option value="">-- 選擇星座 --</option>';
        window.ZODIAC_SIGNS.forEach(z => {
            const opt = document.createElement('option');
            opt.value = z;
            opt.textContent = z;
            zodiacSel.appendChild(opt);
        });
    }

    // Populate Blood types
    const bloodSel = qs('#char-blood-type');
    if (bloodSel && window.BLOOD_TYPES) {
        bloodSel.innerHTML = '<option value="">-- 選擇血型 --</option>';
        window.BLOOD_TYPES.forEach(b => {
            const opt = document.createElement('option');
            opt.value = b;
            opt.textContent = b;
            bloodSel.appendChild(opt);
        });
    }

    // Populate MBTI types
    const mbtiSel = qs('#char-mbti');
    if (mbtiSel && window.MBTI_TYPES) {
        mbtiSel.innerHTML = '<option value="">-- 選擇MBTI --</option>';
        window.MBTI_TYPES.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m;
            opt.textContent = m;
            mbtiSel.appendChild(opt);
        });
    }

    // ── LPAS v3：曖昧期 / 熱戀期 / 失戀期下拉，使用 window.TYPE_MAPPING_V3 ──
    //   key 形如 "A-F-O-H"，info.code 形如 "A-F-O-H_主動-快速-外放-佔有"
    const v3 = window.TYPE_MAPPING_V3;
    const phaseLabels = ["曖昧期", "熱戀期", "失戀期"];
    [1, 2, 3].forEach(p => {
        const sel = qs(`#char-type-${p}`);
        if (!sel) return;
        sel.innerHTML = `<option value="">-- 選擇${phaseLabels[p - 1]}類型 --</option>`;
        if (!v3) return;
        Object.keys(v3).forEach(k => {
            const info = v3[k];
            const opt = document.createElement('option');
            opt.value = k;                                  // value = "A-F-O-H"
            opt.textContent = `${info.name} (${k})`;        // 例：「海嘯型 (A-F-O-H)」
            sel.appendChild(opt);
        });
    });

    // ── LPAS v3：親密關係下拉，使用 window.SEX_QUADRANTS_V3 ──
    //   key 即類型名稱（深情專一型 / 鍾情博愛型 / 靈肉分離型 / 遊戲人間型）
    const sexMap = window.SEX_QUADRANTS_V3;
    const sel4 = qs('#char-type-4');
    if (sel4) {
        sel4.innerHTML = '<option value="">-- 選擇親密關係類型 --</option>';
        if (sexMap) {
            Object.keys(sexMap).forEach(label => {
                const opt = document.createElement('option');
                opt.value = label;
                opt.textContent = label;
                sel4.appendChild(opt);
            });
        }
    }
}

// ====== 屬性連動與顯示邏輯 ======

function updateAgeDisplay() {
    const bDay = qs('#char-birthday').value;
    const lbl = qs('#lbl-birthday');
    if (bDay && window.calculateAge) {
        const age = window.calculateAge(bDay);
        lbl.textContent = `生日 (Birthday) (${age}歲)`;
    } else {
        lbl.textContent = `生日 (Birthday)`;
    }
}

function updateIdPreview() {
    if (currentCharacterId) {
        qs('#char-id').value = currentCharacterId;
    } else {
        qs('#char-id').value = "系統自動生成 (UUID)";
    }
}

/**
 * 從 4 個下拉組裝 LPAS v3 結構化欄位。
 * 任何一格沒選都回傳 null（避免寫入半成品）。
 * 回傳：
 *   {
 *     engine_version: "v3",
 *     ambiguity:   "A-F-O-H",   // 曖昧期 4 字代碼
 *     love:        "A-S-O-H",   // 熱戀期
 *     breakup:     "P-F-I-L",   // 失戀期
 *     intimacy:    "深情專一型", // 親密關係四象限
 *     triple_code: "A-F-O-H_A-S-O-H_P-F-I-L",
 *     triple_name: "海嘯型・太陽型・細雨型",
 *     full_code:   "A-F-O-H_A-S-O-H_P-F-I-L_深情專一型",
 *     full_name:   "海嘯型・太陽型・細雨型・深情專一型"
 *   }
 */
function buildLpasV3() {
    const v3 = window.TYPE_MAPPING_V3 || {};
    const a = qs('#char-type-1').value;
    const l = qs('#char-type-2').value;
    const b = qs('#char-type-3').value;
    const i = qs('#char-type-4').value;
    if (!a || !l || !b || !i) return null;

    const nameOf = (k) => (v3[k] && v3[k].name) ? v3[k].name : '';
    const tripleCode = `${a}_${l}_${b}`;
    const tripleName = `${nameOf(a)}・${nameOf(l)}・${nameOf(b)}`;
    return {
        engine_version: 'v3',
        ambiguity: a,
        love: l,
        breakup: b,
        intimacy: i,
        triple_code: tripleCode,
        triple_name: tripleName,
        full_code: `${tripleCode}_${i}`,
        full_name: `${tripleName}・${i}`
    };
}

/** 從既有 cardJson 還原 4 個下拉的值（僅讀 V3 結構，舊 AOCF 格式不再相容） */
function readLpasV3FromCard(cardJson) {
    const v = cardJson && cardJson.lpas_v3;
    if (!v) return { t1: '', t2: '', t3: '', t4: '' };
    return {
        t1: v.ambiguity || '',
        t2: v.love || '',
        t3: v.breakup || '',
        t4: v.intimacy || ''
    };
}

/** 將 LPAS v3 結構寫入 cardJson；沒選滿 4 格則移除舊欄位以保持一致 */
function writeLpasV3ToCard(cardJson) {
    const lpasV3 = buildLpasV3();
    if (lpasV3) {
        cardJson.lpas_v3 = lpasV3;
        // V3 代碼本身含「-」，所以 personality_type 只放 full_code，full_name 留在 lpas_v3 內
        cardJson.personality_type = lpasV3.full_code;
    } else {
        delete cardJson.lpas_v3;
        delete cardJson.personality_type;
    }
    return lpasV3;
}

function updateExplanations() {
    const zVal = qs('#char-zodiac').value;
    const zd = window.ZODIAC_DESCRIPTIONS;
    if (qs('#desc-zodiac')) qs('#desc-zodiac').value = (zd && zVal) ? zd[zVal] || "" : "";

    const bVal = qs('#char-blood-type').value;
    const bd = window.BLOOD_TYPE_DESCRIPTIONS;
    if (qs('#desc-blood')) qs('#desc-blood').value = (bd && bVal) ? bd[bVal] || "" : "";

    const mVal = qs('#char-mbti').value;
    const md = window.MBTI_DESCRIPTIONS;
    if (qs('#desc-mbti')) qs('#desc-mbti').value = (md && mVal) ? md[mVal] || "" : "";

    // ── LPAS v3 三期說明 ──
    const v3 = window.TYPE_MAPPING_V3 || {};
    const phaseKeys = ['ambiguity', 'love', 'breakup'];
    [1, 2, 3].forEach(p => {
        const code = qs(`#char-type-${p}`).value;
        const descEl = qs(`#desc-type-${p}`);
        if (!descEl) return;
        if (!code) { descEl.value = ''; return; }
        const info = v3[code];
        if (!info) { descEl.value = '未知類型'; return; }
        const phase = info[phaseKeys[p - 1]] || {};
        descEl.value =
            `${info.name}（${info.code || code}）\n` +
            `${info.short || ''}\n\n` +
            `${phase.desc || info.desc || ''}`;
    });

    // ── LPAS v3 親密關係說明 ──
    const sexMap = window.SEX_QUADRANTS_V3 || {};
    const code4 = qs('#char-type-4').value;
    const descEl4 = qs('#desc-type-4');
    if (descEl4) {
        if (!code4) {
            descEl4.value = '';
        } else {
            const sinfo = sexMap[code4];
            if (sinfo) {
                descEl4.value =
                    `${code4}\n` +
                    `${sinfo.tagline || ''}\n\n` +
                    `${sinfo.desc || ''}`;
            } else {
                descEl4.value = '未知類型';
            }
        }
    }
}

async function loadCharacter(charId) {
    if (!charId || !sb) {
        cancelCharacterEdit();
        return;
    }
    const { data, error } = await sb
        .from('characters')
        .select('*')
        .eq('id', charId)
        .single();
    if (error) {
        alert('載入角色卡失敗: ' + friendlyError(error.message));
        return;
    }
    currentCharacterId = charId;
    qs('#char-id').value = data.id || '';
    qs('#char-name').value = data.name || '';

    currentCharacterId = data.id;
    const cardJson = data.card_json || {};
    qs('#char-card-json').value = prettyJson(cardJson);

    qs('#char-birthday').value = normalizeBirthday(cardJson.birthday) || '1999-01-01';
    qs('#char-gender').value = cardJson.gender || '女';
    qs('#char-zodiac').value = cardJson.zodiac || '';
    qs('#char-blood-type').value = cardJson.blood_type || '';
    // 只比對前 4 個字元，避免欄位有附加描述文字時匹配失敗
    {
        const mbtiRaw = cardJson.MBTI_type || '';
        const mbtiCode = mbtiRaw.trim().substring(0, 4).toUpperCase();
        const mbtiSel = qs('#char-mbti');
        if (mbtiSel && mbtiCode) {
            const matched = Array.from(mbtiSel.options)
                .find(o => o.value.trim().substring(0, 4).toUpperCase() === mbtiCode);
            mbtiSel.value = matched ? matched.value : '';
        } else if (mbtiSel) {
            mbtiSel.value = '';
        }
    }
    qs('#char-height').value = cardJson.height || '165';
    qs('#char-weight').value = cardJson.weight || '55';
    qs('#char-bust').value = cardJson.bust || 'C';

    // ── LPAS v3：直接讀 cardJson.lpas_v3；舊 AOCF 格式不再相容（V3 軸與 V1 不同） ──
    const { t1, t2, t3, t4 } = readLpasV3FromCard(cardJson);
    qs('#char-type-1').value = t1;
    qs('#char-type-2').value = t2;
    qs('#char-type-3').value = t3;
    qs('#char-type-4').value = t4;

    updateExplanations();
    updateAgeDisplay();
    updateButtonStates();
    // 確保 JSON 預覽也同步更新
    updateJsonFromDropdowns();
}

async function saveCharacter() {
    if (!sb) { alert('Supabase 尚未初始化'); return; }

    const id = qs('#char-id').value.trim();
    const name = qs('#char-name').value.trim();
    const cardJsonStr = qs('#char-card-json').value.trim();

    if (!id) { alert('角色 ID 不能為空'); return; }

    let cardJson;
    try {
        cardJson = cardJsonStr ? JSON.parse(cardJsonStr) : window.createDefaultCharacter();
    } catch {
        alert('JSON 格式錯誤，請檢查符號');
        return;
    }

    // 將下拉選單與 Input 的值同步回 cardJson
    cardJson.id = currentCharacterId;
    cardJson.name = name || '未命名';
    cardJson.gender = qs('#char-gender').value || "女";
    cardJson.zodiac = qs('#char-zodiac').value || "";
    cardJson.blood_type = qs('#char-blood-type').value || "";
    cardJson.MBTI_type = qs('#char-mbti').value || "";
    cardJson.birthday = qs('#char-birthday').value || "1999-01-01";
    cardJson.height = qs('#char-height').value || "165";
    cardJson.weight = qs('#char-weight').value || "55";
    cardJson.bust = qs('#char-bust').value || "C";

    // 清除舊有的不必要欄位以精簡結構
    delete cardJson.age;
    delete cardJson.zodiac_description;
    delete cardJson.blood_type_description;
    delete cardJson.personality;

    // 將 LPAS v3 四個下拉組裝寫入 cardJson.lpas_v3 + personality_type
    writeLpasV3ToCard(cardJson);

    const payload = {
        id: currentCharacterId,
        name: cardJson.name,
        lpas: cardJson.personality_type || "",
        card_json: cardJson,
        updated_at: new Date().toISOString()
    };

    const { error } = await sb
        .from('characters')
        .upsert(payload);

    if (error) {
        alert('儲存失敗: ' + error.message);
    } else {
        alert('儲存成功！');
        await refreshCharacterList();
        qs('#char-dropdown').value = id;
        // 重新整理頁面上的 JSON 顯示
        qs('#char-card-json').value = prettyJson(cardJson);
    }
}

async function saveAsNewCharacter() {
    if (!sb) return;

    const name = qs('#char-name').value.trim();
    if (!name) {
        alert('請輸入姓名');
        return;
    }

    const jsonStr = qs('#char-card-json').value.trim();
    let cardJson;
    try {
        cardJson = jsonStr ? JSON.parse(jsonStr) : window.createDefaultCharacter();
    } catch (e) {
        alert('JSON 格式錯誤，無法儲存。');
        return;
    }

    // 同步 UI 數據到 cardJson (包含身高體重等新欄位)
    cardJson.name = name;
    cardJson.gender = qs('#char-gender').value || "女";
    cardJson.zodiac = qs('#char-zodiac').value;
    cardJson.blood_type = qs('#char-blood-type').value;
    cardJson.MBTI_type = qs('#char-mbti').value || "";
    cardJson.birthday = qs('#char-birthday').value;
    cardJson.height = qs('#char-height').value || "165";
    cardJson.weight = qs('#char-weight').value || "55";
    cardJson.bust = qs('#char-bust').value || "C";

    // 將 LPAS v3 四個下拉組裝寫入 cardJson
    writeLpasV3ToCard(cardJson);

    const payload = {
        name: name,
        lpas: cardJson.personality_type || "",
        card_json: cardJson,
        updated_at: new Date().toISOString()
    };

    const { data, error } = await sb
        .from('characters')
        .insert(payload)
        .select();

    if (error) {
        alert('儲存新角色失敗: ' + error.message);
    } else {
        const generatedId = data[0].id;
        alert('成功儲存新角色！\nID: ' + generatedId);
        currentCharacterId = generatedId;
        qs('#char-id').value = generatedId;
        await refreshCharacterList();
        qs('#char-dropdown').value = generatedId;
    }
}

function cancelCharacterEdit() {
    currentCharacterId = null;
    qs('#char-id').value = '';
    qs('#char-name').value = '';
    qs('#char-card-json').value = '';
    qs('#char-birthday').value = '1999-01-01';
    qs('#char-gender').value = '女';
    qs('#char-zodiac').value = '';
    qs('#char-blood-type').value = '';
    qs('#char-mbti').value = '';
    qs('#char-type-1').value = '';
    qs('#char-type-2').value = '';
    qs('#char-type-3').value = '';
    qs('#char-type-4').value = '';
    updateExplanations();
    updateAgeDisplay();
    updateButtonStates();
}

function updateButtonStates() {
    const isEditing = !!currentCharacterId;
    const btnSave = qs('#btn-char-save');
    if (btnSave) {
        btnSave.disabled = !isEditing;
        btnSave.style.opacity = isEditing ? "1" : "0.5";
        btnSave.style.cursor = isEditing ? "pointer" : "not-allowed";
    }
}

function updateJsonFromDropdowns() {
    // 這裡只是預視，實質儲存在 saveCharacter 執行
    const jsonStr = qs('#char-card-json').value.trim();
    try {
        let cardJson = jsonStr ? JSON.parse(jsonStr) : window.createDefaultCharacter();
        cardJson.gender = qs('#char-gender').value;
        cardJson.zodiac = qs('#char-zodiac').value;
        cardJson.blood_type = qs('#char-blood-type').value;
        cardJson.MBTI_type = qs('#char-mbti').value || "";
        cardJson.birthday = normalizeBirthday(qs('#char-birthday').value) || qs('#char-birthday').value;
        cardJson.name = qs('#char-name').value;
        cardJson.height = qs('#char-height').value || "165";
        cardJson.weight = qs('#char-weight').value || "55";
        cardJson.bust = qs('#char-bust').value || "C";

        // LPAS v3 四下拉 → cardJson.lpas_v3 + personality_type
        writeLpasV3ToCard(cardJson);

        // 更新顯示
        qs('#char-card-json').value = prettyJson(cardJson);
        updateButtonStates();
    } catch (e) { }
}

// ====== 伺服器狀態偵測 ======

let serverOnline = false;
let lastModelFetchTime = 0;
let pollInterval = null;

async function fetchOllamaModels() {
    try {
        const res = await fetch('http://localhost:8081/api/models');
        const container = document.getElementById('model-container');
        if (res.ok) {
            const models = await res.json();
            const select = document.getElementById('model-select');
            const current = select.value;
            select.innerHTML = '';
            models.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = m;
                if (m === current || m === 'gemma4') opt.selected = true;
                select.appendChild(opt);
            });
            if (container) { container.style.opacity = '1'; container.style.pointerEvents = 'auto'; }
        } else {
            if (container) { container.style.opacity = '0.5'; container.style.pointerEvents = 'none'; }
        }
    } catch (e) { console.error('Failed to fetch models', e); }
}

async function checkServerStatus() {
    const serverDot = document.getElementById('server-dot');
    const serverStatusText = document.getElementById('server-status-text');
    const startServerBtn = document.getElementById('start-server-btn');
    const modelContainer = document.getElementById('model-container');
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch('http://localhost:8081/api/status', { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
            const now = Date.now();
            if (!serverOnline) {
                fetchOllamaModels();
                lastModelFetchTime = now;
            } else {
                const modelSelect = document.getElementById('model-select');
                const isInactive = modelContainer && modelContainer.style.opacity === '0.5';
                const hasNoModels = modelSelect && modelSelect.options.length <= 1;
                if ((isInactive || hasNoModels) && (now - lastModelFetchTime > 30000)) {
                    fetchOllamaModels();
                    lastModelFetchTime = now;
                }
            }
            serverOnline = true;
            serverDot.className = 'server-status-dot online';
            serverDot.classList.add('flash');
            setTimeout(() => serverDot.classList.remove('flash'), 500);
            serverStatusText.textContent = '✅ debug_server.py 運行中';
            startServerBtn.disabled = true;
            return true;
        }
    } catch (e) { /* offline */ }
    serverOnline = false;
    serverDot.className = 'server-status-dot offline';
    serverStatusText.textContent = '❌ debug_server.py 未啟動';
    startServerBtn.disabled = false;
    if (modelContainer) { modelContainer.style.opacity = '0.5'; modelContainer.style.pointerEvents = 'none'; }
    return false;
}

function startServerPolling() {
    if (pollInterval) return;
    pollInterval = setInterval(checkServerStatus, 5000);
    checkServerStatus();
}

// ====== Editor LOG 功能 ======

function appendEditorLog(text) {
    const logBox = document.getElementById('editor-log-output');
    if (!logBox) return;
    logBox.value += text + '\n';
    logBox.scrollTop = logBox.scrollHeight;
}

window.clearEditorLog = () => {
    const el = document.getElementById('editor-log-output');
    if (el) el.value = '';
};

window.copyEditorLog = () => {
    const el = document.getElementById('editor-log-output');
    if (!el) return;
    navigator.clipboard.writeText(el.value);
    alert('已複製到剪貼簿');
};

window.showEditorLogModal = () => {
    const el = document.getElementById('editor-log-output');
    if (!el) return;
    document.getElementById('editor-log-content').value = el.value.replace(/\\n/g, '\n');
    document.getElementById('modal-editor-log').classList.remove('hidden');
    document.getElementById('editor-log-search-input').value = '';
    document.getElementById('editor-log-search-count').textContent = '';
};

(function initEditorLogSearch() {
    let matches = [], currentMatch = -1;

    function goToMatch(idx) {
        if (!matches.length) return;
        const ta = document.getElementById('editor-log-content');
        const query = document.getElementById('editor-log-search-input').value;
        currentMatch = ((idx % matches.length) + matches.length) % matches.length;
        const start = matches[currentMatch], end = start + query.length;
        // 精確捲動：截斷至比對位置量測 scrollHeight（自動考慮 word-wrap），再還原並置中顯示
        const fullText = ta.value;
        ta.value = fullText.substring(0, start);
        const pixelPos = ta.scrollHeight;
        ta.value = fullText;
        ta.focus();
        ta.setSelectionRange(start, end);
        requestAnimationFrame(() => {
            ta.scrollTop = Math.max(0, pixelPos - ta.clientHeight / 2);
        });
        document.getElementById('editor-log-search-count').textContent = `${currentMatch + 1} / ${matches.length}`;
    }

    function doSearch() {
        const query = document.getElementById('editor-log-search-input').value;
        const ta = document.getElementById('editor-log-content');
        const countEl = document.getElementById('editor-log-search-count');
        matches = []; currentMatch = -1;
        if (!query) { countEl.textContent = ''; ta.focus(); return; }
        const lo = ta.value.toLowerCase(), lq = query.toLowerCase();
        let i = 0;
        while ((i = lo.indexOf(lq, i)) !== -1) { matches.push(i); i += lq.length; }
        matches.length ? goToMatch(0) : (countEl.textContent = '找不到', ta.focus());
    }

    window.addEventListener('DOMContentLoaded', () => {
        const si = document.getElementById('editor-log-search-input');
        if (si) si.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doSearch(); } });
        const pb = document.getElementById('editor-log-search-prev');
        if (pb) pb.addEventListener('click', () => goToMatch(currentMatch - 1));
        const nb = document.getElementById('editor-log-search-next');
        if (nb) nb.addEventListener('click', () => goToMatch(currentMatch + 1));
    });
})();

// ====== AI 分析：輔助函式 ======

async function _apiPost(url, body) {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`伺服器回傳 ${res.status} (${res.statusText})。\n請確認已重新啟動 debug_server.py 後再試。\n${txt.substring(0, 120)}`);
    }
    return res.json();
}

async function _pollAnalysisJob(jobId, onDone, onError) {
    // 使用「無活動超時」機制：只要後端 LOG 持續更新（後端每 5 秒會追加心跳訊息）
    // 就繼續等待；真正超過 300 秒無任何回應時才判定超時。
    // 這可支援 gemma4:31b / qwen3:27b 等需要 600~1000 秒的大型模型。
    const INACTIVITY_MS = 300_000; // 300 秒無新 LOG → 超時
    let lastText        = '';
    let lastActivity    = Date.now();

    while (true) {
        await new Promise(r => setTimeout(r, 1000));

        // 無活動超時檢查
        if (Date.now() - lastActivity > INACTIVITY_MS) {
            onError('等待逾時（300 秒無後端回應）。大模型可能已崩潰，請查看 CMD 視窗。');
            return;
        }

        let jd;
        try {
            const jr = await fetch(`http://localhost:8081/api/job?id=${encodeURIComponent(jobId)}`);
            if (!jr.ok) { onError(`輪詢回傳 ${jr.status}，請確認 debug_server.py 仍在運行。`); return; }
            jd = await jr.json();
        } catch (e) {
            onError(`輪詢錯誤：${e.message}`);
            return;
        }

        // LOG 有新增內容 → 重置計時器
        if (jd.logs && jd.logs !== lastText) {
            const newPart = jd.logs.slice(lastText.length);
            lastText = jd.logs;
            if (newPart.trim()) appendEditorLog(newPart.replace(/\\n/g, '\n').trimEnd());
            lastActivity = Date.now();
        }
        // 同步伺服器端 last_activity（token 剛送到但尚未滿 5 秒心跳閾值時也能重置）
        if (jd.last_activity && jd.last_activity * 1000 > lastActivity) {
            lastActivity = jd.last_activity * 1000;
        }

        if (jd.status === 'done')  { onDone(jd.result); return; }
        if (jd.status === 'error') { onError('AI 任務失敗，請查看上方錯誤訊息。'); return; }
    }
}

function populateFormFromCharData(charData) {
    if (!charData) return;
    qs('#char-card-json').value = prettyJson(charData);
    if (charData.name) qs('#char-name').value = charData.name;
    if (charData.gender) qs('#char-gender').value = charData.gender;
    if (charData.birthday) {
        const bd = normalizeBirthday(charData.birthday);
        if (bd) qs('#char-birthday').value = bd;
    }
    if (charData.height) qs('#char-height').value = charData.height;
    if (charData.weight) qs('#char-weight').value = charData.weight;
    if (charData.bust) qs('#char-bust').value = charData.bust;
    if (charData.zodiac) qs('#char-zodiac').value = charData.zodiac;
    if (charData.blood_type) qs('#char-blood-type').value = charData.blood_type;
    if (charData.MBTI_type) {
        // AI 可能回傳附加文字（如 "INFP型"、"INFP (內向直覺情感知覺型)"），
        // 只取前 4 個字元做不分大小寫比對，找到最接近的選項再套用。
        const mbtiCode = charData.MBTI_type.trim().substring(0, 4).toUpperCase();
        const mbtiSel = qs('#char-mbti');
        if (mbtiSel) {
            const matched = Array.from(mbtiSel.options)
                .find(o => o.value.trim().substring(0, 4).toUpperCase() === mbtiCode);
            if (matched) mbtiSel.value = matched.value;
        }
    }

    // ── 套用 AI 分析後的 LPAS v3 欄位 ──
    //   優先讀 charData.lpas_v3；若 AI 仍只給 personality_type 字串，
    //   嘗試從 "A-F-O-H_A-S-O-H_P-F-I-L_深情專一型-..." 取前 4 段
    if (charData.lpas_v3) {
        const { t1, t2, t3, t4 } = readLpasV3FromCard(charData);
        if (t1) qs('#char-type-1').value = t1;
        if (t2) qs('#char-type-2').value = t2;
        if (t3) qs('#char-type-3').value = t3;
        if (t4) qs('#char-type-4').value = t4;
    } else if (charData.personality_type) {
        // V3 代碼格式：「A-F-O-H_A-S-O-H_P-F-I-L_<sex>」，用「_」拆出 4 段
        const parts = String(charData.personality_type).split('_');
        const isV3Code = (s) => /^[AP]-[FS]-[OI]-[HL]$/.test(s);
        // 兼容直接給完整字串：先把 sex 名稱接回
        // 這裡採保守作法：只在能完全辨識時才填入
        // 三期代碼必須形如 A-F-O-H
        // ⚠ 此 fallback 主要用於 AI 回傳 personality_type 而沒給 lpas_v3 的情況
        // ⚠ AI 若給 V1 AOCF 格式（無連字號）將無法辨識，視為跳過。
        if (parts.length >= 3 && isV3Code(parts[0]) && isV3Code(parts[1]) && isV3Code(parts[2])) {
            qs('#char-type-1').value = parts[0];
            qs('#char-type-2').value = parts[1];
            qs('#char-type-3').value = parts[2];
            const sexNames = ['深情專一型', '鍾情博愛型', '靈肉分離型', '遊戲人間型'];
            const found = sexNames.find(n => String(charData.personality_type).includes(n));
            if (found) qs('#char-type-4').value = found;
        }
    }
    updateExplanations();
    updateAgeDisplay();
    updateButtonStates();
}

function updateImagePromptInJson(imagePrompt) {
    const textarea = qs('#char-card-json');
    let cardJson = {};
    try { cardJson = JSON.parse(textarea.value); } catch { /* 若 JSON 無效就建新物件 */ }
    cardJson.image_prompt = imagePrompt;
    textarea.value = prettyJson(cardJson);
}

// ====== 格式正規化輔助函式 ======

/**
 * 將各種生日格式統一為 input[type="date"] 需要的 YYYY-MM-DD（月日補零）。
 * 支援：'1990-3-20'、'1990/3/20'、'1990-03-20'、'1990/03/20' 等。
 * 無法解析時回傳空字串。
 */
function normalizeBirthday(raw) {
    if (!raw) return '';
    // 統一分隔符號為 '-'，再拆解
    const parts = String(raw).trim().replace(/\//g, '-').split('-');
    if (parts.length !== 3) return '';
    const y = parts[0].padStart(4, '0');
    const m = parts[1].padStart(2, '0');
    const d = parts[2].padStart(2, '0');
    // 基本合法性檢查
    if (isNaN(Number(y)) || isNaN(Number(m)) || isNaN(Number(d))) return '';
    if (Number(m) < 1 || Number(m) > 12) return '';
    if (Number(d) < 1 || Number(d) > 31) return '';
    return `${y}-${m}-${d}`;
}

// ====== AI 分析：共用輔助函式 ======

/**
 * 彈出「請輸入要分析的角色名稱」Modal，返回 Promise<string|null>。
 * 使用者確認 → resolve(name)；取消或關閉 → resolve(null)。
 */
function _askCharacterName() {
    return new Promise((resolve) => {
        const modal = document.getElementById('modal-target-char-name');
        const input = document.getElementById('target-char-name-input');
        const btnOk = document.getElementById('btn-target-char-confirm');
        const btnCancel = document.getElementById('btn-target-char-cancel');

        // 預填「姓名」欄位的現有值，方便快速帶入
        const existingName = qs('#char-name').value.trim();
        input.value = existingName;
        modal.classList.remove('hidden');
        input.focus();
        input.select();

        function cleanup() {
            modal.classList.add('hidden');
            btnOk.removeEventListener('click', onOk);
            btnCancel.removeEventListener('click', onCancel);
            input.removeEventListener('keydown', onKeydown);
        }
        function onOk() {
            const name = input.value.trim();
            cleanup();
            resolve(name || '');
        }
        function onCancel() {
            cleanup();
            resolve(null);
        }
        function onKeydown(e) {
            if (e.key === 'Enter') { e.preventDefault(); onOk(); }
            if (e.key === 'Escape') { onCancel(); }
        }

        btnOk.addEventListener('click', onOk);
        btnCancel.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKeydown);
    });
}

// ====== AI 分析：文字創造角色 ======

async function analyzeTextCharacter() {
    // 先詢問要分析的角色名稱
    const targetName = await _askCharacterName();
    if (targetName === null) return; // 使用者取消

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.txt,.md,.csv,.json';
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        appendEditorLog(`>> 讀取檔案：${file.name}`);
        if (targetName) appendEditorLog(`>> 目標角色：${targetName}`);
        let text;
        try { text = await file.text(); } catch (err) { appendEditorLog(`❌ 讀取檔案失敗：${err.message}`); return; }
        appendEditorLog(`>> 檔案讀取完畢（${text.length} 字），正在呼叫 AI 分析角色...`);

        const btn = qs('#btn-analyze-text');
        if (btn) btn.disabled = true;
        try {
            const model = document.getElementById('model-select')?.value || 'gemma4';
            const modelOptions = (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null;
            appendEditorLog(`>> 連線至 http://localhost:8081，模型：${model} ...`);
            const { job_id: jobId } = await _apiPost(
                'http://localhost:8081/api/analyze_text_character_async',
                { text_content: text, target_name: targetName, model, model_options: modelOptions }
            );
            if (!jobId) { appendEditorLog('❌ 啟動分析任務失敗：未取得 job_id'); return; }
            appendEditorLog(`>> 任務 ID：${jobId}，AI 分析中...`);

            await _pollAnalysisJob(jobId,
                (result) => {
                    if (result && result.character && Object.keys(result.character).length > 0) {
                        populateFormFromCharData(result.character);
                        appendEditorLog('✅ 角色資料已分析完成並填入表單！');
                    } else {
                        appendEditorLog('⚠️ AI 分析完畢，但未取得有效角色資料。');
                    }
                },
                (err) => appendEditorLog(`❌ ${err}`)
            );
        } catch (err) {
            appendEditorLog(`❌ 連線錯誤（請確認 debug_server.py 已啟動）：${err.message}`);
        } finally {
            if (btn) btn.disabled = false;
        }
    };
    fileInput.click();
}

// ====== AI 分析：剪貼簿創造角色 ======

async function analyzeClipboardCharacter() {
    // 先詢問要分析的角色名稱
    const targetName = await _askCharacterName();
    if (targetName === null) return; // 使用者取消

    const btn = qs('#btn-analyze-clipboard');

    let text;
    try {
        // 要求剪貼簿讀取權限並取得內容
        text = await navigator.clipboard.readText();
    } catch (err) {
        appendEditorLog(`❌ 無法讀取剪貼簿（請確認瀏覽器權限已允許）：${err.message}`);
        alert('無法讀取剪貼簿，請確認瀏覽器已允許此頁面存取剪貼簿。');
        return;
    }

    // 驗證：空白
    if (!text || text.trim().length === 0) {
        appendEditorLog('❌ 剪貼簿是空的，請先複製角色相關文字再試一次。');
        alert('⚠️ 剪貼簿是空的，請先複製角色相關文字再試一次。');
        return;
    }

    // 驗證：過短（可能是圖片路徑、單一數字等非角色描述內容）
    if (text.trim().length < 10) {
        appendEditorLog(`❌ 剪貼簿內容太短（${text.trim().length} 字），無法判斷為角色描述文字。`);
        alert(`⚠️ 剪貼簿內容太短（${text.trim().length} 字），請確認已複製足夠的角色描述文字。`);
        return;
    }

    appendEditorLog(`>> 讀取剪貼簿完畢（${text.length} 字）`);
    if (targetName) appendEditorLog(`>> 目標角色：${targetName}`);
    appendEditorLog('>> 正在呼叫 AI 分析角色...');

    if (btn) btn.disabled = true;
    try {
        const model = document.getElementById('model-select')?.value || 'gemma4';
        const modelOptions = (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null;
        appendEditorLog(`>> 連線至 http://localhost:8081，模型：${model} ...`);
        const { job_id: jobId } = await _apiPost(
            'http://localhost:8081/api/analyze_text_character_async',
            { text_content: text, target_name: targetName, model, model_options: modelOptions }
        );
        if (!jobId) { appendEditorLog('❌ 啟動分析任務失敗：未取得 job_id'); return; }
        appendEditorLog(`>> 任務 ID：${jobId}，AI 分析中...`);

        await _pollAnalysisJob(jobId,
            (result) => {
                if (result && result.character && Object.keys(result.character).length > 0) {
                    populateFormFromCharData(result.character);
                    appendEditorLog('✅ 角色資料已分析完成並填入表單！');
                } else {
                    appendEditorLog('⚠️ AI 分析完畢，但未取得有效角色資料。');
                }
            },
            (err) => appendEditorLog(`❌ ${err}`)
        );
    } catch (err) {
        appendEditorLog(`❌ 連線錯誤（請確認 debug_server.py 已啟動）：${err.message}`);
    } finally {
        if (btn) btn.disabled = false;
    }
}

// ====== AI 分析：人像圖片生成提示詞 ======

async function analyzeImageCharacter() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        appendEditorLog(`>> 讀取圖片：${file.name}`);
        let base64Image;
        try {
            base64Image = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        } catch (err) { appendEditorLog(`❌ 讀取圖片失敗：${err.message}`); return; }
        appendEditorLog('>> 圖片讀取完畢，正在呼叫 AI 分析圖片並生成提示詞...');

        const btn = qs('#btn-analyze-image');
        if (btn) btn.disabled = true;
        try {
            const model = document.getElementById('model-select')?.value || 'gemma4';
            const modelOptions = (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null;
            appendEditorLog(`>> 連線至 http://localhost:8081，模型：${model} ...`);
            const { job_id: jobId } = await _apiPost(
                'http://localhost:8081/api/analyze_image_character_async',
                { image_base64: base64Image, model, model_options: modelOptions }
            );
            if (!jobId) { appendEditorLog('❌ 啟動分析任務失敗：未取得 job_id'); return; }
            appendEditorLog(`>> 任務 ID：${jobId}，AI 分析圖片中...`);

            await _pollAnalysisJob(jobId,
                (result) => {
                    if (result && result.image_prompt) {
                        updateImagePromptInJson(result.image_prompt);
                        appendEditorLog('✅ image_prompt 已更新至角色設定 JSON！');
                    } else {
                        appendEditorLog('⚠️ AI 分析完畢，但未取得有效的 image_prompt。');
                    }
                },
                (err) => appendEditorLog(`❌ ${err}`)
            );
        } catch (err) {
            appendEditorLog(`❌ 連線錯誤（請確認 debug_server.py 已啟動）：${err.message}`);
        } finally {
            if (btn) btn.disabled = false;
        }
    };
    input.click();
}

// ====== 事件掛載 ======

window.addEventListener('load', async () => {
    initDropdownOptions();

    qs('#char-dropdown').addEventListener('change', async (e) => {
        await loadCharacter(e.target.value);
    });

    qs('#char-name').addEventListener('input', () => {
        updateIdPreview();
        updateJsonFromDropdowns();
    });

    qs('#char-birthday').addEventListener('change', () => {
        const bDay = qs('#char-birthday').value;
        if (bDay) {
            const zName = window.getZodiacByDate(bDay);
            if (zName) qs('#char-zodiac').value = zName;
        }
        updateJsonFromDropdowns();
        updateAgeDisplay();
        updateExplanations();
    });

    qs('#char-zodiac').addEventListener('change', () => {
        const zName = qs('#char-zodiac').value;
        const bDay = qs('#char-birthday').value;
        if (zName && bDay) {
            if (window.getZodiacByDate(bDay) !== zName) {
                const year = bDay.split('-')[0];
                qs('#char-birthday').value = window.getMidpointDate(zName, parseInt(year));
            }
        }
        updateExplanations();
        updateJsonFromDropdowns();
    });

    qs('#char-blood-type').addEventListener('change', () => {
        updateExplanations();
        updateJsonFromDropdowns();
    });

    qs('#char-mbti').addEventListener('change', () => {
        updateExplanations();
        updateJsonFromDropdowns();
    });

    ['#char-gender', '#char-height', '#char-weight', '#char-bust'].forEach(sel => {
        qs(sel).addEventListener('input', updateJsonFromDropdowns);
        qs(sel).addEventListener('change', updateJsonFromDropdowns);
    });

    // LPAS v3：包含親密關係（type-4）共 4 個下拉
    [1, 2, 3, 4].forEach(p => {
        const el = qs(`#char-type-${p}`);
        if (!el) return;
        el.addEventListener('change', () => {
            updateIdPreview();
            updateExplanations();
            updateJsonFromDropdowns();
        });
    });

    qs('#btn-char-refresh').addEventListener('click', refreshCharacterList);
    qs('#btn-char-save').addEventListener('click', saveCharacter);
    qs('#btn-char-save-new').addEventListener('click', saveAsNewCharacter);
    qs('#btn-analyze-text').addEventListener('click', analyzeTextCharacter);
    qs('#btn-analyze-clipboard').addEventListener('click', analyzeClipboardCharacter);
    qs('#btn-analyze-image').addEventListener('click', analyzeImageCharacter);

    startServerPolling();
    await initSupabase();
    updateButtonStates();
});
