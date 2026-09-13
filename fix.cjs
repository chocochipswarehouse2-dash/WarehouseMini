const fs = require('fs');
let s = fs.readFileSync('gas/api.gs', 'utf8');

// The file has null bytes because it was appended with UTF-16LE.
// I will strip all null bytes.
s = s.replace(/\x00/g, '');

const idx = s.indexOf('/**\r\n * Baca sheet Data Alamat');
if (idx !== -1) {
    s = s.substring(0, idx);
}
const idx2 = s.indexOf('/**\n * Baca sheet Data Alamat');
if (idx2 !== -1) {
    s = s.substring(0, idx2);
}
const idx3 = s.indexOf('/*\n * Baca sheet Data Alamat');
if (idx3 !== -1) {
    s = s.substring(0, idx3);
}
const idx4 = s.indexOf('function handleGetDataAlamat()');
if (idx4 !== -1) {
    s = s.substring(0, idx4);
}

s += `
/**
 * Baca sheet Data Alamat, mengabaikan header jika tidak ada
 */
function handleGetDataAlamat() {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName('Data Alamat');
  if (!sheet) return jsonResponse({ success: true, data: [] });
  
  var values = sheet.getDataRange().getValues();
  if (values.length === 0) return jsonResponse({ success: true, data: [] });
  var data = [];
  
  var hasHeaders = false;
  var row1str = values[0].join(' ').toLowerCase();
  if (row1str.indexOf('nama') !== -1 || row1str.indexOf('alamat') !== -1) {
    hasHeaders = true;
  }
  
  var startIndex = hasHeaders ? 1 : 0;
  
  for (var i = startIndex; i < values.length; i++) {
     var row = values[i];
     if (row.join('').trim() === '') continue;
     
     data.push({
       id: String(row[0] || ''),
       nama_penerima: String(row[1] || ''),
       no_telp: String(row[2] || ''),
       alamat: String(row[3] || ''),
       keterangan: String(row[4] || ''),
       jasa_kirim: String(row[5] || ''),
       created_at: String(row[6] || '')
     });
  }
  
  return jsonResponse({ success: true, data: data });
}
`;
// Ensure there's no dangling comments before the append if idx4 was used
s = s.replace(/\/\*\*\s*$/, '');
fs.writeFileSync('gas/api.gs', s.trim() + '\n', 'utf8');
