import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  Image as ImageIcon,
  Trash2,
  Camera,
  Upload,
  BookOpen,
  Download,
  HelpCircle,
  Info,
  RefreshCw,
  Printer,
  QrCode,
  FileText,
  Eye,
  EyeOff,
  Layers,
  Search,
  Filter,
  Check,
  CheckSquare,
  Square,
  Edit2,
  MoreVertical,
  Plus,
  ChevronDown,
  ChevronUp,
  FolderPlus,
  Package,
  Sparkles,
  ExternalLink,
  Cloud,
  ZoomIn,
  Globe,
  Store,
  Calendar,
  ArrowUpDown,
} from 'lucide-react';
import * as xlsx from 'xlsx';
import JSZip from 'jszip';
import { KatalogBatch, KatalogItem, KatalogVariant, UserSession } from '../types';
import { isSuperadmin, hasPermission } from '../services/permissions';
import { uploadImageToGdrive } from '../services/gdriveUpload';
import {
  uploadKatalogImageToGdrive,
  syncAndMigrateKatalogImagesToGdrive,
} from '../services/katalogGdrive';
import {
  loadKatalogBatches,
  persistKatalogBatches,
  compressImageDataUri,
  extractCatalogNameFromFilename,
  getDefaultInitialBatch,
  compareKatalogBatches,
  sortKatalogItems,
  KatalogSortOrder,
} from './katalog/katalogStorage';
import { KatalogUploadModal } from './katalog/KatalogUploadModal';
import { KatalogBarcodeModal } from './katalog/KatalogBarcodeModal';
import { KatalogA4PrintModal } from './katalog/KatalogA4PrintModal';
import { KatalogImageLightbox } from './katalog/KatalogImageLightbox';
import { KatalogFilterDropdown } from './katalog/KatalogFilterDropdown';
import { KatalogProductModal } from './katalog/KatalogProductModal';
import { KatalogCreateModal } from './katalog/KatalogCreateModal';
import { KatalogBatchEditModal, BatchEditPayload } from './katalog/KatalogBatchEditModal';

