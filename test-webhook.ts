import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://vxongwtxmhjixhzeoidp.supabase.co';
// Memakai Service Role Key agar bebas bypass RLS (hanya untuk testing internal)
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ4b25nd3R4bWhqaXhoemVvaWRwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODQzMjAwNSwiZXhwIjoyMTA0MDA4MDA1fQ.QlURHgVn7ka1QMWuDzqGkxiLqCTPDCRq0Kg6q3DGhxI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxkBScIKlkA06Twrs3WOYZC1s6jmvl9dppV5M008ZydoPrqau3d6-VCdfDGacDUErN7Ig/exec';

async function testEndToEnd() {
  console.log('🚀 Memulai Test Webhook End-to-End...');
  
  const testId = crypto.randomUUID();
  const testOrderNo = `TEST-ORDER-${Date.now()}`;

  // ==========================================
  // 1. TEST INSERT KE SUPABASE
  // ==========================================
  console.log(`\n[1] INSERT data ke Supabase (ID: ${testId})...`);
  const { data: insertData, error: insertError } = await supabase
    .from('manual_shipment')
    .insert({
      id: testId,
      no_pesanan: testOrderNo,
      nama_pengirim: 'BOT TESTER',
      nama_tujuan: 'Joko Widodo',
      alamat_tujuan: 'Istana Negara',
      jasa_kirim: 'JNE Express',
      status: 'diterima',
      notes_paket: 'Ini adalah data test webhook',
      submitted_by: 'system_test',
      items: [{ sku: 'TEST-SKU', nama_produk: 'Barang Uji Coba', qty: 1 }]
    })
    .select();

  if (insertError) {
    console.error('❌ INSERT Gagal:', insertError.message);
    return;
  }
  console.log('✅ INSERT Sukses! Supabase menyimpan data ini.');

  // ==========================================
  // 2. WAIT FOR WEBHOOK TO PROCESS (3 detik)
  // ==========================================
  console.log('\n[2] Menunggu 4 detik agar Webhook selesai dieksekusi oleh GAS...');
  await new Promise(resolve => setTimeout(resolve, 4000));

  // ==========================================
  // 3. TEST READ DARI GAS API (Apakah data masuk Spreadsheet?)
  // ==========================================
  console.log(`\n[3] Memanggil GAS API untuk mengecek apakah data masuk...`);
  try {
    const response = await fetch(`${GAS_API_URL}?action=sync&table=manual_shipment`);
    const result = await response.json();
    
    if (result.success && result.data) {
      const foundItem = result.data.find((item: any) => item.id === testId);
      if (foundItem) {
        console.log('✅ BINGO! Data ditemukan di Google Spreadsheet melalui GAS API!');
        console.log('Detail data dari GAS:', foundItem.no_pesanan, foundItem.nama_tujuan, foundItem.status);
      } else {
        console.log('❌ Oops, data belum masuk ke GAS. Mungkin webhook gagal atau schema kolom tidak pas.');
        console.log(`Total data di GAS: ${result.count}`);
      }
    } else {
      console.log('❌ Gagal memanggil GAS API:', result);
    }
  } catch (err) {
    console.error('❌ Error memanggil GAS API:', err);
  }

  // ==========================================
  // 4. TEST UPDATE KE SUPABASE
  // ==========================================
  console.log(`\n[4] UPDATE data di Supabase (Ubah status jadi 'diproses')...`);
  const { error: updateError } = await supabase
    .from('manual_shipment')
    .update({ status: 'diproses' })
    .eq('id', testId);

  if (updateError) {
    console.error('❌ UPDATE Gagal:', updateError.message);
  } else {
    console.log('✅ UPDATE Sukses! Webhook UPDATE seharusnya sedang berjalan.');
  }

  await new Promise(resolve => setTimeout(resolve, 4000));

  console.log(`\n[5] Memanggil GAS API lagi untuk cek UPDATE...`);
  try {
    const response = await fetch(`${GAS_API_URL}?action=sync&table=manual_shipment`);
    const result = await response.json();
    const foundItem = result.data?.find((item: any) => item.id === testId);
    if (foundItem && foundItem.status === 'diproses') {
      console.log('✅ BINGO! Data di Spreadsheet berhasil ter-update menjadi:', foundItem.status);
    } else {
      console.log('❌ Data tidak ter-update di GAS.');
    }
  } catch (err) {}

  // ==========================================
  // 5. TEST SOFT DELETE KE SUPABASE
  // ==========================================
  console.log(`\n[6] DELETE data di Supabase...`);
  const { error: deleteError } = await supabase
    .from('manual_shipment')
    .delete()
    .eq('id', testId);

  if (deleteError) {
    console.error('❌ DELETE Gagal:', deleteError.message);
  } else {
    console.log('✅ DELETE Sukses! Webhook DELETE seharusnya berjalan (Soft Delete di GAS).');
  }

  await new Promise(resolve => setTimeout(resolve, 4000));
  
  console.log(`\n[7] Memanggil GAS API untuk memastikan data HILANG dari GET (karena Soft Deleted)...`);
  try {
    const response = await fetch(`${GAS_API_URL}?action=sync&table=manual_shipment`);
    const result = await response.json();
    const foundItem = result.data?.find((item: any) => item.id === testId);
    if (!foundItem) {
      console.log('✅ BINGO! Data test sudah tidak muncul di GET API (Berhasil di-Soft Delete).');
    } else {
      console.log('❌ Data masih muncul di GAS.');
    }
  } catch (err) {}

  console.log('\n🎉 TEST END-TO-END SELESAI 🎉');
}

testEndToEnd();
