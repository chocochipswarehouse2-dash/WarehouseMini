import * as XLSX from 'xlsx';
import { ProductItem } from '../types';
import {
  supabaseFetch,
  fetchSupabaseWatermark,
  getSystemDocs,
  saveSystemDoc,
} from './supabase';
import { getLocalDbMeta, setLocalDbMeta } from './localDb';
import { lookupProductBySku } from '../utils/productLookup';

export type CourierGroup = 'INSTAN' | 'SAMEDAY' | 'JNE' | 'SPX_STANDARD' | 'LAINNYA';
export type ServiceTier = 'instan' | 'sameday' | 'reguler';
export type OnlineWmsStatus =
  | 'new'
  | 'preorder'
  | 'processing'
  | 'packed'
  | 'ready_pickup'
  | 'handed_over'
  | 'hold'
  | 'check'
  | 'cancelled'
  | 'returned';

export type ShopeeImportMode = 'perlu_dikirim' | 'semua_audit';

export type NormalizedMarketplaceStatus =
  | 'perlu_dikirim'
  | 'batal'
  | 'sedang_dikirim'
  | 'telah_dikirim'
  | 'selesai'
  | 'belum_bayar'
  | 'lainnya';

export interface OnlineOrderItem {
  sku: string;
  sku_raw: string;
  nama_produk: string;
  size: string;
  variation_raw: string;
  qty: number;
  item_type: 'sale' | 'gift' | 'packaging';
  check_mode: 'scan' | 'manual_check';
  is_master_mapped: boolean;
  lokasi?: string;
  qty_picked?: number;
  qty_packed?: number;
}

export interface ManualEditLog {
  timestamp: string;
  actor: string;
  reason: string;
  old_items: OnlineOrderItem[];
  new_items: OnlineOrderItem[];
}

export interface OnlineOrder {
  id: string;
  marketplace: 'shopee' | string;
  order_source: string;
  order_no: string;
  tracking_no: string;
  courier_raw: string;
  courier_name: string;
  courier_group: CourierGroup;
  service_tier: ServiceTier;
  marketplace_status: string;
  wms_status: OnlineWmsStatus;
  order_created_at: string;
  paid_at: string;
  ship_by_deadline: string;
  shipping_arranged_at: string;
  is_preorder: boolean;
  preorder_reason: string;
  has_resi_on_first_import: boolean;
  urgent_resi_alert: boolean;
  is_manual_edited: boolean;
  manual_edit_logs: ManualEditLog[];
  hold_reason: string;
  hold_detected_stage: string;
  check_reason: string;
  cancel_reason: string;
  daily_seq_date: string;
  daily_seq_no: number | null;
  batch_id: string;
  basket_code: string;
  buyer_username: string;
  recipient_name: string;
  recipient_phone: string;
  shipping_address: string;
  city: string;
  province: string;
  buyer_note: string;
  seller_note: string;
  items: OnlineOrderItem[];
  last_import_mode: ShopeeImportMode | string;
  last_imported_at: string;
  imported_by: string;
  created_at: string;
  updated_at: string;
}

export interface OnlineImportSummary {
  newOrders: number;
  preorderOrders: number;
  resiUpdated: number;
  holdFromCancel: number;
  cancelledDirect: number;
  statusProgressed: number;
  flaggedCheck: number;
  skipped: number;
  ignoredNonActive: number;
  unmappedSkuCount: number;
  urgentResiCount: number;
}

export interface OnlineImportJob {
  id: string;
  marketplace: string;
  import_mode: ShopeeImportMode | string;
  file_name: string;
  total_rows: number;
  total_orders: number;
  summary: OnlineImportSummary;
  imported_by: string;
  created_at: string;
}

export interface SpecialItemRule {
  code: string;
  label: string;
  itemType: 'gift' | 'packaging';
  checkMode: 'scan' | 'manual_check';
}

export interface ImportTemplateConfig {
  id: string;
  marketplace: string;
  name: string;
  sheetName: string;
  signatureColumns: string[];
  columnMap: Record<string, string>;
}

export interface OnlineFulfilmentSetup {
  courierGroupOrder: CourierGroup[];
  closingHour: string;
  preorderThresholdDays: number;
  preorderSkus: string[];
  autoProcessPreorder: boolean;
  storePriority: string[];
  maxStoresShown: number;
  minStoreStock: number;
  specialItems: SpecialItemRule[];
  importStaleness: {
    regulerWarnMin: number;
    regulerBlockMin: number;
    instantWarnMin: number;
    instantBlockMin: number;
  };
  waAlertPhones: string[];
  templates: ImportTemplateConfig[];
  updated_at?: string;
}

export interface ParsedShopeeOrder {
  order_no: string;
  marketplace_status: string;
  normalized_status: NormalizedMarketplaceStatus;
  cancel_reason: string;
  tracking_no: string;
  courier_raw: string;
  courier_name: string;
  courier_group: CourierGroup;
  service_tier: ServiceTier;
  order_created_at: string;
  paid_at: string;
  ship_by_deadline: string;
  shipping_arranged_at: string;
  buyer_username: string;
  recipient_name: string;
  recipient_phone: string;
  shipping_address: string;
  city: string;
  province: string;
  buyer_note: string;
  seller_note: string;
  items: OnlineOrderItem[];
  is_preorder: boolean;
  preorder_reason: string;
}

export interface ParsedShopeeWorkbookResult {
  marketplace: 'shopee';
  sheetName: string;
  detectedMode: ShopeeImportMode;
  totalRows: number;
  orders: ParsedShopeeOrder[];
  hasCancelReasonColumn: boolean;
}

export interface PreviewOrderDiffItem {
  order_no: string;
  recipient_name: string;
  courier_name: string;
  courier_group: CourierGroup;
  tracking_no: string;
  detail: string;
  urgent?: boolean;
  order: OnlineOrder;
}

export interface OnlineImportPreview {
  fileName: string;
  marketplace: 'shopee';
  detectedMode: ShopeeImportMode;
  totalRows: number;
  totalOrdersInFile: number;
  summary: OnlineImportSummary;
  newOrders: PreviewOrderDiffItem[];
  preorderOrders: PreviewOrderDiffItem[];
  resiUpdated: PreviewOrderDiffItem[];
  holdFromCancel: PreviewOrderDiffItem[];
  cancelledDirect: PreviewOrderDiffItem[];
  statusProgressed: PreviewOrderDiffItem[];
  flaggedCheck: PreviewOrderDiffItem[];
  unmappedSkus: Array<{ sku: string; productName: string; order_no: string }>;
  ordersToUpsert: OnlineOrder[];
}

export const COURIER_GROUP_LABELS: Record<CourierGroup, string> = {
  INSTAN: 'Instan',
  SAMEDAY: 'Same Day',
  JNE: 'JNE',
  SPX_STANDARD: 'SPX Standard',
  LAINNYA: 'Lainnya',
};

