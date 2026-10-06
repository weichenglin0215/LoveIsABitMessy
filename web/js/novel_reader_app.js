/**
 * novel_reader_app.js ── 「花小說」（web/novel_reader.html）閱讀邏輯
 * ------------------------------------------------------------
 * 功能：
 *   1. 從 Supabase 的 published_novels 讀取小說列表與內文（唯讀）。
 *   2. 以「整數行高 × 整數行數」為一頁，用捲動（scrollTop / scrollLeft）翻頁，
 *      橫式／直式共用同一套機制，不使用 CSS 多欄。
 *   3. 閱讀位置記錄成「字元位置（offset）」而不是頁碼：
 *      字體尺寸、橫直排、視窗大小都會改變頁數，但「第幾個字」永遠不變。
 *      記錄的是「當時那一頁的第一個字」。
 *   4. 選項（字型／粗細／字級／字距／行距／橫直排／配色）、閱讀位置都只存在 localStorage（此瀏覽器）。
 *
 * 字元位置的定義（發佈端與閱讀端必須一致）：
 *   把全書依序展開成「章標題、段落、段落…、下一章標題、段落…」，
 *   每個區塊（<h2>／<p>）都有 data-start = 該區塊第一個字在全書的位置；
 *   offset 以 JS 字串的 UTF-16 單位計，與瀏覽器 DOM 的文字偏移量相同。
 */
