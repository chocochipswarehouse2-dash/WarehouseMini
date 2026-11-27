import * as XLSX from 'xlsx';
import {
  JneDetectedRecord,
  JneSheetTab,
  DEFAULT_AGEN_NAME,
  DEFAULT_AGEN_CORPORATE,
  DEFAULT_JNE_SERVICE,
  DEFAULT_SHIPPER_NAME,
  cleanResi,
  formatDisplayDateJne,
  normalizeDate,
  normalizeNominal,
} from './jneRekapParser';

export const JNE_SPREADSHEET_ID = '1AvDc-u_mcxn3WwW6CV4WYfq05sWl4opdLJ2oC7SUP1k';
export const JNE_SHEET_NAME = 'JNEmember';
export const JNE_SHEET_GID = '1026608111';
export const JNE_GSHEET_URL = `https://docs.google.com/spreadsheets/d/${JNE_SPREADSHEET_ID}/edit?gid=${JNE_SHEET_GID}#gid=${JNE_SHEET_GID}`;

export const JNE_CORP_SHEET_NAME = 'JNECorporate';
export const JNE_CORP_SHEET_GID = '843586287';
export const JNE_CORP_GSHEET_URL = `https://docs.google.com/spreadsheets/d/${JNE_SPREADSHEET_ID}/edit?gid=${JNE_CORP_SHEET_GID}#gid=${JNE_CORP_SHEET_GID}`;

export const JNE_GAS_SCRIPT_ID = '1Z1cIj3vnYR_CxK_SLuFqeOvlxnT5dUf7brhgW2X1Njj-Qr0qC7F9QmgZ';
export const JNE_GAS_DEPLOYMENT_ID = 'AKfycbytMxVVOUCbEIXK9gPT96oCc3nnr6qRN39axHG45xYuxwle47A6u2FerqfabXKLUt2nCA';
export const DEFAULT_JNE_GAS_URL = `https://script.google.com/macros/s/${JNE_GAS_DEPLOYMENT_ID}/exec`;

export interface JneTabConfig {
  tab: JneSheetTab;
  label: string;
  sheetName: string;
  gid: string;
  gsheetUrl: string;
  cacheKey: string;
  defaultAgen: string;
  exportPrefix: string;
}

export const JNE_TAB_CONFIGS: Record<JneSheetTab, JneTabConfig> = {
  member: {
    tab: 'member',
    label: 'JNEmember',
    sheetName: JNE_SHEET_NAME,
    gid: JNE_SHEET_GID,
    gsheetUrl: JNE_GSHEET_URL,
    cacheKey: 'chocochips_jne_member_records_v2',
    defaultAgen: DEFAULT_AGEN_NAME,
    exportPrefix: 'JNEMember_Rekap',
  },
  corporate: {
    tab: 'corporate',
    label: 'JNECorporated',
    sheetName: JNE_CORP_SHEET_NAME,
    gid: JNE_CORP_SHEET_GID,
    gsheetUrl: JNE_CORP_GSHEET_URL,
    cacheKey: 'chocochips_jne_corporate_records_v1',
    defaultAgen: DEFAULT_AGEN_CORPORATE,
    exportPrefix: 'JNECorporated_Rekap',
  },
};

const STORAGE_KEY_JNE_GAS_URL = 'chocochips_jne_gas_url_v1';

export function getJneTabConfig(sheetTab: JneSheetTab = 'member'): JneTabConfig {
  return JNE_TAB_CONFIGS[sheetTab] || JNE_TAB_CONFIGS.member;
}

export function getStoredJneGasUrl(): string {
  try {
    const val = localStorage.getItem(STORAGE_KEY_JNE_GAS_URL);
    if (val && val.includes('script.google.com/macros/s/')) {
      return val;
    }
  } catch {}
  return DEFAULT_JNE_GAS_URL;
}

export function saveStoredJneGasUrl(url: string): void {
  try {
    if (url && url.includes('script.google.com/macros/s/')) {
      localStorage.setItem(STORAGE_KEY_JNE_GAS_URL, url.trim());
    } else {
      localStorage.setItem(STORAGE_KEY_JNE_GAS_URL, DEFAULT_JNE_GAS_URL);
    }
  } catch {}
}

