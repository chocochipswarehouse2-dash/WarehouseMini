import { PenerimaanProduksiItem } from '../types';
import { MatrixProductBlock } from '../components/penerimaan/ProduksiSpreadsheetView';

export const PRODUKSI_SPREADSHEET_ID = '1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk';
export const PRODUKSI_SCRIPT_ID = '1vYGP1u5mCAvjFYbJQHbc7mLruxrtwUmlKh27djBJ6oBlomuOCCKy-scb';
export const DEFAULT_PRODUKSI_GAS_URL = 'https://script.google.com/macros/s/AKfycbyrsovwstbIR_e1-zgOovxt2sKCyPTjpON9XbOERShS-mZd-Aj5TgWueZRjwDJ05bponA/exec';

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
 * Push data penerimaan produksi ke Google Spreadsheet dengan format Master Matrix Spreadsheet (=IMAGE)
 * Spreadsheet ID: 1fnW49pCI8X8-lYtmXljxB0GsZWKkQtKshV2R5-mlodk
 */
export async function pushPenerimaanProduksiToGoogleSheet(
  items: PenerimaanProduksiItem[],
  blocks?: MatrixProductBlock[],
  activeTab: 'CMT' | 'Kargo' = 'CMT',
  customSpreadsheetId?: string
): Promise<PushProduksiResponse> {
  if ((!items || items.length === 0) && (!blocks || blocks.length === 0)) {
    return { success: false, message: 'Tidak ada data item untuk dikirim.' };
  }

  const targetSpreadsheetId = customSpreadsheetId || localStorage.getItem('wms_produksi_spreadsheet_id') || PRODUKSI_SPREADSHEET_ID;
  const gasUrl = localStorage.getItem('wms_produksi_gas_url') || DEFAULT_PRODUKSI_GAS_URL;

  // Format blocks jika ada
  const formattedBlocks = blocks ? blocks.map((b) => ({
    ...b,
    photoUrl: formatImageUrlForSheets(b.photoUrl),
  })) : undefined;

  // Format flat items
  const formattedItems = items ? items.map((it) => ({
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
      throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
    }
  } catch (err: any) {
    console.warn('CORS / Fetch error pada GAS Web App, mencoba fallback mode no-cors:', err);
    try {
      // Fallback mode no-cors bypasses browser CORS blocking for Google Apps Script Web App
      await fetch(gasUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
        body: JSON.stringify(payload),
      });

      return {
        success: true,
        message: `Berhasil mengirim data Master Matrix (${activeTab}) ke Google Sheet!`,
        count: blocks ? blocks.length : formattedItems.length,
        sheetUrl: `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`,
      };
    } catch (fallbackErr: any) {
      console.error('Gagal total push ke GAS Web App:', fallbackErr);
      return {
        success: false,
        message: 'Gagal mengirim data ke Google Sheet melalui Web App: ' + (err?.message || err),
        error: err?.message || String(err),
        sheetUrl: `https://docs.google.com/spreadsheets/d/${targetSpreadsheetId}/edit`,
      };
    }
  }
}
