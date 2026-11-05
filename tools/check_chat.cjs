const { createClient } = require('@supabase/supabase-js');
const s = createClient(
  'https://ilhqerecxbywqrhfpbbc.supabase.co',
  'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn'
);

async function check() {
  const { data, error } = await s
    .from('wms_system_docs')
    .select('section_id,doc_key,updated_at,content')
    .like('section_id', 'wms_chat%');

  if (error) {
    console.error('ERROR:', error);
    return;
  }
  console.log('Total chat docs:', data.length);
  for (const row of data) {
    console.log('\n--- Doc:', row.section_id, 'Updated:', row.updated_at);
    if (row.section_id.includes('msgs')) {
      const msgs = typeof row.content === 'string' ? JSON.parse(row.content) : row.content;
      console.log('Messages count:', msgs?.length);
      const lastFew = (msgs || []).slice(-10);
      for (const m of lastFew) {
        console.log(` - [${m.sender_username}] (${m.created_at}) text: "${m.text || ''}" | attachment: ${m.attachment_url || 'NONE'}`);
      }
    }
  }
}
check();
