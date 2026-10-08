/**
 * 心情軸線（Mood Axis）— 小說產生器「🎯 評論小說」的延伸功能
 * ============================================================================
 * 把整部小說依時間順序切成許多「段落」，請 AI 逐段標記「一般讀者讀到那一段時的感受強度」，
 * 畫成「橫向＝時間軸、縱向＝多項指標、顏色＝強度」的熱度圖，讓作者直覺看出整部小說的情緒起伏。
 *
 * 【顏色與分數】所有指標共用 1~7 分，預設七彩：7 紅（最高：高潮、值得關愛）→ 4 綠（普通）→ 1 紫（最低：低潮、谷底、令人討厭）。
 *   指標沒有好壞，只有「符合與否」：悲劇小說出現紫色反而是符合作者期待的。
 *   空白＝沒有資料（角色沒登場、這段沒有伏筆）；斜線底紋＝尚未分析（或分析失敗）。
 *   視窗右上角的「顏色切換」可改用 A. 灰階（1＝20% 白、4＝60% 白、7＝100% 白）或 B. 紫黃（1＝紫、4＝土黃、7＝黃）。
 *
 * 【時間軸】主要時間點＝章／節；再依段落（分行）細切，過短的對話或短行會被併成同一個時間點（moodSplitBlocks）。
 *   檢視時可切換「章／節／段落」三種精細度（章、節是把底下段落的分數取平均），預設為「段落」。
 *   每一格的寬度固定（24px × 縮放倍率），不隨精細度改變；格數太多就用下方的橫向捲動軸往後看。
 *
 * 【流程】評論完成後（勾選「心情軸線」時）→ 切段 → 分批呼叫後端 /api/mood_axis_async（每批約 4000 字、最多 8 段）
 *   → 每批結果即時畫進視窗 → 全部完成後自動匯出 .json 存檔（日後可用「顯示心情軸線」讀回重新顯示）。
 *   AI 回傳格式由後端以 JSON Schema 強制規範（見 prompt_utils.build_mood_axis_schema），
 *   前端仍會再驗證一次分數範圍、角色名、伏筆名，並在輸出被截斷時逐筆搶救。
 *
 * 【存檔格式】見 moodCreateData()：{ format, version, title, createdAt, model, source, partial,
 *   metrics[], outline[], segments[], characters[], foreshadows[] }，純 JSON，不含小說全文。
 *
 * 依賴 novel_generator_app.js 的全域：qs、state、appendLog、callDebugServerAsync、buildModelOptionsWithSeed、
 *   sanitizeFilename、setActive、gsFocusAndSelect、initFloatPanel、setFloatPanelRect、bringFloatPanelToFront。
 */

// ═══════════════════════════════════════════════════════════════════════════
// 一、設定：色階、指標、常數
// ═══════════════════════════════════════════════════════════════════════════

// 由 1／4／7 分三個基準色，線性內插出 1~7 分七個色（RGB 陣列，索引 0＝1 分 … 索引 6＝7 分）
function moodStopsFromAnchors(a1, a4, a7) {
    const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return [0, 1, 2, 3, 4, 5, 6].map(i => (i <= 3 ? lerp(a1, a4, i / 3) : lerp(a4, a7, (i - 3) / 3)));
}

/**
 * 配色方案（視窗右上角「顏色切換」下拉選單）。每個方案：
 *   stops  1~7 分各自的 RGB（stops[0]＝1 分 … stops[6]＝7 分）；小數分數（章／節平均）在相鄰兩色之間線性內插
 *   names  各分數的色名（說明列、圖例提示用）
 *   hint   說明列閒置時顯示的圖例文字
 * 方案：
 *   rainbow     七彩配色（預設）：紫 靛 藍 綠 黃 橙 紅，綠＝普通
 *   gray        A. 灰階配色：1 分＝20% 白、4 分＝60% 白、7 分＝100% 白，中間線性漸變
 *   blueYellow  B. 紫黃配色：1 分＝紫、4 分＝土黃、7 分＝黃，中間線性漸變
 */
const MOOD_PALETTES = {
    rainbow: {
        label: '七彩配色（預設）',
        stops: [[90, 20, 110], [57, 73, 200], [30, 120, 220], [68, 180, 72], [200, 200, 0], [250, 180, 0], [255, 96, 96]],
        names: ['紫', '靛', '藍', '綠', '黃', '橙', '紅'],
        hint: '紫＝最低（低潮、谷底、令人討厭）　綠＝普通　紅＝最高（高潮、值得關愛）'
    },
    gray: {
        label: 'A. 灰階配色',
        stops: moodStopsFromAnchors([51, 51, 51], [153, 153, 153], [255, 255, 255]),     // 20% 白／60% 白／100% 白
        names: ['最暗', '深灰', '暗灰', '中灰', '亮灰', '淺灰', '最亮'],
        hint: '越暗＝越低（低潮、谷底、令人討厭）　中灰＝普通　越亮＝越高（高潮、值得關愛）'
    },
    blueYellow: {
        label: 'B. 紫黃配色',
        stops: moodStopsFromAnchors([64, 0, 64], [160, 128, 32], [255, 255, 0]),    // 紫／土黃／黃
        names: ['深紫', '紫', '暗黃', '土黃', '深黃', '淺黃', '黃'],
        hint: '紫＝最低（低潮、谷底、令人討厭）　土黃＝普通　黃＝最高（高潮、值得關愛）'
    }
};

/** 指標群組的顯示名稱（metrics[].group 對應；角色與伏筆是動態列，另有專屬群組名） */
const MOOD_GROUP_LABELS = {
    plot: '📖 劇情',
    reader: '💭 讀者情緒',
    char: '💗 角色關愛（沒登場留白）',
    fore: '🧵 伏筆追蹤（沒伏筆留白）'
};

/**
 * 評分指標清單（後端不寫死，每次分析都會連同這份定義一起送給 AI，並存進匯出檔）。
 * 要增減指標只需改這裡：id 為英文小寫識別字；hint 是一句話定義；low／mid／high 是 1／4／7 分的具體錨點，
 * 有具體例子 AI 才不會每個指標都打一樣的分數。
 * nullable：true＝這個指標的對象可能整段都沒登場（例如男／女主角），AI 此時填 0，圖表留白（不硬湊分數）。
 * lead：male／female＝這個指標評的是男主角／女主角；若角色卡已知該主角的姓名，AI 沒在 characters 列出該主角時，
 *       即使它仍打了分數也會被前端清掉（moodApplyItem），確保「沒登場就留白」。
 */
const MOOD_METRICS = [
    { id: 'plot', group: 'plot', label: '劇情起伏', hint: '這一段的衝突、事件、轉折有多強烈', low: '平淡鋪陳（日常、描寫、說明）', mid: '一般的劇情推進', high: '高潮（最激烈的衝突、關鍵事件、重大揭露）' },
    { id: 'fortune_m', group: 'plot', label: '男主角處境', hint: '故事中的男性主要人物（男主角）此刻處境的順逆；他這一段沒登場時留白', low: '絕境谷底（失去、挫敗、危機、孤立無援）', mid: '平穩、普通', high: '極度順遂圓滿（成功、團聚、願望達成）', nullable: true, lead: 'male' },
    { id: 'fortune_f', group: 'plot', label: '女主角處境', hint: '故事中的女性主要人物（女主角）此刻處境的順逆；她這一段沒登場時留白', low: '絕境谷底（失去、挫敗、危機、孤立無援）', mid: '平穩、普通', high: '極度順遂圓滿（成功、團聚、願望達成）', nullable: true, lead: 'female' },
    { id: 'suspense', group: 'plot', label: '懸念', hint: '讓讀者想知道「接下來會怎樣」而繼續讀下去的未解疑問或緊張感', low: '沒有疑問，事情已經明朗', mid: '有一點好奇', high: '強烈想翻下一頁（謎團或危機未解、懸崖式收尾）' },
    { id: 'twist', group: 'plot', label: '意外轉折', hint: '這一段出乎讀者預期的程度', low: '完全在預期之內', mid: '小小的意外', high: '徹底顛覆認知（大反轉、真相揭曉）' },
    { id: 'romance', group: 'plot', label: '感情張力', hint: '人物之間的曖昧、心動、羈絆或感情糾葛的濃度', low: '沒有任何感情互動', mid: '一般的互動', high: '極強烈（告白、爭吵、決裂、重逢、親密時刻）' },
    { id: 'joy', group: 'reader', label: '喜', hint: '讀者感到溫暖、感動、欣慰、甜蜜、有成就感的程度', low: '完全沒有', mid: '淡淡的溫暖', high: '強烈（滿滿的幸福感、感動到想落淚）' },
    { id: 'anger', group: 'reader', label: '怒', hint: '讀者感到憤怒、不平、被惹惱的程度', low: '完全沒有', mid: '有點不滿', high: '強烈（氣到想罵人、怒不可遏）' },
    { id: 'sorrow', group: 'reader', label: '哀', hint: '讀者感到悲傷、心痛、遺憾、惆悵的程度', low: '完全沒有', mid: '淡淡的惆悵', high: '強烈（心碎、悲痛欲絕）' },
    { id: 'fun', group: 'reader', label: '樂', hint: '讀者感到好笑、輕鬆、逗趣、愉快的程度', low: '完全沒有', mid: '會心一笑', high: '強烈（爆笑、歡樂到停不下來）' }
];

