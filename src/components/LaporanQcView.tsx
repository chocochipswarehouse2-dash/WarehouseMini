import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ClipboardCheck,
  CheckCircle2,
  AlertTriangle,
  Search,
  Plus,
  Trash2,
  Download,
  Eye,
  X,
  Camera,
  UploadCloud,
  Layers,
  Calendar,
  User,
  Tag,
  ExternalLink,
  ArrowRight,
  Filter,
  RefreshCw,
  FileSpreadsheet,
  HelpCircle,
  Sparkles,
  ShieldCheck,
  Scissors,
  Share2,
  FileText,
  Copy,
  Check,
  PackageCheck,
  Factory,
  Database,
  CloudCheck,
  Pencil,
  Edit3,
  Lock,
} from 'lucide-react';
import {
  QcReport,
  QcStatus,
  ProductIdentifierType,
  ProductItem,
  UserSession,
  PerbaikanTicket,
} from '../types';
import { compressImage, formatBytes } from '../utils/imageCompressor';
import { playSuccessBeep, playErrorBeep, vibrateDevice } from '../services/audio';
import {
  fetchQcReportsFromSupabase,
  saveQcReportsBatchToSupabase,
  deleteQcReportFromSupabase,
  updateQcReportInSupabase,
  savePerbaikanTicketToSupabase,
  QC_REPORTS_SUPABASE_DDL_SQL,
} from '../services/supabase';
import { getAllProductsFromLocalDb } from '../services/localDb';
import { uploadMultipleImagesToGdrive } from '../services/gdriveUpload';
import { hasPermission, isSuperadmin } from '../services/permissions';

interface LaporanQcViewProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onNavigateToPerbaikan?: (ticketNo?: string) => void;
  onRejectCreated?: (newTicket: PerbaikanTicket) => void;
}

export interface PhotoItem {
  dataUrl: string;
  originalSize: number;
  compressedSize: number;
  savedPercent: number;
}

export interface QcVariantItem {
  id: string;
  tipe_identifikasi: ProductIdentifierType; // 'sku' | 'kode_produksi'
  sku: string;
  nama_produk: string;
  kode_produksi: string;
  warna: string;
  size: string;
  status: QcStatus; // 'OKE' | 'REJECT'
  is_batch_mode: boolean;
  qty_diperiksa: number;
  qty_oke: number;
  qty_reject: number;
  kategori_rusak: string;
  detail_kerusakan: string;
  target_penanganan: 'REJECT' | 'CUCI' | 'PERMAK' | 'DEFECT';
  photos: PhotoItem[];
  catatan: string;
}

const INITIAL_DEMO_QC_REPORTS: QcReport[] = [
  {
    id: 1,
    report_no: 'QC-20260906-101',
    tanggal: '2026-09-06 14:20',
    tipe_identifikasi: 'sku',
    sku: 'TSH-OVR-BLK-M',
    nama_produk: 'Oversized Tee Black - Size M',
    size: 'M',
    sumber_batch: 'Penerimaan CMT',
    status: 'OKE',
    qty_diperiksa: 50,
    qty_oke: 50,
    qty_reject: 0,
    foto_urls: [],
    catatan: 'Jahitan obras rapi, ukuran & warna sesuai spesifikasi PO',
    pic_qc: 'UserQC1',
    created_at: '2026-09-06T14:20:00.000Z',
  },
  {
    id: 2,
    report_no: 'QC-20260906-102',
    tanggal: '2026-09-06 15:45',
    tipe_identifikasi: 'kode_produksi',
    sku: 'PRD-CMT-089',
    kode_produksi: 'PRD-CMT-089',
    warna: 'Sage Green',
    nama_produk: 'PRD-CMT-089 - Sage Green',
    size: 'S',
    sumber_batch: 'Penerimaan CMT',
    status: 'REJECT',
    qty_diperiksa: 30,
    qty_oke: 28,
    qty_reject: 2,
    kategori_rusak: 'Noda / Kotor',
    detail_kerusakan: 'Noda oli tipis di keliman bawah rok depan (2 pcs)',
    target_penanganan: 'CUCI',
    foto_urls: [
      'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&auto=format&fit=crop&q=60',
    ],
    catatan: 'Diteruskan ke pencucian noda tim reparasi',
    pic_qc: 'UserQC2',
    perbaikan_ticket_no: 'RJC-20260906-003',
    created_at: '2026-09-06T15:45:00.000Z',
  },
];

const SUMBER_BATCH_OPTIONS = [
  'Penerimaan CMT',
  'Produksi Baru',
  'Gudang Fisik',
  'Retur Marketplace',
  'Live/Studio',
  'Toko',
  'Lainnya',
];

const KATEGORI_RUSAK_OPTIONS = [
  'Noda / Kotor',
  'Jahitan Rusak',
  'Kain Sobek / Bolong',
  'Kancing / Resleting',
  'Cacat Kain / Warna Belang',
  'Aksesoris Kurang',
  'Pola / Ukuran Tidak Sesuai',
  'Lainnya',
];

const SIZE_PRESETS = ['S', 'M', 'L', 'XL', 'XXL', 'All Size'];

const createInitialVariant = (tipe: ProductIdentifierType = 'sku'): QcVariantItem => ({
  id: 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
  tipe_identifikasi: tipe,
  sku: '',
  nama_produk: '',
  kode_produksi: '',
  warna: '',
  size: '',
  status: 'OKE',
  is_batch_mode: false,
  qty_diperiksa: 1,
  qty_oke: 1,
  qty_reject: 0,
  kategori_rusak: 'Noda / Kotor',
  detail_kerusakan: '',
  target_penanganan: 'REJECT',
  photos: [],
  catatan: '',
});