export const DEFAULT_ONLINE_FULFILMENT_SETUP: OnlineFulfilmentSetup = {
  courierGroupOrder: ['INSTAN', 'SAMEDAY', 'JNE', 'SPX_STANDARD', 'LAINNYA'],
  closingHour: '19:00',
  preorderThresholdDays: 5,
  preorderSkus: [],
  autoProcessPreorder: false,
  storePriority: ['BTS', 'PIK', 'KLP'],
  maxStoresShown: 3,
  minStoreStock: 1,
  specialItems: [
    { code: 'freeleatherwallet', label: 'Free Leather Wallet', itemType: 'gift', checkMode: 'manual_check' },
    { code: 'bagkecil', label: 'Paper Bag Kecil', itemType: 'packaging', checkMode: 'manual_check' },
    { code: 'BAGBESAR', label: 'Paper Bag Besar', itemType: 'packaging', checkMode: 'manual_check' },
    { code: 'bubblewrap', label: 'Bubble Wrap', itemType: 'packaging', checkMode: 'manual_check' },
  ],
  importStaleness: {
    regulerWarnMin: 60,
    regulerBlockMin: 180,
    instantWarnMin: 30,
    instantBlockMin: 60,
  },
  waAlertPhones: [],
  templates: [
    {
      id: 'shopee_default_v1',
      marketplace: 'shopee',
      name: 'Shopee Export (Perlu Dikirim & Semua)',
      sheetName: 'orders',
      signatureColumns: ['No. Pesanan', 'Opsi Pengiriman', 'Nomor Referensi SKU'],
      columnMap: {
        order_no: 'No. Pesanan',
        status: 'Status Pesanan',
        cancel_reason: 'Alasan Pembatalan',
        tracking_no: 'No. Resi',
        courier: 'Opsi Pengiriman',
        deadline: 'Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)',
        shipping_arranged_at: 'Waktu Pengiriman Diatur',
        created_at: 'Waktu Pesanan Dibuat',
        paid_at: 'Waktu Pembayaran Dilakukan',
        sku: 'Nomor Referensi SKU',
        sku_parent: 'SKU Induk',
        product_name: 'Nama Produk',
        variation: 'Nama Variasi',
        qty: 'Jumlah',
        buyer_note: 'Catatan dari Pembeli',
        seller_note: 'Catatan',
        buyer_username: 'Username (Pembeli)',
        recipient_name: 'Nama Penerima',
        recipient_phone: 'No. Telepon',
        address: 'Alamat Pengiriman',
        city: 'Kota/Kabupaten',
        province: 'Provinsi',
      },
    },
  ],
};

// =========================================================================
// CACHE & EGRESS CONSTANTS
// =========================================================================
const ORDERS_SELECT_COLS =
  'id,marketplace,order_source,order_no,tracking_no,courier_raw,courier_name,courier_group,service_tier,marketplace_status,wms_status,order_created_at,paid_at,ship_by_deadline,shipping_arranged_at,is_preorder,preorder_reason,has_resi_on_first_import,urgent_resi_alert,is_manual_edited,manual_edit_logs,hold_reason,hold_detected_stage,check_reason,cancel_reason,daily_seq_date,daily_seq_no,batch_id,basket_code,buyer_username,recipient_name,recipient_phone,shipping_address,city,province,buyer_note,seller_note,items,last_import_mode,last_imported_at,imported_by,created_at,updated_at';
const JOBS_SELECT_COLS =
  'id,marketplace,import_mode,file_name,total_rows,total_orders,summary,imported_by,created_at';

const DOCS_SECTION_ORDERS = 'wms_online_orders_v1';
const DOCS_SECTION_IMPORT_JOBS = 'wms_online_import_jobs_v1';
const DOCS_SECTION_SETUP = 'wms_online_fulfilment_setup_v1';

const IDB_ORDERS_KEY = 'wms_online_orders_idb_v1';
const IDB_JOBS_KEY = 'wms_online_import_jobs_idb_v1';
const IDB_SETUP_KEY = 'wms_online_fulfilment_setup_idb_v1';

const SWR_TTL_MS = 60 * 1000;

let ordersMemoryCache: {
  orders: OnlineOrder[];
  storageMode: 'table' | 'system_docs';
  watermark: string;
  count: number;
  ts: number;
} | null = null;
let inflightOrdersPromise: Promise<{ orders: OnlineOrder[]; storageMode: 'table' | 'system_docs' }> | null = null;

let setupMemoryCache: { setup: OnlineFulfilmentSetup; watermark: string; ts: number } | null = null;
let inflightSetupPromise: Promise<OnlineFulfilmentSetup> | null = null;

let jobsMemoryCache: { jobs: OnlineImportJob[]; ts: number } | null = null;
let inflightJobsPromise: Promise<OnlineImportJob[]> | null = null;

let tableModeKnown: 'table' | 'system_docs' | null = null;

function isMissingTableError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '').toLowerCase();
  return (
    msg.includes('42p01') ||
    msg.includes('pgrst205') ||
    msg.includes('could not find the table') ||
    msg.includes('does not exist') ||
    (msg.includes('(404)') && (msg.includes('online_orders') || msg.includes('online_import_jobs')))
  );
}

export function invalidateOnlineFulfilmentCache(): void {
  ordersMemoryCache = null;
  jobsMemoryCache = null;
}

export function invalidateOnlineSetupCache(): void {
  setupMemoryCache = null;
}

// =========================================================================
// NORMALIZATION & DATE HELPERS (PURE, BROWSER + NODE SAFE)
// =========================================================================

export function normalizeShopeeCourier(raw: string): {
  courierName: string;
  courierGroup: CourierGroup;
  serviceTier: ServiceTier;
} {
  const s = String(raw || '').trim();
  const lower = s.toLowerCase();

  let courierGroup: CourierGroup = 'LAINNYA';
  let serviceTier: ServiceTier = 'reguler';
  let courierName = s || 'Lainnya';

  if (lower.includes('instant')) {
    courierGroup = 'INSTAN';
    serviceTier = 'instan';
    if (lower.includes('prioritas')) courierName = 'SPX Instant Prioritas';
    else if (lower.includes('spx') || lower.includes('shopee xpress')) courierName = 'SPX Instant';
    else if (lower.includes('grab')) courierName = 'GrabExpress Instant';
    else if (lower.includes('gosend') || lower.includes('go-send')) courierName = 'GoSend Instant';
    else courierName = s.replace(/^Instant\s*[-:]?\s*/i, '').trim() || 'Instant';
  } else if (lower.includes('same day') || lower.includes('sameday')) {
    courierGroup = 'SAMEDAY';
    serviceTier = 'sameday';
    if (lower.includes('spx') || lower.includes('shopee xpress')) courierName = 'SPX Sameday';
    else if (lower.includes('gosend') || lower.includes('go-send')) courierName = 'GoSend Same Day';
    else if (lower.includes('grab')) courierName = 'GrabExpress Sameday';
    else courierName = s.replace(/^Same\s*Day\s*[-:]?\s*/i, '').trim() || 'Same Day';
  } else if (lower.includes('jne')) {
    courierGroup = 'JNE';
    serviceTier = 'reguler';
    if (lower.includes('yes')) courierName = 'JNE YES';
    else if (lower.includes('jtr') || lower.includes('trucking')) courierName = 'JNE JTR';
    else courierName = 'JNE Reguler';
  } else if (lower.includes('spx standard') || lower.includes('spx standar') || lower.includes('shopee xpress standard')) {
    courierGroup = 'SPX_STANDARD';
    serviceTier = 'reguler';
    courierName = 'SPX Standard';
  } else {
    courierGroup = 'LAINNYA';
    serviceTier = 'reguler';
    if (lower.includes('spx hemat') || lower.includes('shopee xpress hemat')) courierName = 'SPX Hemat';
    else if (lower.includes('sicepat')) courierName = s.replace(/^.*[-:]\s*/, '').trim() || 'SiCepat';
    else if (lower.includes('j&t') || lower.includes('jnt')) courierName = s.replace(/^.*[-:]\s*/, '').trim() || 'J&T';
    else if (lower.includes('anteraja')) courierName = 'AnterAja';
    else courierName = s.replace(/^(Reguler\s*\(Cashless\)|Hemat\s*Kargo|Hemat|Cargo|Kargo|Next\s*Day)\s*[-:]?\s*/i, '').trim() || s;
  }

  return { courierName, courierGroup, serviceTier };
}

