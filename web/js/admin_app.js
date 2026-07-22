/* global supabase */

// localStorage 用的儲存鍵名：用來保存使用者輸入的 Supabase 連線資訊（URL 與 Anon Key）
const LS_KEY = 'loveisabitmessy_supabase_conn_v1';

// 簡易版 document.querySelector 包裝函式，減少重複打字
function qs(sel) { return document.querySelector(sel); }
// 簡易版 document.querySelectorAll 包裝函式，並將結果轉成陣列方便使用 forEach/map 等陣列方法
function qsa(sel) { return Array.from(document.querySelectorAll(sel)); }

// 從 localStorage 讀取先前儲存的 Supabase 連線設定
// 若解析失敗（例如資料損毀或不存在）則回傳空物件，避免整個頁面出錯
function loadConn() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}

// 將 Supabase 連線設定（URL、Anon Key）寫入 localStorage，供下次開啟頁面時自動帶入
function saveConn(conn) {
  localStorage.setItem(LS_KEY, JSON.stringify(conn));
}

// 更新畫面上「連線狀態」文字區塊的內容，讓使用者知道目前登入/初始化狀態
function setStatus(text) {
  const el = qs('#conn-status');
  el.textContent = text;
}

// 將物件格式化成排版整齊（縮排 2 空格）的 JSON 字串，方便在畫面上顯示 card_json 等內容
function prettyJson(obj) {
  return JSON.stringify(obj, null, 2);
}

// 全域變數：保存目前使用中的 Supabase client 實例，初始化前為 null
let sb = null;

// 取得目前的 Supabase client；若尚未呼叫過 initSupabase() 完成初始化，則丟出錯誤
function getClient() {
  if (!sb) throw new Error('Supabase 尚未初始化');
  return sb;
}

// 依照是否已登入（isAuthed）切換畫面上需要登入才能看到的區塊顯示/隱藏
// 注意：目前 diary（日記）與 lpas（測驗紀錄）分頁預設隱藏，僅角色分頁在登入後顯示
function showAuthedUI(isAuthed) {
  qs('#tabs').style.display = isAuthed ? '' : 'none';
  qs('#tab-characters').style.display = isAuthed ? '' : 'none';
  qs('#tab-diary').style.display = 'none';
  qs('#tab-lpas').style.display = 'none';
  qs('#btn-logout').style.display = isAuthed ? '' : 'none';
}

// 切換分頁（角色 / 日記 / 測驗紀錄）：更新分頁按鈕的 active 樣式，並顯示對應內容區塊、隱藏其餘區塊
function activateTab(tabName) {
  qsa('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  qs('#tab-characters').style.display = tabName === 'characters' ? '' : 'none';
  qs('#tab-diary').style.display = tabName === 'diary' ? '' : 'none';
  qs('#tab-lpas').style.display = tabName === 'lpas' ? '' : 'none';
}

// 初始化 Supabase client，並在初始化完成後檢查是否已有登入 session
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

  // 檢查目前是否已有有效的登入 session（例如上次登入後尚未過期）
  const { data } = await sb.auth.getSession();
  showAuthedUI(!!data.session);
  if (data.session) {
    // 已有 session：視為自動登入成功，顯示登入者 Email，切換到角色分頁並載入角色清單
    setStatus(`已登入：${data.session.user.email}`);
    activateTab('characters');
    await refreshCharacters();
  } else {
    // 尚無 session：提示使用者需要手動登入/註冊
    setStatus('尚未登入（第一次需註冊/登入；之後會自動登入）。');
  }
}

// 使用 Email + 密碼登入 Supabase，登入成功後更新畫面狀態並載入角色清單
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

// 登出目前使用者，並將畫面切回未登入狀態
async function logout() {
  const { error } = await getClient().auth.signOut();
  if (error) throw error;
  showAuthedUI(false);
  setStatus('已登出。');
}

