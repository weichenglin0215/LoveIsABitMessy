/**
 * 小說自動產生器 - 應用邏輯
 */

const qs = (sel) => document.querySelector(sel);

// 角色卡資料結構：每個 slot 是 { id: 角色卡ID, roleName: 劇本中的角色名稱 }
// 舊資料（字串陣列）會自動轉成新格式
function getCharId(c) {
    if (c == null) return "";
    if (typeof c === 'string') return c;
    return c.id || "";
}
function getCharRoleName(c) {
    if (c == null || typeof c === 'string') return "";
    return c.roleName || "";
}
function normalizeCharacters(arr) {
    if (!Array.isArray(arr)) return [];
    return arr.map(c => ({ id: getCharId(c), roleName: getCharRoleName(c) }));
}

// 在 LOG 欄列出原始（未套用前的）AI 模型／模型參數／寫作風格／寫作範本資料
// 直接讀 raw 物件，例如雲端 edit_data 或本機 JSON 解析後的 state，
// 這樣若上次使用的模型已被刪除，仍可看見原始值（例如 "gemma4:latest"）。
function logAISettingsFromData(title, data) {
    data = data || {};
    const fmt = (v) => (v === undefined || v === null || v === '') ? '(無)' : String(v);
    const lines = [
        `─── ${title || 'AI 設定（雲端原始資料）'} ───`,
        `🤖 AI 模型：${fmt(data.aiModel)}`,
        `⚙️ 模型參數：${fmt(data.modelOptions)}`,
        `🖋️ 寫作風格一：${fmt(data.writerStyle1 || data.writerStyle)}`,
        `🖋️ 寫作風格二：${fmt(data.writerStyle2)}`,
        `🖋️ 寫作風格三：${fmt(data.writerStyle3)}`,
        `📝 寫作範本：${fmt(data.writerSample)}`,
        `─────────────────────`
    ];
    if (typeof appendLog === 'function') {
        lines.forEach(l => appendLog(l));
    } else {
        const box = document.getElementById('log-output');
        if (box) box.value += '\n' + lines.join('\n') + '\n';
    }
}

// 全域狀態
let state = {
    bookTitle: "未命名小說",
    storyPremise: "分成起承轉合四章，故事背景在大學圖書館，兩人都是大學生。\n\n"
        + "起：描述女主角與心儀對象在圖書館因一本書而相遇的情境。\n\n"
        + "承：因參加活動編在同組有了更多互動機會，也因此產生誤會。\n\n"
        + "轉：兩人心意相通，卻總是在要更進一步的時候發生一些狀況而中斷，讓兩人都很苦惱。\n\n"
        + "合：總算是成為男女朋友，最後才發現這一切都是女主在回憶與已過世的男主交往過程。\n"
        + "目前現實中為女主角在整理與男主的遺物時，所發現的日記，記錄了兩人從相識到相戀的過程。", // 故事粗綱
    // 每個 slot：{ id: 角色卡ID（演員）, roleName: 劇本中的角色名稱 }
    characters: [
        { id: "", roleName: "" },
        { id: "", roleName: "" },
        { id: "", roleName: "" },
        { id: "", roleName: "" }
    ],
    aiModel: "gemma4",
    modelOptions: "",
    writerStyle1: "",
    writerStyle2: "",
    writerStyle3: "",
    writerSample: "",
    chapters: [
        {
            title: "第一章：初見",
            description: "描述主角與心儀對象在大學圖書館因一本書而相遇的情境。",
            locked: false,
            sections: [
                { title: "圖書館的邂逅", content: "", locked: false },
                { title: "意外的聯繫方式", content: "", locked: false },
                { title: "心動的瞬間", content: "", locked: false }
            ]
        },
        {
            title: "第二章：社團活動",
            description: "描述主角與心儀對象因參加活動編在同一組而有了更多互動機會。但是也因此產生誤會，而對彼此產生更深的了解。",
            locked: false,
            sections: [
                { title: "活動中的互動", content: "", locked: false },
                { title: "誤會的產生", content: "", locked: false },
                { title: "更深的了解", content: "", locked: false }
            ]
        },
        {
            title: "第三章：約會",
            description: "描述主角與心儀對象開始約會，雖然還不敢互稱男女朋友，感覺已經很接近了，但是總是在最適當的時機點，被突如其來的狀況給打斷，無法進一步發展。",
            locked: false,
            sections: [
                { title: "第一次約會", content: "", locked: false },
                { title: "約會被突發狀況打斷", content: "", locked: false },
                { title: "雖然曖昧但不敢跨出那一步", content: "", locked: false }
            ]
        },
        {
            title: "第四章：回憶",
            description: "描述主角與心儀對象終於確定關係，開始了一段甜蜜的戀愛。但是也因為第一次交往，發生了一些有趣的事情，讓兩人的感情更加深厚。但是這一切都是女主在回憶與已過世的男主交往過程，目前現實中為女主角在整理與男主的遺物時，所發現的日記，而日記裡面記錄了兩人從相識到相戀的過程。",
            locked: false,
            sections: [
                { title: "確定關係", content: "", locked: false },
                { title: "第一次牽手與接吻", content: "", locked: false },
                { title: "原來這一切都是女主在回憶與已過世的男主交往過程", content: "", locked: false }
            ]
        }
    ],
    activeIndex: { chapter: 0, section: 0 },
    currentModel: "gemma4",
    genParams: {
        storyToPremiseChapters: 8,
        storyToPremiseWordsPerChapter: 200,
        storyToBulletChapters: 8,
        storyToBulletWordsPerChapter: 400,
        chaptersFromPremiseCount: 16,
        chaptersFromPremiseWordsPerChapter: 400,
        chapterOutlineSectionCount: 4,
        chapterOutlineWordsPerSection: 500,
        sectionContentWords: 3000
    }
};

// ====== genParams 輔助 ======

const GEN_PARAMS_DEFAULTS = {
    storyToPremiseChapters: 8,
    storyToPremiseWordsPerChapter: 200,
    storyToBulletChapters: 8,
    storyToBulletWordsPerChapter: 400,
    chaptersFromPremiseCount: 16,
    chaptersFromPremiseWordsPerChapter: 400,
    chapterOutlineSectionCount: 4,
    chapterOutlineWordsPerSection: 500,
    sectionContentWords: 3000
};

function ensureGenParams() {
    if (!state.genParams || typeof state.genParams !== 'object') state.genParams = {};
    for (const [k, v] of Object.entries(GEN_PARAMS_DEFAULTS)) {
        if (state.genParams[k] === undefined || state.genParams[k] === null) state.genParams[k] = v;
    }
}

/**
 * 顯示 AI 參數彈窗，從 state.genParams 填入當前值，確認後回寫並 resolve(true)，取消 resolve(false)。
 * config.fields: [{ inputId, paramKey, defaultValue }]
 */
function openParamsModal(config) {
    return new Promise(resolve => {
        ensureGenParams();
        const modal = qs(`#${config.modalId}`);
        config.fields.forEach(f => {
            const el = qs(`#${f.inputId}`);
            if (el) el.value = state.genParams[f.paramKey] ?? f.defaultValue;
        });
        modal.classList.remove('hidden');

        const confirmBtn = qs(`#${config.confirmBtnId}`);
        const cancelBtn = qs(`#${config.cancelBtnId}`);

        const cleanup = () => {
            modal.classList.add('hidden');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };
        const onConfirm = () => {
            config.fields.forEach(f => {
                const el = qs(`#${f.inputId}`);
                if (el) state.genParams[f.paramKey] = Math.max(1, parseInt(el.value) || f.defaultValue);
            });
            cleanup();
            resolve(true);
        };
        const onCancel = () => { cleanup(); resolve(false); };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    });
}

async function promptAndGenChapterOutline(chIdx) {
    const confirmed = await openParamsModal({
        modalId: 'modal-params-co', confirmBtnId: 'btn-co-params-confirm', cancelBtnId: 'btn-co-params-cancel',
        fields: [
            { inputId: 'co-section-count', paramKey: 'chapterOutlineSectionCount', defaultValue: 4 },
            { inputId: 'co-words-per-section', paramKey: 'chapterOutlineWordsPerSection', defaultValue: 500 }
        ]
    });
    if (confirmed) await aiGenChapterOutline(chIdx);
}
window.promptAndGenChapterOutline = promptAndGenChapterOutline;

let cloudCharacters = []; // 儲存雲端角色卡完整資料
let localCharacters = []; // 儲存本機角色 ID

/**
 * 統一的角色卡下拉顯示文字：「角色名稱-full_name」。
 * full_name 取自 card_json.lpas_v3.full_name；無 LPAS 資料時以「無LPAS」替代。
 */
function charDropdownLabel(c) {
    let card = c && c.card_json;
    if (typeof card === 'string') {
        try { card = JSON.parse(card); } catch (e) { card = null; }
    }
    const fullName = (card && card.lpas_v3 && card.lpas_v3.full_name) ? card.lpas_v3.full_name : '';
    return `${(c && c.name) || '未命名'}-${fullName || '無LPAS'}`;
}
let serverOnline = false;

// 初始化
console.log(">> novel_generator_app.js 正在載入...");

window.addEventListener('load', async () => {
    console.log(">> [Window Load] 啟動初始化...");
    appendLog("🚀 正在初始化應用程式...");
    initSupabase();
    await checkServerStatus();
    startServerPolling();
    await initCharacters();
    renderAll();
    setupEventListeners();
    appendLog("✅ 系統初始化完成，隨時可以開始。");
});

function initSupabase() {
    console.log(">> 正在初始化 Supabase...");
    if (window.SupabaseClient && window.SupabaseClient.init) {
        window.SupabaseClient.init();
    }
}

// ====== 角色資料讀取 (參考 daily_run.html) ======

async function fetchOllamaModels() {
    try {
        const res = await fetch('http://localhost:8081/api/models');
        const container = qs('#model-container');
        if (res.ok) {
            const models = await res.json();
            const select = qs('#model-select');
            if (select) {
                select.innerHTML = "";
                models.forEach(m => {
                    const opt = document.createElement('option');
                    opt.value = m;
                    opt.textContent = m;
                    // 優先保留使用者已選的 state.currentModel，否則預設 gemma4
                    if (state.currentModel && m === state.currentModel) opt.selected = true;
                    else if (!state.currentModel && m === 'gemma4') opt.selected = true;
                    select.appendChild(opt);
                });
                // 填完列表後，把實際選中的值同步回 state，確保 state 與 UI 一致
                state.currentModel = select.value;
                if (container) {
                    container.style.opacity = "1";
                    container.style.pointerEvents = "auto";
                }
            }
        } else {
            appendLog("⚠️ 無法從 Ollama 取得模型清單，請確認 Ollama 是否已啟動");
            if (container) {
                container.style.opacity = "0.5";
                container.style.pointerEvents = "none";
            }
        }
    } catch (e) {
        console.error("Failed to fetch models", e);
        appendLog("⚠️ 取得模型清單發生錯誤");
    }
}

let lastModelFetchTime = 0;

async function checkServerStatus() {
    const serverDot = qs('#server-dot');
    const serverStatusText = qs('#server-status-text');
    const startServerBtn = qs('#start-server-btn');
    const modelContainer = qs('#model-container');
    const modelSelect = qs('#model-select');

    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 2000);
        const res = await fetch('http://localhost:8081/api/status', { signal: controller.signal });
        clearTimeout(timeout);
        if (res.ok) {
            const now = Date.now();
            if (!serverOnline) {
                appendLog("✅ debug_server.py 已連線");
                fetchOllamaModels();
                if (qs('#use-local-data').checked) loadLocalChars();
                lastModelFetchTime = now;
            } else {
                // 如果伺服器在線，但模型清單還沒抓到或抓失敗，每 30 秒重試一次
                const isModelInactive = modelContainer && modelContainer.style.opacity === "0.5";
                const hasNoModels = modelSelect && modelSelect.options.length <= 1; // 只有預設的 gemma4
                if ((isModelInactive || hasNoModels) && (now - lastModelFetchTime > 30000)) {
                    fetchOllamaModels();
                    lastModelFetchTime = now;
                }
            }

            serverOnline = true;
            if (serverDot) {
                serverDot.className = 'server-status-dot online';
                // 閃爍效果
                serverDot.classList.add('flash');
                setTimeout(() => serverDot.classList.remove('flash'), 500);
            }
            if (serverStatusText) serverStatusText.textContent = '✅ debug_server.py 運行中';
            if (startServerBtn) startServerBtn.disabled = true;
            return true;
        }
    } catch (e) { }

    if (serverOnline) {
        appendLog("❌ debug_server.py 失去連線");
    }
    serverOnline = false;
    if (serverDot) serverDot.className = 'server-status-dot offline';
    if (serverStatusText) serverStatusText.textContent = '❌ debug_server.py 未啟動';
    if (startServerBtn) startServerBtn.disabled = false;
    if (modelContainer) {
        modelContainer.style.opacity = "0.5";
        modelContainer.style.pointerEvents = "none";
    }
    return false;
}

let pollInterval = null;
function startServerPolling() {
    if (pollInterval) return;
    // 每五秒檢查一次伺服器狀態，確保斷線時能即時反應
    pollInterval = setInterval(checkServerStatus, 5000);
    // 立即執行一次
    checkServerStatus();
}