const MOOD_FORMAT = 'LoveIsABitMessy.MoodAxis';   // 存檔識別字串（讀檔時用來確認不是別的 .json）
const MOOD_VERSION = 1;                            // 存檔格式版本
const MOOD_FORE_ACTIONS = ['埋下', '呼應', '回收'];  // 伏筆事件的三種動作（越後面越「結案」）
const MOOD_FORE_GLYPH = { '埋下': '埋', '呼應': '應', '回收': '收' };  // 伏筆格子內顯示的單字

// 切段：每個時間點（段落）的目標字數依全書長度自動決定。
// 圖表的每一格寬度固定（24px），格數多了就用橫向捲動軸往後看，所以時間軸可以切得比較細：
//   目標字數 ＝ 全書字數 ÷ 600，限制在 150～500 字之間（每格實際會再多出一行左右）。
//   例：2 萬字約 100 格、6 萬字約 280 格、12 萬字約 450 格、19 萬字約 500 格、50 萬字約 970 格。
const MOOD_BLOCK_MIN = 150;        // 目標字數下限（再短就讀不出情緒了）
const MOOD_BLOCK_MAX = 500;        // 目標字數上限（避免超長篇的格數與 AI 耗時失控）
const MOOD_BLOCK_DIV = 600;        // 全書字數 ÷ 此值 ＝ 目標字數
const MOOD_SECTION_CHUNK = 3000;   // 沒有「節」的外部文檔，依此字數切成虛擬的節（讓「節」精細度有意義）
// 分批：每批送給 AI 的字數與段數上限（提示詞連同輸出可放進 16k 上下文）。
// 批次刻意切小：角色與伏筆的「已知名單」每批才更新一次，批次越小，後面的段落越能沿用前面剛埋下的伏筆名稱，追蹤才不會斷掉；
// 代價只是每批多送一份固定的說明文字（約 3000 字，預填很快），耗時主要仍取決於輸出的段落數。
const MOOD_BATCH_CHARS = 4000;
const MOOD_BATCH_MAX_SEGS = 8;
// 角色與伏筆的列數上限（只留最主要的，避免圖表被雜訊塞滿）
const MOOD_MAIN_CHAR_LIMIT = 8;
const MOOD_THREAD_LIMIT = 12;

// ═══════════════════════════════════════════════════════════════════════════
// 二、模組狀態
// ═══════════════════════════════════════════════════════════════════════════

let moodData = null;          // 目前顯示中的心情軸線資料（格式同匯出檔）
let moodRunning = false;      // 是否正在產生（避免同時跑兩次）
let moodAbort = false;        // 使用者按了「停止產生」
let moodStatusText = '';      // 工具列的進度／狀態文字（產生中由 moodSetStatus 更新）
// 檢視設定：level＝時間軸精細度（chapter／section／paragraph）、zoom＝欄寬倍率（同時放大「段落內容」文字）、
// contrast＝對比增強、palette＝配色方案（MOOD_PALETTES 的 key，預設七彩）
const moodView = { level: 'paragraph', zoom: 1, contrast: false, palette: 'rainbow', selectedCol: null, hoverCol: null };
const MOOD_COL_BASE = 24;                 // 每一格（時間點）的基本寬度 px：固定，不隨章／節／段落精細度改變
const MOOD_ZOOM_MIN = 0.75;               // 縮放下限：再小，欄寬會窄過「段落內容」直排文字本身的寬度（約 14.7px）
const MOOD_ZOOM_MAX = 3;

// ═══════════════════════════════════════════════════════════════════════════
// 三、色彩工具
// ═══════════════════════════════════════════════════════════════════════════

const moodColorCache = new Map();

// 目前使用中的配色方案（找不到就退回七彩）
function moodPalette() {
    return MOOD_PALETTES[moodView.palette] || MOOD_PALETTES.rainbow;
}

/**
 * 分數 → 顏色（依目前的配色方案）。整數分數剛好是方案裡的七個色；小數（章／節平均）在相鄰兩色之間線性內插。
 * 回傳 { bg: 'rgb(...)', fg: 文字色 }，文字色依背景亮度選黑或白，確保格子裡的數字看得清楚。
 */
function moodColor(v) {
    const clamped = Math.min(7, Math.max(1, Number(v) || 1));
    const key = `${moodView.palette}:${Math.round(clamped * 20)}`;
    if (moodColorCache.has(key)) return moodColorCache.get(key);
    const stops = moodPalette().stops;
    const x = Math.round(clamped * 20) / 20 - 1;   // 0 ~ 6
    const i = Math.min(5, Math.floor(x));
    const t = x - i;
    const c = [0, 1, 2].map(k => Math.round(stops[i][k] + (stops[i + 1][k] - stops[i][k]) * t));
    const lum = (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255;
    const out = { bg: `rgb(${c[0]},${c[1]},${c[2]})`, fg: lum > 0.55 ? '#111' : '#fff' };
    moodColorCache.set(key, out);
    return out;
}

// 分數 → 文字說明：整數顯示「5（黃）」（括號內是目前配色的色名），小數（章／節平均）顯示「平均 4.6」
function moodScoreText(v) {
    if (v == null) return '—';
    if (Number.isInteger(v)) return `${v}（${moodPalette().names[v - 1]}）`;
    return `平均 ${v.toFixed(1)}`;
}

// 說明列閒置時的文字：目前配色的圖例意義與操作提示
function moodIdleHint() {
    return moodPalette().hint + '　空白＝無資料　斜線＝尚未分析。滑鼠移到格子看詳細，點擊跳到編輯區。';
}

// HTML 跳脫（所有來自 AI／檔案的文字塞進 innerHTML 前都必須經過這裡）
function moodEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ═══════════════════════════════════════════════════════════════════════════
// 四、切段：章／節 → 段落（時間點）
// ═══════════════════════════════════════════════════════════════════════════

// 依全書字數決定每個時間點的目標字數（全書越長，每個時間點越大，但有上下限）
function moodPickBlockSize(totalChars) {
    return Math.max(MOOD_BLOCK_MIN, Math.min(MOOD_BLOCK_MAX, Math.round(totalChars / MOOD_BLOCK_DIV)));
}

// 過長的單一行（例如整段不換行的長文）：在句末標點處切成約 target 字的幾塊
function moodSplitLongLine(line, target) {
    const sentences = line.split(/(?<=[。！？!?…]+[」』”’）)]*)/);
    const out = [];
    let cur = '';
    sentences.forEach(sen => {
        cur += sen;
        if (cur.length >= target) { out.push(cur); cur = ''; }
    });
    if (cur) {
        if (out.length && cur.length < target * 0.4) out[out.length - 1] += cur;
        else out.push(cur);
    }
    return out;
}

/**
 * 把一段內文切成「時間點」區塊（回傳字串陣列，區塊內以 \n 保留原本的換行）。
 * 規則：以「行」為基本單位（一行＝一個自然段）；連續的短行（尤其是對話）累積到 target 字才算一個時間點，
 *   不會把每句對白都切成一格；本身就很長的段落自己單獨成一格；最後剩下太短的尾巴併回前一格。
 */
function moodSplitBlocks(text, target) {
    const pieces = [];
    String(text || '').split(/\n+/).forEach(raw => {
        const line = raw.trim();
        if (!line) return;
        if (line.length > target * 2) pieces.push(...moodSplitLongLine(line, target));
        else pieces.push(line);
    });
    const blocks = [];
    let cur = [], len = 0;
    const flush = () => { if (cur.length) blocks.push(cur.join('\n')); cur = []; len = 0; };
    pieces.forEach(p => {
        // 遇到「本身就夠長」的段落，先把前面累積的短行結算，讓長段落自己單獨成一格
        if (p.length >= target && cur.length && len >= target * 0.4) flush();
        cur.push(p);
        len += p.length;
        if (len >= target) flush();
    });
    if (cur.length) {
        if (blocks.length && len < target * 0.4) blocks[blocks.length - 1] += '\n' + cur.join('\n');
        else flush();
    }
    return blocks;
}

// 把文字依換行切成約 size 字的幾大塊（用來替「沒有節」的長章節切出虛擬的節）
function moodChunkText(text, size) {
    const out = [];
    let cur = [], len = 0;
    String(text || '').split('\n').forEach(l => {
        cur.push(l);
        len += l.length;
        if (len >= size) { out.push(cur.join('\n')); cur = []; len = 0; }
    });
    if (cur.length) {
        if (out.length && len < size * 0.4) out[out.length - 1] += '\n' + cur.join('\n');
        else out.push(cur.join('\n'));
    }
    return out;
}

/**
 * 從「目前編輯中的小說」取得章／節結構（略過 🔕 禁止匯出的章節：它們不會出現在成品，讀者讀不到）。
 * 回傳 { chapters: [{ title, src: 原章索引, sections: [{ title, src: 原節索引, text }] }], skipped }
 */
