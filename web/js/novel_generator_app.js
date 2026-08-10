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
    },
    // 「選取文字 AI 加工」四種功能各自記住的參數（隨小說存檔），詳見 ensureRefineParams()
    refineParams: null
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

// ====== 雲端小說清單排序（供「☁️ 讀取雲端小說」下拉與「比對多本小說」四個選單共用）======
let cloudNovelListRaw = []; // 讀取雲端小說清單的原始資料（未排序），供切換排序方式時重新渲染而不必重新查詢
const novelListCollator = new Intl.Collator('zh-Hant'); // 中文字母（筆畫/拼音）排序用

// 依目前選擇的排序方式，回傳排序後的小說清單複本。
// 「字母排序正向/反向」在名稱相同時，一律以「最新的在上面」做次要排序。
function sortNovelList(list, mode) {
    const arr = (list || []).slice();
    const byNewestFirst = (a, b) => new Date(b.updated_at) - new Date(a.updated_at);
    if (mode === 'alpha_asc' || mode === 'alpha_desc') {
        const dir = mode === 'alpha_desc' ? -1 : 1;
        arr.sort((a, b) => {
            const c = novelListCollator.compare(a.novel_title || '', b.novel_title || '') * dir;
            return c !== 0 ? c : byNewestFirst(a, b); // 同名 → 最新的在上面
        });
    } else if (mode === 'time_asc') {
        arr.sort((a, b) => -byNewestFirst(a, b)); // 最舊在上面
    } else {
        arr.sort(byNewestFirst); // time_desc（預設）：最新在上面
    }
    return arr;
}

// 依排序後的清單組出 <option> HTML（各下拉選單共用同一份格式）
function buildNovelOptionsHtml(list) {
    return '<option value="">-- 請選擇小說 --</option>' +
        list.map(d => {
            const date = new Date(d.updated_at).toLocaleString('zh-TW', { hour12: false });
            return `<option value="${d.id}">${d.novel_title} (${date})</option>`;
        }).join('');
}

// 取得目前選擇的排序方式（下拉選單若尚未載入則回退為預設「字母排序正向」）
function getNovelSortMode() {
    return qs('#novel-sort-select')?.value || 'alpha_asc';
}

// 依目前排序方式重新渲染「☁️ 讀取雲端小說」的下拉選單（不重新查詢雲端）
function renderCloudNovelSelect() {
    const select = qs('#cloud-novel-select');
    if (!select) return;
    const sorted = sortNovelList(cloudNovelListRaw, getNovelSortMode());
    select.innerHTML = buildNovelOptionsHtml(sorted);
}

// 依目前排序方式重新渲染「比對多本小說」彈窗的四個下拉選單（不重新查詢雲端，並保留各欄原本選取值）
function renderCompareNovelSelects() {
    const sorted = sortNovelList(compareNovelList, getNovelSortMode());
    const optionsHtml = buildNovelOptionsHtml(sorted);
    document.querySelectorAll('.compare-novel-select').forEach(sel => {
        const cur = sel.value;
        sel.innerHTML = optionsHtml;
        if (cur) sel.value = cur;
    });
}

// 切換排序方式時，兩處下拉選單一併重新排序（各自只在已有資料時才重繪）
function onNovelSortChange() {
    if (cloudNovelListRaw.length) renderCloudNovelSelect();
    if (compareNovelList.length) renderCompareNovelSelects();
}

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

// 一次重繪整個畫面：書名/故事粗綱輸入框、AI設定下拉選單、角色卡列表、章節列表、編輯區
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

// 繪製角色卡欄位（4 個角色槽）：每列包含角色名稱輸入框 + 角色卡下拉選單 + 刪除按鈕
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

// 繪製左側章節/小節列表，包含拖曳排序把手、鎖定按鈕、AI大綱按鈕、刪除按鈕
function renderChapters() {
    const container = qs('#chapter-list');
    // 重繪前先記住每個「章描述」目前的實際高度（使用者可能用 resize 把手手動調整過），
    // 重繪後依相同順序還原，避免點選任何小節都會讓已調整過的高度被打回原狀
    const descHeights = Array.from(container.querySelectorAll('.chapter-desc')).map(ta => ta.offsetHeight);
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
    // 還原重繪前記住的「章描述」高度（沒有記錄到的新章節維持 CSS 預設高度）
    container.querySelectorAll('.chapter-desc').forEach((ta, idx) => {
        if (descHeights[idx]) ta.style.height = descHeights[idx] + 'px';
    });
}

// 繪製右側主編輯區（目前選取的小節標題與內文），並綁定編輯事件回寫至 state
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
    // 📤 匯出小說：主按鈕展開下拉選單（沿用「額外功能」的開合行為），選單內兩種匯出格式
    const exportBtn = qs('#btn-export');
    const exportMenu = qs('#export-menu');
    if (exportBtn && exportMenu) {
        exportBtn.addEventListener('click', () => {
            const open = exportMenu.style.display === 'flex';
            exportMenu.style.display = open ? 'none' : 'flex';
        });
        // 點選單內任一按鈕後自動收合
        exportMenu.querySelectorAll('button').forEach(b => {
            b.addEventListener('click', () => { exportMenu.style.display = 'none'; });
        });
    }
    qs('#btn-export-simple').addEventListener('click', exportNovelSimple);
    qs('#btn-export-full').addEventListener('click', exportNovelFull);
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
    qs('#review-user-request').addEventListener('input', onReviewRequestInput);
    // 兩個模式 Toggle：互斥（只能二擇一），狀態記錄到專案供 runReviewJob 判斷要跑哪些評審立場
    qs('#review-use-skills').addEventListener('change', () => setReviewMode('skills'));
    qs('#review-use-custom').addEventListener('change', () => setReviewMode('custom'));
    // 「選擇評論的立場」彈窗：開啟、批次勾選、重新讀取目錄、兩個附加選項
    qs('#btn-open-review-skills').addEventListener('click', openReviewSkillsModal);
    qs('#btn-review-skills-all').addEventListener('click', () => setReviewSkillSelection('all'));
    qs('#btn-review-skills-none').addEventListener('click', () => setReviewSkillSelection('none'));
    qs('#btn-review-skills-default').addEventListener('click', () => setReviewSkillSelection('default'));
    qs('#btn-review-skills-reload').addEventListener('click', async () => {
        await loadReviewSkills(true);
        renderReviewSkillList();
    });
    qs('#review-include-custom').addEventListener('change', e => { state.reviewIncludeCustom = e.target.checked; });
    qs('#review-final-synthesis').addEventListener('change', e => { state.reviewFinalSynthesis = e.target.checked; });
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
    qs('#rewrite-preset-select').addEventListener('change', onRewritePresetChange);
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
    qs('#webre-preset-select').addEventListener('change', onWebRewritePresetChange);
    qs('#webre-search-input').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doWebRewriteSearch(); }
    });
    qs('#webre-search-prev').addEventListener('click', () => goToWebRewriteMatch(webRewriteCurrentMatch - 1));
    qs('#webre-search-next').addEventListener('click', () => goToWebRewriteMatch(webRewriteCurrentMatch + 1));
    initWebRewriteResizer();
    initEditorSideResizer();

    // 🔎 全面搜尋（Ctrl+Shift+F）：熱鍵、面板按鈕、結果點擊、拖曳
    initGlobalSearch();

    // 🖥️ 全畫面編輯：開關按鈕、橫行輸入同步、搜尋列
    initFullscreenEdit();

    // 🧭 快顯功能表選單（Alt+A）＋ 尋找／取代浮動面板
    initQuickMenuAndFindReplace();

    // ✨ 選取文字 AI 加工（擴寫／精簡／對白／視覺化改寫）：熱鍵 + 彈窗按鈕
    document.addEventListener('keydown', onRefineHotkey, true);
    qs('#btn-refine-cancel').addEventListener('click', closeRefineModal);
    qs('#btn-refine-generate').addEventListener('click', runRefineGenerate);
    qs('#btn-refine-replace').addEventListener('click', () => applyRefineResult('replace'));
    qs('#btn-refine-append').addEventListener('click', () => applyRefineResult('append'));

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
    qs('#novel-sort-select').addEventListener('change', onNovelSortChange);
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

    // 多本小說批次產生視窗（Multi-Book Modal）
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

    // 儲存小說視窗（Save Novel Modal）
    qs('#btn-save-cancel').addEventListener('click', () => {
        qs('#modal-novel-save').classList.add('hidden');
    });
    qs('#btn-save-confirm').addEventListener('click', confirmSaveProject);

    // 讀取雲端小說時的密碼輸入視窗（Load Password Modal）
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

// 設定目前選取（active）的章節/小節索引，並重繪列表與編輯區
function setActive(chIdx, secIdx) {
    state.activeIndex = { chapter: chIdx, section: secIdx };
    renderChapters();
    renderEditor();
}

// 更新指定小節的標題文字（目前程式碼中未見呼叫端使用，保留供未來擴充）
function updateSectionTitle(chIdx, secIdx, val) {
    state.chapters[chIdx].sections[secIdx].title = val;
}

// 在指定章節末端新增一個空白小節，並重繪章節列表
function addSection(chIdx) {
    state.chapters[chIdx].sections.push({ title: "新節", content: "" });
    renderChapters();
}

// 刪除指定章節下的某個小節（會先跳確認視窗）
function removeSection(chIdx, secIdx) {
    if (!confirm("確定要刪除這個小節大綱嗎？")) return;
    state.chapters[chIdx].sections.splice(secIdx, 1);
    renderChapters();
}

// 移除指定索引的角色卡欄位（會先跳確認視窗）
function removeChar(idx) {
    if (!confirm("確定要移除這個角色嗎？")) return;
    state.characters.splice(idx, 1);
    renderCharacters();
}

// 刪除整個章節（含其下所有小節，會先跳確認視窗）
function removeChapter(idx) {
    if (!confirm("確定要刪除整個章節嗎？這將會連同該章節下的所有小節內容一併刪除。")) return;
    state.chapters.splice(idx, 1);
    renderChapters();
}

// 切換單一小節的鎖定狀態（上鎖後 AI 不會覆寫該小節內容）
function toggleLock(chIdx, secIdx) {
    state.chapters[chIdx].sections[secIdx].locked = !state.chapters[chIdx].sections[secIdx].locked;
    renderChapters();
}

// 切換整章的鎖定狀態，並連動該章底下所有小節一併鎖定/解鎖
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
let chapterDragData = null; // 暫存目前正在拖曳的章節索引
// 開始拖曳整章：記錄來源章節索引
function handleChapterDragStart(e, chIdx) {
    chapterDragData = { chIdx };
    e.dataTransfer.setData('text/plain', ''); // 必需
    e.dataTransfer.effectAllowed = 'move';
}

// 放開拖曳的章節：將章節搬移至新位置，並同步更新目前選取索引
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

let dragData = null; // 暫存目前正在拖曳的小節（章節索引＋小節索引）
// 開始拖曳小節：記錄來源章節與小節索引
function handleDragStart(e, chIdx, secIdx) {
    dragData = { chIdx, secIdx };
    e.dataTransfer.setData('text/plain', ''); // 必需
}

// 放開拖曳的小節：僅允許同一章內搬移順序，並同步更新目前選取索引
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

// 切換「AI 生成中」狀態：停用/啟用相關按鈕，並可選擇性附加一則 LOG 訊息
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

// 將訊息附加到畫面下方的 LOG 輸出框，並同步輸出到 console 方便除錯
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

// 呼叫 AI 為指定章節（chIdx，0-based）產生小節大綱；已上鎖的小節會保留，未上鎖的會被覆寫或新增
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

        // 步驟一：先向後端要一份提示詞預覽，方便在 LOG 中檢視實際送出的內容
        appendLog(">> 正在彙整 AI 提示詞...");
        const previewRes = await callDebugServer('/api/generate_outline', { ...payload, preview: true });
        if (previewRes && previewRes.debug_prompt) {
            appendLog(`\n=== 傳遞給 AI 的提示詞 ===\n${previewRes.debug_prompt}\n=====================\n`);
        }

        // 步驟二：真正呼叫 AI 進行生成
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

// 依序為所有「未鎖定」章節呼叫 AI 產生小節大綱（逐章循序執行，非平行）
async function aiGenAllOutlines() {
    if (!confirm("確定要讓 AI 撰寫所有未鎖定章節的大綱嗎？")) return;
    for (let i = 0; i < state.chapters.length; i++) {
        if (!state.chapters[i].locked) {
            await aiGenChapterOutline(i);
        }
    }
    appendLog(">> 所有未鎖定章節的大綱已生成完畢。");
}

// 依序為所有「未鎖定」小節呼叫 AI 產生內文（會先切換到該小節再生成，讓使用者可即時看到進度）
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

// 一鍵全自動生成：依序執行「粗綱轉章節」→「章節轉小節大綱」→「小節內文」三個階段
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

// 批次生成多本小說：totalCount 為本數，opts 控制要執行哪些階段與是否自動存雲端（password）
// 每本生成前都會先還原成原始快照，避免上一本內容殘留污染下一本
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

        // 階段一：根據粗綱生成章標題與章描述（跳過已鎖定）
        if (doPhase1) {
            appendLog("\n--- Phase 1: 根據故事粗綱生成各章節 ---");
            await aiGenChaptersFromPremise(true); // true = 跳過確認彈窗，直接生成
        } else {
            appendLog("\n--- Phase 1: 已略過（使用現有章節）---");
        }

        // 階段二：生成小節標題與小節描述
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

        // 階段三：為各節生成內文
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

// 自動儲存單本小說：若有密碼則同時存至雲端（novel_entries），並一律下載本機 JSON + Markdown 檔
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

