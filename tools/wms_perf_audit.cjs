#!/usr/bin/env node
/**
 * WMS Frontend Performance & Anti-Freeze Static Auditor CLI
 *
 * Usage:
 *   node tools/wms_perf_audit.cjs scan --target src --limit 50 --output perf_audit.json
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const args = {
    subcommand: null,
    target: 'src',
    limit: null,
    output: null
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === 'scan') {
      args.subcommand = 'scan';
    } else if (a === '--target' && argv[i + 1]) {
      args.target = argv[++i];
    } else if (a === '--limit' && argv[i + 1]) {
      args.limit = parseInt(argv[++i], 10);
    } else if (a === '--output' && argv[i + 1]) {
      args.output = argv[++i];
    }
  }
  return args;
}

function collectSourceFiles(dirOrFile, list = []) {
  const full = path.resolve(ROOT, dirOrFile);
  if (!fs.existsSync(full)) return list;
  const stat = fs.statSync(full);
  if (stat.isFile()) {
    if (full.endsWith('.ts') || full.endsWith('.tsx')) list.push(full);
    return list;
  }
  for (const entry of fs.readdirSync(full, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const child = path.join(full, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(child, list);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      list.push(child);
    }
  }
  return list;
}

function getLineNumber(content, index) {
  return content.slice(0, index).split(/\r?\n/).length;
}

function auditFile(filePath) {
  const relPath = path.relative(ROOT, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf8');
  const findings = [];

  // 1. Check LINEAR_CATALOG_FIND: productCatalog.find( or productCatalog?.find(
  const catalogFindRegex = /\bproductCatalog(?:\?)?\.find\s*\(/g;
  let match;
  while ((match = catalogFindRegex.exec(content)) !== null) {
    findings.push({
      rule: 'LINEAR_CATALOG_FIND',
      severity: 'HIGH',
      file: relPath,
      line: getLineNumber(content, match.index),
      message: 'Linear O(N) productCatalog.find() over 28,000 SKUs detected. Use O(1) buildProductLookupMap(productCatalog).get(sku) instead.'
    });
  }

  // 2. Check UNGUARDED_MODAL_MEMO in *Modal.tsx files
  if (relPath.endsWith('Modal.tsx')) {
    const earlyReturnMatch = /if\s*\(\s*!isOpen\s*\)\s*return\s+null\s*;/.exec(content);
    if (earlyReturnMatch) {
      const beforeEarlyReturn = content.slice(0, earlyReturnMatch.index);
      const memoRegex = /useMemo(?:<[^>]+>)?\s*\(\s*\(\)\s*=>\s*\{([\s\S]{0,240})/g;
      let mMatch;
      while ((mMatch = memoRegex.exec(beforeEarlyReturn)) !== null) {
        const bodySnippet = mMatch[1] || '';
        const touchesHeavyData =
          bodySnippet.includes('dataList') ||
          bodySnippet.includes('productCatalog') ||
          bodySnippet.includes('items') ||
          bodySnippet.includes('alignItemWithMasterProduct');
        if (touchesHeavyData && !bodySnippet.includes('!isOpen')) {
          findings.push({
            rule: 'UNGUARDED_MODAL_MEMO',
            severity: 'HIGH',
            file: relPath,
            line: getLineNumber(content, mMatch.index),
            message: 'Modal executes heavy useMemo before `if (!isOpen) return null;` without an internal `if (!isOpen)` guard.'
          });
        }
      }
    }
  }

  // 3. Check SYNC_STORAGE_IN_LOOP: JSON.parse(localStorage.getItem(...)) inside .map/.filter/.forEach
  const loopStorageRegex = /\.(?:map|filter|forEach)\s*\([^)]*=>\s*\{[\s\S]{0,400}?JSON\.parse\s*\(\s*localStorage\.getItem/g;
  while ((match = loopStorageRegex.exec(content)) !== null) {
    findings.push({
      rule: 'SYNC_STORAGE_IN_LOOP',
      severity: 'CRITICAL',
      file: relPath,
      line: getLineNumber(content, match.index),
      message: 'Synchronous JSON.parse(localStorage.getItem(...)) inside array iteration loop causes severe main-thread freeze.'
    });
  }

  // 4. Check DATE_ALLOC_IN_SORT: .sort((a, b) => ... new Date(...) ...)
  const sortDateRegex = /\.sort\s*\(\s*\([^)]*\)\s*=>\s*\{?[\s\S]{0,220}?new\s+Date\s*\(/g;
  while ((match = sortDateRegex.exec(content)) !== null) {
    findings.push({
      rule: 'DATE_ALLOC_IN_SORT',
      severity: 'MEDIUM',
      file: relPath,
      line: getLineNumber(content, match.index),
      message: 'Allocating `new Date()` inside `.sort()` comparator scales poorly on large arrays; prefer ISO string localeCompare/direct comparison or precomputed timestamps.'
    });
  }

  return findings;
}

function main() {
  const args = parseArgs(process.argv);

  if (args.subcommand !== 'scan') {
    console.error('Error: Missing or invalid subcommand. Expected: node tools/wms_perf_audit.cjs scan --target <path> --limit <N> --output <file.json>');
    process.exit(1);
  }

  if (!Number.isInteger(args.limit) || args.limit <= 0) {
    console.error('Error: --limit <N> is required (no silent defaults). Specify maximum findings to return, e.g. --limit 50.');
    process.exit(1);
  }

  if (!args.output) {
    console.error('Error: --output <file.json> is required so audit results are written to a file.');
    process.exit(1);
  }

  const files = collectSourceFiles(args.target);
  const allFindings = [];
  for (const f of files) {
    const fileFindings = auditFile(f);
    allFindings.push(...fileFindings);
  }

  const limitedFindings = allFindings.slice(0, args.limit);
  const highOrCriticalCount = allFindings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH').length;

  const report = {
    scannedAt: new Date().toISOString(),
    target: args.target,
    totalFilesScanned: files.length,
    totalFindings: allFindings.length,
    highOrCriticalCount,
    truncated: allFindings.length > args.limit,
    limit: args.limit,
    passed: highOrCriticalCount === 0,
    findings: limitedFindings
  };

  const outPath = path.resolve(ROOT, args.output);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');

  console.log(
    `Success! Performance audit written to: ${outPath} (scanned=${files.length} files, highOrCritical=${highOrCriticalCount}, totalFindings=${allFindings.length})`
  );
}

main();

