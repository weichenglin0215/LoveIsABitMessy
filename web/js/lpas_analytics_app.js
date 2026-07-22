/**
 * lpas_analytics_app.js - LPAS 後台數據分析邏輯
 */

// Supabase client 實例（全域共用）
let sb = null;
// 儲存所有 Chart.js 圖表實例，方便重繪前先 destroy 舊圖表
let charts = {};

document.addEventListener('DOMContentLoaded', async () => {
    // 初始化日期：預設查詢區間為「一個月前」到「今天」
    const now = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(now.getMonth() - 1);

    document.getElementById('start-date').value = lastMonth.toISOString().split('T')[0];
    document.getElementById('end-date').value = now.toISOString().split('T')[0];

    // 初始化 Supabase 連線，若失敗則中止後續流程
    if (window.SupabaseClient && window.SupabaseClient.init && window.SupabaseClient.init()) {
        sb = window.SupabaseClient.getClient();
    } else {
        alert('Supabase 初始化失敗，請檢查 js/supabaseClient.js');
        return;
    }

    // 綁定「重新整理」按鈕，點擊後重新抓取資料
    document.getElementById('btn-refresh').addEventListener('click', fetchData);

    // 頁面載入時首次抓取資料
    fetchData();
});

// 依照畫面上設定的日期區間，向 Supabase 抓取 lpas_results 資料（含關聯的 lpas_sessions）
async function fetchData() {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (!sb) return;

    // 抓取結果與關聯的 session 資料
    // type_code: 人格類型代碼；feedback_scores: 使用者對各期評分；
    // lpas_sessions: 關聯的測驗場次（含開始/結束時間，用於計算作答時間）
    const { data, error } = await sb
        .from('lpas_results')
        .select(`
            id, type_code, type_name, feedback_scores, created_at,
            lpas_sessions (started_at, finished_at)
        `)
        .gte('created_at', startDate + 'T00:00:00')
        .lte('created_at', endDate + 'T23:59:59');

    if (error) {
        console.error('Fetch error:', error);
        alert('資料抓取失敗: ' + error.message);
        return;
    }

    // 將抓到的原始資料丟給 processData 做統計與繪圖
    processData(data || []);
}

// 統整原始資料，計算各項統計數字並依序呼叫各圖表繪製函式
function processData(rawData) {
    // 顯示總樣本數
    document.getElementById('total-samples').innerText = rawData.length;

    // 1. 三期正確性平均 (Table 1)
    // sums: 各期評分總和；counts: 各期有效評分筆數（用於算平均）
    let sums = { ambiguity: 0, love: 0, breakup: 0 };
    let counts = { ambiguity: 0, love: 0, breakup: 0 };

    rawData.forEach(row => {
        const fb = row.feedback_scores || {};
        // 只有存在該欄位分數時才累加（避免把 undefined/0 誤判為有效值時的邏輯保持原樣）
        if (fb.ambiguity) { sums.ambiguity += fb.ambiguity; counts.ambiguity++; }
        if (fb.love) { sums.love += fb.love; counts.love++; }
        if (fb.breakup) { sums.breakup += fb.breakup; counts.breakup++; }
    });

    // 計算三期的平均分數，取小數點後兩位；分母為 0 時以 1 代替避免除以 0
    const avgs = {
        ambiguity: (sums.ambiguity / (counts.ambiguity || 1)).toFixed(2),
        love: (sums.love / (counts.love || 1)).toFixed(2),
        breakup: (sums.breakup / (counts.breakup || 1)).toFixed(2)
    };

    // 將平均分數顯示到畫面對應的元素上
    document.getElementById('avg-score-ambiguity').innerText = avgs.ambiguity;
    document.getElementById('avg-score-love').innerText = avgs.love;
    document.getElementById('avg-score-breakup').innerText = avgs.breakup;

    // 繪製三期平均正確性長條圖
    renderAvgChart(avgs);

    // 2. 三期正確性趨勢 (Table 2)
    renderDailyTrendChart(rawData);

    // 3. 人格個數統計 (Table 3)
    renderTypeDistributionChart(rawData);

    // 4. 分數與答題時間關聯 (Table 4)
    renderTimeCorrelationChart(rawData);
}

