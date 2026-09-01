// Supabase 服务端 client：service key 仅存在于函数端环境变量
import { createClient } from '@supabase/supabase-js';

let client = null;

export function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
      throw new Error('缺少环境变量 SUPABASE_URL / SUPABASE_SERVICE_KEY');
    }
    // service_role 绕过 RLS，因为口令门已在函数层统一校验
    client = createClient(url, key);
  }
  return client;
}
