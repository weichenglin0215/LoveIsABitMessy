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
    const rows = (data || []).slice().sort((a, b) =>
        String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant')
    );
    rows.forEach(row => {
        const opt = document.createElement('option');
        opt.value = row.id;
        // 統一以「角色名稱-full_name」顯示
        opt.textContent = window.charDropdownLabel(row);
        sel.appendChild(opt);
    });
}

/**
 * 統一的角色卡下拉顯示文字：「角色名稱-full_name」。
 * full_name 取自 card_json.lpas_v3.full_name；無 LPAS 資料時以「無LPAS」替代。
 * 供 characters_editor / daily_run / loveline / novel_generator 共用。
 */
window.charDropdownLabel = function (row) {
    let card = row && row.card_json;
    if (typeof card === 'string') {
        try { card = JSON.parse(card); } catch (e) { card = null; }
    }
    const fullName = (card && card.lpas_v3 && card.lpas_v3.full_name) ? card.lpas_v3.full_name : '';
    return `${(row && row.name) || '未命名'}-${fullName || '無LPAS'}`;
};

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
 *     ambiguity:   "PFOL",      // 曖昧期 4 字代碼（去除「-」）
 *     love:        "AFOL",      // 熱戀期
 *     breakup:     "PSOL",      // 失戀期
 *     intimacy:    "深情專一",   // 親密關係四象限（去除結尾「型」）
 *     triple_code: "PFOL_AFOL_PSOL",
 *     triple_name: "流星_煙火_晚霞",
 *     full_code:   "PFOL_AFOL_PSOL-深情專一",
 *     full_name:   "PFOL_AFOL_PSOL-流星_煙火_晚霞-深情專一"
 *   }
 * personality_type: "PFOL_AFOL_PSOL_深情專一"（三聯代碼 + 親密關係，去「型」）
 */
function buildLpasV3() {
    const v3 = window.TYPE_MAPPING_V3 || {};
    const a = qs('#char-type-1').value;   // 例「A-F-O-H」
    const l = qs('#char-type-2').value;
    const b = qs('#char-type-3').value;
    const i = qs('#char-type-4').value;   // 例「深情專一型」（含「型」）
    if (!a || !l || !b || !i) return null;

    // 4 字代碼去除連字號：「A-F-O-H」→「AFOH」
    const stripDash = (k) => (k || '').replace(/-/g, '');
    // 類型名稱去除結尾「型」：「煙火型」→「煙火」
    const stripType = (s) => (s || '').replace(/型$/, '');
    const nameOf = (k) => (v3[k] && v3[k].name) ? stripType(v3[k].name) : '';

    const aCode = stripDash(a), lCode = stripDash(l), bCode = stripDash(b);
    const intimacyShort = stripType(i);                            // 深情專一
    const tripleCode = `${aCode}_${lCode}_${bCode}`;              // PFOL_AFOL_PSOL
    const tripleName = `${nameOf(a)}_${nameOf(l)}_${nameOf(b)}`;  // 流星_煙火_晚霞
    return {
        engine_version: 'v3',
        ambiguity: aCode,
        love: lCode,
        breakup: bCode,
        intimacy: intimacyShort,
        triple_code: tripleCode,
        triple_name: tripleName,
        full_code: `${tripleCode}-${intimacyShort}`,
        full_name: `${tripleCode}-${tripleName}-${intimacyShort}`
    };
}

/**
/**
 * 判斷 personality_type 字串是否為「LPAS v3 評量端三聯」格式。
 * 例：「AFOH_ASOH_PFIL-海嘯_太陽_細雨-深情專一型」
 *   - 以 "-" 切至少 3 段
 *   - 第 1 段為 3 個 4 字代碼以 "_" 串接，每段 = [AP][FS][OI][HL]
 * （此格式由 lpas_v3_character_generator.js 評量流程寫出，與本編輯器
 *   儲存格式「PFOL_AFOL_PSOL_深情專一」不同，需個別解析以還原下拉。）
 */