interface KatalogProdukViewProps {
  session?: UserSession | null;
  onNotify: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const normalizeHeaderKey = (str: any): string => {
  return String(str || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
};

const COLUMN_ALIASES: Record<string, string[]> = {
  nomor: ['no', 'nomor', 'id', 'num', 'number', 'noitem', 'nomodel', 'itemno'],
  kode_produk: ['kodeproduk', 'kodebarang', 'kodeartikel', 'artikel', 'itemcode', 'model', 'kodemodel', 'kode', 'code', 'productcode', 'stylecode', 'style', 'kdproduk', 'kdbarang'],
  deskripsi: ['namaproduk', 'namabarang', 'deskripsi', 'deskripsiproduk', 'nama', 'namamodel', 'namaitem', 'productname', 'description', 'title', 'produk', 'itemname', 'nmproduk', 'nmbarang'],
  price: ['price', 'harga', 'hrg', 'hargajual', 'retailprice', 'hargasatuan', 'nominal', 'priceidr', 'tagprice'],
  warna: ['warna', 'color', 'colour', 'varian', 'variant', 'warnamotif', 'motif'],
  size: ['size', 'ukuran', 'sz', 'sizeukuran'],
  sku: ['sku', 'barcode', 'kodesku', 'barcodeproduk', 'barcodesku', 'skubarcode', 'plu', 'upc', 'ean'],
  qty: ['qty', 'jumlah', 'stok', 'stock', 'quantity', 'total', 'stokfisik', 'qtyorder', 'kuantitas'],
  image_url: ['image', 'imageurl', 'gambar', 'foto', 'photo', 'url', 'linkfoto', 'linkgambar', 'fotoproduk'],
  publish_online: ['publishonline', 'tglpublishonline', 'tanggalpublishonline', 'onlinepublish', 'tglonline', 'tanggalliveonline', 'launchingonline', 'online', 'dateonline'],
  publish_offline: ['publishoffline', 'tglpublishoffline', 'tanggalpublishoffline', 'offlinepublish', 'tgloffline', 'tanggalliveoffline', 'launchingoffline', 'publishstore', 'offline', 'store', 'dateoffline'],
};

// Palet warna badge dinamis per katalog
const CATALOG_COLOR_PALETTES = [
  { bg: 'bg-indigo-100 dark:bg-indigo-950/60', text: 'text-indigo-800 dark:text-indigo-300', border: 'border-indigo-200 dark:border-indigo-800' },
  { bg: 'bg-emerald-100 dark:bg-emerald-950/60', text: 'text-emerald-800 dark:text-emerald-300', border: 'border-emerald-200 dark:border-emerald-800' },
  { bg: 'bg-amber-100 dark:bg-amber-950/60', text: 'text-amber-800 dark:text-amber-300', border: 'border-amber-200 dark:border-amber-800' },
  { bg: 'bg-violet-100 dark:bg-violet-950/60', text: 'text-violet-800 dark:text-violet-300', border: 'border-violet-200 dark:border-violet-800' },
  { bg: 'bg-rose-100 dark:bg-rose-950/60', text: 'text-rose-800 dark:text-rose-300', border: 'border-rose-200 dark:border-rose-800' },
  { bg: 'bg-cyan-100 dark:bg-cyan-950/60', text: 'text-cyan-800 dark:text-cyan-300', border: 'border-cyan-200 dark:border-cyan-800' },
];

export const KatalogProdukView: React.FC<KatalogProdukViewProps> = ({ session, onNotify }) => {
  // State Utama Batches
  const [batches, setBatches] = useState<KatalogBatch[]>([]);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Filter & Tampilan
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<KatalogSortOrder>('newest');
  const [channelFilter, setChannelFilter] = useState<
    'all' | 'online' | 'offline' | 'online_only' | 'offline_only' | 'both' | 'none'
  >('all');
  const [hideVariants, setHideVariants] = useState(false);
  const [groupByCatalog, setGroupByCatalog] = useState(true);
  const [cardTableVisible, setCardTableVisible] = useState<Record<string, boolean>>({});

  // Upload Excel Flow
  const [isParsingExcel, setIsParsingExcel] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [parsedUploadItems, setParsedUploadItems] = useState<KatalogItem[]>([]);
  const [suggestedUploadName, setSuggestedUploadName] = useState('');
  const [uploadFileName, setUploadFileName] = useState('');
  const [replaceTargetId, setReplaceTargetId] = useState<string | null>(null);
  const [uploadProgressMsg, setUploadProgressMsg] = useState<string>('');
  const [isMigratingToGdrive, setIsMigratingToGdrive] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<string>('');

  // Modals
  const [barcodeModalOpen, setBarcodeModalOpen] = useState(false);
  const [barcodeTargetItem, setBarcodeTargetItem] = useState<KatalogItem | null>(null);
  const [barcodeTargetItems, setBarcodeTargetItems] = useState<KatalogItem[] | null>(null);
  const [a4ModalOpen, setA4ModalOpen] = useState(false);
  const [a4TargetBatchIds, setA4TargetBatchIds] = useState<string[]>([]);

  // Modal Buat Katalog Baru Manual
  const [createBatchModalOpen, setCreateBatchModalOpen] = useState(false);

  // Modal Tambah / Edit Isi Produk
  const [productModalOpen, setProductModalOpen] = useState(false);
  const [productModalMode, setProductModalMode] = useState<'add' | 'edit'>('add');
  const [productModalBatchId, setProductModalBatchId] = useState<string>('');
  const [productModalBatchName, setProductModalBatchName] = useState<string>('');
  const [productModalItemToEdit, setProductModalItemToEdit] = useState<KatalogItem | null>(null);

  // Lightbox Fullscreen Foto
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxItem, setLightboxItem] = useState<KatalogItem | null>(null);

  // Admin Batch Edit Modal
  const [batchEditModalOpen, setBatchEditModalOpen] = useState(false);
  const [batchToEdit, setBatchToEdit] = useState<KatalogBatch | null>(null);

  // Ref Upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [targetImageUploadItemId, setTargetImageUploadItemId] = useState<string | null>(null);
  const [uploadingImageId, setUploadingImageId] = useState<string | null>(null);

  // Hak Akses Admin / Kelola Katalog
  const isAdmin =
    !session ||
    isSuperadmin(session) ||
    session.role === 'HR & Admin' ||
    hasPermission(session, 'action_upload_katalog') ||
    hasPermission(session, 'action_edit_master');

  // Pemuatan Awal
  useEffect(() => {
    loadBatches();
  }, []);

  const loadBatches = async () => {
    setIsLoading(true);
    try {
      const data = await loadKatalogBatches();
      const sorted = [...data].sort((a, b) => compareKatalogBatches(a, b, 'newest'));
      setBatches(sorted);
      // Pilih semua katalog secara default
      setSelectedCatalogIds(sorted.map((b) => b.id));
    } catch (err) {
      console.error('Failed to load katalog batches:', err);
      onNotify('Gagal memuat katalog, menggunakan data lokal', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const saveBatches = async (newBatches: KatalogBatch[], notifyMsg?: string) => {
    setIsSaving(true);
    try {
      const sorted = [...newBatches].sort((a, b) => compareKatalogBatches(a, b, 'newest'));
      await persistKatalogBatches(sorted);
      setBatches(sorted);
      if (notifyMsg) {
        onNotify(notifyMsg, 'success');
      }
    } catch (err) {
      console.error('Failed to save batches:', err);
      onNotify('Katalog tersimpan di cache lokal browser', 'info');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper Pemilihan Katalog (Multi-select)
  const toggleSelectCatalog = (id: string) => {
    setSelectedCatalogIds((prev) => {
      if (prev.includes(id)) {
        // Jangan biarkan kosong, jika sisa 1 biarkan tetap terpilih
        if (prev.length === 1) return prev;
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const selectOnlyCatalog = (id: string) => {
    setSelectedCatalogIds([id]);
  };

  const selectAllCatalogs = () => {
    setSelectedCatalogIds(batches.map((b) => b.id));
  };

  // Hitung jumlah item per kategori channel untuk filter badge
  const channelCounts = useMemo(() => {
    let all = 0;
    let online = 0;
    let offline = 0;
    let online_only = 0;
    let offline_only = 0;
    let both = 0;
    let none = 0;

    batches
      .filter((b) => selectedCatalogIds.includes(b.id))
      .forEach((b) => {
        b.items.forEach((it) => {
          all++;
          const effectiveOnline = (it.publish_online || b.publish_online || '').trim();
          const effectiveOffline = (it.publish_offline || b.publish_offline || '').trim();
          const hasOnline = Boolean(effectiveOnline);
          const hasOffline = Boolean(effectiveOffline);

          if (hasOnline) online++;
          if (hasOffline) offline++;
          if (hasOnline && !hasOffline) online_only++;
          if (!hasOnline && hasOffline) offline_only++;
          if (hasOnline && hasOffline) both++;
          if (!hasOnline && !hasOffline) none++;
        });
      });

    return { all, online, offline, online_only, offline_only, both, none };
  }, [batches, selectedCatalogIds]);

  // Filter Items
  const filteredBatches = useMemo(() => {
    return [...batches]
      .sort((a, b) => compareKatalogBatches(a, b, sortOrder))
      .filter((b) => selectedCatalogIds.includes(b.id))
      .map((b) => {
        const items = sortKatalogItems(b.items);
        const q = searchQuery.trim().toLowerCase();
        const filteredItems = items.filter((it) => {
          const effectiveOnline = (it.publish_online || b.publish_online || '').trim();
          const effectiveOffline = (it.publish_offline || b.publish_offline || '').trim();
          const hasOnline = Boolean(effectiveOnline);
          const hasOffline = Boolean(effectiveOffline);

          // Filter Saluran / Channel
          if (channelFilter === 'online') {
            if (!hasOnline) return false;
          } else if (channelFilter === 'offline') {
            if (!hasOffline) return false;
          } else if (channelFilter === 'online_only') {
            if (!hasOnline || hasOffline) return false;
          } else if (channelFilter === 'offline_only') {
            if (!hasOffline || hasOnline) return false;
          } else if (channelFilter === 'both') {
            if (!hasOnline || !hasOffline) return false;
          } else if (channelFilter === 'none') {
            if (hasOnline || hasOffline) return false;
          }

          if (!q) return true;
          const matchName = it.deskripsi.toLowerCase().includes(q);
          const matchNo = it.nomor.toLowerCase().includes(q);
          const matchOnline = effectiveOnline ? effectiveOnline.toLowerCase().includes(q) : false;
          const matchOffline = effectiveOffline ? effectiveOffline.toLowerCase().includes(q) : false;
          const matchVariant = it.variants.some(
            (v) =>
              v.sku.toLowerCase().includes(q) ||
              v.warna.toLowerCase().includes(q) ||
              v.size.toLowerCase().includes(q)
          );
          return matchName || matchNo || matchVariant || matchOnline || matchOffline;
        });
        return { ...b, items: filteredItems };
      })
      .filter((b) => b.items.length > 0 || (!searchQuery.trim() && channelFilter === 'all'));
  }, [batches, selectedCatalogIds, searchQuery, channelFilter, sortOrder]);

  const allFilteredItems = useMemo(() => {
    return filteredBatches.flatMap((b) => b.items);
  }, [filteredBatches]);

  const totalFilteredVariants = useMemo(() => {
    return allFilteredItems.reduce((sum, it) => sum + (it.variants?.length || 0), 0);
  }, [allFilteredItems]);

  const totalFilteredQty = useMemo(() => {
    return allFilteredItems.reduce(
      (sum, it) => sum + (it.variants?.reduce((vSum, v) => vSum + (v.qty || 0), 0) || 0),
      0
    );
  }, [allFilteredItems]);

  // Hitung jumlah item dengan foto base64 (yang perlu dimigrasikan ke Google Drive)
  const totalBase64Count = useMemo(() => {
    return batches.reduce((acc, b) => {
      return (
        acc +
        b.items.filter((it) => it.image_url && it.image_url.startsWith('data:image')).length
      );
    }, 0);
  }, [batches]);

  // Handle Upload Excel File & Parsing
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsingExcel(true);
    const fileName = file.name;
    const suggested = extractCatalogNameFromFilename(fileName);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const arrayBuf = ev.target?.result as ArrayBuffer;
        if (!arrayBuf) throw new Error('File tidak dapat dibaca.');

        // 1. Ekstraksi gambar tersemat (drawings) via JSZip
        const drawingRowImages: Record<string, Record<number, string>> = {};
        const sheetNameToDrawing: Record<string, string> = {};

        try {
          const zip = await JSZip.loadAsync(arrayBuf);
          const sheetDrawingMap: Record<string, string> = {};
          for (const f of Object.keys(zip.files)) {
            if (f.startsWith('xl/worksheets/_rels/sheet') && f.endsWith('.xml.rels')) {
              const match = f.match(/sheet(\d+)\.xml\.rels/);
              if (match) {
                const sheetNum = match[1];
                const relsXml = (await zip.file(f)?.async('string')) || '';
                const drMatch = relsXml.match(/Target=\"\.\.\/drawings\/(drawing\d+\.xml)\"/);
                if (drMatch) {
                  sheetDrawingMap[sheetNum] = drMatch[1];
                }
              }
            }
          }

          const wbRelsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) || '';
          const wbXml = (await zip.file('xl/workbook.xml')?.async('string')) || '';
          const rIdToTarget: Record<string, string> = {};
          for (const m of wbRelsXml.matchAll(/Id=\"([^\"]+)\"[^>]*Target=\"([^\"]+)\"/g)) {
            rIdToTarget[m[1]] = m[2];
          }
          for (const m of wbXml.matchAll(/<sheet[^>]*name=\"([^\"]+)\"[^>]*r:id=\"([^\"]+)\"/g)) {
            const sName = m[1];
            const rId = m[2];
            const target = rIdToTarget[rId];
            if (target) {
              const targetMatch = target.match(/sheet(\d+)\.xml/);
              if (targetMatch && sheetDrawingMap[targetMatch[1]]) {
                sheetNameToDrawing[sName] = sheetDrawingMap[targetMatch[1]];
              }
            }
          }

          for (const f of Object.keys(zip.files)) {
            if (f.startsWith('xl/drawings/drawing') && f.endsWith('.xml')) {
              const drawFileName = f.replace('xl/drawings/', '');
              const relPath = `xl/drawings/_rels/${drawFileName}.rels`;
              const relFile = zip.file(relPath);
              if (!relFile) continue;
              const relsXml = (await relFile.async('string')) || '';
              const relMap: Record<string, string> = {};
              for (const m of relsXml.matchAll(/Id=\"([^\"]+)\"[^>]*Target=\"([^\"]+)\"/g)) {
                relMap[m[1]] = m[2].replace('../media/', '');
              }
              const drawXml = (await zip.file(f)?.async('string')) || '';
              drawingRowImages[drawFileName] = {};
              for (const a of drawXml.matchAll(/<xdr:row>(\d+)<\/xdr:row>[\s\S]*?r:embed=\"([^\"]+)\"/g)) {
                const row = parseInt(a[1], 10);
                const mediaName = relMap[a[2]];
                if (mediaName && zip.file(`xl/media/${mediaName}`)) {
                  const b64 = await zip.file(`xl/media/${mediaName}`)?.async('base64');
                  if (b64) {
                    const ext = mediaName.endsWith('.png') ? 'png' : 'jpeg';
                    const rawDataUri = `data:image/${ext};base64,${b64}`;
                    // Kompres gambar agar sangat hemat ukuran & cepat
                    const compressed = await compressImageDataUri(rawDataUri, 700, 0.78);
                    drawingRowImages[drawFileName][row] = compressed;
                  }
                }
              }
            }
          }
        } catch (zipErr) {
          console.warn('Gagal membaca gambar tersemat:', zipErr);
        }

        // 2. Baca Workbook
        const workbook = xlsx.read(arrayBuf, { type: 'array' });
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          throw new Error('File Excel tidak memiliki lembar kerja (sheet).');
        }

        const chosenSheetName =
          workbook.SheetNames.find(
            (s) =>
              s.toLowerCase().includes('offline') ||
              s.toLowerCase().includes('katalog') ||
              s.toLowerCase().includes('up ')
          ) || workbook.SheetNames[0];

        const worksheet = workbook.Sheets[chosenSheetName];
        const drawingFile = sheetNameToDrawing[chosenSheetName] || Object.keys(drawingRowImages)[0];
        const rowImages = (drawingFile && drawingRowImages[drawingFile]) || {};

        const rawRows: any[][] = xlsx.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
        if (!rawRows || rawRows.length === 0) {
          throw new Error('Lembar kerja kosong.');
        }

        let headerRowIdx = -1;
        let maxMatchedScore = 0;
        for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
          const row = rawRows[r];
          if (!Array.isArray(row)) continue;
          let score = 0;
          row.forEach((cell) => {
            const clean = normalizeHeaderKey(cell);
            if (clean && Object.values(COLUMN_ALIASES).some((aliases) => aliases.includes(clean))) {
              score++;
            }
          });
          if (score > maxMatchedScore) {
            maxMatchedScore = score;
            headerRowIdx = r;
          }
        }

        if (headerRowIdx === -1) headerRowIdx = 0;

        const headerRow = rawRows[headerRowIdx] || [];
        const colMap: Record<string, number> = {};
        headerRow.forEach((cell, colIdx) => {
          const clean = normalizeHeaderKey(cell);
          if (!clean) return;
          for (const [canonicalKey, aliases] of Object.entries(COLUMN_ALIASES)) {
            if (aliases.includes(clean) && colMap[canonicalKey] === undefined) {
              colMap[canonicalKey] = colIdx;
              break;
            }
          }
        });

        const getVal = (row: any[], key: string): string => {
          const idx = colMap[key];
          if (idx === undefined || row[idx] === undefined || row[idx] === null) return '';
          return String(row[idx]).trim();
        };

        let currentItem: KatalogItem | null = null;
        let currentKode = '';
        let currentNama = '';
        const parsedItems: KatalogItem[] = [];
        let idCounter = 1;
        let lastWarna = '';

        for (let r = headerRowIdx + 1; r < rawRows.length; r++) {
          const row = rawRows[r];
          if (!Array.isArray(row) || row.length === 0) continue;
          const isRowEmpty = row.every((cell) => String(cell || '').trim() === '');
          if (isRowEmpty) continue;

          const no = getVal(row, 'nomor');
          const kodeProduk = getVal(row, 'kode_produk');
          const namaProduk = getVal(row, 'deskripsi');
          const priceRaw = getVal(row, 'price');
          let warna = getVal(row, 'warna');
          let size = getVal(row, 'size');
          let sku = getVal(row, 'sku');
          const qtyRaw = getVal(row, 'qty');
          const explicitImg = getVal(row, 'image_url');
          const pubOnline = getVal(row, 'publish_online');
          const pubOffline = getVal(row, 'publish_offline');

          const foundDrawingImg = rowImages[r] || rowImages[r - 1] || rowImages[r + 1] || explicitImg;
          const qty = parseInt(qtyRaw, 10) || 0;

          let priceClean = priceRaw;
          if (priceClean) {
            const numOnly = priceClean.replace(/[^0-9]/g, '');
            if (numOnly) priceClean = Number(numOnly).toLocaleString('id-ID');
          }

          // Tentukan Nama Produk Bersih yang konsisten
          let computedProdName = '';
          if (namaProduk && kodeProduk) {
            if (namaProduk.toLowerCase().includes(kodeProduk.toLowerCase())) {
              computedProdName = namaProduk;
            } else {
              computedProdName = `${kodeProduk} - ${namaProduk}`;
            }
          } else if (namaProduk) {
            computedProdName = namaProduk;
          } else if (kodeProduk) {
            computedProdName = kodeProduk;
          } else if (sku && !currentItem) {
            computedProdName = `Produk ${sku}`;
          }

          // Deteksi Produk Baru vs Baris Varian
          const isExplicitNewNo = Boolean(no && !isNaN(parseInt(no, 10)) && (!currentItem || currentItem.nomor !== no));
          const isNewDrawingImg = Boolean(foundDrawingImg && currentItem && currentItem.image_url && foundDrawingImg !== currentItem.image_url);
          const isNewKode = Boolean(kodeProduk && currentKode && kodeProduk.toUpperCase() !== currentKode.toUpperCase());
          const isNewNama = Boolean(namaProduk && currentNama && namaProduk.toUpperCase() !== currentNama.toUpperCase() && (!kodeProduk || isNewKode));

          const isNewProduct = !currentItem || isExplicitNewNo || isNewDrawingImg || isNewKode || (isNewNama && isExplicitNewNo);

          if (isNewProduct) {
            if (currentItem && currentItem.variants.length > 0) {
              parsedItems.push(currentItem);
            }

            const initialName = computedProdName || (sku ? `Produk ${sku}` : `Item #${idCounter}`);

            currentItem = {
              id: `KAT-${Date.now()}-${idCounter++}`,
              nomor: no || (currentItem ? String(Number(currentItem.nomor || 0) + 1) : '1'),
              deskripsi: initialName,
              price: priceClean || '',
              variants: [],
              image_url: foundDrawingImg || '',
              catalog_name: suggested,
              publish_online: pubOnline || undefined,
              publish_offline: pubOffline || undefined,
            };
            currentKode = kodeProduk;
            currentNama = namaProduk;
            lastWarna = '';
          }

          if (currentItem) {
            if (pubOnline && !currentItem.publish_online) {
              currentItem.publish_online = pubOnline;
            }
            if (pubOffline && !currentItem.publish_offline) {
              currentItem.publish_offline = pubOffline;
            }
            if (foundDrawingImg && !currentItem.image_url) {
              currentItem.image_url = foundDrawingImg;
            }
            if (computedProdName && (!currentItem.deskripsi || currentItem.deskripsi.startsWith('Item #') || currentItem.deskripsi.startsWith('Produk '))) {
              currentItem.deskripsi = computedProdName;
            }
            if (priceClean && !currentItem.price) {
              currentItem.price = priceClean;
            }
            if (warna) {
              lastWarna = warna;
            } else {
              warna = lastWarna;
            }

            // Normalisasi SKU jika kolom SKU kosong tapi ada Kode/Nama + Warna + Size
            const cleanKodeForSku = currentKode || currentItem.deskripsi || 'ITEM';
            const cleanWarnaForSku = (warna || 'ALL').trim().toUpperCase();
            const cleanSizeForSku = (size || 'ALL').trim().toUpperCase();
            const fallbackSku = `${cleanKodeForSku.replace(/[^a-zA-Z0-9]/g, '')}-${cleanWarnaForSku.replace(/[^a-zA-Z0-9]/g, '')}-${cleanSizeForSku.replace(/[^a-zA-Z0-9]/g, '')}`;

            const finalSku = sku ? sku.trim() : fallbackSku;

            if (finalSku || (warna && size) || qty > 0) {
              const isDuplicate = currentItem.variants.some(
                (v) => v.sku && finalSku && v.sku.toUpperCase() === finalSku.toUpperCase() && v.size.toUpperCase() === (size || 'Default').toUpperCase()
              );
              if (!isDuplicate) {
                currentItem.variants.push({
                  warna: warna || '-',
                  size: size || 'Default',
                  sku: finalSku,
                  qty: qty,
                });
              }
            }
          }
        }

        if (currentItem && currentItem.variants.length > 0) {
          parsedItems.push(currentItem);
        }

        if (parsedItems.length === 0) {
          throw new Error('Tidak ada baris data produk yang valid ditemukan.');
        }

        // Buka modal upload untuk menentukan nama katalog & pilihan new / replace
        setParsedUploadItems(parsedItems);
        setSuggestedUploadName(suggested);
        setUploadFileName(fileName);
        setUploadModalOpen(true);
      } catch (err: any) {
        console.error('Error importing Excel:', err);
        onNotify(`Gagal membaca Excel: ${err?.message || 'Format tidak valid'}`, 'error');
      } finally {
        setIsParsingExcel(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Simpan Katalog dari Modal Upload
  const handleConfirmSaveUpload = async (
    catalogName: string,
    mode: 'new' | 'replace',
    targetBatchId?: string
  ) => {
    const cleanName = catalogName.trim();
    setUploadProgressMsg('Menyiapkan foto katalog...');

    // Cek apakah ada gambar yang perlu diupload ke Google Drive
    const itemsToSave: KatalogItem[] = [];
    const itemsWithImages = parsedUploadItems.filter(
      (it) => it.image_url && it.image_url.startsWith('data:image')
    );

    if (itemsWithImages.length > 0) {
      setUploadProgressMsg(`Mengunggah 0/${itemsWithImages.length} foto ke Google Drive...`);
      let uploadedCount = 0;

      for (const item of parsedUploadItems) {
        if (item.image_url && item.image_url.startsWith('data:image')) {
          setUploadProgressMsg(
            `Mengunggah foto produk ${uploadedCount + 1}/${itemsWithImages.length} ke Google Drive...`
          );
          const gdriveRes = await uploadKatalogImageToGdrive(
            item.image_url,
            item.nomor || item.deskripsi || cleanName
          );
          const finalUrl =
            gdriveRes.success && gdriveRes.url && !gdriveRes.url.startsWith('data:')
              ? gdriveRes.url
              : item.image_url;
          itemsToSave.push({
            ...item,
            image_url: finalUrl,
          });
          uploadedCount++;
        } else {
          itemsToSave.push(item);
        }
      }
    } else {
      itemsToSave.push(...parsedUploadItems);
    }

    setUploadProgressMsg('Menyimpan data katalog ke database...');
    let updatedBatches: KatalogBatch[] = [...batches];

    if (mode === 'replace' && targetBatchId) {
      // Gantikan items di batch yang sudah ada
      updatedBatches = updatedBatches.map((b) => {
        if (b.id === targetBatchId) {
          return {
            ...b,
            name: cleanName,
            updated_at: new Date().toISOString(),
            items: itemsToSave.map((it) => ({
              ...it,
              catalog_id: b.id,
              catalog_name: cleanName,
            })),
          };
        }
        return b;
      });
      await saveBatches(
        updatedBatches,
        `Katalog "${cleanName}" berhasil diperbarui (replace) dengan ${itemsToSave.length} produk (Foto di Google Drive)!`
      );
    } else {
      // Tambah batch baru
      const newBatchId = `batch-${Date.now()}`;
      const newBatch: KatalogBatch = {
        id: newBatchId,
        name: cleanName,
        created_at: new Date().toISOString(),
        items: itemsToSave.map((it) => ({
          ...it,
          catalog_id: newBatchId,
          catalog_name: cleanName,
        })),
      };
      updatedBatches.push(newBatch);
      // Tambahkan ke seleksi aktif
      setSelectedCatalogIds((prev) => [...prev, newBatchId]);
      await saveBatches(
        updatedBatches,
        `Katalog "${cleanName}" berhasil disimpan dengan ${itemsToSave.length} produk (Foto di Google Drive)!`
      );
    }
    setUploadProgressMsg('');
  };

  // Admin Aksi: Hapus Katalog
  const handleDeleteBatch = async (batchId: string, batchName: string) => {
    if (!window.confirm(`Yakin ingin menghapus seluruh Katalog "${batchName}" beserta seluruh produk di dalamnya?`)) {
      return;
    }
    const nextBatches = batches.filter((b) => b.id !== batchId);
    setSelectedCatalogIds((prev) => prev.filter((id) => id !== batchId));
    await saveBatches(nextBatches, `Katalog "${batchName}" berhasil dihapus.`);
  };

  // Admin Aksi: Buka Modal Edit Katalog & Atur Massal Produk
  const handleOpenEditBatch = (batch: KatalogBatch) => {
    setBatchToEdit(batch);
    setBatchEditModalOpen(true);
  };

  // Admin Aksi: Simpan Perubahan Katalog & Mass Update Produk
  const handleSaveBatchEdit = async (batchId: string, payload: BatchEditPayload) => {
    let affectedCount = 0;
    const nextBatches = batches.map((b) => {
      if (b.id === batchId) {
        const newName = payload.name.trim();
        const updatedItems = b.items.map((it) => {
          const updatedItem = { ...it, catalog_name: newName };

          if (payload.applyMode === 'all') {
            updatedItem.publish_online = payload.publish_online || '';
            updatedItem.publish_offline = payload.publish_offline || '';
            affectedCount++;
          } else if (payload.applyMode === 'empty_only') {
            let changed = false;
            if (!updatedItem.publish_online && payload.publish_online) {
              updatedItem.publish_online = payload.publish_online;
              changed = true;
            }
            if (!updatedItem.publish_offline && payload.publish_offline) {
              updatedItem.publish_offline = payload.publish_offline;
              changed = true;
            }
            if (changed) affectedCount++;
          }

          if (payload.applyDescriptionToProducts && payload.description) {
            updatedItem.deskripsi = payload.description;
          }

          return updatedItem;
        });

        return {
          ...b,
          name: newName,
          description: payload.description,
          publish_online: payload.publish_online,
          publish_offline: payload.publish_offline,
          items: updatedItems,
        };
      }
      return b;
    });

    await saveBatches(
      nextBatches,
      payload.applyMode !== 'none' && affectedCount > 0
        ? `Katalog "${payload.name}" dan ${affectedCount} produk berhasil diperbarui!`
        : `Katalog "${payload.name}" berhasil diperbarui!`
    );
  };

  // Admin Aksi: Replace batch langsung via klik tombol "Replace" di header katalog
  const handleTriggerReplace = (batchId: string) => {
    setReplaceTargetId(batchId);
    fileInputRef.current?.click();
  };

  // Admin Aksi: Hapus 1 Produk dalam katalog
  const handleDeleteProduct = async (batchId: string, itemId: string) => {
    if (!window.confirm('Hapus produk ini dari katalog?')) return;
    const nextBatches = batches.map((b) => {
      if (b.id === batchId) {
        return {
          ...b,
          items: b.items.filter((it) => it.id !== itemId),
        };
      }
      return b;
    });
    await saveBatches(nextBatches, 'Produk dihapus dari katalog');
  };

  // Buat Katalog Baru Manual Tanpa Excel
  const handleCreateBatch = async (
    batchName: string,
    description?: string,
    publishOnline?: string,
    publishOffline?: string
  ) => {
    const newBatchId = `batch-${Date.now()}`;
    const newBatch: KatalogBatch = {
      id: newBatchId,
      name: batchName.trim(),
      description,
      publish_online: publishOnline,
      publish_offline: publishOffline,
      created_at: new Date().toISOString(),
      items: [],
    };
    const nextBatches = [...batches, newBatch];
    setSelectedCatalogIds((prev) => [...prev, newBatchId]);
    await saveBatches(nextBatches, `Katalog "${batchName.trim()}" berhasil dibuat!`);
  };

  // Buka Modal Tambah Produk Baru
  const handleOpenAddProduct = (batchId?: string) => {
    const targetBatch = batches.find((b) => b.id === batchId) || batches[0];
    if (!targetBatch) {
      onNotify('Belum ada katalog. Silakan buat katalog baru terlebih dahulu.', 'warning');
      setCreateBatchModalOpen(true);
      return;
    }
    setProductModalMode('add');
    setProductModalBatchId(targetBatch.id);
    setProductModalBatchName(targetBatch.name);
    setProductModalItemToEdit(null);
    setProductModalOpen(true);
  };

  // Buka Modal Edit Produk
  const handleOpenEditProduct = (batch: KatalogBatch, item: KatalogItem) => {
    setProductModalMode('edit');
    setProductModalBatchId(batch.id);
    setProductModalBatchName(batch.name);
    setProductModalItemToEdit(item);
    setProductModalOpen(true);
  };

  // Simpan Produk (Tambah Baru atau Update Hasil Edit)
  const handleSaveProduct = async (targetBatchId: string, item: KatalogItem) => {
    let nextBatches = [...batches];
    const targetBatch = nextBatches.find((b) => b.id === targetBatchId);
    if (!targetBatch) {
      throw new Error('Katalog target tidak ditemukan');
    }

    if (productModalMode === 'edit' && productModalItemToEdit) {
      const oldBatchId = productModalBatchId;
      if (oldBatchId !== targetBatchId) {
        // Jika dipindah ke katalog lain
        nextBatches = nextBatches.map((b) => {
          if (b.id === oldBatchId) {
            return { ...b, items: b.items.filter((it) => it.id !== item.id) };
          }
          if (b.id === targetBatchId) {
            return { ...b, items: [...b.items, item] };
          }
          return b;
        });
      } else {
        // Update dalam batch yang sama
        nextBatches = nextBatches.map((b) => {
          if (b.id === targetBatchId) {
            return {
              ...b,
              items: b.items.map((it) => (it.id === item.id ? item : it)),
            };
          }
          return b;
        });
      }
      await saveBatches(nextBatches, `Produk "${item.deskripsi}" berhasil diperbarui!`);
    } else {
      // Tambah baru ke targetBatch
      nextBatches = nextBatches.map((b) => {
        if (b.id === targetBatchId) {
          return {
            ...b,
            items: [...b.items, item],
          };
        }
        return b;
      });
      await saveBatches(nextBatches, `Produk "${item.deskripsi}" berhasil ditambahkan ke Katalog ${targetBatch.name}!`);
    }
  };

  // Upload Foto per Kartu Produk (Langsung kompres & upload ke Google Drive)
  const handleUploadImageFile = async (itemId: string, file: File | Blob) => {
    const targetItem = allFilteredItems.find((it) => it.id === itemId);
    const itemName = targetItem?.nomor || targetItem?.deskripsi || 'produk-katalog';

    setUploadingImageId(itemId);
    try {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const base64 = ev.target?.result as string;
        if (!base64) {
          setUploadingImageId(null);
          setTargetImageUploadItemId(null);
          return;
        }

        onNotify('Mengompres dan mengunggah foto ke Google Drive Cloud...', 'info');
        const gdriveRes = await uploadKatalogImageToGdrive(base64, itemName);
        const finalImageUrl =
          gdriveRes.success && gdriveRes.url && !gdriveRes.url.startsWith('data:')
            ? gdriveRes.url
            : await compressImageDataUri(base64, 800, 0.8);

        const nextBatches = batches.map((b) => ({
          ...b,
          items: b.items.map((it) =>
            it.id === itemId ? { ...it, image_url: finalImageUrl } : it
          ),
        }));
        await saveBatches(
          nextBatches,
          gdriveRes.success && gdriveRes.url && !gdriveRes.url.startsWith('data:')
            ? 'Foto produk berhasil disimpan di Google Drive!'
            : 'Foto produk disimpan secara lokal'
        );
        setUploadingImageId(null);
        setTargetImageUploadItemId(null);
      };
      reader.readAsDataURL(file);
    } catch {
      onNotify('Gagal memproses gambar', 'error');
      setUploadingImageId(null);
      setTargetImageUploadItemId(null);
    }
  };

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !targetImageUploadItemId) return;
    await handleUploadImageFile(targetImageUploadItemId, file);
    if (e.target) e.target.value = '';
  };

  // Migrasi Otomatis Seluruh Foto Base64 ke Google Drive Cloud & Bersihkan Supabase
  const handleMigrateAllImagesToGdrive = async () => {
    if (totalBase64Count === 0) {
      onNotify('Semua foto sudah tersimpan di Google Drive Cloud!', 'info');
      return;
    }

    if (
      !window.confirm(
        `Terdapat ${totalBase64Count} foto produk yang masih dalam format lokal/base64.\n\nMigrasikan sekarang ke Google Drive dan bersihkan data base64 dari Supabase?`
      )
    ) {
      return;
    }

    setIsMigratingToGdrive(true);
    setMigrationStatus('Memulai migrasi foto ke Google Drive Cloud...');
    try {
      const result = await syncAndMigrateKatalogImagesToGdrive(
        batches,
        (current, total, itemName) => {
          setMigrationStatus(`Mengunggah foto ${current}/${total}: ${itemName}...`);
        }
      );

      setBatches(result.updatedBatches);
      await saveBatches(result.updatedBatches);

      if (result.errors.length === 0) {
        onNotify(
          `Sukses! ${result.migratedCount} foto berhasil dimigrasikan ke Google Drive Cloud dan database dibersihkan!`,
          'success'
        );
      } else {
        onNotify(
          `Migrasi selesai (${result.migratedCount} foto), beberapa catatan: ${result.errors.slice(0, 2).join(', ')}`,
          'warning'
        );
      }
    } catch (err: any) {
      console.error('Migration error:', err);
      onNotify(`Gagal melakukan migrasi: ${err?.message || 'Error tidak diketahui'}`, 'error');
    } finally {
      setIsMigratingToGdrive(false);
      setMigrationStatus('');
    }
  };

  // Toggle Hide/Unhide Tabel Rincian Varian (Global & Per-Kartu)
  const handleToggleGlobalHideVariants = () => {
    const nextHide = !hideVariants;
    setHideVariants(nextHide);
    setCardTableVisible({});
  };

  const handleToggleCardTable = (productId: string) => {
    setCardTableVisible((prev) => {
      const current = prev[productId] !== undefined ? prev[productId] : !hideVariants;
      return { ...prev, [productId]: !current };
    });
  };

  // Lightbox Handlers
  const handleOpenLightbox = (item: KatalogItem) => {
    setLightboxItem(item);
    setLightboxOpen(true);
  };

  const handleSelectNextLightbox = () => {
    if (!lightboxItem) return;
    const currentIndex = allFilteredItems.findIndex((it) => it.id === lightboxItem.id);
    if (currentIndex >= 0 && currentIndex < allFilteredItems.length - 1) {
      setLightboxItem(allFilteredItems[currentIndex + 1]);
    } else if (allFilteredItems.length > 0) {
      setLightboxItem(allFilteredItems[0]);
    }
  };

  const handleSelectPrevLightbox = () => {
    if (!lightboxItem) return;
    const currentIndex = allFilteredItems.findIndex((it) => it.id === lightboxItem.id);
    if (currentIndex > 0) {
      setLightboxItem(allFilteredItems[currentIndex - 1]);
    } else if (allFilteredItems.length > 0) {
      setLightboxItem(allFilteredItems[allFilteredItems.length - 1]);
    }
  };

  // Muat Ulang Data Bawaan Excel 325B
  const handleResetTo325B = async () => {
    if (!window.confirm('Muat kembali katalog default 325B OFFLINE (5 produk)?')) return;
    const defaultBatch = getDefaultInitialBatch();
    const nextBatches = [
      defaultBatch,
      ...batches.filter((b) => b.name.trim().toLowerCase() !== '325 b'),
    ];
    setSelectedCatalogIds(nextBatches.map((b) => b.id));
    await saveBatches(nextBatches, 'Katalog 325 B berhasil dimuat!');
  };

  // Template Excel Download
  const handleDownloadTemplate = () => {
    const templateData = [
      { NO: 1, 'NAMA PRODUK': 'Quisera Top', HARGA: 315000, WARNA: 'Brown', SIZE: 'Default', SKU: 'F26ITN816BN', QTY: 78 },
      { NO: '', 'NAMA PRODUK': '', HARGA: '', WARNA: 'Grey', SIZE: 'Default', SKU: 'F26ITN816GY', QTY: 100 },
      { NO: '', 'NAMA PRODUK': '', HARGA: '', WARNA: 'Latte', SIZE: 'Default', SKU: 'F26ITN816LA', QTY: 100 },
      { NO: 2, 'NAMA PRODUK': 'Saveria Top', HARGA: 395000, WARNA: 'Black', SIZE: 'Default', SKU: 'F26ITN817BK', QTY: 100 },
      { NO: '', 'NAMA PRODUK': '', HARGA: '', WARNA: 'White', SIZE: 'Default', SKU: 'F26ITN817WH', QTY: 100 },
    ];
    const ws = xlsx.utils.json_to_sheet(templateData);
    const wb = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(wb, ws, 'Template Katalog');
    xlsx.writeFile(wb, 'Template_Katalog_Produk_WMS.xlsx');
    onNotify('Template Excel berhasil diunduh', 'success');
  };

  // Palet Warna Batch
  const getBatchPalette = (batchName: string) => {
    let hash = 0;
    for (let i = 0; i < batchName.length; i++) {
      hash = batchName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % CATALOG_COLOR_PALETTES.length;
    return CATALOG_COLOR_PALETTES[idx];
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      {/* Input File Tersembunyi */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        accept=".xlsx, .xls"
        className="hidden"
      />
      <input
        type="file"
        ref={imageInputRef}
        onChange={handleImageFileChange}
        accept="image/*"
        className="hidden"
      />

      {/* HEADER UTAMA & STATUS STORAGE */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl shrink-0">
              <BookOpen className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
                <span>Katalog Produk WMS</span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Katalog model pakaian & rincian varian multi-koleksi, cetak barcode thermal dan cetak katalog produk.
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons Toolbar Utama (Rapi, Sejajar, Tidak Berantakan) */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Tombol Migrasi Gambar Base64 ke GDrive (jika ada data base64 lama) */}
          {totalBase64Count > 0 && (
            <button
              type="button"
              onClick={handleMigrateAllImagesToGdrive}
              disabled={isMigratingToGdrive}
              className="px-3 py-2 text-xs font-bold text-amber-800 dark:text-amber-200 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-amber-300 dark:border-amber-700"
              title="Pindahkan foto format base64 lama ke Google Drive Cloud"
            >
              {isMigratingToGdrive ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Cloud className="w-3.5 h-3.5 text-amber-700 dark:text-amber-300" />
              )}
              <span>Migrasi GDrive ({totalBase64Count})</span>
            </button>
          )}

          {/* Tombol Cetak Barcode */}
          <button
            type="button"
            onClick={() => {
              setBarcodeTargetItem(null);
              setBarcodeTargetItems(allFilteredItems);
              setBarcodeModalOpen(true);
            }}
            disabled={allFilteredItems.length === 0}
            className="px-3 py-2 text-xs font-bold text-violet-700 dark:text-violet-300 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-violet-200 dark:border-violet-800 shadow-2xs disabled:opacity-50"
            title="Cetak stiker barcode thermal 50x20mm"
          >
            <QrCode className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <span>Cetak Barcode ({allFilteredItems.length})</span>
          </button>

          {/* Tombol Cetak Katalog */}
          <button
            type="button"
            onClick={() => {
              setA4TargetBatchIds(selectedCatalogIds.length > 0 ? selectedCatalogIds : batches.map((b) => b.id));
              setA4ModalOpen(true);
            }}
            disabled={batches.length === 0}
            className="px-3 py-2 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-blue-200 dark:border-blue-800 shadow-2xs disabled:opacity-50"
            title="Pilih dan cetak katalog produk dalam format dokumen A4 / PDF"
          >
            <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
            <span>Cetak Katalog</span>
          </button>

          {/* Tombol Buat Katalog Baru Manual */}
          {isAdmin && (
            <button
              type="button"
              onClick={() => setCreateBatchModalOpen(true)}
              className="px-3.5 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-indigo-200 dark:border-indigo-800 shadow-2xs"
              title="Buat katalog baru secara manual tanpa perlu upload Excel"
            >
              <FolderPlus className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>+ Buat Katalog</span>
            </button>
          )}

          {/* Tombol Tambah Produk Manual */}
          {isAdmin && batches.length > 0 && (
            <button
              type="button"
              onClick={() => handleOpenAddProduct()}
              className="px-3.5 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-emerald-200 dark:border-emerald-800 shadow-2xs"
              title="Tambah produk baru ke dalam katalog"
            >
              <Plus className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>+ Tambah Produk</span>
            </button>
          )}

          {/* Tombol Upload Excel */}
          <button
            type="button"
            onClick={() => {
              setReplaceTargetId(null);
              fileInputRef.current?.click();
            }}
            disabled={isParsingExcel}
            className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs hover:shadow-md disabled:opacity-50"
          >
            {isParsingExcel ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Membaca Excel...</span>
              </>
            ) : (
              <>
                <UploadCloud className="w-4 h-4" />
                <span>Upload Excel</span>
              </>
            )}
          </button>

          {/* Template & Reset Icons */}
          <div className="flex items-center gap-1 border-l border-slate-200 dark:border-slate-700 pl-1.5 ml-0.5">
            <button
              onClick={handleDownloadTemplate}
              type="button"
              className="p-2 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
              title="Unduh Template Excel"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={handleResetTo325B}
              type="button"
              className="p-2 text-slate-500 hover:text-emerald-700 bg-slate-100 hover:bg-emerald-50 dark:bg-slate-800 dark:hover:bg-emerald-950/40 rounded-xl transition-all cursor-pointer border border-slate-200 dark:border-slate-700"
              title="Muat Ulang Data Bawaan 325 B"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* BANNER STATUS MIGRASI FOTO KE GOOGLE DRIVE */}
      {isMigratingToGdrive && (
        <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 p-4 rounded-2xl flex items-center gap-3 animate-pulse">
          <RefreshCw className="w-5 h-5 animate-spin text-amber-600 dark:text-amber-400 shrink-0" />
          <div className="flex-1">
            <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200">
              Proses Migrasi Foto ke Google Drive Berjalan
            </h4>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
              {migrationStatus || 'Sedang mengompresi dan mengunggah foto ke Google Drive Cloud...'}
            </p>
          </div>
        </div>
      )}

      {/* FILTER & KONTROL TAMPILAN (RAPI, 2 BARIS TERATUR) */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        {/* Baris 1: Pencarian & Kontrol Tampilan Sejajar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Input Pencarian */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari nama produk, nomor katalog, warna, SKU..."
              className="w-full pl-10 pr-8 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Tombol Kontrol: Hide/Unhide Tabel Varian & Grup per Katalog */}
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {/* Toggle Sembunyikan / Tampilkan Tabel Varian */}
            <button
              type="button"
              onClick={handleToggleGlobalHideVariants}
              className={`flex-1 sm:flex-none px-3 py-2 text-xs font-bold rounded-xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
                hideVariants
                  ? 'bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border-amber-300 dark:border-amber-700 shadow-2xs'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
              }`}
              title="Sembunyikan atau tampilkan tabel rincian Warna, Size, SKU, dan Qty pada semua kartu"
            >
              {hideVariants ? (
                <>
                  <EyeOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  <span>Tabel Varian: Ditutup</span>
                </>
              ) : (
                <>
                  <Eye className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 shrink-0" />
                  <span>Tabel Varian: Dibuka</span>
                </>
              )}
            </button>

            {/* Toggle Dikelompokkan per Katalog vs Tampilan Gabung */}
            <button
              type="button"
              onClick={() => setGroupByCatalog(!groupByCatalog)}
              className="flex-1 sm:flex-none px-3 py-2 text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap"
            >
              <Package className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span>{groupByCatalog ? 'Per Katalog' : 'Semua Grid'}</span>
            </button>
          </div>
        </div>

        {/* Baris 2: Filter Dropdown Katalog & Filter Saluran Publish */}
        <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <KatalogFilterDropdown
              batches={batches}
              selectedCatalogIds={selectedCatalogIds}
              onToggleCatalog={toggleSelectCatalog}
              onSelectAll={selectAllCatalogs}
              onSelectOnly={selectOnlyCatalog}
              getBatchPalette={getBatchPalette}
            />

            {/* Selector Urutan Katalog */}
            <div className="relative inline-flex items-center">
              <select
                id="katalog-sort-select"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value as KatalogSortOrder)}
                className="appearance-none pl-8 pr-7 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-2xs hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Urutan Tampilan Katalog Produk"
              >
                <option value="newest">Terbaru → Terlama (Angka Besar)</option>
                <option value="oldest">Terlama → Terbaru (Angka Kecil)</option>
                <option value="name_asc">Nama A → Z</option>
                <option value="name_desc">Nama Z → A</option>
              </select>
              <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <ChevronDown className="w-3 h-3 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Filter Channel / Saluran Rilis */}
          <div className="flex flex-wrap items-center gap-1.5 ml-auto">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" />
              <span>Saluran:</span>
            </span>

            {/* Semua */}
            <button
              type="button"
              onClick={() => setChannelFilter('all')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                channelFilter === 'all'
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border-slate-900 dark:border-slate-100 shadow-2xs'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>Semua</span>
              <span className="text-[10px] opacity-75 font-normal">({channelCounts.all})</span>
            </button>

            {/* Online (Semua) */}
            <button
              type="button"
              onClick={() => setChannelFilter('online')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                channelFilter === 'online'
                  ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                  : 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-100'
              }`}
              title="Tampilkan semua produk yang tayang di Online (Online Only + Online & Offline)"
            >
              <Globe className="w-3 h-3" />
              <span>Online</span>
              <span className="text-[10px] opacity-80 font-normal">({channelCounts.online})</span>
            </button>

            {/* Offline (Semua) */}
            <button
              type="button"
              onClick={() => setChannelFilter('offline')}
              className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                channelFilter === 'offline'
                  ? 'bg-amber-600 text-white border-amber-600 shadow-2xs'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100'
              }`}
              title="Tampilkan semua produk yang tayang di Butik / Store Offline (Offline Only + Online & Offline)"
            >
              <Store className="w-3 h-3" />
              <span>Offline</span>
              <span className="text-[10px] opacity-80 font-normal">({channelCounts.offline})</span>
            </button>

            {/* Online Only */}
            <button
              type="button"
              onClick={() => setChannelFilter('online_only')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                channelFilter === 'online_only'
                  ? 'bg-cyan-600 text-white border-cyan-600 shadow-2xs'
                  : 'bg-cyan-50/60 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100'
              }`}
              title="Tampilkan produk yang HANYA dirilis di Online"
            >
              <span>Online Only</span>
              <span className="text-[10px] opacity-80 font-normal">({channelCounts.online_only})</span>
            </button>

            {/* Offline Only */}
            <button
              type="button"
              onClick={() => setChannelFilter('offline_only')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                channelFilter === 'offline_only'
                  ? 'bg-orange-600 text-white border-orange-600 shadow-2xs'
                  : 'bg-orange-50/60 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 border-orange-200 dark:border-orange-800 hover:bg-orange-100'
              }`}
              title="Tampilkan produk yang HANYA dirilis di Offline / Butik"
            >
              <span>Offline Only</span>
              <span className="text-[10px] opacity-80 font-normal">({channelCounts.offline_only})</span>
            </button>

            {/* Online & Offline */}
            <button
              type="button"
              onClick={() => setChannelFilter('both')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                channelFilter === 'both'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100'
              }`}
              title="Tampilkan produk yang dirilis di Online & Offline"
            >
              <span>Online & Offline</span>
              <span className="text-[10px] opacity-80 font-normal">({channelCounts.both})</span>
            </button>

            {/* Belum Terjadwal */}
            <button
              type="button"
              onClick={() => setChannelFilter('none')}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                channelFilter === 'none'
                  ? 'bg-slate-700 text-white border-slate-700 shadow-2xs'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
              }`}
              title="Tampilkan produk yang belum ditentukan tanggal rilisnya"
            >
              <Calendar className="w-3 h-3" />
              <span>Belum Ditentukan</span>
              <span className="text-[10px] opacity-80 font-normal">({channelCounts.none})</span>
            </button>
          </div>
        </div>
      </div>

      {/* STATISTIK RINGKASAN AKTIF */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs text-slate-600 dark:text-slate-400 px-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <span className="inline-flex items-center gap-1">
            Menampilkan: <strong className="text-slate-900 dark:text-slate-100 font-bold">{filteredBatches.length}</strong> Katalog
          </span>
          <span className="text-slate-300 dark:text-slate-600 hidden xs:inline">•</span>
          <span className="inline-flex items-center gap-1">
            Total Produk: <strong className="text-slate-900 dark:text-slate-100 font-bold">{allFilteredItems.length}</strong> Item
          </span>
          <span className="text-slate-300 dark:text-slate-600 hidden xs:inline">•</span>
          <span className="inline-flex items-center gap-1">
            Total Varian: <strong className="text-slate-900 dark:text-slate-100 font-bold">{totalFilteredVariants}</strong>
          </span>
          <span className="text-slate-300 dark:text-slate-600 hidden xs:inline">•</span>
          <span className="inline-flex items-center gap-1">
            Stok Fisik: <strong className="text-slate-900 dark:text-slate-100 font-bold">{totalFilteredQty}</strong> pcs
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[11px] text-emerald-700 dark:text-emerald-400 font-semibold">
            Tersimpan Permanen di Cloud & Lokal
          </span>
        </div>
      </div>

      {/* KONTEN KATALOG PRODUK */}
      {isLoading ? (
        <div className="py-20 text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600 dark:text-slate-400">Memuat data katalog...</p>
        </div>
      ) : filteredBatches.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 p-12 text-center rounded-2xl border border-slate-200 dark:border-slate-800 space-y-4">
          <BookOpen className="w-12 h-12 text-slate-400 mx-auto" />
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-200">Tidak Ada Produk Ditemukan</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {searchQuery ? 'Coba ubah kata kunci pencarian Anda' : 'Unggah file Excel katalog atau muat ulang data default.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={handleResetTo325B}
              type="button"
              className="px-4 py-2 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl border border-emerald-200"
            >
              Muat Data Excel 325 B
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              type="button"
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl"
            >
              Upload Excel Baru
            </button>
          </div>
        </div>
      ) : groupByCatalog ? (
        /* TAMPILAN DIKELOMPOKKAN PER KATALOG */
        <div className="space-y-8">
          {filteredBatches.map((batch) => {
            const palette = getBatchPalette(batch.name);
            const batchVariants = batch.items.reduce((acc, it) => acc + (it.variants?.length || 0), 0);
            const batchQty = batch.items.reduce(
              (acc, it) => acc + (it.variants?.reduce((vSum, v) => vSum + (v.qty || 0), 0) || 0),
              0
            );

            return (
              <div key={batch.id} className="space-y-4">
                {/* Header Tiap Katalog */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl border bg-slate-50 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className={`px-3 py-1 rounded-xl text-xs font-black tracking-wider uppercase border shadow-xs ${palette.bg} ${palette.text} ${palette.border}`}
                      >
                        Katalog {batch.name}
                      </span>

                      {/* Badge Jadwal Publish Batch jika ada */}
                      {batch.publish_online && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60">
                          <Globe className="w-3 h-3 text-blue-600 dark:text-blue-400" />
                          <span>Online: {batch.publish_online}</span>
                        </span>
                      )}
                      {batch.publish_offline && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60">
                          <Store className="w-3 h-3 text-amber-600 dark:text-amber-400" />
                          <span>Offline: {batch.publish_offline}</span>
                        </span>
                      )}

                      <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                        <strong>{batch.items.length}</strong> Model Produk • <strong>{batchVariants}</strong> Varian • Total <strong>{batchQty}</strong> pcs
                      </div>
                    </div>

                    {/* Deskripsi Katalog jika ada */}
                    {batch.description && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-1 italic">
                        "{batch.description}"
                      </p>
                    )}
                  </div>

                  {/* Aksi Per-Katalog */}
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                    {/* Tambah Produk ke Katalog ini */}
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleOpenAddProduct(batch.id)}
                        className="px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap shrink-0"
                        title="Tambah produk baru ke dalam katalog ini"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah Produk</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setBarcodeTargetItem(null);
                        setBarcodeTargetItems(batch.items);
                        setBarcodeModalOpen(true);
                      }}
                      disabled={batch.items.length === 0}
                      className="px-3 py-1.5 text-xs font-bold text-violet-700 dark:text-violet-300 bg-white dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-950/40 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 whitespace-nowrap shrink-0"
                      title="Cetak barcode seluruh produk di katalog ini"
                    >
                      <QrCode className="w-3.5 h-3.5" />
                      <span>Cetak Barcode</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setA4TargetBatchIds([batch.id]);
                        setA4ModalOpen(true);
                      }}
                      disabled={batch.items.length === 0}
                      className="px-3 py-1.5 text-xs font-bold text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 border border-slate-200 dark:border-slate-700 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50 whitespace-nowrap shrink-0"
                      title="Cetak katalog untuk koleksi ini (bisa tambah katalog lain di dalam dialog)"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Cetak Katalog</span>
                    </button>

                    {/* Admin Kontrol: Edit, Replace, Hapus */}
                    {isAdmin && (
                      <div className="flex items-center gap-1 ml-auto sm:ml-1 pl-2 border-l border-slate-300 dark:border-slate-700 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOpenEditBatch(batch)}
                          className="p-1.5 text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-colors cursor-pointer"
                          title="Edit nama, deskripsi & atur massal tanggal publish produk di katalog ini"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTriggerReplace(batch.id)}
                          className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/50 rounded-lg transition-colors cursor-pointer"
                          title="Replace / Timpa katalog ini dengan file Excel baru"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteBatch(batch.id, batch.name)}
                          className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-100 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                          title="Hapus seluruh katalog ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Grid Produk Dalam Katalog Ini / Tampilan Kosong */}
                {batch.items.length === 0 ? (
                  <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 space-y-3">
                    <Package className="w-10 h-10 text-slate-400 mx-auto opacity-50" />
                    <h4 className="text-sm font-bold text-slate-700 dark:text-slate-200">
                      Katalog "{batch.name}" Belum Memiliki Produk
                    </h4>
                    <p className="text-xs text-slate-500 max-w-md mx-auto">
                      Mulai isi katalog dengan menambahkan model pakaian, nama produk, harga jual, foto, dan varian warna/size.
                    </p>
                    {isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleOpenAddProduct(batch.id)}
                        className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>+ Tambah Produk Pertama</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {batch.items.map((prod) => (
                      <ProductCardItem
                        key={prod.id}
                        item={prod}
                        batch={batch}
                        isTableVisible={
                          cardTableVisible[prod.id] !== undefined
                            ? cardTableVisible[prod.id]
                            : !hideVariants
                        }
                        onToggleTable={() => handleToggleCardTable(prod.id)}
                        onPrintBarcode={() => {
                          setBarcodeTargetItem(prod);
                          setBarcodeTargetItems(null);
                          setBarcodeModalOpen(true);
                        }}
                        onUploadPhoto={() => {
                          setTargetImageUploadItemId(prod.id);
                          imageInputRef.current?.click();
                        }}
                        onDropImage={(file) => handleUploadImageFile(prod.id, file)}
                        onEditProduct={() => handleOpenEditProduct(batch, prod)}
                        onDeleteProduct={() => handleDeleteProduct(batch.id, prod.id)}
                        onImageClick={() => handleOpenLightbox(prod)}
                        isUploadingPhoto={uploadingImageId === prod.id}
                        isAdmin={isAdmin}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        /* TAMPILAN GABUNG (GRID TUNGGAL DENGAN BADGE KATALOG) */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allFilteredItems.map((prod) => {
            const parentBatch = batches.find((b) => b.id === prod.catalog_id) || {
              id: prod.catalog_id || 'unknown',
              name: prod.catalog_name || 'KATALOG',
              created_at: '',
              items: [],
            };
            return (
              <ProductCardItem
                key={prod.id}
                item={prod}
                batch={parentBatch}
                isTableVisible={
                  cardTableVisible[prod.id] !== undefined
                    ? cardTableVisible[prod.id]
                    : !hideVariants
                }
                onToggleTable={() => handleToggleCardTable(prod.id)}
                onPrintBarcode={() => {
                  setBarcodeTargetItem(prod);
                  setBarcodeTargetItems(null);
                  setBarcodeModalOpen(true);
                }}
                onUploadPhoto={() => {
                  setTargetImageUploadItemId(prod.id);
                  imageInputRef.current?.click();
                }}
                onDropImage={(file) => handleUploadImageFile(prod.id, file)}
                onEditProduct={() => handleOpenEditProduct(parentBatch, prod)}
                onDeleteProduct={() => handleDeleteProduct(parentBatch.id, prod.id)}
                onImageClick={() => handleOpenLightbox(prod)}
                isUploadingPhoto={uploadingImageId === prod.id}
                isAdmin={isAdmin}
              />
            );
          })}
        </div>
      )}

      {/* MODAL UPLOAD EXCEL & NAMING / REPLACE */}
      <KatalogUploadModal
        isOpen={uploadModalOpen}
        onClose={() => {
          setUploadModalOpen(false);
          setReplaceTargetId(null);
        }}
        parsedItems={parsedUploadItems}
        suggestedName={suggestedUploadName}
        sourceFileName={uploadFileName}
        existingBatches={batches}
        onConfirmSave={handleConfirmSaveUpload}
        uploadProgressMsg={uploadProgressMsg}
      />

      {/* MODAL CETAK BARCODE THERMAL 50x20mm */}
      <KatalogBarcodeModal
        isOpen={barcodeModalOpen}
        onClose={() => setBarcodeModalOpen(false)}
        item={barcodeTargetItem}
        items={barcodeTargetItems}
        onNotify={onNotify}
      />

      {/* MODAL CETAK KATALOG */}
      <KatalogA4PrintModal
        isOpen={a4ModalOpen}
        onClose={() => setA4ModalOpen(false)}
        batches={batches}
        initialSelectedBatchIds={a4TargetBatchIds.length > 0 ? a4TargetBatchIds : selectedCatalogIds}
      />

      {/* MODAL BUAT KATALOG BARU MANUAL */}
      <KatalogCreateModal
        isOpen={createBatchModalOpen}
        onClose={() => setCreateBatchModalOpen(false)}
        existingBatches={batches}
        onCreateBatch={handleCreateBatch}
        onNotify={onNotify}
      />

      {/* MODAL TAMBAH & EDIT PRODUK KATALOG */}
      <KatalogProductModal
        isOpen={productModalOpen}
        mode={productModalMode}
        batchId={productModalBatchId}
        batchName={productModalBatchName}
        availableBatches={batches}
        itemToEdit={productModalItemToEdit}
        onClose={() => setProductModalOpen(false)}
        onSave={handleSaveProduct}
        onDelete={handleDeleteProduct}
        onNotify={onNotify}
      />

      {/* FULLSCREEN IMAGE LIGHTBOX POPUP */}
      <KatalogImageLightbox
        isOpen={lightboxOpen}
        onClose={() => {
          setLightboxOpen(false);
          setLightboxItem(null);
        }}
        item={lightboxItem}
        allItems={allFilteredItems}
        onSelectNext={handleSelectNextLightbox}
        onSelectPrev={handleSelectPrevLightbox}
      />

      {/* MODAL EDIT KATALOG & MASS UPDATE PRODUK */}
      <KatalogBatchEditModal
        isOpen={batchEditModalOpen}
        onClose={() => {
          setBatchEditModalOpen(false);
          setBatchToEdit(null);
        }}
        batch={batchToEdit}
        existingBatches={batches}
        onSave={handleSaveBatchEdit}
        onNotify={onNotify}
      />
    </div>
  );
};

// SUB-KOMPONEN KARTU PRODUK
interface ProductCardItemProps {
  item: KatalogItem;
  batch: KatalogBatch;
  isTableVisible: boolean;
  onToggleTable: () => void;
  onPrintBarcode: () => void;
  onUploadPhoto: () => void;
  onDropImage?: (file: File | Blob) => void;
  onEditProduct: () => void;
  onDeleteProduct: () => void;
  onImageClick: () => void;
  isUploadingPhoto: boolean;
  isAdmin: boolean;
}

const ProductCardItem: React.FC<ProductCardItemProps> = ({
  item,
  batch,
  isTableVisible,
  onToggleTable,
  onPrintBarcode,
  onUploadPhoto,
  onDropImage,
  onEditProduct,
  onDeleteProduct,
  onImageClick,
  isUploadingPhoto,
  isAdmin,
}) => {
  const [isDraggingOverCard, setIsDraggingOverCard] = useState(false);
  const totalQty = item.variants?.reduce((sum, v) => sum + (v.qty || 0), 0) || 0;
  const uniqueColors = Array.from(new Set(item.variants?.map((v) => v.warna).filter(Boolean)));

  const handleCardDragOver = (e: React.DragEvent) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    if (!isDraggingOverCard) setIsDraggingOverCard(true);
  };

  const handleCardDragLeave = (e: React.DragEvent) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverCard(false);
  };

  const handleCardDrop = (e: React.DragEvent) => {
    if (!isAdmin) return;
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOverCard(false);

    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/') && onDropImage) {
        onDropImage(file);
      }
    }
  };

  return (
    <div
      onDragOver={handleCardDragOver}
      onDragLeave={handleCardDragLeave}
      onDrop={handleCardDrop}
      className={`bg-white dark:bg-slate-900 rounded-2xl border shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group relative ${
        isDraggingOverCard
          ? 'border-indigo-500 ring-2 ring-indigo-400 bg-indigo-50/20 scale-[1.01]'
          : 'border-slate-200/80 dark:border-slate-800'
      }`}
    >
      {/* Overlay Animasi saat Drag Foto ke atas Kartu */}
      {isDraggingOverCard && (
        <div className="absolute inset-0 z-30 bg-indigo-600/85 backdrop-blur-xs flex flex-col items-center justify-center text-white p-4 text-center animate-in fade-in duration-150">
          <Upload className="w-10 h-10 mb-2 animate-bounce" />
          <h4 className="text-sm font-black tracking-wide">Lepaskan Foto di Sini</h4>
          <p className="text-xs text-indigo-100 mt-1 max-w-xs">
            Foto akan otomatis dikompresi dan disimpan untuk <strong>{item.deskripsi}</strong>
          </p>
        </div>
      )}
      {/* Bagian Atas: Header Bar & Gambar Produk Utuh */}
      <div>
        {/* BARIS HEADER KARTU (Rapi, Sejajar, Tidak Berantakan) */}
        <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shrink-0 shadow-2xs">
              Katalog {item.catalog_name || batch.name}
            </span>
            {item.nomor && (
              <span className="px-1.5 py-0.5 rounded-md text-xs font-mono font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0">
                #{item.nomor}
              </span>
            )}
          </div>

          {/* Tombol Aksi di Baris Atas: Edit & Upload Foto */}
          {isAdmin && (
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditProduct();
                }}
                className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                title="Edit nama, harga, foto, atau varian produk ini"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onUploadPhoto();
                }}
                disabled={isUploadingPhoto}
                className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                title="Unggah atau ganti foto produk"
              >
                {isUploadingPhoto ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                ) : (
                  <Camera className="w-3.5 h-3.5" />
                )}
                <span className="hidden sm:inline">Foto</span>
              </button>
            </div>
          )}
        </div>