// 呼叫 AI 依據故事粗綱生成各章標題與描述；已上鎖的章節會保留，未上鎖的會被覆寫或新增
// skipConfirm 為 true 時跳過確認彈窗（供多本自動生成流程使用）
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

        // 步驟一：取得提示詞預覽
        appendLog(">> 正在彙整 AI 提示詞...");
        const previewRes = await callDebugServer('/api/generate_chapters', { ...payload, preview: true });
        if (previewRes && previewRes.debug_prompt) {
            appendLog(`\n=== 傳遞給 AI 的提示詞 ===\n${previewRes.debug_prompt}\n=====================\n`);
        }

        // 步驟二：真正生成
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

// 匯出「章標題 + 內文」的一般小說格式（不含粗綱、章描述、節標題、作者備註）
function exportNovelSimple() {
    let md = `# ${state.bookTitle}\n\n`;
    state.chapters.forEach(ch => {
        md += `## ${ch.title}\n\n`;
        ch.sections.forEach(sec => {
            if (sec.content && sec.content.trim()) md += `${sec.content.trim()}\n\n`;
        });
    });
    downloadMarkdown(`${sanitizeFilename(state.bookTitle) || 'novel'}.md`, md);
    appendLog(">> 小說已匯出（章標題＋內文，一般小說格式）。");
}

// 匯出完整資料：粗綱 + 各章（章描述）+ 各節（節標題）+ 內文 + 作者備註
function exportNovelFull() {
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

    // 作者備註（若有）附加於最後
    if (state.authorNotes && state.authorNotes.trim()) {
        md += `## 📝 作者備註\n\n${state.authorNotes.trim()}\n`;
    }

    downloadMarkdown(`${sanitizeFilename(state.bookTitle) || 'novel'}.md`, md);
    appendLog(">> 小說已匯出（粗綱＋章＋節＋內文＋作者備註）。");
}

// 呼叫 AI 為「目前選取中」的小節（state.activeIndex）產生正文內容，
// 會帶入上一節內文（銜接劇情）與下一節標題（預留伏筆）等前後文資訊
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

        // 步驟一：取得提示詞預覽
        appendLog(">> 正在彙整 AI 提示詞...");
        const previewRes = await callDebugServer('/api/generate_story_content', { ...payload, preview: true });
        if (previewRes && previewRes.debug_prompt) {
            appendLog(`\n=== 傳遞給 AI 的提示詞 ===\n${previewRes.debug_prompt}\n=====================\n`);
        }

        // 步驟二：真正生成
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

