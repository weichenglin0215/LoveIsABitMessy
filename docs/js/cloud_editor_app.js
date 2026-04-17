/**
 * cloud_editor_app.js — 雲端資料編輯器 JS 邏輯
 * 左欄：角色卡（含答題過程），右欄：日記
 */

/* global supabase */

let sb = null;
let currentCharacterId = null;
let currentDiaryId = null;

function qs(sel) { return document.querySelector(sel); }

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

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
        return '資料表不存在。請先到 Supabase Dashboard → SQL Editor 執行 schema.sql + schema_add.sql';
    }
    return msg;
}

// ====== Supabase 初始化 ======
async function initSupabase() {
    if (window.SupabaseClient && window.SupabaseClient.init && window.SupabaseClient.init()) {
        sb = window.SupabaseClient.getClient();
        setStatus('✅ 已自動連線至 Supabase（匿名模式，透過 supabaseClient.js）');
    } else {
        setStatus('❌ Supabase 連線失敗。請確認 js/supabaseClient.js 中的 URL 和 Key 是否正確。');
        return;
    }

    // 載入資料
    await refreshCharacterList();
    await refreshDiaryList();
}

// ====== 登入 / 登出 ======
async function login() {
    const email = qs('#auth-email').value.trim();
    const password = qs('#auth-pass').value;
    if (!email || !password) throw new Error('請填入 Email 與 Password');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setStatus(`已登入：${data.user.email}`);
    qs('#btn-logout').style.display = '';
}

async function logout() {
    const { error } = await sb.auth.signOut();
    if (error) throw error;
    setStatus('已登出。');
    qs('#btn-logout').style.display = 'none';
}

// ====== 角色卡（左欄）======
async function refreshCharacterList() {
    const sel = qs('#char-dropdown');
    sel.innerHTML = '<option value="">-- 選擇角色卡 --</option>';

    if (!sb) return;
    const { data, error } = await sb
        .from('characters')
        .select('id, name, source, is_active, updated_at')
        .order('updated_at', { ascending: false })
        .limit(300);
    if (error) {
        console.error('characters load error:', error);
        alert('角色卡載入失敗: ' + friendlyError(error.message));
        return;
    }
    (data || []).forEach(row => {
        const opt = document.createElement('option');
        opt.value = row.id;
        opt.textContent = `${row.name} (${row.id}) [${row.source}] ${row.is_active ? '' : '(停用)'}`;
        sel.appendChild(opt);
    });
}

