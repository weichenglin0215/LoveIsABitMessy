/* ═══════════════════════════════════════════════════════
   lpas_v3_app.js — LPAS v3 答題應用程式
   完整沿用 V1 lpas_app.js 的結構、流程、動畫節奏，差異：
     - 70 題（60 主軸 + 10 性象限）
     - 4 個 period（多了「親密與身體」性象限）
     - 雙題庫 PART1 / PART2 隨機抽
     - 階段內題目隨機洗牌
     - 結果頁 4 階段星星評分（V1: 3 階段）
   ═══════════════════════════════════════════════════════ */

const V3_INSTRUCTIONS = [
    "每道題目都是關於你自己的描述，\n請根據同意程度來圈選。",
    "選擇的答案是你實際上的反應，\n而不是你理想中的自己。",
    "不要想太久，\n第一直覺往往最真實。"
];

const V3_TRANSITION_TEXTS = {
    1: "當你們剛開始互相吸引……",
    2: "當你沉醉愛戀時……",
    3: "回想那段戀情結束之後……",
    4: "關於親密與身體……"
};

const V3_PERIOD_LABELS = {
    1: "初期曖昧",
    2: "熱戀期",
    3: "失戀之後",
    4: "親密與身體"
};

const V3_FEEDBACK_STEPS = [
    { id: 1, title: '初期曖昧',    period: 1, key: 'ambiguity' },
    { id: 2, title: '熱戀期',      period: 2, key: 'love' },
    { id: 3, title: '失戀之後',    period: 3, key: 'breakup' },
    { id: 4, title: '親密與身體',  period: 4, key: 'intimacy' }
];