function isV3PersonalityType(ptype) {
    if (!ptype) return false;
    const parts = String(ptype).split('-');
    if (parts.length < 3) return false;
    const codes = parts[0].split('_');
    return codes.length === 3 && codes.every(c => /^[AP][FS][OI][HL]$/.test(c));
}

/**
 * 把「AFOH_ASOH_PFIL-海嘯_太陽_細雨-深情專一型」解析回 4 欄位（含連字號代碼）。
 * 親密關係段若不在 SEX_QUADRANTS_V3（例如「未測」）則留空字串。
 */
function parseV3PersonalityType(ptype) {
    const parts = String(ptype).split('-');
    const codes = parts[0].split('_');
    // 親密段：把第 3 段以後全部拼回（保險起見，雖然目前 4 性象限名稱不含 "-"）
    const intimacy = parts.slice(2).join('-');
    const expand = (c) => `${c[0]}-${c[1]}-${c[2]}-${c[3]}`;
    const sexMap = window.SEX_QUADRANTS_V3 || {};
    return {
        ambiguity: expand(codes[0]),
        love: expand(codes[1]),
        breakup: expand(codes[2]),
        intimacy: sexMap[intimacy] ? intimacy : ''
    };
}

/**
 * 從既有 cardJson 還原 4 個下拉的值。
 * 自動處理多種來源：
 *   1) 已有 cardJson.lpas_v3 結構 → 直接讀取
 *   2) V1 三聯字串 (AOCF_...)    → convertCardJsonV1ToV3 就地補上 lpas_v3
 *   3) LPAS v3 評量端 personality_type 字串 (AFOH_..-..-..型) → 解析後就地補上 lpas_v3
 * 新格式代碼已去除「-」、親密關係已去除「型」，這裡還原成下拉選單的鍵值；
 * 同時相容舊格式（含「-」的代碼、含「型」的親密關係）。
 */
function readLpasV3FromCard(cardJson) {
    if (cardJson && !cardJson.lpas_v3) {
        // (2) 舊版 V1 卡片：就地補上 lpas_v3
        if (typeof window.convertCardJsonV1ToV3 === 'function') {
            window.convertCardJsonV1ToV3(cardJson);
        }
        // (3) LPAS v3 評量端寫出的 personality_type 字串
        if (!cardJson.lpas_v3 && isV3PersonalityType(cardJson.personality_type)) {
            const parsed = parseV3PersonalityType(cardJson.personality_type);
            cardJson.lpas_v3 = {
                engine_version: 'v3',
                ambiguity: parsed.ambiguity,
                love: parsed.love,
                breakup: parsed.breakup,
                intimacy: parsed.intimacy
            };
        }
    }
    const v = cardJson && cardJson.lpas_v3;
    if (!v) return { t1: '', t2: '', t3: '', t4: '' };
    // 「AFOH」→「A-F-O-H」（下拉選單鍵值）；已含「-」則原樣保留（舊格式相容）
    const toDashed = (c) => {
        if (!c) return '';
        return c.includes('-') ? c : c.split('').join('-');
    };
    // 「深情專一」→「深情專一型」（下拉選單鍵值）；已含「型」則原樣保留（舊格式相容）
    const toIntimacyKey = (s) => {
        if (!s) return '';
        return /型$/.test(s) ? s : s + '型';
    };
    return {
        t1: toDashed(v.ambiguity),
        t2: toDashed(v.love),
        t3: toDashed(v.breakup),
        t4: toIntimacyKey(v.intimacy)
    };
}

/** 將 LPAS v3 結構寫入 cardJson；沒選滿 4 格則移除舊欄位以保持一致 */
function writeLpasV3ToCard(cardJson) {
    const lpasV3 = buildLpasV3();
    if (lpasV3) {
        cardJson.lpas_v3 = lpasV3;
        // personality_type = 三聯代碼 + 親密關係（去「型」），例「PFOL_AFOL_PSOL_深情專一」
        cardJson.personality_type = `${lpasV3.triple_code}_${lpasV3.intimacy}`;
    } else {
        delete cardJson.lpas_v3;
        delete cardJson.personality_type;
    }
    return lpasV3;
}