export function normalizeShopeeStatus(raw: string): NormalizedMarketplaceStatus {
  const lower = String(raw || '').trim().toLowerCase();
  if (!lower) return 'lainnya';
  if (lower.startsWith('perlu dikirim')) return 'perlu_dikirim';
  if (lower.startsWith('batal')) return 'batal';
  if (lower.startsWith('sedang dikirim')) return 'sedang_dikirim';
  if (lower.startsWith('telah dikirim')) return 'telah_dikirim';
  if (lower.startsWith('selesai') || lower.startsWith('pesanan diterima')) return 'selesai';
  if (lower.startsWith('belum bayar')) return 'belum_bayar';
  return 'lainnya';
}

export function cleanMarketplaceProductTitle(title: string): string {
  const raw = String(title || '').trim();
  if (!raw) return '';
  const withoutBrand = raw.replace(/^chocochips\s*[-–—:]\s*/i, '').trim();
  const parts = withoutBrand.split(/[\/|]/);
  if (parts.length > 1 && parts[0].trim().length >= 3) {
    return parts[0].trim();
  }
  return withoutBrand;
}

function parseFlexibleDateMs(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    // Excel serial date
    const utcDays = Math.floor(raw - 25569);
    const utcValue = utcDays * 86400 * 1000;
    const fractional = raw - Math.floor(raw);
    return utcValue + Math.round(fractional * 86400 * 1000);
  }
  const s = String(raw).trim();
  if (!s) return null;
  // YYYY-MM-DD HH:mm(:ss)?
  const isoLike = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (isoLike) {
    const d = new Date(
      Number(isoLike[1]),
      Number(isoLike[2]) - 1,
      Number(isoLike[3]),
      Number(isoLike[4] || 0),
      Number(isoLike[5] || 0),
      Number(isoLike[6] || 0)
    );
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  // DD/MM/YYYY HH:mm or DD-MM-YYYY HH:mm
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (dmy) {
    const d = new Date(
      Number(dmy[3]),
      Number(dmy[2]) - 1,
      Number(dmy[1]),
      Number(dmy[4] || 0),
      Number(dmy[5] || 0),
      Number(dmy[6] || 0)
    );
    return Number.isNaN(d.getTime()) ? null : d.getTime();
  }
  const fallback = Date.parse(s);
  return Number.isNaN(fallback) ? null : fallback;
}

function formatCellString(val: unknown): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number' && Number.isFinite(val) && val > 35000 && val < 70000) {
    const ms = parseFlexibleDateMs(val);
    if (ms !== null) {
      const d = new Date(ms);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
  }
  return String(val).trim();
}

function getFieldValue(row: Record<string, unknown>, candidates: string[]): string {
  for (const col of candidates) {
    if (col in row) {
      const v = formatCellString(row[col]);
      if (v) return v;
    }
  }
  // Case-insensitive trimmed fallback
  const keys = Object.keys(row);
  for (const col of candidates) {
    const target = col.trim().toLowerCase();
    const matched = keys.find((k) => k.trim().toLowerCase() === target);
    if (matched) {
      const v = formatCellString(row[matched]);
      if (v) return v;
    }
  }
  return '';
}

function isPreorderByDeadline(createdAt: string, deadline: string, thresholdDays: number): boolean {
  const cMs = parseFlexibleDateMs(createdAt);
  const dMs = parseFlexibleDateMs(deadline);
  if (cMs === null || dMs === null) return false;
  const diffDays = (dMs - cMs) / (1000 * 60 * 60 * 24);
  return diffDays > thresholdDays;
}

// =========================================================================
// PARSER WORKBOOK SHOPEE DUAL-MODE
// =========================================================================

