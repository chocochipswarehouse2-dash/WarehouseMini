const { createClient } = require('@supabase/supabase-js');
const url = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const key = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';
const supabase = createClient(url, key);

async function testResilientUpload() {
  const { data: sampleRows } = await supabase.from('master_produk').select('*').limit(400);
  if (!sampleRows || !sampleRows.length) return;

  const total = sampleRows.length;
  console.log(`Testing resilient batch upload with ${total} items...`);

  const CHUNK_SIZE = 200;
  let uploaded = 0;

  async function uploadSlice(slice, fromIdx, attempt = 1) {
    try {
      const res = await fetch(`${url}/rest/v1/master_produk?on_conflict=sku`, {
        method: 'POST',
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
        body: JSON.stringify(slice),
      });

      if (!res.ok) {
        const errText = await res.text();
        if ((errText.includes('57014') || errText.includes('timeout') || res.status >= 500) && slice.length > 50) {
          console.warn(`Timeout on chunk (${fromIdx} - ${fromIdx + slice.length}), auto-splitting...`);
          const mid = Math.floor(slice.length / 2);
          await uploadSlice(slice.slice(0, mid), fromIdx, 1);
          await uploadSlice(slice.slice(mid), fromIdx + mid, 1);
          return;
        }

        if (attempt <= 3) {
          console.warn(`Attempt ${attempt} failed, retrying in ${attempt * 500}ms...`);
          await new Promise((r) => setTimeout(r, attempt * 500));
          return uploadSlice(slice, fromIdx, attempt + 1);
        }

        throw new Error(`Gagal upload chunk (${fromIdx} - ${fromIdx + slice.length}): ${errText}`);
      }

      uploaded += slice.length;
      console.log(`Uploaded ${uploaded}/${total} (${Math.round((uploaded/total)*100)}%)`);
    } catch (err) {
      if (err.message && (err.message.includes('57014') || err.message.includes('timeout')) && slice.length > 50) {
        console.warn(`Timeout caught on chunk (${fromIdx} - ${fromIdx + slice.length}), auto-splitting...`);
        const mid = Math.floor(slice.length / 2);
        await uploadSlice(slice.slice(0, mid), fromIdx, 1);
        await uploadSlice(slice.slice(mid), fromIdx + mid, 1);
        return;
      }
      if (attempt <= 3) {
        console.warn(`Attempt ${attempt} network error, retrying in ${attempt * 500}ms...`);
        await new Promise((r) => setTimeout(r, attempt * 500));
        return uploadSlice(slice, fromIdx, attempt + 1);
      }
      throw err;
    }
  }

  for (let i = 0; i < total; i += CHUNK_SIZE) {
    const chunk = sampleRows.slice(i, i + CHUNK_SIZE);
    await uploadSlice(chunk, i);
  }

  console.log('All chunks uploaded successfully!');
}

testResilientUpload();
