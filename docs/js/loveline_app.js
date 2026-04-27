/**
 * loveline_app.js — LoveLine 聊天應用邏輯
 */
'use strict';

const qs = (s) => document.querySelector(s);

// ── State ──
const state = {
  currentUser: null,       // { key, name }
  users: [],               // [{ key, name }]
  sessions: [],            // chat_sessions + participants
  currentSession: null,    // { id, type, title, participants, messages }
  characters: [],          // cloud characters
  serverOnline: false,
  currentModel: 'gemma4',
};

// ── Supabase ──
function getSB() {
  if (window.SupabaseClient) return window.SupabaseClient.getClient();
  return null;
}

// ── Init ──
window.addEventListener('load', async () => {
  if (window.SupabaseClient) window.SupabaseClient.init();
  await loadCharacters(); // 先讀角色再 render，因為 user edit modal 需要角色選單
  await loadUsersFromCloud(); // 改從雲端載入或同步
  renderUserSelect();
  startServerPolling();
  setupEventListeners();
  appendLog('💌 LoveLine 已載入');
});

// ══════════════════════════════════════════
// USER MANAGEMENT (Supabase Sync)
// ══════════════════════════════════════════
async function loadUsersFromCloud() {
  const sb = getSB();
  if (!sb) { loadUsersFromLocal(); return; }

  try {
    const rawLocal = localStorage.getItem('loveline_users');
    let localUsers = rawLocal ? JSON.parse(rawLocal) : [];
    if (localUsers.length === 0) localUsers = [{ key: 'user_default', name: '我' }];

    // 從雲端抓取所有使用者資料
    const { data: cloudData, error } = await sb.from('love_line_users').select('*');
    if (error) throw error;

    if (cloudData && cloudData.length > 0) {
      // 將雲端的 users 合併進來
      const merged = [...localUsers];
      cloudData.forEach(cloud => {
          const existing = merged.find(u => u.key === cloud.user_key);
          if (existing) {
              existing.name = cloud.nickname;
              existing.char_id = cloud.char_id;
              existing.persona = cloud.persona;
              existing.extra = cloud.extra_info;
          } else {
              merged.push({
                  key: cloud.user_key,
                  name: cloud.nickname,
                  char_id: cloud.char_id,
                  persona: cloud.persona,
                  extra: cloud.extra_info
              });
          }
      });
      state.users = merged;
    } else {
      state.users = localUsers;
    }

    const lastKey = localStorage.getItem('loveline_current_user');
    const found = state.users.find(u => u.key === lastKey);
    state.currentUser = found || state.users[0];
    saveUsersToLocal();
  } catch (e) {
    appendLog('⚠️ 雲端使用者同步失敗，切換至離線模式');
    loadUsersFromLocal();
  }
}

function loadUsersFromLocal() {
  try {
    const raw = localStorage.getItem('loveline_users');
    state.users = raw ? JSON.parse(raw) : [{ key: 'user_default', name: '我', char_id: '', persona: '', extra: '' }];
    const lastKey = localStorage.getItem('loveline_current_user');
    state.currentUser = state.users.find(u => u.key === lastKey) || state.users[0];
  } catch (e) { state.users = [{ key: 'user_default', name: '我' }]; }
}

function saveUsersToLocal() {
  localStorage.setItem('loveline_users', JSON.stringify(state.users));
}

async function saveUserProfileToCloud(u) {
  const sb = getSB();
  if (!sb) return;
  try {
    await sb.from('love_line_users').upsert({
      user_key: u.key, nickname: u.name,
      char_id: u.char_id, persona: u.persona, extra_info: u.extra
    });
  } catch (e) { appendLog('❌ 雲端同步失敗: ' + e.message); }
}

function renderUserSelect() {
  const sel = qs('#user-select');
  sel.innerHTML = state.users.map(u =>
    `<option value="${u.key}" ${state.currentUser?.key === u.key ? 'selected' : ''}>${u.name}</option>`
  ).join('');
  updateUserDisplay();
}