export function getLocalCachedJneRecords(sheetTab: JneSheetTab = 'member'): JneDetectedRecord[] {
  const cfg = getJneTabConfig(sheetTab);
  try {
    const raw = localStorage.getItem(cfg.cacheKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalCachedJneRecords(
  records: JneDetectedRecord[],
  sheetTab: JneSheetTab = 'member'
): void {
  const cfg = getJneTabConfig(sheetTab);
  try {
    localStorage.setItem(cfg.cacheKey, JSON.stringify(records));
  } catch {}
}

function mapRawToJneRecord(r: any, idx: number, sheetTab: JneSheetTab = 'member'): JneDetectedRecord {
  const cfg = getJneTabConfig(sheetTab);
  const resi = cleanResi(r.no_resi || r.cnote_no || '');
  return {
    id: `JNE-${sheetTab}-${resi || idx}-${r.row_number || idx}`,
    row_number: typeof r.row_number === 'number' ? r.row_number : undefined,
    no: r.no !== undefined ? r.no : '',
    no_resi: resi,
    deskripsi: String(r.deskripsi ?? '').trim(),
    layanan: String(r.layanan || DEFAULT_JNE_SERVICE).trim(),
    nama_tujuan: String(r.nama_tujuan || '').trim() || '-',
    alamat_penerima: r.alamat_penerima ? String(r.alamat_penerima).trim() : undefined,
    alamat_tujuan: String(r.alamat_tujuan || '').trim() || '-',
    nama_pengirim:
      sheetTab === 'corporate'
        ? String(r.nama_pengirim || '').trim()
        : String(r.nama_pengirim || DEFAULT_SHIPPER_NAME).trim() || DEFAULT_SHIPPER_NAME,
    nominal: normalizeNominal(r.nominal),
    asuransi: r.asuransi !== undefined ? normalizeNominal(r.asuransi) : undefined,
    status_pembayaran: r.status_pembayaran ? String(r.status_pembayaran).trim() : undefined,
    tanggal: normalizeDate(r.tanggal),
    agen: String(r.agen || cfg.defaultAgen).trim() || cfg.defaultAgen,
    source_file: r.source_file ? String(r.source_file).trim() : undefined,
  };
}

/**
 * Fallback baca langsung dari Google Visualization JSON endpoint sheet aktif
 * apabila endpoint GAS sedang lambat / gagal jaringan sementara.
 */
async function fetchDirectFromGsheetGviz(sheetTab: JneSheetTab = 'member'): Promise<JneDetectedRecord[]> {
  const cfg = getJneTabConfig(sheetTab);
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${JNE_SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${cfg.gid}&t=${Date.now()}`;
  const res = await fetch(gvizUrl);
  if (!res.ok) throw new Error(`Google Sheets HTTP ${res.status}`);
  const text = await res.text();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Respons Google Sheets tidak valid.');

  const json = JSON.parse(text.slice(start, end + 1));
  const rows: any[] = json?.table?.rows || [];
  const out: JneDetectedRecord[] = [];

  rows.forEach((rowObj, idx) => {
    const c = rowObj?.c || [];
    const cellStr = (colIdx: number) => {
      const cell = c[colIdx];
      if (!cell) return '';
      return String(cell.f !== undefined && cell.f !== null ? cell.f : (cell.v ?? '')).trim();
    };

    if (sheetTab === 'corporate') {
      const resi = cleanResi(cellStr(1));
      if (!resi || resi === 'NORESI' || resi === 'CNOTENO') return;

      const rawOngkir = c[8]?.v;
      const dispOngkir = cellStr(8);
      const rawAsuransi = c[9]?.v;
      const dispAsuransi = cellStr(9);

      out.push({
        id: `JNE-corporate-${resi}-${idx + 2}`,
        row_number: idx + 2,
        no: '',
        no_resi: resi,
        deskripsi: cellStr(2),
        tanggal: normalizeDate(cellStr(3)),
        nama_tujuan: cellStr(4) || '-',
        alamat_penerima: cellStr(5),
        alamat_tujuan: cellStr(6) || '-',
        layanan: cellStr(7) || DEFAULT_JNE_SERVICE,
        nama_pengirim: '',
        nominal: typeof rawOngkir === 'number' ? Math.round(rawOngkir) : normalizeNominal(dispOngkir),
        asuransi: typeof rawAsuransi === 'number' ? Math.round(rawAsuransi) : normalizeNominal(dispAsuransi),
        status_pembayaran: cellStr(10) || 'Belum Ada Tagihan',
        agen: cellStr(11) || DEFAULT_AGEN_CORPORATE,
      });
    } else {
      const cnote = cleanResi(cellStr(2));
      if (!cnote || cnote === 'CNOTENO' || cnote === 'NORESI') return;

      const rawAmount = c[8]?.v;
      const dispAmount = cellStr(8);

      out.push({
        id: `JNE-member-${cnote}-${idx + 2}`,
        row_number: idx + 2,
        no: cellStr(1),
        no_resi: cnote,
        deskripsi: cellStr(3),
        layanan: cellStr(4) || DEFAULT_JNE_SERVICE,
        nama_tujuan: cellStr(5) || '-',
        alamat_tujuan: cellStr(6) || '-',
        nama_pengirim: cellStr(7) || DEFAULT_SHIPPER_NAME,
        nominal: typeof rawAmount === 'number' ? Math.round(rawAmount) : normalizeNominal(dispAmount),
        tanggal: normalizeDate(cellStr(9)),
        agen: cellStr(10) || DEFAULT_AGEN_NAME,
      });
    }
  });

  return out;
}

/**
 * 1. Tarik seluruh data live dari Sheet "JNEmember" atau "JNECorporate"
 */
export async function fetchJneRecordsFromGas(
  sheetTab: JneSheetTab = 'member',
  gasUrl?: string
): Promise<{
  success: boolean;
  records: JneDetectedRecord[];
  total: number;
  source?: 'gas' | 'gviz' | 'cache';
  message?: string;
  error?: string;
}> {
  const cfg = getJneTabConfig(sheetTab);
  const url = (gasUrl || getStoredJneGasUrl()).trim();

  try {
    const res = await fetch(`${url}?action=read&sheet=${sheetTab}&t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || `Gagal membaca data ${cfg.label} dari Google Sheets.`);
    }

    const fetchedRecords = (data.records || []).map((r: any, idx: number) =>
      mapRawToJneRecord(r, idx, sheetTab)
    );
    saveLocalCachedJneRecords(fetchedRecords, sheetTab);

    return {
      success: true,
      records: fetchedRecords,
      total: fetchedRecords.length,
      source: 'gas',
      message: `${fetchedRecords.length.toLocaleString('id-ID')} resi ${cfg.label} dimuat.`,
    };
  } catch (gasErr: any) {
    try {
      const gvizRecords = await fetchDirectFromGsheetGviz(sheetTab);
      if (gvizRecords.length > 0) {
        saveLocalCachedJneRecords(gvizRecords, sheetTab);
        return {
          success: true,
          records: gvizRecords,
          total: gvizRecords.length,
          source: 'gviz',
          message: `${gvizRecords.length.toLocaleString('id-ID')} resi ${cfg.label} dimuat dari Google Sheets.`,
        };
      }
    } catch {}

    console.warn(`[JNE ${sheetTab}] Gagal muat live, pakai cache lokal:`, gasErr);
    const cached = getLocalCachedJneRecords(sheetTab);
    return {
      success: false,
      records: cached,
      total: cached.length,
      source: 'cache',
      error: `Gagal terhubung ke Google Sheets (${gasErr?.message || String(gasErr)}). Menampilkan ${cached.length} data tersimpan.`,
    };
  }
}

/**
 * 2. Tambah / Import data baru ke Google Sheets ("JNEmember" atau "JNECorporate")
 */
export async function upsertJneRecordsToGas(
  records: JneDetectedRecord[],
  options: {
    sheetTab?: JneSheetTab;
    operator?: string;
    skipDuplicates?: boolean;
    overwriteExisting?: boolean;
    overwriteDeskripsi?: boolean;
    gasUrl?: string;
  } = {}
): Promise<{
  success: boolean;
  inserted?: number;
  updated?: number;
  skipped?: number;
  message?: string;
  error?: string;
}> {
  if (!records || records.length === 0) {
    return { success: false, error: 'Tidak ada data untuk disimpan ke Google Sheets.' };
  }

  const sheetTab: JneSheetTab = options.sheetTab || 'member';
  const cfg = getJneTabConfig(sheetTab);
  const url = (options.gasUrl || getStoredJneGasUrl()).trim();

  try {
    const payload = {
      action: 'upsertRecords',
      sheet: sheetTab,
      operator: options.operator || 'WMS Admin',
      skip_duplicates: options.skipDuplicates === true,
      overwrite_existing: options.overwriteExisting === true,
      overwrite_deskripsi: options.overwriteDeskripsi === true,
      records: records.map((r) => ({
        no: r.no ?? '',
        no_resi: cleanResi(r.no_resi),
        deskripsi: r.deskripsi ?? '',
        layanan: r.layanan || DEFAULT_JNE_SERVICE,
        nama_tujuan: r.nama_tujuan === '-' ? '' : r.nama_tujuan,
        alamat_penerima: r.alamat_penerima === '-' ? '' : (r.alamat_penerima ?? ''),
        alamat_tujuan: r.alamat_tujuan === '-' ? '' : r.alamat_tujuan,
        nama_pengirim:
          sheetTab === 'corporate'
            ? (r.nama_pengirim || '')
            : (r.nama_pengirim || DEFAULT_SHIPPER_NAME),
        nominal: r.nominal || 0,
        asuransi: r.asuransi || 0,
        tanggal: r.tanggal,
        agen: r.agen || cfg.defaultAgen,
      })),
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Google Sheets menolak penyimpanan.');
    }

    return {
      success: true,
      inserted: data.inserted || 0,
      updated: data.updated || 0,
      skipped: data.skipped || 0,
      message: data.message || `Data berhasil disimpan ke ${cfg.label}.`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Gagal menyimpan ke ${cfg.label}: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Alias kompatibilitas
 */
export async function saveJneRecordsToGas(
  records: JneDetectedRecord[],
  operator: string = 'WMS Admin',
  gasUrl?: string,
  sheetTab: JneSheetTab = 'member'
) {
  return upsertJneRecordsToGas(records, { operator, gasUrl, sheetTab });
}

/**
 * 3. Update Deskripsi Pengiriman satu baris langsung ke Google Sheets
 */
export async function updateDeskripsiToGas(
  noResi: string,
  deskripsi: string,
  operator: string = 'WMS Admin',
  sheetTab: JneSheetTab = 'member',
  gasUrl?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const cfg = getJneTabConfig(sheetTab);
  const url = (gasUrl || getStoredJneGasUrl()).trim();
  const cleanR = cleanResi(noResi);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateDeskripsi',
        sheet: sheetTab,
        no_resi: cleanR,
        deskripsi,
        operator,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal menyimpan deskripsi ke Google Sheets.');

    const current = getLocalCachedJneRecords(sheetTab);
    saveLocalCachedJneRecords(
      current.map((item) =>
        cleanResi(item.no_resi) === cleanR ? { ...item, deskripsi } : item
      ),
      sheetTab
    );

    return { success: true, message: data.message };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || `Gagal menyimpan deskripsi ke ${cfg.label}.`,
    };
  }
}

/**
 * 4. Update Deskripsi Pengiriman secara massal ke Google Sheets
 */
export async function bulkUpdateDeskripsiToGas(
  updates: Array<{ no_resi: string; deskripsi: string }>,
  operator: string = 'WMS Admin',
  sheetTab: JneSheetTab = 'member',
  gasUrl?: string
): Promise<{ success: boolean; updatedCount?: number; message?: string; error?: string }> {
  if (!updates.length) return { success: false, error: 'Tidak ada baris dipilih.' };
  const url = (gasUrl || getStoredJneGasUrl()).trim();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'bulkUpdateDeskripsi',
        sheet: sheetTab,
        operator,
        updates: updates.map((u) => ({
          no_resi: cleanResi(u.no_resi),
          deskripsi: u.deskripsi,
        })),
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal menyimpan deskripsi massal.');

    const updateMap = new Map(updates.map((u) => [cleanResi(u.no_resi), u.deskripsi]));
    const current = getLocalCachedJneRecords(sheetTab);
    saveLocalCachedJneRecords(
      current.map((item) => {
        const k = cleanResi(item.no_resi);
        return updateMap.has(k) ? { ...item, deskripsi: updateMap.get(k)! } : item;
      }),
      sheetTab
    );

    return {
      success: true,
      updatedCount: data.updated_count || updates.length,
      message: data.message,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Gagal menyimpan deskripsi massal ke Google Sheets.',
    };
  }
}

/**
 * 5. Edit seluruh kolom pada 1 baris di Google Sheets (Khusus Admin & Warehouse)
 */
export async function updateSingleJneRecordToGas(
  originalNoResi: string,
  record: Partial<JneDetectedRecord> & { no_resi: string },
  operator: string = 'WMS Admin',
  sheetTab: JneSheetTab = 'member',
  gasUrl?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const cfg = getJneTabConfig(sheetTab);
  const url = (gasUrl || getStoredJneGasUrl()).trim();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateRecord',
        sheet: sheetTab,
        original_no_resi: cleanResi(originalNoResi),
        operator,
        record: {
          no: record.no ?? '',
          no_resi: cleanResi(record.no_resi),
          deskripsi: record.deskripsi ?? '',
          layanan: record.layanan || DEFAULT_JNE_SERVICE,
          nama_tujuan: record.nama_tujuan === '-' ? '' : (record.nama_tujuan ?? ''),
          alamat_penerima: record.alamat_penerima === '-' ? '' : (record.alamat_penerima ?? ''),
          alamat_tujuan: record.alamat_tujuan === '-' ? '' : (record.alamat_tujuan ?? ''),
          nama_pengirim:
            sheetTab === 'corporate'
              ? (record.nama_pengirim ?? '')
              : (record.nama_pengirim || DEFAULT_SHIPPER_NAME),
          nominal: record.nominal ?? 0,
          asuransi: record.asuransi ?? 0,
          tanggal: record.tanggal ?? '',
          agen: record.agen || cfg.defaultAgen,
        },
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal memperbarui data di Google Sheets.');

    return { success: true, message: data.message };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || `Gagal memperbarui data di ${cfg.label}.`,
    };
  }
}

