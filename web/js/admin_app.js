/* global supabase */

const LS_KEY = 'loveisabitmessy_supabase_conn_v1';

function qs(sel) { return document.querySelector(sel); }
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

function loadConn() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}

function saveConn(conn) {
  localStorage.setItem(LS_KEY, JSON.stringify(conn));
}

function setStatus(text) {
  const el = qs('#conn-status');
  el.textContent = text;
}

function prettyJson(obj) {
  return JSON.stringify(obj, null, 2);
}

let sb = null;

function getClient() {
  if (!sb) throw new Error('Supabase 尚未初始化');
  return sb;
}

function showAuthedUI(isAuthed) {
  qs('#tabs').style.display = isAuthed ? '' : 'none';
  qs('#tab-characters').style.display = isAuthed ? '' : 'none';
  qs('#tab-diary').style.display = 'none';
  qs('#tab-lpas').style.display = 'none';
  qs('#btn-logout').style.display = isAuthed ? '' : 'none';
}

function activateTab(tabName) {
  qsa('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  qs('#tab-characters').style.display = tabName === 'characters' ? '' : 'none';
  qs('#tab-diary').style.display = tabName === 'diary' ? '' : 'none';
  qs('#tab-lpas').style.display = tabName === 'lpas' ? '' : 'none';
}

async function initSupabase() {
  // 1) 優先使用 supabaseClient.js 的固定設定（比照你另一個專案）
  if (window.SupabaseClient && window.SupabaseClient.init && window.SupabaseClient.init()) {
    sb = window.SupabaseClient.getClient();
    setStatus('已使用 supabaseClient.js 初始化 Supabase client。');
  } else {
    // 2) 備援：使用本頁面輸入框（避免 file:/// 或 CORS 導致載入模組失敗時無法使用）
    const url = qs('#sb-url').value.trim();
    const anon = qs('#sb-anon').value.trim();
    if (!url || !anon) throw new Error('無法自動初始化 Supabase，請填入 Project URL 與 Anon Key（或在 js/supabaseClient.js 內設定）');
    sb = supabase.createClient(url, anon);
    setStatus('已使用手動輸入初始化 Supabase client。');
  }

  const { data } = await sb.auth.getSession();
  showAuthedUI(!!data.session);
  if (data.session) {
    setStatus(`已登入：${data.session.user.email}`);
    activateTab('characters');
    await refreshCharacters();
  } else {
    setStatus('尚未登入（第一次需註冊/登入；之後會自動登入）。');
  }
}

async function login() {
  const email = qs('#auth-email').value.trim();
  const password = qs('#auth-pass').value;
  if (!email || !password) throw new Error('請填入 Email 與 Password');
  const { data, error } = await getClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  showAuthedUI(true);
  setStatus(`已登入：${data.user.email}`);
  activateTab('characters');
  await refreshCharacters();
}

async function logout() {
  const { error } = await getClient().auth.signOut();
  if (error) throw error;
  showAuthedUI(false);
  setStatus('已登出。');
}

async function refreshCharacters() {
  const el = qs('#characters-list');
  el.innerHTML = '<div class="muted">載入中…</div>';

  const { data, error } = await getClient()
    .from('characters')
    .select('id,name,source,is_active,updated_at,created_at,card_json')
    .order('updated_at', { ascending: false })
    .limit(200);

  if (error) throw error;
  if (!data || data.length === 0) {
    el.innerHTML = '<div class="muted">目前沒有角色。</div>';
    return;
  }

  el.innerHTML = '';
  data.forEach(row => {
    const div = document.createElement('div');
    div.className = 'panel';
    div.style.padding = '12px';
    div.innerHTML = `
      <div class="row" style="align-items:flex-start;">
        <div style="flex: 2 1 320px;">
          <div><span class="pill mono">${row.id}</span> <span style="margin-left:8px; font-weight:500;">${row.name}</span></div>
          <div class="muted">source: ${row.source} · active: ${row.is_active} · updated: ${row.updated_at}</div>
        </div>
        <div style="flex: 1 1 260px;" class="row right">
          <button class="btn secondary-btn" data-action="edit" data-id="${row.id}">編輯</button>
          <button class="btn secondary-btn" data-action="toggle" data-id="${row.id}">${row.is_active ? '停用' : '啟用'}</button>
          <button class="btn secondary-btn" data-action="delete" data-id="${row.id}">刪除</button>
        </div>
      </div>
      <details style="margin-top:10px;">
        <summary class="muted" style="cursor:pointer;">查看 card_json</summary>
        <pre class="mono" style="white-space: pre-wrap; margin-top:8px;">${escapeHtml(prettyJson(row.card_json))}</pre>
      </details>
    `;
    el.appendChild(div);
  });

  el.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const row = data.find(r => r.id === id);
      if (!row) return;

      try {
        if (action === 'edit') {
          qs('#char-id').value = row.id;
          qs('#char-name').value = row.name;
          qs('#char-source').value = row.source || 'manual';
          qs('#char-json').value = prettyJson(row.card_json);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (action === 'toggle') {
          const { error } = await getClient().from('characters').update({ is_active: !row.is_active }).eq('id', id);
          if (error) throw error;
          await refreshCharacters();
        } else if (action === 'delete') {
          if (!confirm(`確定刪除角色 ${id}？`)) return;
          const { error } = await getClient().from('characters').delete().eq('id', id);
          if (error) throw error;
          await refreshCharacters();
        }
      } catch (e) {
        alert(`操作失敗：${e.message || e}`);
      }
    });
  });
}