// 重新查詢並渲染「角色卡」清單（characters 資料表）
// 包含每筆角色的基本資訊、操作按鈕（編輯／啟用停用／刪除），以及可展開查看的 card_json 內容
async function refreshCharacters() {
  const el = qs('#characters-list');
  el.innerHTML = '<div class="muted">載入中…</div>';

  // 向 Supabase 查詢角色資料，依更新時間新到舊排序，最多取 200 筆
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

  // 逐筆將角色資料轉成 DOM 元素並插入清單容器
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

  // 為每個角色卡片上的操作按鈕（編輯／啟用停用／刪除）綁定點擊事件
  el.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const action = btn.dataset.action;
      const id = btn.dataset.id;
      const row = data.find(r => r.id === id);
      if (!row) return;

      try {
        if (action === 'edit') {
          // 編輯：將該筆角色資料填入上方表單，方便使用者修改後再儲存
          qs('#char-id').value = row.id;
          qs('#char-name').value = row.name;
          qs('#char-source').value = row.source || 'manual';
          qs('#char-json').value = prettyJson(row.card_json);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else if (action === 'toggle') {
          // 啟用/停用切換：反轉 is_active 欄位值後更新資料庫，再重新載入清單
          const { error } = await getClient().from('characters').update({ is_active: !row.is_active }).eq('id', id);
          if (error) throw error;
          await refreshCharacters();
        } else if (action === 'delete') {
          // 刪除：先跳出確認視窗，確認後才真正刪除該筆角色資料，再重新載入清單
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

// 新增或更新（upsert）一筆角色卡資料
// 會從表單讀取 ID、名稱、來源、JSON 字串，驗證並解析 JSON 後寫入資料庫
async function upsertCharacter() {
  const id = qs('#char-id').value.trim();
  const name = qs('#char-name').value.trim();
  const source = qs('#char-source').value.trim() || 'manual';
  const raw = qs('#char-json').value.trim();
  if (!id || !name || !raw) throw new Error('請填入角色 ID、角色名稱、角色卡 JSON');

  // 嘗試解析使用者輸入的角色卡 JSON 字串，格式錯誤時提示使用者
  let card;
  try { card = JSON.parse(raw); } catch { throw new Error('角色卡 JSON 格式不正確'); }

  // 依 id 欄位做 upsert（若 id 已存在則更新，不存在則新增）
  const payload = { id, name, source, card_json: card };
  const { error } = await getClient().from('characters').upsert(payload, { onConflict: 'id' });
  if (error) throw error;

  // 儲存成功後清空表單欄位，並重新載入角色清單以顯示最新資料
  qs('#char-id').value = '';
  qs('#char-name').value = '';
  qs('#char-json').value = '';
  await refreshCharacters();
}

// 重新查詢並渲染「日記」清單（diary_entries 資料表），以表格方式呈現
async function refreshDiary() {
  const el = qs('#diary-list');
  el.innerHTML = '<div class="muted">載入中…</div>';
  // 查詢日記資料，依日記日期新到舊排序，最多取 200 筆
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

  // 將日記資料組成 HTML 表格字串並整段插入畫面
  // 注意：文字內容一律經過 escapeHtml 處理，避免使用者輸入內容中的特殊字元破壞 HTML 結構（防止 XSS）
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

// 重新查詢並渲染「LPAS 測驗紀錄」清單（lpas_sessions 資料表），以表格方式呈現
async function refreshLPAS() {
  const el = qs('#lpas-list');
  el.innerHTML = '<div class="muted">載入中…</div>';

  // 查詢測驗紀錄資料，依建立時間新到舊排序，最多取 200 筆
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

  // 將測驗紀錄資料組成 HTML 表格字串並整段插入畫面（同樣使用 escapeHtml 避免 XSS）
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

// 將字串中的 HTML 特殊字元（& < > " '）轉換成對應的 HTML 實體
// 用於將使用者資料安全地插入 innerHTML，避免 HTML 注入 / XSS 攻擊
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 頁面載入完成後執行的主要初始化邏輯：
// 還原先前儲存的連線設定、綁定各個按鈕與分頁的事件、並嘗試自動初始化 Supabase（若已有連線資訊）
window.addEventListener('load', async () => {
  const conn = loadConn();
  // 若先前有儲存過連線資訊，將其帶回輸入框中顯示
  if (conn.url) qs('#sb-url').value = conn.url;
  if (conn.anon) qs('#sb-anon').value = conn.anon;

  // 「儲存連線設定」按鈕：將輸入框中的 URL / Anon Key 存入 localStorage，並嘗試初始化 Supabase
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

  // 「登入」按鈕：先確保 Supabase 已初始化，再執行登入流程
  qs('#btn-login').addEventListener('click', async () => {
    try { await initSupabase(); await login(); } catch (e) { alert(e.message || e); }
  });

  // 「登出」按鈕：執行登出流程
  qs('#btn-logout').addEventListener('click', async () => {
    try { await logout(); } catch (e) { alert(e.message || e); }
  });

  // 為所有分頁標籤（角色／日記／測驗紀錄）綁定點擊事件：切換分頁並載入對應資料
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

  // 「儲存角色」按鈕：呼叫 upsertCharacter() 新增/更新角色卡
  qs('#btn-save-character').addEventListener('click', async () => {
    try { await upsertCharacter(); } catch (e) { alert(e.message || e); }
  });
  // 「重新整理角色清單」按鈕
  qs('#btn-refresh-characters').addEventListener('click', async () => {
    try { await refreshCharacters(); } catch (e) { alert(e.message || e); }
  });
  // 「重新整理日記清單」按鈕
  qs('#btn-refresh-diary').addEventListener('click', async () => {
    try { await refreshDiary(); } catch (e) { alert(e.message || e); }
  });
  // 「重新整理測驗紀錄清單」按鈕
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
    // 忽略初始化過程中的錯誤（例如尚未設定連線資訊時屬正常情況）
  }
});
