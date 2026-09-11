/**
 * WMS GAS BACKEND — schema.gs
 * ============================
 * Definisi kolom setiap sheet yang di-sync dari Supabase.
 * 
 * ATURAN:
 * - Kolom pertama (index 0) WAJIB berisi UUID/ID dari Supabase
 * - Ketika Supabase tambah kolom baru → tambah di sini → clasp push → sheet otomatis menyesuaikan
 * - GAS TIDAK BOLEH melakukan kalkulasi — hanya terima data jadi dari Supabase
 */

const SPREADSHEET_ID = '1ONrl13YPQfbgnXLXwaqBN0nWpYQlVm28HMKi7kVTPg0';

const WEBHOOK_SECRET = 'wms-webhook-secret-2026';

/**
 * Peta nama sheet ke konfigurasi kolom.
 * Key = nama sheet persis seperti di Google Spreadsheet.
 * supabaseTable = nama tabel di Supabase.
 * columns = urutan kolom di sheet (kolom A, B, C, dst).
 */
const SCHEMA = {
  'Manual Shipment': {
    supabaseTable: 'manual_shipment',
    columns: [
      'id',                      // A — UUID Supabase (WAJIB di kolom A)
      'no_pesanan',              // B
      'tanggal',                 // C
      'nama_pengirim',           // D
      'no_telp_store',           // E
      'no_transaksi_pengirim',   // F — disimpan sebagai JSON array string
      'nama_tujuan',             // G
      'no_telp_tujuan',          // H
      'alamat_tujuan',           // I
      'jasa_kirim',              // J
      'no_resi',                 // K
      'status',                  // L — diterima | diproses | dikirim | batal | DELETED
      'notes_paket',             // M
      'no_transaksi_customer',   // N
      'submitted_by',            // O
      'items_json',              // P — JSON string dari array items
      'created_at',              // Q
      'updated_at',              // R
    ]
  },

  'Pengecekan SJ': {
    supabaseTable: 'pengecekan_sj',
    columns: [
      'id',                 // A — UUID Supabase (WAJIB di kolom A)
      'no_sj',              // B
      'tanggal_sj',         // C
      'source',             // D — Gudang asal
      'destination',        // E — Outlet tujuan
      'status',             // F — pending | selesai | DELETED
      'status_komparasi',   // G — COCOK | SELISIH
      'total_qty_sj',       // H
      'total_qty_terima',   // I
      'total_sku',          // J
      'submitted_by',       // K
      'catatan',            // L
      'items_json',         // M — JSON string dari array items
      'sync_status',        // N — synced | pending_sync
      'created_at',         // O
      'updated_at',         // P
    ]
  },

  'Data Alamat': {
    supabaseTable: 'address_book',
    columns: [
      'id',             // A — UUID Supabase (WAJIB di kolom A)
      'nama_penerima',  // B
      'no_telp',        // C
      'alamat',         // D
      'keterangan',     // E
      'created_at',     // F
    ]
  },

  'outlet': {
    supabaseTable: 'outlet_config',
    columns: [
      'id',           // A
      'tipe',         // B — 'outlet' | 'jasa_kirim'
      'nama',         // C
      'fulfillment',  // D
      'is_active',    // E
      'urutan',       // F
      'created_at',   // G
    ]
  },

  'Log Produk': {
    supabaseTable: 'log_produk',
    columns: [
      'id',           // A
      'type',         // B — IN | OUT | ADJ_IN | ADJ_OUT | SO
      'invoice',      // C
      'sku',          // D
      'nama_produk',  // E
      'size',         // F
      'area',         // G
      'lokasi',       // H
      'qty',          // I
      'operator',     // J
      'keterangan',   // K
      'created_at',   // L
    ]
  },

  'Master Produk': {
    supabaseTable: 'master_produk',
    columns: [
      'sku',              // A — PRIMARY KEY (bukan UUID, tapi string SKU)
      'nama_produk',      // B
      'kategori',         // C
      'size',             // D
      'price',            // E
      'created_at',       // F
      'updated_at',       // G
    ]
  },

  'Picking List': {
    supabaseTable: 'picking_list',
    columns: [
      'id',           // A
      'no_sj',        // B
      'tanggal',      // C
      'tujuan',       // D
      'sku',          // E
      'nama_produk',  // F
      'qty_req',      // G
      'qty_picked',   // H
      'lokasi',       // I
      'status',       // J
      'picker_name',  // K
      'created_at',   // L
    ]
  },

  'Stock Opname': {
    supabaseTable: 'stock_opname_queue',
    columns: [
      'id',           // A
      'sesi_id',      // B
      'tanggal',      // C
      'sku',          // D
      'nama_produk',  // E
      'size',         // F
      'lokasi',       // G
      'area',         // H
      'qty_sistem',   // I
      'qty_fisik',    // J
      'selisih',      // K
      'status',       // L — PENDING | APPROVED | REJECTED | DELETED
      'jenis',        // M
      'alasan',       // N
      'operator',     // O
      'invoice',      // P
      'approved_by',  // Q
      'tanggal_approve', // R
      'created_at',   // S
    ]
  },
};

/**
 * Dapatkan nama sheet berdasarkan nama tabel Supabase
 */
function getSheetNameByTable(supabaseTable) {
  for (var sheetName in SCHEMA) {
    if (SCHEMA[sheetName].supabaseTable === supabaseTable) {
      return sheetName;
    }
  }
  return null;
}

/**
 * Dapatkan konfigurasi schema berdasarkan nama sheet
 */
function getSchema(sheetName) {
  return SCHEMA[sheetName] || null;
}

/**
 * Dapatkan semua nama sheet yang di-sync
 */
function getAllSyncedSheets() {
  return Object.keys(SCHEMA);
}