function updateUserDisplay() {
  const u = state.currentUser;
  if (!u) return;
  qs('#current-user-name').textContent = u.name;
  qs('#user-avatar-icon').textContent = u.name[0] || '👤';
  localStorage.setItem('loveline_current_user', u.key);

  // 切換使用者時，淨空右欄對話內容
  state.currentSession = null;
  renderChatArea();

  loadSessionsForUser();
}

function openUserEditModal() {
  const u = state.currentUser;
  if (!u) return;
  qs('#modal-user-name').value = u.name || '';
  qs('#modal-user-char-select').value = u.char_id || '';
  qs('#modal-user-persona').value = u.persona || '';
  qs('#modal-user-extra').value = u.extra || '';
  qs('#modal-user-edit').classList.remove('hidden');
}

// ══════════════════════════════════════════
// CHARACTERS
// ══════════════════════════════════════════
async function loadCharacters() {
  try {
    const sb = getSB();
    if (!sb) return;
    const { data } = await sb.from('characters').select('id,name,card_json,is_active').eq('is_active', true).order('name');
    if (data) state.characters = data;
    populateCharSelects();
  } catch (e) { appendLog('⚠️ 角色讀取失敗: ' + e.message); }
}

function populateCharSelects() {
  const opts = state.characters.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
  if (qs('#modal-friend-char-select')) {
      qs('#modal-friend-char-select').innerHTML = '<option value="">— 選擇角色卡 —</option>' + opts;
  }
  qs('#modal-user-char-select').innerHTML = '<option value="">— 無 —</option>' + opts;
}

// ══════════════════════════════════════════
// SESSIONS (Supabase)
// ══════════════════════════════════════════
async function loadSessionsForUser() {
  if (!state.currentUser) return;
  const sb = getSB();
  if (!sb) { renderSessionLists(); return; }
  try {
    const { data: sessions } = await sb
      .from('chat_sessions')
      .select(`id, session_type, title, owner_key, updated_at,
               chat_participants(id, participant_type, character_id, character_name, user_key)`)
      .eq('owner_key', state.currentUser.key)
      .order('updated_at', { ascending: false });
    state.sessions = sessions || [];
    renderSessionLists();
  } catch (e) { appendLog('⚠️ 讀取對話失敗: ' + e.message); }
}

async function createSession(type, title, charIds, charPersona) {
  if (!state.currentUser) { alert('請先選擇使用者'); return; }
  const sb = getSB();
  if (!sb) { alert('Supabase 未連線'); return; }
  try {
    const { data: sess, error } = await sb.from('chat_sessions').insert({
      session_type: type, title, owner_key: state.currentUser.key
    }).select().single();
    if (error) throw error;

    // add participants
    const parts = charIds.map(cid => {
      const c = state.characters.find(x => x.id === cid);
      return {
        session_id: sess.id, participant_type: 'character',
        character_id: cid, character_name: c?.name || cid
      };
    });
    if (parts.length) await sb.from('chat_participants').insert(parts);

    // save persona override in localStorage
    if (charPersona) localStorage.setItem(`loveline_persona_${sess.id}`, charPersona);

    await loadSessionsForUser();
    openSession(sess.id);
  } catch (e) { appendLog('❌ 建立對話失敗: ' + e.message); }
}

async function deleteSession(id) {
  if (!confirm('確定要刪除這位好友與對話紀錄？')) return;
  const sb = getSB();
  if (!sb) return;
  try {
    await sb.from('chat_sessions').delete().eq('id', id);
    if (state.currentSession?.id === id) {
      state.currentSession = null;
      renderChatArea();
    }
    await loadSessionsForUser();
  } catch (e) { appendLog('❌ 刪除失敗: ' + e.message); }
}

// ══════════════════════════════════════════
// MESSAGES (Supabase)
// ══════════════════════════════════════════
async function loadMessages(sessionId) {
  const sb = getSB();
  if (!sb) return [];
  try {
    const { data } = await sb.from('chat_messages')
      .select('*').eq('session_id', sessionId)
      .order('created_at', { ascending: true });
    return data || [];
  } catch (e) { return []; }
}

