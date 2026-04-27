/**
 * writer_settings_app.js — 知名作家寫作風格與範本管理模組
 */
'use strict';

(function() {
    const WriterSettingsApp = {
        styleList: [],
        sampleList: [],

        init() {
            this.injectHTML();
            this.setupListeners();
            this.refreshData();
        },

        injectHTML() {
            const html = `
            <!-- 寫作風格彈窗 -->
            <div id="ws-style-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10000; justify-content:center; align-items:center;">
                <div class="modal" style="background:#222; color:#eee; padding:20px; border-radius:8px; width:600px; max-width:90%; border:1px solid #444;">
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
                    <div style="margin-bottom:15px;">
                        <label>內容 (Markdown 格式)：</label>
                        <textarea id="ws-style-content" style="width:100%; height:300px; padding:8px; box-sizing:border-box; background:#333; color:white; border:1px solid #555; font-family:monospace; resize:vertical;"></textarea>
                    </div>
                    <div style="display:flex; justify-content:flex-end; gap:10px;">
                        <button id="ws-style-cancel" style="padding:8px 20px; background:#555; color:white; border:none; cursor:pointer; border-radius:4px;">取消</button>
                        <button id="ws-style-save" class="btn-primary" style="padding:8px 20px; border-radius:4px;">儲存設定</button>
                    </div>
                </div>
            </div>

            <!-- 寫作範本彈窗 -->
            <div id="ws-sample-modal" class="modal-overlay" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.7); z-index:10000; justify-content:center; align-items:center;">
                <div class="modal" style="background:#222; color:#eee; padding:20px; border-radius:8px; width:600px; max-width:90%; border:1px solid #444;">
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
                    <div style="margin-bottom:15px;">
                        <label>內容：</label>
                        <textarea id="ws-sample-content" style="width:100%; height:300px; padding:8px; box-sizing:border-box; background:#333; color:white; border:1px solid #555; font-family:monospace; resize:vertical;"></textarea>
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

        setupListeners() {
            // Style Modal
            document.getElementById('ws-style-cancel').onclick = () => document.getElementById('ws-style-modal').style.display = 'none';
            document.getElementById('ws-style-add-btn').onclick = () => {
                document.getElementById('ws-style-name').value = '';
                document.getElementById('ws-style-content').value = '';
                document.getElementById('ws-style-select').value = '';
            };
            document.getElementById('ws-style-select').onchange = (e) => {
                const item = this.styleList.find(i => i.name === e.target.value);
                if (item) {
                    document.getElementById('ws-style-name').value = item.name;
                    document.getElementById('ws-style-content').value = item.content;
                }
            };
            document.getElementById('ws-style-save').onclick = () => this.saveStyle();

            // Sample Modal
            document.getElementById('ws-sample-cancel').onclick = () => document.getElementById('ws-sample-modal').style.display = 'none';
            document.getElementById('ws-sample-add-btn').onclick = () => {
                document.getElementById('ws-sample-name').value = '';
                document.getElementById('ws-sample-content').value = '';
                document.getElementById('ws-sample-select').value = '';
            };
            document.getElementById('ws-sample-select').onchange = (e) => {
                const item = this.sampleList.find(i => i.name === e.target.value);
                if (item) {
                    document.getElementById('ws-sample-name').value = item.name;
                    document.getElementById('ws-sample-content').value = item.content;
                }
            };
            document.getElementById('ws-sample-save').onclick = () => this.saveSample();
        },

        async refreshData() {
            const sb = window.SupabaseClient ? window.SupabaseClient.getClient() : null;
            if (!sb) return;

            // Styles
            const { data: styles } = await sb.from('writer_styles').select('*').order('name');
            this.styleList = styles || [];
            this.updateDropdowns('ws-style-select', this.styleList, 'ws-style-dropdown');

            // Samples
            const { data: samples } = await sb.from('writer_samples').select('*').order('name');
            this.sampleList = samples || [];
            this.updateDropdowns('ws-sample-select', this.sampleList, 'ws-sample-dropdown');
        },

        updateDropdowns(modalSelectId, list, pageSelectClass) {
            const options = ['<option value="">無</option>', ...list.map(i => `<option value="${i.name}">${i.name}</option>`)].join('');
            document.getElementById(modalSelectId).innerHTML = options;
            
            // 更新頁面上的下拉選單
            document.querySelectorAll('.' + pageSelectClass).forEach(sel => {
                const currentVal = sel.value;
                sel.innerHTML = options;
                sel.value = currentVal;
            });
        },

        async saveStyle() {
            const name = document.getElementById('ws-style-name').value.trim();
            const content = document.getElementById('ws-style-content').value.trim();
            if (!name || !content) return alert('請輸入名稱與內容');

            const sb = window.SupabaseClient.getClient();
            const { error } = await sb.from('writer_styles').upsert({ name, content, updated_at: new Date() });
            if (error) return alert('儲存失敗: ' + error.message);

            alert('儲存成功');
            document.getElementById('ws-style-modal').style.display = 'none';
            this.refreshData();
        },

        async saveSample() {
            const name = document.getElementById('ws-sample-name').value.trim();
            const content = document.getElementById('ws-sample-content').value.trim();
            if (!name || !content) return alert('請輸入名稱與內容');

            const sb = window.SupabaseClient.getClient();
            const { error } = await sb.from('writer_samples').upsert({ name, content, updated_at: new Date() });
            if (error) return alert('儲存失敗: ' + error.message);

            alert('儲存成功');
            document.getElementById('ws-sample-modal').style.display = 'none';
            this.refreshData();
        },

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

        // 取得當前選中的內容
        getSelectedContext() {
            const styleSel = document.querySelector('.ws-style-dropdown');
            const sampleSel = document.querySelector('.ws-sample-dropdown');
            
            const styleName = styleSel ? styleSel.value : '';
            const sampleName = sampleSel ? sampleSel.value : '';
            
            const style = this.styleList.find(i => i.name === styleName);
            const sample = this.sampleList.find(i => i.name === sampleName);
            
            return {
                style: style ? style.content : null,
                sample: sample ? sample.content : null
            };
        }
    };

    window.WriterSettingsApp = WriterSettingsApp;
    window.addEventListener('load', () => WriterSettingsApp.init());
})();
