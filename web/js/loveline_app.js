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
  await loadUsersFromCloud(); // 設定 state._pendingUser（不直接設定 currentUser）
  renderUserSelect();         // currentUser 為 null，不會呼叫 updateUserDisplay
  startServerPolling();
  setupEventListeners();

  // 頁面載入後，依密碼是否存在決定自動登入或彈出驗證視窗
  if (state._pendingUser) {
    const u = state._pendingUser;
    state._pendingUser = null;

    if (!u.password) {
      // 無密碼使用者：直接自動登入
      state.currentUser = u;
      renderUserSelect();
      appendLog(`💌 LoveLine 已載入，自動登入：${u.name}`);
    } else {
      // 有密碼：彈出驗證視窗，不載入任何資料
      state._tempTargetUser = u;
      qs('#password-check-msg').textContent = `請輸入「${u.name}」的登入密碼以進入系統：`;
      qs('#password-input-val').value = '';
      qs('#modal-password-check').classList.remove('hidden');
      // 確保未登入時，資料不會顯示
      state.sessions = [];
      state.currentSession = null;
      renderSessionLists();
      renderChatArea();
      qs('#current-user-name').textContent = '— 請登入 —';
      qs('#user-avatar-icon').textContent = '👤';
      appendLog('💌 LoveLine 已載入，請先輸入密碼');
    }
  } else {
    appendLog('💌 LoveLine 已載入');
  }
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
          existing.password = cloud.password;
          existing.ai_model = cloud.ai_model;
          existing.model_options = cloud.model_options;
          existing.writer_style = cloud.writer_style;
          existing.writer_sample = cloud.writer_sample;
        } else {
          merged.push({
            key: cloud.user_key,
            name: cloud.nickname,
            char_id: cloud.char_id,
            persona: cloud.persona,
            extra: cloud.extra_info,
            password: cloud.password,
            ai_model: cloud.ai_model,
            model_options: cloud.model_options,
            writer_style: cloud.writer_style,
            writer_sample: cloud.writer_sample
          });
        }
      });
      state.users = merged;
    } else {
      state.users = localUsers;
    }

    const lastKey = localStorage.getItem('loveline_current_user');
    const found = state.users.find(u => u.key === lastKey);
    state._pendingUser = found || state.users[0];
    saveUsersToLocal();
  } catch (e) {
    appendLog('⚠️ 雲端使用者同步失敗，切換至離線模式');
    loadUsersFromLocal();
  }
}

function loadUsersFromLocal() {
  try {
    const raw = localStorage.getItem('loveline_users');
    state.users = raw ? JSON.parse(raw) : [{ key: 'user_default', name: '我', char_id: '', persona: '', extra: '', ai_model: 'gemma4', model_options: '', writer_style: '', writer_sample: '' }];
    const lastKey = localStorage.getItem('loveline_current_user');
    state._pendingUser = state.users.find(u => u.key === lastKey) || state.users[0];
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
      char_id: u.char_id, persona: u.persona, extra_info: u.extra,
      password: u.password,
      ai_model: u.ai_model, model_options: u.model_options,
      writer_style: u.writer_style, writer_sample: u.writer_sample
    });
  } catch (e) { appendLog('❌ 雲端同步失敗: ' + e.message); }
}

function renderUserSelect() {
  const sel = qs('#user-select');
  if (!sel) return;
  const activeKey = state.currentUser?.key || state._tempTargetUser?.key || state._pendingUser?.key;
  sel.innerHTML = state.users.map(u =>
    `<option value="${u.key}" ${activeKey === u.key ? 'selected' : ''}>${u.name}</option>`
  ).join('');

  if (state.currentUser) {
    updateUserDisplay();
  }
}