// 以同步方式呼叫本機 debug_server.py 的一般 API（POST JSON，直接等待回應）
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

    // 步驟一：發送請求，立即取得 job_id
    const startRes = await fetch(`http://localhost:8081${asyncEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });
    if (!startRes.ok) throw new Error(`HTTP ${startRes.status}`);
    const { job_id } = await startRes.json();
    if (!job_id) throw new Error("未取得 job_id");

    appendLog(`>> Job 已啟動 (id: ${job_id.slice(0, 8)}...)`);

    // 步驟二：輪詢 /api/job — 使用「無活動超時」取代固定次數，支援大型模型長時間生成
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

// 開啟「比對多本小說」彈窗，並重置搜尋狀態、重新載入雲端小說清單
async function openCompareModal() {
    qs('#modal-compare').classList.remove('hidden');
    qs('#compare-search-input').value = '';
    qs('#compare-search-count').textContent = '';
    compareSearchMatches = [];
    compareCurrentMatch = -1;
    await loadCompareNovelList();
}

// 從雲端讀取小說清單（最多 200 筆），填入比對彈窗的 4 個下拉選單
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
        renderCompareNovelSelects();
        appendLog(`✅ [比對] 已載入 ${compareNovelList.length} 筆雲端紀錄`);
    } catch (e) {
        appendLog('❌ [比對] 讀取清單失敗: ' + e.message);
    }
}

// 使用者在比對欄 colIdx 選擇了某本小說（novelId）：先嘗試用記住的密碼載入，失敗則跳密碼彈窗
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

// 嘗試以指定密碼 pwd 從雲端載入小說到比對欄 colIdx；密碼不符或發生錯誤則回傳 false
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

// 顯示比對用的密碼輸入彈窗，回傳 Promise：確定後嘗試載入，成功/失敗都會 resolve
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

// 依 mode（premise/chapters/sections/all_outlines/content/all）將指定小說狀態轉成純文字，供比對欄顯示
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

// 從雲端永久刪除比對欄 colIdx 目前選取的小說（會先跳確認視窗）
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

// 依目前選取的顯示模式，重新渲染比對欄 colIdx 的文字內容與上方 AI 設定資訊
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

// 重新渲染全部 4 欄比對內容（切換顯示模式下拉時觸發）
function updateAllCompareContent() {
    compareLoadedNovels.forEach((_, i) => {
        const ta = document.querySelectorAll('.compare-content')[i];
        if (ta) ta.value = getCompareText(compareLoadedNovels[i], qs('#compare-mode-select').value);
    });
    compareSearchMatches = [];
    compareCurrentMatch = -1;
    qs('#compare-search-count').textContent = '';
}

// 在 4 個比對欄的 textarea 內容中搜尋關鍵字，找出所有符合位置並跳至第一筆
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

// 跳至第 idx 個搜尋結果（可循環），選取文字並將該處捲動至可視範圍中央
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

// 開啟「儲存小說」彈窗，預填目前書名
async function saveProject() {
    // 開啟儲存彈窗
    qs('#save-novel-name').value = state.bookTitle || "";
    qs('#save-novel-password').value = "";
    qs('#modal-novel-save').classList.remove('hidden');
}

// 確認儲存：驗證名稱與密碼後，同步目前 AI 設定至 state，並存至雲端 + 觸發本機檔案下載
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

// 讀取雲端小說清單（最多 1000 筆）填入「讀取雲端小說」下拉選單，並將按鈕切換成下拉選單顯示
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

        cloudNovelListRaw = data || [];
        renderCloudNovelSelect();

        btn.style.display = 'none';
        select.style.display = 'inline-block';
        appendLog(`✅ 已載入 ${data.length} 筆雲端紀錄`);
    } catch (e) {
        appendLog("❌ 讀取清單失敗: " + e.message);
    }
}

// 使用者從下拉選單選擇要載入的雲端小說：先確認覆蓋警告，再開啟密碼驗證彈窗
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

// 驗證密碼後正式從雲端載入小說：解析 JSON、檢查資料格式，成功後覆蓋整個 state 並重繪畫面
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

// 從本機選取 .json 專案檔並讀取覆蓋目前 state（純前端 FileReader，不經過後端）
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
// 預設的「使用者編輯提示詞」：刻意只給三段式骨架而不預設任何立場，
// 讓使用者自行填寫；此內容會保存在 state.reviewCustomPrompt，隨小說專案一起儲存。
const REVIEW_CUSTOM_DEFAULT_PROMPT = `（請在此撰寫你希望 AI 採取的評審立場與風格，以下為填寫指引，可直接刪除或覆寫）

【審讀立場】
- 你希望 AI 扮演什麼身分來閱讀這份稿件？（例如：特定類型的讀者、某種職業視角、某位假想人物）
- 這個身分對稿件的態度是嚴厲、鼓勵、中立，還是只看單一面向（只挑優點／只挑缺點）？

【評審面向】
- 列出你希望 AI 具體檢視的項目（例如：人物、節奏、對白、伏筆、市場性…），建議 3~8 項。

【輸出格式】
- 說明你希望 AI 怎麼呈現結果（例如：先給一句話總評、再逐條列問題、是否要附引文或段落定位、字數限制…）。
- 全部使用繁體中文。禁止使用中文簡體字。`;

// NovelReviewSkill 目錄讀回來的提示詞清單快取：[{ name, label, content }]
let reviewSkills = [];
// 目前在「選擇評論的立場」彈窗右欄預覽中的項目檔名
let reviewSkillPreviewName = '';

let reviewMatches = [];
let reviewCurrentMatch = -1;
let reviewSearchLastCol = 0; // 0=user request, 1=ai feedback

/**
 * 判斷某個提示詞檔名是否屬於「預設勾選」項目。
 * 規則：單一個英文字母開頭 + "."（例如 A. / B. / … / Z.），日後新增 H. I. … 會自動被視為預設項目。
 */
function isDefaultReviewSkill(name) {
    return /^[A-Za-z]\./.test(name || '');
}

/**
 * 取得「使用者編輯提示詞」目前的內容：
 * 優先使用專案中已保存的版本，沒有才回退到程式預設骨架。
 */
function getReviewCustomPrompt() {
    if (typeof state.reviewCustomPrompt === 'string' && state.reviewCustomPrompt.trim()) {
        return state.reviewCustomPrompt;
    }
    return REVIEW_CUSTOM_DEFAULT_PROMPT;
}

/**
 * 從後端 /api/review_skills 讀取 NovelReviewSkill 目錄中的所有 .md 提示詞。
 * 第一次讀取（或專案尚無勾選記錄）時，自動勾選所有「單一英文字母 + .」開頭的項目。
 */
async function loadReviewSkills(force = false) {
    if (reviewSkills.length && !force) return reviewSkills;
    try {
        const resp = await fetch('/api/review_skills');
        reviewSkills = await resp.json();
    } catch (e) {
        reviewSkills = [];
        appendLog('❌ 讀取 NovelReviewSkill 清單失敗：' + e.message);
        return reviewSkills;
    }
    // 專案中尚未保存過勾選狀態時，預設勾選字母開頭項目
    if (!Array.isArray(state.reviewSelectedSkills)) {
        state.reviewSelectedSkills = reviewSkills
            .filter(s => isDefaultReviewSkill(s.name))
            .map(s => s.name);
    }
    appendLog(`📋 已載入 NovelReviewSkill 提示詞 ${reviewSkills.length} 份。`);
    return reviewSkills;
}

// 依 reviewSkills 與 state.reviewSelectedSkills 重繪「選擇評論的立場」彈窗的左側清單
function renderReviewSkillList() {
    const listEl = qs('#review-skills-list');
    const countEl = qs('#review-skills-count');
    if (!listEl) return;
    const selected = state.reviewSelectedSkills || [];
    listEl.innerHTML = '';

    reviewSkills.forEach(skill => {
        // 每一列：勾選框 + 可點擊的名稱（點名稱在右欄預覽內容）
        const row = document.createElement('div');
        row.className = 'checkbox-label';
        row.style.cssText = 'display:flex; align-items:center; gap:6px; padding:2px 0; cursor:pointer;';

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.includes(skill.name);
        cb.addEventListener('change', () => {
            const list = state.reviewSelectedSkills || (state.reviewSelectedSkills = []);
            const idx = list.indexOf(skill.name);
            if (cb.checked && idx < 0) list.push(skill.name);
            if (!cb.checked && idx >= 0) list.splice(idx, 1);
            updateReviewSkillCount();
        });

        const nameSpan = document.createElement('span');
        nameSpan.textContent = skill.label;
        nameSpan.style.flex = '1 1 auto';
        // 點名稱只做預覽，不影響勾選狀態
        nameSpan.addEventListener('click', e => {
            e.preventDefault();
            showReviewSkillPreview(skill.name);
        });

        row.appendChild(cb);
        row.appendChild(nameSpan);
        listEl.appendChild(row);
    });

    if (countEl) updateReviewSkillCount();
}

// 更新清單標題旁的「已勾選 N / 共 M」計數
function updateReviewSkillCount() {
    const countEl = qs('#review-skills-count');
    if (!countEl) return;
    const n = (state.reviewSelectedSkills || []).length;
    countEl.textContent = `已勾選 ${n} / 共 ${reviewSkills.length}`;
}

// 在右欄顯示指定 .md 的完整內容
function showReviewSkillPreview(name) {
    const skill = reviewSkills.find(s => s.name === name);
    if (!skill) return;
    reviewSkillPreviewName = name;
    const titleEl = qs('#review-skill-preview-title');
    const prevEl = qs('#review-skill-preview');
    if (titleEl) titleEl.textContent = `📖 ${skill.label}`;
    if (prevEl) { prevEl.value = skill.content || ''; prevEl.scrollTop = 0; }
}

// 開啟「選擇評論的立場」彈窗
async function openReviewSkillsModal() {
    await loadReviewSkills();
    // 兩個附加選項的狀態同樣保存在專案中
    const incEl = qs('#review-include-custom');
    const finEl = qs('#review-final-synthesis');
    if (incEl) incEl.checked = state.reviewIncludeCustom !== false;
    if (finEl) finEl.checked = state.reviewFinalSynthesis !== false;
    renderReviewSkillList();
    qs('#modal-review-skills').classList.remove('hidden');
}

// 「選擇評論的立場」彈窗工具列：批次勾選（全選／全放棄／只選字母項目）
function setReviewSkillSelection(mode) {
    if (mode === 'all') {
        state.reviewSelectedSkills = reviewSkills.map(s => s.name);
    } else if (mode === 'none') {
        state.reviewSelectedSkills = [];
    } else { // 'default'：只勾選單一英文字母 + "." 開頭者
        state.reviewSelectedSkills = reviewSkills.filter(s => isDefaultReviewSkill(s.name)).map(s => s.name);
    }
    renderReviewSkillList();
}

/**
 * 兩個模式 Toggle 互斥切換：「使用NovelReviewSkill列表」與「使用者編輯提示詞」只能擇一。
 * @param {'skills'|'custom'} clicked 使用者剛剛點擊的那一個
 * 若使用者把已勾選的那個取消掉，等同切換到另一個模式（不允許兩個都不勾）。
 */
function setReviewMode(clicked) {
    const skillsEl = qs('#review-use-skills');
    const customEl = qs('#review-use-custom');
    if (!skillsEl || !customEl) return;
    // 以「剛點擊者是否被勾起」決定最終模式：勾起就選它，取消勾選就切到另一個
    const useSkills = (clicked === 'skills') ? skillsEl.checked : !customEl.checked;
    skillsEl.checked = useSkills;
    customEl.checked = !useSkills;
    state.reviewUseSkills = useSkills;
    state.reviewUseCustom = !useSkills;
}

// 開啟「評論小說」彈窗，載入使用者自訂提示詞與兩個模式開關
function openReviewModal() {
    // 預設文件名稱為目前小說名稱
    const bookTitle = (state.bookTitle || '').trim() || '未命名小說';
    const docNameEl = qs('#review-doc-name');
    if (!docNameEl.value) docNameEl.value = bookTitle;

    const userReqEl = qs('#review-user-request');
    if (userReqEl) userReqEl.value = getReviewCustomPrompt();

    // 兩個模式 Toggle 互斥，預設為「使用NovelReviewSkill列表」
    const skillsEl = qs('#review-use-skills');
    const customEl = qs('#review-use-custom');
    const useSkills = state.reviewUseSkills !== false;
    if (skillsEl) skillsEl.checked = useSkills;
    if (customEl) customEl.checked = !useSkills;
    state.reviewUseSkills = useSkills;
    state.reviewUseCustom = !useSkills;

    // 先把清單讀回來（讓計數與後續評審流程可直接使用），失敗不阻擋彈窗開啟
    loadReviewSkills();

    qs('#modal-review').classList.remove('hidden');
}

/**
 * 「重置評論提示詞」：把「使用者編輯提示詞」欄位還原為程式預設骨架。
 * NovelReviewSkill 的 .md 由使用者自行維護檔案，不在此重置範圍內。
 */
function resetReviewPrompt() {
    const userReqEl = qs('#review-user-request');
    if (!userReqEl) return;
    if (!confirm('確定將「使用者編輯提示詞」重置為程式預設骨架？目前的修改將被覆蓋。')) return;
    userReqEl.value = REVIEW_CUSTOM_DEFAULT_PROMPT;
    state.reviewCustomPrompt = REVIEW_CUSTOM_DEFAULT_PROMPT;
    appendLog('♻️ 已將「使用者編輯提示詞」重置為預設骨架。');
}

// 使用者在「使用者編輯提示詞」欄位輸入時，即時保存到專案狀態，確保不遺失
function onReviewRequestInput() {
    const userReqEl = qs('#review-user-request');
    if (userReqEl) state.reviewCustomPrompt = userReqEl.value;
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

// 評論「目前正在編輯中」的整本小說：組成全文後交給 runReviewJob 執行評審
async function reviewCurrentNovel() {
    const bookTitle = (state.bookTitle || '').trim() || '未命名小說';
    qs('#review-doc-name').value = bookTitle;
    const fullText = assembleCurrentNovelText();
    await runReviewJob(fullText, bookTitle);
}

// 評論使用者選取的外部 .txt/.md 檔案（可多選），逐一讀取、評審並自動匯出結果
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

// 將一段文字附加到「AI 評審意見」輸出框，並自動捲動到底部
function appendReviewFeedback(text) {
    const el = qs('#review-ai-feedback');
    if (!el) return;
    if (el.value && !el.value.endsWith('\n')) el.value += '\n';
    el.value += text;
    el.scrollTop = el.scrollHeight;
}

/**
 * 執行一次評審任務。
 * 評審清單由兩個 Toggle 決定：
 *   - 「使用NovelReviewSkill列表」：取 NovelReviewSkill 目錄中被勾選的 .md 當成多位評審。
 *   - 「使用者編輯提示詞」：把上方文字框的自訂提示詞當成一位評審。
 *   （在立場彈窗中另有「加入評論使用者自訂提示詞」，可在使用 Skill 列表時額外併入自訂提示詞）
 * 全部評審跑完後，若勾選「整合成一份最終評審意見」，會再請 AI 統整一次。
 * @param {string} fullText 待審稿件全文
 * @param {string} docName  文件名稱
 * @param {{autoExport?: boolean}} [opts] autoExport: 評審完成後是否自動匯出合併 .md
 */
async function runReviewJob(fullText, docName, opts = {}) {
    const autoExport = !!opts.autoExport;

    // 先把欄位目前內容保存回專案狀態，確保用到的是最新修改
    onReviewRequestInput();

    const useSkills = qs('#review-use-skills') ? qs('#review-use-skills').checked : true;
    const useCustom = qs('#review-use-custom') ? qs('#review-use-custom').checked : false;
    state.reviewUseSkills = useSkills;
    state.reviewUseCustom = useCustom;

    // 組出這次要跑的評審清單：[{ label, prompt }]
    const jobs = [];
    if (useSkills) {
        await loadReviewSkills();
        const selected = state.reviewSelectedSkills || [];
        reviewSkills.forEach(s => {
            if (!selected.includes(s.name)) return;
            if (!(s.content || '').trim()) {
                appendLog(`⚠️ 略過【${s.label}】：提示詞內容為空。`);
                return;
            }
            jobs.push({ label: s.label, prompt: s.content });
        });
    }
    // 自訂提示詞：勾選「使用者編輯提示詞」，或在使用 Skill 列表時勾選了「加入評論使用者自訂提示詞」
    const includeCustom = useCustom || (useSkills && state.reviewIncludeCustom !== false);
    if (includeCustom) {
        const customPrompt = (qs('#review-user-request').value || '').trim() || getReviewCustomPrompt();
        if (customPrompt.trim()) jobs.push({ label: '使用者自訂提示詞', prompt: customPrompt });
    }

    if (!jobs.length) {
        alert('❌ 沒有任何可用的評審立場。請勾選「使用NovelReviewSkill列表」並在列表中選取項目，或改用「使用者編輯提示詞」。');
        return;
    }

    appendLog(`🎯 本次共有 ${jobs.length} 位評審立場，將依序執行。`);
    const collected = []; // { label, text }：蒐集每位評審的全文，供最終整合與匯出使用
    for (const job of jobs) {
        const text = await runSingleReview(fullText, docName, job.prompt, job.label);
        collected.push({ label: job.label, text });
    }

    // 是否再請 AI 整合成一份「最終評審意見」（預設開啟）
    let finalText = '';
    const doSynthesis = state.reviewFinalSynthesis !== false;
    if (doSynthesis && collected.length > 1) {
        appendLog('🎯 開始整理「最終評審意見」...');
        finalText = await runFinalSynthesis(docName, collected);
    }
    appendLog('✅ 所有評審立場與最終評審意見皆已完成。');

    if (autoExport) {
        // 一律匯出「單一份」合併 .md（各立場 + 最終評審意見）
        const sections = collected.map(c => '## 【' + c.label + '】\n\n' + c.text + '\n').join('\n---\n\n');
        let md = '# 🎯 小說評審報告：' + docName + '\n\n' + sections;
        if (finalText) md += '\n\n---\n\n## 【最終評審意見】\n\n' + finalText + '\n';
        const filename = `${sanitizeFilename(docName)}_評審報告.md`;
        downloadMarkdown(filename, md);
        appendLog(`📤 已自動匯出合併評審報告：${filename}`);
    }
}

// 以指定立場的提示詞（userRequest）呼叫 AI 對稿件（fullText）進行單一次評審，並將結果附加到輸出框
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
    const synthesisInstructions = `你是一位經驗豐富的出版總監，收到了以下 ${collected.length} 位不同立場的評審針對同一份稿件所寫的評論意見（各自代表完全不同的審讀角度）。

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

// 匯出目前評論小說彈窗中的內容（提示詞 + AI 評審意見）為 .md 檔並下載
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

// 跳至評論小說彈窗中搜尋結果的第 idx 筆（可循環），並選取、捲動至可視範圍
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

// 開啟「多文改寫」彈窗，若使用者指令欄位為空則填入預設範例提示詞
// ── 多文改寫：使用者指令範本 ──
const REWRITE_PRESETS = {
    // 小說視角轉換的機械式改寫工具
    perspective: `你是一個「小說視角轉換」的機械式改寫工具。請將提供的文本進行敘事視角轉換，規則如下：
1. 只做視角與人稱的機械式轉換，不得增刪劇情、不得改寫對白內容、不得添加或刪除任何情節與細節。
2. 預設將「第一人稱（我）」轉換為「第三人稱（以主角姓名或他／她稱呼）」；若原文已是第三人稱，則反向轉為第一人稱。
3. 對應調整所有人稱代名詞，以及視角所及的感官、心理描述之歸屬，使其在新視角下語意通順。
4. 對白（引號內文字）維持原樣，只調整對白以外的敘述人稱。
5. 保持原文的段落結構、標點與用字風格，僅更動與視角相關的字詞。
6. 全部使用繁體中文，禁止使用中文簡體字。直接輸出轉換後的完整文本，不要加任何說明或前言。`,

    // 日文歌詞翻譯成羅馬拼音 + 繁體中文
    'jp-lyrics': `你是一個日文歌詞翻譯工具。請將提供的日文歌詞「逐行」處理，每一行日文歌詞都輸出以下三行：
1. 第一行：原始日文歌詞。
2. 第二行：該行的羅馬拼音（Romaji，採 Hepburn 式，單字之間以空白分隔）。
3. 第三行：該行的繁體中文翻譯（意譯，力求自然通順且貼近原意）。
每處理完一行歌詞後空一行，再處理下一行。規則：
- 保留原文的分行與段落（例如主歌、副歌）結構。
- 專有名詞、擬聲詞可保留原樣並於繁體中文行中適度註解。
- 所有中文一律使用繁體中文，禁止使用中文簡體字。
- 直接輸出結果，不要加任何額外說明或前言。`
};

// ── 網路搜尋並依序改寫：使用者指令範本（{topic} 會被逐項主題替換）──
const WEBRE_PRESETS = {
    // 混合真實歷史與合理想像的感人短篇
    'history-fiction': `請以當時在場人士的第一人稱視角，寫一篇混合真實歷史與合理想像的感人短篇故事。
主題：{topic}
網路搜尋資料：{context}
寫作要求：
1. 選擇最適合的「在場人士」視角（例如：詩詞中的主角、好友、船夫、侍女、同行友人、目擊者等），讓敘述者真正身處事件現場。
2. 先找出這首詩的「詩眼」或最動人的金句，以此作為故事的情感核心與高潮。
3. 深入分析詩中「人事時地物」的關聯性，找出合理的交集點。
4. 以具體的畫面與情境描寫作為故事開頭。
5. 融合真實歷史與想像，營造強烈情感。
6. 包含自然生動的對話。
7. 字數約 1000~1800 字。
8. 最後自然列出主要參考來源。
請直接開始撰寫故事，不要加入任何解說或分析。`,

    // 將搜尋回傳資料再次排除不相關內容並以條列式顯示
    'filter-list': `以下是針對主題「{topic}」的網路搜尋回傳資料，內容通常龐雜且夾帶許多不相關的雜訊。請執行「二次篩選與整理」：
1. 僅保留與主題「{topic}」直接相關的資訊，徹底排除廣告、導覽列、版權宣告、無關連結、重複內容與離題段落。
2. 將保留下來的重點整理成條列式，每一條聚焦一個獨立事實或重點，力求精簡。
3. 相似或重複的資訊請合併為同一條，避免冗餘。
4. 若資料中有明確的數據、日期、人名、地點，請完整保留於條列中。
5. 若某些資訊可信度存疑或彼此矛盾，請在該條末尾以括號註明（例如：資料來源說法不一）。
6. 全部使用繁體中文，禁止使用中文簡體字。直接輸出條列式結果，不要加任何開場白。`
};

// 共用：把選定的指令範本填入指定 textarea（若已有內容先確認），套用後把下拉選單復位以便再次選取
function applyPresetToTextarea(selectEl, textareaSel, presetMap) {
    const key = selectEl.value;
    if (!key) return;
    const preset = presetMap[key];
    const ta = qs(textareaSel);
    if (preset && ta) {
        if (!ta.value.trim() || confirm('這會覆蓋目前「使用者指令」欄位的內容，確定套用此範本？')) {
            ta.value = preset;
        }
    }
    selectEl.value = ''; // 復位，讓同一範本可再次被選取套用
}

function onRewritePresetChange(e) {
    applyPresetToTextarea(e.target, '#rewrite-user-request', REWRITE_PRESETS);
}

function onWebRewritePresetChange(e) {
    applyPresetToTextarea(e.target, '#webre-user-request', WEBRE_PRESETS);
}

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

// 依原始檔名產生改寫後的輸出檔名（保留副檔名，主檔名末尾加上「_改寫」）
function buildRewrittenName(origName) {
    // 保留原副檔名，主檔名末尾補 _改寫
    const m = origName.match(/^(.*)\.(txt|md)$/i);
    if (!m) return origName + '_改寫';
    return `${m[1]}_改寫.${m[2]}`;
}

// 繪製多文改寫彈窗右側的待改寫檔案清單（含勾選框與狀態文字）
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

// 將清單中所有檔案的勾選狀態一次設為 v（true=全選, false=全不選）
function setAllRewriteFilesChecked(v) {
    rewriteFiles.forEach(x => x.checked = !!v);
    renderRewriteFileList();
}
// 反轉清單中每個檔案目前的勾選狀態
function invertRewriteFilesChecked() {
    rewriteFiles.forEach(x => x.checked = !x.checked);
    renderRewriteFileList();
}
// 清空整個待改寫檔案清單（改寫進行中時禁止清空，會先跳確認視窗）
function clearRewriteFiles() {
    if (rewriteRunning) { alert('目前正在改寫中，請等改寫完成後再清空。'); return; }
    if (!rewriteFiles.length) return;
    if (!confirm(`確定要清空清單中的 ${rewriteFiles.length} 個檔案嗎？`)) return;
    rewriteFiles = [];
    renderRewriteFileList();
}

// 依序改寫所有已勾選的檔案：讀取內容 → （可選）網路搜尋補充資料 → 呼叫 AI 改寫 → 自動匯出結果
// 支援 DuckDuckGo / Tavily 兩種搜尋引擎，也可直接提供指定網址清單
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

網路搜尋資料：{context}

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
/**
 * 「🖋️內文」欄：節標題／內文之間的拖曳分隔線。
 * 拖曳時把兩個 textarea 都改成固定像素高度（flex:0 0 Npx），跳脫預設的 1/3｜2/3 比例，
 * 做法與 initWebRewriteResizer() / review-resizer 相同。
 */
function initEditorSideResizer() {
    const resizer = qs('#editor-side-resizer');
    const topBox = qs('#active-section-title');
    const botBox = qs('#main-editor');
    const container = qs('#editor-side');
    if (!resizer || !topBox || !botBox || !container) return;

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        resizer.classList.add('resizing');
        document.body.style.userSelect = 'none';

        const containerRect = container.getBoundingClientRect();
        const resizerH = resizer.offsetHeight;

        const onMove = (ev) => {
            const relY = ev.clientY - containerRect.top;
            const total = containerRect.height - resizerH;
            const minH = 60;
            const topH = Math.max(minH, Math.min(relY, total - minH));
            const botH = total - topH;
            topBox.style.flex = `0 0 ${topH}px`;
            botBox.style.flex = `0 0 ${botH}px`;
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


// ============================================================================
// ✨ 選取文字 AI 加工（擴寫 Alt+P／精簡 Alt+S／對白 Alt+T／視覺化 Alt+A）
// ============================================================================
// 待處理段落在上下文中的標記符號（需與後端 build_refine_text_prompt 一致）
const REFINE_SEL_START = '⟦選取★開始⟧';
const REFINE_SEL_END = '⟦選取★結束⟧';

// 四種模式設定：熱鍵字母、彈窗標題、目標字數的預設倍率
const REFINE_MODES = {
    expand: { key: 'p', title: '✨ 擴寫／優化', multiplier: 2 },
    condense: { key: 's', title: '✂️ 精簡', multiplier: 0.5 },
    dialogue: { key: 't', title: '💬 對白優化', multiplier: 1 },
    visual: { key: 'q', title: '🎬 視覺化改寫', multiplier: 1 }
};
// 熱鍵字母 → 模式名稱（Alt+A 已改為呼叫「快顯功能表選單」，故視覺化改寫改用 Alt+Q）
const REFINE_HOTKEY_MAP = { p: 'expand', s: 'condense', t: 'dialogue', q: 'visual' };

// 目前這次加工的情境（開啟彈窗時鎖定，套用結果時使用）
let refineCtx = null;

// 確保 state.refineParams 存在，並為四種模式補上預設結構（讀取舊小說時也適用）
function ensureRefineParams() {
    if (!state.refineParams || typeof state.refineParams !== 'object') state.refineParams = {};
    Object.keys(REFINE_MODES).forEach(mode => {
        if (state.refineParams[mode] === undefined) {
            state.refineParams[mode] = null; // null 代表「尚未設定」，開啟時會繼承全域選擇
        }
    });
}

// 熱鍵處理：僅在焦點位於四個目標框、且有反白選取時才攔截
function onRefineHotkey(e) {
    if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const mode = REFINE_HOTKEY_MAP[(e.key || '').toLowerCase()];
    if (!mode) return;

    const field = detectRefineField();
    if (!field) return; // 焦點不在目標框 → 完全不理會，不 preventDefault

    e.preventDefault();
    e.stopPropagation();

    const el = field.el;
    if (el.selectionStart === el.selectionEnd) {
        alert('請先在輸入框中反白選取一段文字，再按加工熱鍵。');
        return;
    }
    field.selStart = el.selectionStart;
    field.selEnd = el.selectionEnd;
    field.fullValue = el.value;
    field.selectedText = el.value.slice(field.selStart, field.selEnd);
    openRefineModal(mode, field);
}

// 「全畫面編輯」彈窗是否正開啟中
function isFullscreenEditOpen() {
    const m = qs('#modal-fullscreen-edit');
    return !!m && !m.classList.contains('hidden');
}

/**
 * 判斷目前焦點是否落在「全畫面編輯」彈窗的欄位上。
 * 是 → 回傳 { type:'fs_title'|'fs_content', el, ci, si }；否 → null。
 */
function detectActiveFsField() {
    if (!isFullscreenEditOpen()) return null;
    const el = document.activeElement;
    if (!el || !el.matches || !el.matches('#fsedit-body textarea')) return null;
    const ci = parseInt(el.dataset.ci, 10);
    const si = parseInt(el.dataset.si, 10);
    if (!state.chapters?.[ci]?.sections?.[si]) return null;
    return { type: el.dataset.field === 'title' ? 'fs_title' : 'fs_content', el, ci, si };
}

/**
 * 依目前情境取得要加工的欄位。
 * ⚠️ 全畫面編輯彈窗開啟時「只認彈窗內的欄位」，確保加工結果不會誤寫到主介面的框。
 */
function detectRefineField() {
    if (isFullscreenEditOpen()) return detectActiveFsField();
    return detectActiveField();
}

// 判斷目前焦點在哪一個目標框，回傳 { type, el, chapterIndex? }；不是目標框則回傳 null
function detectActiveField() {
    const el = document.activeElement;
    if (!el || el.tagName !== 'TEXTAREA') return null;

    if (el.id === 'story-premise') return { type: 'premise', el };
    if (el.id === 'main-editor') {
        const sec = getActiveSection();
        return sec ? { type: 'content', el } : null;
    }
    if (el.id === 'active-section-title') {
        const sec = getActiveSection();
        return sec ? { type: 'section_outline', el } : null;
    }
    if (el.classList.contains('chapter-desc')) {
        const card = el.closest('.chapter-card');
        const list = qs('#chapter-list');
        if (!card || !list) return null;
        const chapterIndex = Array.prototype.indexOf.call(list.children, card);
        if (chapterIndex < 0 || !state.chapters[chapterIndex]) return null;
        return { type: 'chapter', el, chapterIndex };
    }
    return null;
}

// 取得目前選取中的小節物件（無則 null）
function getActiveSection() {
    const ch = state.chapters[state.activeIndex.chapter];
    return ch ? ch.sections[state.activeIndex.section] || null : null;
}

// 在整段文字中，以標記包住選取範圍，讓 AI 知道要處理哪一段
function markSelection(full, s, e) {
    return full.slice(0, s) + REFINE_SEL_START + full.slice(s, e) + REFINE_SEL_END + full.slice(e);
}

// 依框的種類組出送給 AI 的上下文字串
function assembleRefineContext(field) {
    const { type, selStart: s, selEnd: e, fullValue } = field;

    if (type === 'premise') {
        return '【故事粗綱全文】\n' + markSelection(fullValue, s, e);
    }

    if (type === 'chapter') {
        const ci = field.chapterIndex;
        const ch = state.chapters[ci];
        const prev = state.chapters[ci - 1];
        const next = state.chapters[ci + 1];
        const parts = [];
        parts.push('【故事粗綱】\n' + (state.storyPremise || '（未撰寫）'));
        if (prev) parts.push(`【上一章】第${ci}章 ${prev.title || ''}\n${prev.description || ''}`);
        parts.push(`【本章標題】第${ci + 1}章 ${ch.title || ''}`);
        parts.push('【本章描述】\n' + markSelection(fullValue, s, e));
        if (next) parts.push(`【下一章】第${ci + 2}章 ${next.title || ''}\n${next.description || ''}`);
        return parts.join('\n\n');
    }

    if (type === 'section_outline') {
        const ci = state.activeIndex.chapter, si = state.activeIndex.section;
        const ch = state.chapters[ci];
        const prevSec = ch.sections[si - 1];
        const nextSec = ch.sections[si + 1];
        const parts = [];
        parts.push(`【本章描述】第${ci + 1}章 ${ch.title || ''}\n${ch.description || ''}`);
        if (prevSec) parts.push(`【上一節大綱】${prevSec.title || ''}`);
        parts.push('【本節大綱】\n' + markSelection(fullValue, s, e));
        if (nextSec) parts.push(`【下一節大綱】${nextSec.title || ''}`);
        return parts.join('\n\n');
    }

    if (type === 'content') {
        const sec = getActiveSection();
        const parts = [];
        parts.push('【本節大綱】' + (sec ? (sec.title || '') : ''));
        parts.push('【本節內文全文】\n' + markSelection(fullValue, s, e));
        return parts.join('\n\n');
    }

    // 全畫面編輯彈窗內的兩個欄位：小節位置由 field.ci / field.si 指定（與主介面目前選取的小節無關）
    if (type === 'fs_title' || type === 'fs_content') {
        const ch = state.chapters[field.ci];
        const sec = ch.sections[field.si];
        const parts = [];
        parts.push(`【本章描述】第${field.ci + 1}章 ${ch.title || ''}\n${ch.description || ''}`);
        if (type === 'fs_title') {
            parts.push('【本節大綱】\n' + markSelection(fullValue, s, e));
        } else {
            parts.push('【本節大綱】' + (sec.title || ''));
            parts.push('【本節內文全文】\n' + markSelection(fullValue, s, e));
        }
        return parts.join('\n\n');
    }
    return markSelection(fullValue, s, e);
}

// 以角色卡完整資料組出送給後端的 characters 陣列（沿用內文生成的作法）
function buildCharactersPayload() {
    return state.characters
        .map(c => {
            const id = getCharId(c);
            const found = cloudCharacters.find(cc => cc.id === id);
            if (!found) return null;
            return { ...found.card_json, role_name: getCharRoleName(c) };
        })
        .filter(Boolean);
}

// 用選項名稱陣列填入下拉選單（含「無」選項），並嘗試選回指定值
function fillDropdown(sel, names, selectedValue, emptyLabel) {
    if (!sel) return;
    sel.innerHTML = `<option value="">${emptyLabel}</option>` +
        names.map(n => `<option value="${n}">${n}</option>`).join('');
    sel.value = selectedValue || '';
}

// 讀取彈窗目前的參數（供記憶用）
function readRefineModalParams() {
    return {
        extra: qs('#refine-extra').value,
        styles: [qs('#refine-style-1').value, qs('#refine-style-2').value, qs('#refine-style-3').value],
        sample: qs('#refine-sample-select').value,
        modelOptions: qs('#refine-model-options-select').value
    };
}

// 把彈窗目前參數存回 state.refineParams[mode]（隨小說存檔）
function saveRefineParams(mode) {
    ensureRefineParams();
    state.refineParams[mode] = readRefineModalParams();
}

// 由彈窗選取的風格/範本名稱解析出 writer_settings（獨立於左側全域下拉，不互相污染）
function resolveRefineWriterSettings() {
    const styleList = (window.WriterSettingsApp && WriterSettingsApp.styleList) || [];
    const sampleList = (window.WriterSettingsApp && WriterSettingsApp.sampleList) || [];
    const names = [qs('#refine-style-1').value, qs('#refine-style-2').value, qs('#refine-style-3').value];
    const parts = [];
    names.forEach(n => {
        if (!n) return;
        const it = styleList.find(i => i.name === n);
        if (it && it.content && !parts.includes(it.content)) parts.push(it.content);
    });
    const smp = sampleList.find(i => i.name === qs('#refine-sample-select').value);
    return {
        style: parts.length ? parts.join('\n\n') : null,
        sample: smp ? smp.content : null
    };
}

// 開啟加工彈窗：填入原文、目標字數、記憶參數（首次繼承左側全域選擇）
function openRefineModal(mode, field) {
    ensureRefineParams();
    refineCtx = { mode, field };
    const cfg = REFINE_MODES[mode];

    qs('#refine-title').textContent = cfg.title;
    qs('#refine-source').value = field.selectedText;
    qs('#refine-preview').value = '';

    // 目標字數：預設 = 選取字數 × 該模式倍率（可手改，不持久化絕對字數）
    qs('#refine-target-words').value = Math.max(10, Math.round(field.selectedText.length * cfg.multiplier));

    // 準備下拉選項來源
    const styleNames = ((window.WriterSettingsApp && WriterSettingsApp.styleList) || []).map(i => i.name);
    const sampleNames = ((window.WriterSettingsApp && WriterSettingsApp.sampleList) || []).map(i => i.name);
    const moNames = (window.getModelOptionsList && window.getModelOptionsList()) || [];

    // 取記憶參數；若該模式尚未設定過，改為繼承左側全域目前選擇（Q11）
    let p = state.refineParams[mode];
    if (!p) {
        p = {
            extra: '',
            styles: [
                qs('#writer-style-select-1')?.value || '',
                qs('#writer-style-select-2')?.value || '',
                qs('#writer-style-select-3')?.value || ''
            ],
            sample: qs('#writer-sample-select')?.value || '',
            modelOptions: qs('#model-options-select')?.value || ''
        };
    }

    qs('#refine-extra').value = p.extra || '';
    fillDropdown(qs('#refine-style-1'), styleNames, p.styles?.[0], '無');
    fillDropdown(qs('#refine-style-2'), styleNames, p.styles?.[1], '無');
    fillDropdown(qs('#refine-style-3'), styleNames, p.styles?.[2], '無');
    fillDropdown(qs('#refine-sample-select'), sampleNames, p.sample, '無');
    fillDropdown(qs('#refine-model-options-select'), moNames, p.modelOptions, '預設');

    // 尚未生成 → 停用套用按鈕
    qs('#btn-refine-replace').disabled = true;
    qs('#btn-refine-append').disabled = true;

    qs('#modal-refine').classList.remove('hidden');
}

function closeRefineModal() {
    // 關閉前也把目前參數記起來（即使沒生成也保留使用者的設定）
    if (refineCtx) saveRefineParams(refineCtx.mode);
    qs('#modal-refine').classList.add('hidden');
    refineCtx = null;
}

// 呼叫 AI 生成加工結果，填入預覽區
async function runRefineGenerate() {
    if (!refineCtx) return;
    const { mode, field } = refineCtx;
    saveRefineParams(mode);

    const targetWords = Math.max(1, parseInt(qs('#refine-target-words').value) || 0);
    const payload = {
        mode,
        selected_text: field.selectedText,
        context_text: assembleRefineContext(field),
        extra_instruction: qs('#refine-extra').value || '',
        target_words: targetWords,
        characters: buildCharactersPayload(),
        model: state.currentModel || qs('#model-select')?.value || 'gemma4',
        model_options: (window.resolveModelOptionsByName &&
            window.resolveModelOptionsByName(qs('#refine-model-options-select').value)) || null,
        writer_settings: resolveRefineWriterSettings()
    };

    const genBtn = qs('#btn-refine-generate');
    genBtn.disabled = true;
    qs('#refine-preview').value = '⏳ AI 加工中，請稍候…（過程 LOG 顯示在主 LOG 欄）';
    appendLog(`✨ 開始「${REFINE_MODES[mode].title}」，選取 ${field.selectedText.length} 字，目標約 ${targetWords} 字。`);

    try {
        const res = await callDebugServerAsync('/api/refine_text_async', payload);
        if (res && res.content) {
            qs('#refine-preview').value = res.content.trim();
            qs('#btn-refine-replace').disabled = false;
            qs('#btn-refine-append').disabled = false;
            appendLog('✅ 加工完成，請於彈窗檢視並選擇「取代選取」或「附加在選取之後」。');
        } else {
            qs('#refine-preview').value = '❌ AI 未回傳有效內容，請查看 LOG 或重試。';
            appendLog('❌ 加工失敗：AI 未回傳有效內容。');
        }
    } catch (e) {
        qs('#refine-preview').value = '❌ 發生錯誤：' + e.message;
        appendLog('❌ 加工發生錯誤：' + e.message);
    } finally {
        genBtn.disabled = false;
    }
}

// 把預覽結果套回原框：applyMode='replace' 取代選取／'append' 附加在選取之後
function applyRefineResult(applyMode) {
    if (!refineCtx) return;
    const result = qs('#refine-preview').value.trim();
    if (!result) { alert('目前沒有可套用的加工結果。'); return; }

    const { mode, field } = refineCtx;
    const { fullValue, selStart: s, selEnd: e } = field;

    // 在回寫的文字前後加上明顯的分隔標記，讓作者一眼就能看出 AI 內容的起訖位置。
    // 標記本身前後都帶換行，確保一定會自成一行，不會黏在原文尾巴或新內容開頭。
    const marks = (applyMode === 'replace')
        ? { start: '\n---從此處取代---\n', end: '\n---取代結束---\n' }
        : { start: '\n---從此處附加---\n', end: '\n---附加結束---\n' };
    const marked = marks.start + result + marks.end;

    const newFull = (applyMode === 'replace')
        ? fullValue.slice(0, s) + marked + fullValue.slice(e)         // 取代選取段落
        : fullValue.slice(0, e) + marked + fullValue.slice(e);        // 附加在選取之後

    writeBackRefine(field, newFull);
    saveRefineParams(mode);
    appendLog(`📝 已${applyMode === 'replace' ? '取代選取' : '附加於選取之後'}（${REFINE_MODES[mode].title}）。`);
    qs('#modal-refine').classList.add('hidden');
    refineCtx = null;
}

// 依框的種類把新文字寫回資料模型並重繪畫面
function writeBackRefine(field, newFull) {
    if (field.type === 'premise') {
        state.storyPremise = newFull;
        qs('#story-premise').value = newFull;
    } else if (field.type === 'chapter') {
        state.chapters[field.chapterIndex].description = newFull;
        renderChapters();
    } else if (field.type === 'section_outline') {
        const sec = getActiveSection();
        if (sec) sec.title = newFull;
        renderChapters();
        renderEditor();
    } else if (field.type === 'content') {
        const sec = getActiveSection();
        if (sec) sec.content = newFull;
        renderEditor();
        renderChapters();
    } else if (field.type === 'fs_title' || field.type === 'fs_content') {
        // 全畫面編輯彈窗：只寫回該小節與彈窗內的 textarea。
        // ⚠️ 不重建整份橫行（renderFullscreenEditor），否則使用者調過的行高會被重置；
        //    主介面的完整重繪一律延到關閉彈窗時再做（沿用 onFullscreenEditInput 的策略）。
        const sec = state.chapters?.[field.ci]?.sections?.[field.si];
        if (!sec) return;
        if (field.type === 'fs_title') sec.title = newFull; else sec.content = newFull;
        if (field.el) field.el.value = newFull;
        fsSyncToMainEditor(field.ci, field.si);
    }
}


// ============================================================================
// 🔎 全面搜尋（Ctrl+Shift+F）
// ============================================================================
// 模仿 IDE 的全域搜尋：一次搜尋粗綱／章標題／章描述／小節大綱／內文／作者備註六大項目，
// 依項目分組列出命中結果，點擊任一結果即可跳到對應編輯欄位並反白該關鍵字。
// 為避免資料量大時卡頓，每個主要項目預設最多只取 GSEARCH_LIMIT 筆，
// 若仍有未搜尋完的項目會顯示「繼續搜尋」讓使用者手動取回全部結果。

// 每個主要項目的預設命中上限
const GSEARCH_LIMIT = 20;
// 結果預覽時，關鍵字前後各取幾個字
const GSEARCH_CONTEXT = 10;

// 六大主要項目定義（顯示順序即為此陣列順序）
const GSEARCH_CATS = [
    { key: 'premise', label: '📝 粗綱' },
    { key: 'chapterTitle', label: '📖 章標題' },
    { key: 'chapterDesc', label: '📖 章描述' },
    { key: 'sectionTitle', label: '📑 小節大綱' },
    { key: 'content', label: '🖋️ 內文' },
    { key: 'authorNotes', label: '🗒️ 作者備註' }
];

// 搜尋狀態：results 依項目分組存放命中項目，truncated 記錄該項目是否因上限而中斷
const gsearchState = {
    query: '',
    unlimited: false,
    results: {},
    truncated: {}
};

// HTML 跳脫，避免搜尋到的文字含 < > & 時破壞版面
function gsEscapeHtml(s) {
    return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// 正規表示式跳脫，讓使用者輸入的關鍵字一律以「純文字」比對
function gsEscapeRegExp(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// 取出關鍵字前後各 GSEARCH_CONTEXT 個字作為預覽（換行一律轉空白，維持單行顯示）
function gsMakePreview(text, start, len) {
    const from = Math.max(0, start - GSEARCH_CONTEXT);
    const to = Math.min(text.length, start + len + GSEARCH_CONTEXT);
    const flat = (s) => s.replace(/\s+/g, ' ');
    return {
        before: (from > 0 ? '…' : '') + flat(text.slice(from, start)),
        keyword: flat(text.slice(start, start + len)),
        after: flat(text.slice(start + len, to)) + (to < text.length ? '…' : '')
    };
}

// 結果所在位置的標籤文字（例：第3章 第2節）
function gsLocationLabel(item) {
    if (item.ci === undefined) return '';
    if (item.si === undefined) return `第${item.ci + 1}章`;
    return `第${item.ci + 1}章 第${item.si + 1}節`;
}

/**
 * 執行全面搜尋。
 * @param {boolean} unlimited true = 不套用每項目 20 筆上限，一次搜尋到底（「繼續搜尋」用）
 */
function runGlobalSearch(unlimited = false) {
    const query = qs('#gsearch-input').value;
    gsearchState.query = query;
    gsearchState.unlimited = unlimited;
    gsearchState.results = {};
    gsearchState.truncated = {};
    GSEARCH_CATS.forEach(c => { gsearchState.results[c.key] = []; gsearchState.truncated[c.key] = false; });

    if (!query) {
        renderGlobalSearchResults();
        return;
    }

    const lq = query.toLowerCase();
    const limit = unlimited ? Infinity : GSEARCH_LIMIT;

    // 於單一欄位文字中找出所有命中位置，並在達到上限時標記 truncated
    const scan = (catKey, text, meta) => {
        if (!text) return;
        const lo = String(text).toLowerCase();
        let i = 0;
        while ((i = lo.indexOf(lq, i)) !== -1) {
            if (gsearchState.results[catKey].length >= limit) {
                gsearchState.truncated[catKey] = true;
                return;
            }
            gsearchState.results[catKey].push({
                cat: catKey, ...meta,
                start: i, end: i + query.length,
                preview: gsMakePreview(String(text), i, query.length)
            });
            i += lq.length;
        }
    };

    scan('premise', state.storyPremise, {});
    (state.chapters || []).forEach((ch, ci) => {
        scan('chapterTitle', ch.title, { ci });
        scan('chapterDesc', ch.description, { ci });
        (ch.sections || []).forEach((sec, si) => {
            scan('sectionTitle', sec.title, { ci, si });
            scan('content', sec.content, { ci, si });
        });
    });
    scan('authorNotes', state.authorNotes, {});

    renderGlobalSearchResults();
}

// 依 gsearchState 重新繪製結果清單與狀態列
function renderGlobalSearchResults() {
    const box = qs('#gsearch-results');
    const statusEl = qs('#gsearch-status');
    const moreBtn = qs('#gsearch-btn-more');

    let total = 0;
    let anyTruncated = false;
    let html = '';

    GSEARCH_CATS.forEach(c => {
        const arr = gsearchState.results[c.key] || [];
        const cut = !!gsearchState.truncated[c.key];
        total += arr.length;
        if (cut) anyTruncated = true;

        html += `<div class="gs-cat-header"><span>${c.label}</span>` +
            `<span class="gs-cat-count">${arr.length}${cut ? '+' : ''}</span></div>`;

        arr.forEach((it, idx) => {
            const loc = gsLocationLabel(it);
            html += `<div class="gs-item" data-cat="${c.key}" data-idx="${idx}">` +
                (loc ? `<span class="gs-loc">${gsEscapeHtml(loc)}</span>` : '') +
                `${gsEscapeHtml(it.preview.before)}<mark>${gsEscapeHtml(it.preview.keyword)}</mark>${gsEscapeHtml(it.preview.after)}` +
                `</div>`;
        });
    });

    box.innerHTML = html;

    if (!gsearchState.query) {
        statusEl.textContent = '尚未搜尋';
    } else if (total === 0) {
        statusEl.textContent = '找不到符合的文字';
    } else {
        statusEl.textContent = `共找到 ${total} 個結果` +
            (anyTruncated ? `（部分項目已達 ${GSEARCH_LIMIT} 筆上限）` : '');
    }
    // 只有「還有項目沒搜尋完」時才顯示繼續搜尋鈕
    moreBtn.style.display = anyTruncated ? 'inline-block' : 'none';
}

// 聚焦某個輸入欄位並反白指定範圍，textarea 另外把該位置捲動到視野中央
// query 用來驗證該位置的文字是否仍為關鍵字；預設取全面搜尋的關鍵字，其他模組可自行傳入
function gsFocusAndSelect(el, start, end, query) {
    if (!el) return;

    // 保險：搜尋後若使用者又編輯過該欄位，原本記錄的位置可能已經失效。
    // 先確認該位置的文字仍等於關鍵字，否則不要亂反白，改為提示使用者重新搜尋。
    const q = (query !== undefined ? query : gsearchState.query) || '';
    if (q && (el.value || '').substring(start, end).toLowerCase() !== q.toLowerCase()) {
        el.focus();
        const statusEl = qs('#gsearch-status');
        if (statusEl) statusEl.textContent = '⚠️ 內容已變動，請重新搜尋以更新結果位置';
        return;
    }

    el.focus();
    if (el.tagName === 'TEXTAREA') {
        // 截斷至比對位置量測 scrollHeight（自動考慮 word-wrap），再還原並置中顯示
        const full = el.value;
        el.value = full.substring(0, start);
        const pixelPos = el.scrollHeight;
        el.value = full;
        el.setSelectionRange(start, end);
        requestAnimationFrame(() => {
            el.scrollTop = Math.max(0, pixelPos - el.clientHeight / 2);
        });
    } else {
        try { el.setSelectionRange(start, end); } catch (e) { /* 部分 input 型別不支援 */ }
    }
}

// 若指定的直欄目前是折疊狀態，先展開它（否則跳過去也看不到）
function gsExpandColumn(containerId) {
    const c = qs('#' + containerId);
    if (c && c.classList.contains('collapsed')) {
        c.classList.remove('collapsed');
        if (typeof window.updateGridTemplate === 'function') window.updateGridTemplate();
    }
}

// 點擊搜尋結果 → 跳到對應的編輯欄位並反白關鍵字
function jumpToSearchResult(item) {
    switch (item.cat) {
        case 'premise': {
            gsExpandColumn('story-premise-container');
            gsFocusAndSelect(qs('#story-premise'), item.start, item.end);
            break;
        }
        case 'chapterTitle':
        case 'chapterDesc': {
            const card = qs('#chapter-list').children[item.ci];
            if (!card) return;
            card.scrollIntoView({ block: 'center', behavior: 'smooth' });
            const el = (item.cat === 'chapterTitle')
                ? card.querySelector('.chapter-title-row input[type="text"]')
                : card.querySelector('.chapter-desc');
            gsFocusAndSelect(el, item.start, item.end);
            break;
        }
        case 'sectionTitle': {
            setActive(item.ci, item.si);   // 切換目前編輯中的小節
            gsFocusAndSelect(qs('#active-section-title'), item.start, item.end);
            break;
        }
        case 'content': {
            setActive(item.ci, item.si);
            gsFocusAndSelect(qs('#main-editor'), item.start, item.end);
            break;
        }
        case 'authorNotes': {
            // 作者備註在彈窗內，先開啟彈窗並帶入目前內容
            qs('#author-notes-text').value = state.authorNotes || '';
            qs('#modal-author-notes').classList.remove('hidden');
            gsFocusAndSelect(qs('#author-notes-text'), item.start, item.end);
            break;
        }
    }
}

/**
 * 把六大項目中所有符合的關鍵字全部替換（不分大小寫）。
 * ⚠️ 此操作無法復原，執行前必須先跳出警告讓使用者確認。
 */
function replaceAllGlobalSearch() {
    const query = qs('#gsearch-input').value;
    const replacement = qs('#gsearch-replace-input').value;
    if (!query) { alert('請先在搜尋欄輸入要被替換的關鍵字。'); return; }

    if (!confirm(
        `⚠️ 警告：即將把「粗綱／章標題／章描述／小節大綱／內文／作者備註」中\n` +
        `所有的「${query}」全部替換成「${replacement}」。\n\n` +
        `此操作【無法復原】（不能用 Ctrl+Z 還原），請謹慎使用！\n\n確定要執行嗎？`
    )) return;

    const rx = new RegExp(gsEscapeRegExp(query), 'gi');
    let count = 0;
    // 逐欄替換並累計替換次數
    const replaceIn = (s) => {
        if (!s) return s;
        return String(s).replace(rx, () => { count++; return replacement; });
    };

    state.storyPremise = replaceIn(state.storyPremise);
    (state.chapters || []).forEach(ch => {
        ch.title = replaceIn(ch.title);
        ch.description = replaceIn(ch.description);
        (ch.sections || []).forEach(sec => {
            sec.title = replaceIn(sec.title);
            sec.content = replaceIn(sec.content);
        });
    });
    state.authorNotes = replaceIn(state.authorNotes);

    // 同步畫面（粗綱／章節樹／內文編輯器）
    qs('#story-premise').value = state.storyPremise || '';
    renderChapters();
    renderEditor();

    appendLog(`🔎 全面搜尋：已將「${query}」替換為「${replacement}」，共 ${count} 處。`);
    alert(`✅ 已完成替換，共 ${count} 處。`);

    // 替換後重新搜尋，讓結果清單反映最新狀態
    runGlobalSearch(gsearchState.unlimited);
}

function openGlobalSearchPanel() {
    const panel = qs('#global-search-panel');
    panel.classList.remove('hidden');
    const input = qs('#gsearch-input');
    input.focus();
    input.select();
}

function closeGlobalSearchPanel() {
    qs('#global-search-panel').classList.add('hidden');
}

/**
 * 讓浮動面板可拖曳：按住 header 即可移動 panel。
 * 供「全面搜尋」與「尋找／取代」兩個浮動面板共用。
 */
function makePanelDraggable(panel, header) {
    if (!panel || !header) return;

    header.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const rect = panel.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const offsetY = e.clientY - rect.top;

        const onMove = (ev) => {
            // 限制在視窗範圍內，避免把面板拖出畫面外再也抓不回來
            const x = Math.max(0, Math.min(window.innerWidth - rect.width, ev.clientX - offsetX));
            const y = Math.max(0, Math.min(window.innerHeight - rect.height, ev.clientY - offsetY));
            panel.style.left = x + 'px';
            panel.style.top = y + 'px';
        };
        const onUp = () => {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    });
}

// 初始化全面搜尋：熱鍵、按鈕、結果點擊、拖曳
function initGlobalSearch() {
    // Ctrl+Shift+F 開啟面板（capture 階段攔截，避免被其他監聽器搶先）
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && !e.altKey && (e.key === 'F' || e.key === 'f')) {
            e.preventDefault();
            e.stopPropagation();
            openGlobalSearchPanel();
        }
    }, true);

    qs('#gsearch-btn-run').addEventListener('click', () => runGlobalSearch(false));
    qs('#gsearch-btn-close').addEventListener('click', closeGlobalSearchPanel);
    qs('#gsearch-btn-more').addEventListener('click', () => runGlobalSearch(true));
    qs('#gsearch-btn-replace-all').addEventListener('click', replaceAllGlobalSearch);
    qs('#gsearch-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); runGlobalSearch(false); }
    });

    // 結果清單採事件委派：點擊任一 .gs-item 就跳到該處
    qs('#gsearch-results').addEventListener('click', (e) => {
        const row = e.target.closest('.gs-item');
        if (!row) return;
        const cat = row.getAttribute('data-cat');
        const idx = parseInt(row.getAttribute('data-idx'), 10);
        const item = (gsearchState.results[cat] || [])[idx];
        if (item) jumpToSearchResult(item);
    });

    makePanelDraggable(qs('#global-search-panel'), qs('#gsearch-header'));
}


