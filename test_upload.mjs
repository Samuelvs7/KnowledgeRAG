import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://lpiqkhwzvakhuanogwvj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2U86G7MYOWj_PY0JtzgCmA_mbrcRdK9';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const email = `test_${Date.now()}@example.com`;
  const password = "Password123!";
  
  console.log("Signing up user:", email);
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password
  });
  
  if (authError) {
    console.error("Auth error:", authError);
    return;
  }
  
  const user = authData.user;
  console.log("Logged in user:", user.id);
  
  const storagePath = `${user.id}/test_${Date.now()}.txt`;
  console.log("Testing storage upload to", storagePath);
  
  const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, 'test content');
  if (uploadError) {
    console.error("Storage upload error:", uploadError.message || uploadError);
  } else {
    console.log("Storage upload success!");
  }
  
  console.log("Testing DB insert");
  const { error: insertError } = await supabase.from('documents').insert({
    user_id: user.id,
    title: 'Test',
    description: 'test',
    file_type: 'text/plain',
    file_size: 10,
    file_url: storagePath
  });
  
  if (insertError) {
    console.error("DB insert error:", insertError.message || insertError);
  } else {
    console.log("DB insert success!");
  }
}

run();
