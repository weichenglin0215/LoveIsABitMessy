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

    // Populate Phase types from TYPE_MAPPING (來源: character_logic.js)
    const mapping = window.TYPE_MAPPING;
    if (mapping) {
        const typeKeys = Object.keys(mapping);
        const labels = ["曖昧期", "熱戀期", "失戀期"];
        [1, 2, 3].forEach(p => {
            const sel = qs(`#char-type-${p}`);
            if (sel) {
                sel.innerHTML = `<option value="">-- 選擇${labels[p-1]}類型 --</option>`;
                typeKeys.forEach(k => {
                    const opt = document.createElement('option');
                    const code = k.replace(/-/g, '');
                    opt.value = code;
                    opt.textContent = `${mapping[k].name} (${code})`;
                    sel.appendChild(opt);
                });
            }
        });
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
    if (currentCharacterId) return; // 編輯現有角色不改 ID
    
    const name = qs('#char-name').value.trim() || "未命名";
    const c1 = qs('#char-type-1').value || "???";
    const c2 = qs('#char-type-2').value || "???";
    const c3 = qs('#char-type-3').value || "???";
    
    let n1 = "???", n2 = "???", n3 = "???";
    const mapping = window.TYPE_MAPPING;
    if (mapping) {
        const getShortName = (code) => {
            if (!code || code === "???") return "???";
            const key = code.split('').join('-');
            return (mapping[key] || { name: "" }).name.replace(/型/g, '');
        };
        n1 = getShortName(c1);
        n2 = getShortName(c2);
        n3 = getShortName(c3);
    }

    const ptCode = `${c1}_${c2}_${c3}`;
    const ptNames = `${n1}_${n2}_${n3}`;
    const lpas = `${ptCode}-${ptNames}`;
    
    if (currentCharacterId) {
        qs('#char-id').value = currentCharacterId;
    } else {
        qs('#char-id').value = "系統自動生成 (UUID)";
    }
}

