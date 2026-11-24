import * as XLSX from 'xlsx';
import {
  JneDetectedRecord,
  DEFAULT_AGEN_NAME,
  DEFAULT_JNE_SERVICE,
  DEFAULT_SHIPPER_NAME,
  cleanResi,
  formatDisplayDateJne,
  normalizeDate,
  normalizeNominal,
} from './jneRekapParser';

export const JNE_SPREADSHEET_ID = '1AvDc-u_mcxn3WwW6CV4WYfq05sWl4opdLJ2oC7SUP1k';
export const JNE_SHEET_NAME = 'JNEMember';
export const JNE_SHEET_GID = '1026608111';
export const JNE_GSHEET_URL = `https://docs.google.com/spreadsheets/d/${JNE_SPREADSHEET_ID}/edit?gid=${JNE_SHEET_GID}#gid=${JNE_SHEET_GID}`;

export const JNE_GAS_SCRIPT_ID = '1Z1cIj3vnYR_CxK_SLuFqeOvlxnT5dUf7brhgW2X1Njj-Qr0qC7F9QmgZ';
export const JNE_GAS_DEPLOYMENT_ID = 'AKfycbytMxVVOUCbEIXK9gPT96oCc3nnr6qRN39axHG45xYuxwle47A6u2FerqfabXKLUt2nCA';
export const DEFAULT_JNE_GAS_URL = `https://script.google.com/macros/s/${JNE_GAS_DEPLOYMENT_ID}/exec`;

const STORAGE_KEY_JNE_MEMBER = 'chocochips_jne_member_records_v2';
const STORAGE_KEY_JNE_GAS_URL = 'chocochips_jne_gas_url_v1';

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

export function getLocalCachedJneRecords(): JneDetectedRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_JNE_MEMBER);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalCachedJneRecords(records: JneDetectedRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_JNE_MEMBER, JSON.stringify(records));
  } catch {}
}

function mapRawToJneRecord(r: any, idx: number): JneDetectedRecord {
  const resi = cleanResi(r.no_resi || r.cnote_no || '');
  return {
    id: `JNE-${resi || idx}-${r.row_number || idx}`,
    row_number: typeof r.row_number === 'number' ? r.row_number : undefined,
    no: r.no !== undefined ? r.no : '',
    no_resi: resi,
    deskripsi: String(r.deskripsi ?? '').trim(),
    layanan: String(r.layanan || DEFAULT_JNE_SERVICE).trim(),
    nama_tujuan: String(r.nama_tujuan || '').trim() || '-',
    alamat_tujuan: String(r.alamat_tujuan || '').trim() || '-',
    nama_pengirim: String(r.nama_pengirim || DEFAULT_SHIPPER_NAME).trim() || DEFAULT_SHIPPER_NAME,
    nominal: normalizeNominal(r.nominal),
    tanggal: normalizeDate(r.tanggal),
    agen: String(r.agen || DEFAULT_AGEN_NAME).trim() || DEFAULT_AGEN_NAME,
    source_file: r.source_file ? String(r.source_file).trim() : undefined,
  };
}

/**
 * Fallback baca langsung dari Google Visualization JSON endpoint sheet JNEMember (gid=1026608111)
 * apabila endpoint GAS sedang lambat / gagal jaringan sementara.
 */
async function fetchDirectFromGsheetGviz(): Promise<JneDetectedRecord[]> {
  const gvizUrl = `https://docs.google.com/spreadsheets/d/${JNE_SPREADSHEET_ID}/gviz/tq?tqx=out:json&gid=${JNE_SHEET_GID}&t=${Date.now()}`;
  const res = await fetch(gvizUrl);
  if (!res.ok) throw new Error(`GSheet HTTP ${res.status}`);
  const text = await res.text();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('Respons GSheet tidak valid.');

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
    const cnote = cleanResi(cellStr(2));
    if (!cnote || cnote === 'CNOTENO' || cnote === 'NORESI') return;

    const rawAmount = c[8]?.v;
    const dispAmount = cellStr(8);

    out.push({
      id: `JNE-${cnote}-${idx + 2}`,
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
  });

  return out;
}

/**
 * 1. Tarik seluruh data live dari Sheet "JNEMember"
 */
export async function fetchJneRecordsFromGas(gasUrl?: string): Promise<{
  success: boolean;
  records: JneDetectedRecord[];
  total: number;
  source?: 'gas' | 'gviz' | 'cache';
  message?: string;
  error?: string;
}> {
  const url = (gasUrl || getStoredJneGasUrl()).trim();

  try {
    const res = await fetch(`${url}?action=read&t=${Date.now()}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Gagal membaca data JNEMember dari GAS.');
    }

    const fetchedRecords = (data.records || []).map(mapRawToJneRecord);
    saveLocalCachedJneRecords(fetchedRecords);

    return {
      success: true,
      records: fetchedRecords,
      total: fetchedRecords.length,
      source: 'gas',
      message: `Dimuat ${fetchedRecords.length.toLocaleString('id-ID')} baris dari GSheet JNEMember.`,
    };
  } catch (gasErr: any) {
    // Coba baca langsung via endpoint JSON GSheet JNEMember sebelum turun ke cache lokal
    try {
      const gvizRecords = await fetchDirectFromGsheetGviz();
      if (gvizRecords.length > 0) {
        saveLocalCachedJneRecords(gvizRecords);
        return {
          success: true,
          records: gvizRecords,
          total: gvizRecords.length,
          source: 'gviz',
          message: `Dimuat ${gvizRecords.length.toLocaleString('id-ID')} baris langsung dari GSheet JNEMember.`,
        };
      }
    } catch {}

    console.warn('[JNE] Gagal fetch live, menggunakan cache lokal:', gasErr);
    const cached = getLocalCachedJneRecords();
    return {
      success: false,
      records: cached,
      total: cached.length,
      source: 'cache',
      error: `Gagal terhubung ke Google Sheets (${gasErr?.message || String(gasErr)}). Menampilkan ${cached.length} data cache terakhir.`,
    };
  }
}

/**
 * 2. Tambah / Import data baru ke Sheet "JNEMember" (Aman tanpa menimpa Kolom D existing di GSheet)
 */
export async function upsertJneRecordsToGas(
  records: JneDetectedRecord[],
  options: {
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
    return { success: false, error: 'Tidak ada data untuk disimpan ke GSheet.' };
  }

  const url = (options.gasUrl || getStoredJneGasUrl()).trim();

  try {
    const payload = {
      action: 'upsertRecords',
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
        alamat_tujuan: r.alamat_tujuan === '-' ? '' : r.alamat_tujuan,
        nama_pengirim: r.nama_pengirim || DEFAULT_SHIPPER_NAME,
        nominal: r.nominal || 0,
        tanggal: r.tanggal,
        agen: r.agen || DEFAULT_AGEN_NAME,
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
      throw new Error(data.error || 'Server GSheet menolak penyimpanan.');
    }

    return {
      success: true,
      inserted: data.inserted || 0,
      updated: data.updated || 0,
      skipped: data.skipped || 0,
      message: data.message || 'Data berhasil disimpan ke GSheet JNEMember.',
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Gagal menyimpan ke GSheet JNEMember: ${err?.message || String(err)}`,
    };
  }
}

/**
 * Alias kompatibilitas
 */
export async function saveJneRecordsToGas(
  records: JneDetectedRecord[],
  operator: string = 'WMS Admin',
  gasUrl?: string
) {
  return upsertJneRecordsToGas(records, { operator, gasUrl });
}

/**
 * 3. Update Kolom D ("Deskripsi pengiriman") satu baris langsung ke GSheet JNEMember
 */
export async function updateDeskripsiToGas(
  noResi: string,
  deskripsi: string,
  operator: string = 'WMS Admin',
  gasUrl?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const url = (gasUrl || getStoredJneGasUrl()).trim();
  const cleanR = cleanResi(noResi);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateDeskripsi',
        no_resi: cleanR,
        deskripsi,
        operator,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal menyimpan deskripsi ke GSheet.');

    const current = getLocalCachedJneRecords();
    saveLocalCachedJneRecords(
      current.map((item) =>
        cleanResi(item.no_resi) === cleanR ? { ...item, deskripsi } : item
      )
    );

    return { success: true, message: data.message };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Gagal menulis Kolom D ke GSheet JNEMember.',
    };
  }
}

/**
 * 4. Update Kolom D ("Deskripsi pengiriman") secara massal ke GSheet JNEMember
 */
export async function bulkUpdateDeskripsiToGas(
  updates: Array<{ no_resi: string; deskripsi: string }>,
  operator: string = 'WMS Admin',
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
        operator,
        updates: updates.map((u) => ({
          no_resi: cleanResi(u.no_resi),
          deskripsi: u.deskripsi,
        })),
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal update massal deskripsi.');

    const updateMap = new Map(updates.map((u) => [cleanResi(u.no_resi), u.deskripsi]));
    const current = getLocalCachedJneRecords();
    saveLocalCachedJneRecords(
      current.map((item) => {
        const k = cleanResi(item.no_resi);
        return updateMap.has(k) ? { ...item, deskripsi: updateMap.get(k)! } : item;
      })
    );

    return {
      success: true,
      updatedCount: data.updated_count || updates.length,
      message: data.message,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Gagal menyimpan deskripsi massal ke GSheet.',
    };
  }
}

