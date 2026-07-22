/**
 * ZoomitAnnotate — 簡報畫面標註工具（模仿 Microsoft ZoomIt 的畫筆功能）
 * ============================================================================
 * 用途：上台簡報時可用滑鼠在畫面上暫時畫線條／圖形，方便講解重點，不會動到簡報本身的 DOM。
 *
 * 使用方法（任何簡報 .html 都可套用）：
 *   在 </body> 前加一行：
 *     <script src="zoomit_annotate.js" defer></script>
 *   （若此 .js 檔跟 .html 不在同一資料夾，請自行調整相對路徑）
 *   不需要呼叫任何函式，載入後就會自動監聽快捷鍵。
 *
 * 快捷鍵：
 *   Alt + A          啟動 / 關閉標註工具（關閉時會保留目前畫面上的塗鴉，下次 Alt+A 再打開會繼續顯示）
 *   Esc              退出標註工具（同樣不會清除塗鴉）
 *   W                白板（全螢幕覆蓋白色背景，再按一次取消）
 *   K                黑板（全螢幕覆蓋黑色背景，再按一次取消）
 *   1~9              設定筆的粗細：1 = 3px ... 9 = 27px（間距 3px）
 *   R / Shift+R       紅色畫筆 / 紅色螢光筆
 *   G / Shift+G       綠色畫筆 / 綠色螢光筆
 *   B / Shift+B       藍色畫筆 / 藍色螢光筆
 *   Y / Shift+Y       黃色畫筆 / 黃色螢光筆
 *   O / Shift+O       橙色畫筆 / 橙色螢光筆
 *   P / Shift+P       粉紅畫筆 / 粉紅螢光筆
 *   X                模糊筆（塗抹處會即時模糊背後畫面，適合遮蔽敏感資訊）
 *   E                橡皮擦
 *   C                清除目前所有畫面上的塗鴉（含模糊筆效果與黑白板背景）
 *   H                顯示／隱藏左下角的熱鍵表
 *
 * 拖曳滑鼠繪圖時的形狀修飾鍵（啟動工具、且工具不是模糊筆時才有效）：
 *   （不按任何鍵）    徒手畫線（依滑鼠移動軌跡繪製）
 *   按住 Shift        繪製直線
 *   按住 Ctrl         繪製矩形
 *   按住 Ctrl+Shift   繪製箭號
 *
 * 設計重點：
 * - 啟動時會在 <body> 內插入一層全螢幕、最高 z-index 的覆蓋層，攔截所有滑鼠點擊與相關鍵盤快捷鍵，
 *   避免誤觸簡報原本的翻頁 / 筆記等功能；未啟動時完全不影響原本頁面行為。
 * - 採「retained mode」設計：所有已完成的筆劃存在 ops 陣列中，每次重繪畫布時全部依序重新繪製，
 *   這樣才能支援拖曳中的即時預覽（直線／矩形／箭號），以及視窗尺寸改變後重新繪製。
 * - 「模糊筆」不是用 canvas 模擬，而是用 CSS backdrop-filter 疊加半透明圓形色塊，
 *   讓瀏覽器直接對「背後的真實畫面」做模糊處理，效果比較接近 ZoomIt 實際效果。
 * ============================================================================
 */