/**
 * 儲存前防呆：當 type_1/2/3 都已選但 type_4 (親密關係) 為空時，
 * 自動補上第一個非空選項（4 性象限第一個，預設「深情專一型」），避免 buildLpasV3()
 * 因 t4 空回 null 而導致 writeLpasV3ToCard 刪除整段 lpas_v3 資料。
 * 適用情境：V1 舊卡片轉成 V3 後 type_4 是空字串，使用者只想改其他欄位就儲存。
 * 僅在 saveCharacter / saveAsNewCharacter 入口呼叫，不在 JSON 即時預覽時呼叫，避免亂動 UI。
 */
function ensureLpasV3IntimacyFilled() {
    const t1 = qs('#char-type-1').value;
    const t2 = qs('#char-type-2').value;
    const t3 = qs('#char-type-3').value;
    const sel4 = qs('#char-type-4');
    if (!sel4 || sel4.value) return;            // 已有值不動
    if (!t1 || !t2 || !t3) return;              // 三期都未填則不自動補
    // 找第一個 value 非空的 option（跳過 placeholder「-- 選擇親密關係類型 --」）
    const firstReal = Array.from(sel4.options).find(o => o.value);
    if (firstReal) {
        sel4.value = firstReal.value;
        updateExplanations();                   // 同步右側說明欄
    }
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

// ────────────────────────────────────────────────
// 角色照片：上傳、縮放、預覽、儲存
// ────────────────────────────────────────────────
// 暫存目前角色的照片資料（dataURL 格式 jpg），會在儲存時一併寫入雲端
let currentPhotoThumb = '';  // 最長邊 256
let currentPhotoFull = '';   // 最長邊 1024

// 將 File 縮放成指定最長邊的 jpg dataURL（80% 壓縮）
function resizeImageToDataUrl(file, maxEdge, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const reader = new FileReader();
        reader.onload = e => { img.src = e.target.result; };
        reader.onerror = reject;
        img.onload = () => {
            const w = img.naturalWidth, h = img.naturalHeight;
            const scale = Math.min(1, maxEdge / Math.max(w, h));
            const tw = Math.round(w * scale), th = Math.round(h * scale);
            const canvas = document.createElement('canvas');
            canvas.width = tw; canvas.height = th;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; // 透明背景轉 JPG 用白底
            ctx.fillRect(0, 0, tw, th);
            ctx.drawImage(img, 0, 0, tw, th);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = reject;
        reader.readAsDataURL(file);
    });
}

async function handleCharPhotoFile(file) {
    if (!file || !file.type.startsWith('image/')) {
        alert('請選擇圖片檔');
        return;
    }
    const statusEl = qs('#char-photo-status');
    statusEl.textContent = '⏳ 處理中…';
    try {
        const [thumb, full] = await Promise.all([
            resizeImageToDataUrl(file, 256, 0.8),
            resizeImageToDataUrl(file, 1024, 0.8)
        ]);
        currentPhotoThumb = thumb;
        currentPhotoFull = full;
        updateCharPhotoPreview();
        const kbThumb = Math.round(thumb.length * 0.75 / 1024);
        const kbFull = Math.round(full.length * 0.75 / 1024);
        statusEl.textContent = `✅ 已載入（縮圖 ${kbThumb} KB / 原圖 ${kbFull} KB）— 儲存後寫入雲端`;
    } catch (e) {
        console.error(e);
        statusEl.textContent = '❌ 圖片處理失敗：' + e.message;
    }
}

function updateCharPhotoPreview() {
    const img = qs('#char-photo-thumb');
    const placeholder = qs('#char-photo-placeholder');
    if (currentPhotoThumb) {
        img.src = currentPhotoThumb;
        img.style.display = 'block';
        placeholder.style.display = 'none';
    } else {
        img.src = '';
        img.style.display = 'none';
        placeholder.style.display = 'block';
    }
}

function clearCharPhoto() {
    currentPhotoThumb = '';
    currentPhotoFull = '';
    updateCharPhotoPreview();
    qs('#char-photo-status').textContent = '尚未上傳照片';
    qs('#char-photo-file-input').value = '';
}

function setupCharPhotoUI() {
    const input = qs('#char-photo-file-input');
    const dropzone = qs('#char-photo-dropzone');
    const btnUpload = qs('#btn-char-photo-upload');
    const btnClear = qs('#btn-char-photo-clear');

    btnUpload.addEventListener('click', () => input.click());
    dropzone.addEventListener('click', () => input.click());
    btnClear.addEventListener('click', clearCharPhoto);

    input.addEventListener('change', e => {
        const f = e.target.files && e.target.files[0];
        if (f) handleCharPhotoFile(f);
    });

    dropzone.addEventListener('dragover', e => {
        e.preventDefault();
        dropzone.style.borderColor = '#f472b6';
        dropzone.style.background = '#3a2a35';
    });
    const resetDropzoneStyle = () => {
        dropzone.style.borderColor = '#888';
        dropzone.style.background = '#333';
    };
    dropzone.addEventListener('dragleave', resetDropzoneStyle);
    dropzone.addEventListener('drop', e => {
        e.preventDefault();
        resetDropzoneStyle();
        const f = e.dataTransfer.files && e.dataTransfer.files[0];
        if (f) handleCharPhotoFile(f);
    });
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

    // 載入角色照片（雲端欄位 photo_thumb / photo_full）
    currentPhotoThumb = data.photo_thumb || '';
    currentPhotoFull = data.photo_full || '';
    updateCharPhotoPreview();
    qs('#char-photo-status').textContent = currentPhotoThumb
        ? '✅ 已從雲端載入照片'
        : '尚未上傳照片';

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

    // 必填欄位防呆：未填齊不可儲存（同步顯示紅框）
    if (!ensureAllRequiredFilled()) return;

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

    // 儲存前防呆：V1 舊卡片轉成 V3 後 type_4 可能為空，自動補預設值再寫入
    ensureLpasV3IntimacyFilled();
    // 將 LPAS v3 四個下拉組裝寫入 cardJson.lpas_v3 + personality_type
    writeLpasV3ToCard(cardJson);

    const payload = {
        id: currentCharacterId,
        name: cardJson.name,
        lpas: cardJson.personality_type || "",
        card_json: cardJson,
        photo_thumb: currentPhotoThumb || null,
        photo_full: currentPhotoFull || null,
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

    // 必填欄位防呆：未填齊不可新增（同步顯示紅框）
    if (!ensureAllRequiredFilled()) return;

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

    // 儲存前防呆：V1 舊卡片轉成 V3 後 type_4 可能為空，自動補預設值再寫入
    ensureLpasV3IntimacyFilled();
    // 將 LPAS v3 四個下拉組裝寫入 cardJson
    writeLpasV3ToCard(cardJson);

    const payload = {
        name: name,
        lpas: cardJson.personality_type || "",
        card_json: cardJson,
        photo_thumb: currentPhotoThumb || null,
        photo_full: currentPhotoFull || null,
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
    clearCharPhoto();
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
    //   嘗試從 "A-F-O-H_A-S-O-H_P-F-I-L_深情專一型-..." 取前 4 段；
    //   若是舊 V1 格式（如 AOCF_AICS_PILS-煙火_燈塔_深海），先自動補上 lpas_v3。
    if (!charData.lpas_v3 && typeof window.convertCardJsonV1ToV3 === 'function') {
        window.convertCardJsonV1ToV3(charData);
    }
    if (charData.lpas_v3) {
        const { t1, t2, t3, t4 } = readLpasV3FromCard(charData);
        if (t1) qs('#char-type-1').value = t1;
        if (t2) qs('#char-type-2').value = t2;
        if (t3) qs('#char-type-3').value = t3;
        if (t4) qs('#char-type-4').value = t4;
    } else if (charData.personality_type) {
        // V3 代碼格式：新「PFOL_AFOL_PSOL_<sex>型」或舊「A-F-O-H_A-S-O-H_P-F-I-L_<sex>」，用「_」拆出前 3 段
        const parts = String(charData.personality_type).split('_');
        // 同時辨識含連字號（A-F-O-H）與不含連字號（AFOH）兩種代碼格式
        const isDashed = (s) => /^[AP]-[FS]-[OI]-[HL]$/.test(s);
        const isCompact = (s) => /^[AP][FS][OI][HL]$/.test(s);
        // 一律還原成下拉選單鍵值（含連字號）
        const toDashed = (s) => isDashed(s) ? s : s.split('').join('-');
        // ⚠ 此 fallback 主要用於 AI 回傳 personality_type 而沒給 lpas_v3 的情況
        if (parts.length >= 3 &&
            (isDashed(parts[0]) || isCompact(parts[0])) &&
            (isDashed(parts[1]) || isCompact(parts[1])) &&
            (isDashed(parts[2]) || isCompact(parts[2]))) {
            qs('#char-type-1').value = toDashed(parts[0]);
            qs('#char-type-2').value = toDashed(parts[1]);
            qs('#char-type-3').value = toDashed(parts[2]);
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

/* ════════════════════════════════════════════════════════════
   必填欄位驗證
   未填寫者輸入框 / 下拉會套用 .field-invalid（紅框，定義於 characters_editor.html）
   儲存（新增 / 覆蓋）前若仍有未填欄位，跳警告並中斷儲存。
   ════════════════════════════════════════════════════════════ */
const REQUIRED_FIELDS = [
    { sel: '#char-name', label: '姓名 (Name)' },
    { sel: '#char-gender', label: '性別 (Gender)' },
    { sel: '#char-height', label: '身高 (cm)' },
    { sel: '#char-weight', label: '體重 (kg)' },
    { sel: '#char-bust', label: '上圍 (Bust)' },
    { sel: '#char-birthday', label: '生日 (Birthday)' },
    { sel: '#char-zodiac', label: '星座 (Zodiac)' },
    { sel: '#char-blood-type', label: '血型 (Blood Type)' },
    { sel: '#char-mbti', label: 'MBTI 類型' },
    { sel: '#char-type-1', label: '曖昧期類型' },
    { sel: '#char-type-2', label: '熱戀期類型' },
    { sel: '#char-type-3', label: '失戀期類型' },
    { sel: '#char-type-4', label: '親密關係類型' }
];

/** 套 / 移除 .field-invalid 並回傳尚未填寫的欄位 label 列表 */
function validateRequiredFields() {
    const missing = [];
    REQUIRED_FIELDS.forEach(({ sel, label }) => {
        const el = qs(sel);
        if (!el) return;
        const filled = String(el.value || '').trim() !== '';
        el.classList.toggle('field-invalid', !filled);
        if (!filled) missing.push(label);
    });
    return missing;
}

/** 儲存前統一檢查；若有缺漏跳警告並回傳 false */
function ensureAllRequiredFilled() {
    const missing = validateRequiredFields();
    if (missing.length > 0) {
        alert('以下欄位尚未填寫，請補齊後再儲存：\n\n• ' + missing.join('\n• '));
        return false;
    }
    return true;
}

window.addEventListener('load', async () => {
    initDropdownOptions();

    qs('#char-dropdown').addEventListener('change', async (e) => {
        await loadCharacter(e.target.value);
        validateRequiredFields();
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

    // 任何必填欄位變動就即時刷新紅框狀態
    REQUIRED_FIELDS.forEach(({ sel }) => {
        const el = qs(sel);
        if (!el) return;
        el.addEventListener('input', validateRequiredFields);
        el.addEventListener('change', validateRequiredFields);
    });

    qs('#btn-char-refresh').addEventListener('click', refreshCharacterList);
    qs('#btn-char-save').addEventListener('click', saveCharacter);
    qs('#btn-char-save-new').addEventListener('click', saveAsNewCharacter);
    setupCharPhotoUI();
    qs('#btn-analyze-text').addEventListener('click', analyzeTextCharacter);
    qs('#btn-analyze-clipboard').addEventListener('click', analyzeClipboardCharacter);
    qs('#btn-analyze-image').addEventListener('click', analyzeImageCharacter);

    startServerPolling();
    await initSupabase();
    updateButtonStates();
});
