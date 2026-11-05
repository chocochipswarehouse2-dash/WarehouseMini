const fs = require('fs');

let code = fs.readFileSync('gas/Code.js', 'utf8');
let fonnte = fs.readFileSync('gas/fonnte_handler.js', 'utf8');

// The exact string to replace in Code.js: from `function handleWhatsAppScan(payload) {` up to `function supabaseApiFetch(endpoint, method, payload) {`
const startIdx = code.indexOf('function handleWhatsAppScan(payload) {');
const endIdx = code.indexOf('/**\r\n * Fetch helper ke Supabase REST API'); // CRLF or LF might differ
let endStr = '/**\n * Fetch helper ke Supabase REST API';
if (code.indexOf('/**\r\n * Fetch helper') !== -1) {
  endStr = '/**\r\n * Fetch helper ke Supabase REST API';
}
const endHwIdx = code.indexOf(endStr);

if (startIdx === -1 || endHwIdx === -1) {
  console.log('Could not find boundaries in Code.js');
  process.exit(1);
}

const beforeHw = code.substring(0, startIdx);
const afterHw = code.substring(endHwIdx);

// Extract handleWhatsAppScan from fonnte_handler.js
const fonnteStartIdx = fonnte.indexOf('function handleWhatsAppScan(payload) {');
let fonnteHw = fonnte.substring(fonnteStartIdx);

// fonnteHw ends at EOF, but we should make sure it has newlines before afterHw
let newCode = beforeHw + fonnteHw + '\n\n' + afterHw;

// Now let's also sync getArea
const codeGetAreaStart = newCode.indexOf('function getArea(lokasi) {');
const codeGetAreaEnd = newCode.indexOf('function generateInvoice() {');

const fonnteGetAreaStart = fonnte.indexOf('function getArea(lokasi) {');
const fonnteGetAreaEnd = fonnte.indexOf('function generateInvoice() {');

if (codeGetAreaStart !== -1 && codeGetAreaEnd !== -1 && fonnteGetAreaStart !== -1 && fonnteGetAreaEnd !== -1) {
  const bArea = newCode.substring(0, codeGetAreaStart);
  const aArea = newCode.substring(codeGetAreaEnd);
  const fonnteArea = fonnte.substring(fonnteGetAreaStart, fonnteGetAreaEnd);
  newCode = bArea + fonnteArea + aArea;
}

fs.writeFileSync('gas/Code.js', newCode, 'utf8');
console.log('gas/Code.js updated successfully!');
