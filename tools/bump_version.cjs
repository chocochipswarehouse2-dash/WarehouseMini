#!/usr/bin/env node
/**
 * WMS Auto-Version & Release Notes Synchronizer
 * Atomically bumps version & updates release metadata across:
 *   1. package.json
 *   2. src/config/appVersion.ts (including VERSION_HISTORY)
 *   3. public/version.json
 *
 * Usage:
 *   node tools/bump_version.cjs --title "WMS v2.5.2 — ..." --notes "Catatan 1|Catatan 2|Catatan 3"
 *   node tools/bump_version.cjs --sync-only
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PKG_PATH = path.join(ROOT, 'package.json');
const APP_VER_PATH = path.join(ROOT, 'src', 'config', 'appVersion.ts');
const PUB_VER_PATH = path.join(ROOT, 'public', 'version.json');

const MONTHS_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

function formatIndonesianDate(d = new Date()) {
  return `${d.getDate()} ${MONTHS_ID[d.getMonth()]} ${d.getFullYear()}`;
}

function formatShortDateStamp(d = new Date()) {
  const yy = String(d.getFullYear()).slice(-2);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

function parseArgs(argv) {
  const args = { syncOnly: false, bump: 'patch', version: null, title: null, notes: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--sync-only') args.syncOnly = true;
    else if (a === '--minor') args.bump = 'minor';
    else if (a === '--major') args.bump = 'major';
    else if (a === '--version' && argv[i + 1]) args.version = argv[++i];
    else if (a === '--title' && argv[i + 1]) args.title = argv[++i];
    else if (a === '--notes' && argv[i + 1]) args.notes = argv[++i];
  }
  return args;
}

function parseCurrentVersionInfo() {
  if (fs.existsSync(PUB_VER_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(PUB_VER_PATH, 'utf8'));
    } catch {}
  }
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  const verStr = pkg.version.startsWith('v') ? pkg.version : `v${pkg.version}`;
  const nums = verStr.replace(/^v/i, '').split('.').map(n => parseInt(n, 10) || 0);
  const code = (nums[0] || 0) * 100 + (nums[1] || 0) * 10 + (nums[2] || 0);
  return {
    version: verStr,
    versionCode: code,
    buildDate: formatIndonesianDate(),
    buildHash: `wms-${formatShortDateStamp()}-v${code}`,
    releaseTitle: `WMS ${verStr}`,
    releaseNotes: ['Pembaruan stabilitas dan peningkatan performa sistem gudang.'],
    minSupportedVersion: 'v2.0.0'
  };
}

function parseExistingHistory() {
  if (!fs.existsSync(APP_VER_PATH)) return [];
  try {
    const raw = fs.readFileSync(APP_VER_PATH, 'utf8');
    const match = raw.match(/export const VERSION_HISTORY:\s*VersionInfo\[\]\s*=\s*(\[[\s\S]*?\]);/);
    if (match && match[1]) {
      return JSON.parse(match[1]);
    }
  } catch {}
  return [];
}

function incrementSemver(ver, bumpType = 'patch') {
  const clean = String(ver || 'v2.5.1').replace(/^v/i, '').split('-')[0];
  const parts = clean.split('.').map(n => parseInt(n, 10) || 0);
  while (parts.length < 3) parts.push(0);
  if (bumpType === 'major') {
    parts[0] += 1;
    parts[1] = 0;
    parts[2] = 0;
  } else if (bumpType === 'minor') {
    parts[1] += 1;
    parts[2] = 0;
  } else {
    parts[2] += 1;
  }
  return {
    semver: parts.join('.'),
    version: `v${parts.join('.')}`,
    versionCode: parts[0] * 100 + parts[1] * 10 + parts[2]
  };
}

function run() {
  const args = parseArgs(process.argv);
  const current = parseCurrentVersionInfo();
  let history = parseExistingHistory();

  if (args.syncOnly) {
    fs.writeFileSync(PUB_VER_PATH, JSON.stringify(current, null, 2) + '\n', 'utf8');
    console.log(`[VERSION SYNC] public/version.json synchronized at ${current.version} (${current.buildHash})`);
    return;
  }

  // Archive current version into VERSION_HISTORY if not already present
  if (current && current.version) {
    history = [current, ...history.filter(h => h.version !== current.version)].slice(0, 8);
  }

  let nextVerObj;
  if (args.version) {
    const clean = args.version.replace(/^v/i, '');
    const parts = clean.split('.').map(n => parseInt(n, 10) || 0);
    nextVerObj = {
      semver: clean,
      version: `v${clean}`,
      versionCode: (parts[0] || 0) * 100 + (parts[1] || 0) * 10 + (parts[2] || 0)
    };
  } else {
    nextVerObj = incrementSemver(current.version, args.bump);
  }

  const now = new Date();
  const buildDate = formatIndonesianDate(now);
  const shortStamp = formatShortDateStamp(now);
  const timeSuffix = `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
  const buildHash = `wms-${shortStamp}-v${nextVerObj.versionCode}-${timeSuffix}`;

  const rawTitle = args.title
    ? (args.title.includes(nextVerObj.version) ? args.title : `WMS ${nextVerObj.version} — ${args.title.replace(/^WMS\s+v[\d.]+\s*[—-]\s*/i, '')}`)
    : `WMS ${nextVerObj.version} — Pembaruan Sistem & Optimasi Operasional`;

  const releaseNotes = args.notes
    ? args.notes.split('|').map(s => s.trim()).filter(Boolean)
    : current.releaseNotes;

  const nextInfo = {
    version: nextVerObj.version,
    versionCode: nextVerObj.versionCode,
    buildDate,
    buildHash,
    releaseTitle: rawTitle,
    releaseNotes,
    minSupportedVersion: current.minSupportedVersion || 'v2.0.0'
  };

  // Remove nextVersion from history if re-bumping same version
  history = history.filter(h => h.version !== nextInfo.version);

  // 1. Update package.json
  const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
  pkg.version = nextVerObj.semver;
  fs.writeFileSync(PKG_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf8');

  // 2. Update public/version.json
  fs.writeFileSync(PUB_VER_PATH, JSON.stringify(nextInfo, null, 2) + '\n', 'utf8');

  // 3. Update src/config/appVersion.ts
  const tsContent = `/**
 * App Version & Release Configuration
 * Single Source of Truth for WMS Application Version
 * Auto-managed by tools/bump_version.cjs
 */

