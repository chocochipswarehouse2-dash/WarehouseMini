import { supabaseFetch } from './supabase';
import { getGdriveConfig } from './gdriveUpload';
import { getFonnteConfig } from './whatsapp';

export interface ReturOriginalItem {
  id: string;
  sku: string;
  nama_produk: string;
  size: string;
  qty: number;
  kondisi?: 'tukar_size_model' | 'defect_reject' | 'salah_kirim' | 'lainnya';
}

export interface ReturReplacementItem {
  id: string;
  sku: string;
  nama_produk: string;
  size: string;
  qty: number;
  fulfillment: string; // 'Marketplace' | Nama Store Outlet
  lokasi?: string;
  item_status?: 'ready' | 'sold_out' | 'cancelled';
  sold_note?: string;
}

export interface ReturHistoryLog {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  details: string;
}

export interface ReturBarangOrder {
  id?: string;
  no_retur: string; // Disimpan di kolom no_pesanan (contoh: RTR-261022-ABCD)
  no_pesanan_asal: string; // Wajib: No. Pesanan Shopee/Tiktok/Website/dll.
  outlet_order: string; // Wajib: Shopee, Tiktok, Tokped, Website, Lazada, Woocommerce, IGlive, dll.
  kategori_alasan: 'tukar_size_model' | 'defect_reject' | 'salah_kirim' | 'lainnya';
  alasan_retur: string; // Wajib: Alasan / Deskripsi Retur
  opsi_pengiriman: string; // Wajib: Jasa Kirim
  nama_customer: string; // Wajib
  no_hp: string; // Wajib
  alamat_lengkap: string; // Wajib

  // Daftar Produk
  produk_pesanan: ReturOriginalItem[]; // Wajib: Produk yang diretur customer
  produk_pengganti: ReturReplacementItem[]; // Wajib: Produk pengganti (+ opsi fulfillment)

  // Biaya & Bukti Pembayaran (Bisa dikosongkan di awal input)
  penanggung_biaya: 'customer' | 'toko_free';
  selisih_harga: number | null;
  ongkir_dibayar: number | null;
  bukti_pembayaran_urls: string[];
  foto_komplain_urls: string[];

  // Pelacakan Barang Retur dari Customer ke Gudang (Inbound)
  no_resi_customer: string;
  status_barang_retur: 'belum_dikirim' | 'dikirim_customer' | 'diterima_gudang_qc';
  tgl_terima_gudang?: string;
  qc_penerima_gudang?: string;

  // Dokumen DealPOS Admin WH
  no_sj_gudang_retur: string; // Admin isi SJ DealPOS to Gudang Retur
  sj_gudang_updated_by?: string;
  sj_gudang_updated_at?: string;
  no_invoice_return: string; // Admin isi Invoice Return saat proses retur selesai = order retur sudah dikirim
  invoice_return_updated_by?: string;
  invoice_return_updated_at?: string;

  // Pengiriman Produk Pengganti & Status Cetak
  no_resi: string; // Admin input No. Resi Pengiriman = Proses retur barang selesai
  tanggal_kirim_resi?: string;
  is_label_printed: boolean;
  tgl_cetak_label?: string;
  is_picking_printed: boolean;
  tgl_cetak_picking?: string;
  is_wa_picking_sent?: boolean;
  tgl_wa_picking?: string;

  // Status Utama: 'diterima' (Pesanan Baru) | 'diproses' (Pesanan Diproses) | 'dikirim' (Pesanan Selesai) | 'batal' | 'DELETED'
  status: 'diterima' | 'diproses' | 'dikirim' | 'batal' | 'DELETED';
  alasan_batal?: string;
  dibatalkan_oleh?: string;
  tgl_batal?: string;

  submitted_by: string;
  catatan_internal?: string;
  history_logs: ReturHistoryLog[];
  created_at: string;
  updated_at?: string;
}

export interface PusatResolusiSettings {
  recipient_emails: string[];
  cc_emails: string[];
  from_name: string;
  auto_email_on_submit: boolean;
  auto_email_on_complete: boolean;
  auto_email_on_update?: boolean;
  gas_email_url?: string;
  wa_group_picking: string;
  outlet_options: string[];
  shipping_options: string[];
  updated_at?: string;
  updated_by?: string;
}

export const DEFAULT_PUSAT_RESOLUSI_EMAIL_GAS_URL =
  'https://script.google.com/macros/s/AKfycbyFxfqoqJhrPJOioPxnmbGJTjTTAwli6b87lgOQCPFDOoCVt5EJg3NHZT56zI52rM63/exec';

export const DEFAULT_OUTLET_ORDER_OPTIONS = [
  'Shopee',
  'Tiktok',
  'Tokped',
  'Website',
  'Lazada',
  'Woocommerce',
  'IGlive',
];

export const DEFAULT_SHIPPING_OPTIONS = [
  'JNE Regular',
  'JNE YES',
  'JNE Trucking (JTR)',
  'J&T Express',
  'SiCepat REG',
  'SiCepat BEST',
  'ID Express',
  'SPX Express',
  'GoSend Instant',
  'GoSend SameDay',
  'GrabExpress Instant',
  'GrabExpress SameDay',
  'Lion Parcel',
  'Paxel',
  'Ambil di Store / Kurir Internal',
];

const RESOLUSI_SETTINGS_STORAGE_KEY = 'wms_pusat_resolusi_settings';
const RESOLUSI_DOCS_SECTION_ID = 'pusat_resolusi_settings';

export function getDefaultPusatResolusiSettings(): PusatResolusiSettings {
  const fonnteCfg = getFonnteConfig();
  return {
    recipient_emails: ['chocochips.warehouse2@gmail.com'],
    cc_emails: [],
    from_name: 'Chocochips - Pusat Resolusi',
    auto_email_on_submit: true,
    auto_email_on_complete: true,
    auto_email_on_update: true,
    gas_email_url: DEFAULT_PUSAT_RESOLUSI_EMAIL_GAS_URL,
    wa_group_picking: fonnteCfg.groupTarget || '',
    outlet_options: [...DEFAULT_OUTLET_ORDER_OPTIONS],
    shipping_options: [...DEFAULT_SHIPPING_OPTIONS],
  };
}

export function getLocalPusatResolusiSettings(): PusatResolusiSettings {
  const def = getDefaultPusatResolusiSettings();
  try {
    const raw = localStorage.getItem(RESOLUSI_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        ...def,
        ...parsed,
        gas_email_url: (parsed.gas_email_url && !parsed.gas_email_url.includes('AKfycby4J497I-m4H99KSvBDkkSr6_kn9BoIDwALRa3lE1ZiPyJPIAd0AYE6-r6yqCdFONmpSg')) ? parsed.gas_email_url : def.gas_email_url,
        recipient_emails: Array.isArray(parsed.recipient_emails) ? parsed.recipient_emails : def.recipient_emails,
        cc_emails: Array.isArray(parsed.cc_emails) ? parsed.cc_emails : def.cc_emails,
        outlet_options: Array.isArray(parsed.outlet_options) && parsed.outlet_options.length > 0 ? parsed.outlet_options : def.outlet_options,
        shipping_options: Array.isArray(parsed.shipping_options) && parsed.shipping_options.length > 0 ? parsed.shipping_options : def.shipping_options,
      };
    }
  } catch {}
  return def;
}

export async function fetchPusatResolusiSettings(): Promise<PusatResolusiSettings> {
  const local = getLocalPusatResolusiSettings();
  try {
    const rows = await supabaseFetch<any[]>(
      'wms_system_docs',
      'GET',
      undefined,
      `section_id=eq.${RESOLUSI_DOCS_SECTION_ID}`
    );
    if (rows && rows[0] && rows[0].content) {
      const cloudParsed = JSON.parse(rows[0].content);
      const merged: PusatResolusiSettings = {
        ...local,
        ...cloudParsed,
        gas_email_url: (cloudParsed.gas_email_url && !cloudParsed.gas_email_url.includes('AKfycby4J497I-m4H99KSvBDkkSr6_kn9BoIDwALRa3lE1ZiPyJPIAd0AYE6-r6yqCdFONmpSg')) ? cloudParsed.gas_email_url : local.gas_email_url,
        recipient_emails: Array.isArray(cloudParsed.recipient_emails) ? cloudParsed.recipient_emails : local.recipient_emails,
        cc_emails: Array.isArray(cloudParsed.cc_emails) ? cloudParsed.cc_emails : local.cc_emails,
        outlet_options: Array.isArray(cloudParsed.outlet_options) && cloudParsed.outlet_options.length > 0 ? cloudParsed.outlet_options : local.outlet_options,
        shipping_options: Array.isArray(cloudParsed.shipping_options) && cloudParsed.shipping_options.length > 0 ? cloudParsed.shipping_options : local.shipping_options,
      };
      try {
        localStorage.setItem(RESOLUSI_SETTINGS_STORAGE_KEY, JSON.stringify(merged));
      } catch {}
      return merged;
    }
  } catch (err) {
    console.warn('Gagal mengambil pengaturan Pusat Resolusi dari Cloud:', err);
  }
  return local;
}

export async function savePusatResolusiSettings(
  settings: PusatResolusiSettings,
  actorName = 'Admin'
): Promise<{ success: boolean; message: string }> {
  const payload: PusatResolusiSettings = {
    ...settings,
    updated_at: new Date().toISOString(),
    updated_by: actorName,
  };
  try {
    localStorage.setItem(RESOLUSI_SETTINGS_STORAGE_KEY, JSON.stringify(payload));
  } catch {}

  try {
    await supabaseFetch(
      'wms_system_docs',
      'POST',
      [
        {
          section_id: RESOLUSI_DOCS_SECTION_ID,
          content: JSON.stringify(payload),
          updated_by: actorName,
          updated_at: payload.updated_at,
        },
      ],
      'resolution=merge-duplicates'
    );
    return { success: true, message: 'Pengaturan Pusat Resolusi berhasil disimpan ke Cloud' };
  } catch (err: any) {
    return {
      success: true,
      message: 'Pengaturan disimpan di perangkat ini (Cloud sync tertunda)',
    };
  }
}

export function generateReturOrderId(outletOrder?: string): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const code = (outletOrder || 'RTR')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 3) || 'RTR';
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 4; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `RTR-${code}-${yy}${mm}${dd}-${rand}`;
}

/**
 * Hitung status efektif Pesanan Retur berdasarkan alur:
 * 1. Input/Submit -> Pesanan Baru ('diterima')
 * 2. Cetak Label A6 / Picking List (atau Input SJ DealPOS Gudang Retur) -> Pesanan Diproses ('diproses')
 * 3. Input No. Resi Pengiriman (atau Invoice Return selesai dengan resi) -> Pesanan Selesai ('dikirim')
 */
export function computeReturEffectiveStatus(order: Partial<ReturBarangOrder>): 'diterima' | 'diproses' | 'dikirim' | 'batal' | 'DELETED' {
  if (order.status === 'DELETED') return 'DELETED';
  if (order.status === 'batal') return 'batal';

  const hasResi = Boolean(order.no_resi && order.no_resi.trim());
  if (hasResi || order.status === 'dikirim') {
    return 'dikirim';
  }

  const hasPrintActivity = Boolean(order.is_label_printed || order.is_picking_printed || order.is_wa_picking_sent);
  const hasDealposActivity = Boolean(
    (order.no_sj_gudang_retur && order.no_sj_gudang_retur.trim()) ||
    (order.no_invoice_return && order.no_invoice_return.trim())
  );

  if (hasPrintActivity || hasDealposActivity || order.status === 'diproses') {
    return 'diproses';
  }

  return 'diterima';
}

function serializeReturToDbPayload(order: ReturBarangOrder, isNew = false): any {
  const effectiveStatus = computeReturEffectiveStatus(order);
  const metadata = {
    no_pesanan_asal: order.no_pesanan_asal || '',
    outlet_order: order.outlet_order || '',
    kategori_alasan: order.kategori_alasan || 'tukar_size_model',
    alasan_retur: order.alasan_retur || '',
    produk_pesanan: order.produk_pesanan || [],
    produk_pengganti: order.produk_pengganti || [],
    penanggung_biaya: order.penanggung_biaya || 'customer',
    selisih_harga: order.selisih_harga ?? null,
    ongkir_dibayar: order.ongkir_dibayar ?? null,
    bukti_pembayaran_urls: order.bukti_pembayaran_urls || [],
    foto_komplain_urls: order.foto_komplain_urls || [],
    no_resi_customer: order.no_resi_customer || '',
    status_barang_retur: order.status_barang_retur || 'belum_dikirim',
    tgl_terima_gudang: order.tgl_terima_gudang || '',
    qc_penerima_gudang: order.qc_penerima_gudang || '',
    no_sj_gudang_retur: order.no_sj_gudang_retur || '',
    sj_gudang_updated_by: order.sj_gudang_updated_by || '',
    sj_gudang_updated_at: order.sj_gudang_updated_at || '',
    no_invoice_return: order.no_invoice_return || '',
    invoice_return_updated_by: order.invoice_return_updated_by || '',
    invoice_return_updated_at: order.invoice_return_updated_at || '',
    tanggal_kirim_resi: order.tanggal_kirim_resi || '',
    is_label_printed: !!order.is_label_printed,
    tgl_cetak_label: order.tgl_cetak_label || '',
    is_picking_printed: !!order.is_picking_printed,
    tgl_cetak_picking: order.tgl_cetak_picking || '',
    is_wa_picking_sent: !!order.is_wa_picking_sent,
    tgl_wa_picking: order.tgl_wa_picking || '',
    alasan_batal: order.alasan_batal || '',
    dibatalkan_oleh: order.dibatalkan_oleh || '',
    tgl_batal: order.tgl_batal || '',
    catatan_internal: order.catatan_internal || '',
    history_logs: order.history_logs || [],
  };

  const cleanReason = (order.alasan_retur || '').trim();
  const notesPaket = `${cleanReason}\n[RETUR_BARANG]:${JSON.stringify(metadata)}`;

  const txArray: string[] = [];
  if (order.no_sj_gudang_retur && order.no_sj_gudang_retur.trim()) {
    txArray.push(`SJ:${order.no_sj_gudang_retur.trim()}`);
  }
  if (order.no_invoice_return && order.no_invoice_return.trim()) {
    txArray.push(`INV:${order.no_invoice_return.trim()}`);
  }

  const dbPayload: any = {
    no_pesanan: order.no_retur,
    nama_pengirim: order.outlet_order || 'CHOCOCHIPS',
    no_telp_store: '',
    no_transaksi_pengirim: txArray,
    nama_tujuan: order.nama_customer,
    no_telp_tujuan: order.no_hp || '',
    alamat_tujuan: order.alamat_lengkap,
    notes_paket: notesPaket,
    no_transaksi_customer: order.no_pesanan_asal,
    jasa_kirim: order.opsi_pengiriman,
    no_resi: order.no_resi || '',
    status: effectiveStatus,
    submitted_by: order.submitted_by || 'Tim CS',
    pic_store: order.submitted_by || 'Tim CS',
    // Simpan produk_pengganti di kolom items agar kompatibel penuh dengan Label A6 & Picking List
    items: (order.produk_pengganti || []).map(it => ({
      id: it.id,
      sku: it.sku,
      nama_produk: it.nama_produk,
      size: it.size || '-',
      qty: Math.max(1, Number(it.qty) || 1),
      fulfillment: it.fulfillment || 'Marketplace',
      lokasi: it.lokasi || '',
      item_status: it.item_status || 'ready',
      sold_note: it.sold_note || '',
    })),
    updated_at: new Date().toISOString(),
  };

  if (isNew) {
    dbPayload.created_at = order.created_at || new Date().toISOString();
  }

  return dbPayload;
}

// Cache status keberadaan tabel khusus public.retur_barang
let isDedicatedReturTableAvailable: boolean | null = null;

async function checkDedicatedReturTable(): Promise<boolean> {
  if (isDedicatedReturTableAvailable !== null) {
    return isDedicatedReturTableAvailable;
  }
  try {
    const res = await supabaseFetch<any[]>('retur_barang', 'GET', null, 'select=id&limit=1');
    isDedicatedReturTableAvailable = Array.isArray(res);
    return isDedicatedReturTableAvailable;
  } catch {
    isDedicatedReturTableAvailable = false;
    return false;
  }
}

function parseDbRowToReturOrder(row: any): ReturBarangOrder | null {
  if (!row) return null;

  // 1. Jika baris berasal dari tabel khusus public.retur_barang
  if (row.no_retur && (row.produk_pesanan !== undefined || row.no_pesanan_asal !== undefined)) {
    let prodPesanan = row.produk_pesanan;
    if (typeof prodPesanan === 'string') {
      try { prodPesanan = JSON.parse(prodPesanan); } catch {}
    }
    let prodPengganti = row.produk_pengganti;
    if (typeof prodPengganti === 'string') {
      try { prodPengganti = JSON.parse(prodPengganti); } catch {}
    }
    let buktiUrls = row.bukti_pembayaran_urls;
    if (typeof buktiUrls === 'string') {
      try { buktiUrls = JSON.parse(buktiUrls); } catch {}
    }
    let fotoUrls = row.foto_komplain_urls;
    if (typeof fotoUrls === 'string') {
      try { fotoUrls = JSON.parse(fotoUrls); } catch {}
    }
    let history = row.history_logs;
    if (typeof history === 'string') {
      try { history = JSON.parse(history); } catch {}
    }

    return {
      id: row.id,
      no_retur: row.no_retur,
      no_pesanan_asal: row.no_pesanan_asal || '',
      outlet_order: row.outlet_order || '',
      kategori_alasan: row.kategori_alasan || 'tukar_size_model',
      alasan_retur: row.alasan_retur || '',
      opsi_pengiriman: row.opsi_pengiriman || '',
      nama_customer: row.nama_customer || '',
      no_hp: row.no_hp || '',
      alamat_lengkap: row.alamat_lengkap || '',
      produk_pesanan: Array.isArray(prodPesanan) ? prodPesanan : [],
      produk_pengganti: Array.isArray(prodPengganti) ? prodPengganti : [],
      penanggung_biaya: row.penanggung_biaya || 'customer',
      selisih_harga: row.selisih_harga !== null && row.selisih_harga !== undefined && row.selisih_harga !== '' ? Number(row.selisih_harga) : null,
      ongkir_dibayar: row.ongkir_dibayar !== null && row.ongkir_dibayar !== undefined && row.ongkir_dibayar !== '' ? Number(row.ongkir_dibayar) : null,
      bukti_pembayaran_urls: Array.isArray(buktiUrls) ? buktiUrls : [],
      foto_komplain_urls: Array.isArray(fotoUrls) ? fotoUrls : [],
      no_resi_customer: row.no_resi_customer || '',
      status_barang_retur: row.status_barang_retur || 'belum_dikirim',
      tgl_terima_gudang: row.tgl_terima_gudang || '',
      qc_penerima_gudang: row.qc_penerima_gudang || '',
      no_sj_gudang_retur: row.no_sj_gudang_retur || '',
      sj_gudang_updated_by: row.sj_gudang_updated_by || '',
      sj_gudang_updated_at: row.sj_gudang_updated_at || '',
      no_invoice_return: row.no_invoice_return || '',
      invoice_return_updated_by: row.invoice_return_updated_by || '',
      invoice_return_updated_at: row.invoice_return_updated_at || '',
      no_resi: row.no_resi || '',
      tanggal_kirim_resi: row.tanggal_kirim_resi || '',
      is_label_printed: !!row.is_label_printed,
      tgl_cetak_label: row.tgl_cetak_label || '',
      is_picking_printed: !!row.is_picking_printed,
      tgl_cetak_picking: row.tgl_cetak_picking || '',
      is_wa_picking_sent: !!row.is_wa_picking_sent,
      tgl_wa_picking: row.tgl_wa_picking || '',
      status: row.status || 'diterima',
      alasan_batal: row.alasan_batal || '',
      dibatalkan_oleh: row.dibatalkan_oleh || '',
      tgl_batal: row.tgl_batal || '',
      submitted_by: row.submitted_by || 'Tim CS',
      catatan_internal: row.catatan_internal || '',
      history_logs: Array.isArray(history) ? history : [],
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || row.created_at,
    };
  }

  // 2. Baris berasal dari tabel fallback public.manual_shipment
  const noPesanan = String(row.no_pesanan || '').trim();
  const rawNotes = String(row.notes_paket || '');
  const isReturRow = noPesanan.toUpperCase().startsWith('RTR-') || rawNotes.includes('[RETUR_BARANG]:');
  if (!isReturRow) return null;

  let cleanReason = rawNotes;
  let meta: any = {};

  if (rawNotes.includes('[RETUR_BARANG]:')) {
    const parts = rawNotes.split('[RETUR_BARANG]:');
    cleanReason = (parts[0] || '').trim();
    try {
      meta = JSON.parse((parts[1] || '').trim());
    } catch (e) {
      console.warn('Gagal parse metadata [RETUR_BARANG]:', e);
    }
  }

  let rawItems: any = row.items;
  if (typeof rawItems === 'string' && rawItems.trim()) {
    try {
      rawItems = JSON.parse(rawItems);
    } catch {}
  }
  const replacementItems: ReturReplacementItem[] = Array.isArray(meta.produk_pengganti) && meta.produk_pengganti.length > 0
    ? meta.produk_pengganti
    : Array.isArray(rawItems)
      ? rawItems.map((it: any, idx: number) => ({
          id: it.id || `rep-${idx + 1}`,
          sku: it.sku || '',
          nama_produk: it.nama_produk || '',
          size: it.size || '-',
          qty: Number(it.qty) || 1,
          fulfillment: it.fulfillment || 'Marketplace',
          lokasi: it.lokasi || '',
          item_status: it.item_status || 'ready',
          sold_note: it.sold_note || '',
        }))
      : [];

  const originalItems: ReturOriginalItem[] = Array.isArray(meta.produk_pesanan)
    ? meta.produk_pesanan
    : [];

  return {
    id: row.id,
    no_retur: noPesanan,
    no_pesanan_asal: meta.no_pesanan_asal || row.no_transaksi_customer || '',
    outlet_order: meta.outlet_order || row.nama_pengirim || '',
    kategori_alasan: meta.kategori_alasan || 'tukar_size_model',
    alasan_retur: meta.alasan_retur || cleanReason || '',
    opsi_pengiriman: row.jasa_kirim || '',
    nama_customer: row.nama_tujuan || '',
    no_hp: row.no_telp_tujuan || '',
    alamat_lengkap: row.alamat_tujuan || '',
    produk_pesanan: originalItems,
    produk_pengganti: replacementItems,
    penanggung_biaya: meta.penanggung_biaya || 'customer',
    selisih_harga: meta.selisih_harga !== undefined && meta.selisih_harga !== '' ? Number(meta.selisih_harga) : null,
    ongkir_dibayar: meta.ongkir_dibayar !== undefined && meta.ongkir_dibayar !== '' ? Number(meta.ongkir_dibayar) : null,
    bukti_pembayaran_urls: Array.isArray(meta.bukti_pembayaran_urls) ? meta.bukti_pembayaran_urls : [],
    foto_komplain_urls: Array.isArray(meta.foto_komplain_urls) ? meta.foto_komplain_urls : [],
    no_resi_customer: meta.no_resi_customer || '',
    status_barang_retur: meta.status_barang_retur || 'belum_dikirim',
    tgl_terima_gudang: meta.tgl_terima_gudang || '',
    qc_penerima_gudang: meta.qc_penerima_gudang || '',
    no_sj_gudang_retur: meta.no_sj_gudang_retur || '',
    sj_gudang_updated_by: meta.sj_gudang_updated_by || '',
    sj_gudang_updated_at: meta.sj_gudang_updated_at || '',
    no_invoice_return: meta.no_invoice_return || '',
    invoice_return_updated_by: meta.invoice_return_updated_by || '',
    invoice_return_updated_at: meta.invoice_return_updated_at || '',
    no_resi: row.no_resi || '',
    tanggal_kirim_resi: meta.tanggal_kirim_resi || '',
    is_label_printed: !!meta.is_label_printed,
    tgl_cetak_label: meta.tgl_cetak_label || '',
    is_picking_printed: !!meta.is_picking_printed,
    tgl_cetak_picking: meta.tgl_cetak_picking || '',
    is_wa_picking_sent: !!meta.is_wa_picking_sent,
    tgl_wa_picking: meta.tgl_wa_picking || '',
    status: row.status || 'diterima',
    alasan_batal: meta.alasan_batal || '',
    dibatalkan_oleh: meta.dibatalkan_oleh || '',
    tgl_batal: meta.tgl_batal || '',
    submitted_by: row.submitted_by || row.pic_store || 'Tim CS',
    catatan_internal: meta.catatan_internal || '',
    history_logs: Array.isArray(meta.history_logs) ? meta.history_logs : [],
    created_at: row.created_at || row.tanggal || new Date().toISOString(),
    updated_at: row.updated_at || row.created_at,
  };
}

function serializeReturToDedicatedPayload(order: ReturBarangOrder, isNew: boolean = false): Record<string, any> {
  const payload: Record<string, any> = {
    no_retur: order.no_retur,
    no_pesanan_asal: order.no_pesanan_asal,
    outlet_order: order.outlet_order,
    kategori_alasan: order.kategori_alasan || 'tukar_size_model',
    alasan_retur: order.alasan_retur,
    opsi_pengiriman: order.opsi_pengiriman,
    nama_customer: order.nama_customer,
    no_hp: order.no_hp,
    alamat_lengkap: order.alamat_lengkap,
    produk_pesanan: order.produk_pesanan || [],
    produk_pengganti: order.produk_pengganti || [],
    penanggung_biaya: order.penanggung_biaya || 'customer',
    selisih_harga: order.selisih_harga !== null && order.selisih_harga !== undefined ? order.selisih_harga : 0,
    ongkir_dibayar: order.ongkir_dibayar !== null && order.ongkir_dibayar !== undefined ? order.ongkir_dibayar : 0,
    bukti_pembayaran_urls: order.bukti_pembayaran_urls || [],
    foto_komplain_urls: order.foto_komplain_urls || [],
    no_resi_customer: order.no_resi_customer || '',
    status_barang_retur: order.status_barang_retur || 'belum_dikirim',
    tgl_terima_gudang: order.tgl_terima_gudang || null,
    qc_penerima_gudang: order.qc_penerima_gudang || null,
    no_sj_gudang_retur: order.no_sj_gudang_retur || '',
    sj_gudang_updated_by: order.sj_gudang_updated_by || null,
    sj_gudang_updated_at: order.sj_gudang_updated_at || null,
    no_invoice_return: order.no_invoice_return || '',
    invoice_return_updated_by: order.invoice_return_updated_by || null,
    invoice_return_updated_at: order.invoice_return_updated_at || null,
    no_resi: order.no_resi || '',
    tanggal_kirim_resi: order.tanggal_kirim_resi || null,
    is_label_printed: !!order.is_label_printed,
    tgl_cetak_label: order.tgl_cetak_label || null,
    is_picking_printed: !!order.is_picking_printed,
    tgl_cetak_picking: order.tgl_cetak_picking || null,
    is_wa_picking_sent: !!order.is_wa_picking_sent,
    tgl_wa_picking: order.tgl_wa_picking || null,
    status: order.status || 'diterima',
    alasan_batal: order.alasan_batal || '',
    dibatalkan_oleh: order.dibatalkan_oleh || '',
    tgl_batal: order.tgl_batal || null,
    submitted_by: order.submitted_by || 'Tim CS',
    catatan_internal: order.catatan_internal || '',
    history_logs: order.history_logs || [],
    updated_at: new Date().toISOString(),
  };

  if (isNew) {
    payload.created_at = order.created_at || new Date().toISOString();
  }

  return payload;
}

export async function fetchReturOrders(): Promise<ReturBarangOrder[]> {
  try {
    const hasDedicated = await checkDedicatedReturTable();
    const returMap = new Map<string, ReturBarangOrder>();

    // 1. Ambil dari tabel khusus jika ada
    if (hasDedicated) {
      try {
        const dedicatedData = await supabaseFetch<any[]>(
          'retur_barang',
          'GET',
          null,
          'select=*&order=created_at.desc'
        );
        if (Array.isArray(dedicatedData)) {
          for (const row of dedicatedData) {
            if (row.status === 'DELETED') continue;
            const parsed = parseDbRowToReturOrder(row);
            if (parsed && parsed.no_retur) {
              returMap.set(parsed.no_retur, parsed);
            }
          }
        }
      } catch (errDed) {
        console.warn('Gagal membaca dari retur_barang, beralih ke manual_shipment:', errDed);
      }
    }

    // 2. Ambil dari manual_shipment (sebagai fallback atau sumber migrasi legacy)
    const fallbackData = await supabaseFetch<any[]>(
      'manual_shipment',
      'GET',
      null,
      'select=*&order=created_at.desc'
    );
    if (Array.isArray(fallbackData)) {
      for (const row of fallbackData) {
        if (row.status === 'DELETED') continue;
        const parsed = parseDbRowToReturOrder(row);
        if (parsed && parsed.no_retur && !returMap.has(parsed.no_retur)) {
          returMap.set(parsed.no_retur, parsed);
        }
      }
    }

    return Array.from(returMap.values());
  } catch (err) {
    console.warn('Gagal mengambil data Retur Barang:', err);
    return [];
  }
}

export async function submitReturOrder(
  order: ReturBarangOrder
): Promise<{ success: boolean; message: string }> {
  try {
    const hasDedicated = await checkDedicatedReturTable();
    if (hasDedicated) {
      const dedicatedPayload = serializeReturToDedicatedPayload(order, true);
      await supabaseFetch('retur_barang', 'POST', [dedicatedPayload]);
      return { success: true, message: 'Data Retur Barang berhasil disimpan ke tabel retur_barang' };
    }

    // Fallback simpan ke manual_shipment
    const dbPayload = serializeReturToDbPayload(order, true);
    await supabaseFetch('manual_shipment', 'POST', [dbPayload]);
    return { success: true, message: 'Data Retur Barang berhasil disimpan' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Gagal menyimpan data Retur Barang' };
  }
}

export async function updateReturOrder(
  order: ReturBarangOrder
): Promise<{ success: boolean; message: string }> {
  try {
    const hasDedicated = await checkDedicatedReturTable();
    if (hasDedicated) {
      const dedicatedPayload = serializeReturToDedicatedPayload(order, false);
      const filter = order.id
        ? `id=eq.${order.id}`
        : `no_retur=eq.${encodeURIComponent(order.no_retur)}`;
      await supabaseFetch('retur_barang', 'PATCH', dedicatedPayload, filter);
      return { success: true, message: 'Data Retur Barang berhasil diperbarui' };
    }

    // Fallback update ke manual_shipment
    const dbPayload = serializeReturToDbPayload(order, false);
    const filter = order.id
      ? `id=eq.${order.id}`
      : `no_pesanan=eq.${encodeURIComponent(order.no_retur)}`;
    await supabaseFetch('manual_shipment', 'PATCH', dbPayload, filter);
    return { success: true, message: 'Data Retur Barang berhasil diperbarui' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Gagal memperbarui data Retur Barang' };
  }
}

export async function deleteReturOrder(
  order: ReturBarangOrder
): Promise<{ success: boolean; message: string }> {
  try {
    const hasDedicated = await checkDedicatedReturTable();
    if (hasDedicated) {
      const filter = order.id
        ? `id=eq.${order.id}`
        : `no_retur=eq.${encodeURIComponent(order.no_retur)}`;
      await supabaseFetch('retur_barang', 'PATCH', { status: 'DELETED' }, filter);
      return { success: true, message: 'Data Retur Barang berhasil dihapus' };
    }

    // Fallback delete ke manual_shipment
    const filter = order.id
      ? `id=eq.${order.id}`
      : `no_pesanan=eq.${encodeURIComponent(order.no_retur)}`;
    await supabaseFetch('manual_shipment', 'PATCH', { status: 'DELETED' }, filter);
    return { success: true, message: 'Data Retur Barang berhasil dihapus' };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Gagal menghapus data Retur Barang' };
  }
}

/**
 * Kirim Email Notifikasi Resmi Pusat Resolusi via GAS (MailApp.sendEmail)
 */
export async function sendReturNotificationEmail(
  order: ReturBarangOrder,
  eventType: 'submit' | 'complete' | 'update' | 'resend' = 'submit'
): Promise<{ sent: boolean; message: string }> {
  try {
    const settings = await fetchPusatResolusiSettings();
    if (eventType === 'submit' && !settings.auto_email_on_submit) {
      return { sent: false, message: 'Auto-email saat submit dinonaktifkan di pengaturan' };
    }
    if (eventType === 'complete' && !settings.auto_email_on_complete) {
      return { sent: false, message: 'Auto-email saat selesai dinonaktifkan di pengaturan' };
    }

    const recipients = (settings.recipient_emails || [])
      .map(e => e.trim())
      .filter(e => e.includes('@'));
    if (recipients.length === 0) {
      return { sent: false, message: 'Belum ada daftar email penerima di Pengaturan Pusat Resolusi' };
    }

    const endpoint = (settings.gas_email_url || DEFAULT_PUSAT_RESOLUSI_EMAIL_GAS_URL).trim();
    if (!endpoint) {
      return { sent: false, message: 'URL Webhook GAS belum dikonfigurasi' };
    }

    const formatRp = (val: number | null | undefined) => {
      if (val === null || val === undefined || isNaN(Number(val))) return 'Belum diisi / -';
      return 'Rp ' + Number(val).toLocaleString('id-ID');
    };

    const kategoriLabel =
      order.kategori_alasan === 'defect_reject'
        ? 'Barang Defect / Reject'
        : order.kategori_alasan === 'salah_kirim'
        ? 'Salah Kirim Gudang / Store'
        : order.kategori_alasan === 'tukar_size_model'
        ? 'Tukar Size / Model (Customer)'
        : 'Lainnya';

    const origRowsHtml = (order.produk_pesanan || [])
      .map(
        (it, i) => `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${i + 1}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 700; color: #be123c;">${it.sku || '-'}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">${it.nama_produk || '-'}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${it.size || '-'}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 700;">${it.qty || 1}</td>
        </tr>`
      )
      .join('');

    const repRowsHtml = (order.produk_pengganti || [])
      .map(
        (it, i) => `
        <tr>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${i + 1}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; font-family: monospace; font-weight: 700; color: #047857;">${it.sku || '-'}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0;">${it.nama_produk || '-'}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">${it.size || '-'}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center; font-weight: 700;">${it.qty || 1}</td>
          <td style="padding: 8px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">
            <span style="background: #fef3c7; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">${it.fulfillment || 'Marketplace'}</span>
          </td>
        </tr>`
      )
      .join('');

    const buktiLinksHtml =
      order.bukti_pembayaran_urls && order.bukti_pembayaran_urls.length > 0
        ? order.bukti_pembayaran_urls
            .map(
              (url, idx) =>
                `<a href="${url}" target="_blank" style="display:inline-block; margin-right:8px; color:#2563eb; font-weight:600; text-decoration:underline;">Lampiran Bukti Bayar #${idx + 1}</a>`
            )
            .join(' ')
        : '<span style="color:#64748b;">Belum dilampirkan (menyusul)</span>';

    // STANDARISASI SUBJEK UTAS EMAIL (THREADING GUARANTEE & BACKWARD COMPATIBILITY):
    // Tiket yang di-submit sebelum standarisasi thread (sebelum 30 Okt 2026 20:45 WIB / 13:45 UTC)
    // memiliki subjek awal di inbox tim: [PENGAJUAN RETUR BARANG] #<no_pesanan_asal> (<outlet_order>) - <nama_customer>
    // Agar tiket-tiket lama ini saat di-update/diselesaikan TETAP BISA me-reply email yang sudah ada di inbox Gmail tim,
    // sistem otomatis mendeteksi tiket legacy dan memakai subjek asal tersebut dengan awalan 'Re: '.
    const THREAD_STANDARDIZATION_CUTOFF = new Date('2026-10-30T13:45:00.000Z').getTime();
    const orderCreatedAt = order.created_at ? new Date(order.created_at).getTime() : Date.now();
    const isLegacyTicket = orderCreatedAt < THREAD_STANDARDIZATION_CUTOFF;

    let baseSubject = '';
    if (isLegacyTicket) {
      // Format subjek tiket lama agar Gmail / Outlook langsung me-reply utas email yang sudah ada di inbox tim
      baseSubject = `[PENGAJUAN RETUR BARANG] #${order.no_pesanan_asal} (${order.outlet_order}) - ${order.nama_customer}`;
    } else {
      // Format subjek standar baru (konsisten untuk seluruh siklus tiket baru)
      baseSubject = `[RETUR BARANG] #${order.no_pesanan_asal} (${order.outlet_order}) - ${order.nama_customer} [${order.no_retur}]`;
    }

    // Saat submit awal (pesanan baru): menggunakan Subjek Dasar asli.
    // Saat ada update / proses selesai / kirim ulang: diberi awalan 'Re: ' persis standar balasan email.
    // Dengan begitu, sistem email otomatis mengenalinya sebagai reply resmi pada thread yang sama.
    const subject = eventType === 'submit' ? baseSubject : `Re: ${baseSubject}`;

    const headerBg =
      eventType === 'complete'
        ? '#065f46'
        : eventType === 'update'
        ? '#1e3a8a'
        : eventType === 'resend'
        ? '#334155'
        : '#881337';

    const headerTitle =
      eventType === 'complete'
        ? 'PROSES RETUR BARANG SELESAI & SUDAH DIKIRIM'
        : eventType === 'update'
        ? 'PEMBARUAN DATA & STATUS RETUR BARANG'
        : eventType === 'resend'
        ? 'NOTIFIKASI TIKET RETUR BARANG (KIRIM ULANG)'
        : 'REGISTRASI RETUR BARANG BARU — PUSAT RESOLUSI';

    let statusAlertBannerHtml = '';
    if (eventType === 'complete') {
      statusAlertBannerHtml = `
        <div style="background: #ecfdf5; border: 2px solid #10b981; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;">
          <div style="font-size: 14px; font-weight: 800; color: #065f46; margin-bottom: 6px;">
            ✅ UPDATE: BARANG PENGGANTI TELAH DIKIRIM (RETUR SELESAI)
          </div>
          <table style="width: 100%; font-size: 13px; color: #047857;">
            <tr>
              <td style="width: 32%; padding: 3px 0; color: #065f46;"><strong>No. Resi Pengiriman:</strong></td>
              <td style="padding: 3px 0;"><span style="font-family: monospace; font-size: 14px; font-weight: 800; color: #0f172a; background: #ffffff; padding: 3px 8px; border: 1px solid #a7f3d0; border-radius: 4px;">${order.no_resi || '-'}</span></td>
            </tr>
            <tr>
              <td style="padding: 3px 0; color: #065f46;"><strong>Ekspedisi / Kurir:</strong></td>
              <td style="padding: 3px 0; font-weight: 700;">${order.opsi_pengiriman || '-'}</td>
            </tr>
            <tr>
              <td style="padding: 3px 0; color: #065f46;"><strong>Status Tiket:</strong></td>
              <td style="padding: 3px 0;"><span style="background: #059669; color: #ffffff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 800;">SELESAI (CLOSED)</span></td>
            </tr>
          </table>
        </div>
      `;
    } else if (eventType === 'update') {
      statusAlertBannerHtml = `
        <div style="background: #eff6ff; border: 2px solid #3b82f6; border-radius: 8px; padding: 14px 18px; margin-bottom: 20px;">
          <div style="font-size: 14px; font-weight: 800; color: #1e40af; margin-bottom: 4px;">
            📝 UPDATE: PEMBARUAN DATA TIKET RETUR
          </div>
          <div style="font-size: 12.5px; color: #1d4ed8; line-height: 1.5;">
            Terdapat pembaruan data rincian tiket retur ini oleh tim. Rincian status dan dokumen terbaru tercantum di bawah.
          </div>
        </div>
      `;
    } else if (eventType === 'resend') {
      statusAlertBannerHtml = `
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
          <div style="font-size: 13px; font-weight: 700; color: #334155;">
            🔄 Notifikasi Kirim Ulang Tiket Retur Barang
          </div>
          <div style="font-size: 12px; color: #64748b; margin-top: 3px;">
            Email ini dikirim ulang secara manual oleh tim untuk koordinasi tiket retur.
          </div>
        </div>
      `;
    } else {
      statusAlertBannerHtml = `
        <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
          <div style="font-size: 13px; font-weight: 700; color: #9f1239;">
            📌 Tiket Retur Baru telah diregistrasi oleh Tim CS (${order.submitted_by}).
          </div>
          <div style="font-size: 12px; color: #be123c; margin-top: 3px;">
            Harap tim terkait mempersiapkan pengecekan fisik barang dan proses produk pengganti.
          </div>
        </div>
      `;
    }

    const htmlBody = `
      <div style="max-width: 680px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #1e293b;">
        <div style="background: ${headerBg}; color: #ffffff; padding: 24px; text-align: center;">
          <div style="font-size: 19px; font-weight: 800; letter-spacing: 2px; text-transform: uppercase;">CHOCOCHIPS — PUSAT RESOLUSI</div>
          <div style="font-size: 13px; font-weight: 700; margin-top: 8px; color: #fecdd3;">${headerTitle}</div>
          <div style="font-size: 12px; margin-top: 4px; color: #e2e8f0;">No. Tiket Retur: <strong>${order.no_retur}</strong> • Waktu: ${new Date().toLocaleString('id-ID')}</div>
        </div>

        <div style="padding: 24px;">
          ${statusAlertBannerHtml}
          <table style="width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 18px;">
            <tr>
              <td style="padding: 6px 0; color: #64748b; width: 38%;"><strong>No. Pesanan Asal:</strong></td>
              <td style="padding: 6px 0; font-weight: 700; color: #0f172a;">${order.no_pesanan_asal}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Outlet Order:</strong></td>
              <td style="padding: 6px 0; font-weight: 700; color: #be123c;">${order.outlet_order}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Kategori & Alasan Retur:</strong></td>
              <td style="padding: 6px 0;"><strong>[${kategoriLabel}]</strong> ${order.alasan_retur}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Opsi Pengiriman:</strong></td>
              <td style="padding: 6px 0; font-weight: 700;">${order.opsi_pengiriman}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Nama Customer & No. HP:</strong></td>
              <td style="padding: 6px 0; font-weight: 700;">${order.nama_customer} (${order.no_hp})</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Alamat Lengkap:</strong></td>
              <td style="padding: 6px 0;">${order.alamat_lengkap}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #64748b;"><strong>Diinput Oleh (CS):</strong></td>
              <td style="padding: 6px 0;">${order.submitted_by}</td>
            </tr>
          </table>

          <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #be123c; margin-bottom: 6px;">1. Produk Pesanan Awal (Barang Diretur)</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e2e8f0; margin-bottom: 18px;">
            <thead>
              <tr style="background: #fff1f2; color: #881337;">
                <th style="padding: 8px 10px; text-align: center;">No</th>
                <th style="padding: 8px 10px; text-align: left;">SKU</th>
                <th style="padding: 8px 10px; text-align: left;">Nama Produk</th>
                <th style="padding: 8px 10px; text-align: center;">Size</th>
                <th style="padding: 8px 10px; text-align: center;">Qty</th>
              </tr>
            </thead>
            <tbody>${origRowsHtml}</tbody>
          </table>

          <div style="font-size: 12px; font-weight: 800; text-transform: uppercase; color: #047857; margin-bottom: 6px;">2. Produk Pengganti (Dikirim ke Customer)</div>
          <table style="width: 100%; border-collapse: collapse; font-size: 12px; border: 1px solid #e2e8f0; margin-bottom: 18px;">
            <thead>
              <tr style="background: #ecfdf5; color: #065f46;">
                <th style="padding: 8px 10px; text-align: center;">No</th>
                <th style="padding: 8px 10px; text-align: left;">SKU</th>
                <th style="padding: 8px 10px; text-align: left;">Nama Produk Pengganti</th>
                <th style="padding: 8px 10px; text-align: center;">Size</th>
                <th style="padding: 8px 10px; text-align: center;">Qty</th>
                <th style="padding: 8px 10px; text-align: center;">Fulfillment</th>
              </tr>
            </thead>
            <tbody>${repRowsHtml}</tbody>
          </table>

          <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; font-size: 12.5px;">
            <div style="font-weight: 800; color: #0f172a; margin-bottom: 8px; text-transform: uppercase;">Rincian Biaya, DealPOS & Resi</div>
            <div>• <strong>Penanggung Biaya:</strong> ${order.penanggung_biaya === 'toko_free' ? 'Ditanggung Toko / Free Ongkir' : 'Ditanggung Customer'}</div>
            <div>• <strong>Selisih Harga yang Harus Dibayar:</strong> ${formatRp(order.selisih_harga)}</div>
            <div>• <strong>Ongkir yang Perlu Dibayar:</strong> ${formatRp(order.ongkir_dibayar)}</div>
            <div>• <strong>Bukti Pembayaran:</strong> ${buktiLinksHtml}</div>
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed #cbd5e1;">
              <div>• <strong>SJ DealPOS (to Gudang Retur):</strong> ${order.no_sj_gudang_retur || 'Belum diisi Admin'}</div>
              <div>• <strong>Invoice Return DealPOS:</strong> ${order.no_invoice_return || 'Belum diisi Admin'}</div>
              <div>• <strong>No. Resi Pengiriman Pengganti:</strong> ${order.no_resi || 'Belum dikirim'}</div>
            </div>
          </div>

          <div style="margin-top: 24px; padding-top: 14px; border-top: 1px dashed #cbd5e1; text-align: center; font-size: 11px; color: #64748b;">
            💬 <em>Email ini dikirim otomatis oleh WMS Pusat Resolusi. Setiap pembaruan status akan dikirimkan sebagai balasan (reply) dalam utas/thread percakapan ini tanpa mengubah subjek.</em>
          </div>
        </div>
      </div>
    `;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'sendEmail',
        to: recipients.join(','),
        cc: (settings.cc_emails || []).filter(e => e.includes('@')).join(','),
        subject,
        htmlBody,
        fromName: settings.from_name || 'Chocochips - Pusat Resolusi',
      }),
    });

    if (!res.ok) {
      return { sent: false, message: `HTTP ${res.status}` };
    }
    const json = await res.json().catch(() => null);
    if (json && json.success === false) {
      return { sent: false, message: json.error || 'Gagal mengirim email' };
    }
    return { sent: true, message: `Email terkirim ke ${recipients.length} alamat tim` };
  } catch (err: any) {
    return { sent: false, message: err?.message || 'Gagal mengirim email notifikasi' };
  }
}

/**
 * Uji coba pengiriman email langsung dari Pengaturan Pusat Resolusi
 */
export async function sendTestNotificationEmail(
  targetEmail: string,
  fromName = 'Chocochips - Pusat Resolusi'
): Promise<{ success: boolean; message: string }> {
  try {
    const cleanTo = (targetEmail || '').trim();
    if (!cleanTo || !cleanTo.includes('@')) {
      return { success: false, message: 'Alamat email penerima tidak valid' };
    }

    const settings = await fetchPusatResolusiSettings();
    const endpoint = (settings.gas_email_url || DEFAULT_PUSAT_RESOLUSI_EMAIL_GAS_URL).trim();
    if (!endpoint) {
      return { success: false, message: 'Endpoint GAS Email belum dikonfigurasi' };
    }

    const testSubject = '[TEST WMS] Uji Coba Pengiriman Email Pusat Resolusi';
    const testHtml = `
      <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-family: sans-serif; color: #1e293b;">
        <div style="background: #881337; color: #ffffff; padding: 20px; text-align: center;">
          <h2 style="margin: 0; font-size: 18px; letter-spacing: 1px;">CHOCOCHIPS — PUSAT RESOLUSI</h2>
          <p style="margin: 6px 0 0 0; font-size: 13px; color: #fecdd3;">TES INTEGRASI EMAIL VIA GOOGLE APPS SCRIPT</p>
        </div>
        <div style="padding: 20px;">
          <p style="font-size: 14px; color: #047857; font-weight: 700; margin-top: 0;">
            ✅ Koneksi webhook email Google Apps Script berhasil terhubung!
          </p>
          <p style="font-size: 13px; color: #475569; line-height: 1.6;">
            Email ini mengonfirmasi bahwa konfigurasi notifikasi otomatis tiket retur barang pada modul Pusat Resolusi telah aktif dan dapat mengirim email secara otomatis.
          </p>
          <div style="margin-top: 16px; padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; font-size: 12px; color: #64748b;">
            • Waktu Pengujian: <strong>${new Date().toLocaleString('id-ID')}</strong><br/>
            • Endpoint Webhook: <code>${endpoint}</code><br/>
            • Penerima Tes: <strong>${cleanTo}</strong>
          </div>
        </div>
      </div>
    `;

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'sendEmail',
        to: cleanTo,
        subject: testSubject,
        htmlBody: testHtml,
        fromName,
      }),
    });

    if (!res.ok) {
      return { success: false, message: `HTTP ${res.status}` };
    }
    const json = await res.json().catch(() => null);
    if (json && json.success === false) {
      return { success: false, message: json.error || 'GAS menolak pengiriman email' };
    }
    return { success: true, message: json?.message || `Email tes berhasil dikirim ke ${cleanTo}` };
  } catch (err: any) {
    return { success: false, message: err?.message || 'Gagal menghubungi server GAS Email' };
  }
}

