// ============================================================================
// modal_focus_helper.js
// 統一處理所有 `.modal-overlay` 彈窗開啟時的鍵盤便利性：
//   1. 彈窗開啟時，自動 focus 第一個可見、可編輯的輸入欄
//      （input[type=text|password|number|email|search|tel|url]、textarea）
//   2. 若彈窗僅有「單一密碼輸入框」，按 Enter 等同點擊主要「確定/送出」按鈕
// 實作方式：MutationObserver 監聽 `.hidden` class 的移除，一次 setup 全站
// ============================================================================
// 使用 IIFE（立即執行函式）包裹，避免污染全域命名空間
(function initModalFocusHelper() {
    'use strict';

    // CSS 選擇器字串，列出所有視為「文字輸入欄位」的元素型別
    // （select/checkbox/radio/file 不算「文字輸入」，故排除在外）
    const FOCUSABLE_SELECTOR = [
        'input[type="text"]',
        'input[type="password"]',
        'input[type="number"]',
        'input[type="email"]',
        'input[type="search"]',
        'input[type="tel"]',
        'input[type="url"]',
        'input:not([type])',
        'textarea'
    ].join(',');

    // 函式：在指定的 modal 內尋找主要「確認」按鈕
    // 尋找順序（優先權由高到低）：
    //   1. class 含 .btn-modal.primary 的按鈕（最常見的主要按鈕命名方式）
    //   2. id 內含 "-ok" 的按鈕
    //   3. id 內含 "-confirm" 的按鈕
    //   4. class 含 .primary-btn 的按鈕（備援命名方式）
    // 只要其中一種選擇器命中就直接回傳，找不到則回傳 null（querySelector 找不到時的預設值）
    function findConfirmButton(modal) {
        return modal.querySelector('.btn-modal.primary')
            || modal.querySelector('button[id*="-ok"]')
            || modal.querySelector('button[id*="-confirm"]')
            || modal.querySelector('button.primary-btn');
    }

    // 函式：判斷此 modal 是否為「僅有單一密碼輸入框」的彈窗
    // 用途：這類彈窗（例如輸入密碼確認）按 Enter 應直接視為送出，不需要再去點按鈕
    function isSinglePasswordModal(modal) {
        // 取得 modal 內所有符合 FOCUSABLE_SELECTOR 的輸入欄位
        const inputs = modal.querySelectorAll(FOCUSABLE_SELECTOR);
        // 條件一：輸入欄位數量必須「剛好是 1 個」，否則不算單一密碼框彈窗
        if (inputs.length !== 1) return false;
        // 條件二：這唯一的輸入欄位型別必須是 password
        return inputs[0].matches('input[type="password"]');
    }

    // 函式：在 modal 內找出「第一個」可見、未被停用（disabled）、未唯讀（readonly）的輸入欄
    // 用於彈窗開啟時自動把游標 focus 上去，方便使用者不用手動點擊就能直接輸入
    function findFirstFocusable(modal) {
        // 依 DOM 順序取得所有候選輸入欄位
        const candidates = modal.querySelectorAll(FOCUSABLE_SELECTOR);
        for (const el of candidates) {
            // 略過已停用或唯讀的欄位（這些欄位無法輸入，focus 沒有意義）
            if (el.disabled || el.readOnly) continue;
            // 略過隱藏元素：offsetParent 為 null 代表此元素目前未顯示於畫面上
            // （例如 display:none 或祖先元素被隱藏），但 type=hidden 的輸入本身就設計成不可見，故排除此判斷
            if (el.offsetParent === null && el.type !== 'hidden') continue;
            // 找到第一個符合條件的欄位就立刻回傳，不再繼續尋找
            return el;
        }
        // 找不到任何可 focus 的欄位時回傳 null
        return null;
    }

    // 函式：彈窗「開啟」時要執行的處理邏輯
    // 主要做兩件事：
    //   1. 自動 focus 第一個可輸入欄位
    //   2. 若為單一密碼框彈窗，額外綁定 Enter 鍵 = 點擊確認按鈕
    function onModalOpen(modal) {
        // 使用 requestAnimationFrame 延遲到下一個畫面更新前才執行，
        // 確保瀏覽器已完成版面配置（layout），避免 focus 在元素尚未渲染完成時失效
        requestAnimationFrame(() => {
            const target = findFirstFocusable(modal);
            if (target) {
                // 嘗試 focus 該欄位，並若支援 select() 則一併選取欄位內文字（方便使用者直接覆寫輸入）
                // 用 try/catch 包住是為了避免部分瀏覽器或元素狀態下 focus/select 拋出例外導致整體流程中斷
                try { target.focus(); target.select && target.select(); } catch (_) {}
            }
            // 若此彈窗屬於「僅單一密碼輸入框」類型，額外綁定 Enter 鍵行為
            if (isSinglePasswordModal(modal)) {
                const pwdInput = modal.querySelector('input[type="password"]');
                // 使用自訂旗標 _enterBound 避免重複綁定同一個事件監聽器
                // （因為 onModalOpen 每次彈窗開啟都會被呼叫，若不做防呆會重複綁定造成按一次 Enter 觸發多次點擊）
                if (pwdInput && !pwdInput._enterBound) {
                    pwdInput._enterBound = true;
                    pwdInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            // 阻止瀏覽器預設行為（例如表單自動送出），改由我們手動觸發確認按鈕
                            e.preventDefault();
                            const btn = findConfirmButton(modal);
                            if (btn) btn.click();
                        }
                    });
                }
            }
        });
    }

    // 函式：對單一 modal 元素設置監聽，偵測其「開啟」狀態
    // 判斷依據：modal 是否帶有 .hidden 這個 class（有 .hidden 代表關閉，移除後代表開啟）
    function observeModal(modal) {
        // 情境一：頁面載入當下 modal 就已經是開啟狀態（未帶 .hidden），此時也要立即觸發一次處理
        if (!modal.classList.contains('hidden')) onModalOpen(modal);
        // 情境二：使用 MutationObserver 持續監看該 modal 的屬性變化，
        // 只要偵測到 class 屬性有變動，就重新檢查是否已移除 .hidden（代表被開啟）
        const mo = new MutationObserver(() => {
            if (!modal.classList.contains('hidden')) onModalOpen(modal);
        });
        // 設定觀察目標與範圍：只關注 attributes 變化，且僅限 class 屬性，效能較佳
        mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
    }

    // 函式：初始化進入點，找出頁面上所有的彈窗（.modal-overlay），逐一套用監聽邏輯
    function setup() {
        document.querySelectorAll('.modal-overlay').forEach(observeModal);
    }

    // 進入點判斷：
    // 若目前文件仍在載入中（DOM 尚未建構完成），等待 DOMContentLoaded 事件後才執行 setup
    // 否則（表示 script 是在 DOM 已就緒後才被載入）直接立即執行 setup
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
