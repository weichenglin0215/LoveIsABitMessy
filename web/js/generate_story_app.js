/**
 * 小說自動產生器 - 應用邏輯
 */

const qs = (sel) => document.querySelector(sel);

// 全域狀態
let state = {
    projectName: "未命名故事",
    characters: ["", "", "", ""], // 儲存角色 ID
    chapters: [
        { 
            title: "第一章：初見", 
            description: "描述主角與心儀對象在大學圖書館因一本書而相遇的情境。",
            sections: [
                { title: "圖書館的邂逅", content: "" }, 
                { title: "意外的聯繫方式", content: "" }, 
                { title: "心動的瞬間", content: "" }
            ] 
        },
        { 
            title: "第二章：升溫", 
            description: "兩人在社團內容中頻繁接觸，開始產生曖昧氛圍。",
            sections: [
                { title: "情節1", content: "" }, 
                { title: "情節2", content: "" }, 
                { title: "情節3", content: "" }
            ] 
        }
    ],
    activeIndex: { chapter: 0, section: 0 }
};

let cloudCharacters = []; // 儲存雲端角色卡完整資料
let localCharacters = []; // 儲存本機角色 ID
let serverOnline = false;

// 初始化
window.addEventListener('load', async () => {
    initSupabase();
    await checkServerStatus();
    await initCharacters();
    renderAll();
    setupEventListeners();
});

function initSupabase() {
    if (window.SupabaseClient && window.SupabaseClient.init) {
        window.SupabaseClient.init();
    }
}

// ====== 角色資料讀取 (參考 run_daily.html) ======

