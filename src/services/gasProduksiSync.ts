import { PenerimaanProduksiItem } from '../types';
import { MatrixProductBlock } from '../components/penerimaan/ProduksiSpreadsheetView';

export const PRODUKSI_SPREADSHEET_ID = '1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk';
export const PRODUKSI_SCRIPT_ID = '1vYGP1u5mCAvjFYbJQHbc7mLruxrtwUmlKh27djBJ6oBlomuOCCKy-scb';
export const DEFAULT_PRODUKSI_GAS_URL = 'https://script.google.com/macros/s/AKfycbyrsovwstbIR_e1-zgOovxt2sKCyPTjpON9XbOERShS-mZd-Aj5TgWueZRjwDJ05bponA/exec';

/**
 * Mendapatkan URL GAS Produksi yang valid
 */
export function getProduksiGasUrl(): string {
  try {
    const custom = localStorage.getItem('wms_produksi_gas_url') || '';
    if (!custom || !custom.trim() || custom.includes('AKfycby4J497I-m4H99KSvBDkkSr6_kn9BoIDwALRa3lE1ZiPyJPIAd0AYE6-r6yqCdFONmpSg')) {
      localStorage.setItem('wms_produksi_gas_url', DEFAULT_PRODUKSI_GAS_URL);
      return DEFAULT_PRODUKSI_GAS_URL;
    }
    return custom.trim();
  } catch {
    return DEFAULT_PRODUKSI_GAS_URL;
  }
}

export interface SuratJalanPushItem {
  kode_produksi: string;
  nama_produk?: string;
  warna: string;
  size: string;
  qty: number;
  foto_url?: string;
  keterangan?: string;
  catatan?: string;
}

export interface SuratJalanPushPayload {
  no_surat_jalan: string;
  tanggal: string;
  kategori: string;
  up_vendor?: string;
  keterangan?: string;
  operator?: string;
  is_recount?: boolean;
  items: SuratJalanPushItem[];
}

export interface PushProduksiResponse {
  success: boolean;
  message: string;
  count?: number;
  sheetUrl?: string;
  error?: string;
}

/**
 * Format link Google Drive menjadi link gambar langsung yang bisa di-load oleh formula =IMAGE(...) Google Sheets
 */
export function formatImageUrlForSheets(url?: string): string {
  if (!url || !url.trim()) return '';
  const clean = url.trim();

  // Jika URL Google Drive file/d/FILE_ID/view
  const gdriveMatch = clean.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (gdriveMatch && gdriveMatch[1]) {
    return `https://drive.google.com/uc?export=view&id=${gdriveMatch[1]}`;
  }

  // Jika open?id=FILE_ID
  const gdriveIdMatch = clean.match(/drive\.google\.com\/(?:open|uc)\?.*id=([a-zA-Z0-9_-]+)/);
  if (gdriveIdMatch && gdriveIdMatch[1]) {
    return `https://drive.google.com/uc?export=view&id=${gdriveIdMatch[1]}`;
  }

  return clean;
}

/**
 * Format tanggal untuk nama Tab Sheet Google Spreadsheet
 * Contoh: "2026-09-26" -> "26-09-2026 (CMT)"
 */
export function formatDateTabName(dateStr?: string, activeTab?: 'CMT' | 'Kargo' | string): string {
  if (!dateStr || !dateStr.trim()) return 'TANGGAL_UNKNOWN';
  const clean = dateStr.trim();
  let baseName = clean;

  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      baseName = `${dd}-${mm}-${yyyy}`;
    }
  } catch {}

  baseName = baseName.replace(/[:\/\?\*\[\]]/g, '-').substring(0, 50);
  if (activeTab) {
    const tag = activeTab === 'Kargo' ? 'Kargo' : 'CMT';
    return `${baseName} (${tag})`;
  }
  return baseName;
}

/**
 * Format tanggal Indonesia: "2026-09-26" -> "26 September 2026"
 */
export function formatDateIndo(dateStr?: string): string {
  if (!dateStr || !dateStr.trim()) return '-';
  try {
    const d = new Date(dateStr.trim());
    if (isNaN(d.getTime())) return dateStr;
    const bulanIndo = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
    ];
    return `${d.getDate()} ${bulanIndo[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return dateStr;
  }
}

/**
 * Format tanggal pendek: "2026-09-23" -> "23 Sep"
 */
export function formatDateShort(dateStr?: string): string {
  if (!dateStr || !dateStr.trim()) return '';
  try {
    const d = new Date(dateStr.trim());
    if (isNaN(d.getTime())) return dateStr;
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${d.getDate()} ${monthNames[d.getMonth()]}`;
  } catch {
    return dateStr;
  }
}

