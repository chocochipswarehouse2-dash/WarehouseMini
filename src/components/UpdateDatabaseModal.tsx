import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Database,
  UploadCloud,
  FileSpreadsheet,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Sparkles,
  Info,
  Layers,
  ArrowRight,
  ShieldCheck,
  Store,
  Boxes,
  HelpCircle,
} from 'lucide-react';
import { UserSession, ProductItem } from '../types';
import { isSuperadmin } from '../services/permissions';
import {
  getStoredSupabaseConfig,
  fetchMasterProdukCount,
  deleteEntireMasterProduk,
  importMasterProdukBatch,
  MasterProdukRecord,
} from '../services/supabase';
import { playSuccessBeep, playErrorBeep, vibrateDevice } from '../services/audio';

interface UpdateDatabaseModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: UserSession | null;
  onRefreshCatalog?: () => Promise<void> | void;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

// Comprehensive mapping dictionary for DealPOS outlets, stores, and channels
export const OUTLET_CODE_MAP: Record<string, string> = {
  // Store Outlets
  'lippo mall puri': 'LMP',
  'lmp': 'LMP',
  'mall kelapa gading': 'MKG',
  'mkg': 'MKG',
  'mkg 3': 'MKG',
  'by the sea pik': 'BTS',
  'by the sea': 'BTS',
  'bts': 'BTS',
  'central park jakarta': 'CPJ',
  'central park': 'CPJ',
  'cpj': 'CPJ',
  'ciputra world surabaya': 'CWS',
  'ciputra world': 'CWS',
  'cws': 'CWS',
  'living world tangerang': 'LWS',
  'living world': 'LWS',
  'lws': 'LWS',
  'deli park medan': 'DPM',
  'deli park': 'DPM',
  'dpm': 'DPM',
  'paskal hyper square bandung': 'PHB',
  'paskal hyper square': 'PHB',
  '23 paskal': 'PHB',
  'phb': 'PHB',
  'pakuwon mall surabaya': 'PMS',
  'pakuwon mall': 'PMS',
  'pms': 'PMS',
  'neo soho jakarta': 'NSJ',
  'neo soho': 'NSJ',
  'nsj': 'NSJ',
  'puri indah mall': 'PIM',
  'pondok indah mall': 'PIM',
  'pim': 'PIM',
  'pim 2': 'PIM',
  'sun plaza medan': 'SPM',
  'sun plaza': 'SPM',
  'spm': 'SPM',
  'gaia pontianak': 'GAIA',
  'gaia bumi raya city': 'GAIA',
  'gaia': 'GAIA',
  'gading serpong tangerang': 'GST',
  'gading serpong': 'GST',
  'summarecon mall serpong': 'GST',
  'sms': 'GST',
  'gst': 'GST',
  'la vela tangerang': 'LVL',
  'la vela': 'LVL',
  'lvl': 'LVL',
  'paris van java': 'PVJ',
  'pvj': 'PVJ',
  'tunjungan plaza': 'TP',
  'tp': 'TP',

  // 5-Komparasi
  'marketplace': 'MAP',
  'gudang utama': 'MAP',
  'map': 'MAP',
  'central warehouse': 'MAP',
  'central': 'MAP',
  'sample live': 'LIVE',
  'barang live': 'LIVE',
  'live': 'LIVE',
  'sample studio': 'STUDIO',
  'studio': 'STUDIO',
  'gudang permak': 'PERMAK',
  'permak / cuci': 'PERMAK',
  'permak': 'PERMAK',
  'cuci': 'PERMAK',
  'diskon defect': 'DEFECT',
  'barang cacat': 'DEFECT',
  'defect': 'DEFECT',
  'cacat': 'DEFECT',

  // Offline Channels
  'warehouse': 'WH',
  'wh': 'WH',
  'gudang qc': 'QC',
  'qc': 'QC',
  'gudang awal': 'GA',
  'ga': 'GA',
  'logistik': 'LOG',
  'log': 'LOG',

  // Online Channels
  'website': 'WEB',
  'web': 'WEB',
  'shopee': 'SHP',
  'shp': 'SHP',
  'tokopedia': 'TPD',
  'tpd': 'TPD',
  'tiktok': 'TTK',
  'tiktok shop': 'TTK',
  'ttk': 'TTK',
  'tt': 'TTK',
  'lazada': 'LZD',
  'lzd': 'LZD',
  'woocommerce': 'WOO',
  'woo': 'WOO',
};

