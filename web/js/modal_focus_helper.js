// ============================================================================
// modal_focus_helper.js
// 統一處理所有 `.modal-overlay` 彈窗開啟時的鍵盤便利性：
//   1. 彈窗開啟時，自動 focus 第一個可見、可編輯的輸入欄
//      （input[type=text|password|number|email|search|tel|url]、textarea）
//   2. 若彈窗僅有「單一密碼輸入框」，按 Enter 等同點擊主要「確定/送出」按鈕
// 實作方式：MutationObserver 監聽 `.hidden` class 的移除，一次 setup 全站
// ============================================================================
(function initModalFocusHelper() {
    'use strict';

    // 可 focus 的輸入型別（select/checkbox/radio/file 不算「文字輸入」，故排除）
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

    // 主要「確認」按鈕候選：優先 .btn-modal.primary，再退回常見 id 命名
    function findConfirmButton(modal) {
        return modal.querySelector('.btn-modal.primary')
            || modal.querySelector('button[id*="-ok"]')
            || modal.querySelector('button[id*="-confirm"]')
            || modal.querySelector('button.primary-btn');
    }

    // 是否為「僅單一密碼框」的彈窗
    function isSinglePasswordModal(modal) {
        const inputs = modal.querySelectorAll(FOCUSABLE_SELECTOR);
        if (inputs.length !== 1) return false;
        return inputs[0].matches('input[type="password"]');
    }

    // 找出第一個可見、未 disabled、未 readonly 的輸入欄
    function findFirstFocusable(modal) {
        const candidates = modal.querySelectorAll(FOCUSABLE_SELECTOR);
        for (const el of candidates) {
            if (el.disabled || el.readOnly) continue;
            // 隱藏元素跳過（style.display=none 或 hidden 屬性）
            if (el.offsetParent === null && el.type !== 'hidden') continue;
            return el;
        }
        return null;
    }

    // 彈窗開啟事件：focus + （必要時）綁定 Enter→確認
    function onModalOpen(modal) {
        // 用 requestAnimationFrame 確保 layout 完成後再 focus
        requestAnimationFrame(() => {
            const target = findFirstFocusable(modal);
            if (target) {
                try { target.focus(); target.select && target.select(); } catch (_) {}
            }
            // 單一密碼框彈窗：Enter = 確認
            if (isSinglePasswordModal(modal)) {
                const pwdInput = modal.querySelector('input[type="password"]');
                if (pwdInput && !pwdInput._enterBound) {
                    pwdInput._enterBound = true;
                    pwdInput.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            const btn = findConfirmButton(modal);
                            if (btn) btn.click();
                        }
                    });
                }
            }
        });
    }

    // 對每個 modal 監聽 class 屬性變化：hidden 被移除 → 視為開啟
    function observeModal(modal) {
        // 若初始就已開啟（未帶 .hidden），也觸發一次
        if (!modal.classList.contains('hidden')) onModalOpen(modal);
        const mo = new MutationObserver(() => {
            if (!modal.classList.contains('hidden')) onModalOpen(modal);
        });
        mo.observe(modal, { attributes: true, attributeFilter: ['class'] });
    }

    function setup() {
        document.querySelectorAll('.modal-overlay').forEach(observeModal);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', setup);
    } else {
        setup();
    }
})();
