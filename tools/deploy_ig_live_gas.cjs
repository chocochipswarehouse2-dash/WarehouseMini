const fs = require('fs');
const path = require('path');
const os = require('os');

const SCRIPT_ID = '1niTufmejkWtUnCCfStve3mvLMQakZEZ7eCJ27wehHWmC8nPkkSwyDW4A';
const DEPLOYMENT_ID = 'AKfycbyCAAs6oYeW1TJKq3mq_C2Lt1SxoVzVg2yeS8atAHlDsip5jDWQ2aJpRQ66oKPQdhU7dw';

function getClasprcPath() {
  const p1 = 'C:/Users/Chocochips Warehouse/.clasprc.json';
  if (fs.existsSync(p1)) return p1;
  const p2 = path.join(os.homedir(), '.clasprc.json');
  if (fs.existsSync(p2)) return p2;
  return p1;
}

async function getAccessToken() {
  const targetPath = getClasprcPath();
  const clasprc = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  const def = clasprc.tokens.default;

  if (def.expiry_date && def.expiry_date > Date.now() + 60000 && def.access_token) {
    return def.access_token;
  }

  console.log('Refreshing token...');
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
  if (!data.access_token) throw new Error('Refresh failed: ' + JSON.stringify(data));

  def.access_token = data.access_token;
  def.expiry_date = Date.now() + (data.expires_in * 1000);
  fs.writeFileSync(targetPath, JSON.stringify(clasprc, null, 2), 'utf8');
  return def.access_token;
}

async function deploy() {
  console.log('🚀 Starting IG Live GAS Deployment...');
  console.log(`Script ID: ${SCRIPT_ID}`);
  console.log(`Deployment ID: ${DEPLOYMENT_ID}`);

  const token = await getAccessToken();
  const headers = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  const codeSource = fs.readFileSync(path.join(__dirname, '../gas/ig_live_backend.js'), 'utf8');
  const manifestSource = JSON.stringify({
    timeZone: "Asia/Jakarta",
    dependencies: {},
    exceptionLogging: "STACKDRIVER",
    runtimeVersion: "V8",
    webapp: {
      executeAs: "USER_DEPLOYING",
      access: "ANYONE_ANONYMOUS"
    }
  }, null, 2);

  const files = [
    {
      name: 'appsscript',
      type: 'JSON',
      source: manifestSource
    },
    {
      name: 'Code',
      type: 'SERVER_JS',
      source: codeSource
    }
  ];

  // 1. PUT project content
  console.log('1. Mengunggah source Code ke Apps Script project...');
  const putRes = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/content`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ files })
  });
  const putData = await putRes.json();
  if (!putData.files) {
    throw new Error('Gagal PUT project content: ' + JSON.stringify(putData));
  }
  console.log('✅ Source Code berhasil diunggah.');

  // 2. Create version
  console.log('2. Membuat Versi Baru...');
  const verRes = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/versions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ description: 'WMS IG Live Backend: Two-Way Sync, doGet & doPost API' })
  });
  const verData = await verRes.json();
  if (!verData.versionNumber) {
    throw new Error('Gagal membuat versi: ' + JSON.stringify(verData));
  }
  const newVersion = verData.versionNumber;
  console.log(`✅ Versi baru dibuat: Version ${newVersion}`);

  // 3. Update active deployment
  console.log(`3. Memperbarui Deployment Aktif (${DEPLOYMENT_ID}) ke Versi ${newVersion}...`);
  const depRes = await fetch(`https://script.googleapis.com/v1/projects/${SCRIPT_ID}/deployments/${DEPLOYMENT_ID}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      deploymentConfig: {
        scriptId: SCRIPT_ID,
        versionNumber: newVersion,
        manifestFileName: 'appsscript',
        description: `WMS IG Live Backend Live Version ${newVersion}`
      }
    })
  });
  const depData = await depRes.json();
  if (!depData.deploymentId) {
    throw new Error('Gagal update deployment: ' + JSON.stringify(depData));
  }
  console.log(`✅ Deployment berhasil diperbarui ke Versi ${newVersion}!`);
  console.log(`Web App URL: https://script.google.com/macros/s/${DEPLOYMENT_ID}/exec`);
}

deploy().catch(err => {
  console.error('❌ Deployment error:', err);
  process.exit(1);
});