async function checkServerStatus() {
    try {
        const res = await fetch('http://localhost:8000/api/characters', { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
            serverOnline = true;
            return true;
        }
    } catch (e) {}
    serverOnline = false;
    return false;
}

async function loadCloudChars() {
    try {
        const sb = window.SupabaseClient.getClient();
        const { data, error } = await sb
            .from('characters')
            .select('id, name, card_json')
            .eq('is_active', true)
            .order('id');
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
            <div style="font-size:0.8rem; margin-bottom:5px; color:#aaa;">${displayName}</div>
            <select data-idx="${idx}">
                <option value="">-- 選取角色卡 --</option>
                ${(isLocal ? localCharacters : cloudCharacters).map(c => {
                    const id = isLocal ? c : c.id;
                    const label = isLocal ? c : `${c.id} [${c.name}]`;
                    return `<option value="${id}" ${id === charId ? 'selected' : ''}>${label}</option>`;
                }).join('')}
            </select>
            <button style="position:absolute; top:5px; right:5px; background:none; border:none; color:#f44; cursor:pointer;" onclick="removeChar(${idx})">×</button>
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
                <input type="text" value="${ch.title}" placeholder="章節標題" onchange="state.chapters[${chIdx}].title = this.value">
                <button class="ai-btn" onclick="aiGenChapterOutline(${chIdx})">🤖 AI 大綱</button>
                <button class="btn-del-sec" style="font-size:1.2rem;" onclick="removeChapter(${chIdx})">🗑️</button>
            </div>
            <textarea class="chapter-desc" placeholder="輸入本章大綱說明（AI 將以此產生小節）..." 
                      onchange="state.chapters[${chIdx}].description = this.value">${ch.description || ""}</textarea>
            <div class="section-list">
                ${ch.sections.map((sec, secIdx) => `
                    <div class="section-item ${state.activeIndex.chapter === chIdx && state.activeIndex.section === secIdx ? 'active' : ''}" 
                         onclick="setActive(${chIdx}, ${secIdx})">
                        <input type="text" value="${sec.title}" onchange="updateSectionTitle(${chIdx}, ${secIdx}, this.value)">
                        <span style="font-size:0.9rem; color:${sec.content ? '#4caf50' : '#666'}; margin: 0 5px;">${sec.content ? '✓' : '...'}</span>
                        <button class="btn-del-sec" onclick="event.stopPropagation(); removeSection(${chIdx}, ${secIdx})">×</button>
                    </div>
                `).join('')}
                <button class="btn-circle" style="width:24px; height:24px; font-size:0.8rem; align-self:flex-start;" onclick="addSection(${chIdx})">+</button>
            </div>
        `;
        container.appendChild(div);
    });
}

function renderEditor() {
    const { chapter, section } = state.activeIndex;
    const ch = state.chapters[chapter];
    const sec = ch?.sections[section];
    if (!sec) {
        qs('#active-section-title').textContent = "請選擇章節";
        qs('#main-editor').value = "";
        return;
    }
    qs('#active-section-title').textContent = `${ch.title} > ${sec.title}`;
    qs('#main-editor').value = sec.content || "";
    
    // 綁定編輯內容回存
    qs('#main-editor').oninput = (e) => {
        sec.content = e.target.value;
        renderChapters(); // 更新打勾狀態
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
    qs('#btn-ai-gen-content').addEventListener('click', aiGenSectionContent);
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
    state.chapters[chIdx].sections.splice(secIdx, 1);
    renderChapters();
}

function removeChar(idx) {
    state.characters.splice(idx, 1);
    renderCharacters();
}

function removeChapter(idx) {
    state.chapters.splice(idx, 1);
    renderChapters();
}

// ====== AI 功能 (串接 debug_server.py) ======

async function aiGenChapterOutline(chIdx) {
    const chapter = state.chapters[chIdx];
    if (!chapter.description) {
        alert("請先填寫「章說明」文字欄，以便 AI 產生大綱。");
        return;
    }

    try {
        const payload = {
            description: chapter.description,
            characters: state.characters.map(id => cloudCharacters.find(c => c.id === id)?.card_json).filter(Boolean)
        };
        const res = await callDebugServer('/api/generate_outline', payload);
        if (res && res.debug_prompt) {
            console.log("=== AI Outline Prompt ===\n", res.debug_prompt);
        }
        if (res && res.sections) {
            chapter.sections = res.sections.map(s => ({ title: s, content: "" }));
            renderChapters();
        }
    } catch (e) {
        console.error(e);
        alert("AI 生成大綱失敗，請確認 debug_server.py 是否啟動。");
    }
}

async function aiGenSectionContent() {
    const { chapter, section } = state.activeIndex;
    const ch = state.chapters[chapter];
    const sec = ch.sections[section];
    
    if (state.characters.filter(Boolean).length === 0) {
        alert("請至少選擇一位登場角色。");
        return;
    }

    const btn = qs('#btn-ai-gen-content');
    btn.disabled = true;
    btn.textContent = "⌛ AI 正在寫作中...";

    try {
        const payload = {
            characters: state.characters.map(id => cloudCharacters.find(c => c.id === id)?.card_json).filter(Boolean),
            context: {
                chapter_title: ch.title,
                chapter_desc: ch.description,
                section_title: sec.title
            }
        };

        const res = await callDebugServer('/api/generate_story_content', payload);
        if (res && res.debug_prompt) {
            console.log("=== AI Story Content Prompt ===\n", res.debug_prompt);
        }
        if (res && res.content) {
            sec.content = res.content;
            renderEditor();
            renderChapters();
        }
    } catch (e) {
        alert("AI 寫作失敗。");
    } finally {
        btn.disabled = false;
        btn.textContent = "🤖 AI 產生本節小說";
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

async function saveProject() {
    const name = prompt("請輸入專案名稱：", state.projectName);
    if (!name) return;
    state.projectName = name;
    
    try {
        const sb = window.SupabaseClient.getClient();
        const { error } = await sb.from('story_projects').upsert({
            name: state.projectName,
            data: state,
            updated_at: new Date()
        }, { onConflict: 'name' });
        
        if (!error) {
            alert("✅ 專案已同步至雲端！");
            return;
        }
    } catch (e) { }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", state.projectName + ".json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.removeChild(downloadAnchor);
}

async function loadProject() {
    try {
        const sb = window.SupabaseClient.getClient();
        const { data, error } = await sb.from('story_projects').select('*').order('updated_at', { ascending: false }).limit(5);
        if (data && data.length > 0) {
            const listStr = data.map((d, i) => `${i + 1}. ${d.name}`).join("\n");
            const choice = prompt("請選擇專案編號：\n" + listStr);
            if (choice && data[choice - 1]) {
                state = data[choice - 1].data;
                renderAll();
                alert("✅ 成功讀取雲端專案");
                return;
            }
        }
    } catch (e) { }

    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = e => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.readAsText(file, 'UTF-8');
        reader.onload = readerEvent => {
            state = JSON.parse(readerEvent.target.result);
            renderAll();
            alert("✅ 成功讀取檔案");
        }
    };
    input.click();
}