function getProjectRoot() {
    return window.location.pathname.substring(1, window.location.pathname.indexOf('/web/')).replace(/\//g, '\\');
}

async function loadCloudChars() {
    try {
        const sb = window.SupabaseClient.getClient();
        const { data, error } = await sb
            .from('characters')
            .select('id, name, card_json, lpas, updated_at')
            .eq('is_active', true)
            .order('updated_at', { ascending: false });
        if (data) {
            // 舊 V1 卡片就地補上 lpas_v3，使下游（顯示 full_name / 傳給後端）皆統一走 V3
            if (typeof window.convertCardJsonV1ToV3 === 'function') {
                data.forEach(c => { if (c.card_json) window.convertCardJsonV1ToV3(c.card_json); });
            }
            cloudCharacters = data.slice().sort((a, b) =>
                String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hant')
            );
        }
    } catch (e) {
        console.error("Cloud load error:", e);
    }
}

async function loadLocalChars() {
    try {
        const res = await fetch('http://localhost:8081/api/characters');
        const data = await res.json();
        localCharacters = data;
    } catch (e) {
        console.error("Local load error:", e);
    }
}

async function initCharacters() {
    const isLocal = qs('#use-local-data').checked;
    const statusEl = qs('#char-source-status');

    if (isLocal) {
        statusEl.textContent = '🔄 正在讀取本機資料...';
        await loadLocalChars();
        if (localCharacters.length > 0) {
            statusEl.textContent = `📁 已從本機載入 ${localCharacters.length} 個角色`;
        } else {
            statusEl.textContent = '❌ 本機無資料 (請啟動 debug_server.py)';
        }
    } else {
        statusEl.textContent = '☁️ 正在讀取雲端資料...';
        await loadCloudChars();
        if (cloudCharacters.length > 0) {
            statusEl.textContent = `✅ 已從雲端載入 ${cloudCharacters.length} 個角色`;
        } else {
            statusEl.textContent = '⚠️ 雲端無角色卡';
        }
    }
    renderCharacters();
}

// ====== 介面繪製 ======

function renderAll() {
    ensureGenParams();
    qs('#book-title').value = state.bookTitle || "";
    qs('#story-premise').value = state.storyPremise || "";

    // 恢復 AI 設定 (如果存在)
    if (state.aiModel) qs('#model-select').value = state.aiModel;
    if (state.modelOptions) qs('#model-options-select').value = state.modelOptions;
    // 支援舊格式 writerStyle → 還原至風格一
    if (!state.writerStyle1 && state.writerStyle) state.writerStyle1 = state.writerStyle;
    if (state.writerStyle1) qs('#writer-style-select-1').value = state.writerStyle1;
    if (state.writerStyle2) qs('#writer-style-select-2').value = state.writerStyle2;
    if (state.writerStyle3) qs('#writer-style-select-3').value = state.writerStyle3;
    if (state.writerSample) qs('#writer-sample-select').value = state.writerSample;

    renderCharacters();
    renderChapters();
    renderEditor();
}

function renderCharacters() {
    const container = qs('#char-slots-container');
    if (!container) return;
    container.innerHTML = "";
    const isLocal = qs('#use-local-data').checked;

    state.characters.forEach((slot, idx) => {
        // 自動把舊字串格式升級成物件
        if (typeof slot === 'string' || slot == null) {
            slot = { id: getCharId(slot), roleName: "" };
            state.characters[idx] = slot;
        }
        const charId = slot.id || "";
        const slotNum = String(idx + 1).padStart(2, '0');

        const div = document.createElement('div');
        div.className = "model-container-row";
        div.innerHTML = `
            <input type="text" class="role-name-input" data-idx="${idx}"
                value="${(slot.roleName || '').replace(/"/g, '&quot;')}"
                placeholder="角色名稱 ${slotNum}"
                title="劇本中的角色名稱（由下方角色卡演員演出）"
                style="width: 110px;">
            <select data-idx="${idx}">
                <option value="">-- 選取角色卡 --</option>
                ${(isLocal ? localCharacters : cloudCharacters).map(c => {
            const id = isLocal ? c : c.id;
            let label = isLocal ? c : charDropdownLabel(c);
            return `<option value="${id}" ${id === charId ? 'selected' : ''}>${label}</option>`;
        }).join('')}
            </select>
            <button class="btn-remove-char" onclick="removeChar(${idx})">🗑️</button>
        `;
        div.querySelector('select').addEventListener('change', (e) => {
            state.characters[idx].id = e.target.value;
        });
        div.querySelector('.role-name-input').addEventListener('input', (e) => {
            state.characters[idx].roleName = e.target.value;
        });
        container.appendChild(div);
    });
}

function renderChapters() {
    const container = qs('#chapter-list');
    container.innerHTML = "";
    state.chapters.forEach((ch, chIdx) => {
        const div = document.createElement('div');
        div.className = "chapter-card";
        // 整章可拖曳：以標題列的把手（⠿）作為拖曳來源，chapter-card 作為放置目標
        div.setAttribute('ondragover', 'event.preventDefault()');
        div.setAttribute('ondrop', `handleChapterDrop(event, ${chIdx})`);
        div.innerHTML = `
            <div class="chapter-title-row">
                <span class="chapter-drag-handle" title="拖曳以調整章的順序"
                      draggable="true" ondragstart="handleChapterDragStart(event, ${chIdx})"
                      style="cursor:grab; user-select:none; padding:0 4px;">⠿</span>
                <span class="lock-btn btn-lock-ch" title="鎖定後將不會被 AI 覆蓋章標題、章描述、小節大綱（並會一併鎖定/解鎖本章所有小節）"
                      style="opacity: ${ch.locked ? '1' : '0.5'}"
                      onclick="toggleChapterLock(${chIdx})">
                    ${ch.locked ? '🔒' : '🔓'}
                </span>
                <input type="text" value="${ch.title}" placeholder="章節標題" onchange="state.chapters[${chIdx}].title = this.value">
                <button class="ai-btn" onclick="promptAndGenChapterOutline(${chIdx})" title="AI 生成本章未鎖定的小節大綱">🤖 AI 大綱</button>
                <button class="btn-del-sec" onclick="removeChapter(${chIdx})" title="刪除本章，包括本章的所有小節">🗑️</button>
            </div>
            <textarea class="chapter-desc" placeholder="輸入本章大綱說明（AI 將以此產生小節）..." 
                      onchange="state.chapters[${chIdx}].description = this.value">${ch.description || ""}</textarea>
            <div class="section-list">
                ${ch.sections.map((sec, secIdx) => `
                    <div class="section-item ${state.activeIndex.chapter === chIdx && state.activeIndex.section === secIdx ? 'active' : ''}" 
                         draggable="true"
                         ondragstart="handleDragStart(event, ${chIdx}, ${secIdx})"
                         ondragover="event.preventDefault()"
                         ondrop="handleDrop(event, ${chIdx}, ${secIdx})"
                         onclick="setActive(${chIdx}, ${secIdx})">
                        <span class="sec-title-text">
                            ${sec.title || "未命名小節"}
                        </span>
                        <span class="sec-status-icon" style="color:${sec.content ? 'var(--c-ok)' : '#666'};">${sec.content ? '✓' : '...'}</span>
                        <div class="sec-actions">
                            <span class="lock-btn sec-lock" title="鎖定後將不會被 AI 重寫"
                                  style="opacity: ${sec.locked ? '1' : '0.5'}" 
                                  onclick="event.stopPropagation(); toggleLock(${chIdx}, ${secIdx})">
                                ${sec.locked ? '🔒' : '🔓'}
                            </span>
                            <button class="btn-del-sec" title="刪除此小節" onclick="event.stopPropagation(); removeSection(${chIdx}, ${secIdx})">🗑️</button>
                        </div>
                    </div>
                `).join('')}
                <button class="btn-circle" onclick="addSection(${chIdx})">+</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderEditor() {
    const { chapter, section } = state.activeIndex;
    const ch = state.chapters[chapter];
    const sec = ch?.sections[section];
    const titleInp = qs('#active-section-title');
    const editor = qs('#main-editor');

    if (!sec) {
        titleInp.value = "";
        titleInp.placeholder = "請選擇章節";
        titleInp.readOnly = true;
        editor.value = "";
        editor.readOnly = true;
        return;
    }

    titleInp.readOnly = false;
    titleInp.value = sec.title || "";
    editor.readOnly = false;
    editor.value = sec.content || "";

    // 綁定標題編輯
    titleInp.oninput = (e) => {
        sec.title = e.target.value;
        // 為了讓左側列表即時更新，但不影響輸入焦點
        // 我們只更新當前 active 的那個 span 文字
        const activeSpan = document.querySelector('.section-item.active span:first-child');
        if (activeSpan) activeSpan.textContent = e.target.value || "未命名小節";
    };

    // 綁定編輯內容回存
    editor.oninput = (e) => {
        sec.content = e.target.value;
        renderChapters(); // 更新打勾狀態 (這裡會重繪左側，如果會影響體驗再優化)
    };
}

// 事件處理
function setupEventListeners() {
    qs('#add-char').addEventListener('click', () => {
        state.characters.push({ id: "", roleName: "" });
        renderCharacters();
    });

    // 從雲端重新下載角色卡資料（依目前資料來源切換 local / cloud）
    qs('#btn-refresh-chars').addEventListener('click', async () => {
        const btn = qs('#btn-refresh-chars');
        btn.disabled = true;
        try {
            await initCharacters();
        } finally {
            btn.disabled = false;
        }
    });

    // 作者備註
    qs('#btn-author-notes').addEventListener('click', () => {
        qs('#author-notes-text').value = state.authorNotes || '';
        qs('#modal-author-notes').classList.remove('hidden');
    });
    qs('#btn-author-notes-cancel').addEventListener('click', () => {
        qs('#modal-author-notes').classList.add('hidden');
    });
    qs('#btn-author-notes-ok').addEventListener('click', () => {
        state.authorNotes = qs('#author-notes-text').value;
        qs('#modal-author-notes').classList.add('hidden');
        appendLog('📝 作者備註已更新（將隨小說儲存）');
    });

    qs('#add-chapter').addEventListener('click', () => {
        state.chapters.push({ title: "新章節", description: "", sections: [{ title: "新節", content: "" }] });
        renderChapters();
    });

    qs('#use-local-data').addEventListener('change', initCharacters);
    qs('#btn-save').addEventListener('click', saveProject);
    qs('#btn-load').addEventListener('click', loadProject);
    qs('#btn-export').addEventListener('click', exportNovelToMarkdown);
    qs('#btn-ai-gen-content').addEventListener('click', async () => {
        const ok = await openParamsModal({
            modalId: 'modal-params-sc', confirmBtnId: 'btn-sc-params-confirm', cancelBtnId: 'btn-sc-params-cancel',
            fields: [{ inputId: 'sc-words', paramKey: 'sectionContentWords', defaultValue: 3000 }]
        });
        if (ok) aiGenSectionContent();
    });
    qs('#btn-ai-gen-all-outlines').addEventListener('click', async () => {
        if (!confirm("確定要讓 AI 撰寫所有未鎖定章節的大綱嗎？")) return;
        const ok = await openParamsModal({
            modalId: 'modal-params-co', confirmBtnId: 'btn-co-params-confirm', cancelBtnId: 'btn-co-params-cancel',
            fields: [
                { inputId: 'co-section-count', paramKey: 'chapterOutlineSectionCount', defaultValue: 4 },
                { inputId: 'co-words-per-section', paramKey: 'chapterOutlineWordsPerSection', defaultValue: 500 }
            ]
        });
        if (!ok) return;
        for (let i = 0; i < state.chapters.length; i++) {
            if (!state.chapters[i].locked) await aiGenChapterOutline(i);
        }
        appendLog(">> 所有未鎖定章節的大綱已生成完畢。");
    });
    qs('#btn-ai-gen-all-content').addEventListener('click', async () => {
        if (!confirm("確定要讓 AI 撰寫所有未鎖定小節的內文嗎？這可能需要非常長的時間。")) return;
        const ok = await openParamsModal({
            modalId: 'modal-params-sc', confirmBtnId: 'btn-sc-params-confirm', cancelBtnId: 'btn-sc-params-cancel',
            fields: [{ inputId: 'sc-words', paramKey: 'sectionContentWords', defaultValue: 3000 }]
        });
        if (!ok) return;
        for (let i = 0; i < state.chapters.length; i++) {
            const ch = state.chapters[i];
            for (let j = 0; j < ch.sections.length; j++) {
                if (!ch.locked && !ch.sections[j].locked) {
                    state.activeIndex = { chapter: i, section: j };
                    renderAll();
                    await aiGenSectionContent();
                }
            }
        }
        appendLog(">> 所有未鎖定小節的內容已生成完畢。");
    });
    qs('#btn-ai-gen-chapters').addEventListener('click', async () => {
        const ok = await openParamsModal({
            modalId: 'modal-params-cfp', confirmBtnId: 'btn-cfp-params-confirm', cancelBtnId: 'btn-cfp-params-cancel',
            fields: [
                { inputId: 'cfp-chapter-count', paramKey: 'chaptersFromPremiseCount', defaultValue: 16 },
                { inputId: 'cfp-words-per-chapter', paramKey: 'chaptersFromPremiseWordsPerChapter', defaultValue: 400 }
            ]
        });
        if (ok) aiGenChaptersFromPremise();
    });
    qs('#btn-ai-gen-full-auto').addEventListener('click', aiGenFullAuto);
    // 文檔轉粗綱：先開檔案選擇（Windows 內建對話框），選檔完成後再跳參數彈窗
    qs('#btn-story-to-premise').addEventListener('click', () => qs('#story-file-input').click());
    qs('#story-file-input').addEventListener('change', storyFileToPremise);

    // 文檔轉條列：先開檔案選擇，選檔完成後再跳參數彈窗
    qs('#btn-story-to-bullet').addEventListener('click', () => qs('#story-bullet-file-input').click());
    qs('#story-bullet-file-input').addEventListener('change', storyFileToBulletPremise);

    // 評論小說：按鈕與彈窗事件
    qs('#btn-review-novel').addEventListener('click', openReviewModal);
    qs('#btn-review-current-novel').addEventListener('click', reviewCurrentNovel);
    qs('#btn-review-external-file').addEventListener('click', () => qs('#review-file-input').click());
    qs('#review-file-input').addEventListener('change', reviewExternalFile);
    qs('#btn-review-export').addEventListener('click', exportReviewResult);
    qs('#review-role-select').addEventListener('change', onReviewRoleChange);
    qs('#review-user-request').addEventListener('input', onReviewRequestInput);
    qs('#btn-reset-review-prompt').addEventListener('click', resetReviewPrompt);
    qs('#btn-toggle-review-request').addEventListener('click',
        () => toggleReviewSection('review-col-request', 'btn-toggle-review-request'));
    qs('#btn-toggle-review-feedback').addEventListener('click',
        () => toggleReviewSection('review-col-feedback', 'btn-toggle-review-feedback'));
    initReviewResizer();
    qs('#review-search-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doReviewSearch(); }
    });
    qs('#review-search-prev').addEventListener('click', () => goToReviewMatch(reviewCurrentMatch - 1));
    qs('#review-search-next').addEventListener('click', () => goToReviewMatch(reviewCurrentMatch + 1));

    // 多文改寫：按鈕與彈窗事件
    qs('#btn-multi-rewrite').addEventListener('click', openRewriteModal);
    qs('#btn-rewrite-pick-files').addEventListener('click', () => qs('#rewrite-file-input').click());
    qs('#rewrite-file-input').addEventListener('change', onRewriteFilesPicked);
    qs('#btn-rewrite-start').addEventListener('click', startMultiRewrite);
    qs('#btn-rewrite-select-all').addEventListener('click', () => setAllRewriteFilesChecked(true));
    qs('#btn-rewrite-deselect-all').addEventListener('click', () => setAllRewriteFilesChecked(false));
    qs('#btn-rewrite-invert').addEventListener('click', invertRewriteFilesChecked);
    qs('#btn-rewrite-clear-files').addEventListener('click', clearRewriteFiles);
    qs('#rewrite-search-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doRewriteSearch(); }
    });
    qs('#rewrite-search-prev').addEventListener('click', () => goToRewriteMatch(rewriteCurrentMatch - 1));
    qs('#rewrite-search-next').addEventListener('click', () => goToRewriteMatch(rewriteCurrentMatch + 1));
    initRewriteResizer();

    // 🧰 額外功能：預設關閉；點主按鈕開啟／再點主按鈕或點選單項目才會關閉
    const extraBtn = qs('#btn-extra-features');
    const extraMenu = qs('#extra-features-menu');
    if (extraBtn && extraMenu) {
        // 本專案的 .hidden class 只針對 .modal-overlay 生效，改用 inline display 直接切換
        extraBtn.addEventListener('click', () => {
            const open = extraMenu.style.display === 'flex';
            extraMenu.style.display = open ? 'none' : 'flex';
        });
        // 點下拉選單裡任一按鈕後也自動收合
        extraMenu.querySelectorAll('button').forEach(b => {
            b.addEventListener('click', () => { extraMenu.style.display = 'none'; });
        });
    }

    // 🌐 網路搜尋並依序改寫：按鈕與彈窗事件
    qs('#btn-web-rewrite').addEventListener('click', openWebRewriteModal);
    qs('#btn-webre-start').addEventListener('click', startWebRewrite);
    qs('#webre-search-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doWebRewriteSearch(); }
    });
    qs('#webre-search-prev').addEventListener('click', () => goToWebRewriteMatch(webRewriteCurrentMatch - 1));
    qs('#webre-search-next').addEventListener('click', () => goToWebRewriteMatch(webRewriteCurrentMatch + 1));
    initWebRewriteResizer();

    qs('#btn-compare-novels').addEventListener('click', openCompareModal);
    qs('#compare-mode-select').addEventListener('change', updateAllCompareContent);
    document.querySelectorAll('.compare-novel-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
            onCompareNovelSelect(parseInt(sel.getAttribute('data-col')), e.target.value);
        });
    });
    qs('#compare-search-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doCompareSearch(); }
    });
    qs('#compare-search-prev').addEventListener('click', () => goToCompareMatch(compareCurrentMatch - 1));
    qs('#compare-search-next').addEventListener('click', () => goToCompareMatch(compareCurrentMatch + 1));

    qs('#btn-load-cloud').addEventListener('click', listCloudNovels);
    qs('#cloud-novel-select').addEventListener('change', loadCloudNovel);
    // 只要下拉選單失去焦點（關閉），不論是否已選取，一律還原成按鈕
    qs('#cloud-novel-select').addEventListener('blur', () => {
        setTimeout(() => {
            const select = qs('#cloud-novel-select');
            const btn = qs('#btn-load-cloud');
            if (select.style.display !== 'none') {
                select.style.display = 'none';
                select.value = '';
                btn.style.display = 'inline-block';
            }
        }, 250);
    });

    // #toggle-premise 縮放按鈕監聽已移動至 novel_generator.html 中的 initResizableColumns 統一處理


    qs('#story-premise').addEventListener('input', (e) => {
        state.storyPremise = e.target.value;
    });

    qs('#model-select').addEventListener('change', (e) => {
        state.currentModel = e.target.value;
    });

    qs('#book-title').addEventListener('input', (e) => {
        state.bookTitle = e.target.value;
    });

    // Multi-Book Modal
    qs('#btn-multibook-cancel').addEventListener('click', () => {
        qs('#modal-multibook').classList.add('hidden');
    });
    qs('#btn-multibook-confirm').addEventListener('click', () => {
        const count = Math.max(1, parseInt(qs('#multibook-count').value) || 1);
        const doPhase1 = qs('#mb-phase1').checked;
        const doPhase2 = qs('#mb-phase2').checked;
        const doPhase3 = qs('#mb-phase3').checked;
        const password = qs('#multibook-password').value.trim();
        if (!doPhase1 && !doPhase2 && !doPhase3) {
            alert('請至少勾選一個生成階段。');
            return;
        }
        // 從右側讀取 AI 生成參數並存入 state.genParams
        ensureGenParams();
        state.genParams.chaptersFromPremiseCount = Math.max(1, parseInt(qs('#mb-cfp-chapter-count').value) || 16);
        state.genParams.chaptersFromPremiseWordsPerChapter = Math.max(50, parseInt(qs('#mb-cfp-words').value) || 400);
        state.genParams.chapterOutlineSectionCount = Math.max(1, parseInt(qs('#mb-co-section-count').value) || 4);
        state.genParams.chapterOutlineWordsPerSection = Math.max(50, parseInt(qs('#mb-co-words').value) || 500);
        state.genParams.sectionContentWords = Math.max(100, parseInt(qs('#mb-sc-words').value) || 3000);
        qs('#modal-multibook').classList.add('hidden');
        aiGenMultiBook(count, { doPhase1, doPhase2, doPhase3, password });
    });

    // Save Novel Modal
    qs('#btn-save-cancel').addEventListener('click', () => {
        qs('#modal-novel-save').classList.add('hidden');
    });
    qs('#btn-save-confirm').addEventListener('click', confirmSaveProject);

    // Load Password Modal
    qs('#btn-password-cancel').addEventListener('click', () => {
        qs('#modal-novel-password').classList.add('hidden');
        qs('#cloud-novel-select').value = '';
    });
    qs('#btn-password-ok').addEventListener('click', confirmLoadCloudNovel);

    const startServerBtn = qs('#start-server-btn');
    if (startServerBtn) {
        startServerBtn.addEventListener('click', () => {
            const batContent = '@echo off\r\nchcp 65001 >nul\r\ncd /d "' + getProjectRoot() + '"\r\necho ====================================\r\necho   LoveIsABitMessy - Debug Server\r\necho   http://localhost:8081\r\necho ====================================\r\necho.\r\npython debug_server.py\r\necho.\r\necho === 伺服器已停止 ===\r\npause >nul\r\n';
            const blob = new Blob([batContent], { type: 'application/bat' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'start_debug_server.bat';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            appendLog('📥 已下載 start_debug_server.bat\n\n請雙擊執行該檔案以啟動伺服器，然後觀察上方狀態。');
            startServerPolling();
        });
    }
}

function setActive(chIdx, secIdx) {
    state.activeIndex = { chapter: chIdx, section: secIdx };
    renderChapters();
    renderEditor();
}

function updateSectionTitle(chIdx, secIdx, val) {
    state.chapters[chIdx].sections[secIdx].title = val;
}

function addSection(chIdx) {
    state.chapters[chIdx].sections.push({ title: "新節", content: "" });
    renderChapters();
}

function removeSection(chIdx, secIdx) {
    if (!confirm("確定要刪除這個小節大綱嗎？")) return;
    state.chapters[chIdx].sections.splice(secIdx, 1);
    renderChapters();
}

function removeChar(idx) {
    if (!confirm("確定要移除這個角色嗎？")) return;
    state.characters.splice(idx, 1);
    renderCharacters();
}

function removeChapter(idx) {
    if (!confirm("確定要刪除整個章節嗎？這將會連同該章節下的所有小節內容一併刪除。")) return;
    state.chapters.splice(idx, 1);
    renderChapters();
}

function toggleLock(chIdx, secIdx) {
    state.chapters[chIdx].sections[secIdx].locked = !state.chapters[chIdx].sections[secIdx].locked;
    renderChapters();
}

function toggleChapterLock(chIdx) {
    const ch = state.chapters[chIdx];
    ch.locked = !ch.locked;
    // 章上鎖/解鎖時，一併將本章所有小節設為相同狀態
    ch.sections.forEach(sec => { sec.locked = ch.locked; });
    renderChapters();
}

// 一次上鎖所有章與所有小節；若目前全部已上鎖則改為全部解鎖
function toggleAllLocks() {
    const allLocked = state.chapters.length > 0 &&
        state.chapters.every(ch => ch.locked && ch.sections.every(sec => sec.locked));
    const target = !allLocked;
    state.chapters.forEach(ch => {
        ch.locked = target;
        ch.sections.forEach(sec => { sec.locked = target; });
    });
    renderChapters();
}

// ── 整章拖曳排序 ──
let chapterDragData = null;
function handleChapterDragStart(e, chIdx) {
    chapterDragData = { chIdx };
    e.dataTransfer.setData('text/plain', ''); // 必需
    e.dataTransfer.effectAllowed = 'move';
}

function handleChapterDrop(e, targetChIdx) {
    if (!chapterDragData) return; // 若是拖曳小節則忽略
    e.preventDefault();
    const from = chapterDragData.chIdx;
    chapterDragData = null;
    if (from === targetChIdx) return;

    const chapters = state.chapters;
    const item = chapters.splice(from, 1)[0];
    chapters.splice(targetChIdx, 0, item);

    // 更新目前選取章的索引
    const act = state.activeIndex.chapter;
    if (act === from) {
        state.activeIndex.chapter = targetChIdx;
    } else if (from < act && targetChIdx >= act) {
        state.activeIndex.chapter--;
    } else if (from > act && targetChIdx <= act) {
        state.activeIndex.chapter++;
    }

    renderChapters();
    renderEditor();
}

let dragData = null;
function handleDragStart(e, chIdx, secIdx) {
    dragData = { chIdx, secIdx };
    e.dataTransfer.setData('text/plain', ''); // 必需
}

function handleDrop(e, chIdx, targetSecIdx) {
    if (!dragData) return; // 若是拖曳整章則交由 chapter-card 的 handleChapterDrop 處理
    e.preventDefault();
    e.stopPropagation(); // 小節拖放時避免同時觸發整章的放置處理
    if (dragData.chIdx !== chIdx) {
        alert("目前僅支援在同一個章節內移動小節位置。");
        return;
    }

    const sections = state.chapters[chIdx].sections;
    const item = sections.splice(dragData.secIdx, 1)[0];
    sections.splice(targetSecIdx, 0, item);

    // 如果移動的是當前選取的 section，更新 activeIndex
    if (state.activeIndex.chapter === chIdx) {
        if (state.activeIndex.section === dragData.secIdx) {
            state.activeIndex.section = targetSecIdx;
        } else if (dragData.secIdx < state.activeIndex.section && targetSecIdx >= state.activeIndex.section) {
            state.activeIndex.section--;
        } else if (dragData.secIdx > state.activeIndex.section && targetSecIdx <= state.activeIndex.section) {
            state.activeIndex.section++;
        }
    }

    dragData = null;
    renderChapters();
    renderEditor();
}

// ====== AI 功能 (串接 debug_server.py) ======

function setAIGeneratingState(isGenerating, logMessage = "") {
    const buttons = document.querySelectorAll('.ai-btn, #btn-ai-gen-content');
    buttons.forEach(b => {
        b.disabled = isGenerating;
        if (isGenerating) b.style.opacity = '0.5';
        else b.style.opacity = '1';
    });

    if (logMessage) {
        const logBox = qs('#log-output');
        if (logBox) {
            // 處理字面上的 \n
            const formattedMsg = logMessage.replace(/\\n/g, '\n');
            logBox.value += `\n[${new Date().toLocaleTimeString()}] ${formattedMsg}\n`;
            logBox.scrollTop = logBox.scrollHeight;
        }
    }
}

function appendLog(text) {
    try {
        const logBox = document.getElementById('log-output');
        if (logBox) {
            const msg = (text === undefined || text === null) ? "" : String(text);
            const formattedText = msg.replace(/\\n/g, '\n');
            logBox.value += formattedText + "\n";
            logBox.scrollTop = logBox.scrollHeight;
            // 同時輸出到 console 方便除錯
            console.log("[NovelGen Log]", formattedText);
        } else {
            console.warn("找不到 #log-output 元素，無法輸出 Log:", text);
        }
    } catch (e) {
        console.error("appendLog 發生錯誤:", e);
    }
}
window.appendLog = appendLog;

async function aiGenChapterOutline(chIdx) {
    const chapter = state.chapters[chIdx];
    if (!chapter.description) {
        return;
    }

    const chNum = chIdx + 1;
    setAIGeneratingState(true, `>> 任務啟動...\n正在為第 ${chNum} 章產生小節大綱，請稍候...`);

    try {
        // 收集本章「已上鎖」的小節，讓 AI 知道哪些位置是固定的
        const locked_sections = chapter.sections
            .map((s, i) => ({ index: i + 1, title: s.title, locked: s.locked }))
            .filter(s => s.locked)
            .map(({ index, title }) => ({ index, title }));

        // 全書章節一覽（含上鎖狀態），讓 AI 有前後文
        const all_chapters = state.chapters.map((ch, i) => ({
            index: i + 1,
            title: ch.title,
            description: ch.description,
            locked: ch.locked
        }));

        const payload = {
            book_title: state.bookTitle || '故事專案',
            description: chapter.description,
            story_premise: state.storyPremise,
            all_chapters,
            chapter_index: chIdx,   // 0-based
            locked_sections,        // 本章已上鎖的節（含 1-based index 與 title）
            characters: state.characters
                .map(c => {
                    const id = getCharId(c);
                    const found = cloudCharacters.find(cc => cc.id === id);
                    if (!found) return null;
                    return { ...found.card_json, role_name: getCharRoleName(c) };
                })
                .filter(Boolean),
            character_ids: state.characters.map(getCharId).filter(Boolean),
            role_names: state.characters.filter(c => getCharId(c)).map(getCharRoleName),
            model: state.currentModel || 'gemma4',
            model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null,
            writer_settings: (window.WriterSettingsApp && window.WriterSettingsApp.getSelectedContext()) || null,
            section_count: state.genParams.chapterOutlineSectionCount,
            words_per_section: state.genParams.chapterOutlineWordsPerSection
        };

        // Step 1: 取得提示詞預覽
        appendLog(">> 正在彙整 AI 提示詞...");
        const previewRes = await callDebugServer('/api/generate_outline', { ...payload, preview: true });
        if (previewRes && previewRes.debug_prompt) {
            appendLog(`\n=== 傳遞給 AI 的提示詞 ===\n${previewRes.debug_prompt}\n=====================\n`);
        }

        // Step 2: 真正生成
        appendLog(`>> 正在呼叫 AI 為第 ${chNum} 章產生小節大綱，請稍候...`);
        const res = await callDebugServerAsync('/api/novel_outline_async', payload);
        if (res && res.sections) {
            const newSections = res.sections;
            const currentSections = chapter.sections;

            // 找出所有「未上鎖」的索引
            const unlockedIndices = [];
            currentSections.forEach((s, idx) => {
                if (!s.locked) unlockedIndices.push(idx);
            });

            // 策略：優先替換掉未上鎖的小節，如果新的比舊的多，則往後追加
            let aiIdx = 0;
            unlockedIndices.forEach(idx => {
                if (aiIdx < newSections.length) {
                    currentSections[idx].title = newSections[aiIdx];
                    currentSections[idx].content = ""; // 重置內容，因為是大綱更新
                    aiIdx++;
                }
            });

            // 如果 AI 產生的比現有未上鎖的多，則新增
            while (aiIdx < newSections.length) {
                currentSections.push({ title: newSections[aiIdx], content: "", locked: false });
                aiIdx++;
            }

            renderChapters();
            appendLog(`>> 第 ${chNum} 章大綱產生完畢！未上鎖的小節已成功更新。`);
        }
    } catch (e) {
        console.error(e);
        appendLog(`\n❌ AI 生成大綱失敗: ${e.message}`);
        alert("AI 生成大綱失敗，請確認 debug_server.py 是否啟動。");
    } finally {
        setAIGeneratingState(false);
    }
}

async function aiGenAllOutlines() {
    if (!confirm("確定要讓 AI 撰寫所有未鎖定章節的大綱嗎？")) return;
    for (let i = 0; i < state.chapters.length; i++) {
        if (!state.chapters[i].locked) {
            await aiGenChapterOutline(i);
        }
    }
    appendLog(">> 所有未鎖定章節的大綱已生成完畢。");
}

async function aiGenAllContent() {
    if (!confirm("確定要讓 AI 撰寫所有未鎖定小節的內文嗎？這可能需要非常長的時間。")) return;
    for (let i = 0; i < state.chapters.length; i++) {
        const ch = state.chapters[i];
        for (let j = 0; j < ch.sections.length; j++) {
            if (!ch.locked && !ch.sections[j].locked) {
                state.activeIndex = { chapter: i, section: j };
                renderAll();
                await aiGenSectionContent();
            }
        }
    }
    appendLog(">> 所有未鎖定小節的內容已生成完畢。");
}

async function aiGenFullAuto() {
    if (!state.storyPremise) {
        alert("請先輸入故事粗綱。");
        return;
    }
    if (state.characters.map(getCharId).filter(Boolean).length === 0) {
        alert("請至少選擇一位登場角色（生成內文需要角色資料）。");
        return;
    }
    // 將 genParams 同步至多本小說彈窗右側輸入欄
    ensureGenParams();
    const gp = state.genParams;
    qs('#mb-cfp-chapter-count').value = gp.chaptersFromPremiseCount;
    qs('#mb-cfp-words').value = gp.chaptersFromPremiseWordsPerChapter;
    qs('#mb-co-section-count').value = gp.chapterOutlineSectionCount;
    qs('#mb-co-words').value = gp.chapterOutlineWordsPerSection;
    qs('#mb-sc-words').value = gp.sectionContentWords;
    // 開啟數量選擇彈窗（接續由 btn-multibook-confirm 呼叫 aiGenMultiBook）
    qs('#multibook-count').value = 1;
    qs('#modal-multibook').classList.remove('hidden');
}

/**
 * 清除所有未上鎖的章節標題、章描述、小節標題與小節內文。
 * 不刪除章節或小節本身，以保留章節順序（使用者可上鎖來固定內容）。
 */
function clearUnlockedContent() {
    state.chapters.forEach(ch => {
        if (!ch.locked) {
            ch.title = "";
            ch.description = "";
        }
        ch.sections.forEach(sec => {
            if (!sec.locked) {
                sec.title = "";
                sec.content = "";
            }
        });
    });
}

async function aiGenMultiBook(totalCount, opts = {}) {
    const { doPhase1 = true, doPhase2 = true, doPhase3 = true, password = '' } = opts;
    const originalTitle = (state.bookTitle || '未命名小說').trim();

    // 在迴圈前儲存當前專案的完整快照，每本生成前都會還原，避免殘留
    const originalStateSnapshot = JSON.parse(JSON.stringify(state));

    const phaseLabels = [
        doPhase1 ? '章節' : null,
        doPhase2 ? '節大綱' : null,
        doPhase3 ? '內文' : null
    ].filter(Boolean).join(' → ');
    appendLog(`\n==============================\n🚀 全自動多本生成模式啟動（共 ${totalCount} 本，執行：${phaseLabels}）\n==============================`);
    appendLog(`📌 已儲存原始專案快照（${state.chapters.length} 章），每本生成前都會還原。`);

    // 若有密碼（會儲存雲端），先查詢已存在的序號，從最大序號+1開始，避免同名衝突
    let startNum = 1;
    if (password) {
        try {
            const sb = window.SupabaseClient && window.SupabaseClient.getClient();
            if (sb) {
                const { data: existingNovels } = await sb
                    .from('novel_entries')
                    .select('novel_title')
                    .like('novel_title', `${originalTitle}-%`);
                if (existingNovels && existingNovels.length > 0) {
                    const existingNums = existingNovels
                        .map(r => { const m = r.novel_title.match(/-(\d+)$/); return m ? parseInt(m[1], 10) : 0; })
                        .filter(n => n > 0);
                    if (existingNums.length > 0) {
                        const maxNum = Math.max(...existingNums);
                        startNum = maxNum + 1;
                        appendLog(`☁️ 雲端已有同名小說（最大序號：${String(maxNum).padStart(3, '0')}），本次從 ${String(startNum).padStart(3, '0')} 開始。`);
                    }
                }
            }
        } catch (e) {
            appendLog(`⚠️ 查詢雲端序號失敗，從 001 開始: ${e.message}`);
        }
    }

    for (let bookNum = startNum; bookNum < startNum + totalCount; bookNum++) {
        const relNum = bookNum - startNum + 1;   // 本次批次中第幾本（1, 2, 3…）
        const paddedNum = String(bookNum).padStart(3, '0');
        const bookTitle = `${originalTitle}-${paddedNum}`;

        appendLog(`\n========== 📖 第 ${relNum}/${totalCount} 本：${bookTitle} ==========`);

        // 還原原始專案狀態，避免上一本殘留的章節/內容影響本次生成
        appendLog(`🔄 正在還原原始專案狀態...`);
        for (const key in state) {
            if (Object.prototype.hasOwnProperty.call(state, key)) delete state[key];
        }
        Object.assign(state, JSON.parse(JSON.stringify(originalStateSnapshot)));

        // 清除未上鎖的章節描述與小節內容，讓 AI 從空白狀態開始生成
        clearUnlockedContent();
        state.bookTitle = bookTitle;
        qs('#book-title').value = bookTitle;
        renderAll();
        appendLog(`✅ 原始狀態已還原（${state.chapters.length} 章），未上鎖的內容已清空。`);

        // Phase 1: 根據粗綱生成章標題與章描述（跳過已鎖定）
        if (doPhase1) {
            appendLog("\n--- Phase 1: 根據故事粗綱生成各章節 ---");
            await aiGenChaptersFromPremise(true); // true = skip confirm
        } else {
            appendLog("\n--- Phase 1: 已略過（使用現有章節）---");
        }

        // Phase 2: 生成小節標題與小節描述
        if (doPhase2) {
            appendLog("\n--- Phase 2: 為各章節生成節大綱 ---");
            for (let i = 0; i < state.chapters.length; i++) {
                if (!state.chapters[i].locked) {
                    appendLog(`\n>> 正在為第 ${i + 1} 章生成節大綱...`);
                    await aiGenChapterOutline(i);
                } else {
                    appendLog(`\n>> 第 ${i + 1} 章已鎖定，跳過。`);
                }
            }
        } else {
            appendLog("\n--- Phase 2: 已略過（使用現有節大綱）---");
        }

        // Phase 3: 生成內文
        if (doPhase3) {
            appendLog("\n--- Phase 3: 為各節生成內文 ---");
            for (let i = 0; i < state.chapters.length; i++) {
                const ch = state.chapters[i];
                for (let j = 0; j < ch.sections.length; j++) {
                    if (!ch.locked && !ch.sections[j].locked) {
                        appendLog(`\n>> 正在為第 ${i + 1} 章第 ${j + 1} 節生成內文...`);
                        state.activeIndex = { chapter: i, section: j };
                        renderAll();
                        await aiGenSectionContent();
                    } else {
                        appendLog(`\n>> 第 ${i + 1} 章第 ${j + 1} 節已鎖定，跳過。`);
                    }
                }
            }
        } else {
            appendLog("\n--- Phase 3: 已略過（不生成內文）---");
        }

        // 自動儲存（雲端 + 本機下載）
        appendLog(`\n>> 📥 正在自動儲存《${bookTitle}》...`);
        await autoSaveBook(bookTitle, password);
        appendLog(`\n✅ 第 ${bookNum}/${totalCount} 本《${bookTitle}》已完成！`);
    }

    // 還原書名顯示
    state.bookTitle = originalTitle;
    qs('#book-title').value = originalTitle;

    appendLog(`\n==============================\n🎉 全部 ${totalCount} 本小說生成完畢！\n==============================`);
}

async function autoSaveBook(bookTitle, password) {
    const savedTitle = state.bookTitle;
    state.bookTitle = bookTitle; // 暫時換成本書標題，供後續函式讀取

    // ── 1. 雲端儲存（有密碼才執行）
    if (password) {
        try {
            const sb = window.SupabaseClient && window.SupabaseClient.getClient();
            if (sb) {
                appendLog(`☁️ 正在將《${bookTitle}》儲存至雲端...`);
                const fullText = getNovelMarkdown();
                const { error } = await sb.from('novel_entries').insert({
                    novel_title: bookTitle,
                    edit_data: JSON.parse(JSON.stringify(state)),
                    novel_full_text: fullText,
                    password: password,
                    updated_at: new Date()
                });
                if (error) {
                    appendLog(`❌ 雲端儲存失敗: ${error.message}`);
                } else {
                    appendLog(`✅ 《${bookTitle}》已儲存至雲端`);
                }
            } else {
                appendLog(`⚠️ Supabase 未初始化，略過雲端儲存`);
            }
        } catch (e) {
            appendLog(`⚠️ 雲端儲存異常: ${e.message}`);
        }
    }

    // ── 2. 本機 JSON 下載
    const localState = JSON.parse(JSON.stringify(state));
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(localState));
    const jsonAnchor = document.createElement('a');
    jsonAnchor.setAttribute("href", dataStr);
    jsonAnchor.setAttribute("download", bookTitle + ".json");
    document.body.appendChild(jsonAnchor);
    jsonAnchor.click();
    jsonAnchor.remove();

    // ── 3. 本機 Markdown 下載
    const md = getNovelMarkdown();
    const blob = new Blob([md], { type: 'text/markdown' });
    const mdUrl = URL.createObjectURL(blob);
    const mdAnchor = document.createElement('a');
    mdAnchor.href = mdUrl;
    mdAnchor.download = bookTitle + ".md";
    document.body.appendChild(mdAnchor);
    mdAnchor.click();
    mdAnchor.remove();
    URL.revokeObjectURL(mdUrl);

    state.bookTitle = savedTitle; // 還原
    appendLog(`>> 📁 已下載：${bookTitle}.json  &  ${bookTitle}.md`);
}

async function aiGenChaptersFromPremise(skipConfirm = false) {
    if (!state.storyPremise) {
        alert("請先輸入故事粗綱。");
        return;
    }
    if (!skipConfirm && !confirm("這將根據粗綱生成各章標題與描述，會覆蓋現有未鎖定的章節，確定嗎？")) return;

    setAIGeneratingState(true, ">> 正在根據故事粗綱生成章節規劃...");

    try {
        // 收集「已上鎖的章節」，告知 AI 哪些章節不可更動
        const locked_chapters = state.chapters
            .map((ch, i) => ({ index: i + 1, title: ch.title, description: ch.description, locked: ch.locked }))
            .filter(ch => ch.locked)
            .map(({ index, title, description }) => ({ index, title, description }));

        const payload = {
            book_title: state.bookTitle || '故事專案',
            story_premise: state.storyPremise,
            characters: state.characters
                .map(c => {
                    const id = getCharId(c);
                    const found = cloudCharacters.find(cc => cc.id === id);
                    if (!found) return null;
                    return { ...found.card_json, role_name: getCharRoleName(c) };
                })
                .filter(Boolean),
            character_ids: state.characters.map(getCharId).filter(Boolean),
            role_names: state.characters.filter(c => getCharId(c)).map(getCharRoleName),
            locked_chapters,
            model: state.currentModel || 'gemma4',
            model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null,
            writer_settings: (window.WriterSettingsApp && window.WriterSettingsApp.getSelectedContext()) || null,
            chapter_count: state.genParams.chaptersFromPremiseCount,
            words_per_chapter: state.genParams.chaptersFromPremiseWordsPerChapter
        };

        // Step 1: 取得提示詞預覽
        appendLog(">> 正在彙整 AI 提示詞...");
        const previewRes = await callDebugServer('/api/generate_chapters', { ...payload, preview: true });
        if (previewRes && previewRes.debug_prompt) {
            appendLog(`\n=== 傳遞給 AI 的提示詞 ===\n${previewRes.debug_prompt}\n=====================\n`);
        }

        // Step 2: 真正生成
        appendLog(">> 正在呼叫 AI 執行章節規劃生成任務...");
        const res = await callDebugServerAsync('/api/novel_chapters_async', payload);
        if (res && res.chapters) {
            const newChapters = res.chapters;
            const currentChapters = state.chapters;

            // 找出未上鎖的索引
            const unlockedIndices = [];
            currentChapters.forEach((ch, idx) => {
                if (!ch.locked) unlockedIndices.push(idx);
            });

            let aiIdx = 0;
            unlockedIndices.forEach(idx => {
                if (aiIdx < newChapters.length) {
                    currentChapters[idx].title = newChapters[aiIdx].title;
                    currentChapters[idx].description = newChapters[aiIdx].description;
                    aiIdx++;
                }
            });

            // 追加
            while (aiIdx < newChapters.length) {
                currentChapters.push({
                    title: newChapters[aiIdx].title,
                    description: newChapters[aiIdx].description,
                    locked: false,
                    sections: [{ title: "第 1 節", content: "", locked: false }]
                });
                aiIdx++;
            }

            renderChapters();
            appendLog(">> 章節規劃生成完畢！");
        }
    } catch (e) {
        appendLog(`\n❌ 生成章節規劃失敗: ${e.message}`);
    } finally {
        setAIGeneratingState(false);
    }
}

function exportNovelToMarkdown() {
    let md = `# ${state.bookTitle}\n\n`;
    md += `## 故事粗綱\n${state.storyPremise}\n\n`;

    state.chapters.forEach(ch => {
        md += `## ${ch.title}\n`;
        md += `> ${ch.description}\n\n`;
        ch.sections.forEach(sec => {
            md += `### ${sec.title}\n\n`;
            md += `${sec.content || "*(未生成內容)*"}\n\n`;
        });
        md += `---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.bookTitle || 'novel'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    appendLog(">> 小說已匯出為 Markdown 格式。");
}

async function aiGenSectionContent() {
    const { chapter, section } = state.activeIndex;
    const ch = state.chapters[chapter];
    const sec = ch.sections[section];

    if (state.characters.map(getCharId).filter(Boolean).length === 0) {
        alert("請至少選擇一位登場角色。");
        return;
    }

    const chNum = chapter + 1;
    const secNum = section + 1;
    const sectionTitleText = sec.title || `第 ${secNum} 節`;
    setAIGeneratingState(true, `>> 任務啟動...\n正在呼叫 Ollama 產生第 ${chNum} 章第 ${secNum} 節 [${sectionTitleText}] 的內容，請稍候...`);

    try {
        // 上一節（同章）
        const prevSec = section > 0 ? ch.sections[section - 1] : null;
        // 下一節（同章，優先取已鎖定的；無則取下一節）
        const nextSec = section < ch.sections.length - 1 ? ch.sections[section + 1] : null;
        // 所有章節的所有節大綱（供全書連貫）
        const all_sections_overview = state.chapters.map((c, ci) => ({
            chapter_index: ci + 1,
            chapter_title: c.title,
            sections: c.sections.map((s, si) => ({ index: si + 1, title: s.title, locked: s.locked }))
        }));

        const payload = {
            characters: state.characters
                .map(c => {
                    const id = getCharId(c);
                    const found = cloudCharacters.find(cc => cc.id === id);
                    if (!found) return null;
                    return { ...found.card_json, role_name: getCharRoleName(c) };
                })
                .filter(Boolean),
            character_ids: state.characters.map(getCharId).filter(Boolean),
            role_names: state.characters.filter(c => getCharId(c)).map(getCharRoleName),
            model: state.currentModel || qs('#model-select')?.value || 'gemma4',
            model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null,
            writer_settings: (window.WriterSettingsApp && window.WriterSettingsApp.getSelectedContext()) || null,
            story_premise: state.storyPremise,
            words_per_section: state.genParams.sectionContentWords,
            context: {
                chapter_index: chNum,     // 1-based
                section_index: secNum,    // 1-based
                chapter_title: ch.title,
                chapter_desc: ch.description,
                section_title: sec.title,
                // 上一節標題與已生成的內文（讓 AI 銜接）
                prev_section_title: prevSec ? prevSec.title : null,
                prev_section_content: prevSec ? (prevSec.content || '') : null,
                // 下一節標題（讓 AI 預留伏筆）
                next_section_title: nextSec ? nextSec.title : null,
                next_section_locked: nextSec ? !!nextSec.locked : false
            },
            all_sections_overview
        };

        // Step 1: 取得提示詞預覽
        appendLog(">> 正在彙整 AI 提示詞...");
        const previewRes = await callDebugServer('/api/generate_story_content', { ...payload, preview: true });
        if (previewRes && previewRes.debug_prompt) {
            appendLog(`\n=== 傳遞給 AI 的提示詞 ===\n${previewRes.debug_prompt}\n=====================\n`);
        }

        // Step 2: 真正生成
        appendLog(">> 正在呼叫 AI 執行小節內文生成任務...");
        const res = await callDebugServerAsync('/api/novel_content_async', payload);
        if (res && res.content) {
            sec.content = res.content;
            renderEditor();
            renderChapters();
            appendLog(`>> 第 ${chNum} 章第 ${secNum} 節內文產生完畢！`);
        }
    } catch (e) {
        appendLog(`\n❌ AI 寫作失敗: ${e.message}`);
        alert("AI 寫作失敗。");
    } finally {
        setAIGeneratingState(false);
    }
}

async function callDebugServer(endpoint, payload) {
    if (!serverOnline) await checkServerStatus();
    if (!serverOnline) throw new Error("Server offline");

    try {
        const res = await fetch(`http://localhost:8081${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (e) {
        throw e;
    }
}

/**
 * 讀取本地端故事文字檔，由 AI 依起承轉合濃縮成故事粗綱，填入 #story-premise。
 */
async function storyFileToPremise(event) {
    const file = event.target.files[0];
    // 重置 input，讓下次選同一個檔案也能觸發
    event.target.value = '';
    if (!file) return;

    // 只接受 .txt / .md
    if (!file.name.match(/\.(txt|md)$/i)) {
        alert('❌ 僅支援 .txt 或 .md 文字檔案。');
        return;
    }

    const btn = qs('#btn-story-to-premise');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ 讀取中…';

    let textContent = '';
    try {
        textContent = await file.text();
    } catch (e) {
        alert('❌ 無法讀取檔案：' + e.message);
        btn.disabled = false;
        btn.textContent = origText;
        return;
    }

    if (!textContent || textContent.trim().length < 50) {
        alert('❌ 檔案內容太短（少於 50 字），請確認檔案內容是否正確。');
        btn.disabled = false;
        btn.textContent = origText;
        return;
    }

    // 讀檔成功後才彈出「生成參數」彈窗
    btn.disabled = false;
    btn.textContent = origText;
    const okParams = await openParamsModal({
        modalId: 'modal-params-stp', confirmBtnId: 'btn-stp-params-confirm', cancelBtnId: 'btn-stp-params-cancel',
        fields: [
            { inputId: 'stp-chapter-count', paramKey: 'storyToPremiseChapters', defaultValue: 8 },
            { inputId: 'stp-words-per-chapter', paramKey: 'storyToPremiseWordsPerChapter', defaultValue: 200 }
        ]
    });
    if (!okParams) { appendLog('>> 已取消文檔轉粗綱。'); return; }
    btn.disabled = true;

    appendLog(`📄 已讀取「${file.name}」，共 ${textContent.length} 字。`);
    appendLog('🤖 正在呼叫 AI 依起承轉合濃縮成故事粗綱（請稍候）...');
    btn.textContent = '⏳ AI 分析中…';

    try {
        const payload = {
            text_content: textContent,
            model: state.currentModel || 'gemma4',
            model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null,
            chapter_count: state.genParams.storyToPremiseChapters,
            words_per_chapter: state.genParams.storyToPremiseWordsPerChapter
        };
        const result = await callDebugServerAsync('/api/story_to_premise_async', payload);
        if (result && result.premise) {
            qs('#story-premise').value = result.premise;
            state.storyPremise = result.premise;
            appendLog('✅ 故事粗綱已生成，已填入「故事粗綱」欄位。');
        } else {
            appendLog('❌ AI 未回傳有效粗綱，請查看 LOG 或重試。');
        }
    } catch (e) {
        appendLog('❌ 發生錯誤：' + e.message);
        alert('❌ 呼叫 AI 失敗：' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = origText;
    }
}

/**
 * 讀取本地端故事文字檔，由 AI 依起承轉合轉成「條列式」故事粗綱，填入 #story-premise。
 * 與 storyFileToPremise 不同之處：使用 build_story_to_bullet_premise_prompt，
 * 產出條列(*) 格式並包含 AI 自行發展的替代劇情走向。
 */
async function storyFileToBulletPremise(event) {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;

    if (!file.name.match(/\.(txt|md)$/i)) {
        alert('❌ 僅支援 .txt 或 .md 文字檔案。');
        return;
    }

    const btn = qs('#btn-story-to-bullet');
    const origText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ 讀取中…';

    let textContent = '';
    try {
        textContent = await file.text();
    } catch (e) {
        alert('❌ 無法讀取檔案：' + e.message);
        btn.disabled = false;
        btn.textContent = origText;
        return;
    }

    if (!textContent || textContent.trim().length < 50) {
        alert('❌ 檔案內容太短（少於 50 字），請確認檔案內容是否正確。');
        btn.disabled = false;
        btn.textContent = origText;
        return;
    }

    // 讀檔成功後才彈出「生成參數」彈窗
    btn.disabled = false;
    btn.textContent = origText;
    const okParams = await openParamsModal({
        modalId: 'modal-params-stb', confirmBtnId: 'btn-stb-params-confirm', cancelBtnId: 'btn-stb-params-cancel',
        fields: [
            { inputId: 'stb-chapter-count', paramKey: 'storyToBulletChapters', defaultValue: 8 },
            { inputId: 'stb-words-per-chapter', paramKey: 'storyToBulletWordsPerChapter', defaultValue: 400 }
        ]
    });
    if (!okParams) { appendLog('>> 已取消文檔轉條列。'); return; }
    btn.disabled = true;

    appendLog(`📋 已讀取「${file.name}」，共 ${textContent.length} 字。`);
    appendLog('🤖 正在呼叫 AI 依起承轉合轉成條列式故事粗綱（請稍候）...');
    btn.textContent = '⏳ AI 分析中…';

    try {
        const payload = {
            text_content: textContent,
            model: state.currentModel || 'gemma4',
            model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null,
            chapter_count: state.genParams.storyToBulletChapters,
            words_per_chapter: state.genParams.storyToBulletWordsPerChapter
        };
        const result = await callDebugServerAsync('/api/story_to_bullet_premise_async', payload);
        if (result && result.premise) {
            qs('#story-premise').value = result.premise;
            state.storyPremise = result.premise;
            appendLog('✅ 條列式故事粗綱已生成，已填入「故事粗綱」欄位。');
        } else {
            appendLog('❌ AI 未回傳有效粗綱，請查看 LOG 或重試。');
        }
    } catch (e) {
        appendLog('❌ 發生錯誤：' + e.message);
        alert('❌ 呼叫 AI 失敗：' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = origText;
    }
}

/**
 * 非同步 Job 版：發送請求取得 job_id，然後輪詢 /api/job 直到完成。
 * 執行過程中後端的所有 print 訊息都會即時顯示在 log-output。
 * @param {string} asyncEndpoint - 非同步 API 路由，如 '/api/novel_chapters_async'
 * @param {object} payload       - POST 的資料
 * @returns {object|null}        - 完成時 job.result 的內容，失敗時 null
 */
async function callDebugServerAsync(asyncEndpoint, payload) {
    if (!serverOnline) await checkServerStatus();
    if (!serverOnline) throw new Error("Server offline");

    // Step 1: 發送請求，立即取得 job_id
    const startRes = await fetch(`http://localhost:8081${asyncEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!startRes.ok) throw new Error(`HTTP ${startRes.status}`);
    const { job_id } = await startRes.json();
    if (!job_id) throw new Error("未取得 job_id");

    appendLog(`>> Job 已啟動 (id: ${job_id.slice(0, 8)}...)`);

    // Step 2: 輪詢 /api/job — 使用「無活動超時」取代固定次數，支援大型模型長時間生成
    // 後端每 5 秒會追加心跳 LOG，只要持續有新 LOG 就繼續等待
    const INACTIVITY_MS = 300_000; // 300 秒無新 LOG → 超時
    let lastLogs = "";
    let lastActivity = Date.now();

    while (true) {
        await new Promise(r => setTimeout(r, 1000));

        // 無活動超時
        if (Date.now() - lastActivity > INACTIVITY_MS) {
            appendLog("⏰ 等待逾時（300 秒無後端回應）。大模型可能仍在運算，請查看 CMD 視窗。");
            return null;
        }

        let jd;
        try {
            const jr = await fetch(`http://localhost:8081/api/job?id=${encodeURIComponent(job_id)}`);
            jd = await jr.json();
        } catch (e) {
            appendLog("⚠️ 輪詢失敗，重試中...");
            continue;
        }

        // 即時更新 Log 欄位（只追加新增部分，不覆蓋現有內容）
        if (jd.logs && jd.logs !== lastLogs) {
            const newPart = jd.logs.slice(lastLogs.length);
            lastLogs = jd.logs;
            if (newPart) appendLog(newPart);
            lastActivity = Date.now();
        }
        // 同步伺服器端 last_activity
        if (jd.last_activity && jd.last_activity * 1000 > lastActivity) {
            lastActivity = jd.last_activity * 1000;
        }

        if (jd.status === 'done') {
            return jd.result || null;
        }
        if (jd.status === 'error') {
            appendLog("❌ 後端 Job 執行失敗，請查看 CMD 視窗的錯誤訊息。");
            return null;
        }
    }
}

// ====== 比對多本小說 ======

let compareNovelList = [];
let compareLoadedNovels = [null, null, null, null];
let compareSearchMatches = [];
let compareCurrentMatch = -1;
let compareLastPassword = '';

async function openCompareModal() {
    qs('#modal-compare').classList.remove('hidden');
    qs('#compare-search-input').value = '';
    qs('#compare-search-count').textContent = '';
    compareSearchMatches = [];
    compareCurrentMatch = -1;
    await loadCompareNovelList();
}

async function loadCompareNovelList() {
    try {
        const sb = window.SupabaseClient && window.SupabaseClient.getClient();
        if (!sb) { appendLog('⚠️ Supabase 未初始化，無法讀取雲端小說清單'); return; }

        appendLog('☁️ [比對] 正在讀取雲端小說清單...');
        const { data, error } = await sb
            .from('novel_entries')
            .select('id, novel_title, updated_at, password')
            .order('updated_at', { ascending: false })
            .limit(200); //讀取雲端小說清單上限200筆

        if (error) throw error;
        compareNovelList = data || [];

        const optionsHtml = '<option value="">-- 請選擇小說 --</option>' +
            compareNovelList.map(d => {
                const date = new Date(d.updated_at).toLocaleString('zh-TW', { hour12: false });
                return `<option value="${d.id}">${d.novel_title} (${date})</option>`;
            }).join('');

        document.querySelectorAll('.compare-novel-select').forEach(sel => {
            const cur = sel.value;
            sel.innerHTML = optionsHtml;
            if (cur) sel.value = cur;
        });
        appendLog(`✅ [比對] 已載入 ${compareNovelList.length} 筆雲端紀錄`);
    } catch (e) {
        appendLog('❌ [比對] 讀取清單失敗: ' + e.message);
    }
}

async function onCompareNovelSelect(colIdx, novelId) {
    if (!novelId) {
        compareLoadedNovels[colIdx] = null;
        updateCompareColContent(colIdx);
        return;
    }

    const meta = compareNovelList.find(n => n.id === novelId);

    // 先用記住的密碼（或空字串）嘗試載入；若失敗才顯示密碼彈窗
    // 不依賴 meta.password，因為 Supabase RLS 可能遮蔽該欄位
    const ok = await tryLoadCompareNovel(colIdx, novelId, meta, compareLastPassword);
    if (!ok) {
        await showComparePasswordModal(colIdx, novelId, meta);
    }
}

async function tryLoadCompareNovel(colIdx, novelId, meta, pwd) {
    const sb = window.SupabaseClient && window.SupabaseClient.getClient();
    if (!sb) return false;

    try {
        const { data, error } = await sb
            .from('novel_entries')
            .select('edit_data, password, novel_title')
            .eq('id', novelId)
            .single();

        if (error) throw error;
        if (data.password && data.password !== pwd) return false;

        let loadedState = data.edit_data;
        if (typeof loadedState === 'string') loadedState = JSON.parse(loadedState);
        compareLoadedNovels[colIdx] = loadedState;
        updateCompareColContent(colIdx);
        if (pwd) compareLastPassword = pwd;
        appendLog(`✅ [比對欄${colIdx + 1}] 已載入「${data.novel_title}」`);
        return true;
    } catch (e) {
        appendLog('❌ [比對] 載入失敗: ' + e.message);
        return false;
    }
}

function showComparePasswordModal(colIdx, novelId, meta) {
    return new Promise((resolve) => {
        const modal = qs('#modal-compare-password');
        const desc = qs('#compare-pwd-desc');
        const input = qs('#compare-pwd-input');
        const okBtn = qs('#btn-compare-pwd-ok');
        const cancelBtn = qs('#btn-compare-pwd-cancel');

        desc.textContent = meta ? `請輸入「${meta.novel_title}」的讀取密碼：` : '請輸入此小說的讀取密碼：';
        input.value = '';
        modal.classList.remove('hidden');
        setTimeout(() => input.focus(), 50);

        const cleanup = () => {
            modal.classList.add('hidden');
            okBtn.removeEventListener('click', onOk);
            cancelBtn.removeEventListener('click', onCancel);
            input.removeEventListener('keydown', onKeydown);
        };

        const onOk = async () => {
            const pwd = input.value;
            cleanup();
            if (!pwd) {
                document.querySelectorAll('.compare-novel-select')[colIdx].value = '';
                resolve();
                return;
            }
            const ok = await tryLoadCompareNovel(colIdx, novelId, meta, pwd);
            if (!ok) {
                alert('密碼錯誤！');
                document.querySelectorAll('.compare-novel-select')[colIdx].value = '';
            }
            resolve();
        };

        const onCancel = () => {
            cleanup();
            document.querySelectorAll('.compare-novel-select')[colIdx].value = '';
            resolve();
        };

        const onKeydown = (e) => {
            if (e.key === 'Enter') { e.preventDefault(); onOk(); }
            if (e.key === 'Escape') { onCancel(); }
        };

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        input.addEventListener('keydown', onKeydown);
    });
}

function getCompareText(novelState, mode) {
    if (!novelState) return '';
    const chapters = novelState.chapters || [];

    switch (mode) {
        case 'premise':
            return `《故事粗綱》\n\n${novelState.storyPremise || '（無粗綱）'}`;

        case 'chapters':
            return chapters.map((ch, i) =>
                `【第${i + 1}章】${ch.title || '（未命名）'}\n\n${ch.description || '（無章描述）'}`
            ).join('\n\n≡≡≡≡≡≡≡≡≡≡\n\n');

        case 'sections':
            return chapters.map((ch, i) => {
                const secList = ch.sections.map((sec, j) =>
                    `＜第${j + 1}節＞：${sec.title || '（未命名）'}`
                ).join('\n\n──────────\n\n');
                return `【第${i + 1}章】${ch.title || '（未命名）'}\n${secList}`;
            }).join('\n\n≡≡≡≡≡≡≡≡≡≡\n\n');

        case 'all_outlines':
            return chapters.map((ch, i) => {
                const secList = ch.sections.map((sec, j) =>
                    `＜第${j + 1}節＞：${sec.title || '（未命名）'}`
                ).join('\n\n──────────\n\n');
                return `【第${i + 1}章】${ch.title || '（未命名）'}\n${ch.description || ''}\n\n${secList}`;
            }).join('\n\n≡≡≡≡≡≡≡≡≡≡\n\n');

        case 'content':
            return chapters.map((ch, i) => {
                const secContent = ch.sections.map((sec, j) =>
                    `＜第${j + 1}節＞：${sec.title || '（未命名）'}\n\n（內文）：\n${sec.content || '（無內文）'}`
                ).join('\n\n──────────\n\n');
                return `【第${i + 1}章】：${ch.title || ''} \n\n${secContent}`;
            }).join('\n\n≡≡≡≡≡≡≡≡≡≡\n\n');

        case 'all': {
            // 全部 = 粗綱 + 章標題 + 章描述 + 節標題 + 節描述 + 內文
            const premisePart = `《故事粗綱》\n${novelState.storyPremise || '（無粗綱）'}`;
            const chaptersPart = chapters.map((ch, i) => {
                const secs = ch.sections.map((sec, j) =>
                    `＜第${j + 1}節＞：${sec.title || '（未命名）'}\n\n（內文）：\n${sec.content || '（無內文）'}`
                ).join('\n\n──────────\n\n');
                return `【第${i + 1}章】：${ch.title || ''}\n${ch.description || ''}\n\n${secs}`;
            }).join('\n\n≡≡≡≡≡≡≡≡≡≡\n\n');
            return `${premisePart}\n\n********************\n\n${chaptersPart}`;
        }

        default:
            return '';
    }
}

async function deleteCompareNovel(colIdx) {
    const sel = document.querySelectorAll('.compare-novel-select')[colIdx];
    const novelId = sel.value;
    if (!novelId) {
        alert('請先在此欄選取一本雲端小說。');
        return;
    }

    const selectedOpt = sel.options[sel.selectedIndex];
    const novelTitle = selectedOpt ? selectedOpt.textContent : novelId;

    if (!confirm(`確定要從雲端永久刪除以下小說專案嗎？\n\n《${novelTitle}》\n\n此操作無法復原！`)) return;

    try {
        const sb = window.SupabaseClient && window.SupabaseClient.getClient();
        if (!sb) throw new Error('Supabase 未初始化');

        const { error } = await sb
            .from('novel_entries')
            .delete()
            .eq('id', novelId);

        if (error) throw error;

        appendLog(`🗑️ [比對] 已刪除雲端小說：${novelTitle}`);

        // 清空該欄顯示並重新整理下拉選單
        compareLoadedNovels[colIdx] = null;
        updateCompareColContent(colIdx);
        await loadCompareNovelList();
    } catch (e) {
        appendLog('❌ [比對] 刪除失敗: ' + e.message);
        alert('刪除失敗：' + e.message);
    }
}

// 切換該欄的「大模型訊息欄」顯示／隱藏。
// 隱藏時（display:none）該 textarea 不佔高度，剩餘空間自動由 .cmp-content（flex:1）吃掉。
function toggleCompareModelInfo(colIdx) {
    const info = document.querySelectorAll('.compare-model-info')[colIdx];
    if (!info) return;
    info.style.display = (info.style.display === 'none') ? '' : 'none';
}

// 同時隱藏/顯示比對彈窗四欄的「AI 訊息藍框」
// 依照目前按鈕文字狀態切換：若處於「隱藏」狀態則全部顯示，反之則全部隱藏
function toggleAllCompareModelInfo() {
    const btn = document.getElementById('btn-toggle-all-model-info');
    const infos = document.querySelectorAll('.compare-model-info');
    if (!infos.length) return;
    // 以按鈕目前文字判斷下一步動作
    const shouldHide = !btn || btn.textContent.includes('隱藏');
    infos.forEach(el => { el.style.display = shouldHide ? 'none' : ''; });
    if (btn) btn.textContent = shouldHide ? '👁️‍🗨️ 顯示AI訊息' : '👁️‍🗨️ 隱藏AI訊息';
}

function updateCompareColContent(colIdx) {
    const ta = document.querySelectorAll('.compare-content')[colIdx];
    if (!ta) return;
    ta.value = getCompareText(compareLoadedNovels[colIdx], qs('#compare-mode-select').value);
    // 同步更新上方的 currentModel + modelOptions + writerStyle × 3 + writerSample 資訊欄
    const info = document.querySelectorAll('.compare-model-info')[colIdx];
    if (info) {
        const st = compareLoadedNovels[colIdx];
        if (!st) {
            info.value = '';
        } else {
            const jf = (v) => JSON.stringify(v ?? '');
            info.value =
                `"currentModel": ${jf(st.currentModel || st.aiModel)}\n` +
                `"modelOptions": ${jf(st.modelOptions)}\n` +
                `"writerStyle1": ${jf(st.writerStyle1)}\n` +
                `"writerStyle2": ${jf(st.writerStyle2)}\n` +
                `"writerStyle3": ${jf(st.writerStyle3)}\n` +
                `"writerSample": ${jf(st.writerSample)}`;
        }
    }
    compareSearchMatches = [];
    compareCurrentMatch = -1;
    qs('#compare-search-count').textContent = '';
}

function updateAllCompareContent() {
    compareLoadedNovels.forEach((_, i) => {
        const ta = document.querySelectorAll('.compare-content')[i];
        if (ta) ta.value = getCompareText(compareLoadedNovels[i], qs('#compare-mode-select').value);
    });
    compareSearchMatches = [];
    compareCurrentMatch = -1;
    qs('#compare-search-count').textContent = '';
}

function doCompareSearch() {
    const query = qs('#compare-search-input').value;
    const textareas = document.querySelectorAll('.compare-content');
    const countEl = qs('#compare-search-count');
    compareSearchMatches = [];
    compareCurrentMatch = -1;

    if (!query) { countEl.textContent = ''; return; }

    const lq = query.toLowerCase();
    textareas.forEach((ta, colIdx) => {
        const lo = ta.value.toLowerCase();
        let i = 0;
        while ((i = lo.indexOf(lq, i)) !== -1) {
            compareSearchMatches.push({ colIdx, start: i });
            i += lq.length;
        }
    });

    if (compareSearchMatches.length > 0) {
        goToCompareMatch(0);
    } else {
        countEl.textContent = '找不到';
    }
}

function goToCompareMatch(idx) {
    if (!compareSearchMatches.length) return;
    const textareas = document.querySelectorAll('.compare-content');
    const query = qs('#compare-search-input').value;
    compareCurrentMatch = ((idx % compareSearchMatches.length) + compareSearchMatches.length) % compareSearchMatches.length;
    const { colIdx, start } = compareSearchMatches[compareCurrentMatch];
    const end = start + query.length;
    const ta = textareas[colIdx];

    const fullText = ta.value;
    ta.value = fullText.substring(0, start);
    const pixelPos = ta.scrollHeight;
    ta.value = fullText;
    ta.focus();
    ta.setSelectionRange(start, end);
    requestAnimationFrame(() => {
        ta.scrollTop = Math.max(0, pixelPos - ta.clientHeight / 2);
    });
    qs('#compare-search-count').textContent = `${compareCurrentMatch + 1} / ${compareSearchMatches.length}`;
}

// ====== 儲存與讀取 ======

// 取得小說成品 (Markdown 格式)
function getNovelMarkdown() {
    let md = `# ${state.bookTitle}\n\n`;
    md += `## 故事粗綱\n${state.storyPremise}\n\n`;

    state.chapters.forEach(ch => {
        md += `## ${ch.title}\n`;
        md += `> ${ch.description}\n\n`;
        ch.sections.forEach(sec => {
            md += `### ${sec.title}\n\n`;
            md += `${sec.content || "*(未生成內容)*"}\n\n`;
        });
        md += `---\n\n`;
    });
    return md;
}

// 取得格式化時間 (YYYY-MM-DD_HHMMSS)
function getFormattedDateTime() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    return `${y}-${m}-${d}_${hh}${mm}${ss}`;
}

async function saveProject() {
    // 開啟儲存彈窗
    qs('#save-novel-name').value = state.bookTitle || "";
    qs('#save-novel-password').value = "";
    qs('#modal-novel-save').classList.remove('hidden');
}

async function confirmSaveProject() {
    const name = qs('#save-novel-name').value.trim();
    const password = qs('#save-novel-password').value.trim();

    if (!name || !password) {
        alert("請輸入小說名稱與密碼");
        return;
    }

    state.bookTitle = name;
    qs('#book-title').value = name;
    qs('#modal-novel-save').classList.add('hidden');

    // 同步當前選中的 AI 設定到 state
    state.aiModel = qs('#model-select').value;
    state.modelOptions = qs('#model-options-select').value;
    state.writerStyle1 = qs('#writer-style-select-1')?.value || '';
    state.writerStyle2 = qs('#writer-style-select-2')?.value || '';
    state.writerStyle3 = qs('#writer-style-select-3')?.value || '';
    state.writerSample = qs('#writer-sample-select').value;

    // 1. 同步儲存至 Supabase 雲端 (novel_entries 表)
    try {
        const sb = window.SupabaseClient.getClient();
        if (sb) {
            appendLog("☁️ 正在同步小說至雲端...");
            const fullText = getNovelMarkdown();
            const { data, error } = await sb.from('novel_entries').insert({
                novel_title: state.bookTitle,
                edit_data: state,
                novel_full_text: fullText,
                password: password, // 儲存密碼到資料表
                updated_at: new Date()
            });

            if (error) {
                console.error("Cloud save error:", error);
                appendLog("❌ 雲端儲存失敗: " + error.message);
            } else {
                appendLog("✅ 小說已成功儲存至雲端 (novel_entries)");
            }
        }
    } catch (e) {
        console.error("Cloud save exception:", e);
        appendLog("⚠️ 雲端儲存發生異常，僅進行本機下載");
    }

    // 2. 本機 JSON 下載備份 (不包含密碼)
    const localState = JSON.parse(JSON.stringify(state));
    delete localState.password; // 確保本地檔案不含密碼

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(localState));
    const timeStr = getFormattedDateTime();
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", state.bookTitle + "_" + timeStr + ".json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    appendLog("📂 本機 JSON 備份檔已下載 (無密碼)");
}

async function listCloudNovels() {
    const btn = qs('#btn-load-cloud');
    const select = qs('#cloud-novel-select');

    appendLog("☁️ 正在讀取雲端小說清單...");
    try {
        const sb = window.SupabaseClient.getClient();
        if (!sb) throw new Error("Supabase client not initialized");

        const { data, error } = await sb
            .from('novel_entries')
            .select('id, novel_title, updated_at')
            .order('updated_at', { ascending: false })
            .limit(1000);

        if (error) throw error;

        select.innerHTML = '<option value="">-- 請選擇小說 --</option>' +
            data.map(d => {
                const date = new Date(d.updated_at).toLocaleString('zh-TW', { hour12: false });
                return `<option value="${d.id}">${d.novel_title} (${date})</option>`;
            }).join('');

        btn.style.display = 'none';
        select.style.display = 'inline-block';
        appendLog(`✅ 已載入 ${data.length} 筆雲端紀錄`);
    } catch (e) {
        appendLog("❌ 讀取清單失敗: " + e.message);
    }
}

async function loadCloudNovel(e) {
    const id = e.target.value;
    if (!id) return;

    appendLog(`>> [系統] 選擇雲端專案 ID: ${id}，等待使用者確認...`);

    if (!confirm("載入雲端小說將會覆蓋當前編輯器中的內容，確定嗎？")) {
        appendLog(">> [系統] 使用者已取消載入。");
        e.target.value = "";
        return;
    }

    appendLog(">> [系統] 使用者已確認，正在準備驗證彈窗...");

    try {
        const modal = qs('#modal-novel-password');
        if (!modal) {
            appendLog("❌ 找不到密碼驗證彈窗 (#modal-novel-password)");
            return;
        }
        // 開啟密碼驗證彈窗
        state._tempLoadId = id;
        qs('#novel-password-input').value = "";

        modal.classList.remove('hidden');

        appendLog(">> [系統] 驗證彈窗已開啟，請在畫面中央輸入密碼並點擊「確定」。");
    } catch (err) {
        appendLog(`❌ 開啟驗證彈窗失敗: ${err.message}`);
    }
}

async function confirmLoadCloudNovel() {
    appendLog(">> [系統] 偵測到「確定」點擊，開始進行密碼驗證...");
    const id = state._tempLoadId;
    const pwd = qs('#novel-password-input').value.trim();
    if (!id || !pwd) {
        appendLog("⚠️ 密碼或 ID 缺失，請重新輸入。");
        alert("請輸入密碼");
        return;
    }

    appendLog("--------------------------------------------------");
    appendLog("☁️ [雲端讀取] 啟動驗證與載入流程...");
    appendLog(`>> 目標 ID: ${id}`);

    try {
        const sb = window.SupabaseClient.getClient();
        if (!sb) throw new Error("Supabase Client 未初始化，請檢查網路或 API 設定。");

        const { data, error } = await sb
            .from('novel_entries')
            .select('edit_data, password, novel_title')
            .eq('id', id)
            .single();

        if (error) {
            appendLog(`❌ Supabase 查詢失敗: ${JSON.stringify(error)}`);
            throw error;
        }

        if (!data) {
            throw new Error("找不到該 ID 的雲端紀錄。");
        }

        appendLog(">> 查詢成功，正在核對密碼...");
        if (data.password && data.password !== pwd) {
            appendLog("❌ 密碼不正確。");
            alert("密碼錯誤！");
            return;
        }

        if (data && data.edit_data) {
            let loadedState = data.edit_data;
            appendLog(">> 原始資料讀取成功。");

            // 處理某些情況下資料庫返回字串的問題
            if (typeof loadedState === 'string') {
                appendLog(">> 偵測到字串格式，嘗試進行 JSON 解析...");
                try {
                    loadedState = JSON.parse(loadedState);
                    appendLog(">> JSON 解析成功。");
                } catch (pe) {
                    appendLog(`❌ JSON 解析失敗: ${pe.message}`);
                    appendLog(`>> 原始內容: ${loadedState}`);
                    throw new Error("資料格式不正確 (JSON 解析失敗)");
                }
            }

            // 確保必要的欄位存在
            if (!loadedState || typeof loadedState !== 'object') {
                throw new Error("載入的資料內容無效 (非物件)");
            }
            if (!loadedState.chapters || !Array.isArray(loadedState.chapters)) {
                appendLog(`>> 內容欄位: ${Object.keys(loadedState).join(', ')}`);
                throw new Error("載入的資料格式不完整 (缺少 chapters 陣列)");
            }

            appendLog(`>> 小說標題: ${loadedState.bookTitle || '未命名'}`);
            appendLog(`>> 章節數量: ${loadedState.chapters.length}`);

            // 為了確保所有引用此物件的地方都能同步更新，使用屬性覆蓋而非變數重新賦值
            appendLog(">> 正在更新應用程式狀態並重新渲染介面...");

            // 清空舊狀態的所有屬性 (除了暫存 ID 等)
            for (const key in state) {
                if (state.hasOwnProperty(key)) delete state[key];
            }
            // 寫入新狀態
            Object.assign(state, loadedState);
            state.characters = normalizeCharacters(state.characters);

            try {
                renderAll();
                appendLog(`✅ [成功] 已載入「${state.bookTitle || '未命名小說'}」`);
                logAISettingsFromData('☁️ 雲端載入 - AI 設定（雲端原始值）', loadedState);
            } catch (renderErr) {
                appendLog(`❌ 介面渲染失敗: ${renderErr.message}`);
                console.error("Render error:", renderErr);
            }

            // 重置 UI
            qs('#btn-load-cloud').style.display = 'inline-block';
            qs('#cloud-novel-select').style.display = 'none';
            qs('#modal-novel-password').classList.add('hidden');
            state._tempLoadId = null;
        } else {
            throw new Error("雲端資料欄位 (edit_data) 為空。");
        }
    } catch (e) {
        appendLog(`❌ [錯誤] 載入流程中斷: ${e.message}`);
        console.error("Cloud load error detail:", e);
        alert(`載入失敗: ${e.message}`);
    }
    appendLog("--------------------------------------------------");
}

async function loadProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.readAsText(file, 'UTF-8');
        reader.onload = readerEvent => {
            try {
                state = JSON.parse(readerEvent.target.result);
                state.characters = normalizeCharacters(state.characters);
                renderAll();
                alert("✅ 成功讀取本機檔案");
                appendLog(`📂 已載入本機檔案: ${file.name}`);
                logAISettingsFromData('📂 本機載入 - AI 設定（檔案原始值）', state);
            } catch (err) {
                alert("❌ 檔案格式錯誤");
            }
        }
    };
    input.click();
}




// ============================================================================
// 🎯 評論小說（Review Novel）功能
// ============================================================================
// 預設「使用者要求」提示詞：以最嚴格的專業編輯身分要求 AI
const REVIEW_PROMPT_A = `你是一位有 30 年資歷、鐵面無私的資深出版社主編兼書評人，經手過數百部暢銷與退稿作品，見過所有新人常犯的毛病。
請以你「最嚴格、絲毫不留情面、直言不諱」的高標準，審讀下方這份小說稿件，並寫下你的評審意見。

【審讀立場】
- 假設你正在替出版社決定「是否簽下這本書」，錯過爛稿的成本很高，你必須挑毛病。
- 假設讀者付了錢、時間有限、耐心稀薄，凡是拖沓、假掰、老套、邏輯崩塌之處都要立刻點名。
- 不要客套、不要鼓勵性廢話、不要「整體來說還不錯」這種話。有問題就直接說出來。

【評審面向(每項都要有具體引文或段落定位)】
1. 故事結構與節奏:起承轉合是否成立?哪幾章拖戲?哪幾章崩掉?
2. 每個段落的懸念是否有鉤子效果?
3. 前面伏筆與結局的聯繫是否合理順暢？
4. 人物塑造:主角動機是否可信?角色行為是否前後矛盾?配角有沒有存在的必要?
5. 對白:像不像真人在說話?有沒有作者跳出來替角色說教?
6. 情感真實度:戀愛/衝突/情慾/背叛的張力夠不夠?哪裡讓人尷尬出戲?
7. 語言與文字:贅字、陳腔濫調、比喻是否老套?段落節奏是否單調?
8. 邏輯與世界觀:因果是否成立?有無 bug、時間線錯亂、常識錯誤?
9. 市場與讀者觀感:這本書若上市,讀者最可能在哪一章棄書?書評星等大概幾顆星?

【輸出格式】
- 開頭給出「一句話總評」(不超過 30 字,語氣可以毒辣)。
- 接著給出「總體評分」:故事 / 人物 / 文筆 / 節奏 / 市場潛力,各項 1–10 分並附一句理由。
- 然後條列具體問題,每條格式為:【問題類型】章節或段落定位 — 問題描述 — 修改建議。
- 最後給出「若要出版必須先修好的三大致命傷」與「值得保留的五個亮點(若真的有)」。
- 全部使用繁體中文。禁止使用中文簡體字。禁止安慰性語言。`;

const REVIEW_PROMPT_B = `你是一位有 20 年資歷的資深出版社編輯,經手過數十部暢銷書與退稿作品。
你以「標準嚴格但願意陪作者把稿子養大」聞名——不放水、不客套,但每個缺點都會附上以你的專業經驗為基礎的、實質可行的修改建議。
即使作品仍未完成或章節缺漏,你也能針對現有內容與缺漏之處,提出具體的補寫方向;除了指出缺點,你更會清楚點出作品的優點與獨特之處,讓作者知道哪些是應該保留並繼續發揮的資產。

【審讀立場】
- 假設你已經決定「陪這位作者把這本書修到能簽」,但前提是作者必須知道自己錯在哪裡、又對在哪裡。
- 針對缺漏或未完成處,不以「等寫完再說」推託,而是以現有素材推測意圖並提出可行的補寫路徑。
- 專業誠實優先於情緒安撫,但絕不做無意義的貶低。

【評審面向(每項都要有具體引文或段落定位,並附「修改建議」)】
1. 故事結構與節奏:哪些段落成立?哪些拖戲、哪些崩盤?若要修,先從哪一章下手?
2. 每個段落的懸念是否有鉤子效果?該如何加強？
3. 前面伏筆與結局的聯繫是否合理順暢？該如何補強？
2. 人物塑造:主角動機是否清楚?配角是否可有可無?哪個角色其實有潛力被放大?
3. 對白:語氣、資訊密度、是否符合人物立場?哪一段對白最好,可作為全書語感基準?
4. 情感真實度:戀愛/衝突/情慾/背叛的層次與轉折是否鋪陳到位?
5. 語言與文字:贅字、陳腔濫調、節奏單調處在哪?哪些文字是作者的個人特色,值得保留?
6. 邏輯與世界觀:因果、時間線、設定是否自洽?缺漏之處建議如何補足?
7. 市場定位:作品現在的樣子最接近哪一個既有市場區隔?讀者輪廓是誰?

【輸出格式】
- 開頭給出「一句話總評」(30 字內,誠實但不刻薄)。
- 接著「總體評分」:故事 / 人物 / 文筆 / 節奏 / 市場潛力,各項 1–10 分並附一句理由。
- 【必須保留的亮點】列出 5 個具體優點及其可繼續發揮的方向。
- 【必須修補的問題】每條格式為:【問題類型】章節或段落定位 — 問題描述 — 具體可行的修改建議 (至少一條落地作法)。
- 【缺漏處補寫建議】針對明顯未完成/未展開之處,提出可以順延既有素材的補寫路徑。
- 【下一步優先順序】列出作者應該最先動手修改的三件事。
- 全部使用繁體中文。禁止使用中文簡體字。`;

const REVIEW_PROMPT_C = `你是一位資深的中文系老師,長年批改學生的小說創作作業。
你相信「每一份作業裡都藏著沙子中的金塊」——即使作品尚未完整,你也能從稚拙的段落中辨識出獨到的想像力、觀察力或語感,並清楚點出這些難得的優異點。
針對缺點,你會以老師的角度,對每個問題提出多個可行的補強路徑,協助學生自行判斷選用;對於作品的優點與獨特之處,你能提出讓這些亮點延續、串接、進一步發揮的具體方向。

【審讀立場】
- 把稿件當成一份「有潛力但仍待琢磨」的作業,以教育者而非市場評審的立場出發。
- 缺點必說,但要說得清楚、可操作;並且盡量給「不只一條」的補強路徑,讓作者能依自身取向選擇。
- 特別留意那些「作者自己可能沒發現、但很珍貴」的細節、意象、句法或人物瞬間。

【評審面向(每項都要有具體引文或段落定位)】
1. 敘事結構:章節之間的敘事推進是否成立?哪裡是結構性的斷裂?
2. 每章的懸念在哪裡?會吸引人想往下讀嗎?
3. 每個伏筆是否有合理的發展？哪些伏筆值得保留？哪些是埋得太深或多餘的？
4. 人物與內心:角色的心理層次是否被寫出來?哪個瞬間最能看出作者的觀察力?
5. 語言與意象:找出「藏在沙裡的金塊」——特別出色的句子、意象或譬喻,並說明其可貴之處。
6. 對白與聲口:每個人物的說話方式是否具識別度?
7. 邏輯與細節:因果、時序、常識層面的疏漏。
8. 主題與思想:作品想說什麼?這個主題有沒有被寫透?

【輸出格式】
- 開頭給出「一句話總評」(30 字內,語氣如批改作業般溫和但誠實)。
- 【本作亮點】列出至少 5 個具體的優點,附引文並說明「這裡難得在哪」。
- 【延續與串接建議】針對上述亮點,提出如何讓它們貫穿全書、彼此呼應的具體方向。
- 【需要補強的地方】每條格式為:【問題類型】章節或段落定位 — 問題描述 — 【補強路徑一】... 【補強路徑二】... (每個問題至少兩條可行路徑,讓作者選擇)。
- 【給作者的一段話】以老師身分,寫一段鼓勵且務實的整體回饋(150 字內)。
- 全部使用繁體中文。禁止使用中文簡體字。`;

const REVIEW_PROMPT_D = `你是一位極富耐心與洞察力的「愛心家教」型創作導師。
你深信:每一份作品——不論篇幅長短、完整與否、風格為何——都必然有其獨到之處,而你的職責是「找到它、命名它、讓它發光」。
你能接受各式各樣的可能性,不預設「什麼才叫好小說」的框架;每一種創意、每一種風格、每一種偏執,對你來說都是極其珍貴的、值得深入挖掘的材料。

【審讀立場】
- 你的第一任務是「深度分析並辨識出這份作品的特點」——哪怕特點只有一個,也要說清楚它為何獨特。
- 分析特點的可行性:這個特點若繼續往下寫,能夠支撐一部什麼樣的作品?可能的未來發展方向有哪些?
- 提出讓「作品既有的優點彼此串聯」的建議,讓每一份作品最難得的創意與風格能被凸顯、被放大。
- 完全不需要挑毛病式的批評;必要提到弱點時,只以「若要讓這個特點更立體,或許可以...」的建設性語氣。

【分析面向(每項都要有具體引文或段落定位)】
1. 這份作品最獨特的一個(或幾個)特點是什麼?為什麼它獨特?
2. 這個特點的可行性:它在什麼樣的敘事類型/題材/受眾中最能發揮?
3. 未來發展方向:延續這個特點,故事可以往哪些方向走?各自的可能性為何?
4. 優點串聯:作品內部的哪些元素(人物、意象、節奏、主題)其實可以彼此呼應?如何串起來?
5. 讓創意與風格被凸顯:作者應該如何在後續章節中「更大膽地」使用自己的特色?

【輸出格式】
- 開頭給出「一句話總評」(30 字內,溫暖且具體地指出作品的獨到之處)。
- 【本作最珍貴的特點】具體命名 5 個特點,並以引文說明其獨特性。
- 【特點的可行性分析】針對每個特點,說明它適合的敘事類型與受眾。
- 【未來發展方向】針對每個特點,提出 5 條可行的延伸方向。
- 【優點串聯建議】具體指出哪些元素應該被互相串接,以及串接後可能產生的化學反應。
- 【給作者的鼓勵】以家教身分寫一段溫暖而誠實的話(150 字內),讓作者相信自己的獨特值得被繼續發揮。
- 全部使用繁體中文。禁止使用中文簡體字。禁止任何形式的貶低或酸言酸語。`;

const REVIEW_PROMPT_E = `（在此撰寫你希望 AI 採取的立場，以下範例是以讀者身分審視）
【審讀立場】
- 你是第一位看到這份原稿的讀者，請以讀者身分提出喜好與厭惡的建議。
- 完全以讀者身分提出評論，只有好惡，無須理由。

【評審面向】
1. 這份作品在同類型作品之中的獨特性與差異性。
2. 主題與敘事方式是否和諧搭配？
3. 以「起承轉合」的結構分配是否恰當？
4. 以「人事時地物」的關聯性來看，是否緊密相關且合理？

【輸出格式】
- 喜歡哪幾位角色？喜歡的原因？
- 討厭哪幾位角色？厭惡的原因？
- 這個題材吸引你嗎？哪幾點最吸引你？
- 閱讀的過程你最在意 / 擔心哪幾位角色？
- 哪幾段文字讓你產生情緒起伏？甚麼樣的情緒？
- 哪幾段情節讓你覺得拖沓，想要快轉。
- 你看到哪幾段會想要放棄不看了？
- 你覺得哪幾段劇情很不合理？
- 你覺得結局安排如何？
- 你從哪幾段看出了劇情的伏筆？從哪裡看出來的？
`;

const REVIEW_PROMPT_F = `你是一位「只說優點的誠實讀者」——你剛讀完這份稿件，心裡真心喜歡它。
你的評論規則很單純：只講你「真的喜歡、真的被打動」的地方，完全不提缺點、不給修改建議、不潑冷水。
但你並不是敷衍地說好話——你的每一句稱讚都必須誠實、具體、有引文或段落定位佐證，讓作者清楚知道「原來這裡是有效的」。

【審讀立場】
- 你是一位真心投入的讀者，只想告訴作者：這本書哪裡讓你捨不得放下。
- 完全不提缺點、不比較市場、不談「如果能更好」。凡是負面的話一律不說。
- 稱讚必須真實可信：找出文本中確實成立的亮點，而不是空泛的「寫得很好」。

【只找亮點的面向（每項都要有具體引文或段落定位）】
1. 哪些角色讓你喜歡、甚至想繼續看他們的故事？為什麼？
2. 哪幾段文字、對白或意象讓你眼睛一亮、忍不住重讀？
3. 哪些情節安排讓你緊張、感動、會心一笑或想哭？
4. 這個題材／主題最吸引你的幾點是什麼？
5. 哪些隱喻或是伏筆讓你讚嘆？從哪裡看出來的？
6. 作者有哪些「別人不一定寫得出來」的獨特之處？
7. 你覺得這是一本甚麼類型的小說？有哪些內容符合此類小說的高標準？
8. 你會推薦給哪些類型的朋友？

【輸出格式】
- 開頭給出「一句話真心話」（100 字內，說出你最喜歡這本書的哪一點）。
- 【我最喜歡的角色】列出 1–3 位，附引文說明喜歡的原因。
- 【打動我的段落】列出至少 5 處具體文字／情節，說明它為何有效。
- 【令人有感的劇情安排】列出至少 5 處劇情安排，說明它讓你產生何種情緒？為何？。
- 【吸引我的題材】主題最吸引你的幾點是什麼？
- 【這本書的獨到之處】具體點出作品值得驕傲且獨特的特色。
- 【給作者的一句話】以讀者身分寫一句溫暖而誠實的鼓勵。
- 【本書類型】有哪些內容符合此類小說的高標準？
- 【好友推薦】這本書適合推薦給哪些讀者？
- 全部使用繁體中文。禁止使用中文簡體字。禁止提及任何缺點或修改建議。`;

const REVIEW_PROMPT_G = `你是一位「只說缺點的毒舌讀者」——你時間寶貴、毒舌愛批評、沒耐心，讀到不順的地方就想直接棄書。
你的評論規則很單純：只講讓你「不耐煩、想快轉、想翻白眼、看不下去」的地方，完全不誇獎、不客套、不給正面回饋。
但你並不是無理取鬧——你的每一句抱怨都必須誠實、具體、有引文或段落定位佐證，讓作者清楚知道「讀者是在哪裡失去耐心的」。

【審讀立場】
- 你是一位付了錢、時間有限的普通讀者，只想告訴作者：這本書哪裡讓你讀不下去。
- 完全不誇獎、不鼓勵、不說「但整體還行」。凡是正面的話一律不說。
- 抱怨必須真實可信：指出文本中確實存在的問題，而不是為罵而罵。

【只挑缺點的面向（每項都要有具體引文或段落定位）】
1. 哪幾段劇情發展不合理到令你無法忍受？
2. 哪幾段最讓你想直接快轉或跳過？為什麼拖沓？
3. 哪些角色讓你厭煩、無感或覺得可有可無？
4. 哪些對白假掰、說教、不像真人在講話？
5. 哪些情節讓你出戲、覺得不合理或老套？
6. 你會在第幾章、哪一個瞬間真的想關掉書棄讀？

【輸出格式】
- 開頭給出「一句話真心話」（100 字內，語氣可以毒辣，說出你最受不了的幾點）。
- 【無法忍受的劇情】列出至少 5 處具體文字／情節，說明你為何無法忍受。
- 【最想快轉的段落】列出至少 5 處具體文字／情節，說明你為何不耐煩。
- 【讓我厭煩的角色】列出讓你無感或反感的幾位角色，附引文與原因。
- 【讓我出戲的對白】列出幾句對白假掰、說教、不像真人在講話？
- 【讓我覺得不合理的情節】列出幾個情節讓你出戲、覺得不合理或老套？
- 【想棄書的那一刻】明確指出你最可能在哪一章、哪一段放棄。
- 全部使用繁體中文。禁止使用中文簡體字。禁止任何稱讚或正面回饋。`;

const REVIEW_PROMPTS = {
    A: REVIEW_PROMPT_A,
    B: REVIEW_PROMPT_B,
    C: REVIEW_PROMPT_C,
    D: REVIEW_PROMPT_D,
    E: REVIEW_PROMPT_E,
    F: REVIEW_PROMPT_F,
    G: REVIEW_PROMPT_G
};
const REVIEW_ROLE_LABELS = {
    A: 'A. 出版社老闆（極度嚴厲，預設）',
    B: 'B. 出版社編輯（嚴格但提供實質建議）',
    C: 'C. 中文系老師（挖掘優點並補強缺點）',
    D: 'D. 愛心家教（發掘特點與可行方向）',
    E: 'E. 空白架構（自行填寫，先以讀者身分為範例）',
    F: 'F. 只說優點的誠實讀者',
    G: 'G. 只說缺點的毒舌讀者'
};
const REVIEW_DEFAULT_USER_REQUEST = REVIEW_PROMPT_A;

let reviewMatches = [];
let reviewCurrentMatch = -1;
let reviewSearchLastCol = 0; // 0=user request, 1=ai feedback

// 目前「使用者要求」欄位對應的立場（A~E；F 不對應單一欄位內容）
let currentReviewRole = 'A';

/**
 * 取得某立場目前應顯示的內容：
 * 優先使用「使用者已改寫並保存」的版本，沒有才回退到預設提示詞。
 * A~E 皆保存在 state.reviewPrompts（會隨專案儲存至雲端）。
 */
function getReviewPrompt(role) {
    if (state.reviewPrompts && typeof state.reviewPrompts[role] === 'string') {
        return state.reviewPrompts[role];
    }
    return REVIEW_PROMPTS[role] || REVIEW_DEFAULT_USER_REQUEST;
}

/**
 * 把「使用者要求」欄位目前的內容，保存到對應立場的儲存位置。
 * F 沒有單一對應內容，直接略過。
 */
function saveCurrentReviewPrompt(role) {
    if (!role || role === 'H') return;
    const userReqEl = qs('#review-user-request');
    if (!userReqEl) return;
    if (!state.reviewPrompts) state.reviewPrompts = {};
    state.reviewPrompts[role] = userReqEl.value;
}

function openReviewModal() {
    // 預設文件名稱為目前小說名稱
    const bookTitle = (state.bookTitle || '').trim() || '未命名小說';
    const docNameEl = qs('#review-doc-name');
    if (!docNameEl.value) docNameEl.value = bookTitle;

    const roleSel = qs('#review-role-select');
    const userReqEl = qs('#review-user-request');
    let role = state.reviewRole || 'A';
    if (role === 'H') {
        // H 模式：下拉維持 H，但欄位載入目前記憶中的立場（預設 A）內容供參考
        if (roleSel) roleSel.value = 'H';
        currentReviewRole = 'A';
        if (userReqEl) userReqEl.value = getReviewPrompt('A');
    } else {
        if (roleSel) roleSel.value = role;
        currentReviewRole = role;
        if (userReqEl) userReqEl.value = getReviewPrompt(role);
    }

    qs('#modal-review').classList.remove('hidden');
}

function onReviewRoleChange() {
    const roleSel = qs('#review-role-select');
    const userReqEl = qs('#review-user-request');
    if (!roleSel || !userReqEl) return;
    const role = roleSel.value || 'A';

    // 切換前，先把目前欄位內容保存回「切換前」的立場，避免修改遺失
    saveCurrentReviewPrompt(currentReviewRole);

    // H 為「依序執行所有選項」，不覆寫使用者要求欄位
    if (role === 'H') {
        state.reviewRole = 'H';
        return;
    }

    // 載入新立場「已保存或預設」的內容（不再覆寫掉使用者的修改）
    userReqEl.value = getReviewPrompt(role);
    currentReviewRole = role;
    state.reviewRole = role;
}

/**
 * 「重置評論提示詞」：把目前選項的內容還原為程式預設值。
 * 若目前選 H，則詢問是否一次重置 A~G 全部立場。
 */
function resetReviewPrompt() {
    const roleSel = qs('#review-role-select');
    const userReqEl = qs('#review-user-request');
    if (!roleSel || !userReqEl) return;
    const role = roleSel.value || 'A';

    if (role === 'H') {
        if (!confirm('目前為 H 模式，確定將 A~G 全部立場的評論提示詞都重置為程式預設值？')) return;
        if (!state.reviewPrompts) state.reviewPrompts = {};
        ['A', 'B', 'C', 'D', 'E', 'F', 'G'].forEach(r => { state.reviewPrompts[r] = REVIEW_PROMPTS[r]; });
        appendLog('♻️ 已將 A~G 全部立場的評論提示詞重置為預設值。');
        return;
    }

    const label = REVIEW_ROLE_LABELS[role] || role;
    if (!confirm(`確定將【${label}】的評論提示詞重置為程式預設值？目前的修改將被覆蓋。`)) return;
    userReqEl.value = REVIEW_PROMPTS[role] || '';
    saveCurrentReviewPrompt(role);
    appendLog(`♻️ 已將【${label}】的評論提示詞重置為預設值。`);
}

// 使用者在「使用者要求」欄位輸入時，即時保存到目前立場，確保不遺失
function onReviewRequestInput() {
    saveCurrentReviewPrompt(currentReviewRole);
}

/**
 * 把目前編輯中的小說（粗綱 + 章 + 節 + 內文）串成一段長文字，送給 AI 評審
 */
function assembleCurrentNovelText() {
    let text = `《${(state.bookTitle || '未命名小說').trim()}》\n\n`;
    text += `【故事粗綱】\n${(state.storyPremise || '').trim() || '（未撰寫）'}\n\n`;
    (state.chapters || []).forEach((ch, ci) => {
        text += `\n===== 第${ci + 1}章：${ch.title || ''} =====\n`;
        text += `【章描述】${ch.description || ''}\n`;
        (ch.sections || []).forEach((sec, si) => {
            text += `\n--- 第${ci + 1}章 第${si + 1}節：${sec.title || ''} ---\n`;
            text += `${sec.content || '（未生成內容）'}\n`;
        });
    });
    return text;
}

async function reviewCurrentNovel() {
    const bookTitle = (state.bookTitle || '').trim() || '未命名小說';
    qs('#review-doc-name').value = bookTitle;
    const fullText = assembleCurrentNovelText();
    await runReviewJob(fullText, bookTitle);
}

async function reviewExternalFile(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;

    // 篩選出合法的 .txt / .md 檔案，其餘的記錄到 LOG 並略過
    const validFiles = [];
    for (const file of files) {
        if (!file.name.match(/\.(txt|md)$/i)) {
            appendLog(`⚠️ 已略過「${file.name}」：僅支援 .txt 或 .md 文字檔案。`);
            continue;
        }
        validFiles.push(file);
    }
    if (!validFiles.length) {
        alert('❌ 僅支援 .txt 或 .md 文字檔案。');
        return;
    }

    appendLog(`📂 已選取 ${validFiles.length} 個檔案，將依序評審，每個檔案完成後會自動匯出 .md。`);

    // 依序處理每個檔案：讀取 → 評審（含 H 模式的最終評審意見）→ 自動匯出 .md
    for (const file of validFiles) {
        let textContent = '';
        try {
            textContent = await file.text();
        } catch (e) {
            appendLog(`❌ 無法讀取「${file.name}」：${e.message}`);
            continue;
        }
        if (!textContent || textContent.trim().length < 50) {
            appendLog(`⚠️ 已略過「${file.name}」：內容太短（少於 50 字）。`);
            continue;
        }
        // 覆寫文件名稱為外部檔名（去掉副檔名）
        const baseName = file.name.replace(/\.(txt|md)$/i, '');
        qs('#review-doc-name').value = baseName;
        await runReviewJob(textContent, baseName, { autoExport: true });
    }
    appendLog('✅ 所有已選取的外部文檔評審完畢。');
}

function appendReviewFeedback(text) {
    const el = qs('#review-ai-feedback');
    if (!el) return;
    if (el.value && !el.value.endsWith('\n')) el.value += '\n';
    el.value += text;
    el.scrollTop = el.scrollHeight;
}

/**
 * 執行一次評審任務。
 * @param {string} fullText 待審稿件全文
 * @param {string} docName  文件名稱
 * @param {{autoExport?: boolean}} [opts] autoExport: 單一立場（非 H）時，評審完成後是否自動匯出 .md
 *   ⚠️ H 模式（依序執行以上所有選項評論）一律會在跑完 A~G 並整理「最終評審意見」後，
 *      自動匯出「單一份」合併 .md（不需輸出成多份 .md 檔案），不受 autoExport 影響。
 */
async function runReviewJob(fullText, docName, opts = {}) {
    const autoExport = !!opts.autoExport;
    const roleSel = qs('#review-role-select');
    const role = (roleSel && roleSel.value) || 'A';
    // 下拉選單目前顯示的完整文字（例如「A. 出版社老闆（極度嚴厲，預設）」），用於匯出檔名
    const roleOptionLabel = (roleSel && roleSel.selectedOptions && roleSel.selectedOptions[0])
        ? roleSel.selectedOptions[0].textContent.trim()
        : (REVIEW_ROLE_LABELS[role] || role);

    // 先把欄位目前內容保存回目前立場，確保用到的是最新修改
    saveCurrentReviewPrompt(currentReviewRole);

    // 若選 H,依序執行 A~G（使用各立場「已保存或預設」的內容）
    if (role === 'H') {
        appendLog(`🎯 H 模式:依序執行 A~G 七種評論立場。`);
        const seq = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
        const collected = []; // { label, text }：蒐集每個立場的評審全文，供最終整合使用
        for (const r of seq) {
            const prompt = getReviewPrompt(r) || '';
            const label = REVIEW_ROLE_LABELS[r] || r;
            if (!prompt.trim()) {
                appendLog(`⚠️ 略過 ${label}(提示詞為空)。`);
                continue;
            }
            const text = await runSingleReview(fullText, docName, prompt, label);
            collected.push({ label, text });
        }

        // 加碼：將 A~G 全部評審意見再交給 AI 整理成「最終評審意見」
        appendLog('🎯 開始整理「最終評審意見」...');
        const finalText = await runFinalSynthesis(docName, collected);
        appendLog('✅ H 模式所有立場評論與最終評審意見皆已完成。');

        // H 模式一律自動匯出「單一份」合併 .md（A~G + 最終評審意見）
        const sections = collected.map(c => `## 【${c.label}】\n\n${c.text}\n`).join('\n---\n\n');
        const md = `# 🎯 小說評審報告：${docName}\n\n${sections}\n\n---\n\n## 【最終評審意見】\n\n${finalText}\n`;
        const filename = `${sanitizeFilename(docName)}_${sanitizeFilename(roleOptionLabel)}.md`;
        downloadMarkdown(filename, md);
        appendLog(`📤 已自動匯出合併評審報告：${filename}`);
        return;
    }

    // 單一立場
    const userRequest = qs('#review-user-request').value.trim() || getReviewPrompt(role);
    const label = REVIEW_ROLE_LABELS[role] || `自訂立場 (${role})`;
    const text = await runSingleReview(fullText, docName, userRequest, label);

    if (autoExport) {
        const md = `# 🎯 小說評審報告：${docName}\n\n## ✏️ AI評審的提示詞\n\n${userRequest}\n\n---\n\n## 【${label}】\n\n${text}\n`;
        const filename = `${sanitizeFilename(docName)}_${sanitizeFilename(roleOptionLabel)}.md`;
        downloadMarkdown(filename, md);
        appendLog(`📤 已自動匯出評審報告：${filename}`);
    }
}

async function runSingleReview(fullText, docName, userRequest, roleLabel) {
    // 若原文過長,截斷並在 LOG 標註
    const MAX_LEN = 100000;
    let sendText = fullText;
    if (fullText.length > MAX_LEN) {
        sendText = fullText.slice(0, MAX_LEN);
        appendLog(`⚠️ 原文長度 ${fullText.length} 字,超過 ${MAX_LEN} 字,已截斷。`);
    }

    appendLog(`🎯 開始評審「${docName}」【${roleLabel}】,共 ${sendText.length} 字。`);
    const timestamp = new Date().toLocaleString('zh-TW', { hour12: false });
    const header = `\n\n===== 【${roleLabel}】 ${timestamp} =====\n`;
    appendReviewFeedback(header + '⏳ AI 評審中,請稍候...(過程 LOG 顯示在主 LOG 欄)');

    // 記住這次待覆寫的佔位符位置
    const el = qs('#review-ai-feedback');
    const placeholderStart = el.value.lastIndexOf('⏳ AI 評審中');

    try {
        const payload = {
            text_content: sendText,
            user_request: userRequest,
            doc_name: docName,
            model: state.currentModel || 'gemma4',
            model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null
        };
        const result = await callDebugServerAsync('/api/review_novel_async', payload);
        // 移除佔位符,寫入實際結果
        if (placeholderStart >= 0) el.value = el.value.slice(0, placeholderStart);
        let text;
        if (result && result.review) {
            text = result.review;
            el.value += text;
            appendLog(`✅ 【${roleLabel}】評審結果已附加。`);
        } else {
            text = '❌ AI 未回傳有效評審內容,請查看 LOG 或重試。';
            el.value += text;
            appendLog(`❌ 【${roleLabel}】AI 未回傳有效評審內容。`);
        }
        el.scrollTop = el.scrollHeight;
        return text;
    } catch (e) {
        if (placeholderStart >= 0) el.value = el.value.slice(0, placeholderStart);
        const text = '❌ 發生錯誤:' + e.message;
        el.value += text;
        appendLog(`❌ 【${roleLabel}】評審發生錯誤:` + e.message);
        return text;
    }
}

/**
 * H 模式加碼功能：把 A~G 七種立場的評審全文合併，再請 AI 整理成一份「最終評審意見」。
 * 規則：依重要性(被越多評審提到)排序，每條意見分別列出正面評論／反面評論／修改建議，
 *       類似看法的意見會合併並標注是哪幾位評審提出。
 */
async function runFinalSynthesis(docName, collected) {
    const combinedReviews = collected.map(c => `===== 【${c.label}】 =====\n${c.text}`).join('\n\n');
    const synthesisInstructions = `你是一位經驗豐富的出版總監，收到了以下 ${collected.length} 位不同立場的評審針對同一份稿件所寫的評論意見（A~G，各自代表完全不同的審讀角度）。

請將這些評論意見整合成一份「最終評審意見」，規則如下：
1. 以條列式列出整合後的意見，並依照「重要性」排序——越多位評審提到、或越多評審強調的意見，排序越前面。
2. 每一條意見都需要分別列出：
   【正面評論】(可能有多個，若這條意見完全沒有正面觀點可省略)
   【反面評論】(可能有多個，若這條意見完全沒有反面觀點可省略)
   【修改建議】(可能有多個，若無具體建議可省略)
3. 若多位評審對同一件事表達出相似的看法，請合併為同一條意見，並在該條意見後方標注是哪幾位評審(以評審的字母/立場標示，例如 A、C、F)提出了這個看法。
4. 全部使用繁體中文，禁止使用中文簡體字。

以下為 ${collected.length} 位評審的評論全文：

${combinedReviews}

請開始撰寫「最終評審意見」：`;

    const timestamp = new Date().toLocaleString('zh-TW', { hour12: false });
    const header = `\n\n===== 【最終評審意見】 ${timestamp} =====\n`;
    appendReviewFeedback(header + '⏳ AI 整理中,請稍候...(過程 LOG 顯示在主 LOG 欄)');
    const el = qs('#review-ai-feedback');
    const placeholderStart = el.value.lastIndexOf('⏳ AI 整理中');

    try {
        const payload = {
            text_content: combinedReviews,
            user_request: synthesisInstructions,
            doc_name: docName,
            model: state.currentModel || 'gemma4',
            model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null
        };
        const result = await callDebugServerAsync('/api/review_novel_async', payload);
        if (placeholderStart >= 0) el.value = el.value.slice(0, placeholderStart);
        let text;
        if (result && result.review) {
            text = result.review;
            el.value += text;
            appendLog('✅ 【最終評審意見】已附加。');
        } else {
            text = '❌ AI 未回傳有效整理內容,請查看 LOG 或重試。';
            el.value += text;
            appendLog('❌ 【最終評審意見】AI 未回傳有效內容。');
        }
        el.scrollTop = el.scrollHeight;
        return text;
    } catch (e) {
        if (placeholderStart >= 0) el.value = el.value.slice(0, placeholderStart);
        const text = '❌ 發生錯誤:' + e.message;
        el.value += text;
        appendLog('❌ 【最終評審意見】整理發生錯誤:' + e.message);
        return text;
    }
}

// 將字串中 Windows 檔名不允許的字元替換為底線，避免自動匯出失敗
function sanitizeFilename(name) {
    return (name || '').replace(/[\\/:*?"<>|]/g, '_').trim();
}

// 建立 .md 檔案並觸發瀏覽器下載
function downloadMarkdown(filename, content) {
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function exportReviewResult() {
    const docName = (qs('#review-doc-name').value || '未命名').trim();
    const userReq = qs('#review-user-request').value || '';
    const aiFb = qs('#review-ai-feedback').value || '';
    const md = `# 🎯 小說評審報告：${docName}\n\n` +
        `## ✏️ AI評審的提示詞\n\n${userReq}\n\n` +
        `---\n\n## 🖋️ AI 編輯的評審建議\n\n${aiFb}\n`;
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docName}_評審報告.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    appendLog('📤 已匯出評審報告 Markdown。');
}

// 評論小說彈窗搜尋：跨兩欄 textarea 搜尋
function doReviewSearch() {
    const query = qs('#review-search-input').value;
    const countEl = qs('#review-search-count');
    reviewMatches = [];
    reviewCurrentMatch = -1;
    if (!query) { countEl.textContent = ''; return; }
    const textareas = [qs('#review-user-request'), qs('#review-ai-feedback')];
    const lq = query.toLowerCase();
    textareas.forEach((ta, colIdx) => {
        const lo = ta.value.toLowerCase();
        let i = 0;
        while ((i = lo.indexOf(lq, i)) !== -1) {
            reviewMatches.push({ colIdx, start: i });
            i += lq.length;
        }
    });
    if (reviewMatches.length) goToReviewMatch(0);
    else countEl.textContent = '找不到';
}

function goToReviewMatch(idx) {
    if (!reviewMatches.length) return;
    const query = qs('#review-search-input').value;
    reviewCurrentMatch = ((idx % reviewMatches.length) + reviewMatches.length) % reviewMatches.length;
    const m = reviewMatches[reviewCurrentMatch];
    const ta = m.colIdx === 0 ? qs('#review-user-request') : qs('#review-ai-feedback');
    const start = m.start, end = start + query.length;
    const fullText = ta.value;
    ta.value = fullText.substring(0, start);
    const pixelPos = ta.scrollHeight;
    ta.value = fullText;
    ta.focus();
    ta.setSelectionRange(start, end);
    requestAnimationFrame(() => {
        ta.scrollTop = Math.max(0, pixelPos - ta.clientHeight / 2);
    });
    qs('#review-search-count').textContent = `${reviewCurrentMatch + 1} / ${reviewMatches.length}`;
}

// 評論小說彈窗：切換上/下欄的 textarea 顯示與否
// colId = 'review-col-request' 或 'review-col-feedback'
// 隱藏時只藏 textarea（保留標題列），並暫停 flex 使該欄縮到最小
function toggleReviewSection(colId, btnId) {
    const col = document.getElementById(colId);
    const btn = document.getElementById(btnId);
    if (!col || !btn) return;
    const ta = col.querySelector('textarea');
    if (!ta) return;
    const nowHidden = ta.style.display === 'none';
    if (nowHidden) {
        // 恢復顯示
        ta.style.display = '';
        col.style.flex = col.dataset.prevFlex || '1 1 0';
        btn.textContent = '👁️‍🗨️ 隱藏';
    } else {
        // 隱藏 textarea：欄位縮到只剩標題列
        col.dataset.prevFlex = col.style.flex || '1 1 0';
        ta.style.display = 'none';
        col.style.flex = '0 0 auto';
        btn.textContent = '👁️‍🗨️ 顯示';
    }
}

// 評論小說彈窗：初始化上下兩欄之間的橫向拖動 resizer
function initReviewResizer() {
    const resizer = document.getElementById('review-resizer');
    const body = document.getElementById('review-body');
    const topCol = document.getElementById('review-col-request');
    const botCol = document.getElementById('review-col-feedback');
    if (!resizer || !body || !topCol || !botCol) return;

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        resizer.classList.add('resizing');
        document.body.style.userSelect = 'none';

        const bodyRect = body.getBoundingClientRect();
        const resizerH = resizer.offsetHeight;

        const onMove = (ev) => {
            // 依滑鼠 Y 位置計算上欄新高度
            const relY = ev.clientY - bodyRect.top;
            const total = bodyRect.height - resizerH;
            const minH = 40;
            let topH = Math.max(minH, Math.min(relY, total - minH));
            let botH = total - topH;
            // 用 flex-basis 固定像素高度，兩欄不再自動平分
            topCol.style.flex = `0 0 ${topH}px`;
            botCol.style.flex = `0 0 ${botH}px`;
        };
        const onUp = () => {
            resizer.classList.remove('resizing');
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}


// ============================================================================
// 📝 多文改寫（Multi-File Rewrite）功能
// ----------------------------------------------------------------------------
// 使用者選擇多個 .txt / .md 檔 → 於「使用者指令」中撰寫改寫規則（如：翻譯成英文）
// → 依序逐一送給 AI 改寫 → 每完成一個檔案自動匯出成 {原檔名}_改寫.{原副檔名}
// 與「🎯 評論小說」共用彈窗版型（cmp-modal / cmp-toolbar / cmp-body / cmp-col）
// ============================================================================

// 預設「使用者指令」提示詞：改寫最常見的情境是翻譯，先給個範例讓使用者參考
const REWRITE_DEFAULT_USER_REQUEST = `你是一位小說視角轉換的機械式改寫工具。
請把下方【待改寫原文】從第三人稱或男性觀點，改寫為以女主角為觀點的版本。

【女主角設定】
以與男主角關係最密切、情感戲份最重的女性角色為女主角。

【唯一允許的改動：稱謂替換】
1. 原文指稱女主角的所有詞語 → 一律改為「我」。
   包含但不限於：她、女主角的名字（如「可歆」）、其他角色對女主角的稱呼在敘述句中出現時（如「這女人」、「那女孩」）、代稱（如「她的」→「我的」）。
2. 原文中女主角自己的對白，維持原樣（對白內的「我」不變）。
3. 對白中其他角色對女主角的稱呼（如叫她的名字、「妳」、「小姐」…）維持原樣，不要動對白內容。
4. 其餘所有文字（男主角的名字、他、其他配角、動作、場景、對白、標點、段落、章節標題、時間戳）全部一字不改。

【嚴格禁止】
1. 禁止增加任何原文沒有的字、詞、句子，包含但不限於：內心戲、情感描述、感受、心跳、聯想、推測、旁白、譯註。
2. 禁止刪除原文任何字、詞、句子、段落。
3. 禁止改寫、潤飾、重組原文的句子順序或用詞。
4. 禁止改變原文的時態、語氣、風格。
5. 禁止把原本描寫女主角外表（如「她的長髮飄動」）改成她的身體感受，僅做代名詞替換（改為「我的長髮飄動」）。
6. 禁止把「他心想」、「他覺得」這類男主角或第三人稱視角的內心描寫改成女主角的推測；維持原文不變。
7. 若原文有女主角完全不在場的場景，維持原文不變，不要刪除也不要改視角。
8. 禁止使用括號補述、影視術語、作者旁白。
9. 禁止使用中文簡體字。
10. 禁止輸出任何前言、後記、標題說明；直接輸出改寫後的原文。

【驗證原則】
改寫後的字數應與原文接近相同（誤差 ±5% 內），若明顯增加或減少，代表你違反了規則，請重新處理。

請直接開始改寫，全篇使用繁體中文。

（若要改成其他改寫任務，直接改掉上面這段指令即可，例如：翻譯成日文、改寫成小紅書貼文、改寫成兒童讀物、改寫成正式公文、改寫成台語口語、擴寫成 3 倍字數、濃縮成 1/3 字數 …等。）`;

let rewriteFiles = [];          // [{ id, file, name, size, checked, status }]
let rewriteFileIdSeq = 0;
let rewriteMatches = [];
let rewriteCurrentMatch = -1;
let rewriteRunning = false;

function openRewriteModal() {
    const userReqEl = qs('#rewrite-user-request');
    if (!userReqEl.value) userReqEl.value = REWRITE_DEFAULT_USER_REQUEST;
    qs('#modal-rewrite').classList.remove('hidden');
}

// 使用者從對話框挑了一批檔案 → 加入清單（不覆蓋，累加，同名檔案跳過）
function onRewriteFilesPicked(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = ''; // 讓下次選同一批也能觸發 change
    if (!files.length) return;

    let added = 0;
    for (const f of files) {
        if (!f.name.match(/\.(txt|md)$/i)) continue;
        // 依「檔名+size」避免重複加入相同檔案
        const dupKey = `${f.name}|${f.size}`;
        if (rewriteFiles.some(x => `${x.name}|${x.size}` === dupKey)) continue;
        rewriteFiles.push({
            id: ++rewriteFileIdSeq,
            file: f,
            name: f.name,
            size: f.size,
            checked: true,
            status: ''
        });
        added++;
    }
    renderRewriteFileList();
    // 若文件名稱欄空的，帶入第一個檔案作為預覽
    if (!qs('#rewrite-doc-name').value && rewriteFiles.length) {
        qs('#rewrite-doc-name').value = buildRewrittenName(rewriteFiles[0].name);
    }
    if (added === 0) alert('沒有加入任何新檔案（可能全為重複或非 .txt/.md 格式）。');
}

function buildRewrittenName(origName) {
    // 保留原副檔名，主檔名末尾補 _改寫
    const m = origName.match(/^(.*)\.(txt|md)$/i);
    if (!m) return origName + '_改寫';
    return `${m[1]}_改寫.${m[2]}`;
}

function renderRewriteFileList() {
    const box = qs('#rewrite-file-list');
    const emptyHint = qs('#rewrite-file-empty-hint');
    box.querySelectorAll('.rewrite-file-item').forEach(n => n.remove());
    if (!rewriteFiles.length) {
        if (emptyHint) emptyHint.style.display = '';
        return;
    }
    if (emptyHint) emptyHint.style.display = 'none';

    rewriteFiles.forEach((item, idx) => {
        const row = document.createElement('label');
        row.className = 'rewrite-file-item';
        row.style.cssText = 'display:flex; align-items:center; gap:8px; padding:4px 6px; border-radius:4px; cursor:pointer;';
        row.innerHTML = `
            <input type="checkbox" ${item.checked ? 'checked' : ''} data-id="${item.id}">
            <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${item.name}">
                ${idx + 1}. ${item.name}
            </span>
            <span class="title-hint" style="min-width:80px; text-align:right;">${item.status || ''}</span>
        `;
        row.querySelector('input').addEventListener('change', (e) => {
            item.checked = e.target.checked;
        });
        box.appendChild(row);
    });
}

function setAllRewriteFilesChecked(v) {
    rewriteFiles.forEach(x => x.checked = !!v);
    renderRewriteFileList();
}
function invertRewriteFilesChecked() {
    rewriteFiles.forEach(x => x.checked = !x.checked);
    renderRewriteFileList();
}
function clearRewriteFiles() {
    if (rewriteRunning) { alert('目前正在改寫中，請等改寫完成後再清空。'); return; }
    if (!rewriteFiles.length) return;
    if (!confirm(`確定要清空清單中的 ${rewriteFiles.length} 個檔案嗎？`)) return;
    rewriteFiles = [];
    renderRewriteFileList();
}

async function startMultiRewrite() {
    if (rewriteRunning) { alert('已有改寫任務進行中。'); return; }
    const targets = rewriteFiles.filter(x => x.checked);
    if (!targets.length) { alert('請先在右側清單勾選要改寫的檔案。'); return; }

    const userRequest = qs('#rewrite-user-request').value.trim();
    if (!userRequest) { alert('請先在「使用者指令」欄位填寫改寫要求。'); return; }

    // 🌐 網路搜尋設定：兩個引擎皆可選（可同時勾選、可都不勾選）
    // 未勾選任何引擎且未提供指定網址 → 走原本純改寫流程，不呼叫搜尋
    const useDDG = qs('#rewrite-use-ddg').checked;
    let useTavily = qs('#rewrite-use-tavily').checked;
    const suggestedUrls = (qs('#rewrite-suggest-urls').value || '')
        .split(/\r?\n/)
        .map(s => s.trim())
        .filter(s => /^https?:\/\//i.test(s));
    // 🔎 使用者手動輸入的搜尋關鍵字：勾選任一引擎時必填，後端不再自動從檔名推斷
    const searchQuery = (qs('#rewrite-search-query').value || '').trim();
    if ((useDDG || useTavily) && !searchQuery) {
        alert('已勾選網路搜尋引擎，請在「🔎 搜尋關鍵字」欄位輸入要搜尋的關鍵字。');
        return;
    }

    // Tavily 需要 API Key：優先讀 localStorage；沒有就彈窗詢問並保存
    let tavilyApiKey = '';
    if (useTavily) {
        tavilyApiKey = localStorage.getItem('tavily_api_key') || '';
        if (!tavilyApiKey) {
            const inputKey = prompt('請輸入你的 Tavily API Key\n（會保存在瀏覽器 localStorage，供之後改寫任務重複使用）：');
            if (inputKey && inputKey.trim()) {
                tavilyApiKey = inputKey.trim();
                localStorage.setItem('tavily_api_key', tavilyApiKey);
            } else {
                alert('未提供 Tavily API Key，本次將不啟用 Tavily 搜尋。');
                useTavily = false;
            }
        }
    }
    const searchEnabled = useDDG || useTavily || suggestedUrls.length > 0;
    if (searchEnabled) {
        appendLog(`🌐 網路搜尋已啟用：DuckDuckGo=${useDDG}, Tavily=${useTavily}, 指定網址=${suggestedUrls.length} 個`);
    }

    rewriteRunning = true;
    const startBtn = qs('#btn-rewrite-start');
    const origBtnText = startBtn.textContent;
    startBtn.disabled = true;
    startBtn.textContent = '⏳ 改寫中…';

    appendLog(`📝 開始多文改寫，共 ${targets.length} 個檔案。`);

    let successCount = 0, failCount = 0;
    for (let i = 0; i < targets.length; i++) {
        const item = targets[i];
        const outName = buildRewrittenName(item.name);
        qs('#rewrite-doc-name').value = outName;
        item.status = '⏳ 讀取中';
        renderRewriteFileList();

        // 讀檔
        let textContent = '';
        try {
            textContent = await item.file.text();
        } catch (e) {
            item.status = '❌ 讀檔失敗';
            renderRewriteFileList();
            appendLog(`❌ [${i + 1}/${targets.length}] 讀取「${item.name}」失敗：${e.message}`);
            failCount++;
            continue;
        }
        if (!textContent || !textContent.trim()) {
            item.status = '❌ 內容為空';
            renderRewriteFileList();
            appendLog(`❌ [${i + 1}/${targets.length}]「${item.name}」內容為空，跳過。`);
            failCount++;
            continue;
        }

        item.status = '🤖 改寫中';
        renderRewriteFileList();
        qs('#rewrite-ai-output').value = `⏳ 正在改寫 [${i + 1}/${targets.length}]「${item.name}」...\n（過程 LOG 顯示在主 LOG 欄）`;
        appendLog(`🤖 [${i + 1}/${targets.length}] 改寫「${item.name}」，共 ${textContent.length} 字。`);

        try {
            const payload = {
                text_content: textContent,
                user_request: userRequest,
                doc_name: item.name,
                model: state.currentModel || 'gemma4',
                model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null,
                // 🌐 網路搜尋參數：後端會依旗標決定是否呼叫 DDG / Tavily / 抓取指定網址
                use_duckduckgo: useDDG,
                use_tavily: useTavily,
                tavily_api_key: useTavily ? tavilyApiKey : '',
                suggested_urls: suggestedUrls,
                search_query: searchQuery
            };
            const result = await callDebugServerAsync('/api/rewrite_content_async', payload);
            if (result && result.rewritten) {
                qs('#rewrite-ai-output').value = result.rewritten;
                // 每完成一個檔案 → 自動匯出
                autoExportRewritten(outName, result.rewritten);
                item.status = '✅ 已完成';
                successCount++;
                appendLog(`✅ [${i + 1}/${targets.length}]「${item.name}」改寫完成，已匯出為「${outName}」。`);
            } else {
                item.status = '❌ 無內容';
                failCount++;
                appendLog(`❌ [${i + 1}/${targets.length}]「${item.name}」AI 未回傳有效內容。`);
            }
        } catch (e) {
            item.status = '❌ 失敗';
            failCount++;
            appendLog(`❌ [${i + 1}/${targets.length}]「${item.name}」發生錯誤：${e.message}`);
        }
        renderRewriteFileList();
    }

    rewriteRunning = false;
    startBtn.disabled = false;
    startBtn.textContent = origBtnText;
    appendLog(`📝 多文改寫結束：成功 ${successCount} 個，失敗 ${failCount} 個。`);
    alert(`多文改寫完成！\n成功：${successCount}\n失敗：${failCount}`);
}

// 自動匯出改寫後的檔案：以 Blob + 隱藏 a 元素觸發下載
function autoExportRewritten(fileName, content) {
    const isMarkdown = /\.md$/i.test(fileName);
    const mime = isMarkdown ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8';
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 多文改寫彈窗雙欄搜尋（使用者指令 + AI 改寫內容）
function doRewriteSearch() {
    const query = qs('#rewrite-search-input').value;
    const countEl = qs('#rewrite-search-count');
    rewriteMatches = [];
    rewriteCurrentMatch = -1;
    if (!query) { countEl.textContent = ''; return; }
    const textareas = [qs('#rewrite-user-request'), qs('#rewrite-ai-output')];
    const lq = query.toLowerCase();
    textareas.forEach((ta, colIdx) => {
        const lo = ta.value.toLowerCase();
        let i = 0;
        while ((i = lo.indexOf(lq, i)) !== -1) {
            rewriteMatches.push({ colIdx, start: i });
            i += lq.length;
        }
    });
    if (rewriteMatches.length) goToRewriteMatch(0);
    else countEl.textContent = '找不到';
}

function goToRewriteMatch(idx) {
    if (!rewriteMatches.length) return;
    const query = qs('#rewrite-search-input').value;
    rewriteCurrentMatch = ((idx % rewriteMatches.length) + rewriteMatches.length) % rewriteMatches.length;
    const m = rewriteMatches[rewriteCurrentMatch];
    const ta = m.colIdx === 0 ? qs('#rewrite-user-request') : qs('#rewrite-ai-output');
    const start = m.start, end = start + query.length;
    const fullText = ta.value;
    ta.value = fullText.substring(0, start);
    const pixelPos = ta.scrollHeight;
    ta.value = fullText;
    ta.focus();
    ta.setSelectionRange(start, end);
    requestAnimationFrame(() => {
        ta.scrollTop = Math.max(0, pixelPos - ta.clientHeight / 2);
    });
    qs('#rewrite-search-count').textContent = `${rewriteCurrentMatch + 1} / ${rewriteMatches.length}`;
}

// 多文改寫：左欄上下兩欄之間的橫向 resizer
function initRewriteResizer() {
    const resizer = document.getElementById('rewrite-resizer');
    const leftCol = document.getElementById('rewrite-left-col');
    const topCol = document.getElementById('rewrite-col-instruction');
    const botCol = document.getElementById('rewrite-col-output');
    if (!resizer || !leftCol || !topCol || !botCol) return;

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        resizer.classList.add('resizing');
        document.body.style.userSelect = 'none';

        const boxRect = leftCol.getBoundingClientRect();
        const resizerH = resizer.offsetHeight;

        const onMove = (ev) => {
            const relY = ev.clientY - boxRect.top;
            const total = boxRect.height - resizerH;
            const minH = 40;
            let topH = Math.max(minH, Math.min(relY, total - minH));
            let botH = total - topH;
            topCol.style.flex = `0 0 ${topH}px`;
            botCol.style.flex = `0 0 ${botH}px`;
        };
        const onUp = () => {
            resizer.classList.remove('resizing');
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

/* ================================================================================
 * 🌐 網路搜尋並依序改寫（Web Search & Sequential Rewrite）
 * -------------------------------------------------------------------------------
 * 使用者在「工作項目區」以類 JSON 格式輸入多個項目（topic / keyword /
 * specific_urls），對每個項目依序：
 *   1) 呼叫既有 /api/rewrite_content_async
 *   2) payload 帶入該項目的 keyword、specific_urls 與勾選的搜尋引擎
 *   3) user_request 中的 {topic}／{context} 佔位符自動替換
 * AI 回傳的內容累加顯示在左下「🖋️ AI 改寫內容」欄位，不匯出檔案。
 * ============================================================================== */

// 預設使用者指令：{topic} 於執行時被替換為當前 task 的 topic
const WEB_REWRITE_DEFAULT_INSTRUCTION =
    `請以當時在場人士的第一人稱視角，寫一篇混合真實歷史與合理想像的感人短篇故事。

主題：{topic}

可用資料：
{context}

寫作要求：

1. 選擇最適合的「在場人士」視角（例如：詩詞中的主角、好友、船夫、侍女、同行友人、目擊者等），讓敘述者真正身處事件現場。
2. 先找出這首詩的「詩眼」或最動人的金句，以此作為故事的情感核心與高潮。
3. 深入分析詩中「人事時地物」的關聯性，找出合理的交集點。
4. 以具體的畫面與情境描寫作為故事開頭。
5. 融合真實歷史與想像，營造強烈情感。
6. 包含自然生動的對話。
7. 字數約 1000~1800 字。
8. 最後自然列出主要參考來源。

請直接開始撰寫故事，不要加入任何解說或分析。`;

const WEB_REWRITE_DEFAULT_TASKS =
    `{
    "topic": "李白《早發白帝城》背後的故事",
    "keyword": "李白 早發白帝城 流放",
    "specific_urls": [
        "https://zh.wikipedia.org/wiki/早發白帝城",
        "https://zh.wikipedia.org/wiki/李白",
        "https://baike.baidu.com/item/早发白帝城"
    ]
},
{
    "topic": "白居易《琵琶行》背後的故事",
    "keyword": "白居易 琵琶行 長安 江州司馬",
    "specific_urls": [
        "https://zh.wikipedia.org/wiki/琵琶行",
        "https://zh.wikipedia.org/wiki/白居易",
        "https://baike.baidu.com/item/琵琶行"
    ]
}`;

let webRewriteRunning = false;
let webRewriteMatches = [];
let webRewriteCurrentMatch = -1;

// 開啟彈窗；首次開啟時自動填入預設指令與範本
function openWebRewriteModal() {
    const instr = qs('#webre-user-request');
    if (!instr.value.trim()) instr.value = WEB_REWRITE_DEFAULT_INSTRUCTION;
    const tasksBox = qs('#webre-tasks-json');
    if (!tasksBox.value.trim()) tasksBox.value = WEB_REWRITE_DEFAULT_TASKS;
    qs('#modal-web-rewrite').classList.remove('hidden');
}

// 容錯解析：允許 # / // 註解、無外層 []、缺漏逗號、尾端多餘逗號
function parseWebRewriteTasks(raw) {
    let s = (raw || '').trim();
    if (!s) throw new Error('工作項目區為空');
    s = s.replace(/^\s*#.*$/gm, '');
    s = s.replace(/^\s*\/\/.*$/gm, '');
    if (!s.trim().startsWith('[')) s = '[\n' + s + '\n]';
    // 補上物件內兩個鍵值對之間漏掉的逗號
    s = s.replace(/("[^"\\]*(?:\\.[^"\\]*)*"|\]|\})\s*\n(\s*")/g, '$1,\n$2');
    // 去除 ,] 或 ,} 的尾端逗號
    s = s.replace(/,(\s*[}\]])/g, '$1');
    let arr;
    try {
        arr = JSON.parse(s);
    } catch (e) {
        throw new Error(`JSON 解析失敗：${e.message}\n\n清洗後內容前 500 字：\n${s.slice(0, 500)}`);
    }
    if (!Array.isArray(arr)) throw new Error('解析結果不是陣列');
    arr.forEach((it, i) => {
        if (!it || typeof it !== 'object') throw new Error(`第 ${i + 1} 筆項目不是物件`);
        if (!it.topic || !String(it.topic).trim()) throw new Error(`第 ${i + 1} 筆項目缺少 topic`);
    });
    return arr;
}

// 主流程：依序處理每個工作項目
async function startWebRewrite() {
    if (webRewriteRunning) { alert('已有網路搜尋改寫任務進行中。'); return; }

    let tasks;
    try {
        tasks = parseWebRewriteTasks(qs('#webre-tasks-json').value);
    } catch (e) {
        alert(e.message);
        return;
    }
    const instructionTpl = qs('#webre-user-request').value.trim();
    if (!instructionTpl) { alert('請先在「使用者指令」欄位填寫改寫要求。'); return; }

    const useDDG = qs('#webre-use-ddg').checked;
    let useTavily = qs('#webre-use-tavily').checked;
    if (!useDDG && !useTavily) {
        if (!confirm('未勾選任何搜尋引擎（僅使用工作項目提供的 specific_urls）。要繼續嗎？')) return;
    }

    let tavilyApiKey = '';
    if (useTavily) {
        tavilyApiKey = localStorage.getItem('tavily_api_key') || '';
        if (!tavilyApiKey) {
            const inputKey = prompt('請輸入你的 Tavily API Key（會保存在瀏覽器 localStorage）：');
            if (inputKey && inputKey.trim()) {
                tavilyApiKey = inputKey.trim();
                localStorage.setItem('tavily_api_key', tavilyApiKey);
            } else {
                alert('未提供 Tavily API Key，本次將不啟用 Tavily 搜尋。');
                useTavily = false;
            }
        }
    }

    webRewriteRunning = true;
    const startBtn = qs('#btn-webre-start');
    const origBtnText = startBtn.textContent;
    startBtn.disabled = true;
    startBtn.textContent = '⏳ 執行中…';

    const outputEl = qs('#webre-ai-output');
    outputEl.value = '';
    appendLog(`🌐 開始網路搜尋並依序改寫，共 ${tasks.length} 個項目。`);

    let successCount = 0, failCount = 0;
    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i];
        const topic = String(task.topic || '').trim();
        const keyword = String(task.keyword || '').trim() || topic;
        const urls = Array.isArray(task.specific_urls)
            ? task.specific_urls.filter(u => /^https?:\/\//i.test(u)) : [];

        const userRequest = instructionTpl
            .replaceAll('{topic}', topic)
            .replaceAll('{context}', '（詳見下方【網路搜尋參考資料】區塊）');

        const header = `\n\n${'='.repeat(60)}\n【${i + 1}/${tasks.length}】${topic}\n${'='.repeat(60)}\n`;
        outputEl.value += header + `⏳ 正在搜尋並生成中...`;
        outputEl.scrollTop = outputEl.scrollHeight;
        appendLog(`🤖 [${i + 1}/${tasks.length}]「${topic}」  搜尋關鍵字：${keyword}  指定網址：${urls.length} 個`);

        try {
            const payload = {
                text_content: `本項目主題：${topic}\n關鍵字：${keyword}`,
                user_request: userRequest,
                doc_name: topic,
                model: state.currentModel || 'gemma4',
                model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null,
                use_duckduckgo: useDDG,
                use_tavily: useTavily,
                tavily_api_key: useTavily ? tavilyApiKey : '',
                suggested_urls: urls,
                search_query: keyword
            };
            const result = await callDebugServerAsync('/api/rewrite_content_async', payload);
            const text = (result && result.rewritten) ? result.rewritten : '';
            outputEl.value = outputEl.value.replace(/⏳ 正在搜尋並生成中\.\.\.$/, text || '（AI 未回傳有效內容）');
            outputEl.scrollTop = outputEl.scrollHeight;
            if (text) {
                successCount++;
                appendLog(`✅ [${i + 1}/${tasks.length}]「${topic}」完成，共 ${text.length} 字。`);
            } else {
                failCount++;
                appendLog(`❌ [${i + 1}/${tasks.length}]「${topic}」AI 未回傳有效內容。`);
            }
        } catch (e) {
            failCount++;
            outputEl.value = outputEl.value.replace(/⏳ 正在搜尋並生成中\.\.\.$/, `❌ 錯誤：${e.message}`);
            appendLog(`❌ [${i + 1}/${tasks.length}]「${topic}」發生錯誤：${e.message}`);
        }
    }

    webRewriteRunning = false;
    startBtn.disabled = false;
    startBtn.textContent = origBtnText;
    appendLog(`🌐 網路搜尋改寫結束：成功 ${successCount} 個，失敗 ${failCount} 個。`);
    alert(`網路搜尋改寫完成！\n成功：${successCount}\n失敗：${failCount}`);
}

// 雙欄搜尋（使用者指令 + AI 改寫內容）
function doWebRewriteSearch() {
    const query = qs('#webre-search-input').value;
    const countEl = qs('#webre-search-count');
    webRewriteMatches = [];
    webRewriteCurrentMatch = -1;
    if (!query) { countEl.textContent = ''; return; }
    const textareas = [qs('#webre-user-request'), qs('#webre-ai-output')];
    textareas.forEach((ta, colIdx) => {
        const src = ta.value;
        let i = 0;
        while ((i = src.indexOf(query, i)) !== -1) {
            webRewriteMatches.push({ colIdx, start: i });
            i += query.length;
        }
    });
    countEl.textContent = webRewriteMatches.length ? `1/${webRewriteMatches.length}` : '無';
    if (webRewriteMatches.length) goToWebRewriteMatch(0);
}
function goToWebRewriteMatch(idx) {
    if (!webRewriteMatches.length) return;
    const query = qs('#webre-search-input').value;
    idx = (idx + webRewriteMatches.length) % webRewriteMatches.length;
    webRewriteCurrentMatch = idx;
    const m = webRewriteMatches[idx];
    const ta = [qs('#webre-user-request'), qs('#webre-ai-output')][m.colIdx];
    ta.focus();
    ta.setSelectionRange(m.start, m.start + query.length);
    qs('#webre-search-count').textContent = `${idx + 1}/${webRewriteMatches.length}`;
}

// 上下欄拖曳分隔
function initWebRewriteResizer() {
    const resizer = qs('#webre-resizer');
    const topCol = qs('#webre-col-instruction');
    const botCol = qs('#webre-col-output');
    if (!resizer || !topCol || !botCol) return;
    resizer.addEventListener('mousedown', e => {
        e.preventDefault();
        const startY = e.clientY;
        const startTopH = topCol.getBoundingClientRect().height;
        const startBotH = botCol.getBoundingClientRect().height;
        const total = startTopH + startBotH;
        resizer.classList.add('resizing');
        document.body.style.userSelect = 'none';
        const onMove = (ev) => {
            const dy = ev.clientY - startY;
            let topH = Math.max(40, Math.min(total - 40, startTopH + dy));
            let botH = total - topH;
            topCol.style.flex = `0 0 ${topH}px`;
            botCol.style.flex = `0 0 ${botH}px`;
        };
        const onUp = () => {
            resizer.classList.remove('resizing');
            document.body.style.userSelect = '';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}