// ============================================================================
// 🖥️ 全畫面編輯（內文編輯器 → 全畫面編輯）
// ============================================================================
// 提供安靜無干擾的編輯環境：把所有小節攤平成一行一節，
// 每行由左至右為「章編號(直排) / 小節描述 / 內文」，行與行之間可拖曳調整高度。
// 這裡的兩個欄位與主介面的「小節大綱(sec.title)」「內文(sec.content)」是同一份資料，
// 編輯時即時寫回 state；關閉彈窗時再整批重繪主介面。

// 搜尋狀態（比照評論小說彈窗的雙欄搜尋）
let fsEditMatches = [];
let fsEditCurrentMatch = -1;

/**
 * 阿拉伯數字轉繁體中文數字（供「第十五章」這類章編號顯示）。
 * 章數不會太大，支援到千位已綽綽有餘。
 */
function fsNumberToChinese(n) {
    const digits = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
    if (n < 10) return digits[n];
    if (n === 10) return '十';
    if (n < 20) return '十' + (n % 10 ? digits[n % 10] : '');
    if (n < 100) {
        const t = Math.floor(n / 10), r = n % 10;
        return digits[t] + '十' + (r ? digits[r] : '');
    }
    const h = Math.floor(n / 100), rest = n % 100;
    let s = digits[h] + '百';
    if (rest === 0) return s;
    if (rest < 10) return s + '零' + digits[rest];
    return s + fsNumberToChinese(rest);
}

