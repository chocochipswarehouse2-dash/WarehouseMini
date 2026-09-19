const fs = require('fs');

const MAIN_SCRIPT_ID = '1kxPONxg5JyJKzrHg2EApt9K8c9nK6hccygtny2jf69JtgKIoVauTgDEU';
const WEBHOOK_SCRIPT_ID = '1EfZ76Hl-bJhwvfzWpBkMD2zR8YbEkeBRgkgD76NHv95_XeHwtfsruqmE';

const NEW_URL = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const NEW_KEY = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';

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

// -----------------------------------------------------------------------------
// 1. DEPLOY STANDALONE FONNTE WEBHOOK (1EfZ76...)
// -----------------------------------------------------------------------------
async function deployStandaloneWebhook(headers) {
  console.log('\n======================================================');
  console.log('📦 [1/2] DEPLOYING STANDALONE FONNTE WEBHOOK PROJECT');
  console.log(`Script ID: ${WEBHOOK_SCRIPT_ID}`);
  console.log('======================================================');

  const codeContent = fs.readFileSync('d:/Antigravity/WMS Inventory/gas/Code.js', 'utf8');
  const appsscriptJson = fs.readFileSync('d:/Antigravity/WMS Inventory/gas/appsscript.json', 'utf8');

  const files = [
    {
      name: 'appsscript',
      type: 'JSON',
      source: appsscriptJson
    },
    {
      name: 'Code',
      type: 'SERVER_JS',
      source: codeContent
    }
  ];

  // 1. PUT project content
  console.log('1. Mengunggah source Code.js ke Webhook project...');
  const putRes = await fetch(`https://script.googleapis.com/v1/projects/${WEBHOOK_SCRIPT_ID}/content`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ files })
  });
  const putData = await putRes.json();
  if (!putData.files) {
    throw new Error('Gagal PUT Webhook project: ' + JSON.stringify(putData));
  }
  console.log('✅ Source Code.js berhasil diunggah.');

  // 2. Create version
  console.log('2. Membuat Versi Baru...');
  const verRes = await fetch(`https://script.googleapis.com/v1/projects/${WEBHOOK_SCRIPT_ID}/versions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ description: 'WMS Webhook Auto-Deploy: Direct SO Calculation & Fast Batch Insert' })
  });
  const verData = await verRes.json();
  const verNum = verData.versionNumber;
  console.log(`✅ Webhook Versi baru berhasil dibuat: Versi ${verNum}`);

  // 3. Update all versioned deployments
  console.log('3. Memperbarui Deployment aktif...');
  const depRes = await fetch(`https://script.googleapis.com/v1/projects/${WEBHOOK_SCRIPT_ID}/deployments`, { headers });
  const depData = await depRes.json();
  const deployments = depData.deployments || [];

  const versionedDeps = deployments.filter(d => d.deploymentConfig && d.deploymentConfig.versionNumber !== undefined);
  for (const dep of versionedDeps) {
    const depId = dep.deploymentId;
    console.log(`Mengalihkan deployment ${depId} ke Versi ${verNum}...`);
    await fetch(`https://script.googleapis.com/v1/projects/${WEBHOOK_SCRIPT_ID}/deployments/${depId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        deploymentConfig: {
          scriptId: WEBHOOK_SCRIPT_ID,
          versionNumber: verNum,
          description: `Active Fonnte Webhook (Version ${verNum})`
        }
      })
    });
    console.log(`✅ Fonnte Webhook ${depId} aktif pada Versi ${verNum}!`);
    console.log(`URL: https://script.google.com/macros/s/${depId}/exec`);
  }

  return verNum;
}

// -----------------------------------------------------------------------------
// 2. DEPLOY MAIN SPREADSHEET BACKEND (1kxPONxg...)
// -----------------------------------------------------------------------------
async function deployMainBackend(headers) {
  console.log('\n======================================================');
  console.log('📦 [2/2] DEPLOYING MAIN WMS BACKEND PROJECT');
  console.log(`Script ID: ${MAIN_SCRIPT_ID}`);
  console.log('======================================================');

  console.log('1. Mengambil file project dari Google Apps Script...');
  const getRes = await fetch(`https://script.googleapis.com/v1/projects/${MAIN_SCRIPT_ID}/content`, { headers });
  const proj = await getRes.json();
  if (!proj.files) {
    throw new Error('Gagal membaca main project: ' + JSON.stringify(proj));
  }

  console.log('2. Memperbarui Supabase credentials & Handler di file GAS...');
  const fonnteHandlerCode = fs.readFileSync('d:/Antigravity/WMS Inventory/gas/fonnte_handler.js', 'utf8');

  for (const file of proj.files) {
    if (file.name === 'SupabaseBridge') {
      file.source = file.source.replace(/const SUPABASE_URL\s*=\s*["'][^"']+["'];/, `const SUPABASE_URL = "${NEW_URL}";`);
      file.source = file.source.replace(/const SUPABASE_ANON_KEY\s*=\s*["'][^"']+["'];/, `const SUPABASE_ANON_KEY = "${NEW_KEY}";`);
    }
    if (file.name === 'WmsAuth') {
      file.source = file.source.replace(/https:\/\/vxongwtxmhjixhzeoidp\.supabase\.co/g, NEW_URL);
    }
    if (file.name === 'Wmsupdatedatabase') {
      file.source = file.source.replace(/https:\/\/vxongwtxmhjixhzeoidp\.supabase\.co/g, NEW_URL);
    }
    if (file.name === 'fonnte_handler') {
      file.source = fonnteHandlerCode;
    }
    if (file.name === 'Stockopname') {
      if (file.source.includes('simpanSesiOpnameInternal(itemsOpnameFisik, operator, true)')) {
        file.source = file.source.replace(
          /const hasilOpname = simpanSesiOpnameInternal\(itemsOpnameFisik, operator, true\);[\s\S]*?debugLog\("prosesStockOpname", "invoice=" \+ invoice \+ " hasil simpanSesiOpnameInternal=" \+ JSON\.stringify\(hasilOpname\)\);/,
          '// Kalkulasi Stock Opname sepenuhnya didelegasikan ke Supabase (stok_real_fisik)\n      debugLog("prosesStockOpname", "invoice=" + invoice + " log_produk berhasil dicatat ke Supabase. Kalkulasi didelegasikan ke Supabase.");'
        );
      }
    }
  }

  console.log('3. Mengunggah (PUSH) kode terbaru ke main backend...');
  const putRes = await fetch(`https://script.googleapis.com/v1/projects/${MAIN_SCRIPT_ID}/content`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ files: proj.files })
  });
  const putData = await putRes.json();
  if (!putData.files) {
    throw new Error('Gagal PUT main project: ' + JSON.stringify(putData));
  }
  console.log('✅ PUSH main backend berhasil.');

  console.log('4. Membuat Versi Baru...');
  const verRes = await fetch(`https://script.googleapis.com/v1/projects/${MAIN_SCRIPT_ID}/versions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ description: 'WMS Backend Auto-Deploy: Direct SO Calculation & Fast Batch Insert' })
  });
  const verData = await verRes.json();
  const verNum = verData.versionNumber;
  console.log(`✅ Main Backend Versi baru berhasil dibuat: Versi ${verNum}`);

  console.log('5. Memperbarui Deployment aktif...');
  const depRes = await fetch(`https://script.googleapis.com/v1/projects/${MAIN_SCRIPT_ID}/deployments`, { headers });
  const depData = await depRes.json();
  const deployments = depData.deployments || [];

  const targetDep = deployments.find(d => d.deploymentConfig && d.deploymentConfig.versionNumber) || deployments[0];
  if (targetDep) {
    const depId = targetDep.deploymentId;
    console.log(`Target Deployment ID: ${depId}`);
    const updateRes = await fetch(`https://script.googleapis.com/v1/projects/${MAIN_SCRIPT_ID}/deployments/${depId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        deploymentConfig: {
          scriptId: MAIN_SCRIPT_ID,
          versionNumber: verNum,
          description: `Active Deployment (Version ${verNum})`
        }
      })
    });
    console.log(`✅ Main Backend aktif beralih ke Versi ${verNum}!`);
    console.log(`URL: https://script.google.com/macros/s/${depId}/exec`);
  }

  return verNum;
}

async function runPushAndDeploy() {
  const token = await getAccessToken();
  const headers = {
    Authorization: 'Bearer ' + token,
    'Content-Type': 'application/json'
  };

  const webhookVersion = await deployStandaloneWebhook(headers);
  const mainVersion = await deployMainBackend(headers);

  console.log('\n======================================================');
  console.log('🎉 SEMUA PROSES DEPLOY KE GOOGLE APPS SCRIPT SELESAI 100%!');
  console.log(`- Standalone Fonnte Webhook: Versi ${webhookVersion}`);
  console.log(`- Main WMS Backend: Versi ${mainVersion}`);
  console.log('======================================================');
}

runPushAndDeploy().catch(console.error);
