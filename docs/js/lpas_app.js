const instructions = [
    "每道題都是一句關於你自己的描述，請根據同意程度來圈選。",
    "選擇的答案是你實際上最常有的反應，而不是你希望自己是那種人。",
    "不要想太久，第一直覺往往最真實。"
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
    currentQuestionShownAtMs: 0,
    
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

            if (!this.ageRange || !this.relationshipExp) {
                alert('請先選擇年齡區間與是否有過感情經驗。');
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

    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById(screenId).classList.add('active');
        this.currentScreen = screenId;
    },

    showInstruction() {
        const p = document.getElementById('instruction-text');
        p.style.opacity = 0;
        setTimeout(() => {
            p.innerText = instructions[this.currentInstructionIdx];
            p.style.opacity = 1;
        }, 300);
    },

    startQuestions() {
        // 從 questions.js 準備陣列
        this.questionQueue = LPAS_QUESTIONS.slice();
        this.currentQIndex = 0;
        this.answers = [];
        this.sessionId = crypto?.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}_${Math.random().toString(16).slice(2)}`;
        this.sessionStartedAt = new Date().toISOString();
        this.renderQuestion();
        this.showScreen('screen-question');
    },

    renderQuestion() {
        const q = this.questionQueue[this.currentQIndex];
        document.getElementById('question-text').innerText = q.text;
        document.getElementById('progress-text').innerText = `${this.currentQIndex + 1}/${this.questionQueue.length}`;
        
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
                circle.style.backgroundColor = i <=3 ? "var(--c-scale-agree)" : (i>=5 ? "var(--c-scale-disagree)" : "var(--c-scale-mid)");
            }

            circle.addEventListener('click', () => {
                this.recordAnswer(i);
            });
            scaleContainer.appendChild(circle);
        }
    },

    recordAnswer(score) {
        const q = this.questionQueue[this.currentQIndex];
        const answeredAtMs = Date.now();
        const timeSpentMs = this.currentQuestionShownAtMs ? (answeredAtMs - this.currentQuestionShownAtMs) : null;
        
        // 更新 UI
        const scaleContainer = document.getElementById('likert-scale');
        scaleContainer.querySelectorAll('.scale-circle').forEach(c => c.style.backgroundColor = 'var(--c-scale-empty)');
        let clicked = scaleContainer.querySelector(`[data-val="${score}"]`);
        if(clicked) {
            clicked.style.backgroundColor = score <=3 ? "var(--c-scale-agree)" : (score>=5 ? "var(--c-scale-disagree)" : "var(--c-scale-mid)");
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

    showTransition(newPeriod) {
        this.showScreen('screen-transition');
        const textObj = {
            2: "現在，當你沉醉愛戀時……",
            3: "最後，回想那段戀情結束之後的時間……"
        };
        document.getElementById('transition-text').innerText = textObj[newPeriod];
        document.body.setAttribute('data-period', newPeriod);
        
        setTimeout(() => {
            this.renderQuestion();
            this.showScreen('screen-question');
        }, 3000);
    },

    finishTest() {
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
                character_card: profileObj
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

    renderResult(resultData) {
        document.getElementById('result-type-name').innerText = resultData.typeName;
        document.getElementById('result-type-code').innerText = resultData.typeCode;
        document.getElementById('result-desc').innerText = resultData.typeDesc;
        
        // 渲染 Radar
        const ctx = document.getElementById('radarChart').getContext('2d');
        if(this.radarChartInstance) this.radarChartInstance.destroy();
        
        this.radarChartInstance = new Chart(ctx, {
            type: 'radar',
            data: resultData.radarData,
            options: {
                responsive: true,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255, 255, 255, 0.2)' },
                        grid: { color: 'rgba(255, 255, 255, 0.2)' },
                        pointLabels: { color: '#E8E0F5', font: { size: 14 } },
                        ticks: { display: false, min: 1, max: 7, stepSize: 1 }
                    }
                },
                plugins: {
                    legend: { labels: { color: '#E8E0F5' } }
                }
            }
        });

        // 綁定下載事件
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
                total_questions: this.questionQueue.length
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

        let currentAlias = this.alias || "user";
        let dateStr = new Date().toISOString().split('T')[0];
        let tsCompact = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z').replace('T', '_');

        let dlbtn = document.getElementById('download-json-btn');
        let recordBtn = document.getElementById('download-record-btn');
        let copybtn = document.getElementById('download-md-btn');
        
        // 移除舊的 event listeners 避免重複綁定
        let newDlbtn = dlbtn.cloneNode(true);
        dlbtn.parentNode.replaceChild(newDlbtn, dlbtn);
        let newRecordBtn = recordBtn.cloneNode(true);
        recordBtn.parentNode.replaceChild(newRecordBtn, recordBtn);
        let newCopybtn = copybtn.cloneNode(true);
        copybtn.parentNode.replaceChild(newCopybtn, copybtn);
        
        newDlbtn.addEventListener('click', () => {
            downloadJSON(profileObj, `role_${dateStr}_${profileObj.id}.json`);
        });

        newRecordBtn.addEventListener('click', () => {
            downloadJSON(recordObj, `role_${dateStr}_${profileObj.id}_lpas_record.json`);
        });

        newCopybtn.addEventListener('click', () => {
            downloadMarkdown(profileObj);
        });
    }
};

window.onload = () => {
    app.init();
};
