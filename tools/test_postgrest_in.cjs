const url = 'https://ilhqerecxbywqrhfpbbc.supabase.co';
const key = 'sb_publishable_tMgdx9b0XBAQei7WcKYvMg_QwJ-lopn';

async function testFetch(path) {
  const res = await fetch(url + '/rest/v1/' + path, {
    headers: { apikey: key, Authorization: 'Bearer ' + key }
  });
  const data = await res.json();
  console.log('Query:', path);
  console.log('Result:', Array.isArray(data) ? `Found ${data.length} rows: ` + JSON.stringify(data) : data);
}

async function run() {
  const skus = ['ZF26KTN07MRC', 'ZF26KTN07WHC'];
  const inClause = skus.map(s => '"' + s + '"').join(',');
  
  console.log('--- TEST 1: BUGGY (encodeURIComponent on entire inClause) ---');
  await testFetch('master_produk?sku=in.(' + encodeURIComponent(inClause) + ')&select=sku,nama_produk,size');
  
  console.log('\n--- TEST 2: CORRECT (encodeURIComponent per SKU, raw commas) ---');
  const inClauseCorrect = skus.map(s => '"' + encodeURIComponent(s) + '"').join(',');
  await testFetch('master_produk?sku=in.(' + inClauseCorrect + ')&select=sku,nama_produk,size');
}

run();
