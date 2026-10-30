import { PenerimaanProduksiItem, ProduksiQtyNotaRecord } from '../types';
import { MatrixProductBlock } from '../components/penerimaan/ProduksiSpreadsheetView';
import {
  getCachedProduksiQtyNotaMapSync,
  fetchProduksiQtyNotaMapFromSupabase,
  saveProduksiQtyNotaMapToSupabase,
  fetchPenerimaanRecountQueueFromSupabase,
  savePenerimaanRecountQueueToSupabase,
} from './supabase';

export const PRODUKSI_SPREADSHEET_ID = '1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk';
export const PRODUKSI_SCRIPT_ID = '1vYGP1u5mCAvjFYbJQHbc7mLruxrtwUmlKh27djBJ6oBlomuOCCKy-scb';
export const DEFAULT_PRODUKSI_GAS_URL = 'https://script.google.com/macros/s/AKfycbyrsovwstbIR_e1-zgOovxt2sKCyPTjpON9XbOERShS-mZd-Aj5TgWueZRjwDJ05bponA/exec';

/**
 * Mendapatkan URL GAS Produksi yang valid
 */
export function getProduksiGasUrl(): string {
  try {
    const custom = localStorage.getItem('wms_produksi_gas_url') || '';
    if (!custom || !custom.trim() || !custom.includes('script.google.com') || custom !== DEFAULT_PRODUKSI_GAS_URL) {
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

  const cachedNotaMap = getCachedProduksiQtyNotaMapSync();

  mapByCode.forEach((items, code) => {
    const firstItem = items[0];
    const normCode = code.trim().toUpperCase();
    const notaRec = cachedNotaMap[normCode];
    const targetSingleDate = customDateSlots && customDateSlots.length === 1 ? customDateSlots[0] : null;
    const effectiveQtyNota =
      targetSingleDate && notaRec?.by_date && notaRec.by_date[targetSingleDate] !== undefined
        ? notaRec.by_date[targetSingleDate]
        : notaRec?.qty_nota !== undefined && notaRec?.qty_nota !== null
        ? notaRec.qty_nota
        : firstItem.qty_nota ?? null;

    // Temukan semua tanggal yang ada (Khusus barang datang, abaikan baris retur)
    const dateSet = new Set<string>();
    const dateToSjMap: Record<string, string[]> = {};
    items.forEach((it) => {
      const isReturItem =
        (it.no_surat_jalan && it.no_surat_jalan.toUpperCase().startsWith('RETUR-')) ||
        (it.keterangan && it.keterangan.includes('RETUR_CMT:'));
      if (!isReturItem && it.tanggal_penerimaan && Number(it.qty) > 0) {
        const t = it.tanggal_penerimaan.trim();
        dateSet.add(t);
        const sj = (it.no_surat_jalan || '').trim().toUpperCase();
        if (sj) {
          if (!dateToSjMap[t]) dateToSjMap[t] = [];
          if (!dateToSjMap[t].includes(sj)) dateToSjMap[t].push(sj);
        }
      }
    });
    const itemDates = Array.from(dateSet).sort().reverse();

    // Pisahkan slot kolom per (Tanggal + No. SJ) jika ada > 1 Surat Jalan di hari yang sama
    const distinctSlots: string[] = [];
    const baseDates = customDateSlots && customDateSlots.length > 0 ? customDateSlots : itemDates;
    baseDates.forEach((d) => {
      const cleanDate = d.includes('||') ? d.split('||')[0] : d;
      const sjs = dateToSjMap[cleanDate] || [];
      if (d.includes('||')) {
        distinctSlots.push(d);
      } else if (sjs.length > 1) {
        sjs.forEach((sj) => distinctSlots.push(`${cleanDate}||${sj}`));
      } else if (sjs.length === 1) {
        distinctSlots.push(`${cleanDate}||${sjs[0]}`);
      } else {
        distinctSlots.push(cleanDate);
      }
    });
    const finalDateSlots = distinctSlots.length > 0 ? distinctSlots : baseDates;

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
            const sj = (it.no_surat_jalan || '').trim().toUpperCase();
            const q = Number(it.qty) || 0;
            if (!isReturItem && tgl && q > 0) {
              const slotKey = sj ? `${tgl}||${sj}` : tgl;
              qtyByDate[slotKey] = (qtyByDate[slotKey] || 0) + q;
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

    const sjMap = new Map<string, { no_surat_jalan: string; qty: number; tanggal: string }>();
    items.forEach((it) => {
      const sj = (it.no_surat_jalan || '').trim().toUpperCase();
      if (sj) {
        if (!sjMap.has(sj)) {
          sjMap.set(sj, { no_surat_jalan: sj, qty: 0, tanggal: it.tanggal_penerimaan || '' });
        }
        sjMap.get(sj)!.qty += Number(it.qty) || 0;
      }
    });
    const distinctSjs = Array.from(sjMap.values()).sort((a, b) => b.qty - a.qty);

    resultBlocks.push({
      id: code,
      rowNumber: rowNum++,
      code,
      productName: firstItem.nama_produk || '',
      upVendor: firstItem.keterangan || '',
      kategori: activeTab === 'Kargo' ? 'Kargo' : 'Lokal CMT',
      photoUrl: formatImageUrlForSheets(firstItem.foto_url),
      catatan: firstItem.keterangan || '',
      distinctSjs,
      colorGroups,
      dateSlots: finalDateSlots,
      returDateSlots: [],
      totalDatang: blockTotalDatang,
      totalRetur: 0,
      totalNet: blockTotalDatang,
      qtyNota: effectiveQtyNota,
      selisihNota: effectiveQtyNota !== null && effectiveQtyNota !== undefined ? blockTotalDatang - Number(effectiveQtyNota) : null,
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

          const normCode = (b.code || '').trim().toUpperCase();
          const cachedNota = getCachedProduksiQtyNotaMapSync()[normCode];
          const dateSpecificNota =
            cachedNota?.by_date && cachedNota.by_date[dStr] !== undefined
              ? cachedNota.by_date[dStr]
              : b.dateSlots.filter(Boolean).length <= 1
              ? (b.qtyNota ?? cachedNota?.qty_nota ?? null)
              : null;

          return {
            ...b,
            photoUrl: formatImageUrlForSheets(b.photoUrl),
            dateSlots: [dStr],
            colorGroups,
            totalDatang: dateDatang,
            totalNet: dateDatang,
            qtyNota: dateSpecificNota,
            selisihNota: dateSpecificNota !== null && dateSpecificNota !== undefined ? dateDatang - Number(dateSpecificNota) : null,
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
  const cachedNotaMapMaster = getCachedProduksiQtyNotaMapSync();
  const formattedBlocks = effectiveBlocks.map((b) => {
    const normCode = (b.code || '').trim().toUpperCase();
    const resolvedQtyNota = b.qtyNota !== undefined && b.qtyNota !== null ? b.qtyNota : (cachedNotaMapMaster[normCode]?.qty_nota ?? null);
    const effectiveFisik = (b.hasRecount && b.totalRecountFisik !== null && b.totalRecountFisik !== undefined)
      ? b.totalRecountFisik
      : b.totalNet;
    return {
      ...b,
      photoUrl: formatImageUrlForSheets(b.photoUrl),
      qtyNota: resolvedQtyNota,
      selisihNota: resolvedQtyNota !== null && resolvedQtyNota !== undefined ? effectiveFisik - Number(resolvedQtyNota) : null,
    };
  });

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

/**
 * Memperbarui tab indeks DAFTAR_TANGGAL di Google Spreadsheet
 * Membaca semua tab tanggal yang ada, menyusun urutan tanggal terbaru di atas,
 * dan menyediakan hyperlink navigasi langsung ke setiap tab tanggal.
 */
export async function refreshProduksiSpreadsheetIndex(
  customSpreadsheetId?: string
): Promise<PushProduksiResponse & { totalTabs?: number }> {
  const targetSpreadsheetId = customSpreadsheetId || localStorage.getItem('wms_produksi_spreadsheet_id') || PRODUKSI_SPREADSHEET_ID;
  const gasUrl = getProduksiGasUrl();

  const payload = {
    action: 'refresh_index',
    spreadsheetId: targetSpreadsheetId,
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

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Gagal memperbarui indeks spreadsheet`);
    }

    const json = await res.json().catch(() => ({ success: true }));
    return {
      success: json.success !== false,
      message: json.message || 'Sukses memperbarui Indeks Daftar Tanggal di Google Spreadsheet!',
      totalTabs: json.totalTabs,
      sheetUrl: json.sheetUrl || `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`,
    };
  } catch (err: any) {
    console.error('Error refreshProduksiSpreadsheetIndex:', err);
    return {
      success: false,
      message: `Gagal memperbarui indeks spreadsheet: ${err?.message || err}`,
      error: err?.message || String(err),
      sheetUrl: `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`,
    };
  }
}

export interface FetchQtyNotaResponse {
  success: boolean;
  count?: number;
  notaMap?: Record<string, ProduksiQtyNotaRecord>;
  records?: ProduksiQtyNotaRecord[];
  message?: string;
  error?: string;
}

/**
 * Menarik data Qty Nota yang diisi oleh Buyer di Google Spreadsheet
 * (Membaca dari Sheet Master Produksi Kargo/CMT maupun Sheet Satuan Per Tanggal)
 */
export async function fetchQtyNotaFromGoogleSheet(
  customSpreadsheetId?: string
): Promise<FetchQtyNotaResponse> {
  const targetSpreadsheetId =
    customSpreadsheetId || localStorage.getItem('wms_produksi_spreadsheet_id') || PRODUKSI_SPREADSHEET_ID;
  const gasUrl = getProduksiGasUrl();

  const payload = {
    action: 'fetch_qty_nota',
    spreadsheetId: targetSpreadsheetId,
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

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Gagal membaca Qty Nota dari Google Sheet`);
    }

    const json = await res.json();
    return {
      success: json.success !== false,
      count: json.count || (json.records ? json.records.length : 0),
      notaMap: json.notaMap || {},
      records: json.records || [],
      message: json.message,
      error: json.error,
    };
  } catch (err: any) {
    console.warn('Gagal menarik Qty Nota dari Google Sheet:', err);
    return {
      success: false,
      error: err?.message || String(err),
      message: `Gagal menarik Qty Nota dari Google Sheet: ${err?.message || err}`,
    };
  }
}

/**
 * Mengirim perubahan Qty Nota per Kode dari Frontend langsung ke Google Sheet (Master & Sheet Tanggal)
 */
export async function pushQtyNotaDeltaToGoogleSheet(options: {
  kode_produksi: string;
  qty_nota: number | null | '';
  kategori?: string;
  tanggal?: string;
  customSpreadsheetId?: string;
}): Promise<PushProduksiResponse> {
  const targetSpreadsheetId =
    options.customSpreadsheetId || localStorage.getItem('wms_produksi_spreadsheet_id') || PRODUKSI_SPREADSHEET_ID;
  const gasUrl = getProduksiGasUrl();

  const payload = {
    action: 'update_qty_nota_delta',
    spreadsheetId: targetSpreadsheetId,
    kode_produksi: options.kode_produksi.trim().toUpperCase(),
    qty_nota: options.qty_nota === null || options.qty_nota === undefined || options.qty_nota === '' ? '' : Number(options.qty_nota),
    kategori: options.kategori,
    tanggal: options.tanggal,
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

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const json = await res.json();
    return {
      success: json.success !== false,
      message: json.message || `Berhasil memperbarui Qty Nota Kode ${options.kode_produksi} di Google Sheet!`,
      error: json.error,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Gagal update Qty Nota ke Google Sheet: ${err?.message || err}`,
      error: err?.message || String(err),
    };
  }
}

export interface SyncQtyNotaResult {
  success: boolean;
  notaMap: Record<string, ProduksiQtyNotaRecord>;
  totalNotaCodes: number;
  activeDiffCodes: string[];
  newlyQueuedCodes: string[];
  message: string;
}

/**
 * SINKRONISASI 2 ARAH:
 * 1. Membaca Qty Nota yang diisi Buyer dari Google Sheet (Master & Sheet Satuan Per Tanggal)
 * 2. Menggabungkan & mem-backup Qty Nota ke Supabase Cloud (`produksi_qty_nota_map`)
 * 3. Menghitung Selisih (`Total Diterima - Qty Nota`)
 * 4. Jika muncul Selisih (!== 0), secara sistematis mendaftarkan Kode Produksi ke Antrian Audit Hitung Ulang!
 */
export async function syncQtyNotaAndAutoQueueRecount(options: {
  penerimaanItems: PenerimaanProduksiItem[];
  customSpreadsheetId?: string;
  updatedBy?: string;
  skipSheetFetch?: boolean;
  overrideNotaEntry?: { kode_produksi: string; qty_nota: number | null; kategori?: string };
}): Promise<SyncQtyNotaResult> {
  const { penerimaanItems, customSpreadsheetId, updatedBy = 'Buyer Sheet Sync', skipSheetFetch = false, overrideNotaEntry } = options;

  // 1. Hitung Total Diterima (Net) per Kode Produksi dari data penerimaan WMS
  const totalDiterimaByCode = new Map<string, number>();
  const kategoriByCode = new Map<string, string>();

  (penerimaanItems || []).forEach((it) => {
    const normCode = String(it.kode_produksi || '')
      .replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t]/g, '')
      .trim()
      .toUpperCase();
    if (!normCode) return;

    if (!kategoriByCode.has(normCode) && it.kategori) {
      kategoriByCode.set(normCode, it.kategori);
    }

    const noSjStr = String(it.no_surat_jalan || '').trim();
    const ketStr = String(it.keterangan || '').trim();
    const isReturOnly =
      noSjStr.toUpperCase().startsWith('RETUR-') ||
      ketStr.includes('RETUR_CMT:') ||
      (Number(it.qty_retur) > 0 && (!it.qty || Number(it.qty) === 0));

    const prev = totalDiterimaByCode.get(normCode) || 0;
    if (isReturOnly) {
      totalDiterimaByCode.set(normCode, prev - (Number(it.qty_retur) || Number(it.qty) || 0));
    } else {
      totalDiterimaByCode.set(normCode, prev + (Number(it.qty) || 0) - (Number(it.qty_retur) || 0));
    }
  });

  // 2. Ambil data backup dari Supabase Cloud, data Audit Hitung Ulang, & tarik data terbaru dari Google Sheet
  const [cloudNotaMap, cloudAuditMap, sheetRes] = await Promise.all([
    fetchProduksiQtyNotaMapFromSupabase(),
    fetchRecountAuditMapFromCloud(),
    skipSheetFetch ? Promise.resolve({ success: true, notaMap: {} } as FetchQtyNotaResponse) : fetchQtyNotaFromGoogleSheet(customSpreadsheetId),
  ]);
  const localAuditMap = getRecountAuditMap();
  const activeAuditMap: Record<string, any> = { ...cloudAuditMap, ...localAuditMap };

  const mergedNotaMap: Record<string, ProduksiQtyNotaRecord> = { ...cloudNotaMap };
  const nowIso = new Date().toISOString();

  // Terapkan data terbaru dari Google Sheet (prioritas utama karena Buyer isi di Sheet)
  if (sheetRes.success && sheetRes.notaMap) {
    Object.keys(sheetRes.notaMap).forEach((rawCode) => {
      const code = rawCode.trim().toUpperCase();
      const sRec = sheetRes.notaMap![rawCode];
      if (sRec && sRec.qty_nota !== null && sRec.qty_nota !== undefined && !isNaN(Number(sRec.qty_nota))) {
        const wmsTotal = totalDiterimaByCode.has(code)
          ? Math.max(0, totalDiterimaByCode.get(code)!)
          : Number(sRec.total_diterima) || 0;
        const auditFisik = activeAuditMap[code]?.total_fisik !== undefined && activeAuditMap[code]?.total_fisik !== null
          ? Number(activeAuditMap[code].total_fisik)
          : (sRec.total_fisik_recount !== undefined && sRec.total_fisik_recount !== null ? Number(sRec.total_fisik_recount) : null);
        const effectiveTotal = auditFisik !== null ? auditFisik : wmsTotal;
        const qNota = Number(sRec.qty_nota);
        mergedNotaMap[code] = {
          kode_produksi: code,
          kategori: sRec.kategori || kategoriByCode.get(code) || 'Kargo',
          qty_nota: qNota,
          total_diterima: wmsTotal,
          selisih_nota: effectiveTotal - qNota,
          by_date: sRec.by_date || mergedNotaMap[code]?.by_date || {},
          source_sheet: sRec.source_sheet || 'Google Sheet',
          updated_at: sRec.updated_at || nowIso,
          updated_by: updatedBy,
        };
      }
    });
  }

  // Jika ada input manual/override langsung dari Frontend
  if (overrideNotaEntry) {
    const oCode = overrideNotaEntry.kode_produksi.trim().toUpperCase();
    const wmsTotal = Math.max(0, totalDiterimaByCode.get(oCode) || mergedNotaMap[oCode]?.total_diterima || 0);
    if (overrideNotaEntry.qty_nota === null || overrideNotaEntry.qty_nota === undefined || isNaN(Number(overrideNotaEntry.qty_nota))) {
      delete mergedNotaMap[oCode];
    } else {
      const qNota = Number(overrideNotaEntry.qty_nota);
      const auditFisik = activeAuditMap[oCode]?.total_fisik !== undefined && activeAuditMap[oCode]?.total_fisik !== null
        ? Number(activeAuditMap[oCode].total_fisik)
        : null;
      const effectiveTotal = auditFisik !== null ? auditFisik : wmsTotal;
      mergedNotaMap[oCode] = {
        kode_produksi: oCode,
        kategori: overrideNotaEntry.kategori || kategoriByCode.get(oCode) || mergedNotaMap[oCode]?.kategori || 'Kargo',
        qty_nota: qNota,
        total_diterima: wmsTotal,
        selisih_nota: effectiveTotal - qNota,
        by_date: mergedNotaMap[oCode]?.by_date || {},
        source_sheet: 'Input WMS',
        updated_at: nowIso,
        updated_by: updatedBy,
      };
    }
  }

  // Rekalkulasi ulang semua entry di mergedNotaMap terhadap totalDiterimaByCode terbaru di WMS
  Object.keys(mergedNotaMap).forEach((code) => {
    const rec = mergedNotaMap[code];
    if (!rec || rec.qty_nota === null || rec.qty_nota === undefined) return;
    if (totalDiterimaByCode.has(code)) {
      const latestTotal = Math.max(0, totalDiterimaByCode.get(code)!);
      rec.total_diterima = latestTotal;
      const auditFisik = activeAuditMap[code]?.total_fisik !== undefined && activeAuditMap[code]?.total_fisik !== null
        ? Number(activeAuditMap[code].total_fisik)
        : null;
      const effectiveTotal = auditFisik !== null ? auditFisik : latestTotal;
      rec.selisih_nota = effectiveTotal - Number(rec.qty_nota);
    }
  });

  // 3. Backup data Qty Nota ke Supabase Cloud
  await saveProduksiQtyNotaMapToSupabase(mergedNotaMap, updatedBy);

  // 4. Sistematis Buat / Perbarui Antrian Hitung Ulang di Fitur Audit Hitung Ulang untuk semua kode yang Selisih (!== 0)
  const currentQueue = await fetchPenerimaanRecountQueueFromSupabase();
  let queueChanged = false;
  const activeDiffCodes: string[] = [];
  const newlyQueuedCodes: string[] = [];

  Object.keys(mergedNotaMap).forEach((code) => {
    const rec = mergedNotaMap[code];
    if (!rec || rec.qty_nota === null || rec.qty_nota === undefined) return;

    const selisih = Number(rec.selisih_nota) || 0;
    const existingQueueItem = currentQueue[code];

    if (selisih !== 0) {
      activeDiffCodes.push(code);
      const statusLabel = selisih < 0 ? `KURANG ${Math.abs(selisih)} pcs` : `LEBIH +${selisih} pcs`;
      const autoHint = `Selisih Nota Buyer: ${statusLabel} (Diterima: ${rec.total_diterima} pcs, Qty Nota: ${rec.qty_nota} pcs)`;

      // Pertahankan catatan manual auditor jika ada di luar teks otomatis
      let finalNote = autoHint;
      if (existingQueueItem?.catatan_petunjuk && typeof existingQueueItem.catatan_petunjuk === 'string') {
        const cleanedOld = existingQueueItem.catatan_petunjuk
          .replace(/Selisih Nota Buyer:[^|]*(\|\s*)?/gi, '')
          .trim();
        if (cleanedOld && cleanedOld !== autoHint) {
          finalNote = `${autoHint} | ${cleanedOld}`;
        }
      }

      if (!existingQueueItem) {
        newlyQueuedCodes.push(code);
        currentQueue[code] = {
          catatan_petunjuk: finalNote,
          added_at: nowIso,
          added_by: 'Auto-Queue (Selisih Nota Buyer)',
          qty_nota: rec.qty_nota,
          total_diterima: rec.total_diterima,
          selisih_nota: selisih,
          auto_queued_from_nota: true,
        };
        queueChanged = true;
      } else if (
        existingQueueItem.qty_nota !== rec.qty_nota ||
        existingQueueItem.selisih_nota !== selisih ||
        !existingQueueItem.catatan_petunjuk?.includes(`Qty Nota: ${rec.qty_nota}`)
      ) {
        currentQueue[code] = {
          ...existingQueueItem,
          catatan_petunjuk: finalNote,
          qty_nota: rec.qty_nota,
          total_diterima: rec.total_diterima,
          selisih_nota: selisih,
          auto_queued_from_nota: true,
        };
        queueChanged = true;
      }
    } else if (existingQueueItem) {
      // Jika selisih_nota == 0 (Sudah Klop dengan Nota Buyer)
      if (existingQueueItem.qty_nota !== rec.qty_nota || existingQueueItem.selisih_nota !== 0) {
        currentQueue[code] = {
          ...existingQueueItem,
          qty_nota: rec.qty_nota,
          total_diterima: rec.total_diterima,
          selisih_nota: 0,
        };
        queueChanged = true;
      }
    }
  });

  if (queueChanged) {
    await savePenerimaanRecountQueueToSupabase(currentQueue);
  }

  const totalNotaCodes = Object.keys(mergedNotaMap).length;
  const msg =
    newlyQueuedCodes.length > 0
      ? `Berhasil sinkron ${totalNotaCodes} Qty Nota Buyer (${newlyQueuedCodes.length} kode selisih otomatis masuk Antrian Hitung Ulang: ${newlyQueuedCodes.slice(0, 5).join(', ')})`
      : activeDiffCodes.length > 0
      ? `Tersinkron ${totalNotaCodes} Qty Nota Buyer (${activeDiffCodes.length} kode selisih terdaftar di Antrian Hitung Ulang).`
      : `Tersinkron ${totalNotaCodes} Qty Nota Buyer (Semua sesuai / tidak ada selisih baru).`;

  return {
    success: true,
    notaMap: mergedNotaMap,
    totalNotaCodes,
    activeDiffCodes,
    newlyQueuedCodes,
    message: msg,
  };
}



