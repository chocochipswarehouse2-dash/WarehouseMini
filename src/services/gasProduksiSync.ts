import { PenerimaanProduksiItem, ProduksiQtyNotaRecord } from '../types';
import { MatrixProductBlock } from '../components/penerimaan/ProduksiSpreadsheetView';
import {
  getCachedProduksiQtyNotaMapSync,
  fetchProduksiQtyNotaMapFromSupabase,
  saveProduksiQtyNotaMapToSupabase,
  fetchPenerimaanRecountQueueFromSupabase,
  savePenerimaanRecountQueueToSupabase,
  getRecountAuditMap,
  fetchRecountAuditMapFromCloud,
} from './supabase';
import { lookupProductBySku } from '../utils/productLookup';

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

export function extractIsoDateFromSlot(slot?: string | null): string {
  if (!slot) return '';
  const raw = String(slot).split('||')[0].trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  return raw;
}

export function sortDateSlotsDesc(slots: string[] = []): string[] {
  const nonEmpty = slots.filter((s) => Boolean(s && String(s).trim()));
  const sorted = [...nonEmpty].sort((a, b) => {
    const da = extractIsoDateFromSlot(a);
    const db = extractIsoDateFromSlot(b);
    if (db !== da) return db.localeCompare(da);
    return String(a).localeCompare(String(b));
  });
  const emptyCount = Math.max(0, slots.length - sorted.length);
  for (let i = 0; i < emptyCount; i++) {
    sorted.push('');
  }
  return sorted;
}

export function getLatestDateForMatrixBlock(block: MatrixProductBlock): string {
  let maxDate = '';
  for (const slot of block.dateSlots || []) {
    const d = extractIsoDateFromSlot(slot);
    if (d && (!maxDate || d > maxDate)) maxDate = d;
  }
  for (const sj of block.distinctSjs || []) {
    const d = extractIsoDateFromSlot(sj?.tanggal);
    if (d && (!maxDate || d > maxDate)) maxDate = d;
  }
  return maxDate;
}