// 橫行的最低高度（內容很短或空白時，至少保留這個高度）
const FS_MIN_ROW_H = 100;

/**
 * 依小節描述／內文的字數「粗估」橫行高度（px）。
 * ⚠️ 這只是還沒完成版面計算前的暫定值，實際高度會由 fsAutoFitRows() 量測後覆寫，
 *    因為真正需要的高度取決於欄寬與換行結果，光靠字數是算不準的。
 */
function fsEstimateRowHeight(sec) {
    const len = Math.max((sec.title || '').length, (sec.content || '').length);
    return Math.max(FS_MIN_ROW_H, Math.round(60 + len * 0.35));
}

/**
 * 依「實際渲染後的文字高度」自動調整每一橫行的高度，讓每個欄位的文字都完整顯示，
 * 使用者不必再一個一個把框拉高。
 *
 * 作法：暫時把 textarea 的高度設為 0，此時 scrollHeight 會等於文字的完整高度，
 *       量到之後還原（高度交還給 flex 的 align-items:stretch 控制），
 *       再把該行高度設成「描述欄與內文欄所需高度的較大值」。
 * 注意：必須在彈窗已顯示（版面寬度已確定）之後才呼叫，否則量不到正確的高度。
 */
function fsAutoFitRows() {
    const body = qs('#fsedit-body');
    if (!body) return;

    body.querySelectorAll('.fs-row').forEach(row => {
        let needed = 0;
        row.querySelectorAll('textarea').forEach(ta => {
            const prev = ta.style.height;
            ta.style.height = '0px';            // 收成 0 才能量到純文字高度
            needed = Math.max(needed, ta.scrollHeight);
            ta.style.height = prev;             // 還原，讓 flex 重新撐滿該行
        });
        // 加上橫行本身的上下 padding 與一點緩衝，避免最後一行被切掉
        const rowPad = 8 + 4;
        row.style.height = Math.max(FS_MIN_ROW_H, needed + rowPad) + 'px';
    });
}

