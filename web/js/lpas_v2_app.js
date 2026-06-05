/* ═══════════════════════════════════════════════════════
   lpas_v2_app.js — LPAS v2 答題應用程式

   結構沿用 lpas_app.js (v1) 的設計理念：
     - 多個 screen 切換（landing → basic-info → instructions → transition
       → question → calculating → result → final-share）
     - 7 點圓圈量表
     - 階段切換時用 body[data-period] 切換背景色
     - 換場螢幕 (showTransition) 詩意過場
     - 結果頁多階段星星評分（v1: 3 階段 → v2: 4 階段含性象限）

   v2 與 v1 差異：
     - 55 題（v1: 60 題）
     - 4 個 period（多了「親密與身體」性象限）
     - 雙題庫 PART1/PART2 隨機抽
     - 階段內題目隨機洗牌
     - 性象限可整段跳過或單題跳過
     - 結果頁有 4 個 sub-page，每個 sub-page 各有評分
     - 最後有可截圖分享的 final-share 頁
   ═══════════════════════════════════════════════════════ */

const v2Instructions = [
    "每道題目都是關於你自己的描述，\n請根據同意程度來圈選。",
    "選擇的答案是你實際上的反應，\n而不是你理想中的自己。",
    "不要想太久，\n第一直覺往往最真實。"
];

const v2ResultSteps = [
    { id: 1, title: '初期曖昧',    period: 1, key: 'ambiguity' },
    { id: 2, title: '熱戀期',      period: 2, key: 'love' },
    { id: 3, title: '失戀之後',    period: 3, key: 'breakup' },
    { id: 4, title: '親密與身體',  period: 4, key: 'intimacy' }
];