async function saveMessage(sessionId, senderType, senderKey, senderCharId, senderName, content, model) {
  const sb = getSB();
  if (!sb) return;
  try {
    await sb.from('chat_messages').insert({
      session_id: sessionId, sender_type: senderType,
      sender_key: senderKey || null, sender_char_id: senderCharId || null,
      sender_name: senderName, content, model_used: model || null
    });
    // update session timestamp
    await sb.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId);
  } catch (e) { appendLog('⚠️ 訊息儲存失敗: ' + e.message); }
}

// ══════════════════════════════════════════
// OPEN SESSION
// ══════════════════════════════════════════
async function openSession(id) {
  const sess = state.sessions.find(s => String(s.id) === String(id));
  if (!sess) return;

  // 立即清空目前畫面，給使用者載入中的感覺
  qs('#chat-messages').innerHTML = '<div style="text-align:center;padding:20px;color:#666;">載入對話中...</div>';
  qs('#chat-title').textContent = sess.title || '載入中...';

  // 標記選中狀態
  document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
  const el = document.querySelector(`.chat-item[data-id="${id}"]`);
  if (el) el.classList.add('active');

  try {
    const messages = await loadMessages(id);
    const persona = localStorage.getItem(`loveline_persona_${id}`) || '';
    const extra = localStorage.getItem(`loveline_extra_${id}`) || '';
    state.currentSession = { ...sess, messages, persona, extra };
    renderChatArea();
  } catch (e) {
    appendLog('❌ 載入對話失敗: ' + e.message);
  }
}

// ══════════════════════════════════════════
// RENDER: session lists
// ══════════════════════════════════════════
function renderSessionLists() {
  const one = state.sessions.filter(s => s.session_type === 'one_on_one');
  const grp = state.sessions.filter(s => s.session_type === 'group');

  qs('#list-1on1').innerHTML = one.length ? one.map(s => sessionItem(s)).join('') :
    '<div style="font-size:0.75rem;color:#555;padding:6px 8px;">尚無對話</div>';
  qs('#list-group').innerHTML = grp.length ? grp.map(s => sessionItem(s)).join('') :
    '<div style="font-size:0.75rem;color:#555;padding:6px 8px;">尚無聊天室</div>';

  // 使用事件委託來處理齒輪點擊，解決動態渲染失效問題
}

function sessionItem(s) {
  const parts = s.chat_participants || [];
  const names = parts.filter(p => p.participant_type === 'character').map(p => p.character_name).join('、');
  const title = s.title || names || '未命名';
  const icon = s.session_type === 'group' ? '👥' : '💬';
  const isActive = state.currentSession?.id === s.id ? 'active' : '';
  return `
    <div class="chat-item ${isActive}" data-id="${s.id}">
      <div class="chat-avatar ${s.session_type === 'group' ? 'group' : ''}">${icon}</div>
      <div class="chat-info">
        <div class="chat-name">${title}</div>
        <div class="chat-preview">${names || '點擊開始聊天'}</div>
      </div>
      <button class="chat-item-btn" data-id="${s.id}" title="設定">⚙️</button>
    </div>`;
}

// ══════════════════════════════════════════
// RENDER: chat area
// ══════════════════════════════════════════
function renderChatArea() {
  const sess = state.currentSession;
  const empty = qs('#empty-state');
  const input = qs('#msg-input');
  const btnSend = qs('#btn-send');
  const btnClear = qs('#btn-clear-chat');

  if (!sess) {
    if (empty) empty.style.display = 'flex';
    qs('#chat-messages').innerHTML = '';
    input.disabled = true; btnSend.disabled = true; btnClear.disabled = true;
    qs('#chat-title').textContent = '請選擇一個對話';
    qs('#chat-subtitle').textContent = '';
    return;
  }

  // header
  const parts = sess.chat_participants || [];
  const charNames = parts.filter(p => p.participant_type === 'character').map(p => p.character_name).join('、');
  qs('#chat-title').textContent = sess.title || charNames || '未命名';
  qs('#chat-subtitle').textContent = sess.session_type === 'group' ? `聊天室・${charNames}` : charNames;
  qs('#chat-header-avatar').textContent = sess.session_type === 'group' ? '👥' : '💬';

  input.disabled = false; btnSend.disabled = false; btnClear.disabled = false;
  empty.style.display = 'none';

  renderMessages();
}

