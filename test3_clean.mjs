import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';

const SUPABASE_URL = 'https://lpiqkhwzvakhuanogwvj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2U86G7MYOWj_PY0JtzgCmA_mbrcRdK9';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function run() {
  const result = {};
  try {
    const email = `test_${Date.now()}@example.com`;
    const password = "Password123!";
    
    result.signup = "attempting";
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) throw authError;
    const user = authData.user;
    result.signup = "success, user: " + user.id;
    
    result.storage = "attempting";
    const storagePath = `${user.id}/test_${Date.now()}.txt`;
    const { error: uploadError } = await supabase.storage.from('documents').upload(storagePath, 'test content');
    if (uploadError) {
        result.storage = uploadError;
    } else {
        result.storage = "success";
    }
    
    result.db = "attempting";
    const { error: insertError } = await supabase.from('documents').insert({
      user_id: user.id,
      title: 'Test',
      description: 'test',
      file_type: 'text/plain',
      file_size: 10,
      file_url: storagePath
    }).select().single();
    
    if (insertError) {
        result.db = insertError;
    } else {
        result.db = "success";
    }
  } catch (err) {
      result.error = err;
  }
  
  fs.writeFileSync('test3_output.json', JSON.stringify(result, null, 2));
}

run();