export interface VersionInfo {
  version: string;
  versionCode: number;
  buildDate: string;
  buildHash: string;
  releaseTitle: string;
  releaseNotes: string[];
  minSupportedVersion?: string;
}

export const CURRENT_APP_VERSION_INFO: VersionInfo = ${JSON.stringify(nextInfo, null, 2)};

export const VERSION_HISTORY: VersionInfo[] = ${JSON.stringify(history, null, 2)};

export const CURRENT_APP_VERSION = CURRENT_APP_VERSION_INFO.version;

/**
 * Compare two semver-like strings (e.g. 'v2.5.1' vs 'v2.5.2')
 * Returns:
 *   1 if v1 > v2
 *  -1 if v1 < v2
 *   0 if v1 === v2
 */
export function compareVersions(v1: string, v2: string): number {
  const clean = (v: string) => v.replace(/^v/i, '').split('-')[0].split('.').map(n => parseInt(n, 10) || 0);
  const p1 = clean(v1);
  const p2 = clean(v2);

  const len = Math.max(p1.length, p2.length);
  for (let i = 0; i < len; i++) {
    const num1 = p1[i] || 0;
    const num2 = p2[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export function isNewerVersion(
  serverVersion: string,
  clientVersion: string = CURRENT_APP_VERSION,
  serverBuildHash?: string,
  clientBuildHash: string = CURRENT_APP_VERSION_INFO.buildHash
): boolean {
  if (!serverVersion) return false;
  const cmp = compareVersions(serverVersion, clientVersion);
  if (cmp > 0) return true;
  if (cmp === 0 && serverBuildHash && clientBuildHash && serverBuildHash !== clientBuildHash) {
    return true;
  }
  return false;
}
`;

  fs.writeFileSync(APP_VER_PATH, tsContent, 'utf8');
  console.log(`[VERSION BUMP] ${current.version} -> ${nextInfo.version} (${nextInfo.buildHash})`);
  console.log(`[RELEASE TITLE] ${nextInfo.releaseTitle}`);
}

run();