(function () {
    'use strict';

    // ------------------------------------------------------------------
    // 顏色表：R / G / B / Y / O / P 六色，對應畫筆與螢光筆共用同一組顏色
    // ------------------------------------------------------------------
    const COLORS = {
        r: '#ff3b30', // 紅
        g: '#34c759', // 綠
        b: '#0a84ff', // 藍
        y: '#ffd60a', // 黃
        o: '#ff9500', // 橙
        p: '#ff2d95', // 粉紅
    };

    // ------------------------------------------------------------------
    // 內部狀態
    // ------------------------------------------------------------------
    const state = {
        active: false,          // 標註工具是否啟動中
        tool: 'pen',            // 'pen' | 'highlighter' | 'eraser' | 'blur'
        color: COLORS.r,        // 目前顏色（eraser/blur 不使用）
        size: 9,                // 筆刷粗細（px），對應數字鍵 3（預設值）
        bg: null,               // null | 'white' | 'black'：白板／黑板背景
        showHotkeys: false,     // 是否顯示左下角熱鍵表
    };

    let ops = [];                // 已完成的筆劃／圖形（retained mode 繪圖清單）
    let currentOp = null;        // 拖曳中、尚未放開滑鼠的「進行中」筆劃
    let drawing = false;         // 滑鼠左鍵是否按住中
    let blurStamps = [];         // 模糊筆留下的 DOM 色塊清單
    let lastBlurPoint = null;    // 模糊筆節流用：上一個蓋章座標

    // 覆蓋層相關 DOM（第一次啟動時才建立，之後重複使用）
    let elOverlay = null;
    let elBg = null;
    let elBlurLayer = null;
    let elCanvas = null;
    let elHud = null;
    let elHotkeyPanel = null;

    // ------------------------------------------------------------------
    // 建立覆蓋層 DOM（只在第一次啟動時執行一次）
    // ------------------------------------------------------------------
    function ensureOverlay() {
        if (elOverlay) return;

        elOverlay = document.createElement('div');
        elOverlay.id = 'zoomit-overlay';
        elOverlay.style.cssText =
            'position:fixed; inset:0; z-index:2147483000; cursor:crosshair; ' +
            'display:none; user-select:none; -webkit-user-select:none;';

        // 白板／黑板背景層（最底層）
        elBg = document.createElement('div');
        elBg.id = 'zoomit-bg';
        elBg.style.cssText = 'position:absolute; inset:0; background:transparent;';

        // 模糊筆的色塊容器（背景之上、畫布之下）
        elBlurLayer = document.createElement('div');
        elBlurLayer.id = 'zoomit-blur-layer';
        elBlurLayer.style.cssText = 'position:absolute; inset:0; overflow:hidden;';

        // 畫筆／螢光筆／橡皮擦／形狀的實際畫布（最上層，負責攔截滑鼠事件）
        elCanvas = document.createElement('canvas');
        elCanvas.id = 'zoomit-canvas';
        elCanvas.style.cssText = 'position:absolute; inset:0; width:100%; height:100%;';

        // 左下角狀態指示（目前工具／顏色／粗細）
        elHud = document.createElement('div');
        elHud.id = 'zoomit-hud';
        elHud.style.cssText =
            'position:absolute; left:16px; bottom:16px; padding:6px 14px; ' +
            'background:rgba(0,0,0,0.6); color:#fff; ' +
            'font:13px/1.4 -apple-system, "Noto Sans TC", sans-serif; ' +
            'border-radius:8px; pointer-events:none; white-space:nowrap;';

        // 左下角熱鍵表（預設隱藏，按 H 顯示／隱藏，疊在狀態列正上方）
        elHotkeyPanel = document.createElement('div');
        elHotkeyPanel.id = 'zoomit-hotkey-panel';
        elHotkeyPanel.style.cssText =
            'position:absolute; left:16px; bottom:56px; padding:12px 16px; ' +
            'background:rgba(0,0,0,0.75); color:#fff; ' +
            'font:13px/1.6 -apple-system, "Noto Sans TC", sans-serif; ' +
            'border-radius:8px; pointer-events:none; white-space:pre; display:none;';
        elHotkeyPanel.textContent = buildHotkeyPanelText();

        elOverlay.appendChild(elBg);
        elOverlay.appendChild(elBlurLayer);
        elOverlay.appendChild(elCanvas);
        elOverlay.appendChild(elHotkeyPanel);
        elOverlay.appendChild(elHud);
        document.body.appendChild(elOverlay);

        elCanvas.addEventListener('mousedown', (e) => { e.preventDefault(); onPointerDown(e); });
        elCanvas.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
        window.addEventListener('resize', resizeCanvas);
        // 畫圖時不希望跳出瀏覽器右鍵選單打斷操作
        elCanvas.addEventListener('contextmenu', (e) => { if (state.active) e.preventDefault(); });
    }

    // 依目前視窗大小調整畫布解析度（支援高解析度螢幕），並重繪內容
    function resizeCanvas() {
        if (!elCanvas || !state.active) return;
        const dpr = window.devicePixelRatio || 1;
        elCanvas.width = Math.round(window.innerWidth * dpr);
        elCanvas.height = Math.round(window.innerHeight * dpr);
        const ctx = elCanvas.getContext('2d');
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        renderCanvas();
    }

    // ------------------------------------------------------------------
    // 繪圖（retained mode：每次都把 ops 全部重畫一次，最後加上進行中的 currentOp 當預覽）
    // ------------------------------------------------------------------
    function renderCanvas() {
        if (!elCanvas) return;
        const ctx = elCanvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, elCanvas.width, elCanvas.height);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.restore();

        const list = currentOp ? ops.concat([currentOp]) : ops;
        for (const op of list) drawOp(ctx, op);
    }

    function drawOp(ctx, op) {
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = op.size;
        ctx.strokeStyle = op.color;
        ctx.fillStyle = op.color;
        ctx.globalCompositeOperation = op.tool === 'eraser' ? 'destination-out' : 'source-over';
        ctx.globalAlpha = op.tool === 'highlighter' ? 0.35 : 1;

        if (op.shape === 'free') {
            if (op.points.length < 2) {
                // 只點一下沒有拖曳：畫一個小圓點，避免完全看不到反應
                ctx.beginPath();
                ctx.arc(op.points[0].x, op.points[0].y, op.size / 2, 0, Math.PI * 2);
                ctx.fill();
            } else {
                ctx.beginPath();
                ctx.moveTo(op.points[0].x, op.points[0].y);
                for (let i = 1; i < op.points.length; i++) ctx.lineTo(op.points[i].x, op.points[i].y);
                ctx.stroke();
            }
        } else if (op.shape === 'line') {
            ctx.beginPath();
            ctx.moveTo(op.start.x, op.start.y);
            ctx.lineTo(op.end.x, op.end.y);
            ctx.stroke();
        } else if (op.shape === 'rect') {
            ctx.strokeRect(
                Math.min(op.start.x, op.end.x),
                Math.min(op.start.y, op.end.y),
                Math.abs(op.end.x - op.start.x),
                Math.abs(op.end.y - op.start.y)
            );
        } else if (op.shape === 'arrow') {
            drawArrow(ctx, op.start, op.end, op.size);
        }
        ctx.restore();
    }

    // 畫箭號：一條線 + 兩段箭頭斜線
    function drawArrow(ctx, start, end, size) {
        const headLen = Math.max(14, size * 2.2);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - headLen * Math.cos(angle - Math.PI / 6), end.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(end.x, end.y);
        ctx.lineTo(end.x - headLen * Math.cos(angle + Math.PI / 6), end.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
    }

    // ------------------------------------------------------------------
    // 滑鼠事件：畫筆／螢光筆／橡皮擦／形狀 走 canvas；模糊筆走 DOM 色塊
    // ------------------------------------------------------------------
    function pointFromEvent(e) {
        const rect = elCanvas.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    // 依拖曳當下按住的修飾鍵決定形狀：Ctrl+Shift=箭號、Ctrl=矩形、Shift=直線、都不按=徒手畫
    function determineShape(e) {
        if (e.ctrlKey && e.shiftKey) return 'arrow';
        if (e.ctrlKey) return 'rect';
        if (e.shiftKey) return 'line';
        return 'free';
    }

    function onPointerDown(e) {
        if (!state.active || e.button !== 0) return;
        drawing = true;

        if (state.tool === 'blur') {
            lastBlurPoint = null;
            addBlurStamp(pointFromEvent(e));
            return;
        }

        const p = pointFromEvent(e);
        currentOp = {
            tool: state.tool,
            shape: determineShape(e),
            color: state.color,
            size: state.size,
            points: [p],
            start: p,
            end: p,
        };
        renderCanvas();
    }

    function onPointerMove(e) {
        if (!state.active || !drawing) return;

        if (state.tool === 'blur') {
            addBlurStamp(pointFromEvent(e));
            return;
        }
        if (!currentOp) return;

        const p = pointFromEvent(e);
        if (currentOp.shape === 'free') {
            currentOp.points.push(p);
        } else {
            currentOp.end = p;
        }
        renderCanvas();
    }

    function onPointerUp() {
        if (!state.active || !drawing) return;
        drawing = false;
        lastBlurPoint = null;
        if (currentOp) {
            ops.push(currentOp);
            currentOp = null;
            renderCanvas();
        }
    }

    // 模糊筆：沿滑鼠路徑放置半透明圓形色塊，靠 CSS backdrop-filter 模糊「背後真實畫面」
    function addBlurStamp(p) {
        if (lastBlurPoint) {
            const dx = p.x - lastBlurPoint.x;
            const dy = p.y - lastBlurPoint.y;
            if (Math.sqrt(dx * dx + dy * dy) < 8) return; // 節流：滑鼠移動太小就不重複蓋章，避免效能問題
        }
        lastBlurPoint = p;

        const size = Math.max(28, state.size * 3);
        const div = document.createElement('div');
        div.className = 'zoomit-blur-stamp';
        div.style.cssText =
            `position:absolute; left:${p.x - size / 2}px; top:${p.y - size / 2}px; ` +
            `width:${size}px; height:${size}px; border-radius:50%; ` +
            'backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); pointer-events:none;';
        elBlurLayer.appendChild(div);
        blurStamps.push(div);
    }

    // ------------------------------------------------------------------
    // 工具／顏色／粗細／背景 切換
    // ------------------------------------------------------------------
    function setPen(color) { state.tool = 'pen'; state.color = color; updateHud(); }
    function setHighlighter(color) { state.tool = 'highlighter'; state.color = color; updateHud(); }
    function setEraser() { state.tool = 'eraser'; updateHud(); }
    function setBlur() { state.tool = 'blur'; updateHud(); }
    function setSize(n) { state.size = n * 3; updateHud(); }

    // 白板／黑板為切換式：再按一次同一顆鍵會取消背景，改按另一顆會直接切換
    function setBg(mode) {
        state.bg = (state.bg === mode) ? null : mode;
        if (elBg) {
            elBg.style.background = state.bg === 'white' ? '#ffffff' : state.bg === 'black' ? '#000000' : 'transparent';
        }
        updateHud();
    }

    function clearAll() {
        ops = [];
        currentOp = null;
        blurStamps.forEach((d) => d.remove());
        blurStamps = [];
        lastBlurPoint = null;
        state.bg = null;
        if (elBg) elBg.style.background = 'transparent';
        renderCanvas();
        updateHud();
    }

    // 熱鍵表內容（純文字，H 鍵切換顯示於左下角）
    function buildHotkeyPanelText() {
        return [
            '⌨️ 熱鍵表',
            'Alt+A  啟動／關閉　Esc  退出　H  顯示／隱藏本表',
            'W  白板　K  黑板　C  清除全部',
            '1~9  筆刷粗細 (3~27px)',
            'R/G/B/Y/O/P  紅/綠/藍/黃/橙/粉畫筆',
            'Shift+同色鍵  對應螢光筆',
            'X  模糊筆　E  橡皮擦',
            '拖曳時：Shift=直線　Ctrl=矩形　Ctrl+Shift=箭號',
        ].join('\n');
    }

    function toggleHotkeyPanel() {
        state.showHotkeys = !state.showHotkeys;
        if (elHotkeyPanel) elHotkeyPanel.style.display = state.showHotkeys ? 'block' : 'none';
    }

    const TOOL_LABELS = { pen: '畫筆', highlighter: '螢光筆', eraser: '橡皮擦', blur: '模糊筆' };
    function updateHud() {
        if (!elHud) return;
        const bgText = state.bg === 'white' ? '・白板' : state.bg === 'black' ? '・黑板' : '';
        if (state.tool === 'pen' || state.tool === 'highlighter') {
            elHud.innerHTML =
                `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;` +
                `background:${state.color};margin-right:6px;vertical-align:middle;"></span>` +
                `${TOOL_LABELS[state.tool]}・粗細 ${state.size}px${bgText}　` +
                `(Alt+A 開關 / Esc 退出 / C 清除 / H 熱鍵表)`;
        } else {
            elHud.textContent = `${TOOL_LABELS[state.tool]}・粗細 ${state.size}px${bgText}　(Alt+A 開關 / Esc 退出 / C 清除 / H 熱鍵表)`;
        }
    }

    // ------------------------------------------------------------------
    // 啟動 / 關閉（Esc 或再按一次 Alt+A 只是隱藏覆蓋層，不會清除已畫的內容）
    // ------------------------------------------------------------------
    function activate() {
        if (state.active) return;
        ensureOverlay();
        state.active = true;
        elOverlay.style.display = 'block';
        resizeCanvas();
        updateHud();
    }

    function deactivate() {
        if (!state.active) return;
        state.active = false;
        drawing = false;
        currentOp = null;
        if (elOverlay) elOverlay.style.display = 'none';
    }

    function toggle() { state.active ? deactivate() : activate(); }

    // ------------------------------------------------------------------
    // 鍵盤事件：用 capture 階段搶在頁面自身的 keydown 監聽器之前攔截
    // ------------------------------------------------------------------
    function isToggleHotkey(e) {
        return e.altKey && !e.ctrlKey && (e.key === 'a' || e.key === 'A' || e.code === 'KeyA');
    }

    function onKeyDown(e) {
        // Alt+A：不論工具目前是否啟動，都要攔截並切換
        if (isToggleHotkey(e)) {
            e.preventDefault();
            e.stopPropagation();
            toggle();
            return;
        }

        if (!state.active) return; // 工具未啟動時，其餘按鍵一律不攔截，讓簡報原本快捷鍵正常運作

        const k = e.key.toLowerCase();
        const isDigit = /^[1-9]$/.test(k);
        const isHandled = e.key === 'Escape' || isDigit || 'wkcexrgbyoph'.indexOf(k) !== -1;
        if (!isHandled) return; // 例如 F5、F11、Ctrl+Shift+I 等瀏覽器快捷鍵維持原本行為，不攔截

        e.preventDefault();
        e.stopPropagation();
        if (typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();

        if (e.key === 'Escape') { deactivate(); return; }
        if (isDigit) { setSize(parseInt(k, 10)); return; }

        switch (k) {
            case 'w': setBg('white'); break;
            case 'k': setBg('black'); break;
            case 'c': clearAll(); break;
            case 'e': setEraser(); break;
            case 'x': setBlur(); break;
            case 'h': toggleHotkeyPanel(); break;
            case 'r': e.shiftKey ? setHighlighter(COLORS.r) : setPen(COLORS.r); break;
            case 'g': e.shiftKey ? setHighlighter(COLORS.g) : setPen(COLORS.g); break;
            case 'b': e.shiftKey ? setHighlighter(COLORS.b) : setPen(COLORS.b); break;
            case 'y': e.shiftKey ? setHighlighter(COLORS.y) : setPen(COLORS.y); break;
            case 'o': e.shiftKey ? setHighlighter(COLORS.o) : setPen(COLORS.o); break;
            case 'p': e.shiftKey ? setHighlighter(COLORS.p) : setPen(COLORS.p); break;
        }
    }

    document.addEventListener('keydown', onKeyDown, true);

    // 對外暴露最基本的控制介面，方便未來若想加上按鈕觸發（非必要，僅供擴充）
    window.ZoomitAnnotate = { activate, deactivate, toggle };
})();
