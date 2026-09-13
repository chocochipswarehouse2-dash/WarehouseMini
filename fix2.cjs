const fs = require('fs');
let s = fs.readFileSync('gas/api.gs', 'utf8');

const lastFuncIdx = s.lastIndexOf('function handleGetDataAlamat() {');
if (lastFuncIdx !== -1) {
  // Let's remove the function definition and anything after it up to the end
  // But wait, there might be comments above it.
  const commentIdx = s.lastIndexOf('/**\r\n * Baca sheet Data Alamat', lastFuncIdx);
  const commentIdx2 = s.lastIndexOf('/**\n * Baca sheet Data Alamat', lastFuncIdx);
  let cutIdx = lastFuncIdx;
  if (commentIdx !== -1) cutIdx = commentIdx;
  if (commentIdx2 !== -1 && commentIdx2 < cutIdx) cutIdx = commentIdx2;

  s = s.substring(0, cutIdx);
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

fs.writeFileSync('gas/api.gs', s, 'utf8');