/**
 * 6. Hapus 1 atau beberapa baris dari Google Sheets (Khusus Admin & Warehouse)
 */
export async function deleteJneRecordsFromGas(
  noResis: string[],
  operator: string = 'WMS Admin',
  sheetTab: JneSheetTab = 'member',
  gasUrl?: string
): Promise<{ success: boolean; deletedCount?: number; message?: string; error?: string }> {
  const cleaned = noResis.map(cleanResi).filter(Boolean);
  if (cleaned.length === 0) {
    return { success: false, error: 'Tidak ada nomor resi yang dipilih untuk dihapus.' };
  }

  const cfg = getJneTabConfig(sheetTab);
  const url = (gasUrl || getStoredJneGasUrl()).trim();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'deleteRecords',
        sheet: sheetTab,
        no_resis: cleaned,
        operator,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal menghapus data di Google Sheets.');

    const delSet = new Set(cleaned);
    const current = getLocalCachedJneRecords(sheetTab);
    saveLocalCachedJneRecords(
      current.filter((r) => !delSet.has(cleanResi(r.no_resi))),
      sheetTab
    );

    return {
      success: true,
      deletedCount: data.deleted_count || cleaned.length,
      message: data.message,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || `Gagal menghapus data dari ${cfg.label}.`,
    };
  }
}