/**
 * Normalizes any CSV column header string to a standardized channel/store code
 */
function resolveChannelKey(headerName: string): string | null {
  const clean = String(headerName || '')
    .trim()
    .toLowerCase()
    .replace(/^(inventory|outlet|stock|store)[_\s\-:]+/, '')
    .replace(/[_\s\-:]+inventory$/, '')
    .trim();

  if (!clean) return null;

  // Direct lookup
  if (OUTLET_CODE_MAP[clean]) {
    return OUTLET_CODE_MAP[clean];
  }

  // Check with inventory_ prefix
  const withInv = `inventory_${clean}`;
  if (OUTLET_CODE_MAP[withInv]) {
    return OUTLET_CODE_MAP[withInv];
  }

  // Partial match search
  for (const [pattern, code] of Object.entries(OUTLET_CODE_MAP)) {
    if (clean === pattern || clean.includes(pattern) || pattern.includes(clean)) {
      return code;
    }
  }

  // If header explicitly starts with inventory/outlet/stock, extract clean uppercase identifier
  const origLower = headerName.trim().toLowerCase();
  if (
    origLower.startsWith('inventory') ||
    origLower.startsWith('outlet') ||
    origLower.startsWith('stock') ||
    origLower.startsWith('inv_')
  ) {
    const rawCode = clean.replace(/[^a-z0-9]/gi, '_').toUpperCase();
    return rawCode || null;
  }

  return null;
}

/**
 * Fast RFC 4180 CSV parser supporting quoted text, commas within quotes, CRLF/LF
 */