async function updateUserDisplay() {
  const u = state.currentUser;
  if (!u) return;
  qs('#current-user-name').textContent = u.name;
  qs('#user-avatar-icon').textContent = u.name[0] || '👤';
  localStorage.setItem('loveline_current_user', u.key);

  // 切換使用者時，淨空右欄對話內容
  state.currentSession = null;
  renderChatArea();

  // 恢復選中的模型與寫作風格
  if (u.ai_model) qs('#model-select').value = u.ai_model;
  if (u.model_options) qs('#model-options-select').value = u.model_options;
  if (u.writer_style) qs('#writer-style-select').value = u.writer_style;
  if (u.writer_sample) qs('#writer-sample-select').value = u.writer_sample;

  await loadSessionsForUser();

  // 需求 1: 登入後啟動主動發話序列
  triggerRandomLoginMessage();
}

function openUserEditModal() {
  const u = state.currentUser;
  if (!u) return;
  qs('#modal-user-title').textContent = '👤 編輯使用者資料';
  qs('#modal-user-name').value = u.name || '';
  qs('#modal-user-char-select').value = u.char_id || '';
  qs('#modal-user-password').value = u.password || '';
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
  if (!state.currentUser) {
    state.sessions = [];
    renderSessionLists();
    return;
  }
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

    // 計算每則對話的未讀數
    for (const s of state.sessions) {
      const msgs = await loadMessages(s.id);
      const lastReadId = localStorage.getItem(`loveline_last_read_${s.id}`);
      if (!lastReadId) {
        s.unreadCount = msgs.length;
      } else {
        const lastIdx = msgs.findIndex(m => String(m.id) === String(lastReadId));
        s.unreadCount = lastIdx === -1 ? msgs.length : (msgs.length - 1 - lastIdx);
      }
    }

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
    resetIdleTimer();
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
    '<div class="form-label">尚無對話</div>';
  qs('#list-group').innerHTML = grp.length ? grp.map(s => sessionItem(s)).join('') :
    '<div class="form-label">尚無聊天室</div>';

  // 使用事件委託來處理齒輪點擊，解決動態渲染失效問題
}