/**
 * 7. Export ke Excel (.xlsx) sesuai susunan kolom sheet aktif (JNEmember / JNECorporate)
 */
export function exportJneRecordsToExcel(
  records: JneDetectedRecord[],
  fileNamePrefix?: string,
  sheetTab: JneSheetTab = 'member'
): void {
  if (!records || records.length === 0) return;
  const cfg = getJneTabConfig(sheetTab);
  const prefix = fileNamePrefix || cfg.exportPrefix;

  const exportRows =
    sheetTab === 'corporate'
      ? records.map((r) => ({
          'No Resi': r.no_resi,
          'Deskripsi pengiriman': r.deskripsi || '',
          'Tanggal Kiriman': formatDisplayDateJne(r.tanggal),
          'Nama Penerima': r.nama_tujuan === '-' ? '' : r.nama_tujuan,
          'Alamat Penerima': r.alamat_penerima && r.alamat_penerima !== '-' ? r.alamat_penerima : '',
          'Kota Tujuan Penerima': r.alamat_tujuan === '-' ? '' : r.alamat_tujuan,
          'Service': r.layanan || DEFAULT_JNE_SERVICE,
          'Ongkir': r.nominal || 0,
          'Nominal Asuransi': r.asuransi || 0,
          'Status Pembayaran': r.status_pembayaran || 'Belum Ada Tagihan',
          'Agen': r.agen || cfg.defaultAgen,
        }))
      : records.map((r, idx) => ({
          'No': r.no || idx + 1,
          'Cnote No': r.no_resi,
          'Deskripsi pengiriman': r.deskripsi || '',
          'Services': r.layanan || DEFAULT_JNE_SERVICE,
          'Receiver Name': r.nama_tujuan === '-' ? '' : r.nama_tujuan,
          'Destination': r.alamat_tujuan === '-' ? '' : r.alamat_tujuan,
          'Shipper Name': r.nama_pengirim || DEFAULT_SHIPPER_NAME,
          'Amount': r.nominal || 0,
          'Tanggal Pengiriman': formatDisplayDateJne(r.tanggal),
          'Agen': r.agen || cfg.defaultAgen,
        }));

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, cfg.sheetName);

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(workbook, `${prefix}_${dateStr}.xlsx`);
}