async function upsertCharacter() {
  const id = qs('#char-id').value.trim();
  const name = qs('#char-name').value.trim();
  const source = qs('#char-source').value.trim() || 'manual';
  const raw = qs('#char-json').value.trim();
  if (!id || !name || !raw) throw new Error('請填入角色 ID、角色名稱、角色卡 JSON');

  let card;
  try { card = JSON.parse(raw); } catch { throw new Error('角色卡 JSON 格式不正確'); }

  const payload = { id, name, source, card_json: card };
  const { error } = await getClient().from('characters').upsert(payload, { onConflict: 'id' });
  if (error) throw error;

  qs('#char-id').value = '';
  qs('#char-name').value = '';
  qs('#char-json').value = '';
  await refreshCharacters();
}

async function refreshDiary() {
  const el = qs('#diary-list');
  el.innerHTML = '<div class="muted">載入中…</div>';
  const { data, error } = await getClient()
    .from('diary_entries')
    .select('id,entry_date,character_id,character_name,story_filename,html_filename,image_filename,created_at')
    .order('entry_date', { ascending: false })
    .limit(200);
  if (error) throw error;
  if (!data || data.length === 0) {
    el.innerHTML = '<div class="muted">目前沒有日記。</div>';
    return;
  }

  el.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>日期</th><th>角色</th><th>檔名</th><th>建立時間</th>
      </tr></thead>
      <tbody>
        ${data.map(r => `
          <tr>
            <td class="mono">${r.entry_date}</td>
            <td>${escapeHtml(r.character_name || r.character_id || '')}</td>
            <td class="mono">${escapeHtml(r.html_filename || r.story_filename || '')}</td>
            <td class="mono muted">${escapeHtml(r.created_at || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

async function refreshLPAS() {
  const el = qs('#lpas-list');
  el.innerHTML = '<div class="muted">載入中…</div>';

  const { data, error } = await getClient()
    .from('lpas_sessions')
    .select('id,session_id,alias,age_range,relationship_experience,started_at,finished_at,created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  if (!data || data.length === 0) {
    el.innerHTML = '<div class="muted">目前沒有測驗紀錄。</div>';
    return;
  }

  el.innerHTML = `
    <table class="table">
      <thead><tr>
        <th>Alias</th><th>年齡</th><th>經驗</th><th>開始</th><th>結束</th><th>session_id</th>
      </tr></thead>
      <tbody>
        ${data.map(r => `
          <tr>
            <td>${escapeHtml(r.alias || '')}</td>
            <td class="mono">${escapeHtml(r.age_range || '')}</td>
            <td class="mono">${escapeHtml(r.relationship_experience || '')}</td>
            <td class="mono muted">${escapeHtml(r.started_at || '')}</td>
            <td class="mono muted">${escapeHtml(r.finished_at || '')}</td>
            <td class="mono">${escapeHtml(r.session_id || '')}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.addEventListener('load', async () => {
  const conn = loadConn();
  if (conn.url) qs('#sb-url').value = conn.url;
  if (conn.anon) qs('#sb-anon').value = conn.anon;

  qs('#btn-save-conn').addEventListener('click', async () => {
    try {
      const url = qs('#sb-url').value.trim();
      const anon = qs('#sb-anon').value.trim();
      saveConn({ url, anon });
      setStatus('已儲存設定。');
      await initSupabase();
    } catch (e) {
      alert(e.message || e);
    }
  });

  qs('#btn-login').addEventListener('click', async () => {
    try { await initSupabase(); await login(); } catch (e) { alert(e.message || e); }
  });

  qs('#btn-logout').addEventListener('click', async () => {
    try { await logout(); } catch (e) { alert(e.message || e); }
  });

  qsa('.tab').forEach(t => {
    t.addEventListener('click', async () => {
      const name = t.dataset.tab;
      activateTab(name);
      try {
        if (name === 'characters') await refreshCharacters();
        if (name === 'diary') await refreshDiary();
        if (name === 'lpas') await refreshLPAS();
      } catch (e) {
        alert(`載入失敗：${e.message || e}`);
      }
    });
  });

  qs('#btn-save-character').addEventListener('click', async () => {
    try { await upsertCharacter(); } catch (e) { alert(e.message || e); }
  });
  qs('#btn-refresh-characters').addEventListener('click', async () => {
    try { await refreshCharacters(); } catch (e) { alert(e.message || e); }
  });
  qs('#btn-refresh-diary').addEventListener('click', async () => {
    try { await refreshDiary(); } catch (e) { alert(e.message || e); }
  });
  qs('#btn-refresh-lpas').addEventListener('click', async () => {
    try { await refreshLPAS(); } catch (e) { alert(e.message || e); }
  });

  // 若已儲存連線資訊，嘗試初始化（不會自動登入）
  try {
    // 若 supabaseClient.js 有填設定，或 localStorage 有連線資訊，這裡會初始化並自動讀取既有 session（達到自動登入）
    if ((window.SupabaseClient && window.SupabaseClient.init && window.SupabaseClient.init()) || (conn.url && conn.anon)) {
      await initSupabase();
    }
  } catch {
    // ignore
  }
});