// 繪製「三期平均正確性評分」長條圖
function renderAvgChart(avgs) {
    const ctx = document.getElementById('chart-avg-correctness').getContext('2d');
    // 若已有舊圖表，先銷毀避免重複疊圖
    if (charts.avg) charts.avg.destroy();

    charts.avg = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['初期曖昧', '熱戀期', '失戀之後'],
            datasets: [{
                label: '平均正確性評分',
                data: [avgs.ambiguity, avgs.love, avgs.breakup],
                backgroundColor: [getVar('--adm-c1'), getVar('--adm-c2'), getVar('--adm-c3')],
                borderRadius: 6
            }]
        },
        options: {
            scales: { y: { min: 0, max: 5 } },
            plugins: { legend: { display: false } }
        }
    });
}

// 繪製「三期正確性隨日期變化」的趨勢折線圖
function renderDailyTrendChart(rawData) {
    // dailyData: 以日期為 key，記錄當天三期各自的評分陣列
    const dailyData = {};
    rawData.forEach(row => {
        // 只取日期部分（YYYY-MM-DD），用於分組
        const date = row.created_at.split('T')[0];
        if (!dailyData[date]) dailyData[date] = { ambiguity: [], love: [], breakup: [] };
        const fb = row.feedback_scores || {};
        if (fb.ambiguity) dailyData[date].ambiguity.push(fb.ambiguity);
        if (fb.love) dailyData[date].love.push(fb.love);
        if (fb.breakup) dailyData[date].breakup.push(fb.breakup);
    });

    // 依日期排序作為 X 軸標籤
    const labels = Object.keys(dailyData).sort();
    // 每個系列（曖昧/熱戀/失戀）對每個日期計算平均分數
    const datasets = [
        { label: '曖昧期', data: labels.map(d => avg(dailyData[d].ambiguity)), borderColor: getVar('--adm-c1'), fill: false },
        { label: '熱戀期', data: labels.map(d => avg(dailyData[d].love)), borderColor: getVar('--adm-c2'), fill: false },
        { label: '失戀期', data: labels.map(d => avg(dailyData[d].breakup)), borderColor: getVar('--adm-c3'), fill: false }
    ];

    const ctx = document.getElementById('chart-daily-trend').getContext('2d');
    if (charts.trend) charts.trend.destroy();
    charts.trend = new Chart(ctx, {
        type: 'line',
        data: { labels, datasets },
        options: { scales: { y: { min: 0, max: 5 } } }
    });
}

// 繪製「各期人格類型分布」的水平長條圖
function renderTypeDistributionChart(rawData) {
    // 取得所有 16 種人格類型
    // typeMap: 分別統計曖昧期/熱戀期/失戀期各代碼出現的次數
    const typeMap = { ambiguity: {}, love: {}, breakup: {} };

    rawData.forEach(row => {
        // type_code 格式類似 "A-B-C"，以 '-' 拆分成三期代碼
        const codes = (row.type_code || "").split('-');
        if (codes.length >= 3) {
            typeMap.ambiguity[codes[0]] = (typeMap.ambiguity[codes[0]] || 0) + 1;
            typeMap.love[codes[1]] = (typeMap.love[codes[1]] || 0) + 1;
            typeMap.breakup[codes[2]] = (typeMap.breakup[codes[2]] || 0) + 1;
        }
    });

    // 合併三期出現過的所有代碼並去重、排序，作為圖表的 Y 軸標籤
    const allTypes = [...new Set([...Object.keys(typeMap.ambiguity), ...Object.keys(typeMap.love), ...Object.keys(typeMap.breakup)])].sort();

    // 每個系列依照 allTypes 順序取出對應次數（沒有則為 0）
    const datasets = [
        { label: '曖昧期', data: allTypes.map(t => typeMap.ambiguity[t] || 0), backgroundColor: getVar('--adm-c1') },
        { label: '熱戀期', data: allTypes.map(t => typeMap.love[t] || 0), backgroundColor: getVar('--adm-c2') },
        { label: '失戀期', data: allTypes.map(t => typeMap.breakup[t] || 0), backgroundColor: getVar('--adm-c3') }
    ];

    const ctx = document.getElementById('chart-type-distribution').getContext('2d');
    if (charts.dist) charts.dist.destroy();
    charts.dist = new Chart(ctx, {
        type: 'bar',
        data: { labels: allTypes, datasets },
        options: { indexAxis: 'y', responsive: true, maintainAspectRatio: false }
    });
}

