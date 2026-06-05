/**
 * lpas_v2_render.js
 * LPAS v2 - 結果頁渲染器
 *
 * 用途：把 calculateScoresV2() 的輸出物件渲染到結果頁的 9 個 element。
 * 給呼叫者使用的 API：
 *   - LPASv2Render.renderAll(resultData, containers)
 *
 * containers 為一個 dictionary，指定每個 element 對應的 DOM 元素，例：
 *   {
 *     triple:       document.getElementById('v2-triple'),
 *     radar:        document.getElementById('v2-radar'),
 *     chapters:     document.getElementById('v2-chapters'),
 *     sex:          document.getElementById('v2-sex'),
 *     script:       document.getElementById('v2-script'),
 *     pairing:      document.getElementById('v2-pairing')
 *   }
 *
 * 依賴：
 *   - TYPE_MAPPING_V2_PUBLIC（lpas_v2_types.js）
 *   - PAIRING_MATRIX（lpas_v2_scripts.js）
 *   - Chart.js（雷達圖）
 */

(function () {

    // ------------- 私有：取得型號公開卡 -------------
    function getPublicCard(typeName) {
        if (!window.TYPE_MAPPING_V2_PUBLIC) return null;
        return window.TYPE_MAPPING_V2_PUBLIC[typeName] || null;
    }


    // ------------- Element 01：三聯名 -------------
    function renderTripleName(container, resultData) {
        if (!container) return;
        const triple = resultData.triple_code || "";
        container.innerHTML = `
            <div class="v2-triple-wrapper">
                <div class="v2-triple-label">妳的戀愛三聯</div>
                <div class="v2-triple-text">${triple.split("-").join(" — ")}</div>
            </div>
        `;
    }


    // ------------- Element 02：雷達圖 -------------
    // 沿用現有 lpas_app.js 的 updateRadarChart() 高亮邏輯
    function renderRadar(container, resultData, options) {
        if (!container) return;
        options = options || {};
        const activeIndex = options.activeIndex || 0;  // 預設 focus 曖昧期

        // 找到或建立 canvas
        let canvas = container.querySelector('canvas');
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = 'v2-radar-canvas';
            container.appendChild(canvas);
        }
        const ctx = canvas.getContext('2d');

        // 銷毀舊圖
        if (canvas._lpasV2ChartInstance) {
            canvas._lpasV2ChartInstance.destroy();
        }

        // 深拷貝資料集
        const datasets = JSON.parse(JSON.stringify(resultData.radar_data.datasets));

        // 設定透明度（active 高亮，其他淡化）
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

        // active dataset 移到最上層
        const activeDs = datasets.splice(activeIndex, 1)[0];
        datasets.push(activeDs);

        canvas._lpasV2ChartInstance = new Chart(ctx, {
            type: 'radar',
            data: { labels: resultData.radar_data.labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: {
                        angleLines: { color: 'rgba(255, 255, 255, 0.2)' },
                        grid:       { color: 'rgba(255, 255, 255, 0.2)' },
                        pointLabels:{ color: '#E8E0F5', font: { size: 20 } },
                        min: 1,
                        max: 7,
                        ticks: { display: false, stepSize: 1 }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

        // 加上期間切換按鈕
        let switcher = container.querySelector('.v2-period-switcher');
        if (!switcher) {
            switcher = document.createElement('div');
            switcher.className = 'v2-period-switcher';
            switcher.innerHTML = `
                <button data-idx="0" class="v2-period-btn active">曖昧期</button>
                <button data-idx="1" class="v2-period-btn">熱戀期</button>
                <button data-idx="2" class="v2-period-btn">失戀期</button>
            `;
            container.appendChild(switcher);

            switcher.addEventListener('click', function (e) {
                const btn = e.target.closest('button[data-idx]');
                if (!btn) return;
                const idx = parseInt(btn.dataset.idx, 10);

                switcher.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                renderRadar(container, resultData, { activeIndex: idx });
            });
        }
    }


    // ------------- Element 03-05：三章節（曖昧 / 熱戀 / 失戀）-------------
    function renderChapters(container, resultData) {
        if (!container) return;
        container.innerHTML = '';

        const phaseNames = ['曖昧期', '熱戀期', '失戀期'];
        const phaseColors = ['hsla(266,56%,64%,1)', 'hsla(146,56%,64%,1)', 'hsla(344,56%,64%,1)'];

        for (let p = 1; p <= 3; p++) {
            const typeName = resultData.phase_types[p];
            const card = getPublicCard(typeName);
            if (!card) continue;

            const chapter = document.createElement('div');
            chapter.className = 'v2-chapter';
            chapter.style.borderLeft = `4px solid ${phaseColors[p - 1]}`;
            chapter.innerHTML = `
                <div class="v2-chapter-header">
                    <span class="v2-chapter-period">Chapter ${p} · ${phaseNames[p - 1]}</span>
                    <h2 class="v2-chapter-typename">妳是 ${typeName}</h2>
                </div>
                <p class="v2-chapter-slogan">「${card.slogan}」</p>
                <p class="v2-chapter-body">${card.phase_views[phaseNames[p - 1]]}</p>
            `;
            container.appendChild(chapter);
        }
    }


    // ------------- Element 06：性象限卡（可隱藏） -------------
    function renderSexCard(container, resultData) {
        if (!container) return;
        container.innerHTML = '';

        const sex = resultData.sex;
        if (!sex) return;

        // 跳過太多 → 顯示提示
        if (!sex.displayable) {
            container.innerHTML = `
                <div class="v2-sex-card v2-sex-skipped">
                    <div class="v2-sex-title">親密與身體</div>
                    <p class="v2-sex-text">${sex.reason || '您跳過了較多性議題，本次不進行性象限分析'}</p>
                </div>
            `;
            return;
        }

        // 正常顯示（含眼睛圖示）
        const sexLabel = sex.label || '未知';
        container.innerHTML = `
            <div class="v2-sex-card" id="v2-sex-card">
                <div class="v2-sex-header">
                    <span class="v2-sex-title">親密與身體</span>
                    <button class="v2-eye-btn" id="v2-eye-btn" data-state="open" aria-label="切換顯示">
                        👁
                    </button>
                </div>
                <div class="v2-sex-content" id="v2-sex-content">
                    <div class="v2-sex-quadrant">${sexLabel}</div>
                </div>
            </div>
        `;

        const eyeBtn = container.querySelector('#v2-eye-btn');
        const contentEl = container.querySelector('#v2-sex-content');
        eyeBtn.addEventListener('click', function () {
            const state = eyeBtn.dataset.state;
            if (state === 'open') {
                eyeBtn.dataset.state = 'closed';
                eyeBtn.textContent = '🙈';
                contentEl.style.display = 'none';
            } else {
                eyeBtn.dataset.state = 'open';
                eyeBtn.textContent = '👁';
                contentEl.style.display = '';
            }
        });
    }


    // ------------- Element 07：經典劇本彩蛋卡 -------------
    function renderScriptCard(container, resultData) {
        if (!container) return;
        container.innerHTML = '';

        const script = resultData.script;
        if (!script) return;

        container.innerHTML = `
            <div class="v2-script-card">
                <div class="v2-script-ribbon">🎬 妳解鎖了經典劇本</div>
                <h3 class="v2-script-name">${script.name}</h3>
                <p class="v2-script-tagline">「${script.tagline}」</p>
                ${script.story ? `<p class="v2-script-story">${script.story}</p>` : ''}
                ${script.genre ? `<p class="v2-script-genre">適合小說類型：${script.genre}</p>` : ''}
            </div>
        `;
    }


    // ------------- Element 08：配對提示 -------------
    function renderPairing(container, resultData) {
        if (!container) return;
        container.innerHTML = '';

        // 以熱戀期型為主基準
        const focalType = resultData.phase_types[2];
        if (!focalType) return;

        const pairing = window.lpasGetPairingRecommend
            ? window.lpasGetPairingRecommend(focalType)
            : null;
        if (!pairing) return;

        const renderList = (arr) => (arr || []).map(t => `<span class="v2-pair-chip">${t}</span>`).join('');

        container.innerHTML = `
            <div class="v2-pairing-card">
                <h3 class="v2-pairing-title">妳的戀愛配對地圖</h3>
                <div class="v2-pairing-section">
                    <span class="v2-pair-label v2-pair-best">🟢 最契合</span>
                    <div class="v2-pair-chips">${renderList(pairing.best)}</div>
                </div>
                <div class="v2-pairing-section">
                    <span class="v2-pair-label v2-pair-complement">🟡 最互補</span>
                    <div class="v2-pair-chips">${renderList(pairing.complement)}</div>
                </div>
                <div class="v2-pairing-section">
                    <span class="v2-pair-label v2-pair-danger">🔴 最危險</span>
                    <div class="v2-pair-chips">${renderList(pairing.danger)}</div>
                </div>
                <p class="v2-pairing-note">配對提示以「熱戀期型」(${focalType}) 為基準</p>
            </div>
        `;
    }


    // ------------- 對外 API -------------
    window.LPASv2Render = {
        renderAll: function (resultData, containers) {
            if (!resultData || !containers) return;
            renderTripleName(containers.triple,   resultData);
            renderRadar(containers.radar,         resultData, { activeIndex: 0 });
            renderChapters(containers.chapters,   resultData);
            renderSexCard(containers.sex,         resultData);
            renderScriptCard(containers.script,   resultData);
            renderPairing(containers.pairing,     resultData);
        },
        renderTriple:   renderTripleName,
        renderRadar:    renderRadar,
        renderChapters: renderChapters,
        renderSex:      renderSexCard,
        renderScript:   renderScriptCard,
        renderPairing:  renderPairing
    };

})();
