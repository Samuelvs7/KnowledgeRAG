import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lpiqkhwzvakhuanogwvj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2U86G7MYOWj_PY0JtzgCmA_mbrcRdK9';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const email = `test_${Date.now()}@example.com`;
  const password = "Password123!";
  
  const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
  const user = authData.user;
  
  const { error: insertError } = await supabase.from('documents').insert({
    user_id: user.id,
    title: 'Test',
    description: 'test',
    file_type: 'text/plain',
    file_size: 10,
    file_url: 'fake/path.txt'
  });
  
  console.log("DB insert error object:");
  console.log(JSON.stringify(insertError, null, 2));
}

run();