let app = {
    currentScreen: '',
    answers: [],
    questionQueue: [],
    currentQIndex: 0,
    currentInstructionIdx: 0,
    alias: '',
    ageRange: '',
    relationshipExp: '',
    sessionId: '',
    sessionStartedAt: '',
    isTransitioning: false,
    skipSexSection: false,
    currentFeedbackStep: 0,
    feedbackScores: {},
    radarChartInstance: null,
    testMode: false,  // 🧪 測試模式：略過雲端儲存與角色卡生成

    init() {
        if (typeof applyScale === 'function') applyScale();
        this.bindEvents();
        this.showScreen('screen-landing');
    },

    bindEvents() {
        document.querySelector('.submit-info-btn').addEventListener('click', () => {
            this.alias = document.getElementById('input-alias').value;
            this.ageRange = (document.querySelector('#group-age .radio-btn.selected') || {}).dataset?.val || '';
            this.relationshipExp = (document.querySelector('#group-exp .radio-btn.selected') || {}).dataset?.val || '';

            if (!this.alias || !this.ageRange || !this.relationshipExp) {
                alert('請填寫匿名代號，並選擇年齡區間與是否有過感情經驗。');
                return;
            }
            this.showScreen('screen-instructions');
            this.showInstruction();
        });

        document.querySelectorAll('.radio-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                let group = e.target.parentElement;
                group.querySelectorAll('.radio-btn').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
            });
        });

        document.getElementById('next-instruction-btn').addEventListener('click', () => {
            this.currentInstructionIdx++;
            if (this.currentInstructionIdx < V3_INSTRUCTIONS.length) {
                this.showInstruction();
            } else {
                this.startQuestions();
            }
        });

        document.getElementById('prev-question-btn').addEventListener('click', () => {
            if (this.currentQIndex > 0) {
                this.currentQIndex--;
                this.renderQuestion();
            }
        });

        const skipSexStageBtn = document.getElementById('skip-sex-stage-btn');
        if (skipSexStageBtn) skipSexStageBtn.addEventListener('click', () => this.skipEntireSexSection());

        const startSexBtn = document.getElementById('start-sex-stage-btn');
        if (startSexBtn) startSexBtn.addEventListener('click', () => this.proceedToSexQuestions());

        const skipQBtn = document.getElementById('skip-question-btn');
        if (skipQBtn) skipQBtn.addEventListener('click', () => this.skipCurrentQuestion());

        document.addEventListener('keydown', (e) => {
            if (this.currentScreen === 'screen-question' && e.key >= '1' && e.key <= '7') {
                this.recordAnswer(parseInt(e.key));
            }
        });
    },

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        this.currentScreen = screenId;
    },

    showInstruction() {
        const p = document.getElementById('instruction-text');
        p.style.opacity = 0;
        setTimeout(() => {
            p.innerText = V3_INSTRUCTIONS[this.currentInstructionIdx];
            p.style.opacity = 1;
        }, 300);
    },

    startQuestions() {
        this.questionQueue = [];
        for (let p = 1; p <= 3; p++) {
            const stageQs = window.lpasV3GetStageQuestions(p);
            this.questionQueue = this.questionQueue.concat(stageQs);
        }

        this.currentQIndex = 0;
        this.answers = [];
        this.sessionId = crypto?.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        this.sessionStartedAt = new Date().toISOString();

        const firstQ = this.questionQueue[0];
        if (firstQ) this.showTransition(firstQ.period);
        else { this.renderQuestion(); this.showScreen('screen-question'); }
    },

    renderQuestion() {
        const q = this.questionQueue[this.currentQIndex];
        document.getElementById('question-text').innerText = q.text;
        document.getElementById('progress-text').innerText = `${this.currentQIndex + 1}/${this.questionQueue.length}`;
        this.isTransitioning = false;

        document.getElementById('period-label').innerText = V3_PERIOD_LABELS[q.period];
        document.body.setAttribute('data-period', q.period);

        const skipBtn = document.getElementById('skip-question-btn');
        if (skipBtn) skipBtn.style.display = (q.period === 4) ? '' : 'none';

        const scaleContainer = document.getElementById('likert-scale');
        scaleContainer.innerHTML = '';
        this.currentQuestionShownAtMs = Date.now();
        for (let i = 1; i <= 7; i++) {
            const circle = document.createElement('div');
            circle.className = 'scale-circle';
            circle.dataset.val = i;

            const existingAns = this.answers.find(a => a.id === q.id);
            if (existingAns && existingAns.score == i) {
                circle.style.backgroundColor = i >= 6 ? "var(--c-scale-agree)" : (i <= 2 ? "var(--c-scale-disagree)" : "var(--c-scale-mid)");
            }

            circle.addEventListener('click', () => this.recordAnswer(i));
            scaleContainer.appendChild(circle);
        }
    },

    recordAnswer(score) {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        const q = this.questionQueue[this.currentQIndex];
        if (!q) return;
        const answeredAtMs = Date.now();
        const timeSpentMs = this.currentQuestionShownAtMs ? (answeredAtMs - this.currentQuestionShownAtMs) : null;

        const scaleContainer = document.getElementById('likert-scale');
        scaleContainer.querySelectorAll('.scale-circle').forEach(c => c.style.backgroundColor = 'var(--c-scale-empty)');
        const clicked = scaleContainer.querySelector(`[data-val="${score}"]`);
        if (clicked) clicked.style.backgroundColor = score >= 6 ? "var(--c-scale-agree)" : (score <= 2 ? "var(--c-scale-disagree)" : "var(--c-scale-mid)");

        const payload = {
            id: q.id, score, period: q.period, axis: q.axis, direction: q.direction,
            question_text: q.text, skipped: false,
            answered_at: new Date(answeredAtMs).toISOString(), time_spent_ms: timeSpentMs
        };
        const idx = this.answers.findIndex(a => a.id === q.id);
        if (idx >= 0) this.answers[idx] = payload; else this.answers.push(payload);

        setTimeout(() => this.advanceQuestion(q), 300);
    },

    skipCurrentQuestion() {
        if (this.isTransitioning) return;
        this.isTransitioning = true;

        const q = this.questionQueue[this.currentQIndex];
        if (!q) return;
        const payload = {
            id: q.id, score: null, period: q.period, axis: q.axis, direction: q.direction,
            question_text: q.text, skipped: true,
            answered_at: new Date().toISOString(), time_spent_ms: null
        };
        const idx = this.answers.findIndex(a => a.id === q.id);
        if (idx >= 0) this.answers[idx] = payload; else this.answers.push(payload);

        setTimeout(() => this.advanceQuestion(q), 200);
    },

    advanceQuestion(prevQ) {
        this.currentQIndex++;

        if (this.currentQIndex === 48) { this.askSexSection(); return; }

        if (this.currentQIndex < this.questionQueue.length) {
            const nextQ = this.questionQueue[this.currentQIndex];
            if (nextQ.period !== prevQ.period) this.showTransition(nextQ.period);
            else this.renderQuestion();
        } else {
            this.finishTest();
        }
    },

    askSexSection() {
        this.showScreen('screen-sex-consent');
        document.body.setAttribute('data-period', '4');
    },

    skipEntireSexSection() {
        this.skipSexSection = true;
        const sexQs = window.LPAS_QUESTIONS_V3_PART1.filter(q => q.period === 4);
        sexQs.forEach(q => {
            this.answers.push({
                id: q.id, score: null, period: q.period, axis: q.axis, direction: q.direction,
                question_text: q.text, skipped: true,
                answered_at: new Date().toISOString(), time_spent_ms: null
            });
        });
        this.finishTest();
    },

    proceedToSexQuestions() {
        const sexQs = window.lpasV3GetStageQuestions(4);
        this.questionQueue = this.questionQueue.concat(sexQs);
        this.showTransition(4);
    },

    showTransition(newPeriod) {
        this.showScreen('screen-transition');
        document.getElementById('transition-text').innerText = V3_TRANSITION_TEXTS[newPeriod] || '';
        document.body.setAttribute('data-period', newPeriod);
        setTimeout(() => {
            this.renderQuestion();
            this.showScreen('screen-question');
        }, 3000);
    },

    finishTest() {
        if (this.currentScreen === 'screen-calculating') return;
        this.showScreen('screen-calculating');

        setTimeout(() => {
            const result = window.calculateScoresV3(this.answers);
            this.lastResult = result;
            this.renderResult(result);
            this.showScreen('screen-result');
        }, 2000);
    },


    /* ═══════════════════════════════════════════
       結果頁 4 階段流程（沿用 V1 邏輯）
       ═══════════════════════════════════════════ */

    renderResult(resultData) {
        this.currentFeedbackStep = 0;
        this.feedbackScores = {};
        this.renderResultStep(resultData);
    },

    renderResultStep(resultData) {
        const step = V3_FEEDBACK_STEPS[this.currentFeedbackStep];

        // 性象限不可分析時，直接跳過 step 4
        if (step.period === 4) {
            if (!resultData.sex || !resultData.sex.displayable) {
                this.showFinalActions();
                return;
            }
        }

        document.body.setAttribute('data-period', step.period);

        // 容器背景色現在透過 .rv-box[data-period-idx] CSS 套用，
        // 由 renderPhaseStep / renderSexStep 內設定 data-period-idx 控制

        if (step.period === 4) {
            this.renderSexStep(resultData);
        } else {
            this.renderPhaseStep(resultData, step);
        }

        // 重設星星 + 同意按鈕
        document.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
        const confirmBtn = document.getElementById('confirm-feedback-btn');
        if (confirmBtn) {
            confirmBtn.style.opacity = '0';
            confirmBtn.style.pointerEvents = 'none';
            confirmBtn.disabled = true;
        }

        // 換期：把可捲動的 #result-desc 拉回頂端，並把外層 .rv-box / section 也保險拉回 0
        // 用 requestAnimationFrame 等 innerHTML 完成排版後再捲，否則瀏覽器可能保留上一頁殘留 scrollTop
        const resetScroll = () => {
            const desc = document.getElementById('result-desc');
            if (desc) desc.scrollTop = 0;
            const rvBox = document.getElementById('result-rv-box');
            if (rvBox) rvBox.scrollTop = 0;
            const screen = document.getElementById('screen-result');
            if (screen) screen.scrollTop = 0;
        };
        resetScroll();
        requestAnimationFrame(resetScroll);

        this.initStarRating(resultData);
    },

    renderPhaseStep(resultData, step) {
        const typeName = resultData.phase_types[step.period] || '未知型';
        const code     = resultData.phase_codes[step.period] || '';
        const desc     = resultData.phase_descs[step.period] || '暫無說明';
        const typeInfo = (window.TYPE_MAPPING_V3 || {})[code];
        const short    = typeInfo ? typeInfo.short : '';
        // 完整代碼含中文軸標：「A-F-O-H_主動-快-外放-佔有」
        const codeFull = typeInfo && typeInfo.code ? typeInfo.code : code;

        // RV 格式：rv-period-lbl 只顯示期別；rv-line-title 顯示「期別：類型」；rv-line-code 顯示完整代碼
        document.getElementById('result-period-title').innerText = step.title;
        document.getElementById('result-type-name').innerText    = `${step.title}：${typeName}`;
        document.getElementById('result-type-code').innerText    = codeFull;
        document.getElementById('result-type-short').innerText   = short;

        // 套用 RV 期別背景色（step.period 1/2/3 → data-period-idx 0/1/2，對應 .rv-box CSS）
        const rvBox = document.getElementById('result-rv-box');
        if (rvBox) rvBox.setAttribute('data-period-idx', step.period - 1);

        // ── 組合完整描述：主敘述 + 陷阱 + 配對 + 成長關鍵字 ──
        const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g,
            c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

        const traps    = (typeInfo && Array.isArray(typeInfo.traps))   ? typeInfo.traps   : [];
        const pairing  = (typeInfo && typeInfo.pairing)                ? typeInfo.pairing : null;
        const growth   = (typeInfo && typeInfo.growth_keyword)         ? typeInfo.growth_keyword : '';
        const roleplay = (typeInfo && typeInfo.roleplay && typeInfo.roleplay.desc) ? typeInfo.roleplay.desc : '';

        // 雷達圖放在 rv-desc 最上方，會跟著評量文字一起捲動（不再固定佔位）
        let html = `<div class="result-radar"><canvas id="radarChart"></canvas></div>`;
        html += `<div class="phase-main-desc">${escapeHtml(desc)}</div>`;

        if (roleplay) {
            html += `<div class="phase-section">
                <div class="phase-section-title">🎭 角色扮演指引</div>
                <div class="phase-growth-text" style="font-style:normal;color:var(--c-text-main);">${escapeHtml(roleplay)}</div>
            </div>`;
        }

        if (traps.length > 0) {
            html += `<div class="phase-section">
                <div class="phase-section-title">⚠ 容易陷入的陷阱</div>
                <ul class="phase-trap-list">${
                    traps.map(t => `<li>${escapeHtml(t)}</li>`).join('')
                }</ul>
            </div>`;
        }

        if (pairing) {
            const fmt = (arr) => (arr && arr.length) ? arr.join('、') : '—';
            html += `<div class="phase-section">
                <div class="phase-section-title">💞 配對提示</div>
                <div class="phase-pair-row"><span class="phase-pair-label good">🟢 最合拍</span><span class="phase-pair-val">${escapeHtml(fmt(pairing.best))}</span></div>
                <div class="phase-pair-row"><span class="phase-pair-label balance">🟡 互補對象</span><span class="phase-pair-val">${escapeHtml(fmt(pairing.complement))}</span></div>
                <div class="phase-pair-row"><span class="phase-pair-label danger">🔴 危險組合</span><span class="phase-pair-val">${escapeHtml(fmt(pairing.danger))}</span></div>
            </div>`;
        }

        if (growth) {
            html += `<div class="phase-section phase-growth">
                <div class="phase-section-title">🌱 給妳的成長關鍵字</div>
                <div class="phase-growth-text">${escapeHtml(growth)}</div>
            </div>`;
        }

        document.getElementById('result-desc').innerHTML = html;

        // 雷達 canvas 是剛由 innerHTML 重建的，需重新抓取繪製
        this.updateRadarChart(resultData, this.currentFeedbackStep);
    },

    renderSexStep(resultData) {
        const sex = resultData.sex;
        // RV 格式：性象限期 rv-period-lbl 顯示「親密與身體」；rv-line-title 顯示「親密與身體：標籤」
        document.getElementById('result-period-title').innerText = '親密與身體';
        document.getElementById('result-type-name').innerText =
            sex && sex.label ? `親密與身體：${sex.label}` : '親密與身體';
        document.getElementById('result-type-code').innerText = '';
        document.getElementById('result-type-short').innerText =
            sex && sex.label && (window.SEX_QUADRANTS_V3 || {})[sex.label]
                ? (window.SEX_QUADRANTS_V3 || {})[sex.label].tagline || ''
                : '';

        // 套用 RV 性象限背景色
        const rvBox = document.getElementById('result-rv-box');
        if (rvBox) rvBox.setAttribute('data-period-idx', 3);

        // 性象限步驟不畫雷達；雷達放在 rv-desc 內，這裡不渲染就不會出現

        const escapeHtml = (s) => String(s || '').replace(/[&<>"']/g,
            c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

        const sexInfo = (window.SEX_QUADRANTS_V3 || {})[sex.label];
        if (!sexInfo) {
            document.getElementById('result-desc').innerText = sex.reason || '';
            return;
        }

        const traps    = Array.isArray(sexInfo.traps) ? sexInfo.traps : [];
        const pairing  = sexInfo.pairing || null;
        const growth   = sexInfo.growth_keyword || '';
        const roleplay = sexInfo.roleplay && sexInfo.roleplay.desc ? sexInfo.roleplay.desc : '';

        let html = `<div class="phase-main-desc">${escapeHtml(sexInfo.desc || '')}</div>`;

        if (roleplay) {
            html += `<div class="phase-section">
                <div class="phase-section-title">🎭 角色扮演指引</div>
                <div class="phase-growth-text" style="font-style:normal;color:var(--c-text-main);">${escapeHtml(roleplay)}</div>
            </div>`;
        }

        if (traps.length > 0) {
            html += `<div class="phase-section">
                <div class="phase-section-title">⚠ 容易陷入的陷阱</div>
                <ul class="phase-trap-list">${
                    traps.map(t => `<li>${escapeHtml(t)}</li>`).join('')
                }</ul>
            </div>`;
        }

        if (pairing) {
            const fmt = (arr) => (arr && arr.length) ? arr.join('、') : '—';
            html += `<div class="phase-section">
                <div class="phase-section-title">💞 配對提示</div>
                <div class="phase-pair-row"><span class="phase-pair-label good">🟢 最合拍</span><span class="phase-pair-val">${escapeHtml(fmt(pairing.best))}</span></div>
                <div class="phase-pair-row"><span class="phase-pair-label balance">🟡 互補對象</span><span class="phase-pair-val">${escapeHtml(fmt(pairing.complement))}</span></div>
                <div class="phase-pair-row"><span class="phase-pair-label danger">🔴 危險組合</span><span class="phase-pair-val">${escapeHtml(fmt(pairing.danger))}</span></div>
            </div>`;
        }

        if (growth) {
            html += `<div class="phase-section phase-growth">
                <div class="phase-section-title">🌱 給你的成長關鍵字</div>
                <div class="phase-growth-text">${escapeHtml(growth)}</div>
            </div>`;
        }

        document.getElementById('result-desc').innerHTML = html;
    },

    updateRadarChart(resultData, activeIndex) {
        if (activeIndex >= 3) return; // 性象限不顯示雷達

        const ctx = document.getElementById('radarChart').getContext('2d');
        if (this.radarChartInstance) this.radarChartInstance.destroy();

        const datasets = JSON.parse(JSON.stringify(resultData.radar_data.datasets));
        datasets.forEach((ds, i) => {
            if (i === activeIndex) {
                ds.borderColor = '#FFFFFFFF';
                ds.backgroundColor = 'hsla(0,0%,100%,0.3)';
                ds.borderWidth = 2;
                ds.pointRadius = 5;
            } else {
                ds.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                ds.borderColor = 'rgba(255, 255, 255, 0.1)';
                ds.borderWidth = 1;
                ds.pointRadius = 0;
            }
        });

        if (activeIndex >= 0 && activeIndex < datasets.length) {
            const activeDs = datasets.splice(activeIndex, 1)[0];
            datasets.push(activeDs);
        }

        this.radarChartInstance = new Chart(ctx, {
            type: 'radar',
            data: { labels: resultData.radar_data.labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255, 255, 255, 0.2)' },
                        grid: { color: 'rgba(255, 255, 255, 0.2)' },
                        pointLabels: { color: '#E8E0F5', font: { size: 20 } },
                        min: 1, max: 7,
                        ticks: { display: false, stepSize: 1 }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    },

    initStarRating(resultData) {
        const stars = document.querySelectorAll('.star');
        const confirmBtn = document.getElementById('confirm-feedback-btn');
        let currentScore = 0;

        if (confirmBtn) {
            const newConfirmBtn = confirmBtn.cloneNode(true);
            confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);
            newConfirmBtn.addEventListener('click', () => {
                if (currentScore > 0) this.handleFeedback(currentScore, resultData);
            });
        }

        stars.forEach(star => {
            const newStar = star.cloneNode(true);
            star.parentNode.replaceChild(newStar, star);

            newStar.addEventListener('mouseover', (e) => {
                const val = parseInt(e.target.dataset.val);
                this.highlightStars(val);
            });
            newStar.addEventListener('mouseout', () => this.highlightStars(currentScore));
            newStar.addEventListener('click', (e) => {
                currentScore = parseInt(e.target.dataset.val);
                this.highlightStars(currentScore);
                const activeConfirmBtn = document.getElementById('confirm-feedback-btn');
                if (activeConfirmBtn) {
                    activeConfirmBtn.style.opacity = '1';
                    activeConfirmBtn.style.pointerEvents = 'auto';
                    activeConfirmBtn.disabled = false;
                }
            });
        });
    },

    highlightStars(val) {
        document.querySelectorAll('.star').forEach(s => {
            s.classList.toggle('active', parseInt(s.dataset.val) <= val);
        });
    },

    handleFeedback(score, resultData) {
        const step = V3_FEEDBACK_STEPS[this.currentFeedbackStep];
        this.feedbackScores[step.key] = score;

        const isLastStep = this.currentFeedbackStep === 3
            || (this.currentFeedbackStep === 2 && (!resultData.sex || !resultData.sex.displayable));

        if (!isLastStep) {
            this.currentFeedbackStep++;
            this.showResultTransition(resultData);
        } else {
            this.showFinalActions();
        }
    },

    showResultTransition(resultData) {
        const nextStep = V3_FEEDBACK_STEPS[this.currentFeedbackStep];
        this.showScreen('screen-transition');
        document.getElementById('transition-text').innerText = V3_TRANSITION_TEXTS[nextStep.period] || '';
        document.body.setAttribute('data-period', nextStep.period);
        setTimeout(() => {
            this.renderResultStep(resultData);
            this.showScreen('screen-result');
        }, 2500);
    },

    showFinalActions() {
        // 🧪 測試模式：略過角色卡生成與雲端儲存，直接渲染最終分享頁
        if (this.testMode) {
            // 若使用者沒選星，填預設分數避免最終頁星星空白
            ['ambiguity', 'love', 'breakup', 'intimacy'].forEach(k => {
                if (!this.feedbackScores[k]) this.feedbackScores[k] = 3 + Math.floor(Math.random() * 3);
            });
            this.showScreen('screen-transition');
            document.getElementById('transition-text').innerText = '即將呈現完整的你……（測試）';
            document.body.setAttribute('data-period', 'night');
            setTimeout(() => {
                this.renderFinalShare(this.lastResult);
                this.showScreen('screen-final-share');
                const status = document.getElementById('fs-cloud-status');
                if (status) status.textContent = '🧪 測試模式（未上傳雲端）';
            }, 1500);
            console.log('[LPAS v3 Test Result]', this.lastResult, this.feedbackScores);
            return;
        }

        // 1. 生成角色卡 + 雲端儲存
        const profile = window.generateV3Profile(
            this.alias, this.ageRange, this.relationshipExp,
            this.lastResult, this.feedbackScores
        );
        const recordJson = window.generateV3RecordJson(
            this.alias, this.ageRange, this.relationshipExp,
            this.sessionId, this.sessionStartedAt,
            this.answers, this.lastResult, this.feedbackScores
        );
        this.lastProfile = profile;
        this.lastRecord = recordJson;

        // 2. 雲端儲存（在背景進行）
        this.saveToCloud(profile, recordJson, this.lastResult);

        // 3. 過場 → 進入最終分享頁
        this.showScreen('screen-transition');
        document.getElementById('transition-text').innerText = '即將呈現完整的你……';
        document.body.setAttribute('data-period', 'night');

        setTimeout(() => {
            this.renderFinalShare(this.lastResult);
            this.showScreen('screen-final-share');
        }, 2500);

        // Console（給開發者檢查）
        console.log('[LPAS v3 Result]',   this.lastResult);
        console.log('[LPAS v3 Profile]',  profile);
        console.log('[LPAS v3 Record]',   recordJson);
        console.log('[LPAS v3 Feedback]', this.feedbackScores);
        console.log('[LPAS v3 Answers]',  this.answers);
    },

    /* ═══════════════════════════════════════════
       最終分享頁渲染
       ═══════════════════════════════════════════ */
    renderFinalShare(resultData) {
        // 進入最終分享頁時，把可捲動的容器拉回頂端，給「換頁」感
        const resetShareScroll = () => {
            const fsBox = document.querySelector('#screen-final-share .result-container');
            if (fsBox) fsBox.scrollTop = 0;
            const screen = document.getElementById('screen-final-share');
            if (screen) screen.scrollTop = 0;
        };
        resetShareScroll();
        requestAnimationFrame(resetShareScroll);

        // 三聯主標題
        const tripleText = `${resultData.phase_types[1]} — ${resultData.phase_types[2]} — ${resultData.phase_types[3]}`;
        document.getElementById('fs-triple-text').innerText = tripleText;
        document.getElementById('fs-alias').innerText = this.alias ? `— ${this.alias} —` : '';

        // 雷達圖（三色疊圖）
        this.renderShareRadar(resultData);

        // 三章節迷你卡
        this.renderShareChapters(resultData);

        // 性象限
        this.renderShareSex(resultData);

        // 再做一次按鈕
        const restartBtn = document.getElementById('fs-restart-btn');
        if (restartBtn) {
            restartBtn.onclick = () => location.reload();
        }
    },

    renderShareRadar(resultData) {
        const canvas = document.getElementById('fs-radar-canvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (this.shareRadarInstance) this.shareRadarInstance.destroy();

        const datasets = JSON.parse(JSON.stringify(resultData.radar_data.datasets));
        datasets.forEach(ds => {
            ds.borderWidth = 2;
            ds.pointRadius = 3;
        });

        this.shareRadarInstance = new Chart(ctx, {
            type: 'radar',
            data: { labels: resultData.radar_data.labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255,255,255,0.2)' },
                        grid:       { color: 'rgba(255,255,255,0.2)' },
                        pointLabels:{ color: '#E8E0F5', font: { size: 14 } },
                        min: 1, max: 7,
                        ticks: { display: false, stepSize: 1 }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: { color: '#E8E0F5', font: { size: 11 }, boxWidth: 12 },
                        position: 'bottom'
                    }
                }
            }
        });
    },

    renderShareChapters(resultData) {
        const container = document.getElementById('fs-chapters');
        if (!container) return;
        container.innerHTML = '';

        const periodNames = { 1: '曖昧期', 2: '熱戀期', 3: '失戀期' };
        const feedbackKeys = { 1: 'ambiguity', 2: 'love', 3: 'breakup' };
        const types = window.TYPE_MAPPING_V3 || {};

        for (let p = 1; p <= 3; p++) {
            const code = resultData.phase_codes[p];
            const typeInfo = types[code];
            const typeName = resultData.phase_types[p] || '—';
            const short = typeInfo ? typeInfo.short : '';
            // 完整代碼含中文軸標：「A-F-O-H_主動-快速-外放-佔有」
            const codeFull = typeInfo && typeInfo.code ? typeInfo.code : code;
            const fbScore = this.feedbackScores[feedbackKeys[p]] || 0;
            const stars = '★'.repeat(fbScore) + '☆'.repeat(5 - fbScore);

            const div = document.createElement('div');
            div.className = 'fs-chapter';
            div.setAttribute('data-p', p);
            div.innerHTML = `
                <div class="fs-ch-row1">
                    <span class="fs-ch-period">${periodNames[p]}</span>
                    <span class="fs-ch-stars">${stars}</span>
                </div>
                <div class="fs-ch-typename">${typeName}</div>
                <div class="fs-ch-code">${codeFull}</div>
                <div class="fs-ch-slogan">${short ? '「' + short + '」' : ''}</div>
            `;
            container.appendChild(div);
        }
    },

    renderShareSex(resultData) {
        const container = document.getElementById('fs-sex-container');
        if (!container) return;
        container.innerHTML = '';
        const sex = resultData.sex;
        if (!sex || !sex.displayable) return;  // 沒填或跳過就不顯示

        const sexInfo = (window.SEX_QUADRANTS_V3 || {})[sex.label];
        const tagline = sexInfo ? sexInfo.tagline : '';
        const fbScore = this.feedbackScores['intimacy'] || 0;
        const stars = '★'.repeat(fbScore) + '☆'.repeat(5 - fbScore);

        this.sexEyeOpen = true;
        container.innerHTML = `
            <div class="fs-sex" id="fs-sex-card">
                <div class="fs-sex-text">
                    <div class="fs-sex-title">親密與身體　${stars}</div>
                    <div class="fs-sex-label">${sex.label}</div>
                    <div class="fs-sex-tagline">${tagline}</div>
                </div>
                <button class="fs-eye-btn" id="fs-eye-btn" aria-label="切換顯示">👁</button>
            </div>
        `;

        const eyeBtn = document.getElementById('fs-eye-btn');
        const card = document.getElementById('fs-sex-card');
        if (eyeBtn && card) {
            eyeBtn.addEventListener('click', () => {
                this.sexEyeOpen = !this.sexEyeOpen;
                card.classList.toggle('eye-closed', !this.sexEyeOpen);
                eyeBtn.textContent = this.sexEyeOpen ? '👁' : '🙈';
            });
        }
    },

    /* ═══════════════════════════════════════════
       下載按鈕（角色卡 JSON、測驗紀錄、Markdown）
       ═══════════════════════════════════════════ */
    bindDownloadButtons(profile, recordJson) {
        const downloadFile = (filename, content, mime) => {
            const blob = new Blob([content], { type: mime });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        };

        const btnJson = document.getElementById('btn-download-json');
        if (btnJson) {
            btnJson.onclick = () => downloadFile(
                `lpas_v3_${profile.id}.json`,
                JSON.stringify(profile, null, 2),
                'application/json'
            );
        }

        const btnRecord = document.getElementById('btn-download-record');
        if (btnRecord) {
            btnRecord.onclick = () => downloadFile(
                `lpas_v3_record_${profile.id}.json`,
                JSON.stringify(recordJson, null, 2),
                'application/json'
            );
        }

        const btnMd = document.getElementById('btn-download-md');
        if (btnMd) {
            btnMd.onclick = async () => {
                try {
                    await navigator.clipboard.writeText(profile.markdown_summary);
                    const orig = btnMd.textContent;
                    btnMd.textContent = '✓ 已複製';
                    setTimeout(() => btnMd.textContent = orig, 1600);
                } catch (e) {
                    downloadFile(
                        `lpas_v3_${profile.id}.md`,
                        profile.markdown_summary,
                        'text/markdown'
                    );
                }
            };
        }
    },

    /* ═══════════════════════════════════════════
       雲端儲存（Supabase）
       ═══════════════════════════════════════════ */
    async saveToCloud(profileObj, recordObj, resultData) {
        // 同步狀態同時更新到「結果頁」與「最終分享頁」兩個位置
        const setStatus = (text) => {
            const a = document.getElementById('cloud-save-status');
            const b = document.getElementById('fs-cloud-status');
            if (a) a.textContent = text;
            if (b) b.textContent = text;
        };

        if (!window.SupabaseClient || !window.SupabaseClient.init || !window.SupabaseClient.init()) {
            console.warn('[Cloud v3] Supabase 未初始化');
            setStatus('⚠️ Supabase 未設定，僅本機儲存');
            return;
        }
        const sb = window.SupabaseClient.getClient();
        if (!sb) {
            setStatus('⚠️ 無法取得 Supabase client');
            return;
        }
        setStatus('☁️ 正在同步…');

        function friendlyError(msg) {
            if (msg && msg.includes('schema cache')) {
                return '請先在 Supabase 執行 schema.sql 與 schema_add.sql / schema_v2_lpas.sql';
            }
            return msg;
        }

        try {
            // 1. characters 表
            const charPayload = {
                id: profileObj.id,
                name: profileObj.name,
                card_json: profileObj,
                source: 'lpas_v3',
                is_active: true,
                lpas_record_json: recordObj
            };
            const { error: charErr } = await sb.from('characters').upsert(charPayload, { onConflict: 'id' });
            if (charErr) throw new Error(friendlyError(charErr.message));
            console.log('[Cloud v3] characters upserted:', profileObj.id);

            // 2. lpas_sessions 表
            const sessionPayload = {
                session_id: this.sessionId,
                alias: this.alias || null,
                age_range: this.ageRange,
                relationship_experience: this.relationshipExp,
                schema_version: 3,
                started_at: this.sessionStartedAt,
                finished_at: recordObj.meta.finished_at
            };
            const { data: sessionData, error: sessErr } = await sb
                .from('lpas_sessions').insert(sessionPayload).select('id').single();
            if (sessErr) throw new Error(friendlyError(sessErr.message));
            const dbSessionId = sessionData.id;
            console.log('[Cloud v3] lpas_sessions inserted, DB id:', dbSessionId);

            // 3. lpas_answers 表（含 axis、skipped）
            const answersPayload = this.answers.map(a => ({
                lpas_session_id: dbSessionId,
                question_id:  a.id,
                score:        a.skipped ? null : a.score,
                period:       a.period,
                axis:         a.axis,
                direction:    a.direction,
                skipped:      !!a.skipped,
                question_text: a.question_text,
                answered_at:   a.answered_at || null,
                time_spent_ms: a.time_spent_ms || null
            }));
            const { error: ansErr } = await sb.from('lpas_answers').insert(answersPayload);
            if (ansErr) throw new Error(friendlyError(ansErr.message));
            console.log('[Cloud v3] lpas_answers inserted:', answersPayload.length);

            // 4. lpas_results 表
            const tripleCode = `${resultData.phase_codes[1]}_${resultData.phase_codes[2]}_${resultData.phase_codes[3]}`;
            const tripleName = `${resultData.phase_types[1]}・${resultData.phase_types[2]}・${resultData.phase_types[3]}`;
            const resultPayload = {
                lpas_session_id: dbSessionId,
                type_code:       tripleCode,
                type_name:       tripleName,
                type_desc:       recordObj.markdown_summary || '',
                averages:        resultData.axis_scores,
                radar_data:      resultData.radar_data,
                character_card:  profileObj,
                engine_version:  'v3',
                triple_code:     tripleCode,
                axis_scores:     resultData.axis_scores,
                sex_label:       resultData.sex && resultData.sex.displayable ? resultData.sex.label : null
            };
            const { error: resErr } = await sb.from('lpas_results').insert(resultPayload);
            if (resErr) throw new Error(friendlyError(resErr.message));
            console.log('[Cloud v3] lpas_results inserted');

            setStatus('✅ 已同步到雲端');
        } catch (err) {
            console.error('[Cloud v3] 同步失敗:', err);
            setStatus('❌ 同步失敗：' + err.message);
        }
    },

    /* ═══════════════════════════════════════════
       🧪 測試模式：用隨機資料展示結果頁面
       點漢堡選單「顯示結果頁面(測試用)」呼叫；
       依序：曖昧期 → 熱戀期 → 失戀期 → 親密與身體 → 最終分享頁
       使用者用既有星星評分 + 同意按鈕推進，與正式流程相同
       ═══════════════════════════════════════════ */
    startResultPagesTest() {
        this.testMode = true;
        this.currentFeedbackStep = 0;
        this.feedbackScores = {};
        this.alias = '測試者' + Math.floor(Math.random() * 1000);
        this.ageRange = '23-27';
        this.relationshipExp = 'yes';
        this.sessionId = 'test_' + Date.now();
        this.sessionStartedAt = new Date().toISOString();

        const result = this.generateRandomResult();
        this.lastResult = result;

        this.renderResult(result);
        this.showScreen('screen-result');
    },

    /* 產生符合 calculateScoresV3 回傳格式的隨機 resultData */
    generateRandomResult() {
        const codes = [
            'A-F-O-H', 'A-F-O-L', 'A-F-I-H', 'A-F-I-L',
            'A-S-O-H', 'A-S-O-L', 'A-S-I-H', 'A-S-I-L',
            'P-F-O-H', 'P-F-O-L', 'P-F-I-H', 'P-F-I-L',
            'P-S-O-H', 'P-S-O-L', 'P-S-I-H', 'P-S-I-L'
        ];
        const sexLabels = ['深情專一型', '鍾情博愛型', '靈肉分離型', '遊戲人間型'];
        const pick = arr => arr[Math.floor(Math.random() * arr.length)];
        const rand = (min, max) => min + Math.random() * (max - min);

        // 雷達圖各期顏色（沿用 calculateScoresV3 內 PERIOD_COLORS 風格）
        const PERIOD_NAMES = { 1: '曖昧期', 2: '熱戀期', 3: '失戀期' };
        const PERIOD_COLORS = {
            1: { fill: 'hsla(298,50%,55%,0.25)', border: 'hsl(298,50%,55%)' },
            2: { fill: 'hsla(10,40%,65%,0.25)',  border: 'hsl(10,40%,65%)'  },
            3: { fill: 'hsla(220,40%,60%,0.25)', border: 'hsl(220,40%,60%)' }
        };
        const types = window.TYPE_MAPPING_V3 || {};
        const phaseKeys = ['ambiguity', 'love', 'breakup'];

        const result = {
            engine_version: 'v3',
            phase_codes: {},
            phase_types: {},
            phase_descs: {},
            axis_scores: {},
            sex: null,
            radar_data: { labels: ['主動', '快速', '外放', '佔有'], datasets: [] }
        };

        for (let p = 1; p <= 3; p++) {
            const code = pick(codes);
            const info = types[code];
            result.phase_codes[p] = code;
            result.phase_types[p] = info ? info.name : '未知型';
            result.phase_descs[p] = info ? ((info[phaseKeys[p - 1]] || {}).desc || '') : '';

            // 四軸隨機分數，落在 2~6.5 之間，雷達圖才不會塌成一點
            const data = [rand(2, 6.5), rand(2, 6.5), rand(2, 6.5), rand(2, 6.5)];
            result.axis_scores[`phase_${p}`] = {
                initiative: data[0], pace: data[1], expression: data[2], possess: data[3], code: code
            };
            result.radar_data.datasets.push({
                label: PERIOD_NAMES[p],
                data: data,
                backgroundColor: PERIOD_COLORS[p].fill,
                borderColor: PERIOD_COLORS[p].border,
                pointBackgroundColor: PERIOD_COLORS[p].border,
                fill: true
            });
        }

        // 性象限：隨機 displayable=true，確保第四步會顯示
        result.sex = {
            emotion: rand(2, 6),
            openness: rand(2, 6),
            label: pick(sexLabels),
            displayable: true
        };

        result.typeCode = `${result.phase_codes[1]}_${result.phase_codes[2]}_${result.phase_codes[3]}`;
        result.typeName = `${result.phase_types[1]}・${result.phase_types[2]}・${result.phase_types[3]}`;
        return result;
    }
};

window.onload = () => app.init();