(function () {
  'use strict';

  // ════════════════════════════════════════════════════════════
  // 常數
  // ════════════════════════════════════════════════════════════
  const SETTINGS_KEY = 'novel_reader_settings_v1';   // localStorage：選項
  const POSITIONS_KEY = 'novel_reader_positions_v1'; // localStorage：{ 小說id: { offset, savedAt } }
  const LAST_BOOK_KEY = 'novel_reader_last_book_v1'; // localStorage：上次閱讀的小說 id
  const NOVEL_TABLE = 'published_novels';            // Supabase 資料表（見 supabase/schema_published_novels.sql）
  const KAI_FONT_URL = 'fonts/edukai-5.1_20251208.ttf';    // 教育部標準楷書（與網頁同在 web/fonts/，不論伺服器根目錄設在哪都讀得到）
  const KAI_SYSTEM_FONTS = ['標楷體', 'DFKai-SB', 'BiauKai']; // 系統內建的標楷體：Windows＝標楷體／DFKai-SB、macOS＝BiauKai
  const KAI_FONT_FAMILY = 'EduKai';                        // 註冊的字型名稱，須與 css 的 --rd-font-kai 一致
  const KAI_CACHED_KEY = 'novel_reader_edukai_cached_v1';  // localStorage：曾經下載完成的旗標
  const QR_URL ='https://weichenglin0215.github.io/LoveIsABitMessy/web/novel_reader.html'; // 與 lpas_v3.html 相同的發佈網址格式

  const MAX_LINE_CHARS = 32;      // 每行最多字數：避免電腦寬螢幕一行過長不好讀
  const FONT_SIZE_MIN = 14;       // 字體尺寸範圍（px）
  const FONT_SIZE_MAX = 72;
  const LETTER_SPACING_MIN = 0;   // 字距範圍（單位 em，1em = 一個字的寬度）
  const LETTER_SPACING_MAX = 0.5;
  const LINE_SPACING_MIN = 1.2;   // 行距範圍（單位：倍，行高 = 字級 × 行距）
  const LINE_SPACING_MAX = 3;
  const SWIPE_MIN_PX = 50;        // 水平拖曳超過此距離視為「翻頁」
  const TAP_MAX_PX = 10;          // 移動不超過此距離視為「點擊」
  const TAP_ZONE_RATIO = 0.35;    // 畫面左／右 35% 為翻頁點擊區，中間不動作

  // 選項預設值：黑體、標準粗細、24px、字距 0.10、行距 1.5 倍、直式、淺黃底黑字
  // （「恢復預設值」按鈕與「尚未儲存過選項」時都使用這組值）
  const DEFAULT_SETTINGS = {
    font: 'sans', weight: 'normal', fontSize: 24, letterSpacing: 0.1, lineSpacing: 1.5,
    writing: 'vertical', theme: 'light'
  };
  // 選項的合法值（讀 localStorage 時用來擋掉被竄改或舊版本的值）
  //   font：sans 黑體／serif 宋體／kai 標楷體；weight：normal 標準／bold 粗體／xbold 超粗體
  //   theme：light 淺黃底黑字／dark 黑底淺黃字／white 白底黑字／black 黑底白字
  const SETTING_CHOICES = {
    font: ['sans', 'serif', 'kai'],
    weight: ['normal', 'bold', 'xbold'],
    writing: ['horizontal', 'vertical'],
    theme: ['light', 'dark', 'white', 'black']
  };

  // ════════════════════════════════════════════════════════════
  // 狀態
  // ════════════════════════════════════════════════════════════
  let settings = Object.assign({}, DEFAULT_SETTINGS);
  let positions = {};          // 各小說的閱讀位置
  let book = null;             // 目前開啟的小說：{ id, title, blocks:[{start,len,el}], totalChars }
  let currentOffset = 0;       // 目前閱讀位置（本頁第一個字）；只在「使用者翻頁」時更新，視窗縮放時沿用它重新找頁
  let pageIndex = 0;           // 目前頁（從 0 起算）
  let pageSize = 0;            // 一頁的「換行方向」尺寸（px）= 整數行 × 行高
  let totalPages = 1;
  let qrCreated = false;       // QR Code 只產生一次

  // ════════════════════════════════════════════════════════════
  // DOM 與小工具
  // ════════════════════════════════════════════════════════════
  const $ = (id) => document.getElementById(id);
  const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
  const isVertical = () => settings.writing === 'vertical';
  const errMsg = (e) => (e && e.message) ? e.message : String(e);

  function debounce(fn, ms) {
    let timer = null;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), ms);
    };
  }

  // localStorage 在無痕模式／被停用時會丟例外，所以一律包 try/catch，失敗就當作沒有
  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }
  function saveJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 存不了就算了，不影響閱讀 */ }
  }
  function removeKey(key) {
    try { localStorage.removeItem(key); } catch (e) { /* 同上 */ }
  }

  // ════════════════════════════════════════════════════════════
  // 選項（字型／粗細／字級／字距／行距／橫直排／配色）
  // ════════════════════════════════════════════════════════════

  // 單選項目：[radio 的 name, settings 的欄位]
  const RADIO_OPTIONS = [
    ['opt-font', 'font'], ['opt-weight', 'weight'], ['opt-writing', 'writing'], ['opt-theme', 'theme']
  ];

  // 滑桿項目：欄位、最小／最大值、步進、數值顯示格式。
  //   inputId 對應 <input type="range">，valueId 對應旁邊顯示數值的 <span>
  const SLIDER_OPTIONS = [
    {
      key: 'fontSize', inputId: 'opt-font-size', valueId: 'opt-font-size-value',
      min: FONT_SIZE_MIN, max: FONT_SIZE_MAX, step: 1, format: (v) => v + ' px'
    },
    {
      key: 'letterSpacing', inputId: 'opt-letter-spacing', valueId: 'opt-letter-spacing-value',
      min: LETTER_SPACING_MIN, max: LETTER_SPACING_MAX, step: 0.05, format: (v) => v.toFixed(2) + ' em'
    },
    {
      key: 'lineSpacing', inputId: 'opt-line-spacing', valueId: 'opt-line-spacing-value',
      min: LINE_SPACING_MIN, max: LINE_SPACING_MAX, step: 0.1, format: (v) => v.toFixed(1) + ' 倍'
    }
  ];

  // 把數值夾在範圍內並對齊步進（消除 0.1+0.2 這類浮點誤差，只留 2 位小數）
  function snapToStep(value, opt) {
    const snapped = Math.round(value / opt.step) * opt.step;
    return Number(clamp(snapped, opt.min, opt.max).toFixed(2));
  }

  // 讀取並驗證已儲存的選項，缺少或不合法的欄位退回預設值
  function loadSettings() {
    const saved = loadJson(SETTINGS_KEY, {});
    const s = Object.assign({}, DEFAULT_SETTINGS);
    Object.keys(SETTING_CHOICES).forEach((key) => {
      if (SETTING_CHOICES[key].includes(saved[key])) s[key] = saved[key];
    });
    SLIDER_OPTIONS.forEach((opt) => {
      const n = Number(saved[opt.key]);
      if (saved[opt.key] !== undefined && saved[opt.key] !== null && Number.isFinite(n)) s[opt.key] = snapToStep(n, opt);
    });
    return s;
  }

  // 把選項反映到 <html> 的 data 屬性（CSS 依此切換配色／字型／粗細／直橫排），並重新排版
  function applySettings() {
    const root = document.documentElement;
    root.dataset.theme = settings.theme;
    root.dataset.writing = settings.writing;
    root.dataset.font = settings.font;
    root.dataset.weight = settings.weight;
    // 手機瀏覽器的網址列顏色跟著標題列走
    const meta = $('meta-theme-color');
    if (meta) meta.content = getComputedStyle($('rd-topbar')).backgroundColor;
    if (settings.font === 'kai') ensureKaiFont(); // 用到標楷體才下載字型檔（啟動時已存為標楷體、切換、重新整理都會經過這裡）
    relayout();
  }

  // ════════════════════════════════════════════════════════════
  // 標楷體：教育部標準楷書（fonts/edukai-5.1_20251208.ttf，約 15MB）
  // ════════════════════════════════════════════════════════════
  // 檔案很大，所以不隨網頁載入，而是第一次用到「標楷體」時才下載：
  //   * 下載期間顯示「下載字型」彈窗與進度，完成後自動關閉並重新排版（閱讀位置不變）；
  //   * 下載完成後記一筆旗標；之後再開網頁，檔案多半已在瀏覽器快取、瞬間讀完，
  //     所以有旗標時彈窗延遲 0.6 秒才出現（讀得快就不會閃一下彈窗）；
  //   * 下載期間／失敗時，CSS 字型清單會先用裝置本身的楷體或宋體頂替。
  let kaiFontPromise = null;   // 已開始下載就不重複下載
  let kaiFontFailed = false;   // 上次下載失敗：使用者再次選「標楷體」時才重試，避免每次調整滑桿都重試

  function setKaiDownloadStatus(text, ratio) {
    $('font-download-status').textContent = text;
    const bar = $('font-download-bar');
    if (ratio === null) bar.removeAttribute('value'); // 不知道總大小：顯示不確定進度的動畫條
    else bar.value = Math.round(ratio * 100);
  }

  // 以串流下載字型檔並回報進度，回傳 ArrayBuffer（用 fetch 而不是 CSS @font-face，才拿得到進度）
  async function fetchFontWithProgress(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const total = Number(res.headers.get('Content-Length')) || 0;
    const reader = res.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      const mb = (received / 1048576).toFixed(1);
      if (total) setKaiDownloadStatus(mb + ' / ' + (total / 1048576).toFixed(1) + ' MB', received / total);
      else setKaiDownloadStatus('已下載 ' + mb + ' MB', null);
    }
    return new Blob(chunks).arrayBuffer();
  }

  // 偵測系統有沒有安裝某個字型：瀏覽器沒有直接詢問「有沒有這個字型」的 API，
  // 所以用 canvas 畫同一串字，比較「指定字型」與「純 serif」兩張圖的像素——
  // 字型不存在時瀏覽器會退回 serif，兩張圖一模一樣；存在時字形不同。
  function hasSystemFont(names) {
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 360;
      canvas.height = 64;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const draw = (font) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.font = font;
        ctx.textBaseline = 'top';
        ctx.fillText('標楷體永國龍書愛鬱', 0, 4);
        return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      };
      const base = draw('48px serif');
      return names.some((name) => {
        const img = draw('48px "' + name + '", serif');
        for (let i = 0; i < img.length; i++) if (img[i] !== base[i]) return true;
        return false;
      });
    } catch (e) {
      return false; // 偵測失敗（例如瀏覽器為防指紋而封鎖 canvas 讀取）就當作沒有，改走下載
    }
  }

  function ensureKaiFont() {
    if (kaiFontPromise) return kaiFontPromise;
    // 系統已有標楷體（PC／Mac 常見）就直接用系統的，不下載 15MB 的教育部標準楷書
    if (hasSystemFont(KAI_SYSTEM_FONTS)) {
      kaiFontPromise = Promise.resolve();
      return kaiFontPromise;
    }
    kaiFontFailed = false;
    const knownCached = loadJson(KAI_CACHED_KEY, false);
    setKaiDownloadStatus('準備下載…', null);
    // 第一次下載：立刻顯示彈窗；曾經下載過：可能秒讀完，延遲 0.6 秒再顯示
    const showModal = () => openModal('modal-font-download');
    const timer = knownCached ? setTimeout(showModal, 600) : (showModal(), null);
    kaiFontPromise = (async () => {
      try {
        const buffer = await fetchFontWithProgress(KAI_FONT_URL);
        const face = new FontFace(KAI_FONT_FAMILY, buffer);
        await face.load();
        document.fonts.add(face);
        saveJson(KAI_CACHED_KEY, true);
        clearTimeout(timer);
        closeModal('modal-font-download');   // 下載完成，自動關閉彈窗
        relayout();                          // 字形換成楷書後重新排版，閱讀位置不變
      } catch (e) {
        clearTimeout(timer);
        kaiFontFailed = true;
        showModal();                         // 失敗時不自動關閉，讓使用者看到原因
        setKaiDownloadStatus('下載失敗：' + errMsg(e) + '\n目前改用裝置內建的楷體／宋體顯示。', 0);
      }
    })();
    return kaiFontPromise;
  }

  // 把目前選項同步到「選項」彈窗的控制項
  function syncOptionControls() {
    RADIO_OPTIONS.forEach(([name, key]) => {
      document.querySelectorAll('input[name="' + name + '"]').forEach((r) => { r.checked = r.value === settings[key]; });
    });
    SLIDER_OPTIONS.forEach((opt) => {
      $(opt.inputId).value = settings[opt.key];
      $(opt.valueId).textContent = opt.format(settings[opt.key]);
    });
  }

  function bindOptionControls() {
    // 單選：變更就存檔並套用
    RADIO_OPTIONS.forEach(([name, key]) => {
      document.querySelectorAll('input[name="' + name + '"]').forEach((radio) => {
        radio.addEventListener('change', () => {
          if (!radio.checked) return;
          settings[key] = radio.value;
          saveJson(SETTINGS_KEY, settings);
          // 上次下載標楷體失敗，這次明確再選它就重試一次
          if (key === 'font' && radio.value === 'kai' && kaiFontFailed) kaiFontPromise = null;
          applySettings();
        });
      });
    });
    // 滑桿：拖曳時即時更新數字，停手 150ms 後才重新排版（長篇小說排版較耗時）
    const applySliders = debounce(() => { saveJson(SETTINGS_KEY, settings); applySettings(); }, 150);
    SLIDER_OPTIONS.forEach((opt) => {
      $(opt.inputId).addEventListener('input', (e) => {
        settings[opt.key] = snapToStep(Number(e.target.value), opt);
        $(opt.valueId).textContent = opt.format(settings[opt.key]);
        applySliders();
      });
    });
    $('btn-reset-options').addEventListener('click', resetSettings);
  }

  // 「恢復預設值」：全部選項（字型／粗細／字級／字距／行距／排列／配色）回到 DEFAULT_SETTINGS。
  // 直接刪除已儲存的選項而不是把預設值寫進去：之後若再調整預設值，沒有自訂過的人會自動跟著更新。
  // 排版會重算，但閱讀位置（currentOffset）不變，仍停在同一段文字。
  function resetSettings() {
    settings = Object.assign({}, DEFAULT_SETTINGS);
    removeKey(SETTINGS_KEY);
    syncOptionControls();
    applySettings();
  }

  // ════════════════════════════════════════════════════════════
  // 小說內容渲染
  // ════════════════════════════════════════════════════════════

  // 把 chapters（[{title, paragraphs[]}]）畫成 <h2>／<p>，並建立 blocks 索引供「字元位置 ⇄ 畫面位置」換算
  function renderBook(id, title, chapters) {
    const frag = document.createDocumentFragment();
    const blocks = [];
    let offset = 0;

    // 新增一個區塊：data-start 記錄它第一個字在全書的位置
    const addBlock = (tag, text) => {
      const el = document.createElement(tag);
      el.textContent = text;
      el.dataset.start = String(offset);
      frag.appendChild(el);
      blocks.push({ start: offset, len: text.length, el: el });
      offset += text.length;
    };

    (Array.isArray(chapters) ? chapters : []).forEach((ch) => {
      const chTitle = String((ch && ch.title) || '').trim();
      if (chTitle) addBlock('h2', chTitle);
      ((ch && ch.paragraphs) || []).forEach((p) => {
        const text = String(p).trim();
        if (text) addBlock('p', text);
      });
    });

    $('rd-text').replaceChildren(frag);
    book = { id: String(id), title: title, blocks: blocks, totalChars: offset };
  }

  // ════════════════════════════════════════════════════════════
  // 排版與翻頁
  // ════════════════════════════════════════════════════════════

  // 行高（整數 px）= 字級 × 行距倍數；排版與「找本頁第一個字」都要用同一個值
  function getLineHeight() {
    return Math.round(settings.fontSize * settings.lineSpacing);
  }

  // 依字級、視窗大小，精算閱讀視窗的寬高，讓「一頁 = 整數行」「一行 = 整數字」。
  //   換行方向（block）：橫式為垂直、直式為水平 → 尺寸取「整數行高」的倍數，頁尾不會切到半行
  //   行內方向（inline）：橫式為水平、直式為垂直 → 尺寸取「整數字寬（字級＋字距）」的倍數，每行剛好排滿
  // 行高與字距都取整數 px：小數 px 會在整頁累積誤差，導致頁尾切到半行或行尾多出空隙。
  function layoutViewport() {
    const stage = $('rd-stage');
    const viewport = $('rd-viewport');
    const fs = settings.fontSize;
    const lh = getLineHeight();
    const ls = Math.round(fs * settings.letterSpacing); // 字距（px）：加在每個字後面
    const adv = fs + ls;                                 // 一個全形字在行內佔的寬度
    viewport.style.setProperty('--rd-fs', fs + 'px');
    viewport.style.setProperty('--rd-lh', lh + 'px');
    viewport.style.setProperty('--rd-ls', ls + 'px');
    viewport.style.setProperty('--rd-adv', adv + 'px');

    const cs = getComputedStyle(stage);
    const availW = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const availH = stage.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const vertical = isVertical();
    const blockAvail = vertical ? availW : availH;
    const inlineAvail = vertical ? availH : availW;

    pageSize = Math.max(1, Math.floor(blockAvail / lh)) * lh;
    const inlineSize = Math.max(1, Math.min(Math.floor(inlineAvail / adv), MAX_LINE_CHARS)) * adv;
    viewport.style.width = (vertical ? pageSize : inlineSize) + 'px';
    viewport.style.height = (vertical ? inlineSize : pageSize) + 'px';

    // 讀 scrollWidth／scrollHeight 會強制瀏覽器先完成排版，才能得到正確的總長度
    const scrollSize = vertical ? viewport.scrollWidth : viewport.scrollHeight;
    totalPages = Math.max(1, Math.ceil(scrollSize / pageSize - 0.02));
  }

  // 已捲動的距離（永遠為正）：橫式看 scrollTop；直式文字往左延伸，scrollLeft 為負值
  function getScrollDistance() {
    const viewport = $('rd-viewport');
    return isVertical() ? -viewport.scrollLeft : viewport.scrollTop;
  }

  // 捲到指定頁（不播放動畫，立即切換）
  function scrollToPage() {
    const viewport = $('rd-viewport');
    const distance = pageIndex * pageSize;
    if (isVertical()) viewport.scrollLeft = -distance;
    else viewport.scrollTop = distance;
  }

  // 重新排版並維持閱讀位置：沿用 currentOffset 找出它在新版面的哪一頁
  function relayout() {
    if (!book) return;
    layoutViewport();
    pageIndex = offsetToPageIndex(currentOffset);
    scrollToPage();
    updateProgress();
  }

  function updateProgress() {
    $('rd-progress').textContent = book ? ('第 ' + (pageIndex + 1) + ' / ' + totalPages + ' 頁') : '';
  }

  // 以二分搜尋找出「包含此字元位置」的區塊（blocks 依 start 遞增排列）
  function findBlock(offset) {
    const blocks = book.blocks;
    if (!blocks.length) return null;
    let lo = 0, hi = blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (blocks[mid].start <= offset) lo = mid; else hi = mid - 1;
    }
    return blocks[lo];
  }

  // 字元位置 → 頁碼：量出那個字目前在畫面上的位置，換算成「從第一頁起點算起的距離」再除以頁長
  function offsetToPageIndex(offset) {
    if (!book || !book.blocks.length) return 0;
    const target = clamp(offset, 0, Math.max(0, book.totalChars - 1));
    const block = findBlock(target);
    const textNode = block.el.firstChild;
    const charIndex = clamp(target - block.start, 0, block.len - 1);

    // 取「該字」的外框；取一個字而不是游標位置，因為折疊的 Range 在部分瀏覽器會回傳全 0
    const range = document.createRange();
    range.setStart(textNode, charIndex);
    range.setEnd(textNode, charIndex + 1);
    const rect = range.getBoundingClientRect();
    const vp = $('rd-viewport').getBoundingClientRect();
    const scrolled = getScrollDistance();

    // 直式：由視窗右緣往左量；橫式：由視窗上緣往下量；都取字的中心點避免邊界誤差
    const pos = isVertical()
      ? (vp.right - (rect.left + rect.right) / 2) + scrolled
      : ((rect.top + rect.bottom) / 2 - vp.top) + scrolled;
    return clamp(Math.floor(pos / pageSize), 0, totalPages - 1);
  }

  // 由螢幕座標取得游標所在的文字節點與偏移（Chrome／Safari 與 Firefox 的 API 名稱不同）
  function caretFromPoint(x, y) {
    if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(x, y);
      return r ? { node: r.startContainer, offset: r.startOffset } : null;
    }
    if (document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(x, y);
      return p ? { node: p.offsetNode, offset: p.offset } : null;
    }
    return null;
  }

  // 目前這一頁「第一個字」的字元位置：探測閱讀起點（橫式＝左上角、直式＝右上角）的游標落點。
  // 第一行若落在留白（例如章標題上方的空行）就往下一行再試，最多試 8 行。
  function getPageStartOffset() {
    const vp = $('rd-viewport').getBoundingClientRect();
    const fs = settings.fontSize;
    const lh = getLineHeight();
    const textEl = $('rd-text');
    for (let line = 0; line < 8; line++) {
      // x／y 內縮「四分之一字」：落在字的前半，游標才會回報「這個字之前」而不是「之後」
      const x = isVertical() ? vp.right - lh * (line + 0.5) : vp.left + fs * 0.25;
      const y = isVertical() ? vp.top + fs * 0.25 : vp.top + lh * (line + 0.5);
      const caret = caretFromPoint(x, y);
      if (!caret) continue;
      const el = caret.node.nodeType === Node.TEXT_NODE ? caret.node.parentElement : caret.node;
      const blockEl = el && el.closest ? el.closest('[data-start]') : null;
      if (!blockEl || !textEl.contains(blockEl)) continue;
      const inner = caret.node.nodeType === Node.TEXT_NODE ? caret.offset : 0;
      return Number(blockEl.dataset.start) + inner;
    }
    return currentOffset; // 實在探測不到就維持原位置，不亂記
  }

  // 翻頁：delta = +1 下一頁、-1 上一頁。翻完才重新量「本頁第一個字」並存檔。
  function turnPage(delta) {
    if (!book) return;
    const next = clamp(pageIndex + delta, 0, totalPages - 1);
    if (next === pageIndex) return;
    pageIndex = next;
    scrollToPage();
    currentOffset = getPageStartOffset();
    savePosition();
    updateProgress();
  }

  // 「下一頁」的方向：橫式往右（點右側／向左拖曳）、直式往左（點左側／向右拖曳）
  const nextByRightSide = () => !isVertical();

  // ════════════════════════════════════════════════════════════
  // 閱讀位置（以字元位置儲存於 localStorage）
  // ════════════════════════════════════════════════════════════
  function savePosition() {
    if (!book) return;
    positions[book.id] = { offset: currentOffset, savedAt: Date.now() };
    saveJson(POSITIONS_KEY, positions);
    saveJson(LAST_BOOK_KEY, book.id);
  }

  // ════════════════════════════════════════════════════════════
  // 翻頁輸入：點擊左右側、左右拖曳、鍵盤
  // ════════════════════════════════════════════════════════════
  function bindPageTurnInput() {
    const stage = $('rd-stage');
    let down = null; // 記錄按下時的座標

    stage.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return; // 滑鼠只認左鍵
      down = { x: e.clientX, y: e.clientY };
    });
    stage.addEventListener('pointercancel', () => { down = null; });
    stage.addEventListener('pointerup', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      down = null;

      // 選單開著時，點閱讀區只負責收起選單，不翻頁
      if (!$('rd-menu').classList.contains('rd-hidden')) { closeMenu(); return; }
      if (!book) return;

      if (Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) > Math.abs(dy)) {
        // 拖曳：橫式向左拖＝下一頁；直式向右拖＝下一頁
        const draggedLeft = dx < 0;
        turnPage(draggedLeft === nextByRightSide() ? 1 : -1);
      } else if (Math.abs(dx) <= TAP_MAX_PX && Math.abs(dy) <= TAP_MAX_PX) {
        // 點擊：只有左／右兩側有作用
        const rect = stage.getBoundingClientRect();
        const ratio = (e.clientX - rect.left) / rect.width;
        if (ratio >= 1 - TAP_ZONE_RATIO) turnPage(nextByRightSide() ? 1 : -1);
        else if (ratio <= TAP_ZONE_RATIO) turnPage(nextByRightSide() ? -1 : 1);
      }
    });

    // 鍵盤（電腦）：← → 的意義與點擊左右側相同
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeMenu(); closeAllModals(); return; }
      if (!book || anyModalOpen()) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || tag === 'BUTTON') return;
      if (e.key === 'ArrowRight') turnPage(nextByRightSide() ? 1 : -1);
      else if (e.key === 'ArrowLeft') turnPage(nextByRightSide() ? -1 : 1);
      else if (e.key === 'PageDown' || e.key === ' ') turnPage(1);
      else if (e.key === 'PageUp') turnPage(-1);
      else return;
      e.preventDefault();
    });
  }

  // ════════════════════════════════════════════════════════════
  // 漢堡選單與彈窗
  // ════════════════════════════════════════════════════════════
  function closeMenu() {
    $('rd-menu').classList.add('rd-hidden');
    $('rd-hamburger').setAttribute('aria-expanded', 'false');
  }
  function toggleMenu() {
    const hidden = $('rd-menu').classList.toggle('rd-hidden');
    $('rd-hamburger').setAttribute('aria-expanded', String(!hidden));
  }

  function openModal(id) { $(id).classList.remove('rd-hidden'); }
  function closeModal(id) { $(id).classList.add('rd-hidden'); }
  function closeAllModals() { document.querySelectorAll('.rd-modal-overlay').forEach((m) => m.classList.add('rd-hidden')); }
  function anyModalOpen() { return !!document.querySelector('.rd-modal-overlay:not(.rd-hidden)'); }

  function bindMenuAndModals() {
    $('rd-hamburger').addEventListener('click', (e) => { e.stopPropagation(); toggleMenu(); });
    document.addEventListener('click', (e) => { if (!$('rd-menu').contains(e.target)) closeMenu(); });

    $('menu-list').addEventListener('click', () => { closeMenu(); showNovelList(); });
    $('menu-qrcode').addEventListener('click', () => { closeMenu(); showQrCode(); });
    $('menu-options').addEventListener('click', () => { closeMenu(); syncOptionControls(); openModal('modal-options'); });
    $('menu-about').addEventListener('click', () => { closeMenu(); openModal('modal-about'); });

    // 所有彈窗：點 ✕／完成（有 data-close）或點背景遮罩即關閉。
    // 點背景遮罩要求「按下」與「放開」都在遮罩上：否則在彈窗內按住拖曳、手移到彈窗外才放開，
    // 瀏覽器會把 click 算在遮罩上，造成拖曳到一半彈窗突然關閉
    document.querySelectorAll('.rd-modal-overlay').forEach((overlay) => {
      let pressedOnOverlay = false;
      overlay.addEventListener('pointerdown', (e) => { pressedOnOverlay = e.target === overlay; });
      overlay.addEventListener('click', (e) => {
        if ((e.target === overlay && pressedOnOverlay) || e.target.closest('[data-close]')) overlay.classList.add('rd-hidden');
      });
    });

    // 「關於 花小說」內容很長：可用手指（或滑鼠按住）上下拖曳捲動
    enableDragScroll(document.querySelector('#modal-about .rd-modal-body'));
  }

  // 讓元素可以「按住拖曳」上下捲動。
  //   手指（touch）：交給瀏覽器原生捲動（含慣性），CSS 以 touch-action: pan-y 明確允許上下拖曳；
  //   滑鼠／觸控筆：瀏覽器不會因為拖曳而捲動，所以在這裡自己實作（移動超過 4px 才算拖曳，避免誤觸）。
  function enableDragScroll(el) {
    let drag = null; // { y: 按下時的 Y 座標, top: 按下時的 scrollTop, moved: 是否已開始拖曳 }
    el.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      drag = { y: e.clientY, top: el.scrollTop, moved: false };
    });
    el.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const dy = e.clientY - drag.y;
      if (!drag.moved) {
        if (Math.abs(dy) < 4) return;
        drag.moved = true;
        el.setPointerCapture(e.pointerId); // 手指滑出彈窗範圍也持續追蹤
        el.classList.add('rd-dragging');
      }
      el.scrollTop = drag.top - dy; // 內容跟著游標走：往下拖＝看到上面的內容
    });
    const end = () => {
      drag = null;
      el.classList.remove('rd-dragging');
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('lostpointercapture', end);
  }

  // QR Code：第一次開啟才產生（與 lpas_v3.html 相同的 qrDone 作法）；黑碼白底，深色主題下也能掃
  function showQrCode() {
    openModal('modal-qrcode');
    $('rd-qr-url').textContent = QR_URL;
    if (qrCreated) return;
    if (typeof QRCode === 'undefined') return; // QRCode.js 沒載入（離線）時只顯示網址文字
    qrCreated = true;
    new QRCode($('rd-qrcode'), {
      text: QR_URL, width: 300, height: 300,
      colorDark: '#000000', colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  // ════════════════════════════════════════════════════════════
  // Supabase：小說列表與內文（唯讀）
  // ════════════════════════════════════════════════════════════
  function getSupabase() {
    const sb = window.SupabaseClient && window.SupabaseClient.getClient();
    if (!sb) throw new Error('無法連線到 Supabase（SDK 未載入，請檢查網路）');
    return sb;
  }

  // 列表只取欄位 id/title/char_count/updated_at，不下載 chapters（內文很大）
  async function fetchNovelList() {
    const { data, error } = await getSupabase()
      .from(NOVEL_TABLE)
      .select('id, title, char_count, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1000);
    if (error) throw error;
    return data || [];
  }

  async function fetchNovel(id) {
    const { data, error } = await getSupabase()
      .from(NOVEL_TABLE)
      .select('id, title, chapters')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('找不到這本小說（可能已被下架）');
    return data;
  }

  // 閱讀區中央的提示文字（尚未開書／載入中／錯誤）；有書時整個隱藏
  function showStatus(message, isError) {
    const status = $('rd-status');
    status.textContent = message;
    status.classList.toggle('rd-error', !!isError);
    status.classList.remove('rd-hidden');
    $('rd-viewport').classList.add('rd-hidden');
    $('rd-progress').textContent = '';
  }

  // 開啟一本小說：先把資料抓回來，成功了才換掉畫面上現有的書（失敗不會讓目前的書消失）
  async function openNovel(id) {
    if (!book) showStatus('載入中…');
    let data;
    try {
      data = await fetchNovel(id);
    } catch (e) {
      if (book) alert('❌ 開啟小說失敗：' + errMsg(e));
      else showStatus('❌ 開啟小說失敗：' + errMsg(e) + '\n請從左上角選單 →「讀取小說」重試。', true);
      throw e;
    }

    renderBook(data.id, data.title, data.chapters);
    $('rd-status').classList.add('rd-hidden');
    $('rd-viewport').classList.remove('rd-hidden');
    $('rd-book-title').textContent = data.title;
    document.title = data.title + ' - 花小說';

    // 回到上次的閱讀位置（小說若被作者改短，位置會被夾在新的字數範圍內）
    const saved = positions[book.id];
    currentOffset = clamp(saved ? Number(saved.offset) || 0 : 0, 0, Math.max(0, book.totalChars - 1));
    relayout();
    saveJson(LAST_BOOK_KEY, book.id); // 只記「讀的是哪一本」，位置維持原樣（使用者翻頁後才更新）
  }

  // 「讀取小說」彈窗：載入並顯示列表
  async function showNovelList() {
    openModal('modal-list');
    const list = $('rd-novel-list');
    const message = $('rd-list-message');
    const setMessage = (text) => {
      message.textContent = text;
      message.classList.toggle('rd-hidden', !text);
    };
    list.replaceChildren();
    setMessage('讀取中…');
    try {
      const rows = await fetchNovelList();
      if (!rows.length) {
        setMessage('目前雲端還沒有已發佈的小說。\n請先在「小說自動產生器」使用「匯出小說 → 發佈到花小說」。');
        return;
      }
      setMessage('');
      rows.forEach((row) => list.appendChild(buildNovelItem(row)));
    } catch (e) {
      setMessage('❌ 讀取失敗：' + errMsg(e) + '\n（若尚未建立資料表，請先在 Supabase SQL Editor 執行 supabase/schema_published_novels.sql）');
    }
  }

  // 列表中的一本小說：書名 + 字數／更新日期／已讀百分比。書名來自資料庫，一律用 textContent 避免注入 HTML
  function buildNovelItem(row) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'rd-novel-item';
    if (book && book.id === String(row.id)) btn.setAttribute('aria-current', 'true');

    const name = document.createElement('span');
    name.className = 'rd-novel-name';
    name.textContent = row.title;

    const parts = [];
    if (row.char_count) parts.push(Number(row.char_count).toLocaleString() + ' 字');
    if (row.updated_at) parts.push('更新於 ' + new Date(row.updated_at).toLocaleDateString('zh-TW'));
    const saved = positions[String(row.id)];
    if (saved && row.char_count) {
      parts.push('📍 已讀 ' + clamp(Math.round((saved.offset / row.char_count) * 100), 0, 100) + '%');
    }
    const meta = document.createElement('span');
    meta.className = 'rd-novel-meta';
    meta.textContent = parts.join(' · ');

    btn.append(name, meta);
    btn.addEventListener('click', () => {
      closeModal('modal-list');
      openNovel(row.id).catch(() => { /* 錯誤訊息已在 openNovel 內顯示 */ });
    });
    return btn;
  }

  // ════════════════════════════════════════════════════════════
  // 初始化
  // ════════════════════════════════════════════════════════════
  async function init() {
    settings = loadSettings();
    positions = loadJson(POSITIONS_KEY, {});
    applySettings();
    bindOptionControls();
    bindMenuAndModals();
    bindPageTurnInput();

    // 視窗尺寸／手機轉向改變 → 重新排版並維持閱讀位置
    window.addEventListener('resize', debounce(relayout, 150));
    // 網頁字型載入完成（或切換字型後才載入）會讓字形寬度微調，也要重排
    if (document.fonts) {
      document.fonts.ready.then(relayout);
      document.fonts.addEventListener('loadingdone', debounce(relayout, 100));
    }

    // 有上次讀的書就直接打開；沒有（或打不開）就顯示提示並彈出列表
    const lastId = loadJson(LAST_BOOK_KEY, null);
    if (lastId !== null) {
      try { await openNovel(lastId); return; } catch (e) { return; /* 錯誤訊息已顯示在閱讀區 */ }
    }
    showStatus('歡迎來到花小說 🌸\n請從左上角選單 →「讀取小說」選一本書。');
    showNovelList();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
