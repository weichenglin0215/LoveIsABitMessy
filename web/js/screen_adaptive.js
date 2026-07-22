/* ═══════════════════════════════════════════════════════
   screen_adaptive.js — 滿版縮放核心邏輯 + 業務邏輯

   設計邏輯尺寸（依長寬比 5:8.5）：
     DESIGN_W = 500px
     DESIGN_H = 850px

   縮放公式：
     scale = Math.min(視窗寬 / DESIGN_W, 視窗高 / DESIGN_H)

   為什麼用 visualViewport 而非 vw/vh？
     → zoom 後 vw 不變，但 visualViewport.width 反映真實可用寬度。
     → 手機軟鍵盤彈出時 visualViewport 會縮小，innerHeight 不一定會。

   字體為什麼在 stage 內用 px？
     → rem / em 受系統字體大小影響，
       系統字體放大 150% → rem 跟著放大 → 元件跑版。
     → px 在 transform:scale() 容器內是固定的邏輯像素，
       整體一起縮放，不受外部 rem 基準影響。
   ═══════════════════════════════════════════════════════ */

/* ─── 邏輯尺寸常數（修改這裡即可調整長寬比） ─── */
const DESIGN_W = 500; // 設計稿邏輯寬度（單位：px，非實際螢幕像素）
const DESIGN_H = 850; // 設計稿邏輯高度（單位：px，非實際螢幕像素）

/* ─── 取得舞台元素 ─── */
// stage：整個畫面的容器元素，所有內容都放在裡面，
// 透過 CSS transform:scale() 整體縮放以符合裝置視窗大小
const stage = document.getElementById('stage');

/**
 * applyScale()
 * 計算縮放比例並套用至 #stage
 * 同時更新右上角 debug 資訊（可移除）
 */
function applyScale() {
  /* 優先用 visualViewport（手機鍵盤彈出 / iOS Safari 縮放更精確） */
  // vw / vh：目前實際可視區域的寬與高（單位：px）
  const vw = window.visualViewport ? window.visualViewport.width : window.innerWidth;
  const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;

  /* 以「不超出畫面」為原則，取較小縮放值 */
  // scale：實際套用的縮放倍率，取寬、高兩者縮放比的較小值，
  // 確保縮放後的畫面完整顯示在可視範圍內，不會被裁切
  const scale = Math.min(vw / DESIGN_W, vh / DESIGN_H);

  // scaledW / scaledH：縮放後畫面實際佔用的寬與高（單位：px）
  const scaledW = DESIGN_W * scale;
  const scaledH = DESIGN_H * scale;

  /* 水平、垂直置中 */
  // left / top：將縮放後的畫面置中所需的偏移量
  const left = (vw - scaledW) / 2;
  const top = (vh - scaledH) / 2;

  // 套用縮放比例與置中位置至 #stage 元素
  stage.style.transform = `scale(${scale})`;
  stage.style.left = `${left}px`;
  stage.style.top = `${top}px`;

  /* Debug 資訊（可移除） */
  // 於畫面右上角顯示目前縮放倍率與視窗尺寸，方便開發時除錯，
  // 若找不到對應元素則略過（避免因元素不存在而報錯）
  const elScale = document.getElementById('info-scale');
  const elSize = document.getElementById('info-size');
  if (elScale) elScale.textContent = `×${scale.toFixed(3)}`;
  if (elSize) elSize.textContent = `${Math.round(vw)} × ${Math.round(vh)}`;
}

/* ─── 事件監聽 ─── */

/* 一般視窗大小改變（電腦調整視窗、旋轉裝置） */
window.addEventListener('resize', applyScale);

/* visualViewport 事件（手機鍵盤彈出 / iOS Safari 縮放列顯示/隱藏） */
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', applyScale);
  window.visualViewport.addEventListener('scroll', applyScale);
}

/* ─── 初始化：DOM 載入後立即執行 ─── */
document.addEventListener('DOMContentLoaded', applyScale);

/* ═══════════════════════════════════════════
   業務邏輯
   ═══════════════════════════════════════════ */

/**
 * setStatus(msg, type)
 * 更新狀態欄文字與樣式
 * @param {string} msg   - 顯示文字
 * @param {string} type  - '' | 'ok' | 'err'
 */
function setStatus(msg, type = '') {
  const el = document.getElementById('status-text');
  if (!el) return;
  el.textContent = msg;
  el.className = type;
}

/**
 * onSubmit()
 * 確認建立按鈕的處理函式
 */
function onSubmit() {
  // cls：使用者選擇的職業（下拉選單的值）
  const cls = document.getElementById('sel-class').value;
  // name：使用者輸入的角色名稱（去除前後空白）
  const name = document.getElementById('inp-name').value.trim();
  // story：使用者輸入的角色故事內容（去除前後空白，目前僅取用未做驗證）
  const story = document.getElementById('inp-story').value.trim();

  // 欄位驗證：未選擇職業則提示錯誤並中止
  if (!cls) { setStatus('❌ 請選擇職業', 'err'); return; }
  // 欄位驗證：未輸入角色名稱則提示錯誤並中止
  if (!name) { setStatus('❌ 請輸入角色名稱', 'err'); return; }

  // 驗證通過，顯示建立成功訊息
  setStatus(`✅ 角色「${name}」建立成功！`, 'ok');
}

/**
 * onReset()
 * 重置按鈕的處理函式
 */
function onReset() {
  document.getElementById('sel-class').value = '';
  document.getElementById('inp-name').value = '';
  document.getElementById('inp-story').value = '';
  setStatus('已重置，等待輸入…', '');
}