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
 * Key = nama sheet persis seperti di Google Spreadsheet (Sekarang disamakan dgn nama tabel Supabase)
 * supabaseTable = nama tabel di Supabase.
 * columns = urutan kolom di sheet (kolom A, B, C, dst).
 */
const SCHEMA = {
  'Manual Shipment': {
    supabaseTable: 'manual_shipment',
    columns: [
      'id',                      // A — UUID Supabase (WAJIB di kolom A)
      'no_pesanan',              // B
      'created_at',              // C
      'nama_pengirim',           // D
      'no_telp_pengirim',        // E
      'no_transaksi_dealpos',    // F
      'nama_tujuan',             // G
      'no_telp_tujuan',          // H
      'alamat_tujuan',           // I
      'jasa_kirim',              // J
      'no_resi',                 // K
      'status',                  // L — diterima | diproses | dikirim | batal | DELETED
      'notes_paket',             // M
      'submitted_by',            // N
      'items',                   // O — JSON string dari array items
      'updated_at',              // P
    ]
  },

  'Tarikan MD': {
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
      'items',              // M — JSON string dari array items
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

  'Outlet': {
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

  'log_produk': {
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

  'master_produk': {
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

  'picking_list': {
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

  'stock_opname_queue': {
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