function moodStructureFromNovel() {
    const chapters = [];
    let skipped = 0;
    (state.chapters || []).forEach((ch, ci) => {
        if (ch.noExport) { skipped += (ch.sections || []).length; return; }
        const sections = [];
        (ch.sections || []).forEach((sec, si) => {
            if (sec.noExport) { skipped++; return; }
            const text = (sec.content || '').trim();
            if (text) sections.push({ title: (sec.title || '').trim() || `第${si + 1}節`, src: si, text });
        });
        if (sections.length) chapters.push({ title: (ch.title || '').trim() || `第${ci + 1}章`, src: ci, sections });
    });
    return { chapters, skipped };
}

/**
 * 從外部 .txt／.md 全文推斷章／節結構。支援的標題風格（依序判斷，只採用第一種有命中的）：
 *   ① Markdown：「## 章」「### 節」（本程式的匯出格式）
 *   ② 橫幅：「===== 章 =====」「--- 節 ---」
 *   ③ 中文章回：「第一章 …」「第12回」「楔子」「尾聲」…（只分章）
 *   ④ 都沒有：整份當成一章
 * 沒有「節」的章節，若很長會自動切成每約 3000 字一個虛擬的節（讓「節」精細度仍有意義）。
 */
function moodStructureFromText(text, docName) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const reH2 = /^\s{0,3}##\s+(.+?)\s*#*\s*$/;
    const reH3 = /^\s{0,3}###\s+(.+?)\s*#*\s*$/;
    const reBannerCh = /^\s*={3,}\s*(.+?)\s*={3,}\s*$/;
    const reBannerSec = /^\s*-{3,}\s*(.+?)\s*-{3,}\s*$/;
    const reZhCh = /^\s*((?:第[〇零一二三四五六七八九十百千萬兩0-9０-９]+[章回卷篇集部][^\n]{0,40})|楔子|序章|序幕|引子|前言|尾聲|終章|後記|番外[^\n]{0,20})\s*$/;
    const count = re => lines.filter(l => re.test(l)).length;

    let mode = 'none';
    if (count(reH2)) mode = 'md';
    else if (count(reBannerCh)) mode = 'banner';
    else if (count(reZhCh) >= 2) mode = 'zh';

    const chapters = [];
    let curCh = null, curSec = null;
    const newChapter = (title) => { curCh = { title: title.trim(), src: null, sections: [] }; chapters.push(curCh); curSec = null; };
    const newSection = (title) => { if (!curCh) newChapter(docName || '全文'); curSec = { title: title.trim(), src: null, lines: [], implicit: false }; curCh.sections.push(curSec); };
    const addLine = (l) => {
        if (!curCh) newChapter(docName || '全文');
        if (!curSec) { newSection('正文'); curSec.implicit = true; }
        curSec.lines.push(l);
    };

    lines.forEach(line => {
        let m;
        if (mode === 'md') {
            if ((m = line.match(reH3))) return newSection(m[1]);
            if ((m = line.match(reH2))) return newChapter(m[1]);
            if (/^\s*>/.test(line)) return;                     // 引用行＝本程式匯出的「章描述」，不是小說內文
            if (/^\s*\*?\(未生成內容\)\*?\s*$/.test(line)) return;
            if (/^\s{0,3}#\s+/.test(line)) return;              // 單一 # ＝書名
            if (/^\s*-{3,}\s*$/.test(line)) return;             // 水平分隔線
        } else if (mode === 'banner') {
            if ((m = line.match(reBannerCh))) return newChapter(m[1]);
            if ((m = line.match(reBannerSec))) return newSection(m[1]);
        } else if (mode === 'zh') {
            if ((m = line.match(reZhCh))) return newChapter(m[1]);
        }
        addLine(line);
    });

    // 整理：節文字合併、去空、略過「故事粗綱」「作者備註」（本程式完整匯出檔才有，不是給讀者的內文）
    const result = [];
    chapters.forEach(ch => {
        if (/故事粗綱|作者備註/.test(ch.title)) return;
        const sections = [];
        ch.sections.forEach(sec => {
            const body = sec.lines.join('\n').trim();
            if (!body) return;
            sections.push({ title: sec.title, src: null, text: body, implicit: sec.implicit });
        });
        if (!sections.length) return;
        // 只有一個「隱含節」且很長 → 切成虛擬的節
        if (sections.length === 1 && sections[0].implicit && sections[0].text.length > MOOD_SECTION_CHUNK * 1.3) {
            const chunks = moodChunkText(sections[0].text, MOOD_SECTION_CHUNK);
            result.push({ title: ch.title, src: null, sections: chunks.map((c, i) => ({ title: `第${i + 1}段`, src: null, text: c })) });
        } else {
            result.push({ title: ch.title, src: null, sections: sections.map(s => ({ title: s.implicit ? '正文' : s.title, src: null, text: s.text })) });
        }
    });
    return { chapters: result, skipped: 0 };
}

