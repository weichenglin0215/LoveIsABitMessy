/**
 * 小說自動產生器 - 應用邏輯
 */

const qs = (sel) => document.querySelector(sel);

// 全域狀態
let state = {
    bookTitle: "未命名小說",
    storyPremise: "分成起承轉合四章，故事背景在大學圖書館，兩人都是大學生。\n\n"
        + "起：描述女主角與心儀對象在圖書館因一本書而相遇的情境。\n\n"
        + "承：因參加活動編在同組有了更多互動機會，也因此產生誤會。\n\n"
        + "轉：兩人心意相通，卻總是在要更進一步的時候發生一些狀況而中斷，讓兩人都很苦惱。\n\n"
        + "合：總算是成為男女朋友，最後才發現這一切都是女主在回憶與已過世的男主交往過程。\n"
        + "目前現實中為女主角在整理與男主的遺物時，所發現的日記，記錄了兩人從相識到相戀的過程。", // 故事粗綱
    characters: ["", "", "", ""], // 儲存角色 ID
    aiModel: "gemma4",
    modelOptions: "",
    writerStyle: "",
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
    currentModel: "gemma4"
};

let cloudCharacters = []; // 儲存雲端角色卡完整資料
let localCharacters = []; // 儲存本機角色 ID
let serverOnline = false;

// 初始化
window.addEventListener('load', async () => {
    initSupabase();
    await checkServerStatus();
    startServerPolling();
    await initCharacters();
    renderAll();
    setupEventListeners();
});

function initSupabase() {
    if (window.SupabaseClient && window.SupabaseClient.init) {
        window.SupabaseClient.init();
    }
}

// ====== 角色資料讀取 (參考 daily_run.html) ======

async function fetchOllamaModels() {
    try {
        const res = await fetch('http://localhost:8000/api/models');
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
        const res = await fetch('http://localhost:8000/api/status', { signal: controller.signal });
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
        if (data) cloudCharacters = data;
    } catch (e) {
        console.error("Cloud load error:", e);
    }
}