/**
 * 8. Export ke CSV (.csv UTF-8 BOM)
 */
export function exportJneRecordsToCsv(
  records: JneDetectedRecord[],
  fileNamePrefix?: string,
  sheetTab: JneSheetTab = 'member'
): void {
  if (!records || records.length === 0) return;
  const cfg = getJneTabConfig(sheetTab);
  const prefix = fileNamePrefix || cfg.exportPrefix;

  const headers =
    sheetTab === 'corporate'
      ? [
          'No Resi',
          'Deskripsi pengiriman',
          'Tanggal Kiriman',
          'Nama Penerima',
          'Alamat Penerima',
          'Kota Tujuan Penerima',
          'Service',
          'Ongkir',
          'Nominal Asuransi',
          'Status Pembayaran',
          'Agen',
        ]
      : [
          'No',
          'Cnote No',
          'Deskripsi pengiriman',
          'Services',
          'Receiver Name',
          'Destination',
          'Shipper Name',
          'Amount',
          'Tanggal Pengiriman',
          'Agen',
        ];

  const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [headers.map(esc).join(',')];

  records.forEach((r, idx) => {
    const rowCols =
      sheetTab === 'corporate'
        ? [
            r.no_resi,
            r.deskripsi || '',
            formatDisplayDateJne(r.tanggal),
            r.nama_tujuan === '-' ? '' : r.nama_tujuan,
            r.alamat_penerima && r.alamat_penerima !== '-' ? r.alamat_penerima : '',
            r.alamat_tujuan === '-' ? '' : r.alamat_tujuan,
            r.layanan || DEFAULT_JNE_SERVICE,
            r.nominal || 0,
            r.asuransi || 0,
            r.status_pembayaran || 'Belum Ada Tagihan',
            r.agen || cfg.defaultAgen,
          ]
        : [
            r.no || idx + 1,
            r.no_resi,
            r.deskripsi || '',
            r.layanan || DEFAULT_JNE_SERVICE,
            r.nama_tujuan === '-' ? '' : r.nama_tujuan,
            r.alamat_tujuan === '-' ? '' : r.alamat_tujuan,
            r.nama_pengirim || DEFAULT_SHIPPER_NAME,
            r.nominal || 0,
            formatDisplayDateJne(r.tanggal),
            r.agen || cfg.defaultAgen,
          ];
    lines.push(rowCols.map(esc).join(','));
  });

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${prefix}_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
