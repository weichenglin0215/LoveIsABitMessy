/**
 * 響應式版面系統 - 5:8 寬高比
 * 確保所有畫面保持固定比例並自動縮放適應任何瀏覽器尺寸
 */

(function () {
    'use strict';

    // 目標寬高比（寬 5：高 8）
    const TARGET_ASPECT_RATIO = 5 / 8; // 0.625

    /**
     * 計算並套用5:8寬高比的容器尺寸
     * 邏輯：依照目前視窗的寬高比，判斷要「以寬度為基準」還是「以高度為基準」
     * 來換算出容器的實際寬高，並把結果寫入 CSS 變數，讓畫面等比例縮放。
     */
    function applyAspectRatio() {
        // 取得所有需要套用響應式的容器（class="aspect-5-8"）
        const containers = document.querySelectorAll('.aspect-5-8');

        // 若頁面上沒有任何需要響應式的容器，直接結束，不做任何運算
        if (containers.length === 0) {
            return;
        }

        // 取得目前瀏覽器視窗的寬度與高度
        const windowWidth = window.innerWidth;
        const windowHeight = window.innerHeight;

        // 計算目前視窗的寬高比
        const windowAspectRatio = windowWidth / windowHeight;

        // 宣告容器最終要使用的寬度與高度
        let containerWidth, containerHeight;

        // 根據視窗比例決定以哪個維度為基準
        if (windowAspectRatio < TARGET_ASPECT_RATIO) {
            // 視窗更窄（典型的行動裝置），以寬度為基準，高度依比例增長
            containerWidth = windowWidth;
            containerHeight = windowWidth / TARGET_ASPECT_RATIO;
        } else {
            // 視窗更寬（電腦端或橫向平版）
            // 為了不讓畫面太過「頂天立地」，我們設定最大高度為視窗的 95%
            // （註：目前係數為 1.0，維持與原始程式碼相同的計算結果，不修改邏輯）
            containerHeight = windowHeight * 1.0;
            containerWidth = containerHeight * TARGET_ASPECT_RATIO;

            // 如果寬度算出來竟然超過了視窗寬度（極少見），則以寬度為準，重新換算高度
            if (containerWidth > windowWidth * 1.0) {
                containerWidth = windowWidth * 1.0;
                containerHeight = containerWidth / TARGET_ASPECT_RATIO;
            }
        }

        // 將算好的寬高，透過 CSS 自訂變數（--responsive-width / --responsive-height）
        // 套用到每一個需要響應式的容器上
        containers.forEach(container => {
            container.style.setProperty('--responsive-width', `${containerWidth}px`);
            container.style.setProperty('--responsive-height', `${containerHeight}px`);
        });

        // --- 字體與 UI 等比例縮放實作 ---
        // 以 iPhone 原生基準高度 19.2rem 為 1.0 倍
        // 計算當前容器高度相對於 19.2rem 的縮放比例
        const fontScale = containerHeight / 640;

        // 將縮放比例套用到根節點 (html) 的字體大小
        // 預設 0.5rem * 縮放比例，這樣所有使用 rem 的單位都會跟著等比例縮放
        document.documentElement.style.fontSize = `${fontScale * 16}px`;
        // ------------------------------

        // 除錯資訊（可選，正式環境可移除）
        // 只有在全域變數 window.DEBUG_RESPONSIVE 為真時，才會在主控台印出詳細計算結果
        if (window.DEBUG_RESPONSIVE) {
            console.log('Responsive Layout Applied:', {
                windowSize: `${windowWidth}x${windowHeight}`,
                windowAspectRatio: windowAspectRatio.toFixed(3),
                targetAspectRatio: TARGET_ASPECT_RATIO.toFixed(3),
                containerSize: `${containerWidth.toFixed(0)}x${containerHeight.toFixed(0)}`,
                basedOn: windowAspectRatio < TARGET_ASPECT_RATIO ? 'width' : 'height'
            });
        }
    }

    /**
     * 防抖（debounce）函式 - 避免resize事件時頻繁觸發計算，造成效能問題
     * 原理：每次呼叫都會重新計時，只有在停止觸發 wait 毫秒之後，才會真正執行 func
     * @param {Function} func 要延遲執行的函式
     * @param {number} wait 延遲時間（毫秒），預設100ms
     * @returns {Function} 包裝過的防抖函式
     */
    function debounce(func, wait = 100) {
        let timeout; // 用來記錄目前的計時器編號
        return function executedFunction(...args) {
            // 每次呼叫時，先清除前一次尚未執行的計時器
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            // 重新設定計時器，等待 wait 毫秒後才真正執行 func
            timeout = setTimeout(later, wait);
        };
    }

    /**
     * 初始化響應式系統
     * 會先立即套用一次比例，接著監聽視窗大小變化與裝置方向變化事件
     */
    function initResponsive() {
        // 立即套用一次響應式比例（避免畫面初始閃爍或未套用樣式）
        applyAspectRatio();

        // 監聽視窗大小變化（使用防抖，避免resize事件連續觸發造成效能問題）
        window.addEventListener('resize', debounce(applyAspectRatio, 100));

        // 監聽裝置方向變化（例如手機從直向轉橫向）
        window.addEventListener('orientationchange', () => {
            // 方向變化後稍微延遲，等待瀏覽器完成版面調整後再重新計算
            setTimeout(applyAspectRatio, 200);
        });
    }

    /**
     * 為動態建立的元素套用響應式
     * 供外部程式呼叫，例如遊戲覆蓋層（overlay）顯示時，
     * 可主動呼叫此函式重新計算並套用比例
     */
    window.updateResponsiveLayout = function () {
        applyAspectRatio();
    };

    // 判斷 DOM 是否已載入完成，決定何時開始初始化
    if (document.readyState === 'loading') {
        // DOM尚未載入完成，等待 DOMContentLoaded 事件觸發後再初始化
        document.addEventListener('DOMContentLoaded', initResponsive);
    } else {
        // DOM已經載入完成，直接初始化
        initResponsive();
    }

    // 使用 MutationObserver 監聽DOM變化（當有新的 .aspect-5-8 元素被動態加入時）
    // 目的：確保之後動態插入的容器也能即時套用正確的響應式比例
    const observer = new MutationObserver((mutations) => {
        let shouldUpdate = false; // 標記本次DOM變化是否需要重新計算比例

        mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
                // 情況一：有新增或移除子節點
                mutation.addedNodes.forEach((node) => {
                    if (node.nodeType === 1) { // 只處理元素節點（排除文字節點等）
                        // 檢查新增的節點本身是否具有 aspect-5-8 class
                        if (node.classList && node.classList.contains('aspect-5-8')) {
                            shouldUpdate = true;
                        }
                        // 檢查新增節點的子孫元素中，是否含有 aspect-5-8 的容器
                        const children = node.querySelectorAll && node.querySelectorAll('.aspect-5-8');
                        if (children && children.length > 0) {
                            shouldUpdate = true;
                        }
                    }
                });
            } else if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                // 情況二：某元素的 class 屬性被改變，且改變後含有 aspect-5-8
                if (mutation.target.classList.contains('aspect-5-8')) {
                    shouldUpdate = true;
                }
            }
        });

        // 若偵測到需要更新，重新計算並套用響應式比例
        if (shouldUpdate) {
            applyAspectRatio();
        }
    });

    // 開始觀察整個 document.body，監控子節點增減與 class 屬性的變化
    observer.observe(document.body, {
        childList: true,      // 監聽子節點的新增/移除
        subtree: true,        // 連同所有子孫節點一併監聽
        attributes: true,     // 監聽屬性變化
        attributeFilter: ['class']  // 只關心 class 屬性的變化，減少不必要的觸發
    });

})();

