/**
 * lpas_analytics_app.js - LPAS 後台數據分析邏輯
 */

let sb = null;
let charts = {};

document.addEventListener('DOMContentLoaded', async () => {
    // 初始化日期
    const now = new Date();
    const lastMonth = new Date();
    lastMonth.setMonth(now.getMonth() - 1);
    
    document.getElementById('start-date').value = lastMonth.toISOString().split('T')[0];
    document.getElementById('end-date').value = now.toISOString().split('T')[0];

    // 初始化 Supabase
    if (window.SupabaseClient && window.SupabaseClient.init && window.SupabaseClient.init()) {
        sb = window.SupabaseClient.getClient();
    } else {
        alert('Supabase 初始化失敗，請檢查 js/supabaseClient.js');
        return;
    }

    document.getElementById('btn-refresh').addEventListener('click', fetchData);
    
    // 首次載入
    fetchData();
});

async function fetchData() {
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    if (!sb) return;

    // 抓取結果與關聯的 session 資料
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

    processData(data || []);
}

function processData(rawData) {
    document.getElementById('total-samples').innerText = rawData.length;

    // 1. 三期正確性平均 (Table 1)
    let sums = { ambiguity: 0, love: 0, breakup: 0 };
    let counts = { ambiguity: 0, love: 0, breakup: 0 };

    rawData.forEach(row => {
        const fb = row.feedback_scores || {};
        if (fb.ambiguity) { sums.ambiguity += fb.ambiguity; counts.ambiguity++; }
        if (fb.love) { sums.love += fb.love; counts.love++; }
        if (fb.breakup) { sums.breakup += fb.breakup; counts.breakup++; }
    });

    const avgs = {
        ambiguity: (sums.ambiguity / (counts.ambiguity || 1)).toFixed(2),
        love: (sums.love / (counts.love || 1)).toFixed(2),
        breakup: (sums.breakup / (counts.breakup || 1)).toFixed(2)
    };

    document.getElementById('avg-score-ambiguity').innerText = avgs.ambiguity;
    document.getElementById('avg-score-love').innerText = avgs.love;
    document.getElementById('avg-score-breakup').innerText = avgs.breakup;

    renderAvgChart(avgs);

    // 2. 三期正確性趨勢 (Table 2)
    renderDailyTrendChart(rawData);

    // 3. 人格個數統計 (Table 3)
    renderTypeDistributionChart(rawData);

    // 4. 分數與答題時間關聯 (Table 4)
    renderTimeCorrelationChart(rawData);
}

function renderAvgChart(avgs) {
    const ctx = document.getElementById('chart-avg-correctness').getContext('2d');
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

function renderDailyTrendChart(rawData) {
    const dailyData = {};
    rawData.forEach(row => {
        const date = row.created_at.split('T')[0];
        if (!dailyData[date]) dailyData[date] = { ambiguity: [], love: [], breakup: [] };
        const fb = row.feedback_scores || {};
        if (fb.ambiguity) dailyData[date].ambiguity.push(fb.ambiguity);
        if (fb.love) dailyData[date].love.push(fb.love);
        if (fb.breakup) dailyData[date].breakup.push(fb.breakup);
    });

    const labels = Object.keys(dailyData).sort();
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

function renderTypeDistributionChart(rawData) {
    // 取得所有 16 種人格類型
    const typeMap = { ambiguity: {}, love: {}, breakup: {} };
    
    rawData.forEach(row => {
        const codes = (row.type_code || "").split('-');
        if (codes.length >= 3) {
            typeMap.ambiguity[codes[0]] = (typeMap.ambiguity[codes[0]] || 0) + 1;
            typeMap.love[codes[1]] = (typeMap.love[codes[1]] || 0) + 1;
            typeMap.breakup[codes[2]] = (typeMap.breakup[codes[2]] || 0) + 1;
        }
    });

    const allTypes = [...new Set([...Object.keys(typeMap.ambiguity), ...Object.keys(typeMap.love), ...Object.keys(typeMap.breakup)])].sort();

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

function renderTimeCorrelationChart(rawData) {
    // 評分區間：0-1, 1-2, 2-3, 3-4, 4-5
    const ranges = [
        { label: '0-1', min: 0, max: 1 },
        { label: '1-2', min: 1, max: 2 },
        { label: '2-3', min: 2, max: 3 },
        { label: '3-4', min: 3, max: 4 },
        { label: '4-5', min: 4, max: 5.1 }
    ];

    const groupData = { ambiguity: [[],[],[],[],[]], love: [[],[],[],[],[]], breakup: [[],[],[],[],[]] };

    rawData.forEach(row => {
        const sess = row.lpas_sessions;
        if (!sess || !sess.started_at || !sess.finished_at) return;
        
        const duration = (new Date(sess.finished_at) - new Date(sess.started_at)) / 1000; // 秒
        if (duration <= 0 || duration > 3600) return; // 排除異常值

        const fb = row.feedback_scores || {};
        ['ambiguity', 'love', 'breakup'].forEach(p => {
            const score = fb[p];
            if (score !== undefined) {
                const rIdx = ranges.findIndex(r => score >= r.min && score < r.max);
                if (rIdx !== -1) groupData[p][rIdx].push(duration);
            }
        });
    });

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
            plugins: { tooltip: { callbacks: { label: (ctx) => `${ctx.dataset.label}: ${ctx.raw} 秒` } } },
            scales: { y: { title: { display: true, text: '平均作答時間 (秒)' } } }
        }
    });
}

// 輔助函式
function getVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function avg(arr) {
    if (!arr || arr.length === 0) return 0;
    return (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
}
