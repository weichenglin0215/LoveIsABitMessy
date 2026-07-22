/**
 * writer_settings_app.js — 知名作家寫作風格與範本管理模組
 * 功能說明：
 * 1. 提供「寫作風格」與「寫作範本」兩組彈窗編輯介面，讓使用者可從雲端(Supabase)
 *    讀取、新增、編輯、儲存自訂的寫作風格/範本資料。
 * 2. 將彈窗所需的 CSS 與 HTML 動態注入頁面，並綁定相關事件監聽。
 * 3. 提供外部呼叫的介面（例如 openStyleModal、openSampleModal、getSelectedContext），
 *    供其他模組（如小說編輯器）取得目前選取的風格/範本內容。
 */
'use strict';

// 使用 IIFE（立即執行函式）包裝，避免污染全域變數空間
(function () {
    // WriterSettingsApp：整個模組的核心物件，掛載於 window 供全域使用
    const WriterSettingsApp = {
        styleList: [],   // 快取「寫作風格」清單（從資料庫抓取後存放於此，避免重複查詢）
        sampleList: [],  // 快取「寫作範本」清單（從資料庫抓取後存放於此，避免重複查詢）

        // 模組初始化入口：依序注入樣式、注入HTML彈窗、綁定事件、載入雲端資料
        init() {
            this.injectCSS();
            this.injectHTML();
            this.setupListeners();
            this.refreshData();
        },

        // 注入頁面所需的 CSS 檔案（editer.css），若已存在則不重複注入
        injectCSS() {
            if (!document.querySelector('link[href="/css/editer.css"]')) {
                const link = document.createElement('link');
                link.rel = 'stylesheet';
                link.href = '/css/editer.css';
                document.head.appendChild(link);
            }
        },

        // 動態產生「寫作風格」與「寫作範本」兩個彈窗的 HTML 結構，並插入到 <body> 尾端
        injectHTML() {
            const html = `
            <!-- 寫作風格彈窗 -->
            <div id="ws-style-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10000; justify-content:center; align-items:center;">
                <div class="modal" style="background:#222; color:#eee; padding:20px; border-radius:8px; height: 90%; width:60%; max-width:90%; border:1px solid #444; display: flex; flex-direction: column; box-sizing: border-box;">
                    <h3 style="margin-top:0;">知名作家寫作風格</h3>
                    <div style="margin-bottom:10px;">
                        <label>選取雲端項目：</label>
                        <div style="display:flex; gap:5px;">
                            <select id="ws-style-select" style="flex:1; padding:5px; background:#333; color:white; border:1px solid #555;"></select>
                            <button id="ws-style-add-btn" class="btn-primary" style="padding:5px 15px;">+新增</button>
                        </div>
                    </div>
                    <div style="margin-bottom:10px;">
                        <label>名稱：</label>
                        <input type="text" id="ws-style-name" style="width:100%; padding:8px; box-sizing:border-box; background:#333; color:white; border:1px solid #555;">
                    </div>
                    <div style="margin-bottom:15px; flex: 1; display: flex; flex-direction: column;">
                        <label>內容 (Markdown 格式)：</label>
                        <textarea class="editor-textarea" id="ws-style-content" style="font-size: var(--font-size-xl); line-height: 1.4; resize: vertical; font-family: var(--font-kai);"></textarea>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px;">
                        <button id="ws-style-cancel" style="padding:8px 20px; background:#555; color:white; border:none; cursor:pointer; border-radius:4px;">取消</button>
                        <button id="ws-style-save" class="btn-primary" style="padding:8px 20px; border-radius:4px;">儲存設定</button>
                    </div>
                </div>
            </div>

            <!-- 寫作範本彈窗 -->
            <div id="ws-sample-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10000; justify-content:center; align-items:center;">
                <div class="modal" style="background:#222; color:#eee; padding:20px; border-radius:8px; height: 90%; width:60%; max-width:90%; border:1px solid #444; display: flex; flex-direction: column; box-sizing: border-box;">
                    <h3 style="margin-top:0;">知名作家寫作範本</h3>
                    <div style="margin-bottom:10px;">
                        <label>選取雲端項目：</label>
                        <div style="display:flex; gap:5px;">
                            <select id="ws-sample-select" style="flex:1; padding:5px; background:#333; color:white; border:1px solid #555;"></select>
                            <button id="ws-sample-add-btn" class="btn-primary" style="padding:5px 15px;">+新增</button>
                        </div>
                    </div>
                    <div style="margin-bottom:10px;">
                        <label>名稱：</label>
                        <input type="text" id="ws-sample-name" style="width:100%; padding:8px; box-sizing:border-box; background:#333; color:white; border:1px solid #555;">
                    </div>
                    <div style="margin-bottom:15px; flex: 1; display: flex; flex-direction: column;">
                        <label>內容：</label>
                        <textarea class="editor-textarea" id="ws-sample-content" style="font-size: var(--font-size-xl); line-height: 1.4; resize: vertical; font-family: var(--font-kai);"></textarea>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px;">
                        <button id="ws-sample-cancel" style="padding:8px 20px; background:#555; color:white; border:none; cursor:pointer; border-radius:4px;">取消</button>
                        <button id="ws-sample-save" class="btn-primary" style="padding:8px 20px; border-radius:4px;">儲存設定</button>
                    </div>
                </div>
            </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
        },

        // 綁定所有彈窗內按鈕與下拉選單的事件監聽器
        setupListeners() {
            // ===== 寫作風格彈窗 (Style Modal) =====
            // 取消按鈕：關閉彈窗，不做任何儲存
            document.getElementById('ws-style-cancel').onclick = () => document.getElementById('ws-style-modal').style.display = 'none';
            // 「+新增」按鈕：清空名稱/內容輸入欄與下拉選單，讓使用者輸入全新的風格資料
            document.getElementById('ws-style-add-btn').onclick = () => {
                document.getElementById('ws-style-name').value = '';
                document.getElementById('ws-style-content').value = '';
                document.getElementById('ws-style-select').value = '';
            };
            // 下拉選單切換時：依選取的名稱從快取清單找出對應資料，帶入名稱與內容輸入欄
            document.getElementById('ws-style-select').onchange = (e) => {
                const item = this.styleList.find(i => i.name === e.target.value);
                if (item) {
                    document.getElementById('ws-style-name').value = item.name;
                    document.getElementById('ws-style-content').value = item.content;
                }
            };
            // 儲存按鈕：呼叫 saveStyle() 將資料寫回雲端資料庫
            document.getElementById('ws-style-save').onclick = () => this.saveStyle();

            // ===== 寫作範本彈窗 (Sample Modal) =====
            // 取消按鈕：關閉彈窗，不做任何儲存
            document.getElementById('ws-sample-cancel').onclick = () => document.getElementById('ws-sample-modal').style.display = 'none';
            // 「+新增」按鈕：清空名稱/內容輸入欄與下拉選單，讓使用者輸入全新的範本資料
            document.getElementById('ws-sample-add-btn').onclick = () => {
                document.getElementById('ws-sample-name').value = '';
                document.getElementById('ws-sample-content').value = '';
                document.getElementById('ws-sample-select').value = '';
            };
            // 下拉選單切換時：依選取的名稱從快取清單找出對應資料，帶入名稱與內容輸入欄
            document.getElementById('ws-sample-select').onchange = (e) => {
                const item = this.sampleList.find(i => i.name === e.target.value);
                if (item) {
                    document.getElementById('ws-sample-name').value = item.name;
                    document.getElementById('ws-sample-content').value = item.content;
                }
            };
            // 儲存按鈕：呼叫 saveSample() 將資料寫回雲端資料庫
            document.getElementById('ws-sample-save').onclick = () => this.saveSample();
        },

        // 從雲端(Supabase)重新讀取「寫作風格」與「寫作範本」資料，並更新快取與畫面上的下拉選單
        async refreshData() {
            // 若 Supabase 客戶端尚未就緒（例如尚未登入或初始化失敗），則直接跳過
            const sb = window.SupabaseClient ? window.SupabaseClient.getClient() : null;
            if (!sb) return;

            // 讀取「寫作風格」資料表，依名稱排序
            const { data: styles } = await sb.from('writer_styles').select('*').order('name');
            this.styleList = styles || [];
            // 同時更新主頁多欄 (ws-style-dropdown) 與好友彈窗 (ws-style-friend-dropdown)
            this.updateDropdowns('ws-style-select', this.styleList, 'ws-style-dropdown', 'ws-style-friend-dropdown');

            // 讀取「寫作範本」資料表，依名稱排序
            const { data: samples } = await sb.from('writer_samples').select('*').order('name');
            this.sampleList = samples || [];
            this.updateDropdowns('ws-sample-select', this.sampleList, 'ws-sample-dropdown');
        },

        // 更新指定下拉選單(modalSelectId)的選項內容；並同步更新頁面中其他相同用途的下拉選單
        // 參數說明：
        //   modalSelectId：彈窗內下拉選單的 DOM id
        //   list：要顯示的資料清單（風格清單或範本清單）
        //   ...pageSelectClasses：支援傳入多個頁面 CSS class，每個 class 下的 select 都會同步更新
        updateDropdowns(modalSelectId, list, ...pageSelectClasses) {
            // 組出選項HTML字串，第一個選項固定為「無」，代表不選取任何項目
            const options = ['<option value="">無</option>', ...list.map(i => `<option value="${i.name}">${i.name}</option>`)].join('');
            document.getElementById(modalSelectId).innerHTML = options;

            // 更新頁面上其他同名 class 的下拉選單，並嘗試保留原本選取的值
            pageSelectClasses.forEach(cls => {
                document.querySelectorAll('.' + cls).forEach(sel => {
                    const currentVal = sel.value;
                    sel.innerHTML = options;
                    sel.value = currentVal;
                });
            });
        },

        // 儲存「寫作風格」：驗證輸入後，以 upsert（存在則更新、不存在則新增）方式寫入 writer_styles 資料表
        async saveStyle() {
            const name = document.getElementById('ws-style-name').value.trim();
            const content = document.getElementById('ws-style-content').value.trim();
            if (!name || !content) return alert('請輸入名稱與內容');

            const sb = window.SupabaseClient.getClient();
            const { error } = await sb.from('writer_styles').upsert({ name, content, updated_at: new Date() });
            if (error) return alert('儲存失敗: ' + error.message);

            alert('儲存成功');
            document.getElementById('ws-style-modal').style.display = 'none';
            // 儲存成功後重新整理資料，讓下拉選單顯示最新內容
            this.refreshData();
        },

        // 儲存「寫作範本」：驗證輸入後，以 upsert 方式寫入 writer_samples 資料表
        async saveSample() {
            const name = document.getElementById('ws-sample-name').value.trim();
            const content = document.getElementById('ws-sample-content').value.trim();
            if (!name || !content) return alert('請輸入名稱與內容');

            const sb = window.SupabaseClient.getClient();
            const { error } = await sb.from('writer_samples').upsert({ name, content, updated_at: new Date() });
            if (error) return alert('儲存失敗: ' + error.message);

            alert('儲存成功');
            document.getElementById('ws-sample-modal').style.display = 'none';
            // 儲存成功後重新整理資料，讓下拉選單顯示最新內容
            this.refreshData();
        },

        // 開啟「寫作風格」彈窗（供外部模組呼叫）
        // 參數 currentName：若有帶入目前已選取的風格名稱，會自動選取該項目並帶出其內容
        openStyleModal(currentName) {
            document.getElementById('ws-style-modal').style.display = 'flex';
            if (currentName) {
                document.getElementById('ws-style-select').value = currentName;
                const item = this.styleList.find(i => i.name === currentName);
                if (item) {
                    document.getElementById('ws-style-name').value = item.name;
                    document.getElementById('ws-style-content').value = item.content;
                }
            }
        },

        // 開啟「寫作範本」彈窗（供外部模組呼叫）
        // 參數 currentName：若有帶入目前已選取的範本名稱，會自動選取該項目並帶出其內容
        openSampleModal(currentName) {
            document.getElementById('ws-sample-modal').style.display = 'flex';
            if (currentName) {
                document.getElementById('ws-sample-select').value = currentName;
                const item = this.sampleList.find(i => i.name === currentName);
                if (item) {
                    document.getElementById('ws-sample-name').value = item.name;
                    document.getElementById('ws-sample-content').value = item.content;
                }
            }
        },

        // 取得當前選中的內容（支援多個 ws-style-dropdown，自動合併不重複的風格內容）
        // 回傳格式：{ style: 合併後的風格內容字串或null, sample: 選取的範本內容字串或null }
        // 此方法供外部模組（如小說編輯器）呼叫，用來取得目前應套用的寫作風格與範本文字
        getSelectedContext() {
            // 收集所有 ws-style-dropdown 選單中非空的風格，合併去重
            const styleSelects = document.querySelectorAll('.ws-style-dropdown');
            const sampleSel = document.querySelector('.ws-sample-dropdown');

            const styleParts = [];
            styleSelects.forEach(sel => {
                if (!sel.value) return; // 該選單未選取任何風格，跳過
                const item = this.styleList.find(i => i.name === sel.value);
                // 找到對應資料且內容不重複時才加入，避免多個選單選到同一風格時內容重複合併
                if (item && item.content && !styleParts.includes(item.content)) {
                    styleParts.push(item.content);
                }
            });

            // 範本只取單一下拉選單的選取值
            const sampleName = sampleSel ? sampleSel.value : '';
            const sample = this.sampleList.find(i => i.name === sampleName);

            return {
                // 若有選取任一風格，將所有風格內容以空白行分隔後合併為一段文字；否則回傳 null
                style: styleParts.length > 0 ? styleParts.join('\n\n') : null,
                sample: sample ? sample.content : null
            };
        }
    };

    // 將模組掛載到全域 window，供其他 script 直接呼叫 WriterSettingsApp 的方法
    window.WriterSettingsApp = WriterSettingsApp;
    // 頁面完全載入後才初始化模組（確保注入的 DOM 元素可被正確操作）
    window.addEventListener('load', () => WriterSettingsApp.init());
})();