/**
 * Format ringkasan tanggal-tanggal kedatangan: ["2026-09-23", "2026-09-24"] -> "23 Sep & 24 Sep"
 */
export function formatDatesSummary(dates: (string | undefined)[]): string {
  const valid = Array.from(new Set(dates.filter(Boolean) as string[])).sort();
  if (valid.length === 0) return '';
  const formatted = valid.map((d) => formatDateShort(d));
  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} & ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(', ')} & ${formatted[formatted.length - 1]}`;
}

export interface PushProduksiDateOptions {
  items: PenerimaanProduksiItem[];
  blocks?: MatrixProductBlock[];
  activeTab?: 'CMT' | 'Kargo';
  targetDate?: string | null; // e.g. '2026-09-26' or 'all' or undefined
  customSpreadsheetId?: string;
  onProgress?: (current: number, total: number, sheetName: string) => void;
}

export interface DateSheetPayload {
  tanggal: string;
  sheetName: string;
  kategori: string;
  items: any[];
  blocks?: any[];
}

/**
 * Helper untuk mengelompokkan flat PenerimaanProduksiItem[] menjadi MatrixProductBlock[]
 * untuk dikirim ke Google Spreadsheet dalam format tabel matriks
 */
export function buildBlocksFromRawItems(
  rawItems: PenerimaanProduksiItem[],
  customDateSlots?: string[],
  activeTab: 'CMT' | 'Kargo' = 'CMT'
): MatrixProductBlock[] {
  if (!rawItems || rawItems.length === 0) return [];

  // Group by kode_produksi
  const mapByCode = new Map<string, PenerimaanProduksiItem[]>();
  rawItems.forEach((it) => {
    const code = (it.kode_produksi || '').trim();
    if (!code) return;
    if (!mapByCode.has(code)) {
      mapByCode.set(code, []);
    }
    mapByCode.get(code)!.push(it);
  });

  let rowNum = 1;
  const resultBlocks: MatrixProductBlock[] = [];

  mapByCode.forEach((items, code) => {
    const firstItem = items[0];

    // Temukan semua tanggal yang ada (Khusus barang datang, abaikan baris retur)
    const dateSet = new Set<string>();
    items.forEach((it) => {
      const isReturItem =
        (it.no_surat_jalan && it.no_surat_jalan.toUpperCase().startsWith('RETUR-')) ||
        (it.keterangan && it.keterangan.includes('RETUR_CMT:'));
      if (!isReturItem && it.tanggal_penerimaan && Number(it.qty) > 0) {
        dateSet.add(it.tanggal_penerimaan.trim());
      }
    });
    const itemDates = Array.from(dateSet).sort().reverse();
    const finalDateSlots = customDateSlots && customDateSlots.length > 0 ? customDateSlots : itemDates;

    // Group by color
    const colorMap = new Map<string, PenerimaanProduksiItem[]>();
    items.forEach((it) => {
      const color = (it.warna || 'DEFAULT').trim().toUpperCase();
      if (!colorMap.has(color)) {
        colorMap.set(color, []);
      }
      colorMap.get(color)!.push(it);
    });

    const standardSizes = ['S', 'M', 'L', 'XL'];
    const colorGroups: any[] = [];
    let blockTotalDatang = 0;

    colorMap.forEach((cItems, colorName) => {
      const sizeSet = new Set<string>();
      cItems.forEach((it) => {
        if (it.size) sizeSet.add(it.size.trim().toUpperCase());
      });

      const orderedSizes: string[] = [];
      standardSizes.forEach((sz) => {
        if (sizeSet.has(sz)) {
          orderedSizes.push(sz);
          sizeSet.delete(sz);
        }
      });
      Array.from(sizeSet).sort().forEach((sz) => orderedSizes.push(sz));
      if (orderedSizes.length === 0) orderedSizes.push('ALL SIZE');

      const sizeItems = orderedSizes.map((szName) => {
        const qtyByDate: Record<string, number> = {};
        let totalSizeQty = 0;
        let recountQty: number | null = null;
        let recountNotes = '';
        let recountAuditor = '';
        let recountStatus = '';
        let recountRound: number | null = null;

        cItems
          .filter((it) => (it.size || 'ALL SIZE').trim().toUpperCase() === szName)
          .forEach((it) => {
            const isReturItem =
              (it.no_surat_jalan && it.no_surat_jalan.toUpperCase().startsWith('RETUR-')) ||
              (it.keterangan && it.keterangan.includes('RETUR_CMT:'));
            const tgl = it.tanggal_penerimaan?.trim();
            const q = Number(it.qty) || 0;
            if (!isReturItem && tgl && q > 0) {
              qtyByDate[tgl] = (qtyByDate[tgl] || 0) + q;
              totalSizeQty += q;
            }

            if (it.recount_qty !== undefined && it.recount_qty !== null) {
              recountQty = Number(it.recount_qty);
              recountNotes = it.recount_notes || recountNotes;
              recountAuditor = it.recount_auditor || recountAuditor;
              recountStatus = it.recount_status || recountStatus;
              if (it.recount_round) recountRound = Number(it.recount_round);
            }
          });

        return {
          size: szName,
          qtyByDate,
          totalSizeQty,
          recountQty,
          recountNotes,
          recountAuditor,
          recountStatus,
          recountRound,
        };
      });

      const totalColorQty = sizeItems.reduce((acc, s) => acc + s.totalSizeQty, 0);
      blockTotalDatang += totalColorQty;

      colorGroups.push({
        color: colorName,
        sizes: sizeItems,
        totalColorQty,
      });
    });

    resultBlocks.push({
      id: code,
      rowNumber: rowNum++,
      code,
      productName: firstItem.nama_produk || '',
      upVendor: firstItem.keterangan || '',
      kategori: activeTab === 'Kargo' ? 'Kargo' : 'Lokal CMT',
      photoUrl: formatImageUrlForSheets(firstItem.foto_url),
      catatan: firstItem.keterangan || '',
      distinctSjs: [],
      colorGroups,
      dateSlots: finalDateSlots,
      returDateSlots: [],
      totalDatang: blockTotalDatang,
      totalRetur: 0,
      totalNet: blockTotalDatang,
      kg: 0,
      ongkirPerKg: 0,
      totalOngkir: 0,
      ongkirPerPcs: 0,
    });
  });

  return resultBlocks;
}

/**
 * Push data penerimaan produksi ke Google Spreadsheet: 1 Sheet Per Tanggal Penerimaan
 * - Jika targetDate diset (misal '2026-09-26'): hanya push sheet tanggal tersebut.
 * - Jika targetDate tidak diset / 'all': push semua tanggal ke sheet berbeda-beda sesuai tanggal.
 */
export async function pushProduksiPerTanggalToGoogleSheet(
  options: PushProduksiDateOptions
): Promise<PushProduksiResponse> {
  const {
    items,
    blocks,
    activeTab = 'CMT',
    targetDate,
    customSpreadsheetId,
    onProgress,
  } = options;

  if ((!items || items.length === 0) && (!blocks || blocks.length === 0)) {
    return { success: false, message: 'Tidak ada data penerimaan produksi untuk dikirim.' };
  }

  const targetSpreadsheetId = customSpreadsheetId || localStorage.getItem('wms_produksi_spreadsheet_id') || PRODUKSI_SPREADSHEET_ID;
  const gasUrl = getProduksiGasUrl();

  // Filter items berdasarkan kategori tab yang aktif (Lokal CMT atau Kargo)
  const categoryFilteredItems = items.filter((it) => {
    if (activeTab === 'CMT') {
      return !it.kategori || it.kategori === 'Lokal CMT';
    } else {
      return it.kategori === 'Kargo';
    }
  });

  const sourceItems = categoryFilteredItems.length > 0 ? categoryFilteredItems : items;

  // Tentukan tanggal mana saja yang akan dipush
  let datesToPush: string[] = [];
  const cleanTargetDate = targetDate && targetDate !== 'all' ? targetDate.trim() : null;

  if (cleanTargetDate) {
    datesToPush = [cleanTargetDate];
  } else {
    // Ambil semua tanggal unik yang ada di items atau blocks
    const dateSet = new Set<string>();
    sourceItems.forEach((it) => {
      if (it.tanggal_penerimaan) dateSet.add(it.tanggal_penerimaan.trim());
    });
    if (blocks) {
      blocks.forEach((b) => {
        b.dateSlots.forEach((d) => {
          if (d) dateSet.add(d.trim());
        });
      });
    }
    datesToPush = Array.from(dateSet).sort().reverse();
  }

  if (datesToPush.length === 0) {
    return { success: false, message: 'Tidak ditemukan data tanggal penerimaan untuk dikirim.' };
  }

  // Buat dateSheets
  const dateSheets: DateSheetPayload[] = [];

  for (const dStr of datesToPush) {
    const tabName = formatDateTabName(dStr, activeTab);
    const dateItems = sourceItems.filter((it) => it.tanggal_penerimaan === dStr);

    // Format blocks untuk tanggal ini (jika ada blocks)
    let dateBlocks: any[] | undefined = undefined;
    if (blocks && blocks.length > 0) {
      dateBlocks = blocks
        .filter((b) => b.dateSlots.includes(dStr))
        .map((b) => {
          const colorGroups = b.colorGroups.map((cg) => ({
            ...cg,
            sizes: cg.sizes.map((sz) => ({
              ...sz,
              qtyByDate: { [dStr]: sz.qtyByDate?.[dStr] || 0 },
              totalSizeQty: sz.qtyByDate?.[dStr] || 0,
            })),
          }));

          let dateDatang = 0;
          colorGroups.forEach((cg) => {
            cg.sizes.forEach((sz) => {
              dateDatang += sz.totalSizeQty;
            });
          });

          return {
            ...b,
            photoUrl: formatImageUrlForSheets(b.photoUrl),
            dateSlots: [dStr],
            colorGroups,
            totalDatang: dateDatang,
            totalNet: dateDatang,
          };
        })
        .filter((b) => b.totalDatang > 0);
    }

    // Jika belum ada blocks, bangun otomatis dari items kedatangan
    if (!dateBlocks || dateBlocks.length === 0) {
      dateBlocks = buildBlocksFromRawItems(dateItems, [dStr], activeTab);
    }

    const formattedDateItems = dateItems.map((it) => ({
      tanggal_penerimaan: it.tanggal_penerimaan || dStr,
      kategori: it.kategori || (activeTab === 'CMT' ? 'Lokal CMT' : 'Kargo'),
      no_surat_jalan: it.no_surat_jalan || '',
      kode_produksi: it.kode_produksi || '',
      nama_produk: it.nama_produk || '',
      warna: it.warna || '',
      size: it.size || '',
      qty: Number(it.qty) || 0,
      foto_url: formatImageUrlForSheets(it.foto_url),
      up_vendor: it.keterangan || '',
      keterangan: it.keterangan || '',
      catatan: it.keterangan || '',
      operator: it.operator || 'Operator Gudang',
      created_at: it.created_at || new Date().toISOString(),
    }));

    if ((dateBlocks && dateBlocks.length > 0) || formattedDateItems.length > 0) {
      dateSheets.push({
        tanggal: dStr,
        sheetName: tabName,
        kategori: activeTab === 'Kargo' ? 'Kargo' : 'Lokal CMT',
        items: formattedDateItems,
        blocks: dateBlocks,
      });
    }
  }

  if (dateSheets.length === 0) {
    return {
      success: false,
      message: cleanTargetDate
        ? `Tidak ada data penerimaan untuk tanggal ${formatDateIndo(cleanTargetDate)}.`
        : 'Tidak ada data penerimaan pada tanggal-tanggal tersebut.',
    };
  }

  let successCount = 0;
  let lastSheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
  let lastErrorMsg = '';

  try {
    for (let i = 0; i < dateSheets.length; i++) {
      const ds = dateSheets[i];
      onProgress?.(i + 1, dateSheets.length, ds.sheetName);

      const effectiveBlocks = ds.blocks && ds.blocks.length > 0
        ? ds.blocks
        : buildBlocksFromRawItems(ds.items, [ds.tanggal], activeTab);

      const singlePayload = {
        action: 'pushPenerimaanProduksi',
        spreadsheetId: targetSpreadsheetId,
        activeTab: activeTab,
        sheetName: ds.sheetName,
        blocks: effectiveBlocks,
        items: ds.items,
        targetDate: ds.tanggal,
      };

      try {
        const subRes = await fetch(gasUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify(singlePayload),
          redirect: 'follow',
        });

        if (subRes.ok) {
          const json = await subRes.json().catch(() => ({ success: true }));
          if (json && json.success !== false && !json.error) {
            successCount++;
            if (json.sheetUrl) lastSheetUrl = json.sheetUrl;
          } else {
            const errDetail = json?.error || json?.message;
            if (errDetail === 'Unauthorized') {
              lastErrorMsg = 'Endpoint Web App mengembalikan Unauthorized. Silakan masukkan Web App URL dari Deployment Spreadsheet Produksi (Who has access: Anyone) pada Pengaturan Endpoint.';
            } else {
              lastErrorMsg = errDetail || `Gagal menulis tab ${ds.sheetName}`;
            }
          }
        } else {
          lastErrorMsg = `HTTP ${subRes.status}: ${subRes.statusText}`;
        }
      } catch (subErr: any) {
        lastErrorMsg = subErr?.message || String(subErr);
        console.warn(`Gagal kirim tab ${ds.sheetName}:`, subErr);
      }
    }

    if (successCount > 0) {
      const successMsg = cleanTargetDate
        ? `Sukses push data tanggal ${formatDateIndo(cleanTargetDate)} ke Tab Sheet "${dateSheets[0]?.sheetName}"!`
        : `Sukses membuat & mengisi ${successCount} Tab Sheet Tanggal di Google Spreadsheet!`;

      return {
        success: true,
        message: successMsg,
        count: successCount,
        sheetUrl: lastSheetUrl,
      };
    }

    throw new Error(lastErrorMsg || 'Gagal push ke Google Apps Script.');
  } catch (err: any) {
    console.error('Error pushProduksiPerTanggalToGoogleSheet:', err);
    return {
      success: false,
      message: 'Gagal terhubung ke Google Apps Script Web App: ' + (err?.message || err),
      error: err?.message || String(err),
      sheetUrl: `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`,
    };
  }
}

export interface PushMasterProduksiOptions {
  items: PenerimaanProduksiItem[];
  blocks?: MatrixProductBlock[];
  activeTab?: 'CMT' | 'Kargo';
  customSpreadsheetId?: string;
}

/**
 * Helper untuk menyusun MatrixProductBlock dari flat items jika blocks belum disediakan
 */
export function buildMatrixBlocksFromItems(items: PenerimaanProduksiItem[], isCMT: boolean): MatrixProductBlock[] {
  const codeMap = new Map<string, PenerimaanProduksiItem[]>();
  items.forEach((it) => {
    const code = it.kode_produksi || 'TANPA_KODE';
    if (!codeMap.has(code)) codeMap.set(code, []);
    codeMap.get(code)!.push(it);
  });

  const blocks: MatrixProductBlock[] = [];
  let no = 1;

  for (const [code, codeItems] of codeMap.entries()) {
    const first = codeItems[0];
    const productName = first?.nama_produk || '';
    const upVendor = first?.keterangan || (isCMT ? 'CMT' : 'KARGO');
    const photoUrl = first?.foto_url || '';

    const dateSet = new Set<string>();
    codeItems.forEach((it) => {
      if (it.tanggal_penerimaan) dateSet.add(it.tanggal_penerimaan);
    });
    const dateSlots = Array.from(dateSet).sort();

    const colorMap = new Map<string, PenerimaanProduksiItem[]>();
    codeItems.forEach((it) => {
      const col = it.warna || 'DEFAULT';
      if (!colorMap.has(col)) colorMap.set(col, []);
      colorMap.get(col)!.push(it);
    });

    const colorGroups = [];
    let blockTotalDatang = 0;

    for (const [colName, colItems] of colorMap.entries()) {
      const sizeMap = new Map<string, PenerimaanProduksiItem[]>();
      colItems.forEach((it) => {
        const sz = it.size || 'ALL SIZE';
        if (!sizeMap.has(sz)) sizeMap.set(sz, []);
        sizeMap.get(sz)!.push(it);
      });

      const sizes = [];
      let cgTotal = 0;

      for (const [szName, szItems] of sizeMap.entries()) {
        const qtyByDate: Record<string, number> = {};
        let szTotal = 0;
        szItems.forEach((it) => {
          const d = it.tanggal_penerimaan || '';
          const q = Number(it.qty) || 0;
          qtyByDate[d] = (qtyByDate[d] || 0) + q;
          szTotal += q;
        });

        sizes.push({
          sizeName: szName,
          qtyByDate,
          returQtyByDate: {},
          totalSizeQty: szTotal,
          totalReturSizeQty: 0,
          totalNetSizeQty: szTotal,
        });

        cgTotal += szTotal;
      }

      colorGroups.push({
        colorName: colName,
        sizes,
        totalColorQty: cgTotal,
        totalReturColorQty: 0,
        totalNetColorQty: cgTotal,
      });

      blockTotalDatang += cgTotal;
    }

    blocks.push({
      id: code,
      rowNumber: no++,
      code,
      productName,
      upVendor,
      kategori: isCMT ? 'Lokal CMT' : 'Kargo',
      photoUrl,
      catatan: '',
      distinctSjs: [],
      dateSlots,
      returDateSlots: [],
      colorGroups: colorGroups as any,
      totalDatang: blockTotalDatang,
      totalRetur: 0,
      totalNet: blockTotalDatang,
      kg: 0,
      ongkirPerKg: 0,
      totalOngkir: 0,
      ongkirPerPcs: 0,
    });
  }

  return blocks;
}

/**
 * Push data penerimaan produksi ke Google Spreadsheet dengan format Master Matrix Spreadsheet (=IMAGE)
 * Spreadsheet ID: 1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk
 */
export async function pushPenerimaanProduksiToGoogleSheet(
  itemsOrOptions: PenerimaanProduksiItem[] | PushMasterProduksiOptions,
  maybeBlocks?: MatrixProductBlock[],
  maybeActiveTab: 'CMT' | 'Kargo' = 'CMT',
  maybeCustomSpreadsheetId?: string
): Promise<PushProduksiResponse> {
  let items: PenerimaanProduksiItem[] = [];
  let blocks: MatrixProductBlock[] | undefined = maybeBlocks;
  let activeTab: 'CMT' | 'Kargo' = maybeActiveTab;
  let customSpreadsheetId: string | undefined = maybeCustomSpreadsheetId;

  if (itemsOrOptions && !Array.isArray(itemsOrOptions) && typeof itemsOrOptions === 'object') {
    const opts = itemsOrOptions as PushMasterProduksiOptions;
    items = Array.isArray(opts.items) ? opts.items : [];
    blocks = opts.blocks;
    activeTab = opts.activeTab || 'CMT';
    customSpreadsheetId = opts.customSpreadsheetId;
  } else if (Array.isArray(itemsOrOptions)) {
    items = itemsOrOptions;
  }

  if ((!items || items.length === 0) && (!blocks || blocks.length === 0)) {
    return { success: false, message: 'Tidak ada data item untuk dikirim.' };
  }

  const targetSpreadsheetId = customSpreadsheetId || localStorage.getItem('wms_produksi_spreadsheet_id') || PRODUKSI_SPREADSHEET_ID;
  const gasUrl = getProduksiGasUrl();

  // Jika blocks belum ada tapi items ada, susun blocks secara otomatis
  const effectiveBlocks = (blocks && blocks.length > 0)
    ? blocks
    : buildMatrixBlocksFromItems(items, activeTab === 'CMT');

  // Format blocks jika ada
  const formattedBlocks = effectiveBlocks.map((b) => ({
    ...b,
    photoUrl: formatImageUrlForSheets(b.photoUrl),
  }));

  // Format flat items
  const formattedItems = items && Array.isArray(items) ? items.map((it) => ({
    tanggal_penerimaan: it.tanggal_penerimaan || '',
    kategori: it.kategori || 'Lokal CMT',
    no_surat_jalan: it.no_surat_jalan || '',
    kode_produksi: it.kode_produksi || '',
    warna: it.warna || '',
    size: it.size || '',
    qty: Number(it.qty) || 0,
    foto_url: formatImageUrlForSheets(it.foto_url),
    keterangan: it.keterangan || '',
    operator: it.operator || 'Operator',
    created_at: it.created_at || new Date().toISOString(),
  })) : [];

  const payload = {
    action: 'pushPenerimaanProduksi',
    spreadsheetId: targetSpreadsheetId,
    activeTab: activeTab,
    sheetName: `Master Produksi (${activeTab})`,
    blocks: formattedBlocks,
    items: formattedItems,
  };

  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(payload),
      redirect: 'follow',
    });

    if (res.ok) {
      try {
        const json = await res.json();
        return {
          success: json.success !== false,
          message: json.message || `Berhasil menulis Master Matrix ${activeTab} ke Google Sheet!`,
          count: blocks ? blocks.length : formattedItems.length,
          sheetUrl: `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`,
        };
      } catch {
        return {
          success: true,
          message: `Berhasil mengirim data Master Matrix ke Google Sheet!`,
          count: blocks ? blocks.length : formattedItems.length,
          sheetUrl: `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`,
        };
      }
    } else {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }
  } catch (err: any) {
    console.error('Gagal total push ke GAS Web App:', err);
    return {
      success: false,
      message:
        'Gagal terhubung ke Google Apps Script Web App. Pastikan Web App sudah di-deploy dengan akses "Anyone" (Siapa Saja). Detail: ' +
        (err?.message || err),
      error: err?.message || String(err),
      sheetUrl: `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`,
    };
  }
}


/**
 * Push data Surat Jalan tertentu ke Google Sheets (1 Surat Jalan = 1 Tab Sheet)
 * Mendukung re-push hasil hitung ulang / koreksi fisik
 */
export async function pushSuratJalanToGoogleSheet(
  suratsJalan: SuratJalanPushPayload[],
  customSpreadsheetId?: string
): Promise<PushProduksiResponse> {
  if (!suratsJalan || suratsJalan.length === 0) {
    return { success: false, message: 'Tidak ada surat jalan yang dipilih untuk dikirim.' };
  }

  const targetSpreadsheetId = customSpreadsheetId || localStorage.getItem('wms_produksi_spreadsheet_id') || PRODUKSI_SPREADSHEET_ID;
  const gasUrl = getProduksiGasUrl();

  let successCount = 0;
  let lastSheetUrl = `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`;
  let lastError = '';

  // Kirim setiap Surat Jalan sebagai 1 Tab Sheet tersendiri
  for (const sj of suratsJalan) {
    const rawSjNo = (sj.no_surat_jalan || 'SJ-UNKNOWN').trim();
    // Sanitasi nama tab untuk Google Sheets (max 80 char, tanpa karakter khusus : / ? * [ ])
    const cleanSjName = rawSjNo.replace(/[:\/\?\*\[\]]/g, '_').substring(0, 80);
    const targetSheetName = cleanSjName.startsWith('SJ_') || cleanSjName.startsWith('SJ-')
      ? cleanSjName
      : `SJ_${cleanSjName}`;

    // Kelompokkan item-item dalam Surat Jalan ini per Kode Produksi
    const codeMap = new Map<string, typeof sj.items>();
    sj.items.forEach((it) => {
      const c = (it.kode_produksi || 'CODE').trim().toUpperCase();
      if (!codeMap.has(c)) codeMap.set(c, []);
      codeMap.get(c)!.push(it);
    });

    const blocks: MatrixProductBlock[] = [];
    let rowNum = 1;

    codeMap.forEach((cItems, code) => {
      const first = cItems[0];
      const colorMap = new Map<string, typeof sj.items>();
      cItems.forEach((it) => {
        const col = (it.warna || 'DEFAULT').trim().toUpperCase();
        if (!colorMap.has(col)) colorMap.set(col, []);
        colorMap.get(col)!.push(it);
      });

      const colorGroups: any[] = [];
      let prodDatang = 0;

      colorMap.forEach((colItems, colName) => {
        const sizes: any[] = [];
        let colQty = 0;

        colItems.forEach((it) => {
          const q = Number(it.qty) || 0;
          colQty += q;
          sizes.push({
            size: it.size || 'Default',
            qtyByDate: { [sj.tanggal]: q },
            totalSizeQty: q,
          });
        });

        prodDatang += colQty;
        colorGroups.push({
          color: colName,
          sizes: sizes,
          totalColorQty: colQty,
        });
      });

      blocks.push({
        id: code,
        rowNumber: rowNum++,
        code: code,
        productName: first.nama_produk || '',
        upVendor: sj.up_vendor || first.keterangan || '',
        kategori: sj.kategori || 'Lokal CMT',
        photoUrl: formatImageUrlForSheets(first.foto_url),
        catatan: sj.keterangan || (sj.is_recount ? 'Hasil Hitung Ulang Fisik' : ''),
        distinctSjs: [],
        colorGroups: colorGroups,
        dateSlots: [sj.tanggal, '', '', '', '', '', '', '', '', ''],
        totalDatang: prodDatang,
        totalNet: prodDatang,
        kg: 0,
        ongkirPerKg: 0,
        totalOngkir: 0,
        ongkirPerPcs: 0,
      });
    });

    // Kirim payload dengan sheetName = targetSheetName
    const payload = {
      action: 'pushPenerimaanProduksi',
      spreadsheetId: targetSpreadsheetId,
      activeTab: sj.kategori === 'Kargo' ? 'Kargo' : 'CMT',
      sheetName: targetSheetName,
      blocks: blocks,
      surats_jalan: [sj], // Juga sertakan untuk kompatibilitas jika GAS di masa depan langsung render custom KOP
    };

    try {
      const res = await fetch(gasUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
        redirect: 'follow',
      });

      if (res.ok) {
        try {
          const json = await res.json();
          if (json.success !== false) {
            successCount++;
            if (json.sheetUrl) lastSheetUrl = json.sheetUrl;
          } else {
            lastError = json.message || 'Gagal membuat sheet';
          }
        } catch {
          successCount++;
        }
      } else {
        lastError = `HTTP ${res.status}`;
      }
    } catch (err: any) {
      console.warn(`Gagal push tab ${targetSheetName}:`, err);
      lastError = err?.message || String(err);
    }
  }

  if (successCount > 0) {
    return {
      success: true,
      message: `Sukses membuat & mengisi ${successCount} Tab Surat Jalan (1 SJ = 1 Sheet) di Google Spreadsheet!`,
      count: successCount,
      sheetUrl: lastSheetUrl,
    };
  }

  return {
    success: false,
    message: lastError ? `Gagal mengirim ke Google Sheet: ${lastError}` : 'Gagal mengirim Surat Jalan ke Sheet.',
    error: lastError,
  };
}

export interface MasterRecountDeltaItem {
  kode_produksi: string;
  warna: string;
  size: string;
  qty_asli: number; // Surat Jalan
  qty_fisik: number; // Hasil hitung ulang
  selisih: number; // qty_fisik - qty_asli
  status: 'MATCH' | 'KURANG' | 'LEBIH' | string;
  round?: number;
  auditor?: string;
  catatan?: string;
  tanggal_kedatangan_info?: string; // Info tanggal kedatangan yang diaudit (misal "23 Sep & 24 Sep")
  updated_at?: string;
}

export interface MasterRecountDeltaPayload {
  spreadsheetId?: string;
  activeTab?: 'CMT' | 'Kargo' | string;
  kode_produksi: string;
  tanggal_hitung?: string;
  items: MasterRecountDeltaItem[];
}

/**
 * PUSH TARGETED DELTA HITUNG ULANG KE MASTER MATRIX SPREADSHEET
 * Hanya memperbarui baris SKU/Kode yang bersangkutan tanpa menulis ulang ribuan baris lain (Anti-Timeout)
 */
export async function pushMasterRecountDeltaToGoogleSheet(
  payload: MasterRecountDeltaPayload
): Promise<PushProduksiResponse> {
  const gasUrl = getProduksiGasUrl();
  const targetSpreadsheetId = payload.spreadsheetId || PRODUKSI_SPREADSHEET_ID;

  const reqPayload = {
    action: 'update_master_recount_delta',
    spreadsheetId: targetSpreadsheetId,
    activeTab: payload.activeTab || 'CMT',
    kode_produksi: payload.kode_produksi,
    tanggal_hitung: payload.tanggal_hitung || (payload.items[0]?.updated_at ? payload.items[0].updated_at.split('T')[0] : new Date().toISOString().split('T')[0]),
    items: payload.items,
  };

  try {
    const res = await fetch(gasUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      body: JSON.stringify(reqPayload),
      redirect: 'follow',
    });

    if (!res.ok) {
      return {
        success: false,
        message: `HTTP Error ${res.status}: Gagal memperbarui Master Sheet`,
      };
    }

    const data = await res.json();
    return {
      success: data.success !== false,
      message: data.message || `Sukses update hitung ulang Kode ${payload.kode_produksi} di Master Sheet!`,
      sheetUrl: data.sheetUrl,
      error: data.error,
    };
  } catch (err: any) {
    console.warn('Gagal push recount delta ke Google Sheet:', err);
    return {
      success: false,
      message: `Gagal menghubungkan ke Google Apps Script: ${err.message || err}`,
      error: err.message || String(err),
    };
  }
}