        {/* CONTAINER GAMBAR PRODUK */}
        <div
          onClick={onImageClick}
          className="relative aspect-4/3 w-full bg-slate-100 dark:bg-slate-800/60 overflow-hidden border-b border-slate-100 dark:border-slate-800 flex items-center justify-center cursor-zoom-in group/img"
          title="Klik foto untuk melihat tampilan penuh"
        >
          {item.image_url ? (
            <img
              src={item.image_url}
              alt={item.deskripsi}
              className="w-full h-full object-cover object-top transition-transform duration-300 group-hover/img:scale-105"
              crossOrigin="anonymous"
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 p-4">
              <ImageIcon className="w-10 h-10 mb-1 opacity-50" />
              <span className="text-xs font-semibold">Foto Belum Tersedia</span>
            </div>
          )}

          {/* Hover Overlay Hint: Klik Fullscreen */}
          <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white pointer-events-none">
            <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-xs text-xs font-semibold flex items-center gap-1.5 shadow-md">
              <ZoomIn className="w-3.5 h-3.5" />
              <span>Buka Fullscreen</span>
            </span>
          </div>
        </div>

        {/* Info Nama Produk, Harga, & Barcode */}
        <div className="p-4 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-800 dark:text-slate-100 leading-snug line-clamp-2">
                {item.deskripsi || 'Produk Tanpa Nama'}
              </h2>
              <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                Rp {item.price || '-'}
              </div>
            </div>

