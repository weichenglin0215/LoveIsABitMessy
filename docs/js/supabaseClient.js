/**
 * Supabase 客戶端封裝（前端用）
 * - 目的：讓後台管理頁可自動初始化、並在「已登入過」時自動登入（利用 Supabase session 持久化）。
 *
 * 注意：
 * - 這裡只能放「Project URL + Anon(Publishable) Key」，不可放 service_role key。
 * - 第一次仍需要人工登入/註冊；之後會自動使用既有 session。
 */
(function () {
  'use strict';

  // ==========================================
  // 請在此處填寫您的 Supabase 專案網址與公用金鑰
  // ==========================================
  const SUPABASE_URL = 'https://tpdznlutkzeficitudac.supabase.co';
  const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwZHpubHV0a3plZmljaXR1ZGFjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyMzI2NTMsImV4cCI6MjA5MTgwODY1M30.Cid4HYePpAHA0oYffdm_5ZlthWt_nyAPpFjFcy4hsik';

  let client = null;

  const SupabaseClient = {
    init: function () {
      if (typeof window.supabase === 'undefined') {
        console.warn('Supabase SDK 未載入');
        return false;
      }
      if (!SUPABASE_URL || !SUPABASE_KEY) {
        console.warn('Supabase URL 或 Key 未設定（將使用頁面上的手動輸入作為備援）');
        return false;
      }
      if (!client) {
        try {
          client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        } catch (e) {
          console.error('初始化 Supabase 失敗:', e);
          return false;
        }
      }
      return true;
    },

    getClient: function () {
      this.init();
      return client;
    }
  };

  window.SupabaseClient = SupabaseClient;
})();