export const LaporanQcView: React.FC<LaporanQcViewProps> = ({
  session,
  productCatalog = [],
  onShowToast,
  onNavigateToPerbaikan,
  onRejectCreated,
}) => {
  const [reports, setReports] = useState<QcReport[]>(() => {
    try {
      const cached = localStorage.getItem('wms_local_qc_reports');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return INITIAL_DEMO_QC_REPORTS;
  });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Form Collapsible
  const [showForm, setShowForm] = useState<boolean>(true);

  // Common Header State
  const [batchSumber, setBatchSumber] = useState<string>('Penerimaan CMT');
  const [batchTanggal, setBatchTanggal] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [batchGdriveLink, setBatchGdriveLink] = useState<string>('');
  const [batchCatatan, setBatchCatatan] = useState<string>('');

  // PIC Pemeriksa = User Login (strictly locked)
  const currentPicName = useMemo(() => {
    return session?.name || session?.username || 'Operator QC';
  }, [session]);

  // Multi-Variant List State
  const [variants, setVariants] = useState<QcVariantItem[]>([createInitialVariant('sku')]);

  // Active Autocomplete Dropdown Variant Tracking
  const [activeSuggestionVarId, setActiveSuggestionVarId] = useState<string | null>(null);
  const [activeSuggestions, setActiveSuggestions] = useState<ProductItem[]>([]);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'OKE' | 'REJECT'>('ALL');
  const [filterSumber, setFilterSumber] = useState<string>('ALL');

  // Lightbox Modal
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);

  // Supabase SQL DDL Modal
  const [isSqlModalOpen, setIsSqlModalOpen] = useState(false);
  const [isCopiedSql, setIsCopiedSql] = useState(false);

  // Role & Permission Checks
  const userIsAdmin =
    isSuperadmin(session) ||
    session?.role === 'Admin' ||
    session?.role === 'HR & Admin' ||
    session?.role === 'Kepala Gudang';
  const canEditData = userIsAdmin || hasPermission(session, 'can_edit_data');
  const canDeleteData = userIsAdmin || hasPermission(session, 'can_delete_data');

  // Delete Confirmation Modal State
  const [deleteConfirmReport, setDeleteConfirmReport] = useState<QcReport | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Edit QC Report Modal State (Akses Admin)
  const [editingReport, setEditingReport] = useState<QcReport | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  // Edit Form Fields
  const [editNamaProduk, setEditNamaProduk] = useState<string>('');
  const [editSku, setEditSku] = useState<string>('');
  const [editWarna, setEditWarna] = useState<string>('');
  const [editSize, setEditSize] = useState<string>('');
  const [editSumberBatch, setEditSumberBatch] = useState<string>('Penerimaan CMT');
  const [editStatus, setEditStatus] = useState<QcStatus>('OKE');
  const [editQtyDiperiksa, setEditQtyDiperiksa] = useState<number>(1);
  const [editQtyOke, setEditQtyOke] = useState<number>(1);
  const [editQtyReject, setEditQtyReject] = useState<number>(0);
  const [editKategoriRusak, setEditKategoriRusak] = useState<string>('Noda / Kotor');
  const [editDetailKerusakan, setEditDetailKerusakan] = useState<string>('');
  const [editLokasiBarang, setEditLokasiBarang] = useState<string>('');
  const [editTargetPenanganan, setEditTargetPenanganan] = useState<'REJECT' | 'CUCI' | 'PERMAK' | 'DEFECT'>('REJECT');
  const [editCatatan, setEditCatatan] = useState<string>('');
  const [editGdriveLink, setEditGdriveLink] = useState<string>('');
  const [editPicQc, setEditPicQc] = useState<string>('');
  const [editPhotos, setEditPhotos] = useState<PhotoItem[]>([]);

  // Load from Supabase on mount & listen to realtime custom updates
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setIsLoading(true);
      try {
        const data = await fetchQcReportsFromSupabase();
        if (mounted && data && data.length > 0) {
          setReports(data);
        }
      } catch (err) {
        console.warn('Gagal load laporan QC:', err);
      } finally {
        if (mounted) setIsLoading(false);
      }
    };
    load();

    // Listen to updates from other tabs or background sync
    const handleRemoteUpdate = () => {
      fetchQcReportsFromSupabase().then((data) => {
        if (mounted && data) {
          setReports(data);
        }
      });
    };
    window.addEventListener('wms_qc_reports_updated', handleRemoteUpdate);

    return () => {
      mounted = false;
      window.removeEventListener('wms_qc_reports_updated', handleRemoteUpdate);
    };
  }, []);

  // -------------------------------------------------------------
  // FULL CATALOG COMBINER & MULTI-TOKEN PARTIAL MATCH SEARCH
  // -------------------------------------------------------------
  const [localDbCatalog, setLocalDbCatalog] = useState<ProductItem[]>([]);

  useEffect(() => {
    let mounted = true;
    getAllProductsFromLocalDb()
      .then((items) => {
        if (mounted && Array.isArray(items) && items.length > 0) {
          setLocalDbCatalog(items);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, []);

  const combinedCatalog = useMemo(() => {
    const map = new Map<string, ProductItem>();

    // 1. IndexedDB products
    if (Array.isArray(localDbCatalog)) {
      for (const p of localDbCatalog) {
        if (!p) continue;
        const key = String(p.k || p.sku || '').trim().toUpperCase();
        if (key) map.set(key, p);
      }
    }

    // 2. Prop productCatalog from parent
    if (Array.isArray(productCatalog)) {
      for (const p of productCatalog) {
        if (!p) continue;
        const key = String(p.k || p.sku || '').trim().toUpperCase();
        if (key) map.set(key, p);
      }
    }

    // 3. Fallback localStorage
    if (map.size === 0) {
      try {
        const raw = localStorage.getItem('wms_product_cache');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const p of parsed) {
              if (!p) continue;
              const key = String(p.k || p.sku || '').trim().toUpperCase();
              if (key) map.set(key, p);
            }
          }
        }
      } catch {}
    }

    return Array.from(map.values());
  }, [productCatalog, localDbCatalog]);

  const searchProductPartialMatch = (query: string): ProductItem[] => {
    if (!query || !query.trim() || combinedCatalog.length === 0) return [];
    const cleanQ = query.toLowerCase().trim();
    const tokens = cleanQ.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    const scoredMatches: { item: ProductItem; score: number }[] = [];

    for (const p of combinedCatalog) {
      const sSku = String(p.k || p.sku || '').toLowerCase();
      const sName = String(
        p.nama_produk ||
        p.p ||
        p.n ||
        p.name ||
        p.nama ||
        p.product_name ||
        p.produk ||
        (p as any).title ||
        ''
      ).toLowerCase();
      const sSize = String(p.s || p.size || '').toLowerCase();
      const sCat = String(p.c || p.kategori || p.category || '').toLowerCase();
      const sColor = String(p.warna || (p as any).color || '').toLowerCase();
      const sDesc = String(p.deskripsi || (p as any).description || '').toLowerCase();
      const sBarcode = String((p as any).barcode || '').toLowerCase();

      // Combined normalized text with single spaces
      const combined = `${sSku} ${sName} ${sSize} ${sCat} ${sColor} ${sDesc} ${sBarcode}`;

      // All search tokens must partially match somewhere in the combined string
      const matchAll = tokens.every((token) => combined.includes(token));
      if (!matchAll) continue;

      let score = 0;
      if (sSku === cleanQ) score += 200;
      else if (sSku.startsWith(cleanQ)) score += 120;
      else if (sSku.includes(cleanQ)) score += 60;

      if (sName === cleanQ) score += 180;
      else if (sName.startsWith(cleanQ)) score += 100;
      else if (sName.includes(cleanQ)) score += 50;

      // Token bonuses
      for (const token of tokens) {
        if (sSku === token) score += 40;
        else if (sSku.startsWith(token)) score += 25;
        else if (sSku.includes(token)) score += 15;

        if (sName.startsWith(token)) score += 30;
        if (sName.includes(token)) score += 20;

        if (sColor.includes(token)) score += 20;
        if (sSize === token) score += 20;
      }

      scoredMatches.push({ item: p, score });
    }

    scoredMatches.sort((a, b) => b.score - a.score);
    return scoredMatches.slice(0, 30).map((m) => m.item);
  };

  // -------------------------------------------------------------
  // VARIANT LIST & QUANTITY HANDLERS
  // -------------------------------------------------------------
  const handleUpdateVariant = (id: string, updates: Partial<QcVariantItem>) => {
    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const updated = { ...v, ...updates };

        // When status is explicitly changed:
        if (updates.status !== undefined) {
          const total = updated.qty_diperiksa > 0 ? updated.qty_diperiksa : 1;
          updated.qty_diperiksa = total;
          if (updates.status === 'OKE') {
            updated.qty_oke = total;
            updated.qty_reject = 0;
          } else {
            // Status REJECT
            updated.qty_reject = total;
            updated.qty_oke = 0;
          }
        }
        return updated;
      })
    );
  };

  const handleQtyDiperiksaChange = (id: string, newTotal: number) => {
    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const total = Math.max(0, newTotal);
        return {
          ...v,
          qty_diperiksa: total,
          qty_oke: v.status === 'OKE' ? total : 0,
          qty_reject: v.status === 'REJECT' ? total : 0,
        };
      })
    );
  };

  const handleQuickAddQty = (id: string, delta: number) => {
    setVariants((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const current = v.qty_diperiksa > 0 ? v.qty_diperiksa : 1;
        const total = Math.max(1, current + delta);
        return {
          ...v,
          qty_diperiksa: total,
          qty_oke: v.status === 'OKE' ? total : 0,
          qty_reject: v.status === 'REJECT' ? total : 0,
        };
      })
    );
  };

  const handleAddVariant = () => {
    const lastVariant = variants[variants.length - 1];
    const newTipe = lastVariant ? lastVariant.tipe_identifikasi : 'sku';
    setVariants((prev) => [...prev, createInitialVariant(newTipe)]);
  };

  const handleDuplicateVariant = (sourceId: string) => {
    const source = variants.find((v) => v.id === sourceId);
    if (!source) return;
    const duplicated: QcVariantItem = {
      ...source,
      id: 'var-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
      photos: [...source.photos],
    };
    setVariants((prev) => [...prev, duplicated]);
    onShowToast('Variant berhasil diduplikasi!', 'info');
  };

  const handleRemoveVariant = (id: string) => {
    if (variants.length <= 1) {
      onShowToast('Minimal harus ada 1 variant dalam laporan!', 'warning');
      return;
    }
    setVariants((prev) => prev.filter((v) => v.id !== id));
  };

  const handleSetAllStatus = (targetStatus: QcStatus) => {
    setVariants((prev) =>
      prev.map((v) => {
        const total = v.qty_diperiksa > 0 ? v.qty_diperiksa : 1;
        return {
          ...v,
          status: targetStatus,
          qty_diperiksa: total,
          qty_oke: targetStatus === 'OKE' ? total : 0,
          qty_reject: targetStatus === 'REJECT' ? total : 0,
        };
      })
    );
    onShowToast(`Semua variant diset ke status ${targetStatus}!`, 'info');
  };

  // Autocomplete interaction for SKU
  const handleSkuSearchChange = (id: string, val: string) => {
    handleUpdateVariant(id, { sku: val });
    if (!val.trim()) {
      setActiveSuggestionVarId(null);
      setActiveSuggestions([]);
      return;
    }
    const matches = searchProductPartialMatch(val);
    setActiveSuggestions(matches);
    setActiveSuggestionVarId(matches.length > 0 ? id : null);
  };

  const handleSelectSuggestion = (id: string, item: ProductItem) => {
    const sSku = String(item.k || item.sku || '').trim();
    const sName = String(
      item.nama_produk ||
      item.p ||
      item.n ||
      item.name ||
      item.nama ||
      item.product_name ||
      item.produk ||
      (item as any).title ||
      ''
    ).trim();
    const sSize = String(item.s || item.size || '').trim();
    const sColor = String(item.warna || (item as any).color || '').trim();

    handleUpdateVariant(id, {
      sku: sSku,
      nama_produk: sName || sSku,
      size: sSize && sSize !== 'Default' && sSize !== '-' ? sSize : '',
      warna: sColor || '',
    });
    setActiveSuggestionVarId(null);
    setActiveSuggestions([]);
  };

  // Photo Upload Handler per Variant
  const handlePhotoUploadForVariant = async (
    variantId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    const newPhotos: PhotoItem[] = [];

    for (const file of fileList) {
      try {
        const res = await compressImage(file, 1200, 0.75);

        newPhotos.push({
          dataUrl: res.dataUrl,
          originalSize: res.originalSize,
          compressedSize: res.compressedSize,
          savedPercent: res.savedPercentage,
        });
      } catch (err) {
        console.warn('Gagal kompres foto:', err);
      }
    }

    if (newPhotos.length > 0) {
      setVariants((prev) =>
        prev.map((v) => (v.id === variantId ? { ...v, photos: [...v.photos, ...newPhotos] } : v))
      );
      onShowToast(`${newPhotos.length} foto bukti cacat berhasil dikompres WebP!`, 'success');
    }

    e.target.value = '';
  };

  const handleRemovePhotoFromVariant = (variantId: string, photoIdx: number) => {
    setVariants((prev) =>
      prev.map((v) =>
        v.id === variantId
          ? { ...v, photos: v.photos.filter((_, idx) => idx !== photoIdx) }
          : v
      )
    );
  };

  // -------------------------------------------------------------
  // SUBMIT HANDLER: MULTI-VARIANT BATCH SUBMIT
  // -------------------------------------------------------------
  const handleSubmitBatch = async (e: React.FormEvent) => {
    e.preventDefault();

    if (variants.length === 0) {
      onShowToast('Mohon tambahkan minimal 1 variant produk!', 'warning');
      return;
    }

    // Validation
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      const num = i + 1;

      if (v.tipe_identifikasi === 'sku') {
        if (!v.sku.trim()) {
          onShowToast(`Variant #${num}: SKU produk wajib diisi!`, 'warning');
          return;
        }
        if (!v.nama_produk.trim()) {
          onShowToast(`Variant #${num}: Nama produk wajib diisi!`, 'warning');
          return;
        }
      } else {
        // kode_produksi
        if (!v.kode_produksi.trim()) {
          onShowToast(`Variant #${num}: Kode produksi wajib diisi!`, 'warning');
          return;
        }
      }

      const qtyChecked = Number(v.qty_diperiksa) || 0;
      if (qtyChecked <= 0) {
        onShowToast(`Variant #${num}: Kuantitas produk harus minimal 1 pcs!`, 'warning');
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const now = new Date();
      const dateStr = (batchTanggal || now.toISOString().slice(0, 10)).replace(/-/g, '');
      const timeStr = now.toTimeString().slice(0, 5).replace(/:/g, '');

      const reportsToSave: QcReport[] = [];
      let totalRejectCreated = 0;
      let totalOkeCreated = 0;

      for (let i = 0; i < variants.length; i++) {
        const v = variants[i];
        const rand = Math.floor(100 + Math.random() * 900);
        const reportNo = `QC-${dateStr}-${timeStr}-${i + 1}-${rand}`;

        let finalSku = v.sku.trim();
        let finalNamaProduk = v.nama_produk.trim();
        let finalSize = v.size.trim() || '-';

        if (v.tipe_identifikasi === 'kode_produksi') {
          finalSku = v.kode_produksi.trim();
          finalNamaProduk = v.warna.trim()
            ? `${v.kode_produksi.trim()} - ${v.warna.trim()}`
            : v.kode_produksi.trim();
        }

        const qtyChecked = Math.max(1, Number(v.qty_diperiksa) || 1);
        const qtyOke = v.status === 'OKE' ? qtyChecked : 0;
        const qtyReject = v.status === 'REJECT' ? qtyChecked : 0;

        // Upload foto ke Google Drive via GAS untuk menghemat 99% Egress Supabase
        let uploadedPhotoUrls: string[] = [];
        if (v.photos && v.photos.length > 0) {
          const rawPhotos = v.photos.map((p) => p.dataUrl);
          try {
            uploadedPhotoUrls = await uploadMultipleImagesToGdrive(
              rawPhotos,
              `QC_${reportNo}`
            );
          } catch (ePhoto) {
            console.warn('Gagal upload ke Google Drive, fallback ke dataUrl:', ePhoto);
            uploadedPhotoUrls = rawPhotos;
          }
        }

        let perbaikanTicketNo: string | undefined = undefined;

        // Auto-create ticket if status is REJECT or qtyReject > 0
        if (v.status === 'REJECT' || qtyReject > 0) {
          const ticketRand = Math.floor(100 + Math.random() * 900);
          perbaikanTicketNo = `RJC-${dateStr}-${ticketRand}-${i + 1}`;

          let targetLokasi = 'PERBAIKAN-01';
          if (v.target_penanganan === 'CUCI') targetLokasi = 'CC-01';
          else if (v.target_penanganan === 'PERMAK') targetLokasi = 'PMK-01';
          else if (v.target_penanganan === 'DEFECT') targetLokasi = 'DF-01';

          let mappedSumber: PerbaikanTicket['sumber_barang'] = 'Gudang Fisik';
          if (batchSumber.includes('CMT') || batchSumber.includes('Produksi')) {
            mappedSumber = 'Penerimaan CMT';
          } else if (batchSumber.includes('Retur')) {
            mappedSumber = 'Retur Marketplace';
          } else if (batchSumber.includes('Studio') || batchSumber.includes('Live')) {
            mappedSumber = 'Live/Studio';
          } else if (batchSumber.includes('Toko')) {
            mappedSumber = 'Toko';
          }

          const defectDetail = v.detail_kerusakan.trim()
            ? `[QC #${reportNo}] ${v.detail_kerusakan.trim()}`
            : `[QC #${reportNo}] Ditemukan cacat ${v.kategori_rusak || 'Defect'} pada inspeksi QC`;

          const newTicket: PerbaikanTicket = {
            ticket_no: perbaikanTicketNo,
            tanggal: now.toISOString(),
            sku: finalSku,
            nama_produk: finalNamaProduk,
            size: finalSize,
            qty: qtyReject > 0 ? qtyReject : 1,
            lokasi_asal: 'Area QC',
            lokasi_sekarang: targetLokasi,
            is_already_in_repair: false,
            sumber_barang: mappedSumber,
            kategori_rusak: (v.kategori_rusak as any) || 'Noda / Kotor',
            detail_kerusakan: defectDetail,
            foto_urls: uploadedPhotoUrls,
            tahap: v.target_penanganan,
            status_pengerjaan: 'PENDING',
            qc_pic: currentPicName,
            qc_tanggal: now.toISOString(),
            qc_catatan: `Inspeksi QC: REJECT (${qtyReject} pcs). ${v.catatan.trim()}`,
            operator_input: currentPicName,
            qc_report_no: reportNo,
            created_at: now.toISOString(),
          };

          try {
            await savePerbaikanTicketToSupabase(newTicket);
            if (onRejectCreated) {
              onRejectCreated(newTicket);
            }
            totalRejectCreated += qtyReject > 0 ? qtyReject : 1;
          } catch (errTicket) {
            console.warn('Gagal simpan tiket perbaikan:', errTicket);
          }
        } else {
          totalOkeCreated += qtyOke > 0 ? qtyOke : qtyChecked;
        }

        const reportRecord: QcReport = {
          report_no: reportNo,
          tanggal: now.toISOString(),
          tipe_identifikasi: v.tipe_identifikasi,
          sku: finalSku,
          nama_produk: finalNamaProduk,
          kode_produksi: v.tipe_identifikasi === 'kode_produksi' ? v.kode_produksi.trim() : undefined,
          warna: v.tipe_identifikasi === 'kode_produksi' ? v.warna.trim() : undefined,
          size: finalSize,
          sumber_batch: batchSumber,
          status: v.status,
          qty_diperiksa: qtyChecked,
          qty_oke: qtyOke,
          qty_reject: qtyReject,
          kategori_rusak: v.status === 'REJECT' ? v.kategori_rusak : undefined,
          detail_kerusakan: v.status === 'REJECT' ? v.detail_kerusakan.trim() : undefined,
          target_penanganan: v.status === 'REJECT' ? v.target_penanganan : undefined,
          foto_urls: uploadedPhotoUrls,
          gdrive_link:
            batchGdriveLink.trim() ||
            uploadedPhotoUrls.find((u) => u.includes('googleusercontent') || u.includes('drive.google')) ||
            undefined,
          catatan: [batchCatatan.trim(), v.catatan.trim()].filter(Boolean).join(' | ') || undefined,
          pic_qc: currentPicName,
          perbaikan_ticket_no: perbaikanTicketNo,
          created_at: now.toISOString(),
        };

        reportsToSave.push(reportRecord);
      }

      // Batch Insert Reports to Supabase (Dual-Layer Sync)
      const savedBatch = await saveQcReportsBatchToSupabase(reportsToSave);
      setReports((prev) => {
        const savedNos = new Set(savedBatch.map((s) => s.report_no));
        return [...savedBatch, ...prev.filter((p) => !savedNos.has(p.report_no))];
      });

      playSuccessBeep();
      vibrateDevice([40, 60, 40]);

      onShowToast(
        `Berhasil menyimpan & mensinkronkan ${savedBatch.length} laporan QC ke Supabase Cloud! (${totalOkeCreated} Pcs OKE, ${totalRejectCreated} Pcs REJECT) - kini dapat dilihat oleh admin & user lain.`,
        'success'
      );

      // Reset form to 1 clean variant
      setVariants([createInitialVariant('sku')]);
      setBatchCatatan('');
      setBatchGdriveLink('');
    } catch (err: any) {
      playErrorBeep();
      console.warn('Gagal menyimpan laporan QC batch:', err);
      onShowToast('Gagal menyimpan laporan QC: ' + (err.message || 'Terjadi kesalahan'), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Handlers with Custom Confirmation Modal (No iframe window.confirm block)
  const handleRequestDelete = (rep: QcReport) => {
    if (!canDeleteData) {
      playErrorBeep();
      onShowToast('Akses ditolak: Hanya Admin / Kepala Gudang yang dapat menghapus laporan QC', 'error');
      return;
    }
    setDeleteConfirmReport(rep);
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmReport) return;
    setIsDeleting(true);
    try {
      await deleteQcReportFromSupabase(deleteConfirmReport.report_no, deleteConfirmReport.id);
      setReports((prev) => prev.filter((r) => r.report_no !== deleteConfirmReport.report_no));
      playSuccessBeep();
      onShowToast(`Laporan QC #${deleteConfirmReport.report_no} berhasil dihapus`, 'info');
      setDeleteConfirmReport(null);
    } catch (err: any) {
      playErrorBeep();
      onShowToast('Gagal menghapus laporan QC: ' + (err?.message || 'Terjadi kesalahan'), 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Edit Handlers (Akses Admin)
  const handleOpenEdit = (rep: QcReport) => {
    if (!canEditData) {
      playErrorBeep();
      onShowToast('Akses ditolak: Hanya Admin / Kepala Gudang yang memiliki akses untuk mengedit laporan QC', 'error');
      return;
    }
    setEditingReport(rep);
    setEditNamaProduk(rep.nama_produk || '');
    setEditSku(rep.sku || '');
    setEditWarna(rep.warna || '');
    setEditSize(rep.size || '-');
    setEditSumberBatch(rep.sumber_batch || 'Penerimaan CMT');
    setEditStatus(rep.status);
    setEditQtyDiperiksa(Number(rep.qty_diperiksa) || 1);
    setEditQtyOke(Number(rep.qty_oke) ?? (rep.status === 'OKE' ? Number(rep.qty_diperiksa) : 0));
    setEditQtyReject(Number(rep.qty_reject) ?? (rep.status === 'REJECT' ? Number(rep.qty_diperiksa) : 0));
    setEditKategoriRusak(rep.kategori_rusak || 'Noda / Kotor');
    setEditDetailKerusakan(rep.detail_kerusakan || '');
    setEditLokasiBarang(rep.lokasi_barang || '');
    setEditTargetPenanganan(rep.target_penanganan || 'REJECT');
    setEditCatatan(rep.catatan || '');
    setEditGdriveLink(rep.gdrive_link || '');
    setEditPicQc(rep.pic_qc || session?.name || session?.username || 'Admin QC');
    setEditPhotos(
      (rep.foto_urls || []).map((url) => ({
        dataUrl: url,
        originalSize: 0,
        compressedSize: 0,
        savedPercent: 0,
      }))
    );
  };

  const handleEditPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    for (const file of fileList) {
      try {
        const res = await compressImage(file, 1200, 0.75);
        setEditPhotos((prev) => [
          ...prev,
          {
            dataUrl: res.dataUrl,
            originalSize: res.originalSize,
            compressedSize: res.compressedSize,
            savedPercent: res.savedPercentage,
          },
        ]);
      } catch (err) {
        console.warn('Gagal kompres foto edit:', err);
      }
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingReport) return;
    if (!editNamaProduk.trim()) {
      onShowToast('Nama produk tidak boleh kosong', 'warning');
      return;
    }

    setIsSavingEdit(true);
    try {
      let finalPhotoUrls: string[] = [];
      if (editPhotos && editPhotos.length > 0) {
        const rawPhotos = editPhotos.map((p) => p.dataUrl);
        try {
          finalPhotoUrls = await uploadMultipleImagesToGdrive(
            rawPhotos,
            `QC_EDIT_${editingReport.report_no}`
          );
        } catch (err) {
          console.warn('Upload GDrive edit fallback:', err);
          finalPhotoUrls = rawPhotos;
        }
      }

      const updated: QcReport = {
        ...editingReport,
        nama_produk: editNamaProduk.trim(),
        sku: editSku.trim() || editingReport.sku,
        warna: editWarna.trim() || undefined,
        size: editSize.trim() || '-',
        sumber_batch: editSumberBatch,
        status: editStatus,
        qty_diperiksa: Number(editQtyDiperiksa) || 1,
        qty_oke: editStatus === 'OKE' ? (Number(editQtyOke) || Number(editQtyDiperiksa) || 1) : 0,
        qty_reject: editStatus === 'REJECT' ? (Number(editQtyReject) || Number(editQtyDiperiksa) || 1) : 0,
        kategori_rusak: editStatus === 'REJECT' ? editKategoriRusak : undefined,
        detail_kerusakan: editStatus === 'REJECT' ? editDetailKerusakan.trim() : undefined,
        lokasi_barang: editLokasiBarang.trim() || undefined,
        target_penanganan: editStatus === 'REJECT' ? editTargetPenanganan : undefined,
        foto_urls: finalPhotoUrls,
        gdrive_link: editGdriveLink.trim() || undefined,
        catatan: editCatatan.trim() || undefined,
        pic_qc: editPicQc.trim() || editingReport.pic_qc,
        updated_at: new Date().toISOString(),
      };

      await updateQcReportInSupabase(updated);

      setReports((prev) =>
        prev.map((r) => (r.report_no === updated.report_no ? updated : r))
      );

      playSuccessBeep();
      onShowToast(`Laporan QC #${updated.report_no} berhasil diperbarui!`, 'success');
      setEditingReport(null);
    } catch (err: any) {
      playErrorBeep();
      console.error('Gagal update laporan QC:', err);
      onShowToast('Gagal menyimpan perubahan: ' + (err?.message || 'Terjadi kesalahan'), 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // -------------------------------------------------------------
  // FILTER & METRICS CALCULATIONS
  // -------------------------------------------------------------
  const filteredReports = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const tokens = q ? q.split(/\s+/).filter(Boolean) : [];

    return reports.filter((r) => {
      // Status Filter
      if (filterStatus !== 'ALL' && r.status !== filterStatus) return false;

      // Sumber Batch Filter
      if (filterSumber !== 'ALL' && r.sumber_batch !== filterSumber) return false;

      // Partial Match Search
      if (tokens.length > 0) {
        const combined = `${r.report_no || ''} ${r.sku || ''} ${r.nama_produk || ''} ${r.kode_produksi || ''} ${r.warna || ''} ${r.size || ''} ${r.pic_qc || ''} ${r.kategori_rusak || ''} ${r.perbaikan_ticket_no || ''}`.toLowerCase();
        const matchesAll = tokens.every((token) => combined.includes(token));
        if (!matchesAll) return false;
      }

      return true;
    });
  }, [reports, filterStatus, filterSumber, searchQuery]);

  const metrics = useMemo(() => {
    let totalChecked = 0;
    let totalOke = 0;
    let totalReject = 0;
    let todayReportsCount = 0;
    const todayStr = new Date().toISOString().slice(0, 10);

    for (const r of reports) {
      totalChecked += Number(r.qty_diperiksa) || 0;
      totalOke += Number(r.qty_oke) || 0;
      totalReject += Number(r.qty_reject) || 0;
      if (r.tanggal && r.tanggal.startsWith(todayStr)) {
        todayReportsCount++;
      }
    }

    const rejectRate = totalChecked > 0 ? ((totalReject / totalChecked) * 100).toFixed(1) : '0.0';
    return {
      totalReports: reports.length,
      totalChecked,
      totalOke,
      totalReject,
      rejectRate,
      todayReportsCount,
    };
  }, [reports]);

  // Batch Form Summary Totals
  const batchFormTotals = useMemo(() => {
    let totalQty = 0;
    let totalOke = 0;
    let totalReject = 0;

    for (const v of variants) {
      totalQty += Number(v.qty_diperiksa) || 0;
      totalOke += Number(v.qty_oke) || 0;
      totalReject += Number(v.qty_reject) || 0;
    }

    return { totalQty, totalOke, totalReject, variantCount: variants.length };
  }, [variants]);

  // Export CSV
  const handleExportCsv = () => {
    if (filteredReports.length === 0) {
      onShowToast('Tidak ada data laporan QC untuk diekspor', 'warning');
      return;
    }

    const headers = [
      'No Laporan',
      'Tanggal',
      'Tipe Identifikasi',
      'SKU / Kode',
      'Nama Produk',
      'Kode Produksi',
      'Warna',
      'Size',
      'Sumber / Batch',
      'Status',
      'Qty Diperiksa',
      'Qty OKE',
      'Qty Reject',
      'Kategori Rusak',
      'Detail Kerusakan',
      'Target Penanganan',
      'Link GDrive',
      'PIC QC',
      'No Tiket Perbaikan',
      'Catatan',
    ];

    const rows = filteredReports.map((r) => [
      `"${r.report_no}"`,
      `"${r.tanggal || ''}"`,
      `"${r.tipe_identifikasi || 'sku'}"`,
      `"${r.sku}"`,
      `"${(r.nama_produk || '').replace(/"/g, '""')}"`,
      `"${r.kode_produksi || ''}"`,
      `"${r.warna || ''}"`,
      `"${r.size || '-'}"`,
      `"${r.sumber_batch || ''}"`,
      `"${r.status}"`,
      r.qty_diperiksa || 0,
      r.qty_oke || 0,
      r.qty_reject || 0,
      `"${r.kategori_rusak || '-'}"`,
      `"${(r.detail_kerusakan || '-').replace(/"/g, '""')}"`,
      `"${r.target_penanganan || '-'}"`,
      `"${r.gdrive_link || '-'}"`,
      `"${r.pic_qc || '-'}"`,
      `"${r.perbaikan_ticket_no || '-'}"`,
      `"${(r.catatan || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Laporan_QC_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onShowToast('Laporan QC berhasil diekspor ke CSV!', 'success');
  };

  return (
    <div className="space-y-6">
      {/* 0. Cloud Sync & Supabase Status Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-emerald-500/10 dark:from-blue-900/20 dark:via-indigo-900/20 dark:to-emerald-900/20 border border-blue-200/80 dark:border-blue-800/60 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-blue-600 dark:bg-blue-500 text-white shadow-xs">
            <CloudCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                Supabase Cloud Sync Aktif
              </span>
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/60">
                Terhubung Cloud
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Laporan inspeksi QC otomatis tersinkronisasi realtime & langsung dapat dilihat oleh seluruh admin / staf di perangkat lain.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={async () => {
              setIsLoading(true);
              try {
                const data = await fetchQcReportsFromSupabase();
                if (data) setReports(data);
                onShowToast('Laporan QC berhasil disinkronkan dengan Supabase Cloud!', 'success');
              } catch (err: any) {
                onShowToast('Gagal sinkronisasi: ' + (err.message || 'Kendala koneksi'), 'error');
              } finally {
                setIsLoading(false);
              }
            }}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors shadow-xs disabled:opacity-50"
            title="Tarik data terbaru dari Supabase"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-blue-600' : ''}`} />
            <span>{isLoading ? 'Sinkronisasi...' : 'Sinkronkan'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsSqlModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 transition-colors shadow-xs"
            title="Lihat & Salin Script SQL Tabel qc_reports Supabase"
          >
            <Database className="w-3.5 h-3.5" />
            <span>Script SQL</span>
          </button>
        </div>
      </div>

      {/* 1. Stat Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Laporan</span>
            <span className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600">
              <ClipboardCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-800 dark:text-white">{metrics.totalReports}</span>
            <span className="text-xs text-slate-400">laporan</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">{metrics.todayReportsCount} hari ini</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Diperiksa</span>
            <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600">
              <Layers className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{metrics.totalChecked}</span>
            <span className="text-xs text-slate-400">pcs</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Semua produk & batch</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Lolos OKE</span>
            <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{metrics.totalOke}</span>
            <span className="text-xs text-slate-400">pcs</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Grade A siap jual</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Total Reject</span>
            <span className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/30 text-rose-600">
              <AlertTriangle className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-rose-600 dark:text-rose-400">{metrics.totalReject}</span>
            <span className="text-xs text-slate-400">pcs</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Kirim ke perbaikan</div>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Reject Rate</span>
            <span className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-900/30 text-amber-600">
              <ShieldCheck className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{metrics.rejectRate}%</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">Tingkat cacat kualitas</div>
        </div>
      </div>

      {/* 2. Collapsible Form Input Laporan QC (Multi-Variant Support) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden transition-all">
        {/* Header Accordion Bar */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-blue-600 text-white shadow-md shadow-blue-500/20">
              <PackageCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Form Laporan Inspeksi QC (Multi-Variant)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
                  {variants.length} Variant
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Input multi-variant produk dalam 1 submit &bull; Dukung SKU Produk atau Kode Produksi &bull; Parsial match SKU
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowForm(!showForm)}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors"
          >
            {showForm ? 'Sembunyikan Form' : '+ Buka Form Input'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleSubmitBatch} className="p-4 sm:p-6 space-y-6">
            {/* Header Informasi Batch & PIC Login */}
            <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-50/70 via-indigo-50/50 to-slate-50 dark:from-slate-800/70 dark:via-slate-800/50 dark:to-slate-900 border border-blue-100 dark:border-slate-700/80 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-200/60 dark:border-slate-700/60 pb-3">
                <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-blue-900 dark:text-blue-300">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>Informasi Batch Pemeriksaan</span>
                </div>

                {/* Locked PIC Badge */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold shadow-xs">
                  <User className="w-3.5 h-3.5 text-blue-600" />
                  <span className="text-slate-500">PIC QC:</span>
                  <span className="font-bold text-slate-900 dark:text-white">{currentPicName}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold">
                    User Login
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Sumber / Asal Batch */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Sumber / Asal Batch
                  </label>
                  <select
                    value={batchSumber}
                    onChange={(e) => setBatchSumber(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  >
                    {SUMBER_BATCH_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Tanggal Pemeriksaan */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Pemeriksaan
                  </label>
                  <input
                    type="date"
                    value={batchTanggal}
                    onChange={(e) => setBatchTanggal(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-medium focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>

                {/* Link Google Drive Arsip */}
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                    <span>Link Google Drive (Opsional)</span>
                    <ExternalLink className="w-3 h-3 text-slate-400" />
                  </label>
                  <input
                    type="url"
                    value={batchGdriveLink}
                    onChange={(e) => setBatchGdriveLink(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Sub-Header Actions: Batch Shortcuts */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                  Daftar Variant / Produk Diperiksa ({variants.length})
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSetAllStatus('OKE')}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 border border-emerald-200 dark:border-emerald-800 transition-colors flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Set Semua OKE</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSetAllStatus('REJECT')}
                  className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 transition-colors flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Set Semua REJECT</span>
                </button>
              </div>
            </div>

            {/* List of Variant Cards */}
            <div className="space-y-4">
              {variants.map((variant, index) => {
                const isKodeProduksi = variant.tipe_identifikasi === 'kode_produksi';
                const isReject = variant.status === 'REJECT';

                return (
                  <div
                    key={variant.id ? `qc-var-${variant.id}` : `qc-var-idx-${index}`}
                    className={`rounded-2xl border transition-all ${
                      isReject
                        ? 'border-rose-300 dark:border-rose-900/60 bg-rose-50/30 dark:bg-rose-950/15'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/90'
                    } p-4 sm:p-5 shadow-xs space-y-4`}
                  >
                    {/* Top Row: Variant Badge, Type Switcher, Status Toggle, Duplicate & Remove */}
                    <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-slate-100 dark:border-slate-800 pb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-black flex items-center justify-center shadow-xs">
                          {index + 1}
                        </span>
                        <span className="font-bold text-sm text-slate-800 dark:text-slate-100">
                          Variant #{index + 1}
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-bold text-xs border border-blue-200/60 dark:border-blue-800/60">
                          {variant.qty_diperiksa} Pcs
                        </span>

                        {/* Tipe Identifikasi Toggle: SKU vs Kode Produksi */}
                        <div className="inline-flex rounded-xl p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 ml-2">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateVariant(variant.id, { tipe_identifikasi: 'sku' })
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                              !isKodeProduksi
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                          >
                            <Tag className="w-3 h-3" />
                            <span>SKU Produk</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateVariant(variant.id, { tipe_identifikasi: 'kode_produksi' })
                            }
                            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                              isKodeProduksi
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                          >
                            <Factory className="w-3 h-3" />
                            <span>Kode Produksi</span>
                          </button>
                        </div>
                      </div>

                      {/* Status OKE / REJECT Selector & Actions */}
                      <div className="flex items-center gap-2">
                        {/* Status Toggle Buttons */}
                        <div className="inline-flex rounded-xl p-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <button
                            type="button"
                            onClick={() => handleUpdateVariant(variant.id, { status: 'OKE' })}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                              variant.status === 'OKE'
                                ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-500/20'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>OKE (Lolos)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateVariant(variant.id, { status: 'REJECT' })}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                              variant.status === 'REJECT'
                                ? 'bg-rose-600 text-white shadow-xs ring-1 ring-rose-500/20'
                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                            }`}
                          >
                            <AlertTriangle className="w-3.5 h-3.5" />
                            <span>REJECT</span>
                          </button>
                        </div>

                        {/* Duplicate Button */}
                        <button
                          type="button"
                          onClick={() => handleDuplicateVariant(variant.id)}
                          className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                          title="Duplikasi variant ini"
                        >
                          <Copy className="w-4 h-4" />
                        </button>

                        {/* Remove Button (if > 1) */}
                        {variants.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveVariant(variant.id)}
                            className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/50 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Hapus variant ini"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* DYNAMIC PRODUCT FIELDS */}
                    {!isKodeProduksi ? (
                      /* MODE 1: SKU PRODUK -> [SKU Produk (Partial Search)] | [Nama Produk] | [Size] */
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* SKU with Partial-Match Dropdown */}
                        <div className="relative">
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            SKU Produk (Parsial Match) <span className="text-rose-500">*</span>
                          </label>
                          <div className="relative">
                            <input
                              type="text"
                              required
                              value={variant.sku}
                              onChange={(e) => handleSkuSearchChange(variant.id, e.target.value)}
                              placeholder="Ketik SKU atau nama..."
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            {variant.sku && (
                              <button
                                type="button"
                                onClick={() => {
                                  handleUpdateVariant(variant.id, { sku: '', nama_produk: '' });
                                  setActiveSuggestionVarId(null);
                                }}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Autocomplete Dropdown */}
                          {activeSuggestionVarId === variant.id && (
                            <div className="absolute z-30 top-full left-0 right-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-64 overflow-y-auto">
                              <div className="px-3 py-1.5 text-[10px] font-bold text-slate-400 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-between">
                                <span>HASIL PENCARIAN KATALOG ({activeSuggestions.length})</span>
                                <span className="text-[9px] text-slate-400 font-normal">Parsial match multi-kata</span>
                              </div>
                              {activeSuggestions.length > 0 ? (
                                activeSuggestions.map((item, idx) => {
                                  const sSku = String(item.k || item.sku || '');
                                  const sName = String(
                                    item.nama_produk ||
                                    item.p ||
                                    item.n ||
                                    item.name ||
                                    item.nama ||
                                    item.product_name ||
                                    item.produk ||
                                    (item as any).title ||
                                    ''
                                  );
                                  const sSize = String(item.s || item.size || '');
                                  const sColor = String(item.warna || (item as any).color || '');
                                  return (
                                    <button
                                      key={`${sSku || 'sug'}-${sSize}-${idx}`}
                                      type="button"
                                      onClick={() => handleSelectSuggestion(variant.id, item)}
                                      className="w-full text-left px-3.5 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 border-b border-slate-100 dark:border-slate-700/50 last:border-0 transition-colors group"
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-xs font-bold text-blue-600 dark:text-blue-400 group-hover:underline">
                                          {sSku}
                                        </span>
                                        {sSize && sSize !== 'Default' && sSize !== '-' && (
                                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                            Size: {sSize}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-xs text-slate-800 dark:text-slate-200 font-medium line-clamp-1 mt-0.5">
                                        {sName || sSku}
                                      </div>
                                      {sColor && (
                                        <span className="inline-block mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">
                                          Warna: {sColor}
                                        </span>
                                      )}
                                    </button>
                                  );
                                })
                              ) : (
                                <div className="p-3 text-center text-xs text-slate-400">
                                  Produk tidak ditemukan di katalog. Anda tetap dapat menginput SKU &amp; nama manual.
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Nama Produk */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Nama Produk <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={variant.nama_produk}
                            onChange={(e) =>
                              handleUpdateVariant(variant.id, { nama_produk: e.target.value })
                            }
                            placeholder="e.g. Oversized Shirt Sage"
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>

                        {/* Size Produk */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                            <span>Ukuran / Size</span>
                            <span className="text-[10px] text-slate-400">Pilih / Ketik</span>
                          </label>
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={variant.size}
                              onChange={(e) =>
                                handleUpdateVariant(variant.id, { size: e.target.value })
                              }
                              placeholder="e.g. S, M, L, XL, All Size"
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                            <div className="flex flex-wrap gap-1">
                              {SIZE_PRESETS.map((sz) => (
                                <button
                                  key={sz}
                                  type="button"
                                  onClick={() => handleUpdateVariant(variant.id, { size: sz })}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                    variant.size === sz
                                      ? 'bg-blue-600 text-white'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                                  }`}
                                >
                                  {sz}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* MODE 2: KODE PRODUKSI -> [Kode Produksi] | [Warna] | [Size] (Bukan Nama Produk) */
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {/* Kode Produksi */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
                            <Factory className="w-3.5 h-3.5 text-indigo-600" />
                            <span>Kode Produksi</span> <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="text"
                            required
                            value={variant.kode_produksi}
                            onChange={(e) =>
                              handleUpdateVariant(variant.id, { kode_produksi: e.target.value })
                            }
                            placeholder="e.g. PRD-2026-089 / CMT-14"
                            className="w-full px-3 py-2 rounded-xl border border-indigo-200 dark:border-indigo-900/60 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-xs font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>

                        {/* Warna */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Warna
                          </label>
                          <input
                            type="text"
                            value={variant.warna}
                            onChange={(e) =>
                              handleUpdateVariant(variant.id, { warna: e.target.value })
                            }
                            placeholder="e.g. Sage Green, Hitam, Broken White"
                            className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                          />
                        </div>

                        {/* Size */}
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                            <span>Ukuran / Size</span>
                            <span className="text-[10px] text-slate-400">Pilih / Ketik</span>
                          </label>
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={variant.size}
                              onChange={(e) =>
                                handleUpdateVariant(variant.id, { size: e.target.value })
                              }
                              placeholder="e.g. S, M, L, XL, All Size"
                              className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                            <div className="flex flex-wrap gap-1">
                              {SIZE_PRESETS.map((sz) => (
                                <button
                                  key={sz}
                                  type="button"
                                  onClick={() => handleUpdateVariant(variant.id, { size: sz })}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                    variant.size === sz
                                      ? 'bg-indigo-600 text-white'
                                      : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200'
                                  }`}
                                >
                                  {sz}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* KUANTITAS PEMERIKSAAN PER VARIANT (SATU SUMBER STATUS TERINTEGRASI) */}
                    <div
                      className={`p-3.5 rounded-xl border space-y-3 transition-colors ${
                        isReject
                          ? 'bg-rose-50/60 dark:bg-rose-950/25 border-rose-200 dark:border-rose-900/60'
                          : 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/60'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 dark:border-slate-700/60 pb-2.5">
                        <div className="flex items-center gap-2">
                          {isReject ? (
                            <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          )}
                          <span className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-slate-200">
                            {isReject ? 'Jumlah Qty Cacat / REJECT' : 'Jumlah Qty Lolos (OKE)'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              isReject
                                ? 'bg-rose-100 dark:bg-rose-900/50 text-rose-700 dark:text-rose-300'
                                : 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300'
                            }`}
                          >
                            {isReject ? 'Defect / Rusak' : 'Grade A / Lolos QC'}
                          </span>
                        </div>

                        {/* Preset Qty */}
                        <div className="flex flex-wrap items-center gap-1 text-xs">
                          <span className="text-[11px] text-slate-500 font-medium mr-1">Preset Qty:</span>
                          {[1, 5, 10, 25, 50, 100].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => handleQtyDiperiksaChange(variant.id, preset)}
                              className={`px-2 py-0.5 rounded text-[11px] font-bold transition-all ${
                                variant.qty_diperiksa === preset
                                  ? isReject
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Single Prominent Qty Input with Quick Stepper */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 max-w-xs">
                          <button
                            type="button"
                            onClick={() => handleQuickAddQty(variant.id, -1)}
                            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center justify-center shrink-0 text-lg active:scale-95 transition-all shadow-xs"
                            title="Kurang 1 pcs"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="1"
                            required
                            value={variant.qty_diperiksa === 0 ? '' : variant.qty_diperiksa}
                            onFocus={(e) => e.target.select()}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === '') {
                                handleQtyDiperiksaChange(variant.id, 0);
                              } else {
                                const num = parseInt(val, 10);
                                if (!isNaN(num)) {
                                  handleQtyDiperiksaChange(variant.id, Math.max(0, num));
                                }
                              }
                            }}
                            onBlur={() => {
                              if (!variant.qty_diperiksa || variant.qty_diperiksa <= 0) {
                                handleQtyDiperiksaChange(variant.id, 1);
                              }
                            }}
                            placeholder="1"
                            className={`w-32 text-center px-3 py-2 rounded-xl border font-black text-lg outline-none transition-all ${
                              isReject
                                ? 'border-rose-400 dark:border-rose-600 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 focus:ring-2 focus:ring-rose-500'
                                : 'border-emerald-400 dark:border-emerald-600 bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-300 focus:ring-2 focus:ring-emerald-500'
                            }`}
                          />
                          <button
                            type="button"
                            onClick={() => handleQuickAddQty(variant.id, 1)}
                            className="w-10 h-10 rounded-xl bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-600 flex items-center justify-center shrink-0 text-lg active:scale-95 transition-all shadow-xs"
                            title="Tambah 1 pcs"
                          >
                            +
                          </button>
                          <span className="text-xs font-bold text-slate-500 dark:text-slate-400 ml-1">
                            Pcs
                          </span>
                        </div>

                        {/* Status Summary Pill */}
                        <div className="text-xs">
                          {!isReject ? (
                            <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 font-medium">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span>
                                Semua <strong>{variant.qty_diperiksa || 1} pcs</strong> dinyatakan lolos mutu (OKE).
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-rose-700 dark:text-rose-300 font-medium">
                              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                              <span>
                                Semua <strong>{variant.qty_diperiksa || 1} pcs</strong> berstatus REJECT (diteruskan ke perbaikan).
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* DEFECT DETAILS (Only shown if status === 'REJECT' or qty_reject > 0) */}
                    {(isReject || variant.qty_reject > 0) && (
                      <div className="p-3.5 rounded-xl bg-rose-50/50 dark:bg-rose-950/25 border border-rose-200 dark:border-rose-900/60 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-rose-800 dark:text-rose-300">
                          <AlertTriangle className="w-4 h-4 text-rose-600" />
                          <span>Detail Kerusakan &amp; Alur Perbaikan Defect</span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Kategori Rusak */}
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Kategori Cacat / Rusak
                            </label>
                            <select
                              value={variant.kategori_rusak}
                              onChange={(e) =>
                                handleUpdateVariant(variant.id, { kategori_rusak: e.target.value })
                              }
                              className="w-full px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none"
                            >
                              {KATEGORI_RUSAK_OPTIONS.map((k) => (
                                <option key={k} value={k}>
                                  {k}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Target Penanganan */}
                          <div>
                            <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                              Target Penanganan Awal
                            </label>
                            <select
                              value={variant.target_penanganan}
                              onChange={(e) =>
                                handleUpdateVariant(variant.id, {
                                  target_penanganan: e.target.value as any,
                                })
                              }
                              className="w-full px-3 py-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs font-semibold focus:ring-2 focus:ring-rose-500 outline-none"
                            >
                              <option value="REJECT">REJECT (Sortir Umum)</option>
                              <option value="CUCI">CUCI (Pencucian Noda)</option>
                              <option value="PERMAK">PERMAK (Jahit Ulang / Vermak)</option>
                              <option value="DEFECT">DEFECT (BS Berat / Obral)</option>
                            </select>
                          </div>
                        </div>

                        {/* Deskripsi Kerusakan */}
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                            Titik &amp; Detail Kerusakan
                          </label>
                          <textarea
                            rows={2}
                            value={variant.detail_kerusakan}
                            onChange={(e) =>
                              handleUpdateVariant(variant.id, { detail_kerusakan: e.target.value })
                            }
                            placeholder="Contoh: Noda oli di keliman bawah rok depan, jahitan lengan kiri renggang..."
                            className="w-full px-3 py-2 rounded-lg border border-rose-200 dark:border-rose-900/80 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-rose-500 outline-none"
                          />
                        </div>

                        {/* Multi-Photo Upload & WebP Compressor */}
                        <div className="space-y-2">
                          <label className="block text-[11px] font-semibold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                            <span className="flex items-center gap-1.5">
                              <Camera className="w-3.5 h-3.5 text-rose-600" />
                              <span>Foto Bukti Cacat (Kompresi WebP Otomatis &lt;40KB)</span>
                            </span>
                            <span className="text-[10px] text-slate-500 font-normal">
                              {variant.photos.length} foto terlampir
                            </span>
                          </label>

                          <div className="flex flex-wrap items-center gap-2">
                            {/* Upload Button */}
                            <label className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-dashed border-rose-400 dark:border-rose-700 bg-rose-100/50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 text-xs font-semibold cursor-pointer transition-colors">
                              <UploadCloud className="w-4 h-4" />
                              <span>+ Lampirkan Foto</span>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                capture="environment"
                                onChange={(e) => handlePhotoUploadForVariant(variant.id, e)}
                                className="hidden"
                              />
                            </label>

                            {/* Photo Thumbnails */}
                            {variant.photos.map((p, pIdx) => (
                              <div
                                key={`qc-photo-${pIdx}-${p.dataUrl.slice(0, 20)}`}
                                className="relative group w-12 h-12 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 bg-black/10"
                              >
                                <img
                                  src={p.dataUrl}
                                  alt={`Bukti ${pIdx + 1}`}
                                  className="w-full h-full object-cover cursor-pointer"
                                  onClick={() =>
                                    setLightboxImages(variant.photos.map((item) => item.dataUrl))
                                  }
                                />
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhotoFromVariant(variant.id, pIdx)}
                                  className="absolute top-0.5 right-0.5 p-0.5 rounded bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                  title="Hapus foto"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                                <div className="absolute bottom-0 inset-x-0 bg-emerald-600 text-[8px] text-white font-bold text-center leading-tight py-0.2">
                                  -{p.savedPercent}%
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Catatan Tambahan Per Variant */}
                    <div>
                      <input
                        type="text"
                        value={variant.catatan}
                        onChange={(e) =>
                          handleUpdateVariant(variant.id, { catatan: e.target.value })
                        }
                        placeholder="Catatan khusus variant ini (opsional)..."
                        className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 text-xs focus:ring-1 focus:ring-blue-500 outline-none"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Action Bar: Add Variant + Submit Summary */}
            <div className="pt-2 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-t border-slate-200 dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddVariant}
                  className="px-4 py-2.5 rounded-xl font-bold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-2 shadow-xs"
                >
                  <Plus className="w-4 h-4 text-blue-600" />
                  <span>+ Tambah Variant / Produk Lain</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDuplicateVariant(variants[variants.length - 1]?.id)}
                  className="px-3.5 py-2.5 rounded-xl font-semibold text-xs bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 transition-all flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Duplikasi Terakhir</span>
                </button>
              </div>

              {/* Submit Button & Totals */}
              <div className="flex items-center gap-3">
                <div className="hidden sm:block text-right">
                  <div className="text-xs font-bold text-slate-900 dark:text-white">
                    {batchFormTotals.variantCount} Variant &bull; {batchFormTotals.totalQty} Pcs
                  </div>
                  <div className="text-[11px] text-slate-500">
                    <span className="text-emerald-600 font-bold">{batchFormTotals.totalOke} OKE</span>
                    {' &bull; '}
                    <span className="text-rose-600 font-bold">{batchFormTotals.totalReject} Reject</span>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-3 rounded-xl font-bold text-sm bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-md shadow-blue-500/25 transition-all flex items-center justify-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menyimpan Semua ({variants.length})...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Simpan Semua Laporan QC ({variants.length} Variant)</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>

      {/* 3. Riwayat Laporan QC Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
        {/* Table Header & Controls */}
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-900 dark:text-white text-base">
              Riwayat Laporan Inspeksi Mutu (QC)
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Menampilkan {filteredReports.length} dari {reports.length} total laporan inspeksi
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 font-semibold text-xs border border-emerald-200 dark:border-emerald-800 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Ekspor CSV</span>
            </button>

            <button
              type="button"
              onClick={async () => {
                setIsLoading(true);
                try {
                  const data = await fetchQcReportsFromSupabase();
                  if (data) setReports(data);
                  onShowToast('Data laporan QC berhasil disinkronisasi', 'info');
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={isLoading}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors disabled:opacity-50"
              title="Refresh data"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="p-4 bg-slate-50/70 dark:bg-slate-800/30 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
          {/* Search Box with Partial Match */}
          <div className="relative flex-1 min-w-[220px]">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari SKU, Kode Produksi, Warna, Nama, PIC..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-blue-500 outline-none"
            />
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter Status */}
          <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => setFilterStatus('ALL')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                filterStatus === 'ALL'
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Semua ({reports.length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('OKE')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                filterStatus === 'OKE'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
              }`}
            >
              OKE Lolos ({reports.filter((r) => r.status === 'OKE').length})
            </button>
            <button
              type="button"
              onClick={() => setFilterStatus('REJECT')}
              className={`px-3 py-1 text-xs rounded-lg font-medium transition-colors ${
                filterStatus === 'REJECT'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30'
              }`}
            >
              REJECT Defect ({reports.filter((r) => r.status === 'REJECT').length})
            </button>
          </div>

          {/* Filter Sumber */}
          <select
            value={filterSumber}
            onChange={(e) => setFilterSumber(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs focus:ring-2 focus:ring-blue-500 outline-none"
          >
            <option value="ALL">Semua Sumber Batch</option>
            {SUMBER_BATCH_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Reports Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-100/75 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 font-semibold">
                <th className="py-3 px-4">No. Laporan &amp; Tanggal</th>
                <th className="py-3 px-4">Identifikasi Produk</th>
                <th className="py-3 px-4 text-center">Status</th>
                <th className="py-3 px-4 text-center">Qty</th>
                <th className="py-3 px-4">Kategori &amp; Detail Kerusakan</th>
                <th className="py-3 px-4 text-center">Foto Bukti</th>
                <th className="py-3 px-4">PIC QC</th>
                <th className="py-3 px-4">Terusan Perbaikan</th>
                <th className="py-3 px-4 text-center">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-800 dark:text-slate-200">
              {filteredReports.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <ClipboardCheck className="w-8 h-8 opacity-40 text-slate-400" />
                      <span>Tidak ada data laporan QC yang cocok dengan filter.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredReports.map((r, rIdx) => {
                  const isReject = r.status === 'REJECT';
                  const isKode = r.tipe_identifikasi === 'kode_produksi' || !!r.kode_produksi;

                  return (
                    <tr
                      key={r.id ? `qc-rep-id-${r.id}` : (r.report_no ? `qc-rep-no-${r.report_no}-${rIdx}` : `qc-rep-idx-${rIdx}`)}
                      className="hover:bg-slate-50/75 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      {/* No Laporan & Tanggal */}
                      <td className="py-3.5 px-4">
                        <div className="font-mono font-bold text-slate-900 dark:text-white">
                          {r.report_no}
                        </div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3" />
                          <span>
                            {r.tanggal
                              ? new Date(r.tanggal).toLocaleDateString('id-ID', {
                                  day: '2-digit',
                                  month: 'short',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : '-'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          Sumber:{' '}
                          <span className="font-medium text-slate-700 dark:text-slate-300">
                            {r.sumber_batch}
                          </span>
                        </div>
                      </td>

                      {/* Identifikasi Produk */}
                      <td className="py-3.5 px-4 max-w-[240px]">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-extrabold uppercase ${
                              isKode
                                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300'
                                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'
                            }`}
                          >
                            {isKode ? 'Kode Produksi' : 'SKU'}
                          </span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white">
                            {r.sku}
                          </span>
                        </div>

                        <div
                          className="font-medium text-slate-800 dark:text-slate-100 truncate"
                          title={r.nama_produk}
                        >
                          {r.nama_produk}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[10px] text-slate-400">
                          {r.warna && (
                            <span>
                              Warna:{' '}
                              <strong className="text-slate-600 dark:text-slate-300">
                                {r.warna}
                              </strong>
                            </span>
                          )}
                          {r.size && r.size !== '-' && (
                            <span>
                              Size:{' '}
                              <strong className="text-slate-600 dark:text-slate-300">
                                {r.size}
                              </strong>
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3.5 px-4 text-center">
                        {isReject ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
                            <AlertTriangle className="w-3 h-3" />
                            REJECT
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                            <CheckCircle2 className="w-3 h-3" />
                            OKE Lolos
                          </span>
                        )}
                      </td>

                      {/* Qty */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="font-semibold text-slate-900 dark:text-white">
                          {r.qty_diperiksa} pcs
                        </div>
                        <div className="text-[10px] mt-0.5">
                          <span className="text-emerald-600 font-medium">OK: {r.qty_oke}</span>
                          {r.qty_reject > 0 && (
                            <span className="text-rose-600 font-bold ml-1.5">
                              RJC: {r.qty_reject}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Kategori & Detail Kerusakan */}
                      <td className="py-3.5 px-4 max-w-[240px]">
                        {isReject ? (
                          <div>
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
                              {r.kategori_rusak || 'Defect'}
                            </span>
                            <div
                              className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 line-clamp-2"
                              title={r.detail_kerusakan}
                            >
                              {r.detail_kerusakan || '-'}
                            </div>
                          </div>
                        ) : (
                          <div className="text-[11px] text-emerald-700 dark:text-emerald-400 font-medium italic">
                            {r.catatan || 'Kualitas lolos Grade A tanpa cacat'}
                          </div>
                        )}
                      </td>

                      {/* Foto Bukti */}
                      <td className="py-3.5 px-4 text-center">
                        {r.foto_urls && r.foto_urls.length > 0 ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => setLightboxImages(r.foto_urls)}
                              className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 w-9 h-9 flex-shrink-0"
                              title="Klik untuk memperbesar foto"
                            >
                              <img
                                src={r.foto_urls[0]}
                                alt="Foto"
                                referrerPolicy="no-referrer"
                                className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                              />
                              {r.foto_urls.length > 1 && (
                                <span className="absolute inset-0 bg-black/50 text-white font-bold text-[10px] flex items-center justify-center">
                                  +{r.foto_urls.length - 1}
                                </span>
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">-</span>
                        )}
                        {r.gdrive_link && (
                          <div className="mt-1">
                            <a
                              href={r.gdrive_link}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                              title="Buka Google Drive"
                            >
                              <ExternalLink className="w-2.5 h-2.5" />
                              <span>GDrive</span>
                            </a>
                          </div>
                        )}
                      </td>

                      {/* PIC QC */}
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200 flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400" />
                          <span>{r.pic_qc || '-'}</span>
                        </div>
                      </td>

                      {/* Terusan Perbaikan */}
                      <td className="py-3.5 px-4">
                        {r.perbaikan_ticket_no ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (onNavigateToPerbaikan) {
                                onNavigateToPerbaikan(r.perbaikan_ticket_no);
                              }
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-mono text-[11px] font-bold border border-rose-200 dark:border-rose-900 transition-colors"
                            title="Klik untuk buka antrean di Tab Perbaikan & Defect"
                          >
                            <Scissors className="w-3 h-3 text-rose-600" />
                            <span>#{r.perbaikan_ticket_no}</span>
                            <ArrowRight className="w-2.5 h-2.5 opacity-60" />
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">-</span>
                        )}
                      </td>

                      {/* Aksi */}
                      <td className="py-3.5 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {/* Edit Action (Akses Admin) */}
                          <button
                            type="button"
                            onClick={() => handleOpenEdit(r)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              canEditData
                                ? 'hover:bg-blue-50 dark:hover:bg-blue-950/40 text-slate-400 hover:text-blue-600'
                                : 'hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-300 dark:text-slate-600 hover:text-amber-600'
                            }`}
                            title={
                              canEditData
                                ? 'Edit Laporan QC (Akses Admin)'
                                : 'Edit Laporan QC (Diperlukan hak akses Admin)'
                            }
                          >
                            <Pencil className="w-4 h-4" />
                          </button>

                          {/* Delete Action */}
                          <button
                            type="button"
                            onClick={() => handleRequestDelete(r)}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                              canDeleteData
                                ? 'hover:bg-rose-50 dark:hover:bg-rose-950/40 text-slate-400 hover:text-rose-600'
                                : 'hover:bg-amber-50 dark:hover:bg-amber-950/40 text-slate-300 dark:text-slate-600 hover:text-amber-600'
                            }`}
                            title={
                              canDeleteData
                                ? 'Hapus Laporan QC'
                                : 'Hapus Laporan QC (Diperlukan hak akses Admin)'
                            }
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Lightbox Modal Preview Foto */}
      {lightboxImages && lightboxImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setLightboxImages(null)}
        >
          <div
            className="relative max-w-3xl w-full max-h-[90vh] bg-slate-900 rounded-2xl p-4 overflow-hidden border border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-white">
              <span className="text-sm font-semibold">
                Dokumentasi Foto Bukti QC ({lightboxImages.length} Foto)
              </span>
              <button
                type="button"
                onClick={() => setLightboxImages(null)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="mt-4 space-y-4 overflow-y-auto max-h-[75vh]">
              {lightboxImages.map((src, i) => (
                <div key={`qc-lightbox-${i}-${src.slice(0, 20)}`} className="rounded-xl overflow-hidden bg-black/50 flex items-center justify-center">
                  <img src={src} alt={`Foto ${i + 1}`} referrerPolicy="no-referrer" className="max-w-full max-h-[70vh] object-contain" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 5. Supabase SQL DDL Schema Modal */}
      {isSqlModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setIsSqlModalOpen(false)}
        >
          <div
            className="relative max-w-2xl w-full bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    Script SQL Supabase: Tabel qc_reports
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Skrip DDL PostgreSQL untuk membuat tabel dedicated di database Supabase Anda
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSqlModalOpen(false)}
                className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/60 text-xs text-blue-900 dark:text-blue-300 leading-relaxed">
              <strong>Info Arsitektur:</strong> Sistem saat ini telah menerapkan <em>Dual-Layer Cloud Persistence</em>. Laporan QC Anda sudah tersimpan otomatis di Supabase dan langsung tersinkronisasi. Jika Anda ingin membuat tabel dedicated <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 py-0.5 rounded">public.qc_reports</code>, salin skrip di bawah dan jalankan di <strong>SQL Editor</strong> dashboard Supabase Anda.
            </div>

            <div className="relative">
              <pre className="p-4 rounded-xl bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto max-h-60 border border-slate-800 leading-relaxed">
                {QC_REPORTS_SUPABASE_DDL_SQL.trim()}
              </pre>
            </div>

            <div className="flex items-center justify-between gap-3 pt-2">
              <span className="text-[11px] text-slate-500">
                Mencakup tabel, index pencarian, policy RLS, dan relasi tabel perbaikan.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsSqlModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(QC_REPORTS_SUPABASE_DDL_SQL.trim());
                    setIsCopiedSql(true);
                    onShowToast('Script SQL berhasil disalin ke clipboard!', 'success');
                    setTimeout(() => setIsCopiedSql(false), 2500);
                  }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-colors"
                >
                  {isCopiedSql ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Tersalin!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Salin Script SQL</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 6. Custom Delete Confirmation Modal (Bypass iframe confirm block) */}
      {deleteConfirmReport && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
          onClick={() => !isDeleting && setDeleteConfirmReport(null)}
        >
          <div
            className="relative max-w-md w-full bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-2xl border border-slate-200 dark:border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0 border border-rose-200 dark:border-rose-900">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Hapus Laporan QC #{deleteConfirmReport.report_no}?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Konfirmasi penghapusan data inspeksi QC
                </p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/60 text-xs space-y-2 mb-5">
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Produk:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 text-right truncate max-w-[200px]" title={deleteConfirmReport.nama_produk}>
                  {deleteConfirmReport.nama_produk}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">SKU / Kode:</span>
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {deleteConfirmReport.sku || '-'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Status &amp; Qty:</span>
                <span className={`font-bold ${deleteConfirmReport.status === 'REJECT' ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                  {deleteConfirmReport.status} ({deleteConfirmReport.qty_diperiksa} pcs)
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">PIC QC:</span>
                <span className="text-slate-700 dark:text-slate-300">
                  {deleteConfirmReport.pic_qc || '-'}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-5 leading-relaxed">
              Data laporan QC ini akan dihapus secara permanen dari Supabase dan cache lokal sistem. Tindakan ini tidak dapat dibatalkan.
            </p>

            <div className="flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteConfirmReport(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white transition-all flex items-center gap-1.5 shadow-sm shadow-rose-600/30 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Edit QC Report Modal (Akses Admin) */}
      {editingReport && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-fade-in"
          onClick={() => !isSavingEdit && setEditingReport(null)}
        >
          <div
            className="relative max-w-2xl w-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header Modal */}
            <div className="p-4 sm:p-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                  <Pencil className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-white">Edit Laporan QC</h3>
                    <span className="font-mono text-xs bg-white/20 px-2 py-0.5 rounded-md font-bold">
                      #{editingReport.report_no}
                    </span>
                  </div>
                  <p className="text-xs text-blue-100 mt-0.5">
                    Perbarui data hasil inspeksi QC produk (Khusus Hak Akses Admin)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                disabled={isSavingEdit}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Input */}
            <form onSubmit={handleSaveEdit} className="p-4 sm:p-6 space-y-4 max-h-[78vh] overflow-y-auto">
              {/* Identifikasi Produk */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    Nama Produk *
                  </label>
                  <input
                    type="text"
                    value={editNamaProduk}
                    onChange={(e) => setEditNamaProduk(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-semibold"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    SKU / Barcode / Kode Produksi
                  </label>
                  <input
                    type="text"
                    value={editSku}
                    onChange={(e) => setEditSku(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              {/* Warna, Ukuran, Sumber Batch */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    Warna
                  </label>
                  <input
                    type="text"
                    value={editWarna}
                    onChange={(e) => setEditWarna(e.target.value)}
                    placeholder="e.g. Navy / Mocca"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    Ukuran (Size)
                  </label>
                  <select
                    value={editSize}
                    onChange={(e) => setEditSize(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  >
                    <option value="-">- Tidak Ada -</option>
                    {SIZE_PRESETS.map((sz) => (
                      <option key={sz} value={sz}>{sz}</option>
                    ))}
                    {!SIZE_PRESETS.includes(editSize) && editSize && editSize !== '-' && (
                      <option value={editSize}>{editSize}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    Sumber Batch
                  </label>
                  <select
                    value={editSumberBatch}
                    onChange={(e) => setEditSumberBatch(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-blue-500"
                  >
                    {SUMBER_BATCH_OPTIONS.map((sb) => (
                      <option key={sb} value={sb}>{sb}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status QC & Kuantitas */}
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 space-y-3">
                <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 block">
                  Status Kelayakan &amp; Kuantitas
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setEditStatus('OKE');
                      setEditQtyOke(editQtyDiperiksa);
                      setEditQtyReject(0);
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      editStatus === 'OKE'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>OKE (Lolos QC)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditStatus('REJECT');
                      setEditQtyReject(editQtyDiperiksa);
                      setEditQtyOke(0);
                    }}
                    className={`py-2 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      editStatus === 'REJECT'
                        ? 'bg-rose-600 text-white border-rose-600 shadow-sm'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    <AlertTriangle className="w-4 h-4" />
                    <span>REJECT (Cacat / Rusak)</span>
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2.5 pt-1">
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                      Qty Diperiksa
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={editQtyDiperiksa}
                      onChange={(e) => {
                        const val = Math.max(1, Number(e.target.value) || 1);
                        setEditQtyDiperiksa(val);
                        if (editStatus === 'OKE') {
                          setEditQtyOke(val);
                          setEditQtyReject(0);
                        } else {
                          setEditQtyReject(val);
                          setEditQtyOke(0);
                        }
                      }}
                      className="w-full px-2.5 py-1.5 text-xs text-center font-bold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                      Qty OKE
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={editQtyOke}
                      onChange={(e) => setEditQtyOke(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full px-2.5 py-1.5 text-xs text-center font-bold rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400 block mb-1">
                      Qty Reject
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={editQtyReject}
                      onChange={(e) => setEditQtyReject(Math.max(0, Number(e.target.value) || 0))}
                      className="w-full px-2.5 py-1.5 text-xs text-center font-bold rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300"
                    />
                  </div>
                </div>
              </div>

              {/* Jika REJECT: Kategori, Target, & Detail Kerusakan */}
              {editStatus === 'REJECT' && (
                <div className="p-3.5 bg-rose-50/60 dark:bg-rose-950/30 rounded-xl border border-rose-200 dark:border-rose-800/60 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-rose-900 dark:text-rose-200 mb-1 block">
                        Kategori Kerusakan
                      </label>
                      <select
                        value={editKategoriRusak}
                        onChange={(e) => setEditKategoriRusak(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                      >
                        {KATEGORI_RUSAK_OPTIONS.map((kr) => (
                          <option key={kr} value={kr}>{kr}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-rose-900 dark:text-rose-200 mb-1 block">
                        Target Penanganan
                      </label>
                      <select
                        value={editTargetPenanganan}
                        onChange={(e) => setEditTargetPenanganan(e.target.value as any)}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                      >
                        <option value="REJECT">REJECT (Gudang Reject)</option>
                        <option value="CUCI">CUCI (Laundry / Bersihkan Noda)</option>
                        <option value="PERMAK">PERMAK (Jahit Ulang / Vermak)</option>
                        <option value="DEFECT">DEFECT (Obral / Reject Minor)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-rose-900 dark:text-rose-200 mb-1 block">
                      Detail Kerusakan Produk
                    </label>
                    <textarea
                      value={editDetailKerusakan}
                      onChange={(e) => setEditDetailKerusakan(e.target.value)}
                      rows={2}
                      placeholder="Deskripsi letak noda, bagian jahitan sobek, kancing patah, dll..."
                      className="w-full px-3 py-2 text-xs rounded-xl border border-rose-300 dark:border-rose-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Lokasi & PIC Pemeriksa */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    Lokasi Rak / Area Barang
                  </label>
                  <input
                    type="text"
                    value={editLokasiBarang}
                    onChange={(e) => setEditLokasiBarang(e.target.value)}
                    placeholder="e.g. QC-01 / Rak R01"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    PIC Pemeriksa QC
                  </label>
                  <input
                    type="text"
                    value={editPicQc}
                    onChange={(e) => setEditPicQc(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Catatan & Link GDrive */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    Catatan Inspeksi
                  </label>
                  <input
                    type="text"
                    value={editCatatan}
                    onChange={(e) => setEditCatatan(e.target.value)}
                    placeholder="Catatan tambahan..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 block">
                    Link Arsip Google Drive (Opsional)
                  </label>
                  <input
                    type="url"
                    value={editGdriveLink}
                    onChange={(e) => setEditGdriveLink(e.target.value)}
                    placeholder="https://drive.google.com/..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Foto Bukti */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    Dokumentasi Foto Bukti ({editPhotos.length})
                  </label>
                  <label className="px-2.5 py-1 text-[11px] font-bold bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/60 flex items-center gap-1">
                    <Camera className="w-3.5 h-3.5" />
                    <span>Tambah Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleEditPhotoUpload}
                    />
                  </label>
                </div>

                {editPhotos.length > 0 ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {editPhotos.map((photo, pIdx) => (
                      <div
                        key={`edit-photo-${pIdx}`}
                        className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-square bg-slate-100 dark:bg-slate-800"
                      >
                        <img
                          src={photo.dataUrl}
                          alt={`Foto ${pIdx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setEditPhotos((prev) => prev.filter((_, idx) => idx !== pIdx))}
                          className="absolute top-1 right-1 w-6 h-6 bg-rose-600 text-white rounded-full flex items-center justify-center opacity-85 hover:opacity-100 transition-opacity shadow cursor-pointer"
                          title="Hapus foto ini"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-3 text-center text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                    Belum ada foto bukti tersimpan.
                  </div>
                )}
              </div>

              {/* Tombol Simpan & Batal */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isSavingEdit}
                  onClick={() => setEditingReport(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-md shadow-blue-600/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingEdit ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Simpan Perubahan</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
