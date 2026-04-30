const instructions = [
    "每道題目都是關於你自己的描述，\n請根據同意程度來圈選。",
    "選擇的答案是你實際上的反應，\n而不是你理想中的自己。",
    "不要想太久，\n第一直覺往往最真實。"
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
    isTransitioning: false, // 防止重複點擊的旗標
    currentFeedbackStep: 0, // 0: 曖昧, 1: 熱戀, 2: 失戀
    feedbackScores: {}, // 存儲各階段評分

    init() {
        this.bindEvents();
        this.showScreen('screen-landing');
    },

    bindEvents() {
        // 基本資料送出
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

        // 基礎資料 Radio
        document.querySelectorAll('.radio-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                let group = e.target.parentElement;
                group.querySelectorAll('.radio-btn').forEach(b => b.classList.remove('selected'));
                e.target.classList.add('selected');
            });
        });

        // 說明繼續
        document.getElementById('next-instruction-btn').addEventListener('click', () => {
            this.currentInstructionIdx++;
            if (this.currentInstructionIdx < instructions.length) {
                this.showInstruction();
            } else {
                this.startQuestions();
            }
        });

        // 上一題
        document.getElementById('prev-question-btn').addEventListener('click', () => {
            if (this.currentQIndex > 0) {
                this.currentQIndex--;
                this.renderQuestion();
            }
        });

        // 鍵盤支援
        document.addEventListener('keydown', (e) => {
            if (this.currentScreen === 'screen-question' && e.key >= '1' && e.key <= '7') {
                this.recordAnswer(parseInt(e.key));
            }
        });
    },

    // 顯示畫面
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        this.currentScreen = screenId;
    },

    // 顯示說明
    showInstruction() {
        const p = document.getElementById('instruction-text');
        p.style.opacity = 0;
        setTimeout(() => {
            p.innerText = instructions[this.currentInstructionIdx];
            p.style.opacity = 1;
        }, 300);
    },
    //開始答題過程
    startQuestions() {
        // 從 questions.js 準備陣列
        this.questionQueue = LPAS_QUESTIONS.slice();
        this.currentQIndex = 0;
        this.answers = [];
        this.sessionId = crypto?.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        this.sessionStartedAt = new Date().toISOString();
        
        // 取得第一題的時期並顯示換場效果
        const firstQ = this.questionQueue[0];
        if (firstQ) {
            this.showTransition(firstQ.period);
        } else {
            this.renderQuestion();
            this.showScreen('screen-question');
        }
    },
    // 回答畫面
    renderQuestion() {
        const q = this.questionQueue[this.currentQIndex];
        document.getElementById('question-text').innerText = q.text;
        document.getElementById('progress-text').innerText = `${this.currentQIndex + 1}/${this.questionQueue.length}`;
        this.isTransitioning = false; // 解除鎖定

        let periodLabels = { 1: "初期曖昧", 2: "熱戀期", 3: "失戀之後" };
        document.getElementById('period-label').innerText = periodLabels[q.period];
        document.body.setAttribute('data-period', q.period);

        // 渲染 7 點量表
        const scaleContainer = document.getElementById('likert-scale');
        scaleContainer.innerHTML = '';
        this.currentQuestionShownAtMs = Date.now();
        for (let i = 1; i <= 7; i++) {
            let circle = document.createElement('div');
            circle.className = 'scale-circle';
            circle.dataset.val = i;

            // 回填之前選的
            let existingAns = this.answers.find(a => a.id === q.id);
            if (existingAns && existingAns.score == i) {
                circle.style.backgroundColor = i >= 5 ? "var(--c-scale-agree)" : (i <= 3 ? "var(--c-scale-disagree)" : "var(--c-scale-mid)");
            }

            circle.addEventListener('click', () => {
                this.recordAnswer(i);
            });
            scaleContainer.appendChild(circle);
        }
    },
    // 回答過程
    recordAnswer(score) {
        if (this.isTransitioning) return; // 如果正在換題中，直接忽略點擊
        this.isTransitioning = true; // 進入換題鎖定

        const q = this.questionQueue[this.currentQIndex];
        if (!q) return;
        const answeredAtMs = Date.now();
        const timeSpentMs = this.currentQuestionShownAtMs ? (answeredAtMs - this.currentQuestionShownAtMs) : null;

        // 更新 UI
        const scaleContainer = document.getElementById('likert-scale');
        scaleContainer.querySelectorAll('.scale-circle').forEach(c => c.style.backgroundColor = 'var(--c-scale-empty)');
        let clicked = scaleContainer.querySelector(`[data-val="${score}"]`);
        if (clicked) {
            clicked.style.backgroundColor = score >= 5 ? "var(--c-scale-agree)" : (score <= 3 ? "var(--c-scale-disagree)" : "var(--c-scale-mid)");
        }

        // 儲存答案
        let existingIdx = this.answers.findIndex(a => a.id === q.id);
        if (existingIdx >= 0) {
            this.answers[existingIdx].score = score;
            this.answers[existingIdx].answered_at = new Date(answeredAtMs).toISOString();
            this.answers[existingIdx].time_spent_ms = timeSpentMs;
        } else {
            this.answers.push({
                id: q.id,
                score: score,
                period: q.period,
                dimension: q.dimension,
                direction: q.direction,
                question_text: q.text,
                answered_at: new Date(answeredAtMs).toISOString(),
                time_spent_ms: timeSpentMs
            });
        }

        // 短暫延遲後下一題 或 換場
        setTimeout(() => {
            this.currentQIndex++;
            if (this.currentQIndex < this.questionQueue.length) {
                let nextQ = this.questionQueue[this.currentQIndex];
                if (nextQ.period !== q.period) {
                    this.showTransition(nextQ.period);
                } else {
                    this.renderQuestion();
                }
            } else {
                this.finishTest();
            }
        }, 300);
    },
    // 換場
    showTransition(newPeriod) {
        this.showScreen('screen-transition');
        const textObj = {
            1: "當你們剛開始互相吸引……",
            2: "當你沉醉愛戀時……",
            3: "回想那段戀情結束之後……"
        };
        document.getElementById('transition-text').innerText = textObj[newPeriod];
        document.body.setAttribute('data-period', newPeriod);

        setTimeout(() => {
            this.renderQuestion();
            this.showScreen('screen-question');
        }, 3000);
    },
    // 完成測驗
    finishTest() {
        if (this.currentScreen === 'screen-calculating') return; // 防止重複呼叫
        this.showScreen('screen-calculating');

        setTimeout(() => {
            // 計算結果
            const result = calculateScores(this.answers);
            this.renderResult(result);
            this.showScreen('screen-result');
        }, 2000);
    },

    /** 同步角色卡 + LPAS 紀錄至 Supabase */
    async saveToCloud(profileObj, recordObj, resultData) {
        const statusEl = document.getElementById('cloud-save-status');
        if (!window.SupabaseClient || !window.SupabaseClient.init || !window.SupabaseClient.init()) {
            console.warn('[Cloud] Supabase 未初始化，跳過雲端儲存');
            if (statusEl) statusEl.textContent = '⚠️ Supabase 未設定，僅本機儲存';
            return;
        }
        const sb = window.SupabaseClient.getClient();
        if (!sb) {
            if (statusEl) statusEl.textContent = '⚠️ 無法取得 Supabase client';
            return;
        }
        if (statusEl) statusEl.textContent = '☁️ 正在同步至雲端…';

        /** 將 schema cache 錯誤轉成更友善的訊息 */
        function friendlyError(msg) {
            if (msg && msg.includes('schema cache')) {
                return '資料表不存在。請先到 Supabase Dashboard → SQL Editor 執行 schema.sql 和 schema_add.sql';
            }
            return msg;
        }

        try {
            // 1. 存角色卡 → characters 表
            const charPayload = {
                id: profileObj.id,
                name: profileObj.name,
                card_json: profileObj,
                source: 'lpas',
                is_active: true,
                lpas_record_json: recordObj  // 同時存答題過程 JSON 快照
            };
            const { error: charErr } = await sb.from('characters').upsert(charPayload, { onConflict: 'id' });
            if (charErr) throw new Error(friendlyError(charErr.message));
            console.log('[Cloud] characters upserted:', profileObj.id);

            // 2. 存 LPAS session → lpas_sessions 表
            const sessionPayload = {
                session_id: this.sessionId,
                alias: this.alias || null,
                age_range: this.ageRange,
                relationship_experience: this.relationshipExp,
                schema_version: 1,
                started_at: this.sessionStartedAt,
                finished_at: recordObj.meta.finished_at
            };
            const { data: sessionData, error: sessErr } = await sb.from('lpas_sessions').insert(sessionPayload).select('id').single();
            if (sessErr) throw new Error(friendlyError(sessErr.message));
            const dbSessionId = sessionData.id;
            console.log('[Cloud] lpas_sessions inserted, DB id:', dbSessionId);

            // 3. 存答案 → lpas_answers 表（批次 insert）
            const answersPayload = this.answers.map(a => ({
                lpas_session_id: dbSessionId,
                question_id: a.id,
                score: a.score,
                period: a.period,
                dimension: a.dimension,
                direction: a.direction,
                question_text: a.question_text,
                answered_at: a.answered_at || null,
                time_spent_ms: a.time_spent_ms || null
            }));
            const { error: ansErr } = await sb.from('lpas_answers').insert(answersPayload);
            if (ansErr) throw new Error(friendlyError(ansErr.message));
            console.log('[Cloud] lpas_answers inserted:', answersPayload.length, 'rows');

            // 4. 存結果 → lpas_results 表
            const resultPayload = {
                lpas_session_id: dbSessionId,
                type_code: resultData.typeCode,
                type_name: resultData.typeName,
                type_desc: resultData.typeDesc,
                averages: resultData.averages,
                radar_data: resultData.radarData,
                character_card: profileObj,
                feedback_scores: recordObj.meta.feedback_scores
            };
            const { error: resErr } = await sb.from('lpas_results').insert(resultPayload);
            if (resErr) throw new Error(friendlyError(resErr.message));
            console.log('[Cloud] lpas_results inserted');

            if (statusEl) statusEl.textContent = '✅ 已同步至雲端';
        } catch (err) {
            console.error('[Cloud] 雲端儲存失敗:', err);
            if (statusEl) statusEl.textContent = '❌ 雲端儲存失敗: ' + err.message;
        }
    },
    // 渲染結果
    renderResult(resultData) {
        this.currentFeedbackStep = 0;
        this.feedbackScores = {};

        // 渲染基本資料
        document.getElementById('result-type-name').innerText = resultData.typeName;
        document.getElementById('result-type-code').innerText = resultData.typeCode;

        this.renderResultStep(resultData);
        this.initStarRating(resultData);
    },
    // 渲染結果分階段
    renderResultStep(resultData) {
        const steps = [
            { id: 1, title: '初期曖昧' },
            { id: 2, title: '熱戀期' },
            { id: 3, title: '失戀之後' }
        ];
        const step = steps[this.currentFeedbackStep];

        // 從 phaseTypeNames 與 phaseDescs 取得資料 (索引為 1, 2, 3)
        const typeName = resultData.phaseTypeNames[step.id] || "未知類型";
        const description = resultData.phaseDescs[step.id] || "暫無說明";

        // 取得短描述 (從 TYPE_MAPPING_SHORT)
        const code = resultData.phaseCodes[step.id];
        const formattedCode = code.split('').join('-');
        const shortInfo = window.TYPE_MAPPING_SHORT[formattedCode] || { name: typeName, desc: "" };

        // 更新標題與說明，標題格式為 "期間:類型"
        document.getElementById('result-period-title').innerText = `${step.title}：${typeName}`;
        document.getElementById('result-type-short').innerText = shortInfo.desc;
        document.getElementById('result-desc').innerHTML = description;
        document.body.setAttribute('data-period', step.id);

        // 動態變更容器背景顏色
        const container = document.querySelector('.result-container');
        const periodColor = getComputedStyle(document.documentElement).getPropertyValue(`--c-period-${step.id}`).trim();
        if (container) {
            container.style.backgroundColor = periodColor;
            container.style.transition = "background-color 0.8s ease";
        }

        // 更新雷達圖 (高亮當前階段)
        this.updateRadarChart(resultData, this.currentFeedbackStep, periodColor);

        // 重設星星狀態
        document.querySelectorAll('.star').forEach(s => s.classList.remove('active'));
    },
    // 更新雷達圖
    updateRadarChart(resultData, activeIndex, periodColor) {
        const ctx = document.getElementById('radarChart').getContext('2d');
        if (this.radarChartInstance) this.radarChartInstance.destroy();

        // 複製一份資料集來修改透明度與順序
        let datasets = JSON.parse(JSON.stringify(resultData.radarData.datasets));

        // 設定透明度：當前使用該期間的主色，其他淡化
        datasets.forEach((ds, i) => {
            if (i === activeIndex) {
                // 如果有傳入期間主色，則覆蓋原本顏色
                ds.borderColor = '#FFFFFFFF';
                ds.backgroundColor = 'hsla(0,0%,100%,0.3)';
                /*
                // 如果有傳入期間主色，則覆蓋原本顏色
                if (periodColor) {
                    ds.borderColor = periodColor;
                    ds.backgroundColor = periodColor.replace(')', ', 0.4)').replace('hsl', 'hsla');
                } else {
                    ds.backgroundColor = ds.backgroundColor.replace(/[\d\.]+\)$/, '0.4)');
                    ds.borderColor = ds.borderColor.replace(/[\d\.]+\)$/, '1.0)');
                }
                */
                ds.borderWidth = 3;
                ds.pointRadius = 8;
            } else {
                ds.backgroundColor = 'rgba(255, 255, 255, 0.05)';
                ds.borderColor = 'rgba(255, 255, 255, 0.1)';
                ds.borderWidth = 1;
                ds.pointRadius = 0;
            }
        });

        // 將當前 active 的 dataset 移到最後 (最上層)
        const activeDs = datasets.splice(activeIndex, 1)[0];
        datasets.push(activeDs);

        this.radarChartInstance = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: resultData.radarData.labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255, 255, 255, 0.2)' },
                        grid: { color: 'rgba(255, 255, 255, 0.2)' },
                        pointLabels: { color: '#E8E0F5', font: { size: 12 } },
                        min: 1,
                        max: 7,
                        ticks: { display: false, stepSize: 1 }
                    }
                },
                plugins: {
                    legend: { display: false } // 隱藏圖例以減少干擾
                }
            }
        });
    },
    // 初始化評分
    initStarRating(resultData) {
        const stars = document.querySelectorAll('.star');
        stars.forEach(star => {
            // 移除舊事件
            const newStar = star.cloneNode(true);
            star.parentNode.replaceChild(newStar, star);

            newStar.addEventListener('mouseover', (e) => {
                const val = parseInt(e.target.dataset.val);
                this.highlightStars(val);
            });
            newStar.addEventListener('mouseout', () => {
                this.highlightStars(0); // 恢復成灰色
            });
            newStar.addEventListener('click', (e) => {
                const val = parseInt(e.target.dataset.val);
                this.handleFeedback(val, resultData);
            });
        });
    },

    // 點擊星星時，讓星星變亮
    highlightStars(val) {
        document.querySelectorAll('.star').forEach(s => {
            s.classList.toggle('active', parseInt(s.dataset.val) <= val);
        });
    },
    // 處理評分
    async handleFeedback(score, resultData) {
        const keys = ['ambiguity', 'love', 'breakup'];
        this.feedbackScores[keys[this.currentFeedbackStep]] = score;

        if (this.currentFeedbackStep < 2) {
            this.currentFeedbackStep++;
            this.renderResultStep(resultData);
        } else {
            // 完成所有評分
            document.getElementById('feedback-section').style.display = 'none';
            document.getElementById('final-actions').style.display = 'flex';
            this.finishAndSave(resultData);
        }
    },
    // 完成並儲存
    finishAndSave(resultData) {
        const profileObj = generateProfile(this.alias, resultData);
        const recordObj = {
            meta: {
                schema_version: 1,
                session_id: this.sessionId,
                started_at: this.sessionStartedAt,
                finished_at: new Date().toISOString(),
                alias: this.alias || null,
                age_range: this.ageRange,
                relationship_experience: this.relationshipExp,
                total_questions: this.questionQueue.length,
                feedback_scores: this.feedbackScores // 加入回饋評分
            },
            answers: this.answers.slice().sort((a, b) => (a.id || '').localeCompare(b.id || '')),
            scores: {
                type_code: resultData.typeCode,
                type_name: resultData.typeName,
                type_desc: resultData.typeDesc,
                averages: resultData.averages,
                radar_data: resultData.radarData
            },
            character_card: profileObj
        };

        // ======= 雲端同步 =======
        this.saveToCloud(profileObj, recordObj, resultData);

        // 綁定按鈕事件 (使用新的 DOM 節點)
        document.getElementById('download-json-btn').onclick = () => {
            downloadJSON(profileObj, `${profileObj.id}.json`);
        };
        document.getElementById('download-record-btn').onclick = () => {
            downloadJSON(recordObj, `${profileObj.id}_lpas_record.json`);
        };
        document.getElementById('download-md-btn').onclick = () => {
            downloadMarkdown(profileObj);
        };
    }
};

window.onload = () => {
    app.init();
};
