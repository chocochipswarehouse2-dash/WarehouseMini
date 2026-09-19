const fs = require('fs');

const MAIN_SCRIPT_ID = '1kxPONxg5JyJKzrHg2EApt9K8c9nK6hccygtny2jf69JtgKIoVauTgDEU';
const WEBHOOK_SCRIPT_ID = '1EfZ76Hl-bJhwvfzWpBkMD2zR8YbEkeBRgkgD76NHv95_XeHwtfsruqmE';

async function getAccessToken() {
  const clasprc = JSON.parse(fs.readFileSync('C:/Users/Chocochips Warehouse/.clasprc.json', 'utf8'));
  const def = clasprc.tokens.default;

  if (def.expiry_date && def.expiry_date > Date.now() + 60000 && def.access_token) {
    return def.access_token;
  }

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

async function checkProjectStatus(scriptId, label, token) {
  const headers = { Authorization: 'Bearer ' + token };
  const depRes = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/deployments`, { headers });
  const depData = await depRes.json();
  const deployments = depData.deployments || [];

  const activeDep = deployments.find(d => d.deploymentConfig && d.deploymentConfig.versionNumber) || deployments[0];
  const activeVersion = activeDep?.deploymentConfig?.versionNumber || 'Unknown';
  const depId = activeDep?.deploymentId || 'Unknown';

  const verRes = await fetch(`https://script.googleapis.com/v1/projects/${scriptId}/versions`, { headers });
  const verData = await verRes.json();
  const versions = verData.versions || [];
  const latestVersion = versions.length > 0 ? versions[versions.length - 1].versionNumber : activeVersion;

  console.log(`[GAS STATUS] ${label} (${scriptId})`);
  console.log(`[GAS STATUS] -> Active Deployment ID: ${depId}`);
  console.log(`[GAS STATUS] -> Active Version: ${activeVersion} (Latest Created: ${latestVersion})`);

  return { scriptId, label, activeVersion, latestVersion, depId };
}

async function checkGasStatus() {
  try {
    const token = await getAccessToken();
    const webhookStatus = await checkProjectStatus(WEBHOOK_SCRIPT_ID, 'Standalone Fonnte Webhook', token);
    const mainStatus = await checkProjectStatus(MAIN_SCRIPT_ID, 'Main WMS Backend', token);

    return {
      success: true,
      webhook: webhookStatus,
      main: mainStatus
    };
  } catch (err) {
    console.warn('[GAS STATUS WARNING] Tidak dapat memeriksa status GAS live:', err.message);
    return { success: false, error: err.message };
  }
}

if (require.main === module) {
  checkGasStatus();
}

module.exports = { checkGasStatus };