function updateExplanations() {
    const zVal = qs('#char-zodiac').value;
    const zd = window.ZODIAC_DESCRIPTIONS;
    if (qs('#desc-zodiac')) qs('#desc-zodiac').value = (zd && zVal) ? zd[zVal] || "" : "";

    const bVal = qs('#char-blood-type').value;
    const bd = window.BLOOD_TYPE_DESCRIPTIONS;
    if (qs('#desc-blood')) qs('#desc-blood').value = (bd && bVal) ? bd[bVal] || "" : "";

    const mapping = window.TYPE_MAPPING;
    if (mapping) {
        [1, 2, 3].forEach(p => {
            const codeShort = qs(`#char-type-${p}`).value;
            const descEl = qs(`#desc-type-${p}`);
            if (descEl) {
                if (codeShort && codeShort !== "???") {
                    const key = codeShort.split('').join('-');
                    const info = mapping[key];
                    if (info) {
                        let subInfo;
                        if (p === 1) subInfo = info.ambiguity;
                        else if (p === 2) subInfo = info.love;
                        else if (p === 3) subInfo = info.breakup;
                        
                        if (subInfo && subInfo.desc) {
                            descEl.value = `${subInfo.name || info.name}\n${subInfo.desc}`;
                        } else {
                            descEl.value = `${info.name}\n${info.desc || ''}`;
                        }
                    } else {
                        descEl.value = '未知類型';
                    }
                } else {
                    descEl.value = '';
                }
            }
        });
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
    
    qs('#char-birthday').value = cardJson.birthday || '1999-01-01';
    qs('#char-zodiac').value = cardJson.zodiac || '';
    qs('#char-blood-type').value = cardJson.blood_type || '';
    qs('#char-height').value = cardJson.height || '165';
    qs('#char-weight').value = cardJson.weight || '55';
    qs('#char-bust').value = cardJson.bust || 'C';

    const pt = cardJson.personality_type || ""; 
    
    // 解析性格類型 (相容多種舊格式與新格式 AOCF_AOCF_AOCF-太陽_太陽_太陽)
    let t1 = "", t2 = "", t3 = "";
    if (pt) {
        // 先拔除後面的 "- 名稱"
        let rawCodes = pt.split('-')[0]; 
        
        if (rawCodes.length === 4 && !rawCodes.includes('_') && !rawCodes.includes('-')) {
            // 例: "AOCF" (全部一樣)
            t1 = rawCodes; t2 = rawCodes; t3 = rawCodes;
        } else if (rawCodes.includes('_')) {
            const parts = rawCodes.split('_');
            if (parts.length >= 3 && parts[0].length === 4) {
                // 例: "AOCF_PICS_AILF"
                t1 = parts[0]; t2 = parts[1]; t3 = parts[2];
            } else if (parts.length === 4) {
                // 例: "A_O_C_F" -> A-O-C-F 轉成 AOCF
                const combined = parts.join('');
                t1 = combined; t2 = combined; t3 = combined;
            }
        } else if (pt.match(/^[A-Z]-[A-Z]-[A-Z]-[A-Z]/)) {
            // 例: "A-O-C-F" 或 "A-O-C-F-太陽型"
            const c = pt.substring(0, 7).replace(/-/g, ''); // "AOCF"
            t1 = c; t2 = c; t3 = c;
        }
    }
    
    qs('#char-type-1').value = t1;
    qs('#char-type-2').value = t2;
    qs('#char-type-3').value = t3;
    
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
    cardJson.zodiac = qs('#char-zodiac').value || "";
    cardJson.blood_type = qs('#char-blood-type').value || "";
    cardJson.birthday = qs('#char-birthday').value || "1999-01-01";
    cardJson.height = qs('#char-height').value || "165";
    cardJson.weight = qs('#char-weight').value || "55";
    cardJson.bust = qs('#char-bust').value || "C";
    
    // 組合 Personality Type: A_B_C-名稱1_名稱2_名稱3
    const t1 = qs('#char-type-1').value;
    const t2 = qs('#char-type-2').value;
    const t3 = qs('#char-type-3').value;
    
    // 清除舊有的不必要欄位以精簡結構
    delete cardJson.age;
    delete cardJson.zodiac_description;
    delete cardJson.blood_type_description;
    delete cardJson.personality;

    if (t1 && t2 && t3) {
        const mapping = window.TYPE_MAPPING || {};
        const getShortName = (code) => {
            if (!code) return "???";
            const key = code.split('').join('-');
            return (mapping[key] || { name: "" }).name.replace(/型/g, '');
        };
        const n1 = getShortName(t1);
        const n2 = getShortName(t2);
        const n3 = getShortName(t3);
        cardJson.personality_type = `${t1}_${t2}_${t3}-${n1}_${n2}_${n3}`;
    }

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
    cardJson.zodiac = qs('#char-zodiac').value;
    cardJson.blood_type = qs('#char-blood-type').value;
    cardJson.birthday = qs('#char-birthday').value;
    cardJson.height = qs('#char-height').value || "165";
    cardJson.weight = qs('#char-weight').value || "55";
    cardJson.bust = qs('#char-bust').value || "C";

    const t1 = qs('#char-type-1').value || "000";
    const t2 = qs('#char-type-2').value || "000";
    const t3 = qs('#char-type-3').value || "000";

    if (window.TYPE_MAPPING) {
        const mapping = window.TYPE_MAPPING;
        const getShortName = (code) => {
            if (!code || code === "???") return "???";
            const key = code.split('').join('-');
            return (mapping[key] || { name: "" }).name.replace(/型/g, '');
        };
        const n1 = getShortName(t1);
        const n2 = getShortName(t2);
        const n3 = getShortName(t3);
        cardJson.personality_type = `${t1}_${t2}_${t3}-${n1}_${n2}_${n3}`;
    }

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
    qs('#char-zodiac').value = '';
    qs('#char-blood-type').value = '';
    qs('#char-type-1').value = '';
    qs('#char-type-2').value = '';
    qs('#char-type-3').value = '';
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
        cardJson.zodiac = qs('#char-zodiac').value;
        cardJson.blood_type = qs('#char-blood-type').value;
        cardJson.birthday = qs('#char-birthday').value;
        cardJson.name = qs('#char-name').value;
        cardJson.height = qs('#char-height').value || "165";
        cardJson.weight = qs('#char-weight').value || "55";
        cardJson.bust = qs('#char-bust').value || "C";
        
        const t1 = qs('#char-type-1').value;
        const t2 = qs('#char-type-2').value;
        const t3 = qs('#char-type-3').value;
        if (t1 && t2 && t3 && t1 !== "???" && t2 !== "???" && t3 !== "???") {
            const mapping = window.TYPE_MAPPING || {};
            const getShortName = (code) => {
                if (!code || code === "???") return "???";
                const key = code.split('').join('-');
                return (mapping[key] || { name: "" }).name.replace(/型/g, '');
            };
            const n1 = getShortName(t1);
            const n2 = getShortName(t2);
            const n3 = getShortName(t3);
            cardJson.personality_type = `${t1}_${t2}_${t3}-${n1}_${n2}_${n3}`;
        }
        
        // 更新顯示
        qs('#char-card-json').value = prettyJson(cardJson);
        updateButtonStates();
    } catch(e) {}
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

    ['#char-height', '#char-weight', '#char-bust'].forEach(sel => {
        qs(sel).addEventListener('input', updateJsonFromDropdowns);
        qs(sel).addEventListener('change', updateJsonFromDropdowns);
    });
    
    [1, 2, 3].forEach(p => {
        qs(`#char-type-${p}`).addEventListener('change', () => {
            updateIdPreview();
            updateExplanations();
            updateJsonFromDropdowns();
        });
    });

    qs('#btn-char-refresh').addEventListener('click', refreshCharacterList);
    qs('#btn-char-save').addEventListener('click', saveCharacter);
    qs('#btn-char-save-new').addEventListener('click', saveAsNewCharacter);

    await initSupabase();
    updateButtonStates();
});