/**
 * 建立全畫面編輯的所有橫行。
 * 每個 textarea 都帶 data-ci / data-si，輸入時即可直接寫回對應的小節。
 */
function renderFullscreenEditor() {
    const body = qs('#fsedit-body');
    body.innerHTML = '';

    (state.chapters || []).forEach((ch, ci) => {
        (ch.sections || []).forEach((sec, si) => {
            const row = document.createElement('div');
            row.className = 'fs-row';
            row.style.height = fsEstimateRowHeight(sec) + 'px';

            // 左：章編號（直排，僅一字寬）
            const chapterCell = document.createElement('div');
            chapterCell.className = 'fs-chapter';
            chapterCell.textContent = `第${fsNumberToChinese(ci + 1)}章`;
            // 用自訂 tooltip 取代原生 title：原生 title 的字級無法用 CSS 控制，
            // 而使用者要求 tooltip 文字改用 --font-size-lg，故改存在 data 屬性，交給 fs-chapter-tooltip 顯示
            chapterCell.dataset.tooltip = `第${ci + 1}章 第${si + 1}節：${ch.title || ''}\n${ch.description || ''}`;

            // 中：小節描述（對應 sec.title）
            const descTa = document.createElement('textarea');
            descTa.className = 'fs-desc';
            descTa.placeholder = '小節描述…';
            descTa.value = sec.title || '';
            descTa.dataset.ci = ci;
            descTa.dataset.si = si;
            descTa.dataset.field = 'title';

            // 右：內文（對應 sec.content）
            const contentTa = document.createElement('textarea');
            contentTa.className = 'fs-content';
            contentTa.placeholder = '內文…';
            contentTa.value = sec.content || '';
            contentTa.dataset.ci = ci;
            contentTa.dataset.si = si;
            contentTa.dataset.field = 'content';

            row.appendChild(chapterCell);
            row.appendChild(descTa);
            row.appendChild(contentTa);
            body.appendChild(row);

            // 每行下方加一條可拖曳的分隔線（用來調整「上方那一行」的高度）
            const resizer = document.createElement('div');
            resizer.className = 'fs-row-resizer';
            resizer.title = '拖曳可調整上方橫行的高度';
            body.appendChild(resizer);
            bindFsRowResizer(resizer, row);
        });
    });
}

