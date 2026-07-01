/**
 * 使用說明彈窗（公用模組）
 *
 *  ┌────────────┬────────────┬────────────┐
 *  │  官方使用   │  新增使用   │  新增使用   │
 *  │  手冊（唯讀）│  手冊預覽    │  手冊編輯    │
 *  │  from note/ │  from cloud │  from cloud │
 *  └────────────┴────────────┴────────────┘
 *
 * - 官方使用手冊：由 debug_server GET /api/note 讀取 note/official_<section>.md（不可編輯）
 * - 新增使用手冊：Supabase manual_custom_history 表；每次儲存 = 新一 row（保留歷程）
 *
 * 使用方法：
 *   <script src="js/supabaseClient.js"></script>
 *   <script src="js/help_modal.js" defer></script>
 *   HelpModal.open('novel', '📖 小說產生器 使用說明');
 *
 * section 允許值：'novel' | 'loveline' | 'diary' | 'character_editor' | 'lpas'
 */
(function () {
    'use strict';

    const API_BASE = 'http://localhost:8081';
    let currentSection = '';
    let markedReady = false;

    // 動態載入 marked.js（Markdown 解析器）
    function loadMarked() {
        return new Promise((resolve) => {
            if (window.marked) { markedReady = true; return resolve(); }
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
            s.onload = () => { markedReady = true; resolve(); };
            s.onerror = () => { markedReady = false; resolve(); };
            document.head.appendChild(s);
        });
    }

    function getSB() {
        return (window.SupabaseClient && window.SupabaseClient.init && window.SupabaseClient.init())
            ? window.SupabaseClient.getClient()
            : null;
    }

    // 注入彈窗 HTML（僅第一次）
    // 樣式一律引用 editer.css 現有 class；僅保留兩處「一次性 layout」的 inline style
    // （彈窗 80% 寬度覆寫、底部狀態文字靠左推）——見 SPEC 例外條款。
    function ensureModal() {
        if (document.getElementById('help-modal')) return;

        const modal = document.createElement('div');
        modal.id = 'help-modal';
        modal.className = 'modal-overlay hidden';
        modal.innerHTML = `
            <div class="modal-box modal-box-lg" style="width:90%; max-width:90%;">
                <div class="modal-header-bar">
                    <h2 class="modal-title" id="help-title">📖 使用說明</h2>
                    <div class="log-search-bar" style="margin-right:auto; margin-left:20px;">
                        <span class="log-search-icon">🔍</span>
                        <span id="help-search-count" class="log-search-count"></span>
                        <button class="log-search-nav-btn" id="help-search-prev" title="上一個">▲</button>
                        <button class="log-search-nav-btn" id="help-search-next" title="下一個">▼</button>
                        <input type="text" id="help-search-input" class="log-search-input" placeholder="搜尋新增使用手冊（Enter 執行）...">
                    </div>
                    <button class="modal-close-btn" id="help-btn-close" title="關閉">&times;</button>
                </div>
                <div class="modal-body-area">
                    <div class="cmp-body">
                        <!-- 官方使用手冊：唯讀，Markdown 渲染 -->
                        <div class="cmp-col">
                            <div class="cd-col-label">📘 官方使用手冊（唯讀）</div>
                            <div id="help-official" class="scroll-area"></div>
                        </div>
                        <!-- 新增使用手冊：預覽 -->
                        <div class="cmp-col">
                            <div class="cd-col-label">👁 新增使用手冊 — 即時預覽</div>
                            <div id="help-custom-preview" class="scroll-area"></div>
                        </div>
                        <!-- 新增使用手冊：編輯 -->
                        <div class="cmp-col">
                            <div class="cd-col-label">📝 新增使用手冊 — 編輯 Markdown</div>
                            <textarea id="help-custom-editor" class="cd-col-textarea" spellcheck="false"
                                placeholder="在此撰寫或補充使用手冊。儲存後會新增一筆歷程紀錄至雲端，載入時自動取最新版。"></textarea>
                        </div>
                    </div>
                </div>
                <div class="modal-actions">
                    <span id="help-status" class="text-muted-sm" style="margin-right:auto;"></span>
                    <button class="btn secondary-btn" id="help-btn-cancel">取消</button>
                    <button class="btn primary-btn" id="help-btn-save">💾 儲存新增使用手冊（新增一筆歷程）</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        document.getElementById('help-btn-close').addEventListener('click', close);
        document.getElementById('help-btn-cancel').addEventListener('click', close);
        document.getElementById('help-btn-save').addEventListener('click', save);
        document.getElementById('help-custom-editor').addEventListener('input', updateCustomPreview);

        setupSearch();
    }

    function setupSearch() {
        let matches = [];
        let currentMatch = -1;

        function goToMatch(idx) {
            if (!matches.length) return;
            const ta = document.getElementById('help-custom-editor');
            const query = document.getElementById('help-search-input').value;
            currentMatch = ((idx % matches.length) + matches.length) % matches.length;
            const start = matches[currentMatch], end = start + query.length;
            const fullText = ta.value;
            ta.value = fullText.substring(0, start);
            const pixelPos = ta.scrollHeight;
            ta.value = fullText;
            ta.focus();
            ta.setSelectionRange(start, end);
            requestAnimationFrame(() => {
                ta.scrollTop = Math.max(0, pixelPos - ta.clientHeight / 2);
            });
            document.getElementById('help-search-count').textContent = `${currentMatch + 1} / ${matches.length}`;
        }

        function doSearch() {
            const query = document.getElementById('help-search-input').value;
            const ta = document.getElementById('help-custom-editor');
            const countEl = document.getElementById('help-search-count');
            matches = [];
            currentMatch = -1;
            if (!query) { countEl.textContent = ''; ta.focus(); return; }
            const lo = ta.value.toLowerCase(), lq = query.toLowerCase();
            let i = 0;
            while ((i = lo.indexOf(lq, i)) !== -1) { matches.push(i); i += lq.length; }
            matches.length ? goToMatch(0) : (countEl.textContent = '找不到', ta.focus());
        }

        document.getElementById('help-search-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
        });
        document.getElementById('help-search-prev').addEventListener('click', () => goToMatch(currentMatch - 1));
        document.getElementById('help-search-next').addEventListener('click', () => goToMatch(currentMatch + 1));
    }

    function renderMD(src) {
        if (markedReady && window.marked) return window.marked.parse(src || '');
        return '<pre style="white-space:pre-wrap;">' + (src || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
    }

    function updateCustomPreview() {
        document.getElementById('help-custom-preview').innerHTML =
            renderMD(document.getElementById('help-custom-editor').value);
    }

    async function loadOfficial(section) {
        // GET /api/note?name=official_<section>.md
        const fileName = 'official_' + section + '.md';
        try {
            const res = await fetch(`${API_BASE}/api/note?name=${encodeURIComponent(fileName)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            document.getElementById('help-official').innerHTML = renderMD(data.content ||
                '_（尚未提供官方使用手冊，請至 note/' + fileName + ' 建立）_');
            return data.content || '';
        } catch (e) {
            document.getElementById('help-official').innerHTML =
                '<p style="color:#e74c3c;">❌ 官方使用手冊載入失敗：' + e.message + '（請確認 debug_server.py 已啟動）</p>';
            return '';
        }
    }

    async function loadCustomLatest(section) {
        const sb = getSB();
        if (!sb) {
            document.getElementById('help-custom-editor').value = '';
            updateCustomPreview();
            return '';
        }
        try {
            const { data, error } = await sb
                .from('manual_custom_history')
                .select('content, created_at')
                .eq('section', section)
                .order('created_at', { ascending: false })
                .limit(1);
            if (error) throw error;
            const content = (data && data[0] && data[0].content) || '';
            document.getElementById('help-custom-editor').value = content;
            updateCustomPreview();
            return content;
        } catch (e) {
            document.getElementById('help-status').textContent = '⚠️ 新增使用手冊載入失敗：' + e.message;
            return '';
        }
    }

    async function open(section, title) {
        ensureModal();
        await loadMarked();
        currentSection = section;
        document.getElementById('help-title').textContent = title || '📖 使用說明';
        document.getElementById('help-status').textContent = '☁️ 載入中…';
        document.getElementById('help-official').innerHTML = '';
        document.getElementById('help-custom-editor').value = '';
        document.getElementById('help-custom-preview').innerHTML = '';
        document.getElementById('help-modal').classList.remove('hidden');

        await Promise.all([loadOfficial(section), loadCustomLatest(section)]);
        document.getElementById('help-status').textContent = '✅ 載入完成';
    }

    async function save() {
        const sb = getSB();
        if (!sb) {
            document.getElementById('help-status').textContent = '❌ Supabase 未初始化，無法儲存';
            return;
        }
        const content = document.getElementById('help-custom-editor').value;
        document.getElementById('help-status').textContent = '💾 儲存中…';
        try {
            // 每次儲存 = 新增一筆歷程紀錄
            const payload = { section: currentSection, content };
            // 若頁面有 currentUser（例如 LoveLine），順便帶上暱稱
            if (window.state && window.state.currentUser && window.state.currentUser.name) {
                payload.updated_by = window.state.currentUser.name;
            }
            const { error } = await sb.from('manual_custom_history').insert(payload);
            if (error) throw error;
            document.getElementById('help-status').textContent =
                '✅ 已新增一筆歷程（' + new Date().toLocaleTimeString('zh-TW', { hour12: false }) + '）';
        } catch (e) {
            document.getElementById('help-status').textContent = '❌ 儲存失敗：' + e.message;
        }
    }

    function close() {
        const m = document.getElementById('help-modal');
        if (m) m.classList.add('hidden');
    }

    window.HelpModal = { open, close };
})();