function sessionItem(s) {
  const parts = s.chat_participants || [];
  const names = parts.filter(p => p.participant_type === 'character').map(p => p.character_name).join('、');
  const title = s.title || names || '未命名';
  const icon = s.session_type === 'group' ? '👥' : '💬';
  const isActive = state.currentSession?.id === s.id ? 'active' : '';

  // 計算未讀數 (這部分在 loadSessionsForUser 時會預先算好存入 s.unreadCount)
  const unreadCount = s.unreadCount || 0;
  //
  const badgeHtml = unreadCount > 0 ? `<span class="unread-badge">${unreadCount > 9 ? '9+' : unreadCount}</span>` : '';

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
    const dateTime = new Date(m.created_at).toLocaleTimeString('zh-TW', { year: '2-digit', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    const div = document.createElement('div');
    div.className = 'msg-row' + (isUser ? ' user' : '');
    const msgId = m.id && m.id !== 'tmp' && m.id !== 'tmp_ai' ? m.id : '';
    div.innerHTML = `
      <div class="msg-avatar">${isUser ? (state.currentUser?.name[0] || '我') : (m.sender_name?.[0] || '🤖')}</div>
      <div class="msg-bubble-wrap">
        <div class="msg-sender">${m.sender_name || '未知'}</div>
        <div class="msg-bubble" data-msg-id="${msgId}" data-msg-content="${escHtml(m.content)}">${escHtml(m.content)}</div>
        <div class="msg-time">${dateTime}</div>
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

// ══════════════════════════════════════════
// BUBBLE CONTEXT MENU
// ══════════════════════════════════════════
function showBubbleMenu(bubble, msgId, rawContent) {
  hideBubbleMenu();
  bubble.classList.add('selected');

  const menu = document.createElement('div');
  menu.className = 'bubble-menu';
  menu.innerHTML = `
    <button class="bubble-menu-btn">📋 複製文字</button>
    <button class="bubble-menu-btn bubble-menu-btn-del"${!msgId ? ' disabled title="暫存訊息無法刪除"' : ''}>🗑️ 刪除此對話</button>`;

  // 定位在泡泡上方
  const rect = bubble.getBoundingClientRect();
  menu.style.cssText = `position:fixed;top:${rect.top - 46}px;left:${Math.max(8, rect.left)}px;z-index:9999;`;
  document.body.appendChild(menu);

  const [btnCopy, btnDel] = menu.querySelectorAll('.bubble-menu-btn');
  btnCopy.addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard.writeText(rawContent).catch(() => { });
    hideBubbleMenu();
  });
  btnDel.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!msgId) return;
    hideBubbleMenu();
    await deleteMessage(msgId);
  });
}

function hideBubbleMenu() {
  document.querySelector('.bubble-menu')?.remove();
  document.querySelectorAll('.msg-bubble.selected').forEach(b => b.classList.remove('selected'));
}

async function deleteMessage(msgId) {
  const sb = getSB();
  if (!sb) { alert('Supabase 未連線'); return; }
  if (!confirm('確定刪除這則訊息？')) return;
  try {
    const { error } = await sb.from('chat_messages').delete().eq('id', msgId);
    if (error) throw error;
    if (state.currentSession?.messages) {
      state.currentSession.messages = state.currentSession.messages.filter(m => String(m.id) !== String(msgId));
    }
    renderMessages();
    appendLog('🗑️ 訊息已刪除');
  } catch (e) {
    appendLog('❌ 刪除訊息失敗: ' + e.message);
  }
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
// ══════════════════════════════════════════
// PROACTIVE MESSAGING (主動發言系統)
// ══════════════════════════════════════════
let idleTimer = null;
let isLoginSequenceRunning = false;

function resetIdleTimer() {
  if (idleTimer) clearTimeout(idleTimer);
  if (!state.currentSession) return;

  const sess = state.currentSession;
  // 如果正在執行登入序列，或是正在等待使用者回覆，就不啟動閒置計時器
  if (isLoginSequenceRunning) return;
  if (sess.waitingForUserReply) return;

  // 需求 2: 使用者在對話中閒置隨機秒數 (8-120秒)
  const delay = 8000 + Math.random() * 112000;
  idleTimer = setTimeout(async () => {
    // 再次確認 session 沒變且依然需要發言
    if (state.currentSession && String(state.currentSession.id) === String(sess.id) && !sess.waitingForUserReply) {
      const count = Math.floor(Math.random() * 2) + 1; // 1-2 則留言
      await triggerProactiveSequence(sess.id, count);
    }
  }, delay);
}

async function triggerRandomLoginMessage() {
  if (isLoginSequenceRunning) return;
  isLoginSequenceRunning = true;

  appendLog("🚀 啟動登入主動發話序列...");
  // 需求 1: 登入後先等待 5-20 秒
  await new Promise(r => setTimeout(r, 5000 + Math.random() * 15000));

  if (state.sessions.length === 0) {
    isLoginSequenceRunning = false;
    return;
  }

  // 隨機挑選會話順序
  const shuffledSessions = [...state.sessions].sort(() => Math.random() - 0.5);

  for (const sess of shuffledSessions) {
    const count = Math.floor(Math.random() * 2) + 1; // 至少主動發出 1-2 則留言
    appendLog(`[Proactive] 對會話「${sess.title || sess.id}」發送 ${count} 則登入留言`);
    await triggerProactiveSequence(sess.id, count, true);
  }

  isLoginSequenceRunning = false;
  appendLog("✅ 登入主動發話序列結束");
  resetIdleTimer(); // 結束後啟動當前對話的閒置偵測
}

async function triggerProactiveSequence(sessionId, totalCount, isLoginBurst = false) {
  const sess = state.sessions.find(s => String(s.id) === String(sessionId));
  if (!sess || !state.serverOnline) return;

  sess.inProactiveSequence = true;
  sess.hasUserReplied = false; // 重置回話標記

  for (let i = 0; i < totalCount; i++) {
    // 如果不是登入爆發，且使用者在過程中回話了，就中斷
    if (!isLoginBurst && sess.hasUserReplied) break;

    await triggerProactiveAction(sessionId);

    // 每個留言間隔 5-60 秒
    if (i < totalCount - 1) {
      await new Promise(r => setTimeout(r, 5000 + Math.random() * 55000));
    }
  }

  sess.inProactiveSequence = false;
  sess.waitingForUserReply = true; // 標記為等待使用者回覆（停止主動發言）
}

async function triggerProactiveAction(sessionId) {
  const sess = state.sessions.find(s => String(s.id) === String(sessionId));
  if (!sess || !state.serverOnline) return;

  // 判斷未讀數 (原本 logic 保持，已在 user 上次修改中註解掉未讀限制)
  const msgs = await loadMessages(sessionId);
  const lastReadId = localStorage.getItem(`loveline_last_read_${sessionId}`);
  let unread = 0;
  if (!lastReadId) unread = msgs.length;
  else {
    const lastIdx = msgs.findIndex(m => String(m.id) === String(lastReadId));
    unread = lastIdx === -1 ? msgs.length : (msgs.length - 1 - lastIdx);
  }

  const characters = sess.chat_participants.filter(p => p.participant_type === 'character');
  if (characters.length === 0) return;
  const participant = characters[Math.floor(Math.random() * characters.length)];

  const proactivePrompt = "(提示：這是你主動發起的新話題，可以根據之前的對話內容關心對方，或是分享你現在想到的新主題、心情、或是發生的一件趣事。請讓語氣顯得自然且親切。)";
  await getAIReply(sess, participant, proactivePrompt, true);
}

async function sendMessage() {
  const sess = state.currentSession;
  if (!sess || !state.currentUser) return;
  const input = qs('#msg-input');
  const content = input.value.trim();
  if (!content) return;
  input.value = ''; input.style.height = 'auto';

  // 使用者發言，重置主動發言相關標記
  sess.waitingForUserReply = false;
  sess.hasUserReplied = true;

  const userName = state.currentUser.name;
  const now = new Date().toISOString();

  appendLog(`🗣️ 使用者 (${userName}) 發送訊息: ${content}`);

  // optimistic UI
  const tempMsg = {
    id: Date.now(), session_id: sess.id, sender_type: 'user',
    sender_key: state.currentUser.key, sender_name: userName, content, created_at: now
  };

  if (!sess.messages) sess.messages = [];
  sess.messages.push(tempMsg);
  renderMessages();

  // save to DB
  await saveMessage(sess.id, 'user', state.currentUser.key, null, userName, content, null);

  // get AI reply
  const charParts = (sess.chat_participants || []).filter(p => p.participant_type === 'character');
  for (const part of charParts) {
    await getAIReply(sess, part, content);
  }
}

async function getAIReply(sess, participant, userMessage, isProactive = false) {
  if (!state.serverOnline) return;
  const charData = state.characters.find(c => c.id === participant.character_id);
  if (!charData) return;

  const charName = participant.character_name || charData.name;

  // 如果是當前對話，則顯示打字中
  const isCurrentAtStart = state.currentSession && String(state.currentSession.id) === String(sess.id);
  if (isCurrentAtStart) {
    addTypingIndicator(charName);
    qs('#btn-send').disabled = true;
  }

  try {
    const u = state.currentUser;
    const userChar = state.characters.find(c => c.id === u.char_id);

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
      persona_override: sess.persona || '',
      session_extra: sess.extra || '',
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

    // Step 1: 取得提示詞預覽 (背景執行，不阻塞)
    fetch('http://localhost:8081/api/chat_reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, preview: true })
    }).then(res => res.json()).then(pData => {
      if (pData.debug_prompt) {
        appendLog(`\n=== AI 提示詞 (${charName}) ===\n${pData.debug_prompt}\n=====================\n`);
      }
    }).catch(() => { });

    // Step 2: 真正生成回覆（非同步 Job 模式，Log 即時顯示）
    appendLog(`>> 正在呼叫 AI 產生「${charName}」的回覆...`);
    const startRes = await fetch('http://localhost:8081/api/chat_reply_async', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!startRes.ok) throw new Error(`HTTP ${startRes.status}`);
    const { job_id } = await startRes.json();
    if (!job_id) throw new Error('未取得 job_id');

    appendLog(`>> Job 已啟動 (id: ${job_id.slice(0, 8)}...)`);

    // 輪詢 /api/job 直到完成
    let lastLogs = '';
    let reply = null;
    for (let i = 0; i < 300; i++) {
      await new Promise(r => setTimeout(r, 1000));
      let jd;
      try {
        const jr = await fetch(`http://localhost:8081/api/job?id=${encodeURIComponent(job_id)}`);
        jd = await jr.json();
      } catch (e) { continue; }

      if (jd.logs && jd.logs !== lastLogs) {
        const newPart = jd.logs.slice(lastLogs.length);
        lastLogs = jd.logs;
        const logBox = document.getElementById('log-output');
        if (logBox && newPart) {
          logBox.value += newPart.replace(/\\n/g, '\n');
          logBox.scrollTop = logBox.scrollHeight;
        }
      }

      if (jd.status === 'done') {
        reply = jd.result?.reply || null;
        break;
      }
      if (jd.status === 'error') {
        appendLog('❌ 後端 Job 執行失敗，請查看 CMD 視窗。');
        break;
      }
    }

    // 重新檢查當前對話狀態
    const nowIsCurrent = state.currentSession && String(state.currentSession.id) === String(sess.id);
    if (nowIsCurrent) {
      removeTypingIndicator();
      qs('#btn-send').disabled = false;
    }

    if (reply) {
      appendLog(`🤖 接收到 AI (${charName}) 的回答: ${reply}`);
      const now = new Date().toISOString();

      // 先儲存到資料庫
      await saveMessage(sess.id, 'character', null, charData.id, charName, reply, state.currentModel);

      const aiMsg = {
        id: Date.now(),
        session_id: sess.id, sender_type: 'character',
        sender_char_id: charData.id, sender_name: charName, content: reply, created_at: now
      };

      // 1. 更新原始會話物件
      if (!sess.messages) sess.messages = [];
      sess.messages.push(aiMsg);

      if (nowIsCurrent) {
        // 2. 如果當前正開啟此對話，更新正在渲染的物件
        if (state.currentSession !== sess) {
          if (!state.currentSession.messages) state.currentSession.messages = [];
          state.currentSession.messages.push(aiMsg);
        }
        renderMessages();
        localStorage.setItem(`loveline_last_read_${sess.id}`, aiMsg.id);
      } else {
        // 3. 背景更新未讀數
        const s = state.sessions.find(x => String(x.id) === String(sess.id));
        if (s) {
          s.unreadCount = (s.unreadCount || 0) + 1;
          renderSessionLists();
        }
      }
    }
  } catch (e) {
    appendLog(`❌ AI 回覆失敗: ${e.message}`);
    if (state.currentSession && String(state.currentSession.id) === String(sess.id)) {
      removeTypingIndicator();
      qs('#btn-send').disabled = false;
    }
  } finally {
    const isNowCurrent = state.currentSession && String(state.currentSession.id) === String(sess.id);
    if (isNowCurrent && !isProactive) resetIdleTimer();
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
    const res = await fetch('http://localhost:8081/api/status', { signal: ctrl.signal });
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
    const res = await fetch('http://localhost:8081/api/models');
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

  // ── 泡泡點擊：顯示操作選單 ──
  qs('#chat-messages').addEventListener('click', (e) => {
    const bubble = e.target.closest('.msg-bubble');
    if (bubble) {
      e.stopPropagation();
      if (bubble.classList.contains('selected')) {
        hideBubbleMenu();
      } else {
        const msgId = bubble.dataset.msgId || '';
        const rawContent = bubble.dataset.msgContent || bubble.textContent;
        showBubbleMenu(bubble, msgId, rawContent);
      }
      return;
    }
    hideBubbleMenu();
  });

  // 點擊其他地方關閉選單
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.bubble-menu') && !e.target.closest('.msg-bubble')) {
      hideBubbleMenu();
    }
  });

  // User select
  qs('#user-select').addEventListener('change', e => {
    const val = e.target.value;
    if (!val) return;
    const targetUser = state.users.find(u => u.key === val);
    if (!targetUser) return;

    // 顯示密碼驗證彈窗
    state._tempTargetUser = targetUser;

    // 清空當前畫面資料，防止切換時看到上一個人的資料
    state.sessions = [];
    state.currentSession = null;
    renderSessionLists();
    renderChatArea();
    qs('#current-user-name').textContent = '— 驗證中 —';

    qs('#password-check-msg').textContent = `請輸入「${targetUser.name}」的登入密碼以載入資料：`;
    qs('#password-input-val').value = '';
    qs('#modal-password-check').classList.remove('hidden');

    // 先還原選單顯示，等驗證通過才真正切換
    e.target.value = state.currentUser ? state.currentUser.key : '';
  });

  // Password check modal logic
  qs('#btn-password-cancel').addEventListener('click', () => {
    qs('#modal-password-check').classList.add('hidden');
    state._tempTargetUser = null;
  });

  qs('#btn-password-ok').addEventListener('click', () => {
    const u = state._tempTargetUser;
    const pwd = qs('#password-input-val').value.trim();
    if (!u) return;

    if (pwd === u.password) {
      state.currentUser = u;
      qs('#user-select').value = u.key;
      updateUserDisplay();
      qs('#modal-password-check').classList.add('hidden');
      state._tempTargetUser = null;
      appendLog(`🔓 驗證成功，載入使用者：${u.name}`);
    } else {
      alert('密碼錯誤！');
    }
  });

  // Add user
  qs('#btn-add-user').addEventListener('click', () => {
    qs('#modal-user-title').textContent = '👤 新增使用者';
    qs('#modal-user-name').value = '';
    qs('#modal-user-password').value = '';
    qs('#modal-user-char-select').value = '';
    qs('#modal-user-persona').value = '';
    qs('#modal-user-extra').value = '';
    qs('#modal-user-edit').classList.remove('hidden');
  });

  // User profile edit
  qs('#btn-edit-user-profile').addEventListener('click', () => {
    qs('#modal-user-title').textContent = '👤 編輯使用者資料';
    openUserEditModal();
  });
  qs('#btn-modal-user-cancel').addEventListener('click', () => qs('#modal-user-edit').classList.add('hidden'));
  qs('#btn-modal-user-ok').addEventListener('click', async () => {
    const isNew = qs('#modal-user-title').textContent.includes('新增');
    let u = state.currentUser;

    if (isNew) {
      const name = qs('#modal-user-name').value.trim();
      const pwd = qs('#modal-user-password').value.trim();
      if (!name || !pwd) { alert('請輸入暱稱與密碼'); return; }
      const key = 'user_' + Date.now();
      u = { key, name, password: pwd };
      state.users.push(u);
      state.currentUser = u;
    }

    if (!u) return;
    u.name = qs('#modal-user-name').value.trim() || u.name;
    u.password = qs('#modal-user-password').value.trim() || u.password;
    u.char_id = qs('#modal-user-char-select').value;
    u.persona = qs('#modal-user-persona').value;
    u.extra = qs('#modal-user-extra').value;

    // 同步當前選中的 AI 設定到使用者資料中
    u.ai_model = qs('#model-select').value;
    u.model_options = qs('#model-options-select').value;
    u.writer_style = qs('#writer-style-select').value;
    u.writer_sample = qs('#writer-sample-select').value;

    saveUsersToLocal();
    await saveUserProfileToCloud(u);
    qs('#modal-user-edit').classList.add('hidden');
    renderUserSelect();
    appendLog(isNew ? '✅ 新使用者已建立' : '✅ 使用者設定已儲存至雲端');
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
