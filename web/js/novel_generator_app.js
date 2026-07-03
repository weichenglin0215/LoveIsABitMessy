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
            cloudCharacters = data;
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
        div.innerHTML = `
            <div class="chapter-title-row">
                <span class="lock-btn btn-lock-ch" title="鎖定後將不會被 AI 覆蓋章標題、章描述、小節大綱"
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
    state.chapters[chIdx].locked = !state.chapters[chIdx].locked;
    renderChapters();
}

let dragData = null;
function handleDragStart(e, chIdx, secIdx) {
    dragData = { chIdx, secIdx };
    e.dataTransfer.setData('text/plain', ''); // 必需
}

function handleDrop(e, chIdx, targetSecIdx) {
    e.preventDefault();
    if (!dragData) return;
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
            .limit(50);

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
const REVIEW_DEFAULT_USER_REQUEST = `你是一位有 30 年資歷、鐵面無私的資深出版社主編兼書評人，經手過數百部暢銷與退稿作品，見過所有新人常犯的毛病。
請以你「最嚴格、絲毫不留情面、直言不諱」的高標準，審讀下方這份小說稿件，並寫下你的評審意見。

【審讀立場】
- 假設你正在替出版社決定「是否簽下這本書」，錯過爛稿的成本很高，你必須挑毛病。
- 假設讀者付了錢、時間有限、耐心稀薄，凡是拖沓、假掰、老套、邏輯崩塌之處都要立刻點名。
- 不要客套、不要鼓勵性廢話、不要「整體來說還不錯」這種話。有問題就直接說出來。

【評審面向（每項都要有具體引文或段落定位）】
1. 故事結構與節奏：起承轉合是否成立？哪幾章拖戲？哪幾章崩掉？懸念是否有效？
2. 人物塑造：主角動機是否可信？角色行為是否前後矛盾？配角有沒有存在的必要？
3. 對白：像不像真人在說話？有沒有作者跳出來替角色說教？
4. 情感真實度：戀愛／衝突／情慾／背叛的張力夠不夠？哪裡讓人尷尬出戲？
5. 語言與文字：贅字、陳腔濫調、比喻是否老套？段落節奏是否單調？
6. 邏輯與世界觀：因果是否成立？有無 bug、時間線錯亂、常識錯誤？
7. 市場與讀者觀感：這本書若上市，讀者最可能在哪一章棄書？書評星等大概幾顆星？

【輸出格式】
- 開頭給出「一句話總評」（不超過 30 字，語氣可以毒辣）。
- 接著給出「總體評分」：故事 / 人物 / 文筆 / 節奏 / 市場潛力，各項 1–10 分並附一句理由。
- 然後條列具體問題，每條格式為：【問題類型】章節或段落定位 — 問題描述 — 修改建議。
- 最後給出「若要出版必須先修好的三大致命傷」與「值得保留的兩個亮點（若真的有）」。
- 全部使用繁體中文。禁止使用中文簡體字。禁止安慰性語言。`;

let reviewMatches = [];
let reviewCurrentMatch = -1;
let reviewSearchLastCol = 0; // 0=user request, 1=ai feedback

function openReviewModal() {
    // 預設文件名稱為目前小說名稱
    const bookTitle = (state.bookTitle || '').trim() || '未命名小說';
    const docNameEl = qs('#review-doc-name');
    if (!docNameEl.value) docNameEl.value = bookTitle;

    const userReqEl = qs('#review-user-request');
    if (!userReqEl.value) userReqEl.value = REVIEW_DEFAULT_USER_REQUEST;

    qs('#modal-review').classList.remove('hidden');
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
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.match(/\.(txt|md)$/i)) {
        alert('❌ 僅支援 .txt 或 .md 文字檔案。');
        return;
    }
    let textContent = '';
    try {
        textContent = await file.text();
    } catch (e) {
        alert('❌ 無法讀取檔案：' + e.message);
        return;
    }
    if (!textContent || textContent.trim().length < 50) {
        alert('❌ 檔案內容太短（少於 50 字）。');
        return;
    }
    // 覆寫文件名稱為外部檔名（去掉副檔名）
    const baseName = file.name.replace(/\.(txt|md)$/i, '');
    qs('#review-doc-name').value = baseName;
    await runReviewJob(textContent, baseName);
}

async function runReviewJob(fullText, docName) {
    const userRequest = qs('#review-user-request').value.trim() || REVIEW_DEFAULT_USER_REQUEST;
    const aiFeedbackEl = qs('#review-ai-feedback');

    // 若原文過長，截斷並在 LOG 標註
    const MAX_LEN = 100000;
    let sendText = fullText;
    if (fullText.length > MAX_LEN) {
        sendText = fullText.slice(0, MAX_LEN);
        appendLog(`⚠️ 原文長度 ${fullText.length} 字，超過 ${MAX_LEN} 字，已截斷。`);
    }

    aiFeedbackEl.value = '⏳ AI 評審中，請稍候...\n（過程 LOG 顯示在主 LOG 欄）';
    appendLog(`🎯 開始評審「${docName}」，共 ${sendText.length} 字。`);

    try {
        const payload = {
            text_content: sendText,
            user_request: userRequest,
            doc_name: docName,
            model: state.currentModel || 'gemma4',
            model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null
        };
        const result = await callDebugServerAsync('/api/review_novel_async', payload);
        if (result && result.review) {
            aiFeedbackEl.value = result.review;
            appendLog('✅ 評審結果已生成，顯示於評論小說彈窗。');
        } else {
            aiFeedbackEl.value = '❌ AI 未回傳有效評審內容，請查看 LOG 或重試。';
            appendLog('❌ AI 未回傳有效評審內容。');
        }
    } catch (e) {
        aiFeedbackEl.value = '❌ 發生錯誤：' + e.message;
        appendLog('❌ 評審發生錯誤：' + e.message);
    }
}

function exportReviewResult() {
    const docName = (qs('#review-doc-name').value || '未命名').trim();
    const userReq = qs('#review-user-request').value || '';
    const aiFb = qs('#review-ai-feedback').value || '';
    const md = `# 🎯 小說評審報告：${docName}\n\n` +
        `## ✏️ 使用者要求\n\n${userReq}\n\n` +
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