// 綁定單一分隔線的拖曳行為：往下拖曳 = 上方橫行變高
function bindFsRowResizer(resizer, row) {
    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        const startY = e.clientY;
        const startH = row.getBoundingClientRect().height;
        resizer.classList.add('resizing');
        document.body.style.userSelect = 'none';

        const onMove = (ev) => {
            const h = Math.max(60, startH + (ev.clientY - startY));  // 最低 60px，避免縮到看不見
            row.style.height = h + 'px';
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

/**
 * 全畫面編輯的輸入處理：即時寫回 state，並同步主介面「目前選取小節」的欄位。
 * 為避免每次按鍵都重繪整棵章節樹（很耗效能），主介面的完整重繪延到關閉彈窗時再做。
 */
function onFullscreenEditInput(e) {
    const ta = e.target;
    if (!ta.matches('.fs-desc, .fs-content')) return;

    const ci = parseInt(ta.dataset.ci, 10);
    const si = parseInt(ta.dataset.si, 10);
    const sec = state.chapters?.[ci]?.sections?.[si];
    if (!sec) return;

    if (ta.dataset.field === 'title') sec.title = ta.value;
    else sec.content = ta.value;
    fsSyncToMainEditor(ci, si);
}

/**
 * 若第 ci 章第 si 節正好是主介面目前選取的小節，把 state 的最新值同步到主介面兩個欄位。
 * 只更新欄位值、不重繪整棵章節樹（每次按鍵都重繪太耗效能），
 * 主介面的完整重繪延到關閉全畫面編輯彈窗時再做。
 */
function fsSyncToMainEditor(ci, si) {
    if (state.activeIndex.chapter !== ci || state.activeIndex.section !== si) return;
    const sec = state.chapters?.[ci]?.sections?.[si];
    if (!sec) return;
    const t = qs('#active-section-title');
    if (t) t.value = sec.title || '';
    const ed = qs('#main-editor');
    if (ed) ed.value = sec.content || '';
}

function openFullscreenEditModal() {
    // ⚠️ 必須「先顯示彈窗」再建立內容並量測高度，
    //    因為元素在 display:none 時量不到寬度，textarea 的 scrollHeight 會是 0。
    qs('#modal-fullscreen-edit').classList.remove('hidden');

    renderFullscreenEditor();
    qs('#fsedit-search-input').value = '';
    qs('#fsedit-search-count').textContent = '';
    fsEditMatches = [];
    fsEditCurrentMatch = -1;

    // 依實際文字高度把每行調整到剛好放得下：
    // 先同步量一次（此時彈窗已顯示，版面寬度已可計算），確保一定會執行；
    // 再於下一個影格與字型載入完成後各補量一次，因為換行結果可能因字型而改變。
    fsAutoFitRows();
    requestAnimationFrame(() => fsAutoFitRows());
    if (document.fonts && document.fonts.ready) {
        document.fonts.ready.then(() => fsAutoFitRows());
    }
}

function closeFullscreenEditModal() {
    qs('#modal-fullscreen-edit').classList.add('hidden');
    // 若「尋找／取代」面板正作用於本彈窗，一併關閉；否則它記錄的欄位全部失效
    if (frState.scope === 'fs') closeFindReplacePanel();
    closeQuickMenu();
    qs('#fsedit-chapter-tooltip')?.classList.add('hidden');
    // 關閉時整批重繪主介面，讓章節樹的完成狀態(✓)與編輯器內容完全同步
    renderChapters();
    renderEditor();
}

// 全畫面編輯彈窗的搜尋：掃描所有橫行的「小節描述 + 內文」兩欄
function doFullscreenEditSearch() {
    const query = qs('#fsedit-search-input').value;
    const countEl = qs('#fsedit-search-count');
    fsEditMatches = [];
    fsEditCurrentMatch = -1;
    if (!query) { countEl.textContent = ''; return; }

    const textareas = Array.from(qs('#fsedit-body').querySelectorAll('textarea'));
    const lq = query.toLowerCase();
    textareas.forEach((ta, taIdx) => {
        const lo = ta.value.toLowerCase();
        let i = 0;
        while ((i = lo.indexOf(lq, i)) !== -1) {
            fsEditMatches.push({ taIdx, start: i });
            i += lq.length;
        }
    });
    if (fsEditMatches.length) goToFullscreenEditMatch(0);
    else countEl.textContent = '找不到';
}

// 跳至第 idx 筆搜尋結果（可循環），選取該處並捲動到可視範圍
function goToFullscreenEditMatch(idx) {
    if (!fsEditMatches.length) return;
    const query = qs('#fsedit-search-input').value;
    fsEditCurrentMatch = ((idx % fsEditMatches.length) + fsEditMatches.length) % fsEditMatches.length;
    const m = fsEditMatches[fsEditCurrentMatch];
    const textareas = Array.from(qs('#fsedit-body').querySelectorAll('textarea'));
    const ta = textareas[m.taIdx];
    if (!ta) return;

    const start = m.start, end = start + query.length;
    // 先把該橫行捲進畫面，再處理 textarea 內部的捲動
    ta.closest('.fs-row')?.scrollIntoView({ block: 'center', behavior: 'smooth' });

    const fullText = ta.value;
    ta.value = fullText.substring(0, start);
    const pixelPos = ta.scrollHeight;
    ta.value = fullText;
    ta.focus();
    ta.setSelectionRange(start, end);
    requestAnimationFrame(() => {
        ta.scrollTop = Math.max(0, pixelPos - ta.clientHeight / 2);
    });
    qs('#fsedit-search-count').textContent = `${fsEditCurrentMatch + 1} / ${fsEditMatches.length}`;
}

// 取得（必要時建立）「第X章」自訂 tooltip 的浮動框元素，全彈窗共用同一個
function fsChapterTooltipEl() {
    let el = qs('#fsedit-chapter-tooltip');
    if (!el) {
        el = document.createElement('div');
        el.id = 'fsedit-chapter-tooltip';
        el.className = 'fs-chapter-tooltip hidden';
        document.body.appendChild(el);
    }
    return el;
}

// 依游標位置定位 tooltip，並保留 8px 邊界避免超出視窗
function fsPositionChapterTooltip(el, e) {
    const x = Math.min(window.innerWidth - el.offsetWidth - 8, e.clientX + 16);
    const y = Math.min(window.innerHeight - el.offsetHeight - 8, e.clientY + 16);
    el.style.left = Math.max(8, x) + 'px';
    el.style.top = Math.max(8, y) + 'px';
}

// 初始化全畫面編輯：開關按鈕、輸入同步、搜尋列
function initFullscreenEdit() {
    qs('#btn-fullscreen-edit').addEventListener('click', openFullscreenEditModal);
    qs('#fsedit-btn-close').addEventListener('click', closeFullscreenEditModal);
    // 編輯過後文字長度改變，可隨時按此鈕讓所有橫行重新貼合內容高度
    qs('#fsedit-btn-autofit').addEventListener('click', fsAutoFitRows);
    // 事件委派：所有橫行的 textarea 共用同一個 input 處理器
    qs('#fsedit-body').addEventListener('input', onFullscreenEditInput);
    qs('#fsedit-search-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doFullscreenEditSearch(); }
    });
    qs('#fsedit-search-prev').addEventListener('click', () => goToFullscreenEditMatch(fsEditCurrentMatch - 1));
    qs('#fsedit-search-next').addEventListener('click', () => goToFullscreenEditMatch(fsEditCurrentMatch + 1));

    // 「第X章」自訂 tooltip：事件委派，滑入顯示／跟隨游標移動／滑出隱藏
    const body = qs('#fsedit-body');
    body.addEventListener('mouseover', (e) => {
        const cell = e.target.closest('.fs-chapter');
        if (!cell) return;
        const tip = fsChapterTooltipEl();
        tip.textContent = cell.dataset.tooltip || '';
        tip.classList.remove('hidden');
        fsPositionChapterTooltip(tip, e);
    });
    body.addEventListener('mousemove', (e) => {
        const cell = e.target.closest('.fs-chapter');
        if (!cell) return;
        fsPositionChapterTooltip(fsChapterTooltipEl(), e);
    });
    body.addEventListener('mouseout', (e) => {
        const cell = e.target.closest('.fs-chapter');
        if (cell && !cell.contains(e.relatedTarget)) fsChapterTooltipEl().classList.add('hidden');
    });
}


// ============================================================================
// 🧭 快顯功能表選單（Alt+A）＋ 尋找／取代浮動面板
// ============================================================================
// 本區塊把散落的編輯輔助功能整合到一個入口：
//   Alt+A → 快顯功能表 →「尋找／取代／全面搜尋／擴寫／視覺化／精簡／對白」
//
// 【作用範圍（scope）】開啟選單的當下就鎖定，之後所有動作都只在該範圍內生效：
//   'fs'   ── 「全畫面編輯」彈窗開啟中：只作用於彈窗內的小節描述與內文欄位
//   'main' ── 其餘情況：只作用於主介面的編輯欄位
//
// 【尋找／取代的欄位順序】主介面依作者的閱讀順序攤平成一維清單：
//   粗綱 → 第1章標題 → 第1章描述 → 1-1大綱 → 1-1內文 → 1-2大綱 → … → 第2章標題 → …
//   「下一個」會先從游標所在欄位的游標位置往後找，找完才換下一個欄位，到底會繞回開頭。

// 尋找／取代的執行狀態
const frState = {
    scope: 'main',   // 'main' | 'fs'
    query: '',       // 上一次掃描用的關鍵字
    fields: [],      // 依順序排列的欄位描述子
    matches: [],     // 命中清單 [{ fi, start }]，順序與 fields 一致
    current: -1,     // 目前停在第幾筆命中（-1 = 尚未定位）
    anchor: null     // 開啟面板當下的游標位置，供第一次「下一個」當起點
};

// ── 欄位清單建立 ───────────────────────────────────────────────

// 主介面欄位清單（不含作者備註；作者備註請用 Ctrl+Shift+F 全面搜尋）
function frBuildMainFields() {
    const fields = [{ kind: 'premise', label: '粗綱' }];
    (state.chapters || []).forEach((ch, ci) => {
        fields.push({ kind: 'chapterTitle', ci, label: `第${ci + 1}章 標題` });
        fields.push({ kind: 'chapterDesc', ci, label: `第${ci + 1}章 描述` });
        (ch.sections || []).forEach((sec, si) => {
            fields.push({ kind: 'sectionTitle', ci, si, label: `第${ci + 1}章 第${si + 1}節 大綱` });
            fields.push({ kind: 'content', ci, si, label: `第${ci + 1}章 第${si + 1}節 內文` });
        });
    });
    return fields;
}

// 全畫面編輯彈窗的欄位清單＝彈窗內 textarea 的 DOM 順序（每節「描述、內文」各一）
function frBuildFsFields() {
    const body = qs('#fsedit-body');
    if (!body) return [];
    return Array.from(body.querySelectorAll('textarea')).map(ta => {
        const ci = parseInt(ta.dataset.ci, 10);
        const si = parseInt(ta.dataset.si, 10);
        const isTitle = ta.dataset.field === 'title';
        return {
            kind: isTitle ? 'fsTitle' : 'fsContent', ci, si, el: ta,
            label: `第${ci + 1}章 第${si + 1}節 ${isTitle ? '描述' : '內文'}`
        };
    });
}

function frBuildFields(scope) {
    return scope === 'fs' ? frBuildFsFields() : frBuildMainFields();
}

// ── 欄位讀寫 ───────────────────────────────────────────────────

// 讀取欄位目前的文字（一律以 state 為準；全畫面欄位則直接讀 textarea）
function frGetText(f) {
    switch (f.kind) {
        case 'premise': return state.storyPremise || '';
        case 'chapterTitle': return state.chapters?.[f.ci]?.title || '';
        case 'chapterDesc': return state.chapters?.[f.ci]?.description || '';
        case 'sectionTitle': return state.chapters?.[f.ci]?.sections?.[f.si]?.title || '';
        case 'content': return state.chapters?.[f.ci]?.sections?.[f.si]?.content || '';
        case 'fsTitle':
        case 'fsContent': return f.el ? f.el.value : '';
    }
    return '';
}

/**
 * 把新文字寫回欄位。
 * @param {boolean} silent true = 不重繪畫面（「全部取代」時逐欄寫入，最後再統一重繪一次）
 */
function frSetText(f, v, silent) {
    switch (f.kind) {
        case 'premise':
            state.storyPremise = v;
            qs('#story-premise').value = v;
            break;
        case 'chapterTitle':
            state.chapters[f.ci].title = v;
            if (!silent) renderChapters();
            break;
        case 'chapterDesc':
            state.chapters[f.ci].description = v;
            if (!silent) renderChapters();
            break;
        case 'sectionTitle':
            state.chapters[f.ci].sections[f.si].title = v;
            if (!silent) { renderChapters(); renderEditor(); }
            break;
        case 'content':
            state.chapters[f.ci].sections[f.si].content = v;
            if (!silent) { renderChapters(); renderEditor(); }
            break;
        case 'fsTitle':
        case 'fsContent': {
            // 全畫面編輯：只更新 state 與該 textarea，不重建橫行（避免使用者調過的行高被重置）
            const sec = state.chapters?.[f.ci]?.sections?.[f.si];
            if (!sec) break;
            if (f.kind === 'fsTitle') sec.title = v; else sec.content = v;
            if (f.el) f.el.value = v;
            fsSyncToMainEditor(f.ci, f.si);
            break;
        }
    }
}

/**
 * 取得欄位「目前在畫面上」對應的 DOM 元素；沒有渲染出來則回傳 null。
 * ⚠️ 小節大綱／內文只有「主介面目前選取的那一節」才有對應的輸入框，
 *    其餘小節必須先 setActive() 切過去才拿得到（見 frFocusField）。
 */
function frFieldElement(f) {
    const list = qs('#chapter-list');
    switch (f.kind) {
        case 'premise': return qs('#story-premise');
        case 'chapterTitle':
            return list?.children[f.ci]?.querySelector('.chapter-title-row input[type="text"]') || null;
        case 'chapterDesc':
            return list?.children[f.ci]?.querySelector('.chapter-desc') || null;
        case 'sectionTitle':
            return (state.activeIndex.chapter === f.ci && state.activeIndex.section === f.si)
                ? qs('#active-section-title') : null;
        case 'content':
            return (state.activeIndex.chapter === f.ci && state.activeIndex.section === f.si)
                ? qs('#main-editor') : null;
        case 'fsTitle':
        case 'fsContent': return f.el || null;
    }
    return null;
}

// 跳到某欄位並反白 [start, end)：必要時先切換小節、展開折疊欄、捲動到可視範圍
function frFocusField(f, start, end) {
    const q = frState.query;
    switch (f.kind) {
        case 'premise':
            gsExpandColumn('story-premise-container');
            gsFocusAndSelect(qs('#story-premise'), start, end, q);
            break;
        case 'chapterTitle':
        case 'chapterDesc': {
            const card = qs('#chapter-list')?.children[f.ci];
            if (!card) return;
            card.scrollIntoView({ block: 'center', behavior: 'smooth' });
            const el = (f.kind === 'chapterTitle')
                ? card.querySelector('.chapter-title-row input[type="text"]')
                : card.querySelector('.chapter-desc');
            gsFocusAndSelect(el, start, end, q);
            break;
        }
        case 'sectionTitle':
            setActive(f.ci, f.si);   // 切換主介面目前編輯中的小節
            gsFocusAndSelect(qs('#active-section-title'), start, end, q);
            break;
        case 'content':
            setActive(f.ci, f.si);
            gsFocusAndSelect(qs('#main-editor'), start, end, q);
            break;
        case 'fsTitle':
        case 'fsContent':
            f.el?.closest('.fs-row')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
            gsFocusAndSelect(f.el, start, end, q);
            break;
    }
}

// ── 搜尋核心 ───────────────────────────────────────────────────

// 重新掃描：依目前 scope 重建欄位清單與命中清單（不分大小寫，比照全面搜尋）
function frRescan() {
    frState.query = qs('#findrep-find-input').value;
    frState.fields = frBuildFields(frState.scope);
    frState.matches = [];
    frState.current = -1;
    if (!frState.query) return;

    const lq = frState.query.toLowerCase();
    frState.fields.forEach((f, fi) => {
        const lo = frGetText(f).toLowerCase();
        let i = 0;
        while ((i = lo.indexOf(lq, i)) !== -1) {
            frState.matches.push({ fi, start: i });
            i += lq.length;
        }
    });
}

/**
 * 決定這次要「從哪裡開始找」。優先序：
 *   1. 上一筆命中（連續按下一個時，從該命中之後接續）
 *   2. 目前焦點所在的欄位與游標位置（使用者剛把游標點在某個框裡）
 *   3. 開啟面板當下記錄的游標位置（此時焦點多半已在面板的輸入框上）
 *   4. 都沒有 → 從第一個欄位的開頭
 */
function frAnchor(prevMatch) {
    if (prevMatch) {
        return { fi: prevMatch.fi, start: prevMatch.start, end: prevMatch.start + frState.query.length };
    }
    const el = document.activeElement;
    if (el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')) {
        const fi = frState.fields.findIndex(f => frFieldElement(f) === el);
        if (fi >= 0) return { fi, start: el.selectionStart || 0, end: el.selectionEnd || 0 };
    }
    if (frState.anchor) return frState.anchor;
    return { fi: 0, start: 0, end: 0 };
}

// 由 anchor 往 dir 方向（1=下一個 / -1=上一個）尋找最近的一筆命中，找不到就繞回頭尾
function frSeek(a, dir) {
    if (!frState.matches.length) {
        frState.current = -1;
        frUpdateCount();
        frSetStatus(frState.query ? '找不到符合的文字' : '請先輸入要尋找的文字');
        return;
    }
    let idx;
    if (dir > 0) {
        idx = frState.matches.findIndex(m => m.fi > a.fi || (m.fi === a.fi && m.start >= a.end));
        if (idx < 0) idx = 0;                              // 已到最後 → 繞回第一筆
    } else {
        for (idx = frState.matches.length - 1; idx >= 0; idx--) {
            const m = frState.matches[idx];
            if (m.fi < a.fi || (m.fi === a.fi && m.start < a.start)) break;
        }
        if (idx < 0) idx = frState.matches.length - 1;     // 已到最前 → 繞回最後一筆
    }
    frGoToMatch(idx);
}

// 停到第 idx 筆命中：反白、捲動、更新計數與狀態列
function frGoToMatch(idx) {
    frState.current = idx;
    const m = frState.matches[idx];
    const f = frState.fields[m.fi];
    frFocusField(f, m.start, m.start + frState.query.length);
    frUpdateCount();
    frSetStatus(`命中位置：${f.label}`);
}

// 「上一個 / 下一個」的進入點
function frGo(dir) {
    if (frState.scope === 'fs' && !isFullscreenEditOpen()) {
        frSetStatus('⚠️ 全畫面編輯彈窗已關閉，請重新開啟尋找面板');
        return;
    }
    // 關鍵字沒變才有「上一筆命中」可以接續；每次都重新掃描，確保位置永遠對應最新內容
    const q = qs('#findrep-find-input').value;
    const prevMatch = (q === frState.query && frState.current >= 0)
        ? frState.matches[frState.current] : null;
    frRescan();
    frSeek(frAnchor(prevMatch), dir);
}

// ── 取代 ───────────────────────────────────────────────────────

// 取代目前反白的這一筆，然後自動跳到下一筆
function frReplaceOne() {
    if (!frState.query || frState.current < 0) { frGo(1); return; }   // 還沒定位 → 先幫使用者找一筆

    const m = frState.matches[frState.current];
    const f = frState.fields[m.fi];
    const rep = qs('#findrep-replace-input').value;
    const text = frGetText(f);

    // 保險：定位後若內容又被改過，位置可能已失效，寧可不動也不要改錯地方
    if (text.substr(m.start, frState.query.length).toLowerCase() !== frState.query.toLowerCase()) {
        frSetStatus('⚠️ 內容已變動，請重新按「下一個」定位');
        return;
    }

    frSetText(f, text.slice(0, m.start) + rep + text.slice(m.start + frState.query.length));
    appendLog(`📝 尋找／取代：於「${f.label}」將「${frState.query}」取代為「${rep}」1 處。`);

    // 從剛取代完的文字尾端繼續往下找（避免取代結果本身又被找到）
    const resumeAt = m.start + rep.length;
    frRescan();
    frSeek({ fi: m.fi, start: resumeAt, end: resumeAt }, 1);
}

// 把「目前作用範圍內」所有命中一次取代掉（不分大小寫）。⚠️ 無法復原
function frReplaceAll() {
    if (frState.scope === 'fs' && !isFullscreenEditOpen()) {
        frSetStatus('⚠️ 全畫面編輯彈窗已關閉，請重新開啟尋找面板');
        return;
    }
    const q = qs('#findrep-find-input').value;
    if (!q) { alert('請先在「尋找」欄輸入要被取代的文字。'); return; }
    const rep = qs('#findrep-replace-input').value;

    const scopeDesc = (frState.scope === 'fs')
        ? '全畫面編輯彈窗內的所有「小節描述」與「內文」'
        : '主介面的「粗綱／章標題／章描述／小節大綱／內文」';
    if (!confirm(
        `⚠️ 警告：即將把 ${scopeDesc} 中\n所有的「${q}」全部取代成「${rep}」。\n\n` +
        `此操作【無法復原】（不能用 Ctrl+Z 還原），請謹慎使用！\n\n確定要執行嗎？`
    )) return;

    const fields = frBuildFields(frState.scope);
    const rx = new RegExp(gsEscapeRegExp(q), 'gi');
    let count = 0;
    fields.forEach(f => {
        const text = frGetText(f);
        if (!text) return;
        rx.lastIndex = 0;
        const next = text.replace(rx, () => { count++; return rep; });
        if (next !== text) frSetText(f, next, true);   // silent：先全部寫完，最後統一重繪
    });

    // 主介面情境才需要重繪（全畫面欄位在 frSetText 內已即時更新 textarea）
    if (frState.scope !== 'fs') { renderChapters(); renderEditor(); }

    appendLog(`📝 尋找／取代（${frState.scope === 'fs' ? '全畫面編輯' : '主介面'}）：` +
        `已將「${q}」取代為「${rep}」，共 ${count} 處。`);
    alert(`✅ 已完成取代，共 ${count} 處。`);

    frRescan();
    frUpdateCount();
    frSetStatus(`已取代 ${count} 處`);
}

// ── 面板顯示 ───────────────────────────────────────────────────

function frSetStatus(msg) {
    const el = qs('#findrep-status');
    if (el) el.textContent = msg;
}

// 更新「第幾筆 / 共幾筆」
function frUpdateCount() {
    const el = qs('#findrep-count');
    if (!el) return;
    el.textContent = frState.matches.length
        ? `${frState.current >= 0 ? frState.current + 1 : 0} / ${frState.matches.length}`
        : '';
}

// 展開／收合取代列
function frToggleReplaceRow(show) {
    const row = qs('#findrep-replace-row');
    const open = (show !== undefined) ? show : (row.style.display === 'none');
    row.style.display = open ? 'flex' : 'none';
    qs('#findrep-toggle').textContent = open ? '▴' : '▾';
}

/**
 * 開啟尋找／取代面板。
 * @param {string} scope       'main' | 'fs'
 * @param {boolean} showReplace true = 直接展開取代列（由「📝 取代...」進入）
 * @param {HTMLElement} srcEl  開啟當下游標所在的輸入框，作為第一次搜尋的起點
 */
function openFindReplacePanel(scope, showReplace, srcEl) {
    frState.scope = scope;
    frState.fields = frBuildFields(scope);
    frState.matches = [];
    frState.current = -1;
    frState.query = '';
    frState.anchor = null;

    // 記下開啟當下的游標位置：按下「下一個」時就從這裡開始往後找
    if (srcEl) {
        const fi = frState.fields.findIndex(f => frFieldElement(f) === srcEl);
        if (fi >= 0) {
            frState.anchor = { fi, start: srcEl.selectionStart || 0, end: srcEl.selectionEnd || 0 };
        }
    }

    qs('#findrep-scope').textContent = (scope === 'fs') ? '（全畫面編輯彈窗）' : '（主介面）';
    frToggleReplaceRow(!!showReplace);
    frUpdateCount();
    frSetStatus('尚未搜尋');

    qs('#find-replace-panel').classList.remove('hidden');
    const input = qs('#findrep-find-input');
    input.focus();
    input.select();
}

function closeFindReplacePanel() {
    qs('#find-replace-panel')?.classList.add('hidden');
}

// ── 快顯功能表選單 ─────────────────────────────────────────────

// 開啟選單當下鎖定的情境：{ scope, field, el, selStart, selEnd }
let quickMenuCtx = null;

/**
 * 把彈出元素放到游標附近。
 * 垂直位置沿用專案既有量法：把 textarea 內容截到游標處，此時 scrollHeight
 * 就是游標所在行的像素高度；量完務必還原文字、選取範圍與捲動位置。
 */
function frPlaceAtCaret(box, el) {
    // 先歸零再量尺寸，避免用到上次殘留的位置
    box.style.left = '0px';
    box.style.top = '0px';
    const w = box.offsetWidth, h = box.offsetHeight;

    let x, y;
    if (el && el.tagName === 'TEXTAREA') {
        const rect = el.getBoundingClientRect();
        const full = el.value, ss = el.selectionStart, se = el.selectionEnd, st = el.scrollTop;
        el.value = full.substring(0, ss);
        const caretY = el.scrollHeight;
        el.value = full;
        el.setSelectionRange(ss, se);
        el.scrollTop = st;
        x = rect.left + 24;
        y = rect.top + Math.min(rect.height, Math.max(0, caretY - st)) + 4;
    } else if (el) {
        const rect = el.getBoundingClientRect();
        x = rect.left + 24;
        y = rect.bottom + 4;
    } else {
        // 焦點不在任何輸入框 → 放在畫面中央偏上
        x = window.innerWidth / 2 - w / 2;
        y = window.innerHeight * 0.2;
    }
    box.style.left = Math.max(4, Math.min(window.innerWidth - w - 4, x)) + 'px';
    box.style.top = Math.max(4, Math.min(window.innerHeight - h - 4, y)) + 'px';
}

function openQuickMenu() {
    // 作用範圍：全畫面編輯彈窗開著就一律歸它，與主介面的任何輸入框無關
    const scope = isFullscreenEditOpen() ? 'fs' : 'main';
    const field = detectRefineField();

    // 開啟當下就把欄位與選取範圍記起來：
    // 之後點選單項目時焦點已離開原輸入框，屆時再抓就抓不到選取文字了
    quickMenuCtx = {
        scope, field,
        el: field ? field.el : (document.activeElement?.tagName === 'TEXTAREA' ? document.activeElement : null),
        selStart: field ? field.el.selectionStart : 0,
        selEnd: field ? field.el.selectionEnd : 0
    };

    qs('#quick-menu-scope').textContent =
        (scope === 'fs') ? '作用範圍：全畫面編輯彈窗' : '作用範圍：主介面';

    const menu = qs('#quick-menu');
    // 「全面搜尋」本質上是跨全部欄位的全域功能，無法侷限在全畫面編輯彈窗內，
    // 且其面板 z-index(90) 低於彈窗，開了也會被蓋住 → 全畫面情境下直接隱藏此項
    menu.querySelector('[data-action="global"]').style.display = (scope === 'fs') ? 'none' : 'flex';

    menu.classList.remove('hidden');
    frPlaceAtCaret(menu, quickMenuCtx.el);
}

function closeQuickMenu() {
    qs('#quick-menu')?.classList.add('hidden');
}

// 執行選單項目
function runQuickMenuAction(action) {
    closeQuickMenu();
    const ctx = quickMenuCtx || { scope: 'main', field: null, el: null, selStart: 0, selEnd: 0 };

    if (action === 'global') { openGlobalSearchPanel(); return; }

    // 尋找／取代不需要事先反白選取，隨時可開
    if (action === 'find' || action === 'replace') {
        openFindReplacePanel(ctx.scope, action === 'replace', ctx.el);
        return;
    }

    // 四種 AI 加工：沿用熱鍵版的前提，必須先在輸入框中反白選取一段文字
    const field = ctx.field;
    if (!field) { alert('請先把游標放進可編輯的文字框，再使用加工功能。'); return; }
    if (ctx.selStart === ctx.selEnd) { alert('請先在輸入框中反白選取一段文字，再使用加工功能。'); return; }

    field.selStart = ctx.selStart;
    field.selEnd = ctx.selEnd;
    field.fullValue = field.el.value;
    field.selectedText = field.fullValue.slice(ctx.selStart, ctx.selEnd);
    openRefineModal(action, field);
}

// 初始化：Alt+A 熱鍵、選單點擊、尋找／取代面板的各按鈕
function initQuickMenuAndFindReplace() {
    // Alt+A 開啟快顯功能表（capture 階段攔截，避免被其他監聽器搶先）
    document.addEventListener('keydown', (e) => {
        if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
        if ((e.key || '').toLowerCase() !== 'a') return;
        e.preventDefault();
        e.stopPropagation();
        openQuickMenu();
    }, true);

    // Esc 關閉快顯選單（面板本身有自己的關閉鈕，不在此一併關掉）
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeQuickMenu();
    });

    // 點選單以外的地方就收合
    document.addEventListener('mousedown', (e) => {
        const menu = qs('#quick-menu');
        if (menu && !menu.classList.contains('hidden') && !menu.contains(e.target)) closeQuickMenu();
    });

    // 選單項目：以事件委派處理，動作名稱寫在 data-action
    qs('#quick-menu').addEventListener('click', (e) => {
        const btn = e.target.closest('.qk-item');
        if (btn) runQuickMenuAction(btn.dataset.action);
    });

    // 尋找／取代面板
    qs('#findrep-next').addEventListener('click', () => frGo(1));
    qs('#findrep-prev').addEventListener('click', () => frGo(-1));
    qs('#findrep-close').addEventListener('click', closeFindReplacePanel);
    qs('#findrep-toggle').addEventListener('click', () => frToggleReplaceRow());
    qs('#findrep-btn-replace').addEventListener('click', frReplaceOne);
    qs('#findrep-btn-replace-all').addEventListener('click', frReplaceAll);
    qs('#findrep-find-input').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        frGo(e.shiftKey ? -1 : 1);   // Enter = 下一個、Shift+Enter = 上一個
    });

    makePanelDraggable(qs('#find-replace-panel'), qs('#findrep-header'));
}