async function loadLocalChars() {
    try {
        const res = await fetch('http://localhost:8000/api/characters');
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
    qs('#book-title').value = state.bookTitle || "";
    qs('#story-premise').value = state.storyPremise || "";
    
    // 恢復 AI 設定 (如果存在)
    if (state.aiModel) qs('#model-select').value = state.aiModel;
    if (state.modelOptions) qs('#model-options-select').value = state.modelOptions;
    if (state.writerStyle) qs('#writer-style-select').value = state.writerStyle;
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

    state.characters.forEach((charId, idx) => {
        const slotNum = String(idx + 1).padStart(2, '0');
        let displayName = `角色 ${slotNum}`;

        // 如果有選取角色，顯示其姓名
        if (charId) {
            const found = cloudCharacters.find(c => c.id === charId);
            if (found) {
                displayName = found.name;
            } else {
                // 本機模式下 ID 通常就是檔名
                displayName = charId;
            }
        }

        const div = document.createElement('div');
        div.className = "char-card";
        div.innerHTML = `
            <div style="font-size:1rem; margin-bottom:5px; color:#aaa;">${displayName}</div>
            <select data-idx="${idx}">
                <option value="">-- 選取角色卡 --</option>
                ${(isLocal ? localCharacters : cloudCharacters).map(c => {
                    const id = isLocal ? c : c.id;
                    let label = isLocal ? c : c.name;
                    if (!isLocal) {
                        const dateStr = c.updated_at ? c.updated_at.split('T')[0].replace(/-/g, '') : '';
                        const lpasStr = c.lpas || (c.card_json ? c.card_json.personality_type?.split('-')[0] : '');
                        label = `${c.name || '未命名'}-${lpasStr || '無LPAS'}-${dateStr}`;
                    }
                    return `<option value="${id}" ${id === charId ? 'selected' : ''}>${label}</option>`;
                }).join('')}
            </select>
            <button style="position:absolute; top:5px; right:5px; background:none; border:none; color:#f44; cursor:pointer;" onclick="removeChar(${idx})">🗑️</button>
        `;
        div.querySelector('select').addEventListener('change', (e) => {
            state.characters[idx] = e.target.value;
            renderCharacters(); // 更新標題顯示
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
                <span class="lock-btn btn-lock-ch" title="鎖定後將不會被 AI 生成大綱覆蓋"
                      style="opacity: ${ch.locked ? '1' : '0.3'}" 
                      onclick="toggleChapterLock(${chIdx})">
                    ${ch.locked ? '🔒' : '🔓'}
                </span>
                <input type="text" value="${ch.title}" placeholder="章節標題" onchange="state.chapters[${chIdx}].title = this.value">
                <button class="ai-btn" onclick="aiGenChapterOutline(${chIdx})">🤖 AI 大綱</button>
                <button class="btn-del-sec" style="font-size:1.2rem;" onclick="removeChapter(${chIdx})">🗑️</button>
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
                        <span style="flex:1; font-size:1.1rem; color:#ccc; cursor:pointer; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            ${sec.title || "未命名小節"}
                        </span>
                        <span style="font-size:1rem; color:${sec.content ? '#4caf50' : '#666'}; margin: 0 5px;">${sec.content ? '✓' : '...'}</span>
                        <div style="display:flex; align-items:center; gap:8px; margin-left:auto;">
                            <span class="lock-btn" title="鎖定後將不會被 AI 重寫"
                                  style="font-size:1.1rem; cursor:pointer; user-select:none; opacity: ${sec.locked ? '1' : '0.3'}" 
                                  onclick="event.stopPropagation(); toggleLock(${chIdx}, ${secIdx})">
                                ${sec.locked ? '🔒' : '🔓'}
                            </span>
                            <button class="btn-del-sec" style="font-size:1.0rem;" onclick="event.stopPropagation(); removeSection(${chIdx}, ${secIdx})">🗑️</button>
                        </div>
                    </div>
                `).join('')}
                <button class="btn-circle" style="width:24px; height:24px; font-size:1.2rem; align-self:flex-start;" onclick="addSection(${chIdx})">+</button>
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
        state.characters.push("");
        renderCharacters();
    });

    qs('#add-chapter').addEventListener('click', () => {
        state.chapters.push({ title: "新章節", description: "", sections: [{ title: "新節", content: "" }] });
        renderChapters();
    });

    qs('#use-local-data').addEventListener('change', initCharacters);
    qs('#btn-save').addEventListener('click', saveProject);
    qs('#btn-load').addEventListener('click', loadProject);
    qs('#btn-export').addEventListener('click', exportNovelToMarkdown);
    qs('#btn-ai-gen-content').addEventListener('click', aiGenSectionContent);
    qs('#btn-ai-gen-all-outlines').addEventListener('click', aiGenAllOutlines);
    qs('#btn-ai-gen-all-content').addEventListener('click', aiGenAllContent);
    qs('#btn-ai-gen-chapters').addEventListener('click', aiGenChaptersFromPremise);

    qs('#btn-load-cloud').addEventListener('click', listCloudNovels);
    qs('#cloud-novel-select').addEventListener('change', loadCloudNovel);

    qs('#toggle-premise').addEventListener('click', () => {
        const container = qs('#story-premise-container');
        container.classList.toggle('collapsed');
    });

    qs('#story-premise').addEventListener('input', (e) => {
        state.storyPremise = e.target.value;
    });

    qs('#model-select').addEventListener('change', (e) => {
        state.currentModel = e.target.value;
    });

    qs('#book-title').addEventListener('input', (e) => {
        state.bookTitle = e.target.value;
    });

    // Save Novel Modal
    qs('#btn-save-cancel').addEventListener('click', () => {
        qs('#modal-novel-save').style.display = 'none';
    });
    qs('#btn-save-confirm').addEventListener('click', confirmSaveProject);

    // Load Password Modal
    qs('#btn-password-cancel').addEventListener('click', () => {
        qs('#modal-novel-password').style.display = 'none';
        qs('#cloud-novel-select').value = '';
    });
    qs('#btn-password-ok').addEventListener('click', confirmLoadCloudNovel);

    const startServerBtn = qs('#start-server-btn');
    if (startServerBtn) {
        startServerBtn.addEventListener('click', () => {
            const batContent = '@echo off\r\nchcp 65001 >nul\r\ncd /d "' + getProjectRoot() + '"\r\necho ====================================\r\necho   LoveIsABitMessy - Debug Server\r\necho   http://localhost:8000\r\necho ====================================\r\necho.\r\npython debug_server.py\r\necho.\r\necho === 伺服器已停止 ===\r\npause >nul\r\n';
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
            logBox.innerText += `\n[${new Date().toLocaleTimeString()}] ${logMessage}\n`;
            logBox.scrollTop = logBox.scrollHeight;
        }
    }
}

function appendLog(text) {
    const logBox = qs('#log-output');
    if (logBox) {
        logBox.innerText += text + "\n";
        logBox.scrollTop = logBox.scrollHeight;
    }
}

async function aiGenChapterOutline(chIdx) {
    const chapter = state.chapters[chIdx];
    if (!chapter.description) {
        return;
    }

    setAIGeneratingState(true, ">> 任務啟動...\n正在呼叫 Ollama 大模型產生大綱，這可能需要一分鐘以上，請稍候...");

    try {
        // 傳入全書章節一覽與目前章號，讓 AI 有完整前後文
        const payload = {
            book_title: state.bookTitle || '故事專案',
            description: chapter.description,
            story_premise: state.storyPremise,
            all_chapters,
            chapter_index: chIdx,   // 0-based
            characters: state.characters.map(id => {
                const found = cloudCharacters.find(c => c.id === id);
                return found ? found.card_json : null;
            }).filter(Boolean),
            character_ids: state.characters.filter(Boolean),
            model: state.currentModel || 'gemma4',
            model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null,
            writer_settings: (window.WriterSettingsApp && window.WriterSettingsApp.getSelectedContext()) || null
        };

        // Step 1: 取得提示詞預覽
        appendLog(">> 正在彙整 AI 提示詞...");
        const previewRes = await callDebugServer('/api/generate_outline', { ...payload, preview: true });
        if (previewRes && previewRes.debug_prompt) {
            appendLog(`\n=== 傳遞給 AI 的提示詞 ===\n${previewRes.debug_prompt}\n=====================\n`);
        }

        // Step 2: 真正生成
        appendLog(">> 正在呼叫 AI 執行生成任務...");
        const res = await callDebugServer('/api/generate_outline', payload);
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
            appendLog(">> 大綱產生完畢！未上鎖的小節已成功更新。");
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
                // 設為當前 active 以便呼叫 aiGenSectionContent
                state.activeIndex = { chapter: i, section: j };
                renderAll();
                await aiGenSectionContent();
            }
        }
    }
    appendLog(">> 所有未鎖定小節的內容已生成完畢。");
}

async function aiGenChaptersFromPremise() {
    if (!state.storyPremise) {
        alert("請先輸入故事粗綱。");
        return;
    }
    if (!confirm("這將根據粗綱生成各章標題與描述，會覆蓋現有未鎖定的章節，確定嗎？")) return;

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
            characters: state.characters.map(id => {
                const found = cloudCharacters.find(c => c.id === id);
                return found ? found.card_json : null;
            }).filter(Boolean),
            character_ids: state.characters.filter(Boolean),
            locked_chapters,
            model: state.currentModel || 'gemma4',
            model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null,
            writer_settings: (window.WriterSettingsApp && window.WriterSettingsApp.getSelectedContext()) || null
        };

        // Step 1: 取得提示詞預覽
        appendLog(">> 正在彙整 AI 提示詞...");
        const previewRes = await callDebugServer('/api/generate_chapters', { ...payload, preview: true });
        if (previewRes && previewRes.debug_prompt) {
            appendLog(`\n=== 傳遞給 AI 的提示詞 ===\n${previewRes.debug_prompt}\n=====================\n`);
        }

        // Step 2: 真正生成
        appendLog(">> 正在呼叫 AI 執行生成任務...");
        const res = await callDebugServer('/api/generate_chapters', payload);
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

    if (state.characters.filter(Boolean).length === 0) {
        alert("請至少選擇一位登場角色。");
        return;
    }

    const sectionTitleText = sec.title || `第 ${section + 1} 節`;
    setAIGeneratingState(true, `>> 任務啟動...\n正在呼叫 Ollama 產生章節 [${sectionTitleText}] 的內容，這可能會花費數分鐘，請稍候...`);

    try {
        const payload = {
            characters: state.characters.map(id => {
                const found = cloudCharacters.find(c => c.id === id);
                return found ? found.card_json : null;
            }).filter(Boolean),
            character_ids: state.characters.filter(Boolean),
            model: state.currentModel || qs('#model-select')?.value || 'gemma4',
            model_options: (window.getModelOptionsPayload && window.getModelOptionsPayload()) || null,
            writer_settings: (window.WriterSettingsApp && window.WriterSettingsApp.getSelectedContext()) || null,
            context: {
                chapter_title: ch.title,
                chapter_desc: ch.description,
                section_title: sec.title
            }
        };

        // Step 1: 取得提示詞預覽
        appendLog(">> 正在彙整 AI 提示詞...");
        const previewRes = await callDebugServer('/api/generate_story_content', { ...payload, preview: true });
        if (previewRes && previewRes.debug_prompt) {
            appendLog(`\n=== 傳遞給 AI 的提示詞 ===\n${previewRes.debug_prompt}\n=====================\n`);
        }

        // Step 2: 真正生成
        appendLog(">> 正在呼叫 AI 執行生成任務...");
        const res = await callDebugServer('/api/generate_story_content', payload);
        if (res && res.content) {
            sec.content = res.content;
            renderEditor();
            renderChapters();
            appendLog(">> 小說內文產生完畢！已自動更新至編輯器中。");
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
        const res = await fetch(`http://localhost:8000${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return await res.json();
    } catch (e) {
        throw e;
    }
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
    qs('#modal-novel-save').style.display = 'flex';
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
    qs('#modal-novel-save').style.display = 'none';

    // 同步當前選中的 AI 設定到 state
    state.aiModel = qs('#model-select').value;
    state.modelOptions = qs('#model-options-select').value;
    state.writerStyle = qs('#writer-style-select').value;
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
            .limit(30);

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

    if (!confirm("載入雲端小說將會覆蓋當前編輯器中的內容，確定嗎？")) {
        e.target.value = "";
        return;
    }

    // 開啟密碼驗證彈窗
    state._tempLoadId = id;
    qs('#novel-password-input').value = "";
    qs('#modal-novel-password').style.display = 'flex';
}

async function confirmLoadCloudNovel() {
    const id = state._tempLoadId;
    const pwd = qs('#novel-password-input').value.trim();
    if (!id || !pwd) {
        alert("請輸入密碼");
        return;
    }

    appendLog("☁️ 正在驗證並載入雲端小說資料...");
    try {
        const sb = window.SupabaseClient.getClient();
        const { data, error } = await sb
            .from('novel_entries')
            .select('edit_data, password')
            .eq('id', id)
            .single();

        if (error) throw error;

        if (data.password && data.password !== pwd) {
            alert("密碼錯誤！");
            return;
        }

        if (data && data.edit_data) {
            state = data.edit_data;
            renderAll();
            appendLog(`✅ 已成功載入「${state.bookTitle}」`);
            
            // 重置 UI
            qs('#btn-load-cloud').style.display = 'inline-block';
            qs('#cloud-novel-select').style.display = 'none';
            qs('#modal-novel-password').style.display = 'none';
            state._tempLoadId = null;
        }
    } catch (e) {
        appendLog("❌ 載入小說失敗: " + e.message);
    }
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
                renderAll();
                alert("✅ 成功讀取本機檔案");
                appendLog(`📂 已載入本機檔案: ${file.name}`);
            } catch (err) {
                alert("❌ 檔案格式錯誤");
            }
        }
    };
    input.click();
}