export function sortMatrixBlocksNewestFirst(blocks: MatrixProductBlock[]): MatrixProductBlock[] {
  return [...(blocks || [])]
    .map((b) => ({
      ...b,
      dateSlots: sortDateSlotsDesc(b.dateSlots || []),
      returDateSlots: Array.isArray(b.returDateSlots) ? sortDateSlotsDesc(b.returDateSlots) : b.returDateSlots,
    }))
    .sort((a, b) => {
      const da = getLatestDateForMatrixBlock(a);
      const db = getLatestDateForMatrixBlock(b);
      if (db !== da) {
        if (!db) return -1;
        if (!da) return 1;
        return db.localeCompare(da);
      }
      return String(a.code || '').localeCompare(String(b.code || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
    })
    .map((b, idx) => ({
      ...b,
      rowNumber: idx + 1,
    }));
}

export function formatRecountLogEntry(opts: {
  round?: number;
  updatedAt?: string;
  arrivalDates?: (string | undefined)[];
  auditor?: string;
  notes?: string;
}): string {
  const rev = opts.round || 1;
  const dateStr = formatDateIndo(opts.updatedAt || new Date().toISOString());
  const datesSummary = opts.arrivalDates ? formatDatesSummary(opts.arrivalDates) : '';
  const auditor = opts.auditor || 'Auditor Fisik';
  let text = `Rev ${rev} [${dateStr}]`;
  if (datesSummary) text += ` (Kedatangan: ${datesSummary})`;
  text += ` (${auditor})`;
  if (opts.notes && String(opts.notes).trim()) {
    text += `: ${String(opts.notes).trim()}`;
  }
  return text;
}

function normAuditKeyPart(val?: string | null, fallback = ''): string {
  return String(val ?? fallback)
    .replace(/[\u200B-\u200D\uFEFF\u00A0\r\n\t]/g, '')
    .trim()
    .toUpperCase();
}

export function enrichBlocksWithRecountAudit(
  blocks: MatrixProductBlock[],
  auditMap: Record<string, any> | null | undefined
): MatrixProductBlock[] {
  const normAuditMap = new Map<string, any>();
  if (auditMap && typeof auditMap === 'object') {
    Object.keys(auditMap).forEach((k) => {
      const rec = auditMap[k];
      const nk = normAuditKeyPart(k || rec?.kode_produksi || '');
      if (nk && rec) normAuditMap.set(nk, rec);
    });
  }

  return (blocks || []).map((b) => {
    const normCode = normAuditKeyPart(b.code);
    const auditRec = normAuditMap.get(normCode);
    const variantLookup = new Map<string, any>();
    if (auditRec && Array.isArray(auditRec.variants)) {
      auditRec.variants.forEach((v: any) => {
        const w = normAuditKeyPart(v.warna, 'DEFAULT');
        const s = normAuditKeyPart(v.size, 'DEFAULT');
        variantLookup.set(`${w}___${s}`, v);
      });
    }

    const arrivalDates = Array.from(
      new Set((b.dateSlots || []).map((d) => extractIsoDateFromSlot(d)).filter(Boolean))
    );
    const savedAuditedDates: string[] = Array.isArray(auditRec?.audited_dates)
      ? auditRec.audited_dates.map((d: any) => extractIsoDateFromSlot(String(d || ''))).filter(Boolean)
      : [];

    // Kumpulkan tanggal yang benar-benar sudah diaudit vs belum diaudit di tingkat blok
    const blockAuditedDateSet = new Set<string>(savedAuditedDates);
    const blockPendingDateSet = new Set<string>();
    (b.colorGroups || []).forEach((cg: any) => {
      (cg.sizes || []).forEach((sz: any) => {
        if (Array.isArray(sz.recountAuditedDates)) {
          sz.recountAuditedDates.forEach((d: string) => {
            const iso = extractIsoDateFromSlot(d);
            if (iso) blockAuditedDateSet.add(iso);
          });
        }
        if (Array.isArray(sz.recountPendingDates)) {
          sz.recountPendingDates.forEach((d: string) => {
            const iso = extractIsoDateFromSlot(d);
            if (iso) blockPendingDateSet.add(iso);
          });
        }
      });
    });

    let blockHasRecount = false;
    let blockRecountFisik: number | null = null;
    let blockRecountSelisih: number | null = null;
    let blockHasDiff = false;
    let totalSizeRows = 0;
    let countedSizeRows = 0;
    let anyRowPendingBatch = false;
    let pendingFollowUpQty = 0;

    const updatedColorGroups = (b.colorGroups || []).map((cg: any) => {
      const colorName = normAuditKeyPart(cg.color || cg.colorName, 'DEFAULT');
      const updatedSizes = (cg.sizes || []).map((sz: any) => {
        totalSizeRows++;
        const sizeName = normAuditKeyPart(sz.size || sz.sizeName, 'DEFAULT');
        const matchedVar =
          variantLookup.get(`${colorName}___${sizeName}`) ||
          (sizeName === 'ALL SIZE' ? variantLookup.get(`${colorName}___DEFAULT`) : undefined) ||
          (sizeName === 'DEFAULT' ? variantLookup.get(`${colorName}___ALL SIZE`) : undefined);

        const existingFisik =
          sz.recountFisik !== undefined && sz.recountFisik !== null && sz.recountFisik !== ''
            ? Number(sz.recountFisik)
            : sz.recountQty !== undefined && sz.recountQty !== null && sz.recountQty !== ''
              ? Number(sz.recountQty)
              : null;

        const auditFisik =
          matchedVar && matchedVar.qty_fisik !== undefined && matchedVar.qty_fisik !== null && matchedVar.qty_fisik !== ''
            ? Number(matchedVar.qty_fisik)
            : null;

        const finalFisik = existingFisik !== null && !isNaN(existingFisik)
          ? existingFisik
          : (auditFisik !== null && !isNaN(auditFisik) ? auditFisik : null);

        const baseSizeQty = Number(sz.totalSizeQty) || 0;

        // Deteksi batch susulan per baris:
        // 1) Ada item penerimaan baru pada varian ini yang belum punya recount_qty (sz.recountPendingBatch), ATAU
        // 2) Record audit sebelumnya menyimpan qty_asli yang lebih kecil dari totalSizeQty saat ini
        const matchedVarAsli =
          matchedVar && matchedVar.qty_asli !== undefined && matchedVar.qty_asli !== null
            ? Number(matchedVar.qty_asli)
            : null;
        const isRowPendingBatch =
          finalFisik !== null &&
          (Boolean(sz.recountPendingBatch) || (matchedVarAsli !== null && matchedVarAsli < baseSizeQty));
        const rowPendingQty =
          isRowPendingBatch
            ? (Number(sz.recountPendingQty) > 0
                ? Number(sz.recountPendingQty)
                : matchedVarAsli !== null
                  ? Math.max(0, baseSizeQty - matchedVarAsli)
                  : 0)
            : (finalFisik === null ? baseSizeQty : 0);

        if (isRowPendingBatch) {
          anyRowPendingBatch = true;
          pendingFollowUpQty += rowPendingQty;
        }

        const rowPendingDates: string[] = Array.isArray(sz.recountPendingDates) && sz.recountPendingDates.length > 0
          ? sz.recountPendingDates
          : Array.from(blockPendingDateSet);

        // Gunakan tanggal kedatangan yang BENAR-BENAR sudah diaudit agar log tidak menyesatkan
        const rowAuditedDates: string[] =
          Array.isArray(sz.recountAuditedDates) && sz.recountAuditedDates.length > 0
            ? sz.recountAuditedDates
            : blockAuditedDateSet.size > 0
              ? Array.from(blockAuditedDateSet)
              : isRowPendingBatch && rowPendingDates.length > 0
                ? arrivalDates.filter((d) => !rowPendingDates.includes(d))
                : arrivalDates;

        const finalSelisih =
          finalFisik !== null && !isRowPendingBatch ? finalFisik - baseSizeQty : null;
        const finalStatus =
          finalFisik === null
            ? ''
            : isRowPendingBatch
              ? 'BELUM LENGKAP'
              : finalSelisih === 0
                ? 'MATCH'
                : (finalSelisih || 0) < 0
                  ? 'KURANG'
                  : 'LEBIH';

        const finalRound = sz.recountRound ?? auditRec?.round ?? (finalFisik !== null ? 1 : undefined);
        const finalNotes = sz.recountNotes || matchedVar?.note || matchedVar?.catatan || auditRec?.catatan || '';
        const finalAuditor = sz.recountAuditor || auditRec?.auditor || '';
        const finalUpdatedAt = sz.recountUpdatedAt || auditRec?.updated_at || auditRec?.tanggal_audit || '';
        const baseLog =
          finalFisik !== null
            ? (sz.recountLog ||
                formatRecountLogEntry({
                  round: finalRound,
                  updatedAt: finalUpdatedAt,
                  arrivalDates: rowAuditedDates,
                  auditor: finalAuditor,
                  notes: finalNotes,
                }))
            : (sz.recountLog || '');
        const pendingSuffix =
          isRowPendingBatch && rowPendingQty > 0
            ? ` — ⚠ +${rowPendingQty} pcs${rowPendingDates.length > 0 ? ` (${formatDatesSummary(rowPendingDates)})` : ''} belum diaudit`
            : '';
        const finalLog =
          baseLog && pendingSuffix && !baseLog.includes('belum diaudit')
            ? `${baseLog}${pendingSuffix}`
            : baseLog;

        if (finalFisik !== null) {
          blockHasRecount = true;
          countedSizeRows++;
          blockRecountFisik = (blockRecountFisik || 0) + finalFisik;
          if (finalSelisih !== null) {
            blockRecountSelisih = (blockRecountSelisih || 0) + finalSelisih;
            if (finalSelisih !== 0) blockHasDiff = true;
          }
        }

        return {
          ...sz,
          recountFisik: finalFisik,
          recountQty: finalFisik,
          recountSelisih: finalSelisih,
          recountStatus: finalStatus,
          recountRound: finalRound,
          recountNotes: finalNotes || undefined,
          recountAuditor: finalAuditor || undefined,
          recountUpdatedAt: finalUpdatedAt || undefined,
          recountLog: finalLog || undefined,
          recountPendingBatch: isRowPendingBatch,
          recountPendingQty: rowPendingQty,
          recountPendingDates: rowPendingDates,
          recountAuditedDates: rowAuditedDates,
        };
      });

      return {
        ...cg,
        sizes: updatedSizes,
      };
    });

    // Jika sebagian baris terisi audit dan sebagian masih kosong (varian baru dari batch susulan), tambahkan qty-nya
    if (blockHasRecount && countedSizeRows < totalSizeRows) {
      updatedColorGroups.forEach((cg: any) => {
        (cg.sizes || []).forEach((sz: any) => {
          if (sz.recountFisik === null || sz.recountFisik === undefined) {
            pendingFollowUpQty += Number(sz.totalSizeQty) || 0;
            Object.keys(sz.qtyByDate || {}).forEach((slot) => {
              const iso = extractIsoDateFromSlot(slot);
              if (iso && !blockAuditedDateSet.has(iso)) blockPendingDateSet.add(iso);
            });
          }
        });
      });
    }

    const auditRecTotalAsli =
      auditRec && auditRec.total_asli !== undefined && auditRec.total_asli !== null
        ? Number(auditRec.total_asli)
        : null;
    const blockHasPendingFollowUpBatch =
      blockHasRecount &&
      (anyRowPendingBatch ||
        countedSizeRows < totalSizeRows ||
        (auditRecTotalAsli !== null && auditRecTotalAsli > 0 && auditRecTotalAsli < b.totalNet));

    if (blockHasPendingFollowUpBatch && pendingFollowUpQty === 0 && auditRecTotalAsli !== null && auditRecTotalAsli < b.totalNet) {
      pendingFollowUpQty = Math.max(0, b.totalNet - auditRecTotalAsli);
    }

    const hasNota = b.qtyNota !== undefined && b.qtyNota !== null && !isNaN(Number(b.qtyNota));
    // Anti False-Alarm: jangan bandingkan angka audit parsial dengan Qty Nota!
    // Gunakan totalRecountFisik hanya jika seluruh batch & varian sudah selesai diaudit.
    const isCompleteAudit = blockHasRecount && blockRecountFisik !== null && !blockHasPendingFollowUpBatch;
    const effectiveTotal = isCompleteAudit ? blockRecountFisik! : b.totalNet;
    const updatedSelisihNota = hasNota
      ? effectiveTotal - Number(b.qtyNota)
      : (isCompleteAudit ? blockRecountFisik! - b.totalNet : b.selisihNota ?? null);

    return {
      ...b,
      colorGroups: updatedColorGroups,
      hasRecount: blockHasRecount || b.hasRecount,
      totalRecountFisik: blockHasRecount ? blockRecountFisik : b.totalRecountFisik ?? null,
      totalRecountSelisih: isCompleteAudit ? blockRecountSelisih : null,
      hasDiff: isCompleteAudit ? blockHasDiff : false,
      hasPendingFollowUpBatch: blockHasPendingFollowUpBatch,
      pendingFollowUpQty: blockHasPendingFollowUpBatch ? pendingFollowUpQty : 0,
      pendingFollowUpDates: Array.from(blockPendingDateSet).sort(),
      auditedDates: Array.from(blockAuditedDateSet).sort(),
      selisihNota: updatedSelisihNota,
    };
  });
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

    const lookup = lookupProductBySku(code, undefined, firstItem.nama_produk);

    const resolvedProductName =
      firstItem.nama_produk ||
      (lookup.found ? lookup.nama_produk : '') ||
      (/^[A-Za-z\s]+$/.test(code) && code.length > 3 ? code.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '') ||
      '';

    const resolvedUpVendor =
      (firstItem.keterangan && firstItem.keterangan !== 'KARGO' && firstItem.keterangan !== 'CMT' ? firstItem.keterangan : '') ||
      (activeTab === 'CMT' ? 'CMT' : 'KARGO');

    const resolvedPhotoUrl = firstItem.foto_url || '';

    resultBlocks.push({
      id: code,
      rowNumber: rowNum++,
      code,
      productName: resolvedProductName,
      upVendor: resolvedUpVendor,
      kategori: activeTab === 'Kargo' ? 'Kargo' : 'Lokal CMT',
      photoUrl: formatImageUrlForSheets(resolvedPhotoUrl),
      catatan: firstItem.keterangan || resolvedUpVendor || '',
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

  return sortMatrixBlocksNewestFirst(enrichBlocksWithRecountAudit(resultBlocks, getRecountAuditMap()));
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
      const cleanD = extractIsoDateFromSlot(it.tanggal_penerimaan);
      if (cleanD) dateSet.add(cleanD);
    });
    if (blocks) {
      blocks.forEach((b) => {
        b.dateSlots.forEach((d) => {
          const cleanD = extractIsoDateFromSlot(d);
          if (cleanD) dateSet.add(cleanD);
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
  const latestAuditMap = getRecountAuditMap();

  for (const dStr of datesToPush) {
    const tabName = formatDateTabName(dStr, activeTab);
    const dateItems = sourceItems.filter((it) => extractIsoDateFromSlot(it.tanggal_penerimaan) === dStr);

    // Format blocks untuk tanggal ini (jika ada blocks)
    let dateBlocks: any[] | undefined = undefined;
    if (blocks && blocks.length > 0) {
      dateBlocks = blocks
        .filter((b) => b.dateSlots.some((s) => extractIsoDateFromSlot(s) === dStr))
        .map((b) => {
          const matchingSlots = b.dateSlots.filter((s) => extractIsoDateFromSlot(s) === dStr);
          const colorGroups = b.colorGroups.map((cg) => ({
            ...cg,
            sizes: cg.sizes.map((sz) => {
              const filteredQtyByDate: Record<string, number> = {};
              let sumForDate = 0;
              Object.entries(sz.qtyByDate || {}).forEach(([k, val]) => {
                if (extractIsoDateFromSlot(k) === dStr) {
                  const n = Number(val) || 0;
                  if (n > 0) {
                    filteredQtyByDate[k] = (filteredQtyByDate[k] || 0) + n;
                    sumForDate += n;
                  }
                }
              });
              return {
                ...sz,
                qtyByDate: filteredQtyByDate,
                totalSizeQty: sumForDate,
              };
            }),
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
            dateSlots: matchingSlots.length > 0 ? matchingSlots : [dStr],
            colorGroups,
            totalDatang: dateDatang,
            totalNet: dateDatang,
            qtyNota: dateSpecificNota,
            selisihNota: dateSpecificNota !== null && dateSpecificNota !== undefined ? dateDatang - Number(dateSpecificNota) : null,
          };
        })
        .filter((b) => b.totalDatang > 0);
      if (dateBlocks.length > 0) {
        dateBlocks = sortMatrixBlocksNewestFirst(enrichBlocksWithRecountAudit(dateBlocks, latestAuditMap));
      }
    }

    // Jika belum ada blocks, bangun otomatis dari items kedatangan
    if (!dateBlocks || dateBlocks.length === 0) {
      dateBlocks = buildBlocksFromRawItems(dateItems, [dStr], activeTab);
    }

    const formattedDateItems = dateItems.map((it) => {
      const codeKey = (it.kode_produksi || '').trim().toUpperCase();
      const bMatch = dateBlocks?.find(b => (b.code || '').trim().toUpperCase() === codeKey);
      const lookup = lookupProductBySku(codeKey, undefined, it.nama_produk);
      const finalName = it.nama_produk || bMatch?.productName || (lookup.found ? lookup.nama_produk : '');
      const finalUp = (it.keterangan && it.keterangan !== 'KARGO' && it.keterangan !== 'CMT')
        ? it.keterangan
        : (bMatch?.upVendor || it.keterangan || (activeTab === 'CMT' ? 'CMT' : 'KARGO'));

      return {
        tanggal_penerimaan: it.tanggal_penerimaan || dStr,
        kategori: it.kategori || (activeTab === 'CMT' ? 'Lokal CMT' : 'Kargo'),
        no_surat_jalan: it.no_surat_jalan || '',
        kode_produksi: it.kode_produksi || '',
        nama_produk: finalName,
        warna: it.warna || '',
        size: it.size || '',
        qty: Number(it.qty) || 0,
        foto_url: formatImageUrlForSheets(it.foto_url),
        up_vendor: finalUp,
        keterangan: finalUp,
        catatan: finalUp,
        operator: it.operator || 'Operator Gudang',
        created_at: it.created_at || new Date().toISOString(),
      };
    });

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

      const effectiveBlocks = (ds.blocks && ds.blocks.length > 0
        ? ds.blocks
        : buildBlocksFromRawItems(ds.items, [ds.tanggal], activeTab)
      ).map((b) => {
        const lookup = lookupProductBySku(b.code, undefined, b.productName);
        return {
          ...b,
          productName: b.productName || (lookup.found ? lookup.nama_produk : '') || '',
          upVendor: (b.upVendor && b.upVendor !== 'KARGO' && b.upVendor !== 'CMT')
            ? b.upVendor
            : (b.upVendor || (activeTab === 'CMT' ? 'CMT' : 'KARGO')),
        };
      });

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
  (items || []).forEach((it) => {
    const code = normAuditKeyPart(it.kode_produksi, 'TANPA_KODE') || 'TANPA_KODE';
    if (!codeMap.has(code)) codeMap.set(code, []);
    codeMap.get(code)!.push(it);
  });

  const cachedNotaMap = getCachedProduksiQtyNotaMapSync();
  const standardSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'ALL SIZE', 'FREE SIZE'];
  const blocks: MatrixProductBlock[] = [];
  let no = 1;

  for (const [code, codeItems] of codeMap.entries()) {
    const first = codeItems[0];
    const lookup = lookupProductBySku(code, undefined, first?.nama_produk);

    const productName =
      first?.nama_produk ||
      (lookup.found ? lookup.nama_produk : '') ||
      (/^[A-Za-z\s]+$/.test(code) && code.length > 3 ? code.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '') ||
      '';

    const upVendor =
      (first?.keterangan && first.keterangan !== 'KARGO' && first.keterangan !== 'CMT' ? first.keterangan : '') ||
      (isCMT ? 'BIS' : 'KARGO');

    const photoUrl = codeItems.find((i) => i.foto_url && i.foto_url.trim().length > 0)?.foto_url || '';

    const distinctDatangDates = Array.from(
      new Set(
        codeItems
          .filter((it) => {
            const isReturOnly =
              (it.no_surat_jalan && it.no_surat_jalan.toUpperCase().startsWith('RETUR-')) ||
              (it.keterangan && it.keterangan.includes('RETUR_CMT:')) ||
              (Number(it.qty_retur) > 0 && (!it.qty || Number(it.qty) === 0));
            return !isReturOnly && it.tanggal_penerimaan;
          })
          .map((i) => extractIsoDateFromSlot(i.tanggal_penerimaan))
          .filter(Boolean)
      )
    ).sort().reverse();

    const sjMap = new Map<string, { no_surat_jalan: string; qty: number; tanggal: string }>();
    const dateToSjMap: Record<string, string[]> = {};
    codeItems.forEach((it) => {
      const sj = (it.no_surat_jalan || '').trim().toUpperCase();
      const isReturOnly = sj.startsWith('RETUR-') || (it.keterangan && it.keterangan.includes('RETUR_CMT:'));
      if (sj && !isReturOnly) {
        const dIso = extractIsoDateFromSlot(it.tanggal_penerimaan);
        if (!sjMap.has(sj)) {
          sjMap.set(sj, { no_surat_jalan: sj, qty: 0, tanggal: dIso });
        }
        sjMap.get(sj)!.qty += Number(it.qty) || 0;
        if (dIso) {
          if (!dateToSjMap[dIso]) dateToSjMap[dIso] = [];
          if (!dateToSjMap[dIso].includes(sj)) dateToSjMap[dIso].push(sj);
        }
      }
    });
    const distinctSjs = Array.from(sjMap.values()).sort((a, b) => b.qty - a.qty);

    const distinctDatangSlots: string[] = [];
    distinctDatangDates.forEach((d) => {
      const sjsForDate = dateToSjMap[d] || [];
      if (sjsForDate.length >= 1) {
        sjsForDate.forEach((sj) => distinctDatangSlots.push(`${d}||${sj}`));
      } else {
        distinctDatangSlots.push(d);
      }
    });

    const dateSlots: string[] = Array.from(
      { length: Math.max(10, distinctDatangSlots.length) },
      (_, i) => distinctDatangSlots[i] || ''
    );

    const distinctReturDates = Array.from(
      new Set(
        codeItems
          .map((i) => {
            if (i.tanggal_retur) return extractIsoDateFromSlot(i.tanggal_retur);
            if (i.keterangan && i.keterangan.includes('RETUR_CMT:')) {
              const match = i.keterangan.match(/RETUR_CMT:\d+(?:@([\d-]+))?/);
              if (match && match[1]) return match[1];
            }
            if (i.no_surat_jalan && i.no_surat_jalan.toUpperCase().startsWith('RETUR-') && i.tanggal_penerimaan) {
              return extractIsoDateFromSlot(i.tanggal_penerimaan);
            }
            return null;
          })
          .filter(Boolean) as string[]
      )
    ).sort().reverse();
    const returDateSlots: string[] = Array.from({ length: 5 }, (_, i) => distinctReturDates[i] || '');

    const colorMap = new Map<string, PenerimaanProduksiItem[]>();
    codeItems.forEach((it) => {
      const col = normAuditKeyPart(it.warna, 'DEFAULT') || 'DEFAULT';
      if (!colorMap.has(col)) colorMap.set(col, []);
      colorMap.get(col)!.push(it);
    });

    const colorGroups: any[] = [];
    let blockTotalDatang = 0;
    let blockTotalRetur = 0;

    for (const [colName, colItems] of colorMap.entries()) {
      const sizeMap = new Map<string, PenerimaanProduksiItem[]>();
      colItems.forEach((it) => {
        const sz = normAuditKeyPart(it.size, 'Default') || 'DEFAULT';
        if (!sizeMap.has(sz)) sizeMap.set(sz, []);
        sizeMap.get(sz)!.push(it);
      });

      const presentSizes = Array.from(sizeMap.keys());
      const isFreeOrAllSizeOnly =
        presentSizes.length === 1 &&
        (presentSizes[0] === 'ALL SIZE' || presentSizes[0] === 'FREE SIZE' || presentSizes[0] === 'DEFAULT');

      const sizesToInclude = isFreeOrAllSizeOnly
        ? presentSizes
        : Array.from(new Set([...presentSizes, 'S', 'M', 'L', 'XL']));

      sizesToInclude.sort((a, b) => {
        const idxA = standardSizes.indexOf(a);
        const idxB = standardSizes.indexOf(b);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.localeCompare(b);
      });

      const sizes: any[] = [];
      let cgTotal = 0;
      let cgRetur = 0;

      for (const szName of sizesToInclude) {
        const szItems = sizeMap.get(szName) || [];
        const qtyByDate: Record<string, number> = {};
        const qtyReturByDate: Record<string, number> = {};
        let szTotal = 0;
        let szRetur = 0;

        szItems.forEach((it) => {
          const isReturItem =
            (it.no_surat_jalan && it.no_surat_jalan.toUpperCase().startsWith('RETUR-')) ||
            (it.keterangan && it.keterangan.includes('RETUR_CMT:'));
          const d = extractIsoDateFromSlot(it.tanggal_penerimaan);
          const sj = (it.no_surat_jalan || '').trim().toUpperCase();
          const q = Number(it.qty) || 0;
          if (!isReturItem && d && q > 0) {
            const slotKeyWithSj = sj ? `${d}||${sj}` : d;
            qtyByDate[slotKeyWithSj] = (qtyByDate[slotKeyWithSj] || 0) + q;
            szTotal += q;
          }

          let rDate = it.tanggal_retur;
          let rQty = Number(it.qty_retur) || 0;
          if (!rQty && it.keterangan && it.keterangan.includes('RETUR_CMT:')) {
            const match = it.keterangan.match(/RETUR_CMT:(\d+)(?:@([\d-]+))?/);
            if (match) {
              rQty = parseInt(match[1], 10) || 0;
              rDate = match[2] || it.tanggal_penerimaan;
            }
          } else if (!rQty && it.no_surat_jalan && it.no_surat_jalan.toUpperCase().startsWith('RETUR-')) {
            rQty = Number(it.qty) || 0;
            rDate = it.tanggal_retur || it.tanggal_penerimaan;
          }
          if (rDate && rQty > 0) {
            const rIso = extractIsoDateFromSlot(rDate);
            qtyReturByDate[rIso] = (qtyReturByDate[rIso] || 0) + rQty;
            szRetur += rQty;
          }
        });

        cgTotal += szTotal;
        cgRetur += szRetur;

        const incomingSzItems = szItems.filter((it) => {
          const isReturItem =
            (it.no_surat_jalan && it.no_surat_jalan.toUpperCase().startsWith('RETUR-')) ||
            (it.keterangan && it.keterangan.includes('RETUR_CMT:'));
          return !isReturItem && (Number(it.qty) || 0) > 0;
        });
        const auditedSzItems = incomingSzItems.filter(
          (it) => it.recount_qty !== undefined && it.recount_qty !== null
        );
        const unauditedSzItems = incomingSzItems.filter(
          (it) => it.recount_qty === undefined || it.recount_qty === null
        );
        const recountSource =
          auditedSzItems.length > 0
            ? auditedSzItems.reduce((latest, cur) =>
                (Number(cur.recount_round) || 0) >= (Number(latest.recount_round) || 0) ? cur : latest
              )
            : szItems.find((it) => it.recount_qty !== undefined && it.recount_qty !== null);
        const rFisik = recountSource ? Number(recountSource.recount_qty) : null;
        const pendingBatchQty = unauditedSzItems.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
        const isPendingBatch = auditedSzItems.length > 0 && unauditedSzItems.length > 0 && pendingBatchQty > 0;
        const auditedDates = Array.from(
          new Set(auditedSzItems.map((it) => extractIsoDateFromSlot(it.tanggal_penerimaan || '')).filter(Boolean))
        );
        const pendingDates = Array.from(
          new Set(unauditedSzItems.map((it) => extractIsoDateFromSlot(it.tanggal_penerimaan || '')).filter(Boolean))
        );

        sizes.push({
          id: szItems[0]?.id,
          size: szName,
          qtyByDate,
          qtyReturByDate,
          totalSizeQty: szTotal,
          totalSizeRetur: szRetur,
          recountFisik: rFisik,
          recountQty: rFisik,
          recountSelisih: rFisik !== null && !isPendingBatch ? rFisik - szTotal : null,
          recountRound: recountSource?.recount_round,
          recountNotes: recountSource?.recount_notes,
          recountAuditor: recountSource?.recount_auditor,
          recountUpdatedAt: recountSource?.recount_updated_at,
          recountPendingBatch: isPendingBatch,
          recountPendingQty: pendingBatchQty,
          recountPendingDates: pendingDates,
          recountAuditedDates: auditedDates,
        });
      }

      colorGroups.push({
        color: colName,
        sizes,
        totalColorQty: cgTotal,
        totalColorRetur: cgRetur,
      });

      blockTotalDatang += cgTotal;
      blockTotalRetur += cgRetur;
    }

    const totalNet = Math.max(0, blockTotalDatang - (isCMT ? blockTotalRetur : 0));
    const notaRec = cachedNotaMap[code];
    const resolvedQtyNota = notaRec?.qty_nota !== undefined && notaRec?.qty_nota !== null ? Number(notaRec.qty_nota) : null;

    blocks.push({
      id: code,
      rowNumber: no++,
      code,
      productName,
      upVendor,
      kategori: isCMT ? 'Lokal CMT' : 'Kargo',
      photoUrl,
      catatan: '',
      distinctSjs,
      dateToSjMap,
      dateSlots,
      returDateSlots,
      colorGroups,
      totalDatang: blockTotalDatang,
      totalRetur: blockTotalRetur,
      totalNet,
      qtyNota: resolvedQtyNota,
      selisihNota: resolvedQtyNota !== null ? totalNet - resolvedQtyNota : null,
      kg: 0,
      ongkirPerKg: 0,
      totalOngkir: 0,
      ongkirPerPcs: 0,
    });
  }

  return sortMatrixBlocksNewestFirst(enrichBlocksWithRecountAudit(blocks, getRecountAuditMap()));
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
  const rawBlocks = (blocks && blocks.length > 0)
    ? blocks
    : buildMatrixBlocksFromItems(items, activeTab === 'CMT');

  // Selalu tarik snapshot Audit Hitung Ulang terbaru dari Cloud lalu perkaya & urutkan Terbaru -> Terlama
  const latestCloudAuditMap = await fetchRecountAuditMapFromCloud().catch(() => getRecountAuditMap());
  const effectiveBlocks = sortMatrixBlocksNewestFirst(
    enrichBlocksWithRecountAudit(rawBlocks, latestCloudAuditMap)
  );

  // Format blocks jika ada dengan auto-lookup nama produk dan UP Trello jika kosong
  const cachedNotaMapMaster = getCachedProduksiQtyNotaMapSync();
  const formattedBlocks = effectiveBlocks.map((b) => {
    const normCode = (b.code || '').trim().toUpperCase();
    const resolvedQtyNota = b.qtyNota !== undefined && b.qtyNota !== null ? b.qtyNota : (cachedNotaMapMaster[normCode]?.qty_nota ?? null);
    const effectiveFisik = (b.hasRecount && !b.hasPendingFollowUpBatch && b.totalRecountFisik !== null && b.totalRecountFisik !== undefined)
      ? b.totalRecountFisik
      : b.totalNet;

    const lookup = lookupProductBySku(b.code, undefined, b.productName);
    const resolvedProductName = b.productName || (lookup.found ? lookup.nama_produk : '') || '';
    const resolvedUpVendor = (b.upVendor && b.upVendor !== 'KARGO' && b.upVendor !== 'CMT')
      ? b.upVendor
      : (b.upVendor || (activeTab === 'CMT' ? 'CMT' : 'KARGO'));

    return {
      ...b,
      productName: resolvedProductName,
      upVendor: resolvedUpVendor,
      photoUrl: formatImageUrlForSheets(b.photoUrl),
      qtyNota: resolvedQtyNota,
      selisihNota: resolvedQtyNota !== null && resolvedQtyNota !== undefined ? effectiveFisik - Number(resolvedQtyNota) : null,
    };
  });

  // Map untuk lookup cepat ke formattedItems
  const blockMap = new Map<string, { productName: string; upVendor: string }>();
  formattedBlocks.forEach((fb) => {
    const norm = (fb.code || '').trim().toUpperCase();
    if (norm) blockMap.set(norm, { productName: fb.productName, upVendor: fb.upVendor });
  });

  // Format flat items dengan enriquishment metadata nama_produk dan up_vendor
  const formattedItems = items && Array.isArray(items) ? items.map((it) => {
    const codeKey = (it.kode_produksi || '').trim().toUpperCase();
    const bInfo = blockMap.get(codeKey);
    const lookup = lookupProductBySku(codeKey, undefined, it.nama_produk);
    const finalName = it.nama_produk || bInfo?.productName || (lookup.found ? lookup.nama_produk : '') || (/^[A-Za-z\s]+$/.test(codeKey) && codeKey.length > 3 ? codeKey.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : '');
    const finalUp = (it.keterangan && it.keterangan !== 'KARGO' && it.keterangan !== 'CMT')
      ? it.keterangan
      : (bInfo?.upVendor || it.keterangan || (activeTab === 'CMT' ? 'CMT' : 'KARGO'));

    return {
      tanggal_penerimaan: it.tanggal_penerimaan || '',
      kategori: it.kategori || (activeTab === 'CMT' ? 'Lokal CMT' : 'Kargo'),
      no_surat_jalan: it.no_surat_jalan || '',
      kode_produksi: it.kode_produksi || '',
      nama_produk: finalName,
      up_vendor: finalUp,
      warna: it.warna || '',
      size: it.size || '',
      qty: Number(it.qty) || 0,
      foto_url: formatImageUrlForSheets(it.foto_url),
      keterangan: finalUp,
      operator: it.operator || 'Operator',
      created_at: it.created_at || new Date().toISOString(),
    };
  }) : [];

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
          : ((sRec as any)?.total_fisik_recount !== undefined && (sRec as any)?.total_fisik_recount !== null ? Number((sRec as any).total_fisik_recount) : null);
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