// 區塊的「定位用開頭」：取第一行去掉開頭引號後的前 16 字，點擊圖表時用它在原文裡找位置
function moodExcerpt(block) {
    return block.split('\n')[0].replace(/^[\s「『“"'（(]+/, '').slice(0, 16);
}

/**
 * 章／節結構 → 時間點（段落）清單。
 * 回傳 { outline, segments, texts }：
 *   outline  章節目錄 [{ title, src, sections: [{ title, src }] }]（segments 的 ch／sec 指向這裡的索引）
 *   segments 段落資料（尚未評分）：{ id, ch, sec, chars, excerpt, summary:'', scores:null, characters:{}, foreshadows:[] }
 *   texts    Map(id → 段落全文)，只在記憶體中給 AI 分析用，不會存進匯出檔
 */
function moodSegmentize(chapters) {
    const total = chapters.reduce((a, c) => a + c.sections.reduce((b, s) => b + s.text.length, 0), 0);
    const target = moodPickBlockSize(total);
    const outline = [], segments = [], texts = new Map();
    let id = 0;
    chapters.forEach(ch => {
        const ol = { title: ch.title, src: ch.src, sections: [] };
        ch.sections.forEach(sec => {
            const blocks = moodSplitBlocks(sec.text, target);
            if (!blocks.length) return;
            const secIdx = ol.sections.length;
            ol.sections.push({ title: sec.title, src: sec.src });
            blocks.forEach(b => {
                id++;
                texts.set(id, b);
                segments.push({
                    id, ch: outline.length, sec: secIdx, chars: b.length, excerpt: moodExcerpt(b),
                    summary: '', scores: null, characters: {}, foreshadows: []
                });
            });
        });
        if (ol.sections.length) outline.push(ol);
    });
    return { outline, segments, texts, target };
}

// 把段落依「字數／段數」上限分成多批（連續段落放同一批，讓 AI 能看到前後文）
function moodMakeBatches(segments, texts) {
    const batches = [];
    let cur = [], chars = 0;
    segments.forEach(s => {
        const len = (texts.get(s.id) || '').length;
        if (cur.length && (chars + len > MOOD_BATCH_CHARS || cur.length >= MOOD_BATCH_MAX_SEGS)) {
            batches.push(cur);
            cur = []; chars = 0;
        }
        cur.push(s);
        chars += len;
    });
    if (cur.length) batches.push(cur);
    return batches;
}

// ═══════════════════════════════════════════════════════════════════════════
// 五、AI 回傳資料的解析與驗證
// ═══════════════════════════════════════════════════════════════════════════

// 把分數轉成 1~7 的整數；不合法回傳 null（不要亂補，寧可留白）
function moodClampScore(v) {
    const n = Math.round(Number(v));
    return (Number.isFinite(n) && n >= 1 && n <= 7) ? n : null;
}

// 小模型沒內容時常塞的佔位文字（"-"、"無"、"none"…），遇到就當作沒有
function moodIsPlaceholder(s) {
    return /^[\s\-—－_.…·]*$/.test(s) || /^(無|沒有|无|none|null|n\/a|na)$/i.test(s.trim());
}

// 名稱比對用的標準化：去空白、「祕／秘」不分（AI 常在兩種寫法間跳來跳去）
function moodNormKey(name) {
    return String(name || '').replace(/\s+/g, '').replace(/祕/g, '秘');
}

/**
 * 兩個名稱是否視為同一個（角色別名、伏筆名稱微小差異）：
 * 標準化後相同，或「較短者是較長者的開頭／結尾、字數只差 1~2、且較長者不含『的』」
 * （例：小美／林小美、館長／老館長 視為同一人；阿哲／阿哲的妹妹 不是，因為含「的」）。
 */
function moodSameName(a, b) {
    const x = moodNormKey(a), y = moodNormKey(b);
    if (x === y) return true;
    const [s, l] = x.length <= y.length ? [x, y] : [y, x];
    if (s.length < 2 || l.length - s.length > 2 || l.includes('的')) return false;
    return l.startsWith(s) || l.endsWith(s);
}

/**
 * 從後端回傳的 job 結果取出「段落結果陣列」。
 * 優先用後端已解析好的 mood.segments；解析失敗（例如輸出被截斷）就從原始文字 raw 逐筆搶救。
 */
function moodExtractItems(result) {
    if (!result) return [];
    const mood = result.mood;
    if (mood && Array.isArray(mood.segments)) return mood.segments;
    if (Array.isArray(mood)) return mood;
    return moodSalvageItems(result.raw || '');
}

/**
 * 逐筆搶救：掃描文字中所有「以 {"id": 開頭、且已完整閉合」的物件並各自解析。
 * 即使整份 JSON 因為輸出被截斷而不完整，前面已寫完的段落仍可保住；字串內的括號與跳脫字元都會正確處理。
 */
function moodSalvageItems(raw) {
    const items = [];
    const stack = [];
    let inStr = false, esc = false;
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (inStr) {
            if (esc) esc = false;
            else if (c === '\\') esc = true;
            else if (c === '"') inStr = false;
            continue;
        }
        if (c === '"') { inStr = true; continue; }
        if (c === '{') stack.push(i);
        else if (c === '}' && stack.length) {
            const start = stack.pop();
            if (/^\{\s*"id"\s*:/.test(raw.slice(start, start + 12))) {
                try { items.push(JSON.parse(raw.slice(start, i + 1))); } catch (e) { /* 這筆壞掉就略過 */ }
            }
        }
    }
    return items;
}

/**
 * 驗證並整理單一段落的 AI 結果。回傳 null 表示這筆不可用（id 不在本批、或一個有效分數都沒有）。
 * 回傳 { id, summary, scores, characters: [{name, score}], foreshadows: [{action, name, note, strength}] }
 */
// 角色／伏筆名稱的清理：去掉引號、反斜線與控制字元（伏筆名稱之後會成為後端 JSON Schema 的 enum，必須是乾淨字串）
const moodCleanName = s => String(s || '').replace(/["'\\\u0000-\u001f]/g, '').trim().slice(0, 12);

function moodCleanItem(item, metrics, validIds) {
    if (!item || typeof item !== 'object') return null;
    const id = Number(item.id);
    if (!validIds.has(id)) return null;
    const scores = {};
    let n = 0;
    metrics.forEach(m => {
        const v = moodClampScore(item[m.id]);
        if (v != null) { scores[m.id] = v; n++; }
    });
    if (!n) return null;

    let summary = String(item.summary || '').trim().replace(/[。，、！？；：\s]+$/g, '').slice(0, 24);
    if (moodIsPlaceholder(summary)) summary = '';

    const characters = [];
    (Array.isArray(item.characters) ? item.characters : []).forEach(c => {
        const name = moodCleanName(c && c.name);
        const score = moodClampScore(c && c.score);
        if (name && score != null && !moodIsPlaceholder(name)) characters.push({ name, score });
    });

    const foreshadows = [];
    (Array.isArray(item.foreshadows) ? item.foreshadows : []).forEach(f => {
        const name = moodCleanName(f && f.name);
        const strength = moodClampScore(f && f.strength);
        const action = MOOD_FORE_ACTIONS.includes(f && f.action) ? f.action : null;
        if (name.length >= 2 && strength != null && action && !moodIsPlaceholder(name)) {
            foreshadows.push({ action, name, note: String((f && f.note) || '').trim().slice(0, 30), strength });
        }
    });
    return { id, summary, scores, characters, foreshadows };
}

// ═══════════════════════════════════════════════════════════════════════════
// 六、產生流程：分批呼叫 AI、累積角色與伏筆登記簿
// ═══════════════════════════════════════════════════════════════════════════

/** 建立空的心情軸線資料（也就是匯出檔的完整格式） */
function moodCreateData(docName, sourceType, outline, segments, totalChars) {
    return {
        format: MOOD_FORMAT,
        version: MOOD_VERSION,
        title: docName,
        createdAt: new Date().toISOString(),
        model: state.currentModel || '',
        source: { type: sourceType, name: docName, totalChars },   // type：novel（目前編輯中的小說）／file（外部文檔）
        partial: true,                                             // 產生完成後才改為 false
        scale: { min: 1, max: 7, note: '7=紅(最高：高潮、值得關愛) 4=綠(普通) 1=紫(最低：低潮、谷底、令人討厭)；空白=無資料' },
        metrics: MOOD_METRICS.map(m => ({ ...m })),
        outline,
        segments,
        characters: [],      // 圖表中顯示的主要角色（依出現次數排序）
        foreshadows: []      // 圖表中顯示的伏筆：[{ name, note }]；各段的事件記在 segments[].foreshadows
    };
}

/**
 * 男／女主角的姓名：取自「登場角色」欄位各角色卡的性別（card_json.gender＝男／女），
 * 名字用劇本中的角色名稱（roleName），沒填就用角色卡名稱；每種性別取第一位。
 * 找不到角色卡（例如沒選角色、或用本機資料）就回傳空字串，改由 AI 依文意判斷。
 */
function moodLeadNames() {
    const leads = { male: '', female: '' };
    const cards = (typeof cloudCharacters !== 'undefined' && Array.isArray(cloudCharacters)) ? cloudCharacters : [];
    (state.characters || []).forEach(c => {
        const id = getCharId(c);
        const card = id ? cards.find(cc => cc.id === id) : null;
        const gender = card && card.card_json && card.card_json.gender;
        const name = (getCharRoleName(c) || (card && card.name) || '').trim();
        if (!name) return;
        if (gender === '男' && !leads.male) leads.male = name;
        if (gender === '女' && !leads.female) leads.female = name;
    });
    return leads;
}

/** 登記簿：跨批次累積「出現過的角色」與「追蹤中的伏筆」，讓 AI 前後使用同一套名稱 */
function moodCreateRegistry(seedNames) {
    return { chars: new Map(), seeds: seedNames.slice(), fores: [] };
}

// 角色名稱正規化：與既有名稱視為同一人就沿用先出現者
function moodCanonChar(reg, name) {
    for (const k of reg.chars.keys()) if (moodSameName(k, name)) return k;
    for (const k of reg.seeds) if (moodSameName(k, name)) return k;
    return name;
}

// 找伏筆登記簿中同名的伏筆
function moodFindThread(reg, name) {
    return reg.fores.find(t => moodSameName(t.name, name)) || null;
}

const moodActionRank = a => MOOD_FORE_ACTIONS.indexOf(a);

/**
 * 把一筆驗證過的 AI 結果寫進段落，並更新登記簿。
 * 伏筆動作的修正規則（小模型常搞混，所以不盡信 action）：
 *   - 名稱沒見過 → 一律視為「埋下」；
 *   - 名稱已存在卻寫「埋下」→ 視為「呼應」（同批次後面段落再提到剛埋的伏筆時就會發生）；
 *   - 同一段同一條伏筆只留一筆（取較強的強度、較「結案」的動作）。
 */
function moodApplyItem(seg, item, reg, leads) {
    seg.summary = item.summary;
    seg.scores = item.scores;
    seg.characters = {};
    item.characters.forEach(c => {
        const name = moodCanonChar(reg, c.name);
        seg.characters[name] = c.score;
        reg.chars.set(name, (reg.chars.get(name) || 0) + 1);
    });
    // 男／女主角處境：已知該主角姓名，但 AI 沒把他／她列在這一段登場的 characters 裡，就視為沒登場、分數清掉（留白）。
    // （小模型常常忘了在沒登場時填 0；characters 是它先寫出來的「誰在場」，比事後補的 0 可靠）
    MOOD_METRICS.forEach(m => {
        const leadName = m.lead && leads && leads[m.lead];
        if (leadName && !Object.keys(seg.characters).some(n => moodSameName(n, leadName))) delete seg.scores[m.id];
    });
    seg.foreshadows = [];
    item.foreshadows.forEach(ev => {
        let th = moodFindThread(reg, ev.name);
        let action = ev.action;
        if (!th) {
            th = { name: ev.name, note: ev.note || '', firstId: seg.id, lastId: seg.id, resolved: false };
            reg.fores.push(th);
            action = '埋下';
        } else if (action === '埋下') {
            action = '呼應';
        }
        if (!th.note && ev.note) th.note = ev.note;
        th.lastId = Math.max(th.lastId, seg.id);
        if (action === '回收') th.resolved = true;
        const dup = seg.foreshadows.find(e => e.name === th.name);
        if (dup) {
            dup.strength = Math.max(dup.strength, ev.strength);
            if (moodActionRank(action) > moodActionRank(dup.action)) dup.action = action;
        } else {
            seg.foreshadows.push({ name: th.name, action, strength: ev.strength });
        }
    });
}

// 組出送給後端的「前情狀態」：已知角色、已知伏筆、最近幾段的摘要與評分
function moodBuildContext(reg, data) {
    const chars = [...reg.chars.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]);
    reg.seeds.forEach(s => { if (!chars.some(c => moodSameName(c, s))) chars.push(s); });
    const fores = reg.fores.slice().sort((a, b) => b.lastId - a.lastId).slice(0, MOOD_THREAD_LIMIT)
        .map(t => ({ name: t.name, note: t.note, resolved: t.resolved }));
    const recent = data.segments.filter(s => s.scores).slice(-4)
        .map(s => ({ id: s.id, summary: s.summary, scores: s.scores }));
    return { known_characters: chars.slice(0, MOOD_MAIN_CHAR_LIMIT + 2), known_foreshadows: fores, recent };
}

// 段落所屬的「章／節」標題（給 AI 定位用）
function moodSegTitle(data, seg) {
    const ch = data.outline[seg.ch], sec = ch && ch.sections[seg.sec];
    return `${ch ? ch.title : ''}／${sec ? sec.title : ''}`;
}

/**
 * 分析一批段落：呼叫後端 → 解析驗證 → 寫入資料。第一次沒拿齊的段落會再補送一次。
 * 回傳 true 表示流程可繼續；回傳 false 表示發生致命錯誤（例如伺服器離線），整個產生流程應停止。
 */
async function moodAnalyzeBatch(batch, ctx) {
    const { data, texts, reg, docName, batchNo, leads } = ctx;
    for (let attempt = 0; attempt < 3; attempt++) {
        const todo = batch.filter(s => !s.scores);
        if (!todo.length) return true;
        if (attempt > 0) {
            // 本機 Ollama 偶爾會暫時性出錯（例如模型剛卸載又重載），稍等一下再補送，比立刻重送容易成功
            appendLog(`🔁 心情軸線：有 ${todo.length} 個段落沒拿到有效結果，${attempt * 3} 秒後第 ${attempt + 1} 次嘗試...`);
            await new Promise(r => setTimeout(r, attempt * 3000));
        }

        const payload = {
            doc_name: docName,
            model: state.currentModel || 'gemma4',
            model_options: buildModelOptionsWithSeed(),
            metrics: MOOD_METRICS.map(m => ({ id: m.id, group: m.group, label: m.label, hint: m.hint, low: m.low, mid: m.mid, high: m.high })),
            total_segments: data.segments.length,
            leads,                                              // 男／女主角姓名（取自角色卡；未知則為空字串）
            debug_prompt: batchNo === 1 && attempt === 0,      // 只有第一批把完整提示詞印到 LOG，避免洗版
            segments: todo.map(s => ({ id: s.id, title: moodSegTitle(data, s), text: texts.get(s.id) || '' })),
            ...moodBuildContext(reg, data)
        };
        let result = null;
        try {
            result = await callDebugServerAsync('/api/mood_axis_async', payload);
        } catch (e) {
            appendLog('❌ 心情軸線：呼叫後端失敗：' + e.message);
            if (/offline/i.test(e.message)) return false;
            if (/HTTP 400/.test(e.message)) {
                // 舊版 debug_server.py 沒有 /api/mood_axis_async，對未知路徑回 400
                alert('❌ 心情軸線無法執行：後端回應 HTTP 400，通常是 debug_server.py 還是舊版（沒有心情軸線端點）。\n請關閉後重新啟動 debug_server.py，再重新執行。');
                return false;
            }
        }
        const valid = new Set(todo.map(s => s.id));
        let applied = 0;
        moodExtractItems(result).forEach(raw => {
            const item = moodCleanItem(raw, MOOD_METRICS, valid);
            if (!item) return;
            const seg = data.segments[item.id - 1];
            if (!seg || seg.scores) return;
            moodApplyItem(seg, item, reg, leads);
            applied++;
        });
        appendLog(`📈 心情軸線：第 ${batchNo} 批 ${todo.length} 段，取得 ${applied} 段有效結果。`);
    }
    return true;
}

// 全部批次結束後整理：挑出主要角色與主要伏筆，只保留這些在各段的資料
function moodFinalize(data, reg) {
    const seeds = reg.seeds;
    // 主要角色：出現 2 次以上（或是角色欄設定的角色且至少出現 1 次），依次數排序，最多 8 位
    const chars = [...reg.chars.entries()]
        .filter(([name, n]) => n >= 2 || seeds.some(s => moodSameName(s, name)))
        .sort((a, b) => b[1] - a[1]).slice(0, MOOD_MAIN_CHAR_LIMIT).map(e => e[0]);
    data.characters = chars;
    // 主要伏筆：至少有 2 次事件（埋下後又被呼應／回收），或單次事件但非常醒目（強度 ≥ 6）。
    // 小模型常把氣氛、象徵意義也當成伏筆，這類「只埋下一次、之後沒人再提」的多半是雜訊，不放進圖表。
    // 依事件數與強度挑最多 12 條，再依首次出現順序排列。
    const stat = {};
    data.segments.forEach(s => s.foreshadows.forEach(e => {
        const t = stat[e.name] || (stat[e.name] = { n: 0, max: 0 });
        t.n++;
        t.max = Math.max(t.max, e.strength);
    }));
    const keep = reg.fores.filter(t => stat[t.name] && (stat[t.name].n >= 2 || stat[t.name].max >= 6))
        .sort((a, b) => (stat[b.name].n * 1000 + stat[b.name].max) - (stat[a.name].n * 1000 + stat[a.name].max))
        .slice(0, MOOD_THREAD_LIMIT).sort((a, b) => a.firstId - b.firstId);
    data.foreshadows = keep.map(t => ({ name: t.name, note: t.note }));
    const keepNames = new Set(keep.map(t => t.name));
    data.segments.forEach(s => {
        const kept = {};
        chars.forEach(c => { if (s.characters[c] != null) kept[c] = s.characters[c]; });
        s.characters = kept;
        s.foreshadows = s.foreshadows.filter(e => keepNames.has(e.name));
    });
    data.partial = data.segments.some(s => !s.scores);
}

/**
 * 產生心情軸線（主流程）。
 * @param {{chapters: Array}} structure  章／節結構（moodStructureFromNovel／moodStructureFromText 的回傳）
 * @param {string} docName               文件名稱
 * @param {'novel'|'file'} sourceType    資料來源：目前編輯中的小說／外部文檔
 */
async function runMoodAxisJob(structure, docName, sourceType) {
    if (moodRunning) {
        appendLog('⚠️ 心情軸線正在產生中，已略過這次要求。');
        return;
    }
    const { outline, segments, texts, target } = moodSegmentize(structure.chapters);
    if (!segments.length) {
        appendLog('⚠️ 心情軸線：沒有可分析的內文，已略過。');
        return;
    }
    const totalChars = segments.reduce((a, s) => a + s.chars, 0);
    const data = moodCreateData(docName, sourceType, outline, segments, totalChars);
    const seeds = (sourceType === 'novel')
        ? (state.characters || []).map(c => getCharRoleName(c)).filter(Boolean) : [];
    const reg = moodCreateRegistry(seeds);
    const leads = (sourceType === 'novel') ? moodLeadNames() : { male: '', female: '' };
    const batches = moodMakeBatches(segments, texts);

    moodRunning = true;
    moodAbort = false;
    moodData = data;
    moodView.selectedCol = null;
    moodPickDefaultLevel();
    openMoodPanel();
    moodUpdateButtons();
    appendLog(`📈 心情軸線：開始分析「${docName}」，共 ${totalChars} 字、切成 ${segments.length} 個時間點（約 ${target} 字／點）、分 ${batches.length} 批。`);
    if (structure.skipped) appendLog(`ℹ️ 心情軸線：已略過 ${structure.skipped} 個「🔕 禁止匯出」的小節（讀者讀不到）。`);

    const t0 = Date.now();
    let fatal = false;
    try {
        for (let i = 0; i < batches.length; i++) {
            if (moodAbort) break;
            const done = segments.filter(s => s.scores).length;
            moodSetStatus(`分析中：第 ${i + 1} / ${batches.length} 批（已完成 ${done} / ${segments.length} 段）…`);
            const ok = await moodAnalyzeBatch(batches[i], { data, texts, reg, docName, batchNo: i + 1, leads });
            moodRender();
            if (!ok) { fatal = true; break; }
        }
    } finally {
        moodFinalize(data, reg);
        moodRunning = false;
        moodUpdateButtons();
        moodRender();
        const sec = Math.round((Date.now() - t0) / 1000);
        const done = segments.filter(s => s.scores).length;
        const state0 = fatal ? '❌ 因錯誤中止' : (moodAbort ? '⏹ 已停止' : '✅ 完成');
        moodSetStatus(`${state0}：${done} / ${segments.length} 段已分析，用時 ${Math.floor(sec / 60)} 分 ${sec % 60} 秒。`);
        appendLog(`📈 心情軸線：${state0}，${done} / ${segments.length} 段已分析。`);
        if (done > 0) moodExport(true, data);
    }
}

/**
 * 供 novel_generator_app.js 的評論流程呼叫：評論全部完成後，若勾選「心情軸線」就接著產生。
 * 例外一律在此吃掉，確保「心情軸線」出任何問題都不會影響已完成的原有評論結果。
 */
async function runMoodAxisAfterReview(fullText, docName, sourceType) {
    try {
        const structure = (sourceType === 'novel') ? moodStructureFromNovel() : moodStructureFromText(fullText, docName);
        await runMoodAxisJob(structure, docName, sourceType);
    } catch (e) {
        console.error(e);
        appendLog('❌ 心情軸線發生錯誤：' + e.message);
        moodRunning = false;
        moodUpdateButtons();
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 七、匯出與讀入
// ═══════════════════════════════════════════════════════════════════════════

// 觸發瀏覽器下載一個 .json 檔
function moodDownloadJson(filename, obj) {
    const blob = new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 匯出心情軸線為「文件名稱_心情軸線.json」（預設匯出目前顯示中的資料）。auto＝產生完成後自動匯出（只影響 LOG 文字）
function moodExport(auto, data = moodData) {
    if (!data) { alert('目前沒有心情軸線資料可匯出。'); return; }
    const filename = `${sanitizeFilename(data.title) || '未命名'}_心情軸線.json`;
    moodDownloadJson(filename, data);
    appendLog(`📤 已${auto ? '自動' : ''}匯出心情軸線：${filename}`);
}

/**
 * 讀入存檔：驗證格式後取代目前顯示的資料。回傳整理後的資料；格式不符則丟出 Error（訊息可直接顯示給使用者）。
 * 只做「結構是否可用」的檢查，各欄位缺漏時補預設值，不信任檔案內容（顯示時一律經 moodEsc 跳脫）。
 */
function moodParseFile(text) {
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('不是有效的 JSON 檔案。'); }
    if (!obj || obj.format !== MOOD_FORMAT) throw new Error('這不是「心情軸線」存檔（format 不符）。');
    if (Number(obj.version) > MOOD_VERSION) throw new Error(`存檔版本 ${obj.version} 比本程式支援的版本 ${MOOD_VERSION} 新，請更新程式後再讀入。`);
    if (!Array.isArray(obj.segments) || !obj.segments.length) throw new Error('存檔裡沒有任何段落資料。');
    if (!Array.isArray(obj.outline)) obj.outline = [];
    obj.segments.forEach((s, i) => {
        s.id = Number(s.id) || (i + 1);
        s.ch = Number(s.ch) || 0;
        s.sec = Number(s.sec) || 0;
        s.chars = Number(s.chars) || 0;
        s.summary = String(s.summary || '');
        s.excerpt = String(s.excerpt || '');
        s.scores = (s.scores && typeof s.scores === 'object') ? s.scores : null;
        s.characters = (s.characters && typeof s.characters === 'object') ? s.characters : {};
        s.foreshadows = Array.isArray(s.foreshadows) ? s.foreshadows : [];
    });
    if (!Array.isArray(obj.metrics) || !obj.metrics.length) obj.metrics = MOOD_METRICS.map(m => ({ ...m }));
    obj.characters = Array.isArray(obj.characters) ? obj.characters : [];
    obj.foreshadows = Array.isArray(obj.foreshadows) ? obj.foreshadows : [];
    obj.source = obj.source || { type: 'file', name: obj.title || '' };
    obj.title = String(obj.title || obj.source.name || '未命名');
    return obj;
}

// 開啟檔案選擇視窗，讀入已匯出的心情軸線存檔並顯示
function pickMoodAxisFile() {
    if (moodRunning) {
        alert('心情軸線正在產生中，請等它完成（或按視窗內的「停止產生」）後，再讀入存檔。');
        if (moodData) openMoodPanel();
        return;
    }
    const input = qs('#mood-file-input');
    input.value = '';
    input.click();
}

async function onMoodFilePicked(event) {
    const file = (event.target.files || [])[0];
    event.target.value = '';
    if (!file) return;
    try {
        const data = moodParseFile(await file.text());
        moodData = data;
        moodView.selectedCol = null;
        moodPickDefaultLevel();
        openMoodPanel();
        moodSetStatus(`📂 已讀入存檔：${file.name}${data.partial ? '（此存檔為部分結果）' : ''}`);
        moodRender();
        appendLog(`📂 已讀入心情軸線存檔：${file.name}（${data.segments.length} 段）`);
    } catch (e) {
        alert('❌ 無法讀入心情軸線存檔：' + e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 八、檢視：時間軸精細度、欄位彙整
// ═══════════════════════════════════════════════════════════════════════════

// 每一格（時間點）的寬度 px：固定為 24px × 縮放倍率，與精細度（章／節／段落）無關；格數太多就用橫向捲動軸往後看
function moodColWidth() {
    return Math.round(MOOD_COL_BASE * moodView.zoom);
}

/**
 * 載入新資料（剛產生完、或讀入存檔）時重設檢視：時間軸精細度預設為「段落」（最細的時間軸），縮放回 100%。
 * 欄寬固定，格數多就捲動橫向捲動軸；想先看全貌，可再手動切換成「節」或「章」。
 */
function moodPickDefaultLevel() {
    if (!moodData) return;
    moodView.level = 'paragraph';
    moodView.zoom = 1;
    const sel = qs('#mood-level');
    if (sel) sel.value = moodView.level;
    const zt = qs('#mood-zoom-text');
    if (zt) zt.textContent = '100%';
}

/**
 * 依精細度把段落分組成「欄」。每欄：{ segs, ch, sec, minId, maxId }
 *   paragraph：一個段落一欄；section：同一章同一節合成一欄；chapter：同一章合成一欄。
 */
function moodBuildColumns(data, level) {
    if (level === 'paragraph') return data.segments.map(s => ({ segs: [s], ch: s.ch, sec: s.sec, minId: s.id, maxId: s.id }));
    const cols = [];
    const map = new Map();
    data.segments.forEach(s => {
        const key = level === 'chapter' ? String(s.ch) : `${s.ch}-${s.sec}`;
        let c = map.get(key);
        if (!c) { c = { segs: [], ch: s.ch, sec: s.sec, minId: s.id, maxId: s.id }; map.set(key, c); cols.push(c); }
        c.segs.push(s);
        c.maxId = s.id;
    });
    return cols;
}

const moodAvg = arr => arr.reduce((a, b) => a + b, 0) / arr.length;

// 某欄某指標的值（章／節＝所含段落已分析者的平均；沒有資料回傳 null）
function moodColMetric(col, id) {
    const vs = col.segs.map(s => s.scores && s.scores[id]).filter(v => v != null);
    return vs.length ? moodAvg(vs) : null;
}

// 某欄某角色的關愛值（只算有登場的段落；整欄都沒登場回傳 null＝留白）
function moodColChar(col, name) {
    const vs = col.segs.map(s => s.characters && s.characters[name]).filter(v => v != null);
    return vs.length ? moodAvg(vs) : null;
}

/**
 * 整理每條伏筆的時間範圍，用來畫「懸而未決」的細線：
 * first＝首次出現的段落 id；last＝已回收則為最後一次事件的 id，未回收則為 Infinity（一路延伸到結尾，提醒作者還沒回收）。
 */
function moodThreadInfo(data) {
    return data.foreshadows.map(f => {
        const evs = [];
        data.segments.forEach(s => s.foreshadows.forEach(e => { if (e.name === f.name) evs.push({ id: s.id, ...e }); }));
        const resolved = evs.some(e => e.action === '回收');
        const first = evs.length ? Math.min(...evs.map(e => e.id)) : Infinity;
        const lastEv = evs.length ? Math.max(...evs.map(e => e.id)) : -Infinity;
        return { name: f.name, note: f.note || '', resolved, first, last: resolved ? lastEv : Infinity, count: evs.length };
    });
}

// 某欄某條伏筆的狀態：{ kind: 'event'|'latent'|'none', value, action }
function moodColThread(col, th) {
    const evs = [];
    col.segs.forEach(s => s.foreshadows.forEach(e => { if (e.name === th.name) evs.push(e); }));
    if (evs.length) {
        const value = Math.max(...evs.map(e => e.strength));
        const action = evs.map(e => e.action).sort((a, b) => moodActionRank(b) - moodActionRank(a))[0];
        return { kind: 'event', value, action };
    }
    if (col.maxId > th.first && col.minId < th.last) return { kind: 'latent' };
    return { kind: 'none' };
}

// 對比增強用：某指標在全部已分析段落中的最小／最大值
function moodMetricRange(data, id) {
    const vs = data.segments.map(s => s.scores && s.scores[id]).filter(v => v != null);
    return vs.length ? { min: Math.min(...vs), max: Math.max(...vs) } : null;
}

// 對比增強：把該指標實際出現的 [min,max] 拉伸到 [1,7]（只影響顏色，格內數字與說明仍是原始值；範圍不足 1 分時不拉伸）
function moodStretch(v, range) {
    if (!range || range.max - range.min < 1) return v;
    return 1 + (v - range.min) / (range.max - range.min) * 6;
}

// ═══════════════════════════════════════════════════════════════════════════
// 九、繪製圖表
// ═══════════════════════════════════════════════════════════════════════════

// 欄的位置說明：「第一章：初見／圖書館的邂逅」
function moodColPlace(data, col, withSection) {
    const ch = data.outline[col.ch], sec = ch && ch.sections[col.sec];
    const chTitle = ch ? ch.title : `第${col.ch + 1}章`;
    return withSection ? `${chTitle}／${sec ? sec.title : `第${col.sec + 1}節`}` : chTitle;
}

// 摘要列的文字：段落層級用 AI 摘要；節／章層級用作者原有的節／章標題（不另外花 AI 費用）
function moodColSummary(data, col) {
    if (moodView.level === 'paragraph') return col.segs[0].summary || '（未分析）';
    const ch = data.outline[col.ch], sec = ch && ch.sections[col.sec];
    return moodView.level === 'chapter' ? (ch ? ch.title : '') : (sec ? sec.title : '');
}

/** 組出圖表的所有「列」：群組標題列、指標列、角色列、伏筆列 */
function moodBuildRows(data) {
    const rows = [];
    const groups = [];
    data.metrics.forEach(m => { if (!groups.includes(m.group)) groups.push(m.group); });
    groups.forEach(g => {
        rows.push({ type: 'group', label: MOOD_GROUP_LABELS[g] || g });
        data.metrics.filter(m => m.group === g).forEach(m => rows.push({ type: 'metric', key: 'm:' + m.id, label: m.label, m }));
    });
    if (data.characters.length) {
        rows.push({ type: 'group', label: MOOD_GROUP_LABELS.char });
        data.characters.forEach(c => rows.push({ type: 'char', key: 'c:' + c, label: c, name: c }));
    }
    const threads = moodThreadInfo(data);
    if (threads.length) {
        rows.push({ type: 'group', label: MOOD_GROUP_LABELS.fore });
        threads.forEach(t => rows.push({ type: 'thread', key: 'f:' + t.name, label: t.name + (t.resolved ? '' : '（未回收）'), th: t }));
    }
    return rows;
}

/** 重繪整張圖表（保留捲動位置）。產生過程中每批結果回來都會呼叫，所以只用字串拼接一次寫入 innerHTML。 */
function moodRender() {
    const grid = qs('#mood-grid');
    const scroller = qs('#mood-scroll');
    if (!grid) return;
    qs('#mood-doc-name').textContent = moodData ? `— ${moodData.title}` : '';
    moodRenderLegend();
    if (!moodData) {
        grid.innerHTML = '';
        qs('#mood-info').textContent = '尚無資料。請在「評論小說」勾選「心情軸線」並執行評論，或按「讀入存檔」開啟已匯出的 .json。　' + moodIdleHint();
        return;
    }
    const data = moodData;
    const level = moodView.level;
    const cols = moodBuildColumns(data, level);
    const N = cols.length;
    const colW = moodColWidth();
    const rows = moodBuildRows(data);
    const showNum = colW >= 40;                                    // 欄夠寬時，格子裡直接顯示數字
    const ranges = {};
    if (moodView.contrast) data.metrics.forEach(m => { ranges[m.id] = moodMetricRange(data, m.id); });

    const h = [];
    // ── 表頭：章列（level 為 chapter 時，每欄就是一章）──
    h.push('<div class="mood-label mood-h1 mood-corner">章</div>');
    if (level === 'chapter') {
        cols.forEach((c, i) => h.push(`<div class="mood-head mood-head-num mood-h1" data-c="${i}" title="${moodEsc(moodColPlace(data, c, false))}"><span class="mood-head-text">${c.ch + 1}</span></div>`));
    } else {
        for (let i = 0; i < N;) {
            let j = i;
            while (j < N && cols[j].ch === cols[i].ch) j++;
            const t = moodColPlace(data, cols[i], false);
            h.push(`<div class="mood-head mood-h1" style="grid-column:span ${j - i}" title="${moodEsc(t)}"><span class="mood-head-text">${moodEsc(t)}</span></div>`);
            i = j;
        }
    }
    // ── 表頭：節列（章層級不需要）──
    if (level !== 'chapter') {
        h.push('<div class="mood-label mood-h2 mood-corner">節</div>');
        if (level === 'section') {
            cols.forEach((c, i) => h.push(`<div class="mood-head mood-head-num mood-h2" data-c="${i}" title="${moodEsc(moodColPlace(data, c, true))}"><span class="mood-head-text">${c.sec + 1}</span></div>`));
        } else {
            for (let i = 0; i < N;) {
                let j = i;
                while (j < N && cols[j].ch === cols[i].ch && cols[j].sec === cols[i].sec) j++;
                const ch = data.outline[cols[i].ch], sec = ch && ch.sections[cols[i].sec];
                const t = sec ? sec.title : `第${cols[i].sec + 1}節`;
                h.push(`<div class="mood-head mood-h2" style="grid-column:span ${j - i}" title="${moodEsc(moodColPlace(data, cols[i], true))}"><span class="mood-head-text">${moodEsc(t)}</span></div>`);
                i = j;
            }
        }
    }
    // ── 摘要列：直排文字，說明該時間點寫了什麼 ──
    h.push('<div class="mood-label">段落內容</div>');
    cols.forEach((c, i) => {
        h.push(`<div class="mood-cell mood-sum" data-c="${i}" data-r="sum"><span class="mood-vtext">${moodEsc(moodColSummary(data, c))}</span></div>`);
    });
    // ── 指標列、角色列、伏筆列 ──
    rows.forEach(r => {
        if (r.type === 'group') {
            h.push(`<div class="mood-label mood-group">${moodEsc(r.label)}</div><div class="mood-group-fill" style="grid-column:2 / -1"></div>`);
            return;
        }
        const tip = r.type === 'metric'
            ? `${r.m.label}：${r.m.hint}\n1分＝${r.m.low}\n4分＝${r.m.mid}\n7分＝${r.m.high}`
            : (r.type === 'thread' ? `${r.th.name}${r.th.note ? '：' + r.th.note : ''}\n${r.th.resolved ? '已回收' : '尚未回收'}（共 ${r.th.count} 次事件）` : r.label);
        h.push(`<div class="mood-label" title="${moodEsc(tip)}">${moodEsc(r.label)}</div>`);
        cols.forEach((c, i) => {
            const analyzed = c.segs.some(s => s.scores);
            if (!analyzed) { h.push(`<div class="mood-cell na" data-c="${i}" data-r="${moodEsc(r.key)}"></div>`); return; }
            let v = null, cls = (r.type === 'thread') ? 'mood-cell mood-fs' : 'mood-cell', inner = '';
            if (r.type === 'metric') v = moodColMetric(c, r.m.id);
            else if (r.type === 'char') v = moodColChar(c, r.name);
            else {
                const st = moodColThread(c, r.th);
                if (st.kind === 'event') { v = st.value; inner = MOOD_FORE_GLYPH[st.action] || ''; }
                else if (st.kind === 'latent') cls += ' latent';
            }
            let style = '';
            if (v != null) {
                const shown = (r.type === 'metric' && moodView.contrast) ? moodStretch(v, ranges[r.m.id]) : v;
                const col = moodColor(shown);
                style = ` style="background:${col.bg};color:${col.fg}"`;
                if (r.type !== 'thread' && showNum) inner = Number.isInteger(v) ? String(v) : v.toFixed(1);
            } else if (!cls.includes('latent')) cls += ' empty';
            h.push(`<div class="${cls}" data-c="${i}" data-r="${moodEsc(r.key)}"${style}>${inner}</div>`);
        });
    });

    const keepL = scroller.scrollLeft, keepT = scroller.scrollTop;
    grid.style.setProperty('--mood-col-w', colW + 'px');
    // 「段落內容」直排文字的倍率：隨欄寬同比例放大，但縮小欄寬時文字不縮小（維持原本大小，避免更難閱讀）
    grid.style.setProperty('--mood-text-scale', String(Math.max(1, moodView.zoom)));
    // 每一欄固定寬度（不因精細度或欄數而伸縮）；欄數多就由 .mood-scroll 的橫向捲動軸往後看
    grid.style.gridTemplateColumns = `var(--mood-label-w) repeat(${N}, var(--mood-col-w))`;
    grid.innerHTML = h.join('');
    scroller.scrollLeft = keepL;
    scroller.scrollTop = keepT;
    grid._cols = cols;                                             // 事件處理時用來查「這欄是哪些段落」
    grid._rows = rows;
    moodApplyHighlight();
    qs('#mood-status').textContent = moodStatusText;
    if (moodView.hoverCol == null) qs('#mood-info').textContent = moodIdleHint();
}

// 色階圖例：依目前配色畫出 1~7 分七個色塊（每次重繪都重畫，切換配色後才會跟著變）
function moodRenderLegend() {
    const el = qs('#mood-legend');
    if (!el) return;
    const tips = { 1: '，最低（低潮、谷底、令人討厭）', 4: '，普通', 7: '，最高（高潮、值得關愛）' };
    el.innerHTML = moodPalette().names.map((name, i) => {
        const c = moodColor(i + 1);
        const tip = `${i + 1} 分：${name}${tips[i + 1] || ''}`;
        return `<span class="mood-swatch" style="background:${c.bg};color:${c.fg}" title="${moodEsc(tip)}">${i + 1}</span>`;
    }).join('');
}

// 把「滑鼠停留欄」與「已選取欄」的外框畫上去（重繪後也要重新套用）
function moodApplyHighlight() {
    const grid = qs('#mood-grid');
    if (!grid) return;
    grid.querySelectorAll('.hl, .sel').forEach(el => el.classList.remove('hl', 'sel'));
    if (moodView.hoverCol != null) grid.querySelectorAll(`[data-c="${moodView.hoverCol}"]`).forEach(el => el.classList.add('hl'));
    if (moodView.selectedCol != null) grid.querySelectorAll(`[data-c="${moodView.selectedCol}"]`).forEach(el => el.classList.add('sel'));
}

// 底部說明列：顯示滑鼠停留格子的位置、摘要與分數
function moodInfoText(colIdx, rowKey) {
    const grid = qs('#mood-grid');
    const col = grid._cols && grid._cols[colIdx];
    if (!col || !moodData) return '';
    const data = moodData;
    const first = col.segs[0], last = col.segs[col.segs.length - 1];
    let place = moodColPlace(data, col, moodView.level !== 'chapter');
    if (moodView.level === 'paragraph') place += `・段落 ${first.id}（${first.chars} 字）`;
    else place += `（含段落 ${first.id}~${last.id}，共 ${col.segs.length} 段）`;
    const parts = [place];
    if (moodView.level === 'paragraph') parts.push(first.summary || '（未分析）');
    else {
        const sums = col.segs.map(s => s.summary).filter(Boolean).slice(0, 4).join('／');
        if (sums) parts.push(sums + (col.segs.length > 4 ? '…' : ''));
    }
    const r = (grid._rows || []).find(x => x.key === rowKey);
    if (r) {
        if (r.type === 'metric') {
            const v = moodColMetric(col, r.m.id);
            parts.push(v == null && r.m.nullable ? `${r.m.label}：這段沒有登場（留白）` : `${r.m.label}：${moodScoreText(v)}`);
        }
        else if (r.type === 'char') {
            const v = moodColChar(col, r.name);
            parts.push(v == null ? `${r.name}：這段沒有登場` : `${r.name} 關愛指數：${moodScoreText(v)}`);
        } else if (r.type === 'thread') {
            const st = moodColThread(col, r.th);
            parts.push(st.kind === 'event' ? `伏筆「${r.th.name}」${st.action}，醒目度 ${st.value}／7`
                : (st.kind === 'latent' ? `伏筆「${r.th.name}」懸而未決中` : `這段沒有伏筆「${r.th.name}」`));
        }
    }
    return parts.join('　｜　');
}

// 點擊圖表欄位：選取該欄，若資料來自目前編輯中的小說，順便跳到編輯區對應的章節與位置
function moodJumpToEditor(seg) {
    if (!moodData || !moodData.source || moodData.source.type !== 'novel') return;
    const ch = moodData.outline[seg.ch], sec = ch && ch.sections[seg.sec];
    if (!ch || !sec || ch.src == null || sec.src == null) return;
    const section = state.chapters && state.chapters[ch.src] && state.chapters[ch.src].sections[sec.src];
    if (!section) return;                                          // 小說後來被改動、章節已不存在
    setActive(ch.src, sec.src);
    const editor = qs('#main-editor');
    const idx = seg.excerpt ? (section.content || '').indexOf(seg.excerpt) : -1;
    if (editor && idx >= 0) gsFocusAndSelect(editor, idx, idx + seg.excerpt.length, seg.excerpt);
}

// ═══════════════════════════════════════════════════════════════════════════
// 十、視窗與工具列
// ═══════════════════════════════════════════════════════════════════════════

// 預設：寬度 100%（貼齊瀏覽器左右）、高度 90%（上下置中）；
// 縮小：瀏覽器左上角 1/3 寬 × 1/2 高（讓作者備註縮在左下角，兩者可同時並排檢視）
function moodDefaultRect() {
    const h = window.innerHeight * 0.9;
    return [0, (window.innerHeight - h) / 2, window.innerWidth, h];
}
function moodMinimizeRect() {
    return [0, 0, window.innerWidth / 3, window.innerHeight / 2];
}

// 顯示心情軸線視窗：首次開啟套用預設位置，之後保留使用者調整過的位置與尺寸
function openMoodPanel() {
    const panel = qs('#modal-mood-axis');
    if (!panel.style.width) setFloatPanelRect(panel, ...moodDefaultRect());
    panel.classList.remove('hidden');
    expandFloatPanel(panel);          // 上次若收成「只剩標題列」，重新開啟（產生、讀入存檔）時展開，才看得到圖表
    bringFloatPanelToFront(panel);
    moodRender();
}

function moodSetStatus(text) {
    moodStatusText = text;
    const el = qs('#mood-status');
    if (el) el.textContent = text;
}

// 產生中才顯示「停止產生」；匯出鈕需要有資料
function moodUpdateButtons() {
    const stop = qs('#btn-mood-stop');
    if (stop) stop.style.display = moodRunning ? '' : 'none';
    const exp = qs('#btn-mood-export');
    if (exp) exp.disabled = !moodData;
}

// 初始化：視窗拖曳／縮放、工具列、圖表的滑鼠互動、各處「顯示心情軸線」按鈕
function initMoodAxis() {
    const panel = qs('#modal-mood-axis');
    if (!panel) return;
    initFloatPanel({
        panel,
        header: qs('#mood-header'),
        btnCollapse: qs('#btn-mood-collapse'),
        btnMin: qs('#btn-mood-min'),
        btnDefault: qs('#btn-mood-default'),
        btnMax: qs('#btn-mood-max'),
        defaultRect: moodDefaultRect,
        minimizeRect: moodMinimizeRect
    });
    qs('#btn-mood-close').addEventListener('click', () => panel.classList.add('hidden'));

    // 兩處「顯示心情軸線」按鈕（評論小說彈窗、額外功能選單）與視窗內的「讀入存檔」都開同一個檔案選擇
    ['#btn-review-show-mood', '#btn-show-mood-axis', '#btn-mood-load'].forEach(sel => {
        const b = qs(sel);
        if (b) b.addEventListener('click', pickMoodAxisFile);
    });
    const input = qs('#mood-file-input');
    input.addEventListener('change', onMoodFilePicked);
    // 取消選檔時，若記憶體中已有心情軸線（例如剛產生完又關掉視窗），就直接把視窗重新顯示出來
    input.addEventListener('cancel', () => { if (moodData) openMoodPanel(); });

    qs('#btn-mood-export').addEventListener('click', () => moodExport(false));
    qs('#btn-mood-stop').addEventListener('click', () => {
        moodAbort = true;
        moodSetStatus('⏹ 停止中…（等目前這一批分析完就會停止，已完成的部分會保留並匯出）');
    });

    // 精細度、縮放、對比增強
    qs('#mood-level').value = moodView.level;                       // 預設「段落」
    qs('#mood-level').addEventListener('change', e => { moodView.level = e.target.value; moodView.selectedCol = null; moodRender(); });
    const zoom = delta => {
        moodView.zoom = Math.min(MOOD_ZOOM_MAX, Math.max(MOOD_ZOOM_MIN, Math.round((moodView.zoom + delta) * 100) / 100));
        qs('#mood-zoom-text').textContent = Math.round(moodView.zoom * 100) + '%';
        moodRender();
    };
    qs('#btn-mood-zoom-out').addEventListener('click', () => zoom(-0.125));
    qs('#btn-mood-zoom-in').addEventListener('click', () => zoom(0.25));
    qs('#mood-contrast').addEventListener('change', e => { moodView.contrast = e.target.checked; moodRender(); });

    // 顏色切換：選單內容由 MOOD_PALETTES 產生，預設七彩；切換後圖表、圖例、說明文字一起更新
    const palSel = qs('#mood-palette');
    palSel.innerHTML = Object.entries(MOOD_PALETTES).map(([key, pal]) => `<option value="${key}">${moodEsc(pal.label)}</option>`).join('');
    palSel.value = moodView.palette;
    palSel.addEventListener('change', e => { moodView.palette = e.target.value; moodRender(); });

    // 圖表滑鼠互動（事件委派：一個監聽器處理上千個格子）
    const grid = qs('#mood-grid');
    const info = qs('#mood-info');
    grid.addEventListener('mouseover', e => {
        const cell = e.target.closest('[data-c]');
        if (!cell) return;
        const c = Number(cell.dataset.c);
        if (c !== moodView.hoverCol) { moodView.hoverCol = c; moodApplyHighlight(); }
        info.textContent = moodInfoText(c, cell.dataset.r || '');
    });
    grid.addEventListener('mouseleave', () => { moodView.hoverCol = null; moodApplyHighlight(); info.textContent = moodIdleHint(); });
    grid.addEventListener('click', e => {
        const cell = e.target.closest('[data-c]');
        if (!cell || !grid._cols) return;
        const c = Number(cell.dataset.c);
        moodView.selectedCol = c;
        moodApplyHighlight();
        moodJumpToEditor(grid._cols[c].segs[0]);
    });

    moodUpdateButtons();
    moodRender();
}

document.addEventListener('DOMContentLoaded', initMoodAxis);
