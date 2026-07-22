// ============================================================
// model_options_app.js
// 功能：AI大模型呼叫參數（如溫度、Top-K、Top-P 等）的設定彈窗。
// 提供使用者建立/編輯/儲存一組「模型參數表」，並存到 Supabase 的
// model_options 資料表，供其他模組（如聊天呼叫功能）讀取使用。
// ============================================================
document.addEventListener("DOMContentLoaded", () => {
    // 動態注入 modal（彈窗）所需的 HTML 結構與對應的 CSS 樣式，
    // 避免需要另外修改主頁面的 HTML 檔案。
    const modalHTML = `
    <style>
      .modal-LLM-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }
      .modal-LLM-overlay.hidden {
        display: none;
      }
      .modal-LLM {
        background: hsl(255, 30%, 10%);
        border: 1px solid hsla(266, 0%, 64%, 0.3);
        border-radius: 14px;
        padding: 24px;
        width: 900px;
        max-width: 95vw;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        color: #e0e0e0;
      }
      .modal-LLM h3 {
        font-size: 1.05rem;
        color: #a78bfa;
        margin-top: 0;
        margin-bottom: 16px;
      }
      .modal-LLM label {
        display: block;
        font-size: 1.2rem;
        color: #aaa;
        /* 避免文字太長自動換行，保持整齊 */
        white-space: pre-wrap;
        max-width: 100%;
        margin-bottom: 4px;
        margin-top: 10px;
      }
      .modal-LLM input, .modal-LLM select {
        width: 100%;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid hsla(266, 0%, 64%, 0.3);
        color: #fff;
        border-radius: 8px;
        padding: 7px 10px;
        font-size: 1.2rem;
        box-sizing: border-box;
      }
      .btn-modal-LLM {
        padding: 6px 16px;
        border-radius: 6px;
        font-size: 0.9rem;
        cursor: pointer;
        border: 1px solid hsla(266, 0%, 64%, 0.3);
      }
      .btn-modal-LLM.cancel {
        background: transparent;
        color: #ccc;
      }
      .btn-modal-LLM.primary {
        background: #a78bfa;
        color: #fff;
        border: none;
      }
    </style>
    <div class="modal-LLM-overlay hidden" id="modal-LLM-model-options">
      <div class="modal-LLM">
        <h2>⚙️ AI大模型呼叫參數</h2>
        
        <label>參數名稱 (Name)</label>
        <input type="text" id="mo-name" placeholder="LLM大模型參數表" value="LLM大模型參數表" style="width: 100%; margin-bottom: 10px; padding: 5px;">
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:30px;">
            <div>
                <label>逐字傳輸 (stream)</label>
                <select id="mo-stream" style="width: 100%; padding: 5px;">
                    <option value="true" selected>True (是)</option>
                    <option value="false">False (否)</option>
                </select>
            </div>
            <div>
                <label>溫度 (temperature)。預設0.85(0.1~3.0)，越高越有創意。</label>
                <input type="number" id="mo-temperature" step="0.01" value="0.85" style="width: 100%; padding: 5px;">
            </div>
            <div>
                <label>最大Token數 (num_predict)，預設-1表示無上限，建議值:2048(2~32768)。</label>
                <input type="number" id="mo-num-predict" value="-1" style="width: 100%; padding: 5px;">
            </div>
            <div>
                <label>上下文視窗 (num_ctx)，預設4096(1024~262144)，每個模型上限不同。</label>
                <input type="number" id="mo-num-ctx" value="4096" style="width: 100%; padding: 5px;">
            </div>
            <div>
                <label>重複懲罰 (repeat_penalty)。預設1.1(1~2)，減少重複]</label>
                <input type="number" id="mo-repeat-penalty" step="0.01" value="1.1" style="width: 100%; padding: 5px;">
            </div>
            <div>
                <label>取樣數量(Top K)。預設40(1~100)，從機率最高的 K 個 token 中選擇，越高越有創意。</label>
                <input type="number" id="mo-top-k" value="40" style="width: 100%; padding: 5px;">
            </div>
            <div>
                <label>機率累積取樣(Top P)。預設0.9(0.1~1)，從機率累積和達到 P 的 token 中選擇，越高越有創意。</label>
                <input type="number" id="mo-top-p" step="0.01" value="0.9" style="width: 100%; padding: 5px;">
            </div>
        </div>

        <div class="modal-LLM-actions" style="margin-top:20px; display: flex; gap: 10px; justify-content: flex-end;">
          <button class="btn-modal-LLM cancel" id="btn-mo-cancel" style="padding: 5px 15px;">取消</button>
          <button class="btn-modal-LLM primary" id="btn-mo-save" style="padding: 5px 15px;">儲存設定</button>
        </div>
      </div>
    </div>
    `;
    // 將上面組好的 modal HTML 字串插入到 <body> 的最後面，完成畫面元素的建立。
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // 取得頁面上與此功能相關的關鍵 DOM 元素：
    // btnAdd  - 用來開啟「新增/編輯模型參數」彈窗的按鈕
    // selectEl - 頁面上選擇「使用哪一組模型參數」的下拉選單
    // modal    - 剛剛注入的彈窗本體（含遮罩層）
    const btnAdd = document.getElementById('btn-add-model-option');
    const selectEl = document.getElementById('model-options-select');
    const modal = document.getElementById('modal-LLM-model-options');

    // 儲存從資料庫載入的所有模型參數表（每一筆為一組完整的呼叫參數）。
    let modelOptionsList = [];

    // 暴露給外部（其他 js 檔案）取得目前下拉選單所選中的模型參數。
    // 若沒有選擇任何參數表，或找不到對應資料，則回傳 null，
    // 讓呼叫端可自行套用預設參數。
    // 依名稱解析一組模型參數（供彈窗等「獨立下拉選單」使用，不受頁面全域選單影響）。
    // 找不到或名稱為空則回傳 null，讓呼叫端自行套用預設參數。
    window.resolveModelOptionsByName = function (name) {
        if (!name) return null;
        const opt = modelOptionsList.find(o => o.name === name);
        if (!opt) return null;
        // 只回傳實際呼叫 LLM API 時需要用到的欄位（排除 id、name 等資料庫專屬欄位）
        return {
            stream: opt.stream,
            temperature: opt.temperature,
            num_predict: opt.num_predict,
            num_ctx: opt.num_ctx,
            repeat_penalty: opt.repeat_penalty,
            top_k: opt.top_k,
            top_p: opt.top_p
        };
    };

    // 取得所有已儲存模型參數的名稱清單（供彈窗動態產生下拉選項）。
    window.getModelOptionsList = function () {
        return modelOptionsList.map(o => o.name);
    };

    window.getModelOptionsPayload = function () {
        return window.resolveModelOptionsByName(selectEl?.value);
    };

    // 從 Supabase 的 model_options 資料表載入所有已儲存的模型參數表，
    // 並依名稱排序後，重新產生下拉選單的選項內容。
    async function loadModelOptions() {
        // 若 Supabase 尚未初始化完成（連線物件不存在），則先不執行，
        // 交由下方的 tryLoad() 輪詢機制稍後重試。
        if (!window.SupabaseClient || !window.SupabaseClient.getClient()) return;
        const sb = window.SupabaseClient.getClient();
        const { data, error } = await sb.from('model_options').select('*').order('name');
        if (!error && data) {
            modelOptionsList = data;
            if (selectEl) {
                // 記住目前選單所選的值，重建選項後嘗試還原原本的選擇，
                // 避免每次重新載入都跳回「預設」。
                const currentVal = selectEl.value;
                selectEl.innerHTML = '<option value="">預設</option>' + data.map(o => `<option value="${o.name}">${o.name}</option>`).join('');
                if (data.some(o => o.name === currentVal)) selectEl.value = currentVal;
            }
        }
    }

    // 點擊「新增/編輯模型參數」按鈕時：
    // 1. 若下拉選單目前已選擇某組已存在的參數表，則將該參數表的內容
    //    填入彈窗中的各個欄位，讓使用者可以編輯後覆蓋儲存。
    // 2. 若目前未選擇任何參數表（表示要新增一組），則將所有欄位
    //    還原成程式內建的預設值。
    // 最後打開（顯示）彈窗。
    if (btnAdd) {
        btnAdd.addEventListener('click', () => {
            const val = selectEl?.value;
            if (val) {
                // 編輯模式：找出對應的既有參數，並回填到表單欄位
                const opt = modelOptionsList.find(o => o.name === val);
                if (opt) {
                    document.getElementById('mo-name').value = opt.name;
                    document.getElementById('mo-stream').value = opt.stream ? "true" : "false";
                    document.getElementById('mo-temperature').value = opt.temperature;
                    document.getElementById('mo-num-predict').value = opt.num_predict;
                    document.getElementById('mo-num-ctx').value = opt.num_ctx;
                    document.getElementById('mo-repeat-penalty').value = opt.repeat_penalty;
                    document.getElementById('mo-top-k').value = opt.top_k;
                    document.getElementById('mo-top-p').value = opt.top_p;
                }
            } else {
                // 新增模式：套用預設參數值
                document.getElementById('mo-name').value = "LLM大模型參數表";
                document.getElementById('mo-stream').value = "true";
                document.getElementById('mo-temperature').value = "0.85";
                document.getElementById('mo-num-predict').value = "-1";
                document.getElementById('mo-num-ctx').value = "4096";
                document.getElementById('mo-repeat-penalty').value = "1.1";
                document.getElementById('mo-top-k').value = "40";
                document.getElementById('mo-top-p').value = "0.9";
            }
            // 移除 'hidden' class，讓遮罩層與彈窗顯示出來
            modal.classList.remove('hidden');
        });
    }

    // 「取消」按鈕：直接關閉彈窗，不做任何儲存動作。
    document.getElementById('btn-mo-cancel').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    // 「儲存設定」按鈕：讀取表單中所有欄位的值，組成 payload 物件，
    // 並以「名稱（name）」為唯一鍵，寫入（新增或更新）到 Supabase 的
    // model_options 資料表中。
    document.getElementById('btn-mo-save').addEventListener('click', async () => {
        const name = document.getElementById('mo-name').value.trim();
        // 名稱為必填欄位，用來當作資料表的識別鍵（upsert 的 onConflict 依據）
        if (!name) { alert('請輸入參數名稱'); return; }

        // 組合要送到資料庫的完整參數物件；數值欄位需轉型
        // （parseFloat / parseInt），避免存成字串型別。
        const payload = {
            name: name,
            stream: document.getElementById('mo-stream').value === 'true',
            temperature: parseFloat(document.getElementById('mo-temperature').value),
            num_predict: parseInt(document.getElementById('mo-num-predict').value),
            num_ctx: parseInt(document.getElementById('mo-num-ctx').value),
            repeat_penalty: parseFloat(document.getElementById('mo-repeat-penalty').value),
            top_k: parseInt(document.getElementById('mo-top-k').value),
            top_p: parseFloat(document.getElementById('mo-top-p').value)
        };

        const sb = window.SupabaseClient.getClient();
        if (!sb) { alert('Supabase未連線'); return; }

        // 以 name 欄位為衝突判斷依據執行 upsert：
        // 若資料庫已有同名參數表，則更新該筆資料；否則新增一筆。
        const { error } = await sb.from('model_options').upsert(payload, { onConflict: 'name' });
        if (error) {
            alert('儲存失敗: ' + error.message);
        } else {
            // 儲存成功後：關閉彈窗、重新載入最新的參數清單，
            // 並將下拉選單自動選回剛剛儲存的這組參數名稱。
            modal.classList.add('hidden');
            await loadModelOptions();
            if (selectEl) selectEl.value = name;
        }
    });

    // 嘗試載入模型參數清單。
    // 因為 Supabase 客戶端可能是由其他 js 檔案非同步初始化，
    // 此處若尚未就緒，就每隔 500 毫秒重試一次，直到連線物件可用為止。
    const tryLoad = () => {
        if (window.SupabaseClient && window.SupabaseClient.getClient()) {
            loadModelOptions();
        } else {
            setTimeout(tryLoad, 500);
        }
    };
    tryLoad();
});