// 繪製「評分區間 vs 平均作答時間」關聯長條圖
function renderTimeCorrelationChart(rawData) {
    // 評分區間：0-1, 1-2, 2-3, 3-4, 4-5
    // 定義五個評分區間，用於將分數分桶統計
    const ranges = [
        { label: '0-1', min: 0, max: 1 },
        { label: '1-2', min: 1, max: 2 },
        { label: '2-3', min: 2, max: 3 },
        { label: '3-4', min: 3, max: 4 },
        { label: '4-5', min: 4, max: 5.1 }
    ];

    // groupData: 三期各自對應五個區間的作答時間陣列（秒）
    const groupData = { ambiguity: [[],[],[],[],[]], love: [[],[],[],[],[]], breakup: [[],[],[],[],[]] };

    rawData.forEach(row => {
        const sess = row.lpas_sessions;
        // 若沒有場次資料或缺少開始/結束時間，跳過此筆
        if (!sess || !sess.started_at || !sess.finished_at) return;

        // 計算作答耗時（秒）= 結束時間 - 開始時間
        const duration = (new Date(sess.finished_at) - new Date(sess.started_at)) / 1000; // 秒
        // 排除異常值：耗時小於等於 0 或超過 1 小時（3600 秒）視為異常，不列入統計
        if (duration <= 0 || duration > 3600) return; // 排除異常值

        const fb = row.feedback_scores || {};
        // 針對曖昧/熱戀/失戀三期，依評分找出所屬區間並記錄該筆的作答耗時
        ['ambiguity', 'love', 'breakup'].forEach(p => {
            const score = fb[p];
            if (score !== undefined) {
                const rIdx = ranges.findIndex(r => score >= r.min && score < r.max);
                if (rIdx !== -1) groupData[p][rIdx].push(duration);
            }
        });
    });

    // 各系列依區間計算平均作答耗時
    const datasets = [
        { label: '曖昧期', data: groupData.ambiguity.map(arr => avg(arr)), backgroundColor: getVar('--adm-c1') },
        { label: '熱戀期', data: groupData.love.map(arr => avg(arr)), backgroundColor: getVar('--adm-c2') },
        { label: '失戀期', data: groupData.breakup.map(arr => avg(arr)), backgroundColor: getVar('--adm-c3') }
    ];

    const ctx = document.getElementById('chart-time-correlation').getContext('2d');
    if (charts.time) charts.time.destroy();
    charts.time = new Chart(ctx, {
        type: 'bar',
        data: { labels: ranges.map(r => r.label), datasets },
        options: {
            // 滑鼠提示文字：顯示系列名稱與對應秒數
            plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} 秒` } } },
            scales: { y: { title: { display: true, text: '平均作答時間 (秒)' } } }
        }
    });
}

// 輔助函式
// 從 CSS 變數（如 --adm-c1）取得對應的顏色值字串，用於圖表配色
function getVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// 計算陣列的平均值，並保留小數點後一位；陣列為空時回傳 0
function avg(arr) {
    if (!arr || arr.length === 0) return 0;
    return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
}