function parseCsvContent(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, ''); // Remove UTF-8 BOM if present
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentVal = '';
  let insideQuotes = false;

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    const nextChar = clean[i + 1];

    if (char === '"') {
      if (insideQuotes && nextChar === '"') {
        currentVal += '"';
        i++; // skip escaped quote
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      currentRow.push(currentVal.trim());
      currentVal = '';
    } else if ((char === '\r' || char === '\n') && !insideQuotes) {
      if (char === '\r' && nextChar === '\n') {
        i++; // skip \n of \r\n
      }
      currentRow.push(currentVal.trim());
      currentVal = '';
      if (currentRow.some((c) => c !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentVal += char;
    }
  }

  if (currentVal || currentRow.length > 0) {
    currentRow.push(currentVal.trim());
    if (currentRow.some((c) => c !== '')) {
      rows.push(currentRow);
    }
  }

  return rows;
}

export const UpdateDatabaseModal: React.FC<UpdateDatabaseModalProps> = ({
  isOpen,
  onClose,
  session,
  onRefreshCatalog,
  onNotify,
}) => {
  const userIsSuperadmin = isSuperadmin(session);

  // Database stats
  const [currentDbCount, setCurrentDbCount] = useState<number | null>(null);
  const [isLoadingDbStatus, setIsLoadingDbStatus] = useState<boolean>(false);
  const [dbError, setDbError] = useState<string | null>(null);

  // File upload state
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isParsingFiles, setIsParsingFiles] = useState<boolean>(false);
  const [parsedItems, setParsedItems] = useState<MasterProdukRecord[]>([]);
  const [parsedHeaders, setParsedHeaders] = useState<string[]>([]);
  const [detectedOutlets, setDetectedOutlets] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);

  // Sync execution state
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [updateStep, setUpdateStep] = useState<
    'idle' | 'deleting' | 'uploading' | 'syncing' | 'completed' | 'failed'
  >('idle');
  const [progressPct, setProgressPct] = useState<number>(0);
  const [uploadedCount, setUploadedCount] = useState<number>(0);
  const [statusMessage, setStatusMessage] = useState<string>('');
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [isConfirmDialogOpen, setIsConfirmDialogOpen] = useState<boolean>(false);
  const [showSqlDrawer, setShowSqlDrawer] = useState<boolean>(false);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<any>(null);

  // Load current cloud database count on open
  const loadDatabaseCount = async () => {
    setIsLoadingDbStatus(true);
    setDbError(null);
    try {
      const res = await fetchMasterProdukCount();
      if (res.error) {
        setDbError(res.error);
        setCurrentDbCount(0);
      } else {
        setCurrentDbCount(res.count);
      }
    } catch (err: any) {
      setDbError(err.message || 'Gagal memuat status database');
    } finally {
      setIsLoadingDbStatus(false);
    }
  };

  useEffect(() => {
    if (isOpen && userIsSuperadmin) {
      loadDatabaseCount();
    }
  }, [isOpen, userIsSuperadmin]);

  // Elapsed timer during upload
  useEffect(() => {
    if (isUpdating) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isUpdating]);

  if (!isOpen) return null;

  // If user is not superadmin, show restricted access screen
  if (!userIsSuperadmin) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
        <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-200 dark:border-rose-900 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-black text-slate-900 dark:text-white mb-2">
            Akses Terbatas: Superadmin Only
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-6">
            Fitur Update Database Master Produk hanya dapat diakses oleh akun dengan role Superadmin. Silakan hubungi administrator sistem.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    );
  }

  // Handle files selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files: File[] = Array.from(e.target.files);
      setSelectedFiles(files);
      processCsvFiles(files);
    }
  };

  const handleDropFiles = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFiles = Array.from(e.dataTransfer.files) as File[];
      const files: File[] = droppedFiles.filter(
        (f: File) => f.name.endsWith('.csv') || f.type.includes('csv') || f.type.includes('text')
      );
      if (files.length > 0) {
        setSelectedFiles(files);
        processCsvFiles(files);
      }
    }
  };

  // Read and parse CSV files into standardized records
  const processCsvFiles = async (files: File[]) => {
    setIsParsingFiles(true);
    setParseError(null);
    setParsedItems([]);
    setDetectedOutlets([]);

    try {
      const detectedOutletNames = new Set<string>();
      const allHeadersSet = new Set<string>();
      const productsMap = new Map<string, MasterProdukRecord>();

      for (let fIdx = 0; fIdx < files.length; fIdx++) {
        const file = files[fIdx];
        const text = await file.text();
        const parsed = parseCsvContent(text);

        if (parsed.length < 2) {
          continue;
        }

        const fileHeaders = parsed[0];
        fileHeaders.forEach((h) => allHeadersSet.add(h));
        const fileHeaderLower = fileHeaders.map((h) => String(h || '').trim().toLowerCase());

        // 1. Detect column indices for SKU, Name, Category, Size, Price
        let idxSku = fileHeaderLower.findIndex((h) =>
          ['code', 'sku', 'kode', 'barcode', 'item_code', 'kode_produk', 'kode_barang'].includes(h)
        );
        let idxNama = fileHeaderLower.findIndex((h) =>
          ['product', 'nama', 'nama_produk', 'nama_barang', 'title', 'name', 'item_name', 'product_name'].includes(h)
        );
        let idxKat = fileHeaderLower.findIndex((h) =>
          ['category', 'kategori', 'cat', 'jenis'].includes(h)
        );
        let idxSize = fileHeaderLower.findIndex((h) =>
          ['variant', 'size', 'ukuran', 'varian', 'opsi'].includes(h)
        );
        let idxPrice = fileHeaderLower.findIndex((h) =>
          ['price', 'harga', 'sell_price', 'selling_price', 'harga_jual'].includes(h)
        );

        // Fallbacks if not found by exact match
        if (idxSku === -1) {
          idxSku = fileHeaderLower.findIndex((h) => h.includes('sku') || h.includes('code') || h.includes('kode'));
        }
        if (idxNama === -1) {
          idxNama = fileHeaderLower.findIndex((h) => h.includes('product') || h.includes('nama') || h.includes('title') || h.includes('name'));
        }
        if (idxKat === -1) {
          idxKat = fileHeaderLower.findIndex((h) => h.includes('category') || h.includes('kategori'));
        }
        if (idxSize === -1) {
          idxSize = fileHeaderLower.findIndex((h) => h.includes('variant') || h.includes('size') || h.includes('ukuran'));
        }
        if (idxPrice === -1) {
          idxPrice = fileHeaderLower.findIndex((h) => h.includes('price') || h.includes('harga'));
        }

        // 2. Identify all channel/inventory columns for THIS file
        const fileChannelCols: { colIdx: number; channelKey: string; headerName: string }[] = [];
        fileHeaders.forEach((h, colIdx) => {
          if (colIdx === idxSku || colIdx === idxNama || colIdx === idxKat || colIdx === idxSize || colIdx === idxPrice) {
            return;
          }
          const resolvedKey = resolveChannelKey(h);
          if (resolvedKey) {
            fileChannelCols.push({ colIdx, channelKey: resolvedKey, headerName: h });
            if (!['MAP', 'LIVE', 'STUDIO', 'PERMAK', 'DEFECT', 'WH', 'QC', 'GA', 'LOG'].includes(resolvedKey)) {
              detectedOutletNames.add(resolvedKey);
            }
          }
        });

        // 3. Process rows for THIS file
        for (let rIdx = 1; rIdx < parsed.length; rIdx++) {
          const r = parsed[rIdx];
          const rawSku = String((idxSku !== -1 ? r[idxSku] : '') || '').trim();
          const sku = rawSku.toUpperCase();
          if (!sku || sku === 'UNDEFINED' || sku === 'NULL' || sku === 'CODE' || sku === 'SKU') {
            continue;
          }

          const nama = String((idxNama !== -1 ? r[idxNama] : '') || '').trim() || sku;
          const kategori = String((idxKat !== -1 ? r[idxKat] : '') || '').trim() || 'Apparel';
          const size = String((idxSize !== -1 ? r[idxSize] : '') || '').trim() || 'Default';
          const rawPrice = String((idxPrice !== -1 ? r[idxPrice] : '') || '0').replace(/[^0-9.-]+/g, '');
          const priceNum = Number(rawPrice) || 0;

          let record = productsMap.get(sku);
          if (!record) {
            record = {
              sku: sku,
              nama_produk: nama,
              kategori: kategori,
              size: size,
              price: priceNum,
              dealpos_channels: {
                MAP: 0,
                LIVE: 0,
                STUDIO: 0,
                PERMAK: 0,
                DEFECT: 0,
                'Gudang Utama': 0,
                'Barang Live': 0,
                'Sample Studio': 0,
                'Permak / Cuci': 0,
                'Barang Cacat': 0,
                WH: 0,
                QC: 0,
                GA: 0,
                LOG: 0,
                WEB: 0,
                SHP: 0,
                TPD: 0,
                TTK: 0,
                LZD: 0,
                WOO: 0,
                cabang: {},
                d: {},
                b: {},
                total_stok: 0,
              },
            };
            productsMap.set(sku, record);
          } else {
            // Update metadata if previous record was fallback
            if (record.nama_produk === sku && nama !== sku) record.nama_produk = nama;
            if (record.kategori === 'Apparel' && kategori !== 'Apparel') record.kategori = kategori;
            if (record.size === 'Default' && size !== 'Default') record.size = size;
            if (record.price === 0 && priceNum > 0) record.price = priceNum;
          }

          // Populate inventory quantities from this file into the record's dealpos_channels
          const dp = record.dealpos_channels!;
          fileChannelCols.forEach(({ colIdx, channelKey }) => {
            const rawVal = String(r[colIdx] || '0').replace(/[^0-9.-]+/g, '');
            const qty = Number(rawVal) || 0;

            if (qty !== 0 || dp[channelKey] === undefined) {
              // Direct flat key
              dp[channelKey] = (dp[channelKey] || 0) + qty;

              // Aliases for 5-komparasi
              if (channelKey === 'MAP') dp['Gudang Utama'] = (dp['Gudang Utama'] || 0) + qty;
              if (channelKey === 'LIVE') dp['Barang Live'] = (dp['Barang Live'] || 0) + qty;
              if (channelKey === 'STUDIO') dp['Sample Studio'] = (dp['Sample Studio'] || 0) + qty;
              if (channelKey === 'PERMAK') dp['Permak / Cuci'] = (dp['Permak / Cuci'] || 0) + qty;
              if (channelKey === 'DEFECT') dp['Barang Cacat'] = (dp['Barang Cacat'] || 0) + qty;

              // Categorize into d (DealPOS 5-Komparasi) or b (Branches/Outlets/Singles)
              if (['MAP', 'LIVE', 'STUDIO', 'PERMAK', 'DEFECT'].includes(channelKey)) {
                dp.d = dp.d || {};
                dp.d[channelKey] = (dp.d[channelKey] || 0) + qty;
                if (channelKey === 'MAP') dp.d['Gudang Utama'] = dp.d[channelKey];
                if (channelKey === 'LIVE') dp.d['Barang Live'] = dp.d[channelKey];
                if (channelKey === 'STUDIO') dp.d['Sample Studio'] = dp.d[channelKey];
                if (channelKey === 'PERMAK') dp.d['Permak / Cuci'] = dp.d[channelKey];
                if (channelKey === 'DEFECT') dp.d['Barang Cacat'] = dp.d[channelKey];
              } else {
                dp.cabang = dp.cabang || {};
                dp.cabang[channelKey] = (dp.cabang[channelKey] || 0) + qty;
                dp.b = dp.b || {};
                dp.b[channelKey] = (dp.b[channelKey] || 0) + qty;
              }
            }
          });
        }
      }

      const finalRecords = Array.from(productsMap.values());
      if (finalRecords.length === 0) {
        throw new Error('Tidak ditemukan data SKU yang valid di dalam file CSV yang diupload');
      }

      // Calculate total_stok for each record
      finalRecords.forEach((rec) => {
        if (rec.dealpos_channels) {
          let tot = 0;
          const dp = rec.dealpos_channels;
          // Sum 5-komparasi
          tot += Number(dp.MAP || 0);
          tot += Number(dp.LIVE || 0);
          tot += Number(dp.STUDIO || 0);
          tot += Number(dp.PERMAK || 0);
          tot += Number(dp.DEFECT || 0);
          // Sum offline & online
          tot += Number(dp.WH || 0);
          tot += Number(dp.QC || 0);
          tot += Number(dp.GA || 0);
          tot += Number(dp.LOG || 0);
          tot += Number(dp.WEB || 0);
          tot += Number(dp.SHP || 0);
          tot += Number(dp.TPD || 0);
          tot += Number(dp.TTK || 0);
          tot += Number(dp.LZD || 0);
          tot += Number(dp.WOO || 0);
          // Sum outlets
          if (dp.cabang && typeof dp.cabang === 'object') {
            Object.values(dp.cabang).forEach((v) => {
              tot += Number(v) || 0;
            });
          }
          dp.total_stok = tot;
        }
      });

      setParsedHeaders(Array.from(allHeadersSet));
      setParsedItems(finalRecords);
      setDetectedOutlets(Array.from(detectedOutletNames));
      if (onNotify) {
        onNotify(`Berhasil memproses ${finalRecords.length.toLocaleString()} SKU unik dari ${files.length} file CSV! (${detectedOutletNames.size} cabang & outlet terdeteksi)`, 'success');
      }
    } catch (err: any) {
      console.error('CSV Parsing error:', err);
      setParseError(err.message || 'Gagal memproses file CSV');
      if (onNotify) onNotify(err.message || 'Gagal memproses file CSV', 'error');
    } finally {
      setIsParsingFiles(false);
    }
  };

  // Execute full wipe and replace in Supabase
  const handleExecuteDatabaseUpdate = async () => {
    setIsConfirmDialogOpen(false);
    if (parsedItems.length === 0) return;

    setIsUpdating(true);
    setUpdateStep('deleting');
    setProgressPct(0);
    setUploadedCount(0);
    setStatusMessage('Menghapus seluruh database lama di Supabase...');

    try {
      // Step 1: Wipe all old records from master_produk
      const delResult = await deleteEntireMasterProduk();
      if (!delResult.success && delResult.error) {
        console.warn('Delete warning:', delResult.error);
        // Continue if it was empty table
      }

      // Step 2: Upload new batch
      setUpdateStep('uploading');
      setStatusMessage(`Mengupload ${parsedItems.length} produk baru ke Supabase...`);

      const uploadResult = await importMasterProdukBatch(parsedItems, (uploaded, total, pct) => {
        setUploadedCount(uploaded);
        setProgressPct(pct);
        setStatusMessage(`Mengupload data ke Supabase: ${uploaded.toLocaleString()} / ${total.toLocaleString()} SKU (${pct}%)...`);
      });

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Gagal mengupload master produk ke Supabase');
      }

      // Step 3: Refresh in-app catalog and local caches
      setUpdateStep('syncing');
      setStatusMessage('Memperbarui katalog dan cache lokal aplikasi...');
      if (onRefreshCatalog) {
        await onRefreshCatalog();
      }

      // Step 4: Complete
      setUpdateStep('completed');
      setStatusMessage(`Selesai! Database Supabase berhasil diperbarui (${uploadResult.totalUploaded.toLocaleString()} SKU).`);
      playSuccessBeep();
      vibrateDevice(200);

      // Reload cloud count
      await loadDatabaseCount();

      if (onNotify) {
        onNotify(`Database berhasil diperbarui dengan ${uploadResult.totalUploaded.toLocaleString()} SKU baru!`, 'success');
      }
    } catch (err: any) {
      console.error('Update Database Error:', err);
      setUpdateStep('failed');
      setStatusMessage(err.message || 'Terjadi kesalahan saat memperbarui database');
      playErrorBeep();
      vibrateDevice(500);
      if (onNotify) {
        onNotify(err.message || 'Gagal memperbarui database ke Supabase', 'error');
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopySql = () => {
    const sql = `-- TABEL MASTER PRODUK WMS & OUTLET STORE
CREATE TABLE IF NOT EXISTS public.master_produk (
  sku TEXT PRIMARY KEY,
  nama_produk TEXT NOT NULL,
  kategori TEXT DEFAULT 'Apparel',
  size TEXT DEFAULT 'Default',
  price NUMERIC DEFAULT 0,
  dealpos_channels JSONB DEFAULT '{}'::jsonb
);

-- RLS POLICY (Bebas Akses Anonim Applet)
ALTER TABLE public.master_produk ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public all access" ON public.master_produk;
CREATE POLICY "Allow public all access" ON public.master_produk FOR ALL USING (true);`;

    navigator.clipboard.writeText(sql);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/75 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4.5 bg-gradient-to-r from-rose-600 via-rose-700 to-amber-600 text-white flex items-center justify-between shadow-md shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl backdrop-blur-md">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black tracking-tight text-white">
                  Update Database Master (CSV)
                </h2>
                <span className="text-[10px] uppercase font-extrabold px-2 py-0.5 bg-white/20 text-white rounded-full tracking-wider">
                  Superadmin
                </span>
              </div>
              <p className="text-xs text-rose-100 font-medium">
                Import CSV 2 file, hapus database lama, dan tulis data lengkap berikut inventory store ke Supabase
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isUpdating}
            className="p-2 text-rose-100 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-5 flex-1 text-slate-800 dark:text-slate-200">
          {/* Warning Banner */}
          <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 rounded-xl flex items-start gap-3 text-rose-900 dark:text-rose-200">
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <span className="font-extrabold block text-rose-700 dark:text-rose-300">
                Peringatan: Timpa Total Database Lama (Replace & Overwrite)
              </span>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Setiap kali proses update dijalankan, sistem akan <b>menghapus seluruh data master produk lama di Supabase</b> dan menggantinya dengan data baru yang diekstrak dari 2 file CSV yang Anda upload. Pastikan file CSV Anda adalah data terbaru yang valid.
              </p>
            </div>
          </div>

          {/* Database Status Card */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Status Database Supabase Saat Ini
                </div>
                <div className="text-sm font-extrabold text-slate-800 dark:text-white flex items-center gap-2">
                  {isLoadingDbStatus ? (
                    <span className="flex items-center gap-1.5 text-xs text-slate-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Memeriksa data cloud...
                    </span>
                  ) : dbError ? (
                    <span className="text-amber-500 text-xs">
                      Tabel master_produk belum ada / {dbError}
                    </span>
                  ) : (
                    <span>
                      {currentDbCount !== null ? `${currentDbCount.toLocaleString()} SKU Terdaftar` : '-'}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={loadDatabaseCount}
                disabled={isLoadingDbStatus || isUpdating}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDbStatus ? 'animate-spin' : ''}`} />
                Cek Status
              </button>
              <button
                type="button"
                onClick={() => setShowSqlDrawer(!showSqlDrawer)}
                className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-xs font-bold text-slate-700 dark:text-slate-300 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                DDL SQL
              </button>
            </div>
          </div>

          {/* DDL SQL Drawer if table needs to be created */}
          {showSqlDrawer && (
            <div className="p-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-400">
                  Skrip SQL Pembuatan Tabel master_produk di Supabase:
                </span>
                <button
                  type="button"
                  onClick={handleCopySql}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-mono font-bold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  {copiedSql ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedSql ? 'Tersalin!' : 'Salin SQL'}
                </button>
              </div>
              <pre className="text-[11px] font-mono p-3 bg-slate-950 rounded-lg overflow-x-auto text-emerald-300">
{`CREATE TABLE IF NOT EXISTS public.master_produk (
  sku TEXT PRIMARY KEY,
  nama_produk TEXT NOT NULL,
  kategori TEXT DEFAULT 'Apparel',
  size TEXT DEFAULT 'Default',
  price NUMERIC DEFAULT 0,
  dealpos_channels JSONB DEFAULT '{}'::jsonb
);
ALTER TABLE public.master_produk ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public all access" ON public.master_produk FOR ALL USING (true);`}
              </pre>
              <p className="text-[11px] text-slate-400">
                Jalankan script di atas sekali di <b>Supabase SQL Editor</b> jika tabel <code className="text-amber-300">master_produk</code> belum dibuat.
              </p>
            </div>
          )}

          {/* File Upload Dropzone */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#ff7a00]" />
                Pilih 2 File CSV Master & Inventory
              </label>
              {selectedFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFiles([]);
                    setParsedItems([]);
                    setParseError(null);
                    if (fileInputRef.current) fileInputRef.current.value = '';
                  }}
                  className="text-xs font-bold text-rose-500 hover:text-rose-600 flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Hapus Pilihan File
                </button>
              )}
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropFiles}
              onClick={() => !isUpdating && fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 text-center transition-all cursor-pointer ${
                selectedFiles.length > 0
                  ? 'border-emerald-500/60 bg-emerald-50/20 dark:bg-emerald-950/10'
                  : 'border-slate-300 dark:border-slate-700 hover:border-[#ff7a00] hover:bg-slate-50 dark:hover:bg-slate-800/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".csv,text/csv,application/vnd.ms-excel"
                onChange={handleFileChange}
                className="hidden"
                disabled={isUpdating}
              />
              <div className="w-12 h-12 rounded-2xl bg-[#ff7a00]/10 text-[#ff7a00] flex items-center justify-center mx-auto mb-3">
                <UploadCloud className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-800 dark:text-white mb-1">
                Klik untuk memilih file atau Drag & Drop ke sini
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Pilih 2 file CSV sekaligus (misal: File Export Produk & File Inventory Toko/Outlet DealPOS)
              </p>
            </div>

            {/* List of selected files */}
            {selectedFiles.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {selectedFiles.map((file, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                      <span className="font-bold truncate text-slate-800 dark:text-slate-200">{file.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono shrink-0 pl-2">
                      {(file.size / 1024).toFixed(1)} KB
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Parsing State */}
          {isParsingFiles && (
            <div className="p-4 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl flex items-center gap-3 text-blue-800 dark:text-blue-300 text-xs font-bold">
              <Loader2 className="w-4 h-4 animate-spin text-blue-500 shrink-0" />
              <span>Membaca dan memproses isi file CSV & kolom inventori cabang...</span>
            </div>
          )}

          {/* Parse Error */}
          {parseError && (
            <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-3 text-rose-800 dark:text-rose-300 text-xs">
              <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block">Gagal Memproses File:</span>
                <p>{parseError}</p>
              </div>
            </div>
          )}

          {/* Parsed Summary & Preview */}
          {parsedItems.length > 0 && !isParsingFiles && (
            <div className="space-y-4 pt-2">
              {/* Quick KPI stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/60 rounded-xl">
                  <div className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">
                    Total SKU Siap Upload
                  </div>
                  <div className="text-lg font-black text-emerald-800 dark:text-emerald-200">
                    {parsedItems.length.toLocaleString()}
                  </div>
                </div>

                <div className="p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 rounded-xl">
                  <div className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase">
                    File Terbaca
                  </div>
                  <div className="text-lg font-black text-blue-800 dark:text-blue-200">
                    {selectedFiles.length} File CSV
                  </div>
                </div>

                <div className="p-3 bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900/60 rounded-xl">
                  <div className="text-[10px] font-bold text-purple-700 dark:text-purple-400 uppercase">
                    Outlet / Store
                  </div>
                  <div className="text-lg font-black text-purple-800 dark:text-purple-200">
                    {detectedOutlets.length} Cabang
                  </div>
                </div>

                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/60 rounded-xl">
                  <div className="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">
                    Metode Update
                  </div>
                  <div className="text-xs font-black text-amber-800 dark:text-amber-200 mt-1">
                    Wipe & Replace
                  </div>
                </div>
              </div>

              {/* Detected Outlets Chips */}
              {detectedOutlets.length > 0 && (
                <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <div className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-purple-500" />
                    Cabang & Outlet Toko Terdeteksi ({detectedOutlets.length}):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {detectedOutlets.map((code) => (
                      <span
                        key={code}
                        className="px-2 py-0.5 text-[10px] font-extrabold bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded-md font-mono"
                      >
                        {code}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sample Data Preview Table */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span>Pratinjau Data (5 SKU Pertama):</span>
                  <span className="text-[10px] text-slate-400">Total {parsedItems.length} SKU</span>
                </div>
                <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-x-auto max-h-48">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] uppercase font-bold sticky top-0">
                      <tr>
                        <th className="p-2">SKU</th>
                        <th className="p-2">Nama Produk</th>
                        <th className="p-2">Kategori</th>
                        <th className="p-2">Size</th>
                        <th className="p-2 text-right">Harga</th>
                        <th className="p-2">DealPOS Warehouse</th>
                        <th className="p-2">Store Cabang</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {parsedItems.slice(0, 5).map((item, idx) => {
                        const dp = item.dealpos_channels || ({} as any);
                        const cabangCount = Object.keys(dp.cabang || {}).length;
                        return (
                          <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="p-2 font-mono font-bold text-rose-600 dark:text-rose-400">{item.sku}</td>
                            <td className="p-2 truncate max-w-[180px] font-medium">{item.nama_produk}</td>
                            <td className="p-2 text-slate-500">{item.kategori}</td>
                            <td className="p-2 font-mono">{item.size}</td>
                            <td className="p-2 text-right font-mono font-semibold">
                              Rp {(item.price || 0).toLocaleString()}
                            </td>
                            <td className="p-2 text-[10px]">
                              <span className="text-slate-600 dark:text-slate-400 font-mono">
                                GU:{dp['Gudang Utama'] || 0} | Live:{dp['Barang Live'] || 0} | Studio:{dp['Sample Studio'] || 0}
                              </span>
                            </td>
                            <td className="p-2 text-[10px]">
                              <span className="px-1.5 py-0.5 bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300 rounded font-mono font-bold">
                                {cabangCount} Toko
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Realtime Upload Progress Bar */}
          {isUpdating && (
            <div className="p-5 bg-slate-900 text-white rounded-2xl space-y-3 shadow-xl border border-slate-700 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs">
                <span className="font-extrabold flex items-center gap-2 text-rose-400">
                  <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                  {updateStep === 'deleting' && 'MENGHAPUS DATABASE LAMA...'}
                  {updateStep === 'uploading' && `MENGUPLOAD KE SUPABASE (${progressPct}%)...`}
                  {updateStep === 'syncing' && 'MENYINKRONKAN KATALOG APLIKASI...'}
                </span>
                <span className="font-mono text-slate-400 text-xs">
                  Waktu: {elapsedSeconds}s
                </span>
              </div>

              {/* Progress Track */}
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-rose-500 via-[#ff7a00] to-emerald-500 rounded-full transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                <span>{statusMessage}</span>
                <span>{uploadedCount.toLocaleString()} / {parsedItems.length.toLocaleString()} SKU</span>
              </div>
            </div>
          )}

          {/* Completion Banner */}
          {updateStep === 'completed' && !isUpdating && (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 rounded-xl flex items-start gap-3 text-emerald-900 dark:text-emerald-200">
              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <span className="font-extrabold block text-emerald-700 dark:text-emerald-300">
                  Update Database Selesai!
                </span>
                <p>
                  Database Supabase berhasil diperbarui secara penuh dengan {uploadedCount.toLocaleString()} SKU master produk beserta data inventori toko cabang. Seluruh modul aplikasi kini menggunakan database terbaru ini.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isUpdating}
            className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
          >
            Tutup
          </button>

          <button
            type="button"
            onClick={() => setIsConfirmDialogOpen(true)}
            disabled={parsedItems.length === 0 || isUpdating || isParsingFiles}
            className={`px-5 py-2.5 rounded-xl text-xs font-extrabold transition-all shadow-md flex items-center gap-2 cursor-pointer ${
              parsedItems.length > 0 && !isUpdating
                ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white shadow-rose-600/30'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-400 cursor-not-allowed'
            }`}
          >
            {isUpdating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Memproses Update...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                Hapus & Update Database ({parsedItems.length.toLocaleString()} SKU)
              </>
            )}
          </button>
        </div>
      </div>

      {/* Confirmation Dialog */}
      {isConfirmDialogOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-300 dark:border-rose-800 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-base font-black text-slate-900 dark:text-white">
                Konfirmasi Hapus & Ganti Database?
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Tindakan ini akan <b>menghapus seluruh database produk lama</b> dan mengupload <b>{parsedItems.length.toLocaleString()} SKU baru</b> ke Supabase.
              </p>
            </div>

            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl text-rose-900 dark:text-rose-200 text-xs font-semibold text-center">
              Apakah Anda yakin ingin melanjutkan?
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsConfirmDialogOpen(false)}
                className="py-2.5 border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteDatabaseUpdate}
                className="py-2.5 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-black shadow-lg shadow-rose-600/30 transition-all cursor-pointer"
              >
                Ya, Hapus & Ganti
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