function renderMessages() {
  const sess = state.currentSession;
  if (!sess) return;
  const container = qs('#chat-messages');
  const msgs = sess.messages || [];

  container.innerHTML = msgs.length ? '' : '<div style="text-align:center;color:#444;font-size:0.8rem;padding:20px;">開始你的第一則訊息吧！</div>';

  msgs.forEach(m => {
    const isUser = m.sender_type === 'user';
    const time = new Date(m.created_at).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'msg-row' + (isUser ? ' user' : '');
    div.innerHTML = `
      <div class="msg-avatar">${isUser ? (state.currentUser?.name[0] || '我') : (m.sender_name?.[0] || '🤖')}</div>
      <div class="msg-bubble-wrap">
        <div class="msg-sender">${m.sender_name || '未知'}</div>
        <div class="msg-bubble">${escHtml(m.content)}</div>
        <div class="msg-time">${time}</div>
      </div>`;
    container.appendChild(div);
  });

  // 使用 requestAnimationFrame 確保 DOM 已渲染再捲動
  requestAnimationFrame(() => {
    container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
  });
}

function escHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function addTypingIndicator(name) {
  const container = qs('#chat-messages');
  const div = document.createElement('div');
  div.className = 'msg-row msg-typing';
  div.id = 'typing-indicator';
  div.innerHTML = `
    <div class="msg-avatar">${name?.[0] || '🤖'}</div>
    <div class="msg-bubble-wrap">
      <div class="msg-sender">${name}</div>
      <div class="msg-bubble">正在輸入中…</div>
    </div>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function removeTypingIndicator() {
  document.getElementById('typing-indicator')?.remove();
}

// ══════════════════════════════════════════
// SEND MESSAGE & AI REPLY
// ══════════════════════════════════════════
async function sendMessage() {
  const sess = state.currentSession;
  if (!sess || !state.currentUser) return;
  const input = qs('#msg-input');
  const content = input.value.trim();
  if (!content) return;
  input.value = ''; input.style.height = 'auto';

  const userName = state.currentUser.name;
  const now = new Date().toISOString();
  
  appendLog(`🗣️ 使用者 (${userName}) 發送訊息: ${content}`);

  // optimistic UI
  const tempMsg = {
    id: 'tmp', session_id: sess.id, sender_type: 'user',
    sender_key: state.currentUser.key, sender_name: userName, content, created_at: now
  };

  if (!sess.messages) sess.messages = [];
  sess.messages.push(tempMsg);
  renderMessages();

  // save to DB
  await saveMessage(sess.id, 'user', state.currentUser.key, null, userName, content, null);

  // get AI reply for each character participant
  const charParts = (sess.chat_participants || []).filter(p => p.participant_type === 'character');
  for (const part of charParts) {
    await getAIReply(sess, part, content);
  }
}

async function getAIReply(sess, participant, userMessage) {
  if (!state.serverOnline) return;
  const charData = state.characters.find(c => c.id === participant.character_id);
  if (!charData) return;

  const charName = participant.character_name || charData.name;
  addTypingIndicator(charName);
  qs('#btn-send').disabled = true;

  try {
    // 取得當前使用者的詳細設定
    const u = state.currentUser;
    const userChar = state.characters.find(c => c.id === u.char_id);

    // build history for context
    const history = (sess.messages || []).slice(-30).map(m => ({
      role: m.sender_type === 'user' ? 'user' : 'assistant',
      name: m.sender_name,
      content: m.content
    }));

    const payload = {
      session_id: sess.id,
      character: charData.card_json || {},
      character_id: charData.id,
      character_name: charName,

      // 角色對話設定
      persona_override: sess.persona || '',
      session_extra: sess.extra || '',

      // 使用者設定
      user_name: u.name,
      user_character: userChar?.card_json || {},
      user_persona_override: u.persona || '',
      user_extra: u.extra || '',

      user_message: userMessage,
      history,
      model: state.currentModel || 'gemma4',
      model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null,
      writer_settings: (window.WriterSettingsApp && window.WriterSettingsApp.getSelectedContext()) || null,
      session_type: sess.session_type,
      participants: (sess.chat_participants || [])
        .filter(p => p.character_id !== participant.character_id)
        .map(p => {
          const charInfo = state.characters.find(c => c.id === p.character_id);
          return {
            name: p.character_name,
            card_json: charInfo ? charInfo.card_json : {}
          };
        })
    };

    const res = await fetch('http://localhost:8000/api/chat_reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    removeTypingIndicator();

    if (res.ok) {
      const data = await res.json();
      const reply = data.reply || '（無回應）';
      if (data.debug_prompt) {
          appendLog(`\n--- 🤖 AI Prompt generated by prompt_utils.py ---\n${data.debug_prompt}\n-----------------------------------------------`);
      }
      appendLog(`🤖 接收到 AI (${charName}) 的回答: ${reply}`);
      
      const now = new Date().toISOString();
      const aiMsg = {
        id: 'tmp_ai', session_id: sess.id, sender_type: 'character',
        sender_char_id: charData.id, sender_name: charName, content: reply, created_at: now
      };

      if (!sess.messages) sess.messages = [];
      sess.messages.push(aiMsg);
      renderMessages();
      await saveMessage(sess.id, 'character', null, charData.id, charName, reply, state.currentModel);
    } else {
      appendLog('⚠️ AI 回覆失敗: HTTP ' + res.status);
    }
  } catch (e) {
    removeTypingIndicator();
    appendLog('❌ AI 回覆錯誤: ' + e.message);
  } finally {
    qs('#btn-send').disabled = false;
  }
}

// ══════════════════════════════════════════
// MODALS
// ══════════════════════════════════════════
function openEditModal(id) {
  appendLog(`🛠️ 正在準備彈窗: [${id}]`);
  try {
    const sess = state.sessions.find(s => String(s.id) === String(id));
    if (!sess) {
      appendLog(`❌ 錯誤: 在 state.sessions 中找不到 ID 為 ${id} 的對話`);
      return;
    }

    if (sess.session_type === 'group') {
      qs('#modal-group-title').textContent = '⚙️ 聊天室設定';
      qs('#modal-group-name').value = sess.title || '';
      
      const friends = state.sessions.filter(s => s.session_type === 'one_on_one');
      const checks = friends.map(f => {
        const charPart = (f.chat_participants || []).find(p => p.participant_type === 'character');
        const cid = charPart ? charPart.character_id : '';
        if (!cid) return '';
        return `
          <div class="char-check-item">
            <input type="checkbox" id="gf_${f.id}" value="${cid}">
            <label for="gf_${f.id}">${f.title || '未命名好友'}</label>
          </div>`;
      }).join('');
      qs('#modal-group-chars').innerHTML = checks || '<span style="color:#666;font-size:0.8rem;">尚無可加入的好友</span>';
      
      const parts = sess.chat_participants || [];
      document.querySelectorAll('#modal-group-chars input[type=checkbox]').forEach(cb => {
          cb.checked = parts.some(p => p.character_id === cb.value);
      });
      
      qs('#modal-group-bg-data').value = localStorage.getItem(`loveline_extra_${id}`) || sess.extra || '';
      
      qs('#btn-modal-group-delete').style.display = 'block';
      qs('#btn-modal-group-delete').dataset.id = id;
      qs('#btn-modal-group-ok').dataset.id = id;
      qs('#modal-group').classList.remove('hidden');
    } else {
      qs('#modal-friend-title').textContent = '⚙️ 好友設定';
      qs('#modal-friend-name').value = sess.title || '';
      
      const charPart = (sess.chat_participants || []).find(p => p.participant_type === 'character');
      qs('#modal-friend-char-select').value = charPart ? charPart.character_id : '';
      
      qs('#modal-friend-persona').value = localStorage.getItem(`loveline_persona_${id}`) || sess.persona || '';
      qs('#modal-friend-extra').value = localStorage.getItem(`loveline_extra_${id}`) || sess.extra || '';
      
      qs('#btn-modal-friend-delete').style.display = 'block';
      qs('#btn-modal-friend-delete').dataset.id = id;
      qs('#btn-modal-friend-ok').dataset.id = id;
      qs('#modal-friend').classList.remove('hidden');
    }
    appendLog(`✨ 彈窗已開啟`);
  } catch (err) {
    appendLog(`❌ openEditModal 執行崩潰: ${err.message}`);
    console.error(err);
  }
}

// ══════════════════════════════════════════
// SERVER STATUS
// ══════════════════════════════════════════
let serverPollTimer = null;
let lastModelFetch = 0;

async function checkServerStatus() {
  const dot = qs('#server-dot');
  const txt = qs('#server-status-text');
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch('http://localhost:8000/api/status', { signal: ctrl.signal });
    clearTimeout(t);
    if (res.ok) {
      if (!state.serverOnline) {
        state.serverOnline = true;
        appendLog('✅ debug_server.py 已連線');
        fetchModels();
        recoverMissedReplies(); // 伺服器恢復連線，檢查是否有漏掉的回覆
      }
      dot.className = 'dot online flash';
      setTimeout(() => dot.classList.remove('flash'), 500);
      txt.textContent = '✅ 伺服器運行中';
      return;
    }
  } catch (e) { }
  if (state.serverOnline) appendLog('❌ debug_server.py 失去連線');
  state.serverOnline = false;
  dot.className = 'dot';
  txt.textContent = '❌ 伺服器未啟動';
}

async function fetchModels() {
  try {
    const res = await fetch('http://localhost:8000/api/models');
    if (!res.ok) return;
    const models = await res.json();
    const sel = qs('#model-select');
    sel.innerHTML = models.map(m => `<option value="${m}" ${m === state.currentModel ? 'selected' : ''}>${m}</option>`).join('');
    state.currentModel = sel.value;
    lastModelFetch = Date.now();
  } catch (e) { }
}

/**
 * 檢查所有對話，如果最後一則是使用者發言，則觸發 AI 補發回覆
 */
async function recoverMissedReplies() {
  if (state.sessions.length === 0) return;
  appendLog('🔍 正在檢查是否有漏掉的角色回覆...');

  for (const sess of state.sessions) {
    const messages = await loadMessages(sess.id);
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.sender_type === 'user') {
        appendLog(`📝 發現對話 [${sess.title || sess.id}] 需要補發回覆`);

        // 確保 sess 有 messages 陣列
        sess.messages = messages;

        // 如果目前剛好停留在這個 session，直接渲染
        if (state.currentSession?.id === sess.id) {
          state.currentSession.messages = messages;
          renderMessages();
          appendLog(`完成補發回覆: [${sess.title}]`);
        }

        // 取得所有角色參與者
        const charParts = (sess.chat_participants || []).filter(p => p.participant_type === 'character');
        for (const part of charParts) {
          getAIReply(sess, part, lastMsg.content);
        }
      }
    }
  }
}

function startServerPolling() {
  checkServerStatus();
  if (serverPollTimer) return;
  serverPollTimer = setInterval(checkServerStatus, 5000);
}

// ══════════════════════════════════════════
// LOG
// ══════════════════════════════════════════
function appendLog(text) {
  const box = qs('#log-output');
  if (!box) return;
  const t = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  box.textContent += `[${t}] ${text}\n`;
  box.scrollTop = box.scrollHeight;
}

// ══════════════════════════════════════════
// EVENT LISTENERS
// ══════════════════════════════════════════
function setupEventListeners() {
  // ── 使用事件委託處理列表點擊 ──
  const midPanel = qs('#panel-mid');
  if (midPanel) {
    midPanel.addEventListener('click', (e) => {
      // 1. 檢查是否點擊到齒輪按鈕 (或按鈕內的圖示)
      const gearBtn = e.target.closest('.chat-item-btn');
      if (gearBtn) {
        e.stopPropagation();
        const id = gearBtn.dataset.id;
        appendLog(`⚙️ 點擊設定: [${id}]`);
        openEditModal(id);
        return;
      }

      // 2. 檢查是否點擊到對話項目
      const chatItem = e.target.closest('.chat-item');
      if (chatItem) {
        const id = chatItem.dataset.id;
        openSession(id);
      }
    });
  }

  // User select
  qs('#user-select').addEventListener('change', e => {
    state.currentUser = state.users.find(u => u.key === e.target.value) || null;
    updateUserDisplay();
  });

  // Add user
  qs('#btn-add-user').addEventListener('click', async () => {
    const input = qs('#new-user-input');
    const name = input.value.trim();
    if (!name) return;
    const key = 'user_' + Date.now();
    const newUser = { key, name, char_id: '', persona: '', extra: '' };
    state.users.push(newUser);
    saveUsersToLocal();
    await saveUserProfileToCloud(newUser);
    state.currentUser = newUser;
    input.value = '';
    renderUserSelect();
  });

  // User profile edit
  qs('#btn-edit-user-profile').addEventListener('click', openUserEditModal);
  qs('#btn-modal-user-cancel').addEventListener('click', () => qs('#modal-user-edit').classList.add('hidden'));
  qs('#btn-modal-user-ok').addEventListener('click', async () => {
    const u = state.currentUser;
    if (!u) return;
    u.name = qs('#modal-user-name').value.trim() || u.name;
    u.char_id = qs('#modal-user-char-select').value;
    u.persona = qs('#modal-user-persona').value;
    u.extra = qs('#modal-user-extra').value;
    saveUsersToLocal();
    await saveUserProfileToCloud(u);
    qs('#modal-user-edit').classList.add('hidden');
    renderUserSelect();
    appendLog('✅ 使用者設定已儲存至雲端');
  });

  // Collapse left
  qs('#btn-collapse-left').addEventListener('click', () => {
    const shell = qs('#app-shell');
    const collapsed = shell.classList.toggle('left-collapsed');
    qs('#btn-collapse-left').textContent = collapsed ? '▶' : '◀';
    qs('#collapsed-icon').style.display = collapsed ? 'flex' : 'none';
  });

  // New 1-on-1 (Friend)
  qs('#btn-new-1on1').addEventListener('click', () => {
    if (!state.currentUser) { alert('請先選擇使用者'); return; }
    qs('#modal-friend-title').textContent = '💬 新增好友';
    qs('#modal-friend-name').value = '';
    qs('#modal-friend-char-select').value = '';
    qs('#modal-friend-persona').value = '';
    qs('#modal-friend-extra').value = '';
    qs('#btn-modal-friend-delete').style.display = 'none';
    qs('#btn-modal-friend-ok').dataset.id = '';
    qs('#modal-friend').classList.remove('hidden');
    appendLog(`✨ 開啟「新增好友」彈窗`);
  });
  qs('#btn-modal-friend-cancel').addEventListener('click', () => {
      qs('#modal-friend').classList.add('hidden');
      appendLog(`❌ 取消「新增好友 / 好友設定」彈窗`);
  });
  qs('#btn-modal-friend-ok').addEventListener('click', async () => {
    const id = qs('#btn-modal-friend-ok').dataset.id;
    const name = qs('#modal-friend-name').value.trim();
    const charId = qs('#modal-friend-char-select').value;
    const persona = qs('#modal-friend-persona').value;
    const extra = qs('#modal-friend-extra').value;

    if (!id) {
        if (!name) { alert('請輸入好友名稱'); return; }
        const exists = state.sessions.some(s => s.session_type === 'one_on_one' && s.title === name);
        if (exists) { alert('不可與現有其他好友同名'); return; }
        
        qs('#modal-friend').classList.add('hidden');
        await createSession('one_on_one', name, charId ? [charId] : [], persona);
        
        // Retrieve new session ID to set extra if provided
        const newSess = state.sessions.find(s => s.session_type === 'one_on_one' && s.title === name);
        if (newSess && extra) {
             localStorage.setItem(`loveline_extra_${newSess.id}`, extra);
        }
    } else {
        if (persona) localStorage.setItem(`loveline_persona_${id}`, persona);
        else localStorage.removeItem(`loveline_persona_${id}`);

        if (extra) localStorage.setItem(`loveline_extra_${id}`, extra);
        else localStorage.removeItem(`loveline_extra_${id}`);

        const sb = getSB();
        if (sb && name) await sb.from('chat_sessions').update({ title: name }).eq('id', id);
        qs('#modal-friend').classList.add('hidden');

        if (state.currentSession?.id === id) {
          state.currentSession.title = name;
          state.currentSession.persona = persona;
          state.currentSession.extra = extra;
          renderChatArea();
        }
        await loadSessionsForUser();
        appendLog(`💾 儲存好友設定完成: ${name}`);
    }
  });
  qs('#btn-modal-friend-delete').addEventListener('click', () => {
    const id = qs('#btn-modal-friend-delete').dataset.id;
    qs('#modal-friend').classList.add('hidden');
    deleteSession(id);
  });

  // New group
  qs('#btn-new-group').addEventListener('click', () => {
    if (!state.currentUser) { alert('請先選擇使用者'); return; }
    qs('#modal-group-title').textContent = '👥 建立聊天室';
    qs('#modal-group-name').value = '';
    
    const friends = state.sessions.filter(s => s.session_type === 'one_on_one');
    const checks = friends.map(f => {
      const charPart = (f.chat_participants || []).find(p => p.participant_type === 'character');
      const cid = charPart ? charPart.character_id : '';
      if (!cid) return '';
      return `
        <div class="char-check-item">
          <input type="checkbox" id="gf_${f.id}" value="${cid}">
          <label for="gf_${f.id}">${f.title || '未命名好友'}</label>
        </div>`;
    }).join('');
    qs('#modal-group-chars').innerHTML = checks || '<span style="color:#666;font-size:0.8rem;">尚無可加入的好友</span>';
    
    qs('#modal-group-bg-data').value = '';
    qs('#btn-modal-group-delete').style.display = 'none';
    qs('#btn-modal-group-ok').dataset.id = '';
    qs('#modal-group').classList.remove('hidden');
    appendLog(`✨ 開啟「建立聊天室」彈窗`);
  });
  qs('#btn-modal-group-cancel').addEventListener('click', () => {
      qs('#modal-group').classList.add('hidden');
      appendLog(`❌ 取消「建立聊天室 / 聊天室設定」彈窗`);
  });
  qs('#btn-modal-group-ok').addEventListener('click', async () => {
    const id = qs('#btn-modal-group-ok').dataset.id;
    const title = qs('#modal-group-name').value.trim() || '群組聊天';
    const checked = [...document.querySelectorAll('#modal-group-chars input:checked')].map(cb => cb.value);
    const bgData = qs('#modal-group-bg-data').value;
    
    if (!id) {
        if (checked.length === 0) { alert('請至少選擇一位角色'); return; }
        qs('#modal-group').classList.add('hidden');
        await createSession('group', title, checked, '');
        
        const newSess = state.sessions[0]; // assuming newly created session is first
        if (newSess && bgData) {
             localStorage.setItem(`loveline_extra_${newSess.id}`, bgData);
        }
    } else {
        if (bgData) localStorage.setItem(`loveline_extra_${id}`, bgData);
        else localStorage.removeItem(`loveline_extra_${id}`);

        const sb = getSB();
        if (sb && title) await sb.from('chat_sessions').update({ title }).eq('id', id);
        qs('#modal-group').classList.add('hidden');

        if (state.currentSession?.id === id) {
          state.currentSession.title = title;
          state.currentSession.extra = bgData;
          renderChatArea();
        }
        await loadSessionsForUser();
        appendLog(`💾 儲存聊天室設定完成: ${title}`);
    }
  });
  qs('#btn-modal-group-delete').addEventListener('click', () => {
    const id = qs('#btn-modal-group-delete').dataset.id;
    qs('#modal-group').classList.add('hidden');
    deleteSession(id);
  });

  // Send message
  qs('#btn-send').addEventListener('click', sendMessage);
  qs('#msg-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  qs('#msg-input').addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });

  // Clear chat (local display only)
  qs('#btn-clear-chat').addEventListener('click', () => {
    if (!state.currentSession) return;
    if (confirm('清空畫面顯示？（不刪除資料庫紀錄）')) {
      state.currentSession.messages = [];
      renderMessages();
    }
  });

  // Model select
  qs('#model-select').addEventListener('change', e => { state.currentModel = e.target.value; });

  // Close modals clicking overlay
  ['modal-friend', 'modal-group', 'modal-user-edit'].forEach(id => {
    qs('#' + id).addEventListener('click', e => {
      if (e.target === qs('#' + id)) qs('#' + id).classList.add('hidden');
    });
  });
}