/**
 * 5. Edit seluruh kolom pada 1 baris di GSheet JNEMember (Khusus Admin & Warehouse)
 */
export async function updateSingleJneRecordToGas(
  originalNoResi: string,
  record: Partial<JneDetectedRecord> & { no_resi: string },
  operator: string = 'WMS Admin',
  gasUrl?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const url = (gasUrl || getStoredJneGasUrl()).trim();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'updateRecord',
        original_no_resi: cleanResi(originalNoResi),
        operator,
        record: {
          no: record.no ?? '',
          no_resi: cleanResi(record.no_resi),
          deskripsi: record.deskripsi ?? '',
          layanan: record.layanan || DEFAULT_JNE_SERVICE,
          nama_tujuan: record.nama_tujuan === '-' ? '' : (record.nama_tujuan ?? ''),
          alamat_tujuan: record.alamat_tujuan === '-' ? '' : (record.alamat_tujuan ?? ''),
          nama_pengirim: record.nama_pengirim || DEFAULT_SHIPPER_NAME,
          nominal: record.nominal ?? 0,
          tanggal: record.tanggal ?? '',
          agen: record.agen || DEFAULT_AGEN_NAME,
        },
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal memperbarui baris di GSheet.');

    return { success: true, message: data.message };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Gagal memperbarui data di GSheet JNEMember.',
    };
  }
}

/**
 * 6. Hapus 1 atau beberapa baris dari GSheet JNEMember (Khusus Admin & Warehouse)
 */
export async function deleteJneRecordsFromGas(
  noResis: string[],
  operator: string = 'WMS Admin',
  gasUrl?: string
): Promise<{ success: boolean; deletedCount?: number; message?: string; error?: string }> {
  const cleaned = noResis.map(cleanResi).filter(Boolean);
  if (cleaned.length === 0) {
    return { success: false, error: 'Tidak ada nomor resi yang dipilih untuk dihapus.' };
  }

  const url = (gasUrl || getStoredJneGasUrl()).trim();

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'deleteRecords',
        no_resis: cleaned,
        operator,
      }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal menghapus baris di GSheet.');

    const delSet = new Set(cleaned);
    const current = getLocalCachedJneRecords();
    saveLocalCachedJneRecords(current.filter((r) => !delSet.has(cleanResi(r.no_resi))));

    return {
      success: true,
      deletedCount: data.deleted_count || cleaned.length,
      message: data.message,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Gagal menghapus baris dari GSheet JNEMember.',
    };
  }
}

/**
 * 7. Export ke Excel (.xlsx) dengan susunan kolom identik GSheet JNEMember
 */
export function exportJneRecordsToExcel(
  records: JneDetectedRecord[],
  fileNamePrefix: string = 'JNEMember_Rekap'
): void {
  if (!records || records.length === 0) return;

  const exportRows = records.map((r, idx) => ({
    'No': r.no || idx + 1,
    'Cnote No': r.no_resi,
    'Deskripsi pengiriman': r.deskripsi || '',
    'Services': r.layanan || DEFAULT_JNE_SERVICE,
    'Receiver Name': r.nama_tujuan === '-' ? '' : r.nama_tujuan,
    'Destination': r.alamat_tujuan === '-' ? '' : r.alamat_tujuan,
    'Shipper Name': r.nama_pengirim || DEFAULT_SHIPPER_NAME,
    'Amount': r.nominal || 0,
    'Tanggal Pengiriman': formatDisplayDateJne(r.tanggal),
    'Agen': r.agen || DEFAULT_AGEN_NAME,
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'JNEMember');

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(workbook, `${fileNamePrefix}_${dateStr}.xlsx`);
}

/**
 * 8. Export ke CSV (.csv UTF-8 BOM)
 */
export function exportJneRecordsToCsv(
  records: JneDetectedRecord[],
  fileNamePrefix: string = 'JNEMember_Rekap'
): void {
  if (!records || records.length === 0) return;

  const headers = [
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
    lines.push(
      [
        r.no || idx + 1,
        r.no_resi,
        r.deskripsi || '',
        r.layanan || DEFAULT_JNE_SERVICE,
        r.nama_tujuan === '-' ? '' : r.nama_tujuan,
        r.alamat_tujuan === '-' ? '' : r.alamat_tujuan,
        r.nama_pengirim || DEFAULT_SHIPPER_NAME,
        r.nominal || 0,
        formatDisplayDateJne(r.tanggal),
        r.agen || DEFAULT_AGEN_NAME,
      ]
        .map(esc)
        .join(',')
    );
  });

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileNamePrefix}_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
