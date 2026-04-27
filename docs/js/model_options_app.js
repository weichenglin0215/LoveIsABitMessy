document.addEventListener("DOMContentLoaded", () => {
    // 注入 Modal HTML 與 CSS
    const modalHTML = `
    <style>
      .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      }
      .modal-overlay.hidden {
        display: none;
      }
      .modal {
        background: hsl(255, 30%, 10%);
        border: 1px solid hsla(266, 0%, 64%, 0.3);
        border-radius: 14px;
        padding: 24px;
        width: 500px;
        max-width: 95vw;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
        color: #e0e0e0;
      }
      .modal h3 {
        font-size: 1.05rem;
        color: #a78bfa;
        margin-top: 0;
        margin-bottom: 16px;
      }
      .modal label {
        display: block;
        font-size: 0.8rem;
        color: #aaa;
        margin-bottom: 4px;
        margin-top: 10px;
      }
      .modal input, .modal select {
        width: 100%;
        background: rgba(0, 0, 0, 0.4);
        border: 1px solid hsla(266, 0%, 64%, 0.3);
        color: #fff;
        border-radius: 8px;
        padding: 7px 10px;
        font-size: 0.88rem;
        box-sizing: border-box;
      }
      .btn-modal {
        padding: 6px 16px;
        border-radius: 6px;
        font-size: 0.9rem;
        cursor: pointer;
        border: 1px solid hsla(266, 0%, 64%, 0.3);
      }
      .btn-modal.cancel {
        background: transparent;
        color: #ccc;
      }
      .btn-modal.primary {
        background: #a78bfa;
        color: #fff;
        border: none;
      }
    </style>
    <div class="modal-overlay hidden" id="modal-model-options">
      <div class="modal">
        <h3>⚙️ AI大模型呼叫參數</h3>
        
        <label>參數名稱 (Name)</label>
        <input type="text" id="mo-name" placeholder="LLM大模型參數表" value="LLM大模型參數表" style="width: 100%; margin-bottom: 10px; padding: 5px;">
        
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
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

        <div class="modal-actions" style="margin-top:20px; display: flex; gap: 10px; justify-content: flex-end;">
          <button class="btn-modal cancel" id="btn-mo-cancel" style="padding: 5px 15px;">取消</button>
          <button class="btn-modal primary" id="btn-mo-save" style="padding: 5px 15px;">儲存設定</button>
        </div>
      </div>
    </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    const btnAdd = document.getElementById('btn-add-model-option');
    const selectEl = document.getElementById('model-options-select');
    const modal = document.getElementById('modal-model-options');

    let modelOptionsList = [];

    // 暴露給外部取得目前的參數
    window.getModelOptionsPayload = function () {
        const val = selectEl?.value;
        if (!val) return null;
        const opt = modelOptionsList.find(o => o.name === val);
        if (!opt) return null;
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

    async function loadModelOptions() {
        if (!window.SupabaseClient || !window.SupabaseClient.getClient()) return;
        const sb = window.SupabaseClient.getClient();
        const { data, error } = await sb.from('model_options').select('*').order('name');
        if (!error && data) {
            modelOptionsList = data;
            if (selectEl) {
                const currentVal = selectEl.value;
                selectEl.innerHTML = '<option value="">預設</option>' + data.map(o => `<option value="${o.name}">${o.name}</option>`).join('');
                if (data.some(o => o.name === currentVal)) selectEl.value = currentVal;
            }
        }
    }

    if (btnAdd) {
        btnAdd.addEventListener('click', () => {
            const val = selectEl?.value;
            if (val) {
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
                document.getElementById('mo-name').value = "LLM大模型參數表";
                document.getElementById('mo-stream').value = "true";
                document.getElementById('mo-temperature').value = "0.85";
                document.getElementById('mo-num-predict').value = "-1";
                document.getElementById('mo-num-ctx').value = "4096";
                document.getElementById('mo-repeat-penalty').value = "1.1";
                document.getElementById('mo-top-k').value = "40";
                document.getElementById('mo-top-p').value = "0.9";
            }
            modal.classList.remove('hidden');
        });
    }

    document.getElementById('btn-mo-cancel').addEventListener('click', () => {
        modal.classList.add('hidden');
    });

    document.getElementById('btn-mo-save').addEventListener('click', async () => {
        const name = document.getElementById('mo-name').value.trim();
        if (!name) { alert('請輸入參數名稱'); return; }

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

        // Upsert by name
        const { error } = await sb.from('model_options').upsert(payload, { onConflict: 'name' });
        if (error) {
            alert('儲存失敗: ' + error.message);
        } else {
            modal.classList.add('hidden');
            await loadModelOptions();
            if (selectEl) selectEl.value = name;
        }
    });

    // 嘗試載入
    const tryLoad = () => {
        if (window.SupabaseClient && window.SupabaseClient.getClient()) {
            loadModelOptions();
        } else {
            setTimeout(tryLoad, 500);
        }
    };
    tryLoad();
});