            {/* Tombol Cetak Barcode */}
            <button
              type="button"
              onClick={onPrintBarcode}
              className="px-2.5 py-1.5 text-xs font-bold text-violet-700 dark:text-violet-300 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/50 rounded-xl border border-violet-200 dark:border-violet-800 transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
              title="Cetak stiker barcode thermal 50x20mm produk ini"
            >
              <QrCode className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              <span>Barcode</span>
            </button>
          </div>

          {/* BADGE JADWAL PUBLISH ONLINE / OFFLINE */}
          {(() => {
            const effectiveOnline = (item.publish_online || batch?.publish_online || '').trim();
            const effectiveOffline = (item.publish_offline || batch?.publish_offline || '').trim();
            if (!effectiveOnline && !effectiveOffline) return null;

            return (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {effectiveOnline && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/60"
                    title={`Tanggal Publish Online: ${effectiveOnline}`}
                  >
                    <Globe className="w-3 h-3 text-blue-500 shrink-0" />
                    <span>Online: {effectiveOnline}</span>
                  </span>
                )}
                {effectiveOffline && (
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                    title={`Tanggal Publish Offline: ${effectiveOffline}`}
                  >
                    <Store className="w-3 h-3 text-amber-500 shrink-0" />
                    <span>Offline: {effectiveOffline}</span>
                  </span>
                )}
                {effectiveOnline && !effectiveOffline && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-cyan-600 text-white shadow-2xs">
                    Online Only
                  </span>
                )}
                {!effectiveOnline && effectiveOffline && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-orange-600 text-white shadow-2xs">
                    Offline Only
                  </span>
                )}
                {effectiveOnline && effectiveOffline && (
                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-emerald-600 text-white shadow-2xs">
                    Online & Offline
                  </span>
                )}
              </div>
            );
          })()}

          {/* Baris Ringkasan Varian + Tombol Sembunyikan/Tampilkan Varian */}
          <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span>{item.variants?.length || 0} Varian</span>
              <span className="mx-1">•</span>
              <strong className="text-slate-700 dark:text-slate-300">Total {totalQty} pcs</strong>
            </div>

            {/* Tombol Hide / Unhide Rincian Varian */}
            <button
              type="button"
              onClick={onToggleTable}
              className={`px-2 py-1 text-[11px] font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                isTableVisible
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                  : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
              }`}
              title={isTableVisible ? 'Sembunyikan tabel rincian varian' : 'Tampilkan tabel rincian varian'}
            >
              {isTableVisible ? (
                <>
                  <EyeOff className="w-3 h-3 text-slate-500" />
                  <span>Sembunyikan Varian</span>
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  <span>Lihat Varian</span>
                </>
              )}
            </button>
          </div>

          {/* Tabel Detail Varian: Warna, Size, SKU, Qty */}
          {isTableVisible && item.variants && item.variants.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/40 overflow-hidden">
              <div className="max-h-48 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/80 dark:bg-slate-800/80 sticky top-0 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <tr>
                      <th className="py-1.5 px-2.5">Warna</th>
                      <th className="py-1.5 px-2">Size</th>
                      <th className="py-1.5 px-2">SKU</th>
                      <th className="py-1.5 px-2.5 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {item.variants.map((v, vIdx) => (
                      <tr key={vIdx} className="hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-1.5 px-2.5 font-semibold text-slate-800 dark:text-slate-200">
                          {v.warna || '-'}
                        </td>
                        <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400">{v.size || 'Default'}</td>
                        <td className="py-1.5 px-2 font-mono text-[11px] text-violet-700 dark:text-violet-400 font-semibold">
                          {v.sku || '-'}
                        </td>
                        <td className="py-1.5 px-2.5 text-right font-bold text-slate-800 dark:text-slate-200">
                          {v.qty}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Ringkasan Warna Saat Varian Disembunyikan (Rapi & Kompak) */}
          {!isTableVisible && uniqueColors.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {uniqueColors.map((col, cIdx) => (
                <span
                  key={cIdx}
                  className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/60 dark:border-slate-700"
                >
                  {col}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Bagian Bawah: Aksi Edit & Hapus Produk (Admin) */}
      {isAdmin && (
        <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <button
            type="button"
            onClick={onEditProduct}
            className="text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Edit2 className="w-3 h-3" />
            <span>Edit Produk</span>
          </button>
          <button
            type="button"
            onClick={onDeleteProduct}
            className="text-rose-500 hover:text-rose-700 font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Hapus</span>
          </button>
        </div>
      )}
    </div>
  );
};
