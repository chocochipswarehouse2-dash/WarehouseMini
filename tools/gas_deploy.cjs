const fs = require('fs');

const SCRIPT_ID = '1kxPONxg5JyJKzrHg2EApt9K8c9nK6hccygtny2jf69JtgKIoVauTgDEU';

async function getAccessToken() {
  const clasprc = JSON.parse(fs.readFileSync('C:/Users/Chocochips Warehouse/.clasprc.json', 'utf8'));
  const def = clasprc.tokens.default;

  if (def.expiry_date && def.expiry_date > Date.now() + 60000 && def.access_token) {
    return def.access_token;
  }

  console.log('🔄 Merefresh Google OAuth access token...');
  const params = new URLSearchParams();
  params.append('client_id', def.client_id);
  params.append('client_secret', def.client_secret);
  params.append('refresh_token', def.refresh_token);
  params.append('grant_type', 'refresh_token');

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params
  });
  const data = await res.json();
  if (!data.access_token) {
    throw new Error('Gagal merefresh Google OAuth token: ' + JSON.stringify(data));
  }

  def.access_token = data.access_token;
  def.expiry_date = Date.now() + (data.expires_in * 1000);
  fs.writeFileSync('C:/Users/Chocochips Warehouse/.clasprc.json', JSON.stringify(clasprc, null, 2), 'utf8');
  return def.access_token;
}

async function runPushAndDeploy() {
  const token = await getAccessToken();
  const headers = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json'
  };

  // 1. Ambil konten project saat ini dari cloud
  console.log('1. Mengambil file project dari Google Apps Script...');
  const getRes = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/content`, { headers });
  const proj = await getRes.json();
  if (!proj.files) {
    throw new Error('Gagal membaca project content: ' + JSON.stringify(proj));
  }

  // 2. Perbarui SupabaseBridge, WmsAuth, Wmsupdatedatabase
  console.log('2. Memperbarui Supabase credentials di file GAS...');
  let bridgeUpdated = false;
  let authUpdated = false;
  let updateDbUpdated = false;

  const NEW_URL = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
  const NEW_KEY = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';

  let stockOpnameUpdated = false;

  for (const file of proj.files) {
    if (file.name === 'SupabaseBridge') {
      file.source = file.source.replace(
        /const SUPABASE_URL\s*=\s*["'][^"']+["'];/,
        `const SUPABASE_URL = "${NEW_URL}";`
      );
      file.source = file.source.replace(
        /const SUPABASE_ANON_KEY\s*=\s*["'][^"']+["'];/,
        `const SUPABASE_ANON_KEY = "${NEW_KEY}";`
      );
      bridgeUpdated = true;
    }
    if (file.name === 'WmsAuth') {
      file.source = file.source.replace(
        /https:\/\/vxongwtxmhjixhzeoidp\.supabase\.co/g,
        NEW_URL
      );
      authUpdated = true;
    }
    if (file.name === 'Wmsupdatedatabase') {
      file.source = file.source.replace(
        /https:\/\/vxongwtxmhjixhzeoidp\.supabase\.co/g,
        NEW_URL
      );
      updateDbUpdated = true;
    }
    if (file.name === 'Stockopname') {
      // Hilangkan pemanggilan simpanSesiOpnameInternal agar GAS tidak melakukan kalkulasi stok atau query lambat
      if (file.source.includes('simpanSesiOpnameInternal(itemsOpnameFisik, operator, true)')) {
        file.source = file.source.replace(
          /const hasilOpname = simpanSesiOpnameInternal\(itemsOpnameFisik, operator, true\);[\s\S]*?debugLog\("prosesStockOpname", "invoice=" \+ invoice \+ " hasil simpanSesiOpnameInternal=" \+ JSON\.stringify\(hasilOpname\)\);/,
          '// Kalkulasi Stock Opname sepenuhnya didelegasikan ke Supabase (stok_real_fisik)\n      debugLog("prosesStockOpname", "invoice=" + invoice + " log_produk berhasil dicatat ke Supabase. Kalkulasi didelegasikan ke Supabase.");'
        );
        stockOpnameUpdated = true;
      }
    }
  }

  console.log(`- SupabaseBridge updated: ${bridgeUpdated}`);
  console.log(`- WmsAuth updated: ${authUpdated}`);
  console.log(`- Wmsupdatedatabase updated: ${updateDbUpdated}`);
  console.log(`- Stockopname calculation removed: ${stockOpnameUpdated}`);

  // 3. Push file-file yang telah diperbarui ke cloud
  console.log('\n3. Mengunggah (PUSH) pembaruan kode ke Google Apps Script...');
  const putRes = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/content`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ files: proj.files })
  });
  const putData = await putRes.json();
  if (!putData.files) {
    throw new Error('Gagal PUT project content: ' + JSON.stringify(putData));
  }
  console.log('✅ PUSH Berhasil! Kode terbaru sudah tersimpan di Google Apps Script.');

  // 4. Buat Versi Baru (Create Version)
  console.log('\n4. Membuat Versi Baru (Create Project Version)...');
  const versionRes = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/versions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      description: 'Update Supabase URL & Key to atdedxyiielpmzjlnriv via WMS Agent'
    })
  });
  const versionData = await versionRes.json();
  const versionNumber = versionData.versionNumber;
  console.log(`✅ Versi baru berhasil dibuat: Versi ${versionNumber}`);

  // 5. Cek deployments aktif
  console.log('\n5. Memeriksa Web App Deployment aktif...');
  const depRes = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/deployments`, { headers });
  const depData = await depRes.json();
  const deployments = depData.deployments || [];
  console.log(`Ditemukan ${deployments.length} deployment.`);

  const webAppDep = deployments.find(d => d.deploymentConfig && d.deploymentConfig.description !== undefined);
  if (webAppDep) {
    const depId = webAppDep.deploymentId;
    console.log(`Target deployment ID: ${depId}`);
    console.log(`Mengalihkan deployment ke Versi ${versionNumber}...`);

    const updateDepRes = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/deployments/${depId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        deploymentConfig: {
          scriptId: SCRIPT_ID,
          versionNumber: versionNumber,
          description: `Active Deployment (Version ${versionNumber}) - Connected to atdedxyiielpmzjlnriv`
        }
      })
    });
    const updateDepData = await updateDepRes.json();
    console.log('✅ DEPLOYMENT BERHASIL DIPERBARUI!');
    console.log(`Web App URL: https://script.google.com/macros/s/${depId}/exec`);
  } else {
    console.log('Tidak ditemukan deployment existing, membuat deployment baru...');
    const newDepRes = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/deployments`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        versionNumber: versionNumber,
        manifestFileName: 'appsscript',
        description: `WMS Webhook Auto-Deploy Version ${versionNumber}`
      })
    });
    const newDepData = await newDepRes.json();
    console.log('✅ Deployment baru berhasil dibuat:', newDepData);
  }

  console.log('\n🎉 SEMUA PROSES PUSH DAN DEPLOY KE GOOGLE APPS SCRIPT SELESAI 100%!');
}

runPushAndDeploy().catch(console.error);
