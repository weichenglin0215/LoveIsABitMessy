/**
 * Supabase 客戶端封裝（前端用）
 * - 目的：讓後台管理頁可自動初始化、並在「已登入過」時自動登入（利用 Supabase session 持久化）。
 *
 * 注意：
 * - 這裡只能放「Project URL + Anon(Publishable) Key」，不可放 service_role key。
 * - 第一次仍需要人工登入/註冊；之後會自動使用既有 session。
 */
// 使用立即執行函式（IIFE）包裹，避免內部變數（如 client、SUPABASE_URL 等）污染全域命名空間
(function () {
  'use strict'; // 啟用嚴格模式，提早捕捉潛在的語法錯誤與不安全寫法

  // ==========================================
  // 請在此處填寫您的 Supabase 專案網址與公用金鑰
  // ==========================================
  // SUPABASE_URL：Supabase 專案的 API 網址（每個專案唯一）
  const SUPABASE_URL = 'https://tpdznlutkzeficitudac.supabase.co';
  // SUPABASE_KEY：Supabase 的 anon（公開）金鑰，僅具有受 RLS（Row Level Security）限制的權限，
  // 可安全放在前端程式碼中；切勿放置 service_role 金鑰（該金鑰擁有完整權限，一旦外洩風險極高）。
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZHpubHV0a3plZmljaXR1ZGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzI2NTMsImV4cCI6MjA5MTgwODY1M30.Cid4HYePpAHA0oYffdm_5ZlthWt_nyAPpFjFcy4hsik';

  // client：模組內部快取的 Supabase 客戶端實體（單例模式），初始為 null，
  // 第一次呼叫 init() 成功後會被賦值，之後重複呼叫 init() 不會重新建立，避免重複初始化造成的資源浪費。
  let client = null;

  // SupabaseClient：對外暴露的物件，提供 init（初始化）與 getClient（取得客戶端實體）兩個方法。
  const SupabaseClient = {
    // init：初始化 Supabase 客戶端。
    // 用途：檢查 Supabase SDK 是否已載入、URL/Key 是否已設定，並建立（或重用）client 實體。
    // 回傳值：true 表示初始化成功（或已初始化過），false 表示失敗（呼叫端可改用手動輸入方式作為備援）。
    init: function () {
      // 檢查全域是否存在 window.supabase（代表 Supabase 官方 SDK <script> 是否已成功載入）
      if (typeof window.supabase === 'undefined') {
        console.warn('Supabase SDK 未載入');
        return false;
      }
      // 檢查必要的設定值（URL、Key）是否都已填寫，避免用空值去建立客戶端
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.warn('Supabase URL 或 Key 未設定（將使用頁面上的手動輸入作為備援）');
        return false;
      }
      // 僅在尚未建立過 client 時才建立，確保整個頁面只有一個 Supabase 客戶端實體（單例）
      if (!client) {
        try {
          // 呼叫 Supabase SDK 提供的 createClient 建立客戶端，
          // 該客戶端會自動利用瀏覽器的儲存機制（如 localStorage）持久化登入 session，
          // 因此使用者第一次登入後，之後重新整理頁面也能維持登入狀態。
          client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        } catch (e) {
          // 建立失敗時（例如網路異常、SDK 版本不相容等），印出錯誤訊息並回傳 false
          console.error('初始化 Supabase 失敗:', e);
          return false;
        }
      }
      return true;
    },

    // getClient：取得目前的 Supabase 客戶端實體。
    // 用途：外部呼叫此方法即可拿到可用的 client，不需要自行判斷是否已初始化，
    // 內部會先呼叫 this.init() 確保客戶端已建立（若尚未建立則嘗試建立）。
    // 回傳值：Supabase 客戶端物件；若初始化失敗（SDK 未載入或設定缺漏），則回傳 null。
    getClient: function () {
      this.init();
      return client;
    }
  };

  // 將 SupabaseClient 掛載到全域 window 物件上，讓其他頁面/腳本可直接透過 window.SupabaseClient 使用
  window.SupabaseClient = SupabaseClient;
})();