async function loadCharacter(charId) {
    if (!charId || !sb) {
        qs('#char-id').value = '';
        qs('#char-name').value = '';
        qs('#char-card-json').value = '';
        currentCharacterId = null;
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
    qs('#char-card-json').value = prettyJson(data.card_json);
}

async function saveCharacter() {
    if (!sb) { alert('Supabase 尚未初始化'); return; }

    const id = qs('#char-id').value.trim();
    const name = qs('#char-name').value.trim();
    const cardJsonStr = qs('#char-card-json').value.trim();

    if (!id) { alert('請填寫角色 ID'); return; }

    let cardJson;
    try {
        cardJson = cardJsonStr ? JSON.parse(cardJsonStr) : {};
    } catch {
        alert('角色設定 JSON 格式不正確，請檢查語法');
        return;
    }

    const payload = {
        id: id,
        name: name || cardJson.name || '未命名',
        card_json: cardJson,
        updated_at: new Date().toISOString()
    };

    const { error } = await sb.from('characters').upsert(payload, { onConflict: 'id' });
    if (error) {
        alert('儲存失敗: ' + friendlyError(error.message));
        return;
    }
    alert('✅ 角色卡已儲存');
    await refreshCharacterList();
    // 重新選取
    qs('#char-dropdown').value = id;
}

function cancelCharacterEdit() {
    qs('#char-id').value = '';
    qs('#char-name').value = '';
    qs('#char-card-json').value = '';
    qs('#char-dropdown').value = '';
    currentCharacterId = null;
}

// ====== 日記（右欄）======
async function refreshDiaryList() {
    const sel = qs('#diary-dropdown');
    sel.innerHTML = '<option value="">-- 選擇日記 --</option>';

    if (!sb) return;
    const { data, error } = await sb
        .from('diary_entries')
        .select('id, entry_date, character_id, character_name, story_filename, created_at')
        .order('entry_date', { ascending: false })
        .limit(300);
    if (error) {
        console.error('diary load error:', error);
        alert('日記載入失敗: ' + friendlyError(error.message));
        return;
    }
    (data || []).forEach(row => {
        const opt = document.createElement('option');
        opt.value = row.id;
        const label = `${row.entry_date} — ${row.character_name || row.character_id || '未知'}`;
        opt.textContent = row.story_filename ? `${label} (${row.story_filename})` : label;
        sel.appendChild(opt);
    });
}

async function loadDiary(diaryId) {
    if (!diaryId || !sb) {
        qs('#diary-editor').value = '';
        currentDiaryId = null;
        return;
    }
    const { data, error } = await sb
        .from('diary_entries')
        .select('*')
        .eq('id', diaryId)
        .single();
    if (error) {
        alert('載入日記失敗: ' + friendlyError(error.message));
        return;
    }
    currentDiaryId = diaryId;

    const displayObj = {
        _id: data.id,
        entry_date: data.entry_date,
        character_id: data.character_id,
        character_name: data.character_name,
        story: data.story,
        full_prompt: data.full_prompt,
        image_prompt: data.image_prompt,
        story_filename: data.story_filename,
        html_filename: data.html_filename,
        image_filename: data.image_filename,
        created_at: data.created_at
    };
    qs('#diary-editor').value = prettyJson(displayObj);
}

async function saveDiary() {
    if (!sb) { alert('Supabase 尚未初始化'); return; }

    const raw = qs('#diary-editor').value.trim();
    if (!raw) { alert('編輯框為空'); return; }

    let parsed;
    try {
        parsed = JSON.parse(raw);
    } catch {
        alert('JSON 格式不正確，請檢查語法');
        return;
    }

    const id = parsed._id || currentDiaryId;
    if (!id) { alert('缺少日記 ID（_id 欄位），無法更新'); return; }

    const payload = {
        entry_date: parsed.entry_date,
        character_id: parsed.character_id || null,
        character_name: parsed.character_name || null,
        story: parsed.story || '',
        full_prompt: parsed.full_prompt || null,
        image_prompt: parsed.image_prompt || null,
        story_filename: parsed.story_filename || null,
        html_filename: parsed.html_filename || null,
        image_filename: parsed.image_filename || null,
        updated_at: new Date().toISOString()
    };

    const { error } = await sb.from('diary_entries').update(payload).eq('id', id);
    if (error) {
        alert('儲存失敗: ' + friendlyError(error.message));
        return;
    }
    alert('✅ 日記已儲存');
    await refreshDiaryList();
    qs('#diary-dropdown').value = id;
}

function cancelDiaryEdit() {
    qs('#diary-editor').value = '';
    qs('#diary-dropdown').value = '';
    currentDiaryId = null;
}

// ====== 初始化 ======
window.addEventListener('load', async () => {
    // 登入按鈕
    qs('#btn-login').addEventListener('click', async () => {
        try {
            if (!sb) await initSupabase();
            await login();
        } catch (e) { alert(e.message || e); }
    });
    qs('#btn-logout').addEventListener('click', async () => {
        try { await logout(); } catch (e) { alert(e.message || e); }
    });

    // 角色卡下拉選單
    qs('#char-dropdown').addEventListener('change', async (e) => {
        await loadCharacter(e.target.value);
    });
    qs('#btn-char-save').addEventListener('click', saveCharacter);
    qs('#btn-char-cancel').addEventListener('click', cancelCharacterEdit);
    qs('#btn-char-refresh').addEventListener('click', refreshCharacterList);

    // 日記下拉選單
    qs('#diary-dropdown').addEventListener('change', async (e) => {
        await loadDiary(e.target.value);
    });
    qs('#btn-diary-save').addEventListener('click', saveDiary);
    qs('#btn-diary-cancel').addEventListener('click', cancelDiaryEdit);
    qs('#btn-diary-refresh').addEventListener('click', refreshDiaryList);

    // 自動初始化
    try {
        await initSupabase();
    } catch (e) {
        console.warn('自動初始化失敗:', e);
    }
});