export function parseShopeeWorkbook(
  workbook: XLSX.WorkBook,
  setup: OnlineFulfilmentSetup = DEFAULT_ONLINE_FULFILMENT_SETUP,
  productCatalog: ProductItem[] = []
): ParsedShopeeWorkbookResult {
  const targetSheetName =
    workbook.SheetNames.find((s) => s.trim().toLowerCase() === 'orders') || workbook.SheetNames[0];
  if (!targetSheetName) {
    throw new Error('File tidak memiliki sheet data pesanan.');
  }

  const sheet = workbook.Sheets[targetSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (!rows.length) {
    return {
      marketplace: 'shopee',
      sheetName: targetSheetName,
      detectedMode: 'perlu_dikirim',
      totalRows: 0,
      orders: [],
      hasCancelReasonColumn: false,
    };
  }

  const headers = Object.keys(rows[0]).map((h) => h.trim().toLowerCase());
  const hasOrderCol = headers.includes('no. pesanan') || headers.includes('no pesanan');
  if (!hasOrderCol) {
    throw new Error('Format file belum dikenali sebagai ekspor Shopee (kolom "No. Pesanan" tidak ditemukan).');
  }

  const hasCancelReasonColumn = headers.includes('alasan pembatalan');
  const specialMap = new Map<string, SpecialItemRule>();
  for (const rule of setup.specialItems || []) {
    const k = String(rule.code || '').trim().toUpperCase();
    if (k) specialMap.set(k, rule);
  }
  const preorderSkuSet = new Set(
    (setup.preorderSkus || []).map((s) => String(s || '').trim().toUpperCase()).filter(Boolean)
  );

  const grouped = new Map<string, ParsedShopeeOrder>();
  let sawNonPerluDikirimAuditStatus = false;

  for (const row of rows) {
    const orderNo = getFieldValue(row, ['No. Pesanan', 'No Pesanan']);
    if (!orderNo) continue;

    const rawStatus = getFieldValue(row, ['Status Pesanan']);
    const normalizedStatus = normalizeShopeeStatus(rawStatus);
    if (
      normalizedStatus === 'batal' ||
      normalizedStatus === 'selesai' ||
      normalizedStatus === 'telah_dikirim' ||
      normalizedStatus === 'belum_bayar'
    ) {
      sawNonPerluDikirimAuditStatus = true;
    }

    const cancelReason = getFieldValue(row, ['Alasan Pembatalan']);
    const trackingNo = getFieldValue(row, ['No. Resi', 'No Resi']);
    const courierRaw = getFieldValue(row, ['Opsi Pengiriman']);
    const courier = normalizeShopeeCourier(courierRaw);
    const createdAt = getFieldValue(row, ['Waktu Pesanan Dibuat']);
    const paidAt = getFieldValue(row, ['Waktu Pembayaran Dilakukan']);
    const deadline = getFieldValue(row, [
      'Pesanan Harus Dikirimkan Sebelum (Menghindari keterlambatan)',
      'Batas Waktu Pengiriman',
    ]);
    const shippingArrangedAt = getFieldValue(row, ['Waktu Pengiriman Diatur']);

    const skuRef = getFieldValue(row, ['Nomor Referensi SKU', 'SKU Induk']);
    const skuClean = skuRef.trim().toUpperCase();
    const rawProductName = getFieldValue(row, ['Nama Produk']);
    const variationRaw = getFieldValue(row, ['Nama Variasi']);
    const qtyRaw = Number(getFieldValue(row, ['Jumlah']) || 1);
    const qty = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.round(qtyRaw) : 1;

    const specialRule = skuClean ? specialMap.get(skuClean) : undefined;
    const lookup = !specialRule && skuClean ? lookupProductBySku(skuClean, productCatalog) : null;

    let itemType: 'sale' | 'gift' | 'packaging' = 'sale';
    let checkMode: 'scan' | 'manual_check' = 'scan';
    let officialName = cleanMarketplaceProductTitle(rawProductName) || skuClean || 'Produk Tanpa Nama';
    let officialSize = variationRaw || '-';
    let isMasterMapped = false;

    if (specialRule) {
      itemType = specialRule.itemType;
      checkMode = specialRule.checkMode;
      officialName = specialRule.label || officialName;
      officialSize = '-';
      // Hadiah yang terdaftar di Master Produk tetap wajib scan
      const masterCheck = lookupProductBySku(skuClean, productCatalog);
      if (masterCheck.found && itemType === 'gift') {
        checkMode = 'scan';
        officialName = masterCheck.nama_produk;
        officialSize = masterCheck.size || '-';
        isMasterMapped = true;
      }
    } else if (lookup && lookup.found) {
      officialName = lookup.nama_produk;
      officialSize = lookup.size || '-';
      isMasterMapped = true;
    }

    const orderItem: OnlineOrderItem = {
      sku: skuClean || rawProductName.slice(0, 24).toUpperCase(),
      sku_raw: skuRef,
      nama_produk: officialName,
      size: officialSize,
      variation_raw: variationRaw,
      qty,
      item_type: itemType,
      check_mode: checkMode,
      is_master_mapped: isMasterMapped,
      lokasi: lookup?.masterItem?.lokasi || '',
    };

    const existing = grouped.get(orderNo);
    if (!existing) {
      const deadlinePreorder = isPreorderByDeadline(createdAt, deadline, setup.preorderThresholdDays || 5);
      const skuPreorder = Boolean(skuClean && preorderSkuSet.has(skuClean));
      const preorderReasons: string[] = [];
      if (deadlinePreorder) preorderReasons.push(`Tenggat > ${setup.preorderThresholdDays || 5} hari`);
      if (skuPreorder) preorderReasons.push(`SKU Pre-order (${skuClean})`);

      grouped.set(orderNo, {
        order_no: orderNo,
        marketplace_status: rawStatus,
        normalized_status: normalizedStatus,
        cancel_reason: cancelReason,
        tracking_no: trackingNo,
        courier_raw: courierRaw,
        courier_name: courier.courierName,
        courier_group: courier.courierGroup,
        service_tier: courier.serviceTier,
        order_created_at: createdAt,
        paid_at: paidAt,
        ship_by_deadline: deadline,
        shipping_arranged_at: shippingArrangedAt,
        buyer_username: getFieldValue(row, ['Username (Pembeli)']),
        recipient_name: getFieldValue(row, ['Nama Penerima']),
        recipient_phone: getFieldValue(row, ['No. Telepon']),
        shipping_address: getFieldValue(row, ['Alamat Pengiriman']),
        city: getFieldValue(row, ['Kota/Kabupaten']),
        province: getFieldValue(row, ['Provinsi']),
        buyer_note: getFieldValue(row, ['Catatan dari Pembeli']),
        seller_note: getFieldValue(row, ['Catatan']),
        items: [orderItem],
        is_preorder: deadlinePreorder || skuPreorder,
        preorder_reason: preorderReasons.join(' · '),
      });
    } else {
      // Merge identical SKU lines inside the same order
      const sameIdx = existing.items.findIndex(
        (it) => it.sku === orderItem.sku && it.item_type === orderItem.item_type
      );
      if (sameIdx >= 0) {
        existing.items[sameIdx] = {
          ...existing.items[sameIdx],
          qty: existing.items[sameIdx].qty + orderItem.qty,
        };
      } else {
        existing.items.push(orderItem);
      }
      if (!existing.tracking_no && trackingNo) existing.tracking_no = trackingNo;
      if (!existing.cancel_reason && cancelReason) existing.cancel_reason = cancelReason;
      if (skuClean && preorderSkuSet.has(skuClean) && !existing.is_preorder) {
        existing.is_preorder = true;
        existing.preorder_reason = `SKU Pre-order (${skuClean})`;
      }
    }
  }

  const detectedMode: ShopeeImportMode =
    hasCancelReasonColumn || sawNonPerluDikirimAuditStatus ? 'semua_audit' : 'perlu_dikirim';

  return {
    marketplace: 'shopee',
    sheetName: targetSheetName,
    detectedMode,
    totalRows: rows.length,
    orders: Array.from(grouped.values()),
    hasCancelReasonColumn,
  };
}

export function parseShopeeArrayBuffer(
  buffer: ArrayBuffer | Uint8Array,
  setup: OnlineFulfilmentSetup = DEFAULT_ONLINE_FULFILMENT_SETUP,
  productCatalog: ProductItem[] = []
): ParsedShopeeWorkbookResult {
  const wb = XLSX.read(buffer, { type: 'array' });
  return parseShopeeWorkbook(wb, setup, productCatalog);
}

// =========================================================================
// RE-IMPORT DIFF ENGINE (DUAL-MODE + TAHAN + SMART MISSING CHECK)
// =========================================================================

const ACTIVE_PRE_HANDOVER_STATUSES: OnlineWmsStatus[] = ['new', 'processing', 'packed', 'ready_pickup'];
const IN_PROGRESS_WAREHOUSE_STATUSES: OnlineWmsStatus[] = ['processing', 'packed', 'ready_pickup', 'handed_over'];

export function buildOnlineImportPreview(
  parsed: ParsedShopeeWorkbookResult,
  existingOrders: OnlineOrder[],
  options: { fileName: string; actor: string; nowIso?: string }
): OnlineImportPreview {
  const nowIso = options.nowIso || new Date().toISOString();
  const actor = options.actor || 'Admin';
  const existingMap = new Map<string, OnlineOrder>();
  for (const ord of existingOrders) {
    if (ord.marketplace === 'shopee') {
      existingMap.set(ord.order_no, ord);
    }
  }

  const newOrders: PreviewOrderDiffItem[] = [];
  const preorderOrders: PreviewOrderDiffItem[] = [];
  const resiUpdated: PreviewOrderDiffItem[] = [];
  const holdFromCancel: PreviewOrderDiffItem[] = [];
  const cancelledDirect: PreviewOrderDiffItem[] = [];
  const statusProgressed: PreviewOrderDiffItem[] = [];
  const flaggedCheck: PreviewOrderDiffItem[] = [];
  const unmappedSkus: Array<{ sku: string; productName: string; order_no: string }> = [];
  const ordersToUpsert: OnlineOrder[] = [];

  let skipped = 0;
  let ignoredNonActive = 0;
  let urgentResiCount = 0;
  const parsedOrderNos = new Set<string>();

  for (const p of parsed.orders) {
    parsedOrderNos.add(p.order_no);
    const existing = existingMap.get(p.order_no);

    if (!existing) {
      // Hanya status Perlu Dikirim yang membuat order aktif baru di WMS
      if (p.normalized_status !== 'perlu_dikirim') {
        ignoredNonActive++;
        continue;
      }

      const hasResiFirst = Boolean(p.tracking_no);
      const isUrgentTier = p.service_tier === 'instan' || p.service_tier === 'sameday';
      const urgentResiAlert = hasResiFirst && isUrgentTier;
      if (urgentResiAlert) urgentResiCount++;

      for (const it of p.items) {
        if (it.item_type === 'sale' && !it.is_master_mapped) {
          unmappedSkus.push({ sku: it.sku, productName: it.nama_produk, order_no: p.order_no });
        }
      }

      const initialStatus: OnlineWmsStatus = p.is_preorder ? 'preorder' : 'new';
      const created: OnlineOrder = {
        id: `shopee_${p.order_no}`,
        marketplace: 'shopee',
        order_source: 'excel_import',
        order_no: p.order_no,
        tracking_no: p.tracking_no,
        courier_raw: p.courier_raw,
        courier_name: p.courier_name,
        courier_group: p.courier_group,
        service_tier: p.service_tier,
        marketplace_status: p.marketplace_status,
        wms_status: initialStatus,
        order_created_at: p.order_created_at,
        paid_at: p.paid_at,
        ship_by_deadline: p.ship_by_deadline,
        shipping_arranged_at: p.shipping_arranged_at,
        is_preorder: p.is_preorder,
        preorder_reason: p.preorder_reason,
        has_resi_on_first_import: hasResiFirst,
        urgent_resi_alert: urgentResiAlert,
        is_manual_edited: false,
        manual_edit_logs: [],
        hold_reason: '',
        hold_detected_stage: '',
        check_reason: '',
        cancel_reason: '',
        daily_seq_date: '',
        daily_seq_no: null,
        batch_id: '',
        basket_code: '',
        buyer_username: p.buyer_username,
        recipient_name: p.recipient_name,
        recipient_phone: p.recipient_phone,
        shipping_address: p.shipping_address,
        city: p.city,
        province: p.province,
        buyer_note: p.buyer_note,
        seller_note: p.seller_note,
        items: p.items,
        last_import_mode: parsed.detectedMode,
        last_imported_at: nowIso,
        imported_by: actor,
        created_at: nowIso,
        updated_at: nowIso,
      };

      ordersToUpsert.push(created);
      const previewEntry: PreviewOrderDiffItem = {
        order_no: p.order_no,
        recipient_name: p.recipient_name,
        courier_name: p.courier_name,
        courier_group: p.courier_group,
        tracking_no: p.tracking_no,
        urgent: urgentResiAlert,
        detail: p.is_preorder
          ? `Pre-order (${p.preorder_reason})`
          : urgentResiAlert
            ? 'Mendesak: Resi sudah terbit saat impor pertama'
            : hasResiFirst
              ? 'Resi sudah ada'
              : 'Siap diproses',
        order: created,
      };
      if (p.is_preorder) preorderOrders.push(previewEntry);
      else newOrders.push(previewEntry);
      continue;
    }

    // Existing order rules
    // 1. Pembatalan terdeteksi -> TAHAN jika sudah masuk proses gudang
    if (p.normalized_status === 'batal') {
      if (existing.wms_status === 'cancelled' || existing.wms_status === 'hold') {
        skipped++;
        continue;
      }

      const wasInProgress =
        IN_PROGRESS_WAREHOUSE_STATUSES.includes(existing.wms_status) ||
        (existing.wms_status === 'check' && Boolean(existing.batch_id || existing.daily_seq_no));

      if (wasInProgress) {
        const reason = p.cancel_reason || 'Pesanan dibatalkan di Shopee saat sudah masuk proses gudang';
        const updated: OnlineOrder = {
          ...existing,
          marketplace_status: p.marketplace_status,
          cancel_reason: p.cancel_reason || existing.cancel_reason,
          hold_detected_stage: existing.wms_status,
          hold_reason: reason,
          wms_status: 'hold',
          last_import_mode: parsed.detectedMode,
          last_imported_at: nowIso,
          imported_by: actor,
          updated_at: nowIso,
        };
        ordersToUpsert.push(updated);
        holdFromCancel.push({
          order_no: updated.order_no,
          recipient_name: updated.recipient_name,
          courier_name: updated.courier_name,
          courier_group: updated.courier_group,
          tracking_no: updated.tracking_no,
          urgent: true,
          detail: `TAHAN dari tahap "${existing.wms_status}" · ${reason}`,
          order: updated,
        });
      } else {
        const updated: OnlineOrder = {
          ...existing,
          marketplace_status: p.marketplace_status,
          cancel_reason: p.cancel_reason || existing.cancel_reason || 'Dibatalkan sebelum dipicking',
          wms_status: 'cancelled',
          last_import_mode: parsed.detectedMode,
          last_imported_at: nowIso,
          imported_by: actor,
          updated_at: nowIso,
        };
        ordersToUpsert.push(updated);
        cancelledDirect.push({
          order_no: updated.order_no,
          recipient_name: updated.recipient_name,
          courier_name: updated.courier_name,
          courier_group: updated.courier_group,
          tracking_no: updated.tracking_no,
          detail: updated.cancel_reason,
          order: updated,
        });
      }
      continue;
    }

    // 2. Status sudah melaju di Shopee (Sedang Dikirim / Telah Dikirim / Selesai)
    if (
      p.normalized_status === 'sedang_dikirim' ||
      p.normalized_status === 'telah_dikirim' ||
      p.normalized_status === 'selesai'
    ) {
      const nextTracking = existing.tracking_no || p.tracking_no;
      const shouldResolveCheckOrAdvance =
        existing.wms_status === 'check' ||
        existing.wms_status === 'new' ||
        existing.wms_status === 'ready_pickup';

      if (
        existing.marketplace_status === p.marketplace_status &&
        existing.tracking_no === nextTracking &&
        !shouldResolveCheckOrAdvance
      ) {
        skipped++;
        continue;
      }

      const nextStatus: OnlineWmsStatus =
        existing.wms_status === 'hold'
          ? 'hold'
          : shouldResolveCheckOrAdvance
            ? 'handed_over'
            : existing.wms_status;

      const updated: OnlineOrder = {
        ...existing,
        marketplace_status: p.marketplace_status,
        tracking_no: nextTracking,
        shipping_arranged_at: p.shipping_arranged_at || existing.shipping_arranged_at,
        wms_status: nextStatus,
        check_reason: nextStatus === 'handed_over' ? '' : existing.check_reason,
        last_import_mode: parsed.detectedMode,
        last_imported_at: nowIso,
        imported_by: actor,
        updated_at: nowIso,
      };
      ordersToUpsert.push(updated);
      statusProgressed.push({
        order_no: updated.order_no,
        recipient_name: updated.recipient_name,
        courier_name: updated.courier_name,
        courier_group: updated.courier_group,
        tracking_no: updated.tracking_no,
        detail: `Status Shopee: ${p.marketplace_status}`,
        order: updated,
      });
      continue;
    }

    // 3. Masih Perlu Dikirim -> lengkapi resi atau tandai perubahan resi
    if (p.normalized_status === 'perlu_dikirim') {
      const incomingResi = p.tracking_no;
      const prevResi = existing.tracking_no;

      if (!prevResi && incomingResi) {
        const updated: OnlineOrder = {
          ...existing,
          tracking_no: incomingResi,
          shipping_arranged_at: p.shipping_arranged_at || existing.shipping_arranged_at,
          marketplace_status: p.marketplace_status,
          last_import_mode: parsed.detectedMode,
          last_imported_at: nowIso,
          imported_by: actor,
          updated_at: nowIso,
        };
        ordersToUpsert.push(updated);
        resiUpdated.push({
          order_no: updated.order_no,
          recipient_name: updated.recipient_name,
          courier_name: updated.courier_name,
          courier_group: updated.courier_group,
          tracking_no: incomingResi,
          detail: `Resi dilengkapi: ${incomingResi}`,
          order: updated,
        });
      } else if (prevResi && incomingResi && prevResi !== incomingResi) {
        const reason = `Resi berubah (${prevResi} → ${incomingResi})`;
        const updated: OnlineOrder = {
          ...existing,
          wms_status: existing.wms_status === 'hold' ? 'hold' : 'check',
          check_reason: reason,
          marketplace_status: p.marketplace_status,
          last_import_mode: parsed.detectedMode,
          last_imported_at: nowIso,
          imported_by: actor,
          updated_at: nowIso,
        };
        ordersToUpsert.push(updated);
        flaggedCheck.push({
          order_no: updated.order_no,
          recipient_name: updated.recipient_name,
          courier_name: updated.courier_name,
          courier_group: updated.courier_group,
          tracking_no: prevResi,
          detail: reason,
          order: updated,
        });
      } else {
        skipped++;
      }
      continue;
    }

    skipped++;
  }

  // 4. Smart Missing-Order Detection saat impor Tab "Perlu Dikirim"
  if (parsed.detectedMode === 'perlu_dikirim' && parsed.orders.length > 0) {
    for (const existing of existingMap.values()) {
      if (
        ACTIVE_PRE_HANDOVER_STATUSES.includes(existing.wms_status) &&
        !parsedOrderNos.has(existing.order_no)
      ) {
        const reason = 'Hilang dari file Perlu Dikirim — cek apakah dibatalkan atau sudah terkirim';
        const updated: OnlineOrder = {
          ...existing,
          wms_status: 'check',
          check_reason: reason,
          last_import_mode: parsed.detectedMode,
          last_imported_at: nowIso,
          imported_by: actor,
          updated_at: nowIso,
        };
        ordersToUpsert.push(updated);
        flaggedCheck.push({
          order_no: updated.order_no,
          recipient_name: updated.recipient_name,
          courier_name: updated.courier_name,
          courier_group: updated.courier_group,
          tracking_no: updated.tracking_no,
          detail: reason,
          order: updated,
        });
      }
    }
  }

  const summary: OnlineImportSummary = {
    newOrders: newOrders.length,
    preorderOrders: preorderOrders.length,
    resiUpdated: resiUpdated.length,
    holdFromCancel: holdFromCancel.length,
    cancelledDirect: cancelledDirect.length,
    statusProgressed: statusProgressed.length,
    flaggedCheck: flaggedCheck.length,
    skipped,
    ignoredNonActive,
    unmappedSkuCount: unmappedSkus.length,
    urgentResiCount,
  };

  return {
    fileName: options.fileName,
    marketplace: 'shopee',
    detectedMode: parsed.detectedMode,
    totalRows: parsed.totalRows,
    totalOrdersInFile: parsed.orders.length,
    summary,
    newOrders,
    preorderOrders,
    resiUpdated,
    holdFromCancel,
    cancelledDirect,
    statusProgressed,
    flaggedCheck,
    unmappedSkus,
    ordersToUpsert,
  };
}

// =========================================================================
// SUPABASE PERSISTENCE (WITH WATERMARK GATE + INDEXEDDB + FALLBACK DOCS)
// =========================================================================

async function readIdbOrdersSnapshot(): Promise<{ orders: OnlineOrder[]; watermark: string; count: number } | null> {
  try {
    const meta = await getLocalDbMeta<{ orders: OnlineOrder[]; watermark: string; count: number }>(IDB_ORDERS_KEY);
    if (meta && Array.isArray(meta.orders)) return meta;
  } catch {}
  return null;
}

async function writeIdbOrdersSnapshot(orders: OnlineOrder[], watermark: string): Promise<void> {
  try {
    await setLocalDbMeta(IDB_ORDERS_KEY, {
      orders,
      watermark,
      count: orders.length,
      savedAt: Date.now(),
    });
  } catch {}
}

export async function fetchOnlineFulfilmentSetup(forceRefresh = false): Promise<OnlineFulfilmentSetup> {
  if (!forceRefresh && setupMemoryCache && Date.now() - setupMemoryCache.ts < SWR_TTL_MS) {
    return setupMemoryCache.setup;
  }
  if (!forceRefresh && inflightSetupPromise) {
    return inflightSetupPromise;
  }

  const run = async (): Promise<OnlineFulfilmentSetup> => {
    try {
      const idbSnap = await getLocalDbMeta<{ setup: OnlineFulfilmentSetup; watermark: string }>(IDB_SETUP_KEY);
      if (!forceRefresh && idbSnap?.setup) {
        const wm = await fetchSupabaseWatermark(
          'wms_system_docs',
          'updated_at',
          `section_id=eq.${encodeURIComponent(DOCS_SECTION_SETUP)}`
        );
        if (wm && wm.latestMarker && wm.latestMarker === idbSnap.watermark) {
          setupMemoryCache = { setup: idbSnap.setup, watermark: wm.latestMarker, ts: Date.now() };
          return idbSnap.setup;
        }
      }

      const docs = await getSystemDocs(DOCS_SECTION_SETUP, true);
      if (docs.length > 0 && docs[0].content) {
        const parsed = JSON.parse(docs[0].content) as Partial<OnlineFulfilmentSetup>;
        const merged: OnlineFulfilmentSetup = {
          ...DEFAULT_ONLINE_FULFILMENT_SETUP,
          ...parsed,
          importStaleness: {
            ...DEFAULT_ONLINE_FULFILMENT_SETUP.importStaleness,
            ...(parsed.importStaleness || {}),
          },
          updated_at: docs[0].updated_at,
        };
        const wm = docs[0].updated_at || '';
        setupMemoryCache = { setup: merged, watermark: wm, ts: Date.now() };
        await setLocalDbMeta(IDB_SETUP_KEY, { setup: merged, watermark: wm });
        return merged;
      }
    } catch (err) {
      console.warn('[OnlineFulfilment] Gagal memuat setup dari cloud, memakai default:', err);
    }

    const fallback = await getLocalDbMeta<{ setup: OnlineFulfilmentSetup; watermark: string }>(IDB_SETUP_KEY);
    if (fallback?.setup) return fallback.setup;
    setupMemoryCache = { setup: DEFAULT_ONLINE_FULFILMENT_SETUP, watermark: '', ts: Date.now() };
    return DEFAULT_ONLINE_FULFILMENT_SETUP;
  };

  inflightSetupPromise = run().finally(() => {
    inflightSetupPromise = null;
  });
  return inflightSetupPromise;
}

export async function saveOnlineFulfilmentSetup(
  setup: OnlineFulfilmentSetup,
  actor: string
): Promise<OnlineFulfilmentSetup> {
  const updatedAt = new Date().toISOString();
  const payload: OnlineFulfilmentSetup = {
    ...setup,
    updated_at: updatedAt,
  };
  await saveSystemDoc({
    section_id: DOCS_SECTION_SETUP,
    content: JSON.stringify(payload),
    updated_by: actor || 'Admin',
    updated_at: updatedAt,
  });
  setupMemoryCache = { setup: payload, watermark: updatedAt, ts: Date.now() };
  await setLocalDbMeta(IDB_SETUP_KEY, { setup: payload, watermark: updatedAt });
  return payload;
}

export async function fetchOnlineOrders(
  forceRefresh = false
): Promise<{ orders: OnlineOrder[]; storageMode: 'table' | 'system_docs' }> {
  if (!forceRefresh && ordersMemoryCache && Date.now() - ordersMemoryCache.ts < SWR_TTL_MS) {
    return { orders: ordersMemoryCache.orders, storageMode: ordersMemoryCache.storageMode };
  }
  if (!forceRefresh && inflightOrdersPromise) {
    return inflightOrdersPromise;
  }

  const run = async (): Promise<{ orders: OnlineOrder[]; storageMode: 'table' | 'system_docs' }> => {
    const idbSnap = await readIdbOrdersSnapshot();

    // 1. Coba tabel dedicated public.online_orders jika belum diketahui fallback
    if (tableModeKnown !== 'system_docs') {
      try {
        if (!forceRefresh && idbSnap) {
          const wm = await fetchSupabaseWatermark('online_orders', 'updated_at');
          if (wm && wm.totalCount === idbSnap.count && wm.latestMarker === idbSnap.watermark) {
            tableModeKnown = 'table';
            ordersMemoryCache = {
              orders: idbSnap.orders,
              storageMode: 'table',
              watermark: wm.latestMarker,
              count: wm.totalCount,
              ts: Date.now(),
            };
            return { orders: idbSnap.orders, storageMode: 'table' };
          }
        }

        const rows = await supabaseFetch<OnlineOrder[]>(
          'online_orders',
          'GET',
          null,
          `select=${ORDERS_SELECT_COLS}&order=updated_at.desc&limit=1000`
        );
        const list = Array.isArray(rows) ? rows : [];
        const latestWm = list[0]?.updated_at || '';
        tableModeKnown = 'table';
        ordersMemoryCache = {
          orders: list,
          storageMode: 'table',
          watermark: latestWm,
          count: list.length,
          ts: Date.now(),
        };
        await writeIdbOrdersSnapshot(list, latestWm);
        return { orders: list, storageMode: 'table' };
      } catch (err) {
        if (!isMissingTableError(err)) {
          if (idbSnap) {
            return { orders: idbSnap.orders, storageMode: tableModeKnown || 'table' };
          }
          throw err;
        }
        tableModeKnown = 'system_docs';
      }
    }

    // 2. Fallback aman ke wms_system_docs (watermark-gated ~120B)
    try {
      if (!forceRefresh && idbSnap) {
        const wm = await fetchSupabaseWatermark(
          'wms_system_docs',
          'updated_at',
          `section_id=eq.${encodeURIComponent(DOCS_SECTION_ORDERS)}`
        );
        if (wm && wm.latestMarker && wm.latestMarker === idbSnap.watermark) {
          ordersMemoryCache = {
            orders: idbSnap.orders,
            storageMode: 'system_docs',
            watermark: wm.latestMarker,
            count: idbSnap.orders.length,
            ts: Date.now(),
          };
          return { orders: idbSnap.orders, storageMode: 'system_docs' };
        }
      }

      const docs = await getSystemDocs(DOCS_SECTION_ORDERS, true);
      let list: OnlineOrder[] = [];
      let wm = '';
      if (docs.length > 0 && docs[0].content) {
        const parsed = JSON.parse(docs[0].content);
        if (Array.isArray(parsed)) list = parsed;
        wm = docs[0].updated_at || '';
      }
      ordersMemoryCache = {
        orders: list,
        storageMode: 'system_docs',
        watermark: wm,
        count: list.length,
        ts: Date.now(),
      };
      await writeIdbOrdersSnapshot(list, wm);
      return { orders: list, storageMode: 'system_docs' };
    } catch (err) {
      console.warn('[OnlineFulfilment] Fallback ke cache lokal IndexedDB:', err);
      if (idbSnap) {
        return { orders: idbSnap.orders, storageMode: 'system_docs' };
      }
      return { orders: [], storageMode: 'system_docs' };
    }
  };

  inflightOrdersPromise = run().finally(() => {
    inflightOrdersPromise = null;
  });
  return inflightOrdersPromise;
}

export async function fetchOnlineImportJobs(forceRefresh = false): Promise<OnlineImportJob[]> {
  if (!forceRefresh && jobsMemoryCache && Date.now() - jobsMemoryCache.ts < SWR_TTL_MS) {
    return jobsMemoryCache.jobs;
  }
  if (!forceRefresh && inflightJobsPromise) {
    return inflightJobsPromise;
  }

  const run = async (): Promise<OnlineImportJob[]> => {
    if (tableModeKnown !== 'system_docs') {
      try {
        const rows = await supabaseFetch<OnlineImportJob[]>(
          'online_import_jobs',
          'GET',
          null,
          `select=${JOBS_SELECT_COLS}&order=created_at.desc&limit=30`
        );
        const list = Array.isArray(rows) ? rows : [];
        jobsMemoryCache = { jobs: list, ts: Date.now() };
        await setLocalDbMeta(IDB_JOBS_KEY, list);
        return list;
      } catch (err) {
        if (!isMissingTableError(err)) {
          const idb = await getLocalDbMeta<OnlineImportJob[]>(IDB_JOBS_KEY);
          if (Array.isArray(idb)) return idb;
          throw err;
        }
        tableModeKnown = 'system_docs';
      }
    }

    try {
      const docs = await getSystemDocs(DOCS_SECTION_IMPORT_JOBS, forceRefresh);
      let list: OnlineImportJob[] = [];
      if (docs.length > 0 && docs[0].content) {
        const parsed = JSON.parse(docs[0].content);
        if (Array.isArray(parsed)) list = parsed;
      }
      jobsMemoryCache = { jobs: list, ts: Date.now() };
      await setLocalDbMeta(IDB_JOBS_KEY, list);
      return list;
    } catch {
      const idb = await getLocalDbMeta<OnlineImportJob[]>(IDB_JOBS_KEY);
      return Array.isArray(idb) ? idb : [];
    }
  };

  inflightJobsPromise = run().finally(() => {
    inflightJobsPromise = null;
  });
  return inflightJobsPromise;
}

async function persistOrdersBatch(
  upsertList: OnlineOrder[],
  allMergedOrders: OnlineOrder[],
  actor: string
): Promise<'table' | 'system_docs'> {
  const nowIso = new Date().toISOString();

  if (tableModeKnown !== 'system_docs') {
    try {
      if (upsertList.length > 0) {
        const chunkSize = 100;
        for (let i = 0; i < upsertList.length; i += chunkSize) {
          const chunk = upsertList.slice(i, i + chunkSize);
          await supabaseFetch('online_orders', 'POST', chunk, 'on_conflict=id', false);
        }
      }
      tableModeKnown = 'table';
      ordersMemoryCache = {
        orders: allMergedOrders,
        storageMode: 'table',
        watermark: nowIso,
        count: allMergedOrders.length,
        ts: Date.now(),
      };
      await writeIdbOrdersSnapshot(allMergedOrders, nowIso);
      return 'table';
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
      tableModeKnown = 'system_docs';
    }
  }

  await saveSystemDoc({
    section_id: DOCS_SECTION_ORDERS,
    content: JSON.stringify(allMergedOrders),
    updated_by: actor || 'Admin',
    updated_at: nowIso,
  });
  ordersMemoryCache = {
    orders: allMergedOrders,
    storageMode: 'system_docs',
    watermark: nowIso,
    count: allMergedOrders.length,
    ts: Date.now(),
  };
  await writeIdbOrdersSnapshot(allMergedOrders, nowIso);
  return 'system_docs';
}

async function persistImportJob(job: OnlineImportJob): Promise<void> {
  if (tableModeKnown !== 'system_docs') {
    try {
      await supabaseFetch('online_import_jobs', 'POST', [job], 'on_conflict=id', false);
      jobsMemoryCache = null;
      return;
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
      tableModeKnown = 'system_docs';
    }
  }

  const prev = await fetchOnlineImportJobs(true).catch(() => []);
  const next = [job, ...prev].slice(0, 40);
  await saveSystemDoc({
    section_id: DOCS_SECTION_IMPORT_JOBS,
    content: JSON.stringify(next),
    updated_by: job.imported_by || 'Admin',
    updated_at: job.created_at,
  });
  jobsMemoryCache = { jobs: next, ts: Date.now() };
  await setLocalDbMeta(IDB_JOBS_KEY, next);
}

export async function commitOnlineImportPreview(
  preview: OnlineImportPreview,
  existingOrders: OnlineOrder[],
  actor: string
): Promise<{ orders: OnlineOrder[]; job: OnlineImportJob; storageMode: 'table' | 'system_docs' }> {
  const mergedMap = new Map<string, OnlineOrder>();
  for (const ord of existingOrders) mergedMap.set(ord.id, ord);
  for (const ord of preview.ordersToUpsert) mergedMap.set(ord.id, ord);

  const allMerged = Array.from(mergedMap.values()).sort((a, b) =>
    String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
  );

  const storageMode = await persistOrdersBatch(preview.ordersToUpsert, allMerged, actor);

  const job: OnlineImportJob = {
    id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    marketplace: preview.marketplace,
    import_mode: preview.detectedMode,
    file_name: preview.fileName,
    total_rows: preview.totalRows,
    total_orders: preview.totalOrdersInFile,
    summary: preview.summary,
    imported_by: actor || 'Admin',
    created_at: new Date().toISOString(),
  };
  await persistImportJob(job);

  return { orders: allMerged, job, storageMode };
}

export async function patchOnlineOrderFields(
  orderId: string,
  patch: Partial<OnlineOrder>,
  allOrders: OnlineOrder[],
  actor: string
): Promise<OnlineOrder[]> {
  const nowIso = new Date().toISOString();
  const nextPatch = { ...patch, updated_at: nowIso };
  const nextAll = allOrders.map((o) => (o.id === orderId ? { ...o, ...nextPatch } : o));

  if (tableModeKnown !== 'system_docs') {
    try {
      await supabaseFetch('online_orders', 'PATCH', nextPatch, `id=eq.${encodeURIComponent(orderId)}`, false);
      ordersMemoryCache = {
        orders: nextAll,
        storageMode: 'table',
        watermark: nowIso,
        count: nextAll.length,
        ts: Date.now(),
      };
      await writeIdbOrdersSnapshot(nextAll, nowIso);
      return nextAll;
    } catch (err) {
      if (!isMissingTableError(err)) throw err;
      tableModeKnown = 'system_docs';
    }
  }

  await persistOrdersBatch([], nextAll, actor);
  return nextAll;
}

export async function updateOnlineOrdersBatchFields(
  orderIds: string[],
  patchFactory: (order: OnlineOrder) => Partial<OnlineOrder>,
  allOrders: OnlineOrder[],
  actor: string
): Promise<OnlineOrder[]> {
  const nowIso = new Date().toISOString();
  const targetSet = new Set(orderIds);
  const changedOrders: OnlineOrder[] = [];

  const nextAll = allOrders.map((o) => {
    if (!targetSet.has(o.id)) return o;
    const updated: OnlineOrder = { ...o, ...patchFactory(o), updated_at: nowIso };
    changedOrders.push(updated);
    return updated;
  });

  if (changedOrders.length === 0) return allOrders;
  await persistOrdersBatch(changedOrders, nextAll, actor);
  return nextAll;
}

export async function releasePreorderToNew(
  orderId: string,
  allOrders: OnlineOrder[],
  actor: string
): Promise<OnlineOrder[]> {
  return patchOnlineOrderFields(
    orderId,
    { wms_status: 'new', is_preorder: false },
    allOrders,
    actor
  );
}

export async function resolveCheckOrder(
  orderId: string,
  resolution: 'return_active' | 'mark_handed_over' | 'mark_hold' | 'mark_cancelled',
  allOrders: OnlineOrder[],
  actor: string
): Promise<OnlineOrder[]> {
  const target = allOrders.find((o) => o.id === orderId);
  if (!target) return allOrders;

  let patch: Partial<OnlineOrder> = { check_reason: '' };
  if (resolution === 'return_active') {
    patch = {
      wms_status: target.batch_id || target.daily_seq_no ? 'processing' : 'new',
      check_reason: '',
    };
  } else if (resolution === 'mark_handed_over') {
    patch = { wms_status: 'handed_over', check_reason: '' };
  } else if (resolution === 'mark_hold') {
    patch = {
      wms_status: 'hold',
      hold_detected_stage: target.hold_detected_stage || 'check',
      hold_reason: target.check_reason || `Ditandai TAHAN oleh ${actor}`,
      check_reason: '',
    };
  } else if (resolution === 'mark_cancelled') {
    patch = {
      wms_status: 'cancelled',
      cancel_reason: target.check_reason || `Dibatalkan oleh ${actor}`,
      check_reason: '',
    };
  }

  return patchOnlineOrderFields(orderId, patch, allOrders, actor);
}

export async function confirmHoldPackagePulled(
  orderId: string,
  allOrders: OnlineOrder[],
  actor: string
): Promise<OnlineOrder[]> {
  const target = allOrders.find((o) => o.id === orderId);
  const note = `Paket ditarik & diamankan oleh ${actor} (${new Date().toLocaleString('id-ID')})`;
  return patchOnlineOrderFields(
    orderId,
    {
      wms_status: 'cancelled',
      cancel_reason: target?.cancel_reason ? `${target.cancel_reason} · ${note}` : note,
      hold_reason: '',
    },
    allOrders,
    actor
  );
}
