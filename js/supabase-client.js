import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// kaikomziu.github.io は全ゲーム共通オリジンで localStorage を共有するため、
// 他ゲームの認証セッションを拾わないよう persistSession等を無効化しanonキーを強制する
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { headers: { Authorization: 'Bearer ' + SUPABASE_ANON_KEY } },
});
