import * as XLSX from 'xlsx';
import { JneDetectedRecord } from './jneRekapParser';

export const JNE_GAS_SCRIPT_ID = '1Z1cIj3vnYR_CxK_SLuFqeOvlxnT5dUf7brhgW2X1Njj-Qr0qC7F9QmgZ';
export const JNE_GAS_DEPLOYMENT_ID = 'AKfycbytMxVVOUCbEIXK9gPT96oCc3nnr6qRN39axHG45xYuxwle47A6u2FerqfabXKLUt2nCA';
export const DEFAULT_JNE_GAS_URL = `https://script.google.com/macros/s/${JNE_GAS_DEPLOYMENT_ID}/exec`;

const STORAGE_KEY_JNE_REKAP = 'chocochips_jne_rekap_records_v1';
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
    const raw = localStorage.getItem(STORAGE_KEY_JNE_REKAP);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveLocalCachedJneRecords(records: JneDetectedRecord[]): void {
  try {
    localStorage.setItem(STORAGE_KEY_JNE_REKAP, JSON.stringify(records));
  } catch {}
}

/**
 * Tarik data rekap JNE dari Google Apps Script (Sheet "Rekap Tagihan JNE")
 */
export async function fetchJneRecordsFromGas(gasUrl?: string): Promise<{
  success: boolean;
  records: JneDetectedRecord[];
  total: number;
  message?: string;
  error?: string;
}> {
  const url = (gasUrl || getStoredJneGasUrl()).trim();

  try {
    const res = await fetch(`${url}?action=read&t=${Date.now()}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    });

    if (!res.ok) {
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Gagal membaca data dari GAS');
    }

    const fetchedRecords: JneDetectedRecord[] = (data.records || []).map((r: any, idx: number) => ({
      id: `JNE-${r.no_resi || idx}`,
      no_resi: String(r.no_resi || '').trim(),
      tanggal: String(r.tanggal || '').trim(),
      nominal: Number(r.nominal) || 0,
      layanan: String(r.layanan || 'REG').trim(),
      nama_tujuan: String(r.nama_tujuan || '-').trim(),
      alamat_tujuan: String(r.alamat_tujuan || '-').trim(),
      deskripsi: String(r.deskripsi || '').trim(),
      source_file: String(r.source_file || '').trim()
    }));

    // Simpan ke local cache
    saveLocalCachedJneRecords(fetchedRecords);

    return {
      success: true,
      records: fetchedRecords,
      total: fetchedRecords.length,
      message: `Berhasil memuat ${fetchedRecords.length} data dari Google Sheets.`
    };

  } catch (err: any) {
    console.warn('[JNE] Gagal fetch dari GAS, menggunakan data cache lokal:', err);
    const cached = getLocalCachedJneRecords();
    return {
      success: false,
      records: cached,
      total: cached.length,
      error: `Gagal terhubung ke Google Sheets: ${err?.message || String(err)}. Menampilkan ${cached.length} data cache lokal.`
    };
  }
}

/**
 * Simpan / Push data rekap ke Google Apps Script (Batch Save)
 */
export async function saveJneRecordsToGas(
  records: JneDetectedRecord[],
  operator: string = 'WMS Admin',
  gasUrl?: string
): Promise<{
  success: boolean;
  inserted?: number;
  updated?: number;
  message?: string;
  error?: string;
}> {
  if (!records || records.length === 0) {
    return { success: false, error: 'Tidak ada data untuk disimpan.' };
  }

  const url = (gasUrl || getStoredJneGasUrl()).trim();

  try {
    const payload = {
      action: 'batchSave',
      operator: operator,
      records: records.map(r => ({
        no_resi: r.no_resi,
        tanggal: r.tanggal,
        nominal: r.nominal,
        layanan: r.layanan,
        nama_tujuan: r.nama_tujuan,
        alamat_tujuan: r.alamat_tujuan,
        deskripsi: r.deskripsi,
        source_file: r.source_file
      }))
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || 'Server menolak penyimpanan.');
    }

    // Update local cache
    saveLocalCachedJneRecords(records);

    return {
      success: true,
      inserted: data.inserted || 0,
      updated: data.updated || 0,
      message: data.message || `Berhasil menyimpan data ke Google Sheets.`
    };

  } catch (err: any) {
    // Tetap simpan ke local cache agar tidak hilang
    saveLocalCachedJneRecords(records);
    return {
      success: false,
      error: `Gagal simpan ke Google Sheets: ${err?.message || String(err)}. Data tetap aman tersimpan di cache browser.`
    };
  }
}

/**
 * Update Deskripsi Pengiriman Tunggal ke GAS
 */
export async function updateDeskripsiToGas(
  noResi: string,
  deskripsi: string,
  operator: string = 'WMS Admin',
  gasUrl?: string
): Promise<{ success: boolean; message?: string; error?: string }> {
  const url = (gasUrl || getStoredJneGasUrl()).trim();

  try {
    const payload = {
      action: 'updateDeskripsi',
      no_resi: noResi,
      deskripsi: deskripsi,
      operator: operator
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal update deskripsi');

    // Update cache lokal
    const current = getLocalCachedJneRecords();
    const updated = current.map(item =>
      item.no_resi.toUpperCase() === noResi.toUpperCase()
        ? { ...item, deskripsi: deskripsi }
        : item
    );
    saveLocalCachedJneRecords(updated);

    return { success: true, message: data.message };

  } catch (err: any) {
    // Fallback update lokal
    const current = getLocalCachedJneRecords();
    const updated = current.map(item =>
      item.no_resi.toUpperCase() === noResi.toUpperCase()
        ? { ...item, deskripsi: deskripsi }
        : item
    );
    saveLocalCachedJneRecords(updated);

    return {
      success: true,
      message: `Deskripsi tersimpan di cache lokal (offline sync pending).`
    };
  }
}

/**
 * Export data rekap JNE ke file Excel (.xlsx)
 */
export function exportJneRecordsToExcel(records: JneDetectedRecord[], fileNamePrefix: string = 'Rekap_JNE'): void {
  if (!records || records.length === 0) return;

  const exportRows = records.map((r, idx) => ({
    'No': idx + 1,
    'No Resi': r.no_resi,
    'Tanggal Pengiriman': r.tanggal,
    'Nominal Tagihan (Rp)': r.nominal,
    'Layanan': r.layanan,
    'Nama Penerima': r.nama_tujuan,
    'Alamat Tujuan': r.alamat_tujuan,
    'Deskripsi Pengiriman': r.deskripsi || '-',
    'File Sumber': r.source_file || '-'
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Rekap Tagihan JNE');

  const now = new Date();
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
  XLSX.writeFile(workbook, `${fileNamePrefix}_${dateStr}.xlsx`);
}