const v2TransitionTexts = {
    1: "當你們剛開始互相吸引……",
    2: "當你沉醉愛戀時……",
    3: "回想那段戀情結束之後……",
    4: "關於親密與身體……"
};

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
    currentResultStep: 0,       // 0..3 = 曖昧/熱戀/失戀/性象限
    feedbackScores: {},          // { ambiguity: 4, love: 5, ... }
    radarChartInstance: null,
    shareRadarInstance: null,
    sexEyeOpen: true,            // 性象限是否可見

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
            if (this.currentInstructionIdx < v2Instructions.length) {
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

        // 最終分享頁
        const restartBtn = document.getElementById('btn-restart');
        if (restartBtn) restartBtn.addEventListener('click', () => location.reload());

        const screenshotHintBtn = document.getElementById('btn-screenshot-hint');
        if (screenshotHintBtn) screenshotHintBtn.addEventListener('click', () => {
            alert('請以手機螢幕截圖功能（音量鍵 + 電源鍵）擷取此頁面分享到 IG / LINE。');
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
            p.innerText = v2Instructions[this.currentInstructionIdx];
            p.style.opacity = 1;
        }, 300);
    },

    startQuestions() {
        this.questionQueue = [];
        for (let p = 1; p <= 3; p++) {
            const stageQs = window.lpasGetStageQuestions(p);
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

        const periodLabels = {
            1: "初期曖昧",
            2: "熱戀期",
            3: "失戀之後",
            4: "親密與身體"
        };
        document.getElementById('period-label').innerText = periodLabels[q.period];
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

        if (this.currentQIndex === 45) { this.askSexSection(); return; }

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
        const sexQs = window.LPAS_QUESTIONS_PART1.filter(q => q.period === 4);
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
        const sexQs = window.lpasGetStageQuestions(4);
        this.questionQueue = this.questionQueue.concat(sexQs);
        this.showTransition(4);
    },

    showTransition(newPeriod) {
        this.showScreen('screen-transition');
        document.getElementById('transition-text').innerText = v2TransitionTexts[newPeriod] || '';
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
            const result = window.calculateScoresV2(this.answers);
            this.lastResult = result;
            this.startResultFlow(result);
        }, 1800);
    },

    /* ═══════════════════════════════════════════
       結果頁 4 階段流程
       ═══════════════════════════════════════════ */

    startResultFlow(resultData) {
        this.currentResultStep = 0;
        this.feedbackScores = {};
        this.buildPeriodDots();
        this.renderResultStep(resultData);
        this.showScreen('screen-result');
    },

    buildPeriodDots() {
        const header = document.getElementById('result-period-header');
        header.innerHTML = '';
        for (let i = 0; i < 4; i++) {
            const dot = document.createElement('span');
            dot.className = 'period-dot' + (i === this.currentResultStep ? ' active' : '');
            header.appendChild(dot);
        }
    },

    updatePeriodDots() {
        const dots = document.querySelectorAll('#result-period-header .period-dot');
        dots.forEach((d, i) => d.classList.toggle('active', i === this.currentResultStep));
    },

    renderResultStep(resultData) {
        const step = v2ResultSteps[this.currentResultStep];
        document.body.setAttribute('data-period', step.period);

        const container = document.querySelector('#screen-result .result-container');
        const periodColor = getComputedStyle(document.documentElement).getPropertyValue(`--c-period-${step.period}`).trim();
        if (container) {
            container.style.backgroundColor = periodColor;
            container.style.transition = 'background-color 0.8s ease';
        }

        this.updatePeriodDots();

        // Step 0/1/2 = 三主階段（曖昧/熱戀/失戀）
        // Step 3 = 性象限
        if (step.period === 4) {
            this.renderSexStep(resultData);
        } else {
            this.renderPeriodStep(resultData, step);
        }

        // 重設星星 + 同意按鈕
        document.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
        const confirmBtn = document.getElementById('confirm-feedback-btn');
        if (confirmBtn) {
            confirmBtn.style.opacity = '0';
            confirmBtn.style.pointerEvents = 'none';
            confirmBtn.disabled = true;
        }

        const descWrapper = document.querySelector('#screen-result .result-description-wrapper');
        if (descWrapper) descWrapper.scrollTop = 0;

        this.initStarRating(resultData);
    },

    // 三主階段（曖昧/熱戀/失戀）渲染
    renderPeriodStep(resultData, step) {
        const typeName = resultData.phase_types[step.period] || '未知型';
        const card = (window.TYPE_MAPPING_V2_PUBLIC || {})[typeName];

        document.getElementById('result-period-title').innerText = `${step.title}：${typeName}`;
        document.getElementById('result-type-short').innerText = card ? card.code : '';
        document.getElementById('v2-chapter-slogan').innerText = card ? `「${card.slogan}」` : '';

        // 描述：使用 phase_views 對應期間
        const periodNameMap = { 1: '曖昧期', 2: '熱戀期', 3: '失戀期' };
        const phaseDesc = card && card.phase_views ? (card.phase_views[periodNameMap[step.period]] || '') : '';
        document.getElementById('result-desc').innerText = phaseDesc;

        // 確保雷達 canvas 顯示
        document.getElementById('v2-radar-wrapper').style.display = '';
        this.updateRadarChart(resultData, this.currentResultStep);
    },

    // 第 4 階段（性象限）渲染
    renderSexStep(resultData) {
        const sex = resultData.sex || {};
        document.getElementById('result-period-title').innerText = '親密與身體';
        document.getElementById('result-type-short').innerText = '';
        document.getElementById('v2-chapter-slogan').innerText = '';

        // 隱藏雷達（性象限不適用三軸雷達）
        document.getElementById('v2-radar-wrapper').style.display = 'none';

        const desc = document.getElementById('result-desc');

        if (!sex.displayable) {
            desc.innerHTML = `
                <div class="sex-quadrant-display">
                    <div class="quad-skipped">
                        ${sex.reason || '您跳過了較多性議題，本次不進行性象限分析'}<br><br>
                        請繼續完成這一步，<br>
                        我們將為你產生最終結果。
                    </div>
                </div>
            `;
            return;
        }

        const label = sex.label || '未知';
        const taglines = {
            "深情專一型": "「沒有愛，我給不出身體」",
            "深情多元型": "「我能愛很多人，但都是真心」",
            "探索人性型": "「性是性，愛是愛，但我只玩一個」",
            "自由遊戲型": "「性不需要承諾，愛也不需要獨佔」"
        };

        this.sexEyeOpen = true;
        desc.innerHTML = `
            <div class="sex-quadrant-display" id="sex-quadrant-display">
                <div class="quad-label">你的性象限</div>
                <div class="quad-name">${label}</div>
                <div class="quad-tagline">${taglines[label] || ''}</div>
                <div class="quad-eye-row">
                    <span>分享時可隱藏</span>
                    <button class="quad-eye-btn" id="sex-eye-btn">👁</button>
                </div>
            </div>
        `;

        const eyeBtn = document.getElementById('sex-eye-btn');
        if (eyeBtn) {
            eyeBtn.addEventListener('click', () => {
                this.sexEyeOpen = !this.sexEyeOpen;
                const display = document.getElementById('sex-quadrant-display');
                if (display) display.classList.toggle('eye-closed', !this.sexEyeOpen);
                eyeBtn.textContent = this.sexEyeOpen ? '👁' : '🙈';
            });
        }
    },

    updateRadarChart(resultData, activeIndex) {
        // activeIndex 在 v2 是 0..3，但 radar 只有 3 個 dataset (1..3)
        // step 3 (性象限) 不調用此函式
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
        const step = v2ResultSteps[this.currentResultStep];
        this.feedbackScores[step.key] = score;

        if (this.currentResultStep < 3) {
            this.currentResultStep++;
            this.showResultTransition(resultData);
        } else {
            // 完成全部 4 階段 → 進入最終分享頁
            this.showFinalShare(resultData);
        }
    },

    showResultTransition(resultData) {
        const nextStep = v2ResultSteps[this.currentResultStep];
        this.showScreen('screen-transition');
        document.getElementById('transition-text').innerText = v2TransitionTexts[nextStep.period] || '';
        document.body.setAttribute('data-period', nextStep.period);

        setTimeout(() => {
            this.renderResultStep(resultData);
            this.showScreen('screen-result');
        }, 2500);
    },

    /* ═══════════════════════════════════════════
       最終分享頁
       ═══════════════════════════════════════════ */

    showFinalShare(resultData) {
        // 過場一次再進入最終頁
        this.showScreen('screen-transition');
        document.getElementById('transition-text').innerText = '即將呈現完整的你……';
        // 用混色（紫 + 粉橘紅）作為過場底色
        document.body.setAttribute('data-period', 'night');
        document.querySelector('main#stage').style.backgroundColor = 'hsl(280, 35%, 25%)';

        setTimeout(() => {
            document.querySelector('main#stage').style.backgroundColor = '';
            this.renderFinalShare(resultData);
            this.showScreen('screen-final-share');
        }, 2500);
    },

    renderFinalShare(resultData) {
        // 三聯
        document.getElementById('share-triple-text').innerText =
            (resultData.triple_code || '').split('-').join(' — ');
        document.getElementById('share-alias').innerText = this.alias ? `— ${this.alias}` : '';

        // 雷達（三色疊圖，無高亮）
        this.renderShareRadar(resultData);

        // 三章節迷你卡（含評分）
        this.renderShareChapters(resultData);

        // 性象限
        this.renderShareSex(resultData);

        // 經典劇本
        this.renderShareScript(resultData);

        // 配對
        this.renderSharePairing(resultData);

        // Debug
        console.log('[LPAS v2 Result]', resultData);
        console.log('[LPAS v2 Feedback]', this.feedbackScores);
    },

    renderShareRadar(resultData) {
        const ctx = document.getElementById('share-radar-canvas').getContext('2d');
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
                        angleLines: { color: 'rgba(255, 255, 255, 0.2)' },
                        grid: { color: 'rgba(255, 255, 255, 0.2)' },
                        pointLabels: { color: '#E8E0F5', font: { size: 16 } },
                        min: 1, max: 7,
                        ticks: { display: false, stepSize: 1 }
                    }
                },
                plugins: { legend: { display: true, labels: { color: '#E8E0F5', font: { size: 12 } } } }
            }
        });
    },

    renderShareChapters(resultData) {
        const container = document.getElementById('share-chapters');
        container.innerHTML = '';

        const periodNames = { 1: '曖昧期', 2: '熱戀期', 3: '失戀期' };
        const feedbackKeys = { 1: 'ambiguity', 2: 'love', 3: 'breakup' };

        for (let p = 1; p <= 3; p++) {
            const typeName = resultData.phase_types[p];
            const card = (window.TYPE_MAPPING_V2_PUBLIC || {})[typeName];
            const slogan = card ? card.slogan : '';
            const fbScore = this.feedbackScores[feedbackKeys[p]] || 0;
            const stars = '★'.repeat(fbScore) + '☆'.repeat(5 - fbScore);

            const div = document.createElement('div');
            div.className = 'share-section share-chapter';
            div.setAttribute('data-p', p);
            div.innerHTML = `
                <div class="ch-dot"></div>
                <div class="ch-body">
                    <span class="ch-feedback">準確度 ${stars}</span>
                    <div class="ch-period">${periodNames[p]}</div>
                    <div class="ch-typename">${typeName || '—'}</div>
                    <div class="ch-slogan" style="font-style:italic; font-size:13px; color:var(--c-text-sec);">${slogan ? '「' + slogan + '」' : ''}</div>
                </div>
            `;
            container.appendChild(div);
        }
    },

    renderShareSex(resultData) {
        const container = document.getElementById('share-sex');
        container.innerHTML = '';
        const sex = resultData.sex;
        if (!sex || !sex.displayable) {
            container.innerHTML = `
                <div class="share-section share-sex">
                    <div class="ss-label">親密與身體</div>
                    <div class="ss-quad" style="font-size:14px; font-style:italic; color:var(--c-text-sec);">本次未進行性象限分析</div>
                </div>
            `;
            return;
        }

        const fbScore = this.feedbackScores['intimacy'] || 0;
        const stars = '★'.repeat(fbScore) + '☆'.repeat(5 - fbScore);
        const eyeClass = this.sexEyeOpen ? '' : 'eye-closed';
        const eyeIcon = this.sexEyeOpen ? '👁' : '🙈';

        container.innerHTML = `
            <div class="share-section share-sex ${eyeClass}" id="share-sex-card">
                <div class="ss-label">親密與身體 ${stars}</div>
                <div class="ss-quad">${sex.label}<button class="ss-eye" id="share-sex-eye">${eyeIcon}</button></div>
            </div>
        `;

        const eye = document.getElementById('share-sex-eye');
        if (eye) {
            eye.addEventListener('click', () => {
                this.sexEyeOpen = !this.sexEyeOpen;
                const card = document.getElementById('share-sex-card');
                if (card) card.classList.toggle('eye-closed', !this.sexEyeOpen);
                eye.textContent = this.sexEyeOpen ? '👁' : '🙈';
            });
        }
    },

    renderShareScript(resultData) {
        const container = document.getElementById('share-script');
        container.innerHTML = '';
        const script = resultData.script;
        if (!script) return;

        container.innerHTML = `
            <div class="share-section share-script">
                <div class="sc-ribbon">🎬 解鎖經典劇本</div>
                <div class="sc-name">${script.name}</div>
                <div class="sc-tag">「${script.tagline || ''}」</div>
                ${script.story ? `<div class="sc-story">${script.story}</div>` : ''}
            </div>
        `;
    },

    renderSharePairing(resultData) {
        const container = document.getElementById('share-pairing');
        container.innerHTML = '';

        // 以熱戀期為基準
        const focalType = resultData.phase_types[2];
        const pairing = (window.TYPE_MAPPING_V2_PUBLIC || {})[focalType]?.pairing;
        if (!pairing) return;

        const renderChips = arr => (arr || []).map(t => `<span class="sp-chip">${t}</span>`).join('');

        container.innerHTML = `
            <div class="share-section share-pairing">
                <div class="sp-title">你的戀愛配對地圖</div>
                <div class="sp-row"><span class="sp-label">🟢 最契合</span><div>${renderChips(pairing.best)}</div></div>
                <div class="sp-row"><span class="sp-label">🟡 最互補</span><div>${renderChips(pairing.complement)}</div></div>
                <div class="sp-row"><span class="sp-label">🔴 最危險</span><div>${renderChips(pairing.danger)}</div></div>
            </div>
        `;
    }
};

document.addEventListener('DOMContentLoaded', () => app.init());
