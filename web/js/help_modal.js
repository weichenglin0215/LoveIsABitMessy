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

    const API_BASE = 'http://localhost:8081';           // 本地 debug_server 的基底網址（讀取官方使用手冊用）
    let currentSection = '';                             // 目前開啟中的使用說明分類（novel / loveline / diary / character_editor / lpas）
    let markedReady = false;                              // marked.js（Markdown 解析器）是否已成功載入完成

    // 動態載入 marked.js（Markdown 解析器）
    // 因為並非每個頁面都一定需要 Markdown 渲染，所以採用「用到才載入」的方式，
    // 透過 Promise 讓呼叫端可以 await 等待載入完成後再繼續渲染。
    function loadMarked() {
        return new Promise((resolve) => {
            // 若全域已存在 window.marked，代表其他地方已載入過，直接標記完成並結束
            if (window.marked) { markedReady = true; return resolve(); }
            // 動態建立 <script> 標籤，從 CDN 載入 marked.js
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
            s.onload = () => { markedReady = true; resolve(); };   // 載入成功
            s.onerror = () => { markedReady = false; resolve(); }; // 載入失敗也要 resolve，避免卡住流程（改用純文字備援顯示）
            document.head.appendChild(s);
        });
    }

    // 取得 Supabase client 實例；若尚未初始化或初始化失敗則回傳 null
    // （呼叫端須自行判斷 null 情況，例如離線或未設定雲端連線）
    function getSB() {
        return (window.SupabaseClient && window.SupabaseClient.init && window.SupabaseClient.init())
            ? window.SupabaseClient.getClient()
            : null;
    }

    // 注入彈窗 HTML（僅第一次）
    // 樣式一律引用 editer.css 現有 class；僅保留兩處「一次性 layout」的 inline style
    // （彈窗 80% 寬度覆寫、底部狀態文字靠左推）——見 SPEC 例外條款。
    function ensureModal() {
        // 若彈窗 DOM 已存在（例如非首次呼叫 open），就不重複建立，避免重複註冊事件監聽器
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
                    <label class="checkbox-label" style="font-size:18px; margin-left:12px;margin-right:24px; white-space:nowrap;" title="暫時隱藏「新增使用手冊 — 編輯 Markdown」欄，讓另外兩欄放大寬度方便閱讀">
                        <input type="checkbox" id="help-toggle-editor-col">
                        <span>👁️隱藏編輯區</span>
                    </label>
                    <button class="modal-close-btn" style="font-size: 24px;" id="help-btn-close" title="關閉">X</button>
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
                        <!-- 新增使用手冊：編輯（可由「👁️隱藏編輯區」勾選框暫時隱藏） -->
                        <div class="cmp-col" id="help-custom-editor-col">
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

        // 綁定彈窗上各按鈕與輸入區的事件
        document.getElementById('help-btn-close').addEventListener('click', close);
        document.getElementById('help-btn-cancel').addEventListener('click', close);
        document.getElementById('help-btn-save').addEventListener('click', save);
        // 編輯區內容變動時，即時更新右側的 Markdown 預覽
        document.getElementById('help-custom-editor').addEventListener('input', updateCustomPreview);

        // 「👁️隱藏編輯區」勾選框：暫時隱藏編輯欄，讓官方手冊／即時預覽兩欄放大寬度方便閱讀
        // （.cmp-col 皆為 flex:1，隱藏第三欄後另外兩欄會自動平分剩餘寬度，不需額外調整樣式）
        document.getElementById('help-toggle-editor-col').addEventListener('change', (e) => {
            document.getElementById('help-custom-editor-col').style.display = e.target.checked ? 'none' : '';
        });

        // 設定「新增使用手冊」編輯區的搜尋功能（上一個／下一個／Enter 搜尋）
        setupSearch();
    }

    // 設定編輯區（textarea）內的文字搜尋功能
    // 使用閉包保存 matches（所有比對到的起始位置陣列）與 currentMatch（目前選取到第幾筆）
    function setupSearch() {
        let matches = [];        // 搜尋比對到的所有位置（字元索引）
        let currentMatch = -1;   // 目前游標停留在第幾筆比對結果（-1 代表尚未搜尋）

        // 跳至第 idx 筆比對結果：將 textarea 的選取範圍移動到該處，並捲動使其可見
        function goToMatch(idx) {
            if (!matches.length) return;
            const ta = document.getElementById('help-custom-editor');
            const query = document.getElementById('help-search-input').value;
            // 利用取餘數的方式做循環（超過最後一筆會回到第一筆，反之亦然）
            currentMatch = ((idx % matches.length) + matches.length) % matches.length;
            const start = matches[currentMatch], end = start + query.length;
            const fullText = ta.value;
            // 技巧：先把 textarea 內容截到比對位置，用 scrollHeight 反推出該處的像素位置，
            // 再還原完整內容，藉此計算出捲動位置（因為 textarea 沒有原生的「跳至字元位置」API）
            ta.value = fullText.substring(0, start);
            const pixelPos = ta.scrollHeight;
            ta.value = fullText;
            ta.focus();
            ta.setSelectionRange(start, end); // 選取比對到的文字，讓使用者能清楚看到位置
            requestAnimationFrame(() => {
                // 將比對位置捲動至可視範圍的中間，方便閱讀上下文
                ta.scrollTop = Math.max(0, pixelPos - ta.clientHeight / 2);
            });
            document.getElementById('help-search-count').textContent = `${currentMatch + 1} / ${matches.length}`;
        }

        // 執行搜尋：依關鍵字（忽略大小寫）找出編輯區內所有符合的位置，並跳至第一筆
        function doSearch() {
            const query = document.getElementById('help-search-input').value;
            const ta = document.getElementById('help-custom-editor');
            const countEl = document.getElementById('help-search-count');
            matches = [];
            currentMatch = -1;
            if (!query) { countEl.textContent = ''; ta.focus(); return; }
            const lo = ta.value.toLowerCase(), lq = query.toLowerCase();
            let i = 0;
            // 逐一尋找所有符合的位置，直到找不到為止
            while ((i = lo.indexOf(lq, i)) !== -1) { matches.push(i); i += lq.length; }
            matches.length ? goToMatch(0) : (countEl.textContent = '找不到', ta.focus());
        }

        // 在搜尋輸入框按下 Enter 時觸發搜尋
        document.getElementById('help-search-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); doSearch(); }
        });
        // 上一個／下一個比對結果按鈕
        document.getElementById('help-search-prev').addEventListener('click', () => goToMatch(currentMatch - 1));
        document.getElementById('help-search-next').addEventListener('click', () => goToMatch(currentMatch + 1));
    }

    // 將 Markdown 原始字串轉換成 HTML
    // 若 marked.js 已就緒則用它正式解析；否則以純文字方式顯示（並跳脫 <、> 避免 HTML injection）作為備援
    function renderMD(src) {
        if (markedReady && window.marked) return window.marked.parse(src || '');
        return '<pre style="white-space:pre-wrap;">' + (src || '').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</pre>';
    }

    // 依編輯區目前內容，重新渲染「新增使用手冊」的即時預覽區塊
    function updateCustomPreview() {
        document.getElementById('help-custom-preview').innerHTML =
            renderMD(document.getElementById('help-custom-editor').value);
    }

    // 讀取「官方使用手冊」（唯讀）
    // 資料來源：debug_server 的 GET /api/note?name=official_<section>.md，內容為本機 note/ 資料夾中的 Markdown 檔案
    async function loadOfficial(section) {
        // GET /api/note?name=official_<section>.md
        const fileName = 'official_' + section + '.md';
        try {
            const res = await fetch(`${API_BASE}/api/note?name=${encodeURIComponent(fileName)}`);
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            // 若檔案內容為空，顯示提示文字，引導維護者去建立該檔案
            document.getElementById('help-official').innerHTML = renderMD(data.content ||
                '_（尚未提供官方使用手冊，請至 note/' + fileName + ' 建立）_');
            return data.content || '';
        } catch (e) {
            // 常見失敗原因是本機的 debug_server.py 未啟動，故在錯誤訊息中提示使用者
            document.getElementById('help-official').innerHTML =
                '<p style="color:#e74c3c;">❌ 官方使用手冊載入失敗：' + e.message + '（請確認 debug_server.py 已啟動）</p>';
            return '';
        }
    }

    // 讀取「新增使用手冊」的最新一筆內容（來自 Supabase manual_custom_history 表）
    // 因為每次儲存都是新增一筆歷程紀錄，所以這裡依 created_at 由新到舊排序，只取第一筆（最新版本）
    async function loadCustomLatest(section) {
        const sb = getSB();
        if (!sb) {
            // 若 Supabase 尚未初始化（例如離線模式），清空編輯區並更新預覽
            document.getElementById('help-custom-editor').value = '';
            updateCustomPreview();
            return '';
        }
        try {
            const { data, error } = await sb
                .from('manual_custom_history')
                .select('content, created_at')
                .eq('section', section)              // 只查詢目前分類（section）的歷程
                .order('created_at', { ascending: false }) // 依建立時間新到舊排序
                .limit(1);                            // 只取最新的一筆
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

    // 開啟使用說明彈窗（對外公開 API：HelpModal.open）
    // section：使用說明分類代碼（novel / loveline / diary / character_editor / lpas）
    // title：彈窗標題文字（顯示於彈窗上方，若未提供則使用預設值）
    async function open(section, title) {
        ensureModal();       // 確保彈窗 DOM 已建立
        await loadMarked();  // 確保 Markdown 解析器已就緒（第一次呼叫才會真正載入）
        currentSection = section;
        document.getElementById('help-title').textContent = title || '📖 使用說明';
        document.getElementById('help-status').textContent = '☁️ 載入中…';
        // 開啟前先清空舊內容，避免殘留上一次開啟的資料造成畫面閃爍或誤讀
        document.getElementById('help-official').innerHTML = '';
        document.getElementById('help-custom-editor').value = '';
        document.getElementById('help-custom-preview').innerHTML = '';
        document.getElementById('help-modal').classList.remove('hidden'); // 顯示彈窗

        // 同時平行載入「官方使用手冊」與「新增使用手冊最新版」，加快載入速度
        await Promise.all([loadOfficial(section), loadCustomLatest(section)]);
        document.getElementById('help-status').textContent = '✅ 載入完成';
    }

    // 儲存「新增使用手冊」編輯區的內容
    // 注意：此為「新增歷程」的寫法（insert），而非覆蓋更新（update），
    // 因此每按一次儲存，manual_custom_history 表就會多一筆紀錄，藉此保留歷史修改紀錄
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
            // 若頁面有 currentUser（例如 LoveLine），順便帶上暱稱，用來記錄是誰更新的
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

    // 關閉使用說明彈窗（僅隱藏，不移除 DOM，方便下次快速重新開啟）
    function close() {
        const m = document.getElementById('help-modal');
        if (m) m.classList.add('hidden');
    }

    // 將 open / close 掛載到全域 window.HelpModal，供其他頁面呼叫使用
    window.HelpModal = { open, close };
})();
