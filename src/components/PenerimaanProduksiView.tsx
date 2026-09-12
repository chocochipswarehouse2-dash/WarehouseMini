import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Truck,
  Package,
  Layers,
  Search,
  Filter,
  RefreshCw,
  Plus,
  Trash2,
  Edit,
  Camera,
  Upload,
  Download,
  X,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Maximize2,
  FileText,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  ArrowUpDown,
  Eye,
  Info,
  Building2,
  Calendar,
  Share2,
} from 'lucide-react';
import {
  UserSession,
  ProductItem,
  PenerimaanProduksiItem,
  PenerimaanProdukBlock,
  PenerimaanVariantItem,
  SimpanPenerimaanPayload,
} from '../types';
import { globalRealtimeStore } from '../services/store';
import {
  fetchPenerimaanProduksiFromSupabase,
  simpanBatchPenerimaanProduksiToSupabase,
  updateBatchPenerimaanProduksiInSupabase,
  hapusBatchPenerimaanProduksiFromSupabase,
  hapusPenerimaanProduksiSingleRowFromSupabase,
  getSupabaseClient,
  syncOfflinePenerimaanProduksi,
} from '../services/supabase';
import { compressImage } from '../utils/imageCompressor';
import { uploadMultipleImagesToGdrive } from '../services/gdriveUpload';
import { normalizeWhatsAppNumber } from '../services/whatsapp';

interface PenerimaanProduksiViewProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

type TabMode = 'riwayat' | 'input';

const STANDARD_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'ALL SIZE', 'FREE SIZE', 'Default'];

export const PenerimaanProduksiView: React.FC<PenerimaanProduksiViewProps> = ({
  session,
  productCatalog = [],
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<TabMode>('riwayat');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  // Initial load from local cache to save network roundtrips & egress
  const [dataList, setDataList] = useState<PenerimaanProduksiItem[]>(() => {
    try {
      const cached = localStorage.getItem('wms_local_penerimaan_produksi');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterKategori, setFilterKategori] = useState<string>('Semua');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const rowsPerPage = 50;

  // Form State: Header Surat Jalan
  const [formKategori, setFormKategori] = useState<'Lokal CMT' | 'Kargo'>('Lokal CMT');
  const [formTanggal, setFormTanggal] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [formNoSuratJalan, setFormNoSuratJalan] = useState<string>('');
  const [formKeteranganGlobal, setFormKeteranganGlobal] = useState<string>('');

  // Form State: Product Blocks
  const [productBlocks, setProductBlocks] = useState<PenerimaanProdukBlock[]>([
    {
      id: Date.now(),
      kode_produksi: '',
      catatan: '',
      foto_url: '',
      variants: [{ warna: '', size: 'S', qty: 1 }],
    },
  ]);

  // Modals
  const [lightboxImage, setLightboxImage] = useState<{
    url: string;
    title: string;
    subtitle?: string;
  } | null>(null);

  // Edit Batch Modal
  const [editingBatch, setEditingBatch] = useState<{
    no_surat_jalan: string;
    orig_no_surat_jalan: string;
    kategori: string;
    tanggal: string;
    keterangan: string;
    items: (PenerimaanProduksiItem & { tempId: string | number })[];
  } | null>(null);
  const [isUpdatingBatch, setIsUpdatingBatch] = useState<boolean>(false);

  // Delete Confirm Modal
  const [deletingTarget, setDeletingTarget] = useState<{
    type: 'single' | 'batch';
    id?: string | number;
    no_surat_jalan: string;
    kode_produksi?: string;
    totalRows?: number;
    totalQty?: number;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Share Modal
  const [shareModal, setShareModal] = useState<{
    isOpen: boolean;
    noSuratJalan: string;
    targetType: 'wa' | 'email';
    targetValue: string;
  }>({ isOpen: false, noSuratJalan: '', targetType: 'wa', targetValue: '' });

  // Webcam Modal
  const [webcamOpen, setWebcamOpen] = useState<boolean>(false);
  const [activeWebcamBlockIndex, setActiveWebcamBlockIndex] = useState<number | null>(null);
  const [editModalWebcamIndex, setEditModalWebcamIndex] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  // Load Data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const res = await fetchPenerimaanProduksiFromSupabase({
        kategori: filterKategori !== 'Semua' ? filterKategori : undefined,
        startDate: filterStartDate || undefined,
        endDate: filterEndDate || undefined,
      });
      setDataList(res);
    } catch (err: any) {
      console.error('Gagal memuat penerimaan produksi:', err);
      onShowToast('Gagal memuat riwayat penerimaan barang', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const [isSyncing, setIsSyncing] = useState(false);
  const handleSyncOffline = async () => {
    setIsSyncing(true);
    try {
      const result = await syncOfflinePenerimaanProduksi();
      if (result.synced > 0) {
        onShowToast(`Berhasil menyinkronkan ${result.synced} data offline ke Supabase.`, 'success');
      }
      if (result.failed > 0) {
        onShowToast(`Gagal menyinkronkan ${result.failed} data: ${result.errors[0] || 'Unknown Error'}`, 'error');
      }
      if (result.synced === 0 && result.failed === 0) {
        onShowToast(`Tidak ada data offline yang perlu disinkronkan.`, 'info');
      }
      await loadData();
    } catch (err: any) {
      onShowToast(`Terjadi kesalahan saat sync: ${err.message}`, 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterKategori, filterStartDate, filterEndDate]);

  // Window event & Realtime listener
  useEffect(() => {
    const handleUpdateEvent = () => {
      loadData();
    };

    window.addEventListener('wms_penerimaan_produksi_updated', handleUpdateEvent);

    // Supabase Realtime Channel
    let debounceTimer: any = null;
    const triggerDebouncedSync = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadData();
      }, 400);
    };

    const unsub = globalRealtimeStore.subscribe('penerimaan_produksi', triggerDebouncedSync);

    return () => {
      window.removeEventListener('wms_penerimaan_produksi_updated', handleUpdateEvent);
      if (debounceTimer) clearTimeout(debounceTimer);
      unsub();
    };
  }, []);

  // Filtered List
  const filteredData = useMemo(() => {
    return dataList.filter((item) => {
      // Filter Kategori
      if (filterKategori !== 'Semua' && item.kategori !== filterKategori) {
        return false;
      }
      // Filter Date
      if (filterStartDate && item.tanggal_penerimaan < filterStartDate) {
        return false;
      }
      if (filterEndDate && item.tanggal_penerimaan > filterEndDate) {
        return false;
      }
      // Filter Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchKode = (item.kode_produksi || '').toLowerCase().includes(q);
        const matchSJ = (item.no_surat_jalan || '').toLowerCase().includes(q);
        const matchWarna = (item.warna || '').toLowerCase().includes(q);
        const matchKet = (item.keterangan || '').toLowerCase().includes(q);
        const matchOp = (item.operator || '').toLowerCase().includes(q);
        if (!matchKode && !matchSJ && !matchWarna && !matchKet && !matchOp) {
          return false;
        }
      }
      return true;
    });
  }, [dataList, filterKategori, filterStartDate, filterEndDate, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    let totalPcs = 0;
    let lokalCmtPcs = 0;
    let kargoPcs = 0;

    for (const d of filteredData) {
      const q = Number(d.qty) || 0;
      totalPcs += q;
      if (d.kategori === 'Lokal CMT') {
        lokalCmtPcs += q;
      } else if (d.kategori === 'Kargo') {
        kargoPcs += q;
      }
    }

    return {
      totalRows: filteredData.length,
      totalPcs,
      lokalCmtPcs,
      kargoPcs,
    };
  }, [filteredData]);

  // Pagination
  const totalPages = Math.max(1, Math.ceil(filteredData.length / rowsPerPage));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filteredData.slice(start, start + rowsPerPage);
  }, [filteredData, currentPage, rowsPerPage]);

  // WebCam Stream Helpers
  const startWebcam = async (blockIndex: number | null, isEditModal = false) => {
    if (isEditModal) {
      setEditModalWebcamIndex(blockIndex);
      setActiveWebcamBlockIndex(null);
    } else {
      setActiveWebcamBlockIndex(blockIndex);
      setEditModalWebcamIndex(null);
    }
    setWebcamOpen(true);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      console.error('Tidak dapat mengakses kamera:', err);
      onShowToast('Tidak dapat mengakses kamera perangkat. Silakan pilih file biasa.', 'error');
      setWebcamOpen(false);
    }
  };

  const stopWebcam = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
    }
    setWebcamOpen(false);
    setActiveWebcamBlockIndex(null);
    setEditModalWebcamIndex(null);
  };

  const captureWebcamPhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

    stopWebcam();

    if (activeWebcamBlockIndex !== null) {
      updateProductBlockPhoto(activeWebcamBlockIndex, dataUrl);
      onShowToast('Foto berhasil diambil dari kamera!', 'success');
    } else if (editModalWebcamIndex !== null && editingBatch) {
      const updated = [...editingBatch.items];
      if (updated[editModalWebcamIndex]) {
        updated[editModalWebcamIndex].foto_url = dataUrl;
        setEditingBatch({ ...editingBatch, items: updated });
        onShowToast('Foto item berhasil diupdate!', 'success');
      }
    }
  };

  // Image File Upload Helper with Canvas WebP Compression
  const handleImageUpload = async (file: File, blockIndex: number) => {
    try {
      const res = await compressImage(file, 1024, 0.75);
      updateProductBlockPhoto(blockIndex, res.dataUrl);
      onShowToast(`Foto produk terkompresi (${Math.round(res.compressedSize / 1024)} KB)`, 'success');
    } catch (err: any) {
      console.error('Gagal kompres foto:', err);
      onShowToast('Gagal memproses gambar foto', 'error');
    }
  };

  const updateProductBlockPhoto = (index: number, dataUrl: string) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = { ...next[index], foto_url: dataUrl };
      }
      return next;
    });
  };

  // Form Product Blocks Management
  const addProductBlock = () => {
    setProductBlocks((prev) => [
      ...prev,
      {
        id: Date.now() + Math.random(),
        kode_produksi: '',
        catatan: '',
        foto_url: '',
        variants: [{ warna: '', size: 'S', qty: 1 }],
      },
    ]);
  };

  const removeProductBlock = (index: number) => {
    if (productBlocks.length <= 1) {
      onShowToast('Minimal harus ada 1 kode produksi.', 'warning');
      return;
    }
    setProductBlocks((prev) => prev.filter((_, idx) => idx !== index));
  };

  const updateProductBlockField = (index: number, field: 'kode_produksi' | 'catatan', val: string) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      if (next[index]) {
        next[index] = {
          ...next[index],
          [field]: field === 'kode_produksi' ? val.toUpperCase() : val,
        };
      }
      return next;
    });
  };

  // Variant Helpers with Auto Next-Size Suggestion
  const getNextSize = (currentSize: string): string => {
    const s = currentSize.trim().toUpperCase();
    const idx = STANDARD_SIZES.indexOf(s);
    if (idx >= 0 && idx < STANDARD_SIZES.length - 1) {
      return STANDARD_SIZES[idx + 1];
    }
    return 'M';
  };

  const addVariantToBlock = (blockIndex: number) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      const target = next[blockIndex];
      if (!target) return prev;

      const lastVariant = target.variants[target.variants.length - 1];
      const lastSize = lastVariant ? lastVariant.size : 'S';
      const lastWarna = lastVariant ? lastVariant.warna : '';
      const nextSize = getNextSize(lastSize);

      target.variants.push({
        warna: lastWarna,
        size: nextSize,
        qty: 1,
      });

      return next;
    });
  };

  const removeVariantFromBlock = (blockIndex: number, variantIndex: number) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      const target = next[blockIndex];
      if (!target || target.variants.length <= 1) {
        onShowToast('Minimal harus ada 1 baris varian untuk setiap kode produk.', 'warning');
        return prev;
      }
      target.variants = target.variants.filter((_, idx) => idx !== variantIndex);
      return next;
    });
  };

  const updateVariantInBlock = (
    blockIndex: number,
    variantIndex: number,
    field: keyof PenerimaanVariantItem,
    val: string | number
  ) => {
    setProductBlocks((prev) => {
      const next = [...prev];
      const target = next[blockIndex];
      if (!target || !target.variants[variantIndex]) return prev;

      const v = { ...target.variants[variantIndex] };
      if (field === 'qty') {
        v.qty = Math.max(1, Number(val) || 1);
      } else if (field === 'warna') {
        v.warna = String(val).toUpperCase();
      } else {
        (v as any)[field] = String(val);
      }
      target.variants[variantIndex] = v;
      return next;
    });
  };

  // Form Summary live calculation
  const formSummary = useMemo(() => {
    let totalKode = 0;
    let totalVariants = 0;
    let totalPcs = 0;

    for (const b of productBlocks) {
      if (b.kode_produksi.trim()) totalKode++;
      for (const v of b.variants) {
        totalVariants++;
        totalPcs += Number(v.qty) || 0;
      }
    }

    return { totalKode, totalVariants, totalPcs };
  }, [productBlocks]);

  // Reset Form
  const handleResetForm = () => {
    setFormTanggal(new Date().toISOString().split('T')[0]);
    setFormNoSuratJalan('');
    setFormKeteranganGlobal('');
    setProductBlocks([
      {
        id: Date.now(),
        kode_produksi: '',
        catatan: '',
        foto_url: '',
        variants: [{ warna: '', size: 'S', qty: 1 }],
      },
    ]);
  };

  // Submit Form (Batch Save)
  const handleSubmitPenerimaan = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formNoSuratJalan.trim()) {
      onShowToast('No. Surat Jalan / Resi wajib diisi!', 'error');
      return;
    }

    // Validate product blocks
    const cleanedBlocks: PenerimaanProdukBlock[] = [];
    for (let i = 0; i < productBlocks.length; i++) {
      const b = productBlocks[i];
      const kode = b.kode_produksi.trim();
      if (!kode) {
        onShowToast(`Kode Produksi pada Produk #${i + 1} belum diisi!`, 'error');
        return;
      }

      for (let j = 0; j < b.variants.length; j++) {
        const v = b.variants[j];
        if (!v.warna.trim()) {
          onShowToast(`Warna pada ${kode} baris #${j + 1} belum diisi!`, 'warning');
          return;
        }
      }

      cleanedBlocks.push({
        ...b,
        kode_produksi: kode.toUpperCase(),
      });
    }

    setIsSaving(true);
    try {
      // 1. Upload photos to GDrive / Storage if dataUrls are large
      for (const block of cleanedBlocks) {
        if (block.foto_url && block.foto_url.startsWith('data:')) {
          try {
            const uploadedUrls = await uploadMultipleImagesToGdrive(
              [block.foto_url],
              `PENERIMAAN_${formNoSuratJalan.replace(/[^a-zA-Z0-9]/g, '_')}_${block.kode_produksi}`
            );
            if (uploadedUrls && uploadedUrls.length > 0) {
              block.foto_url = uploadedUrls[0];
            }
          } catch (ePhoto) {
            console.warn('Gagal upload foto ke Cloud Storage, fallback simpan data:', ePhoto);
          }
        }
      }

      // 2. Prepare payload
      const payload: SimpanPenerimaanPayload = {
        tanggal: formTanggal,
        kategori: formKategori,
        no_surat_jalan: formNoSuratJalan.trim().toUpperCase(),
        keterangan: formKeteranganGlobal.trim(),
        produk_list: cleanedBlocks,
      };

      const operatorName = session?.name || session?.username || 'Operator Gudang';
      await simpanBatchPenerimaanProduksiToSupabase(payload, operatorName);

      onShowToast(
        `Sukses menyimpan kedatangan ${cleanedBlocks.length} kode produksi (${formSummary.totalPcs} pcs)!`,
        'success'
      );
      handleResetForm();
      setActiveTab('riwayat');
      loadData();
    } catch (err: any) {
      console.error('Gagal simpan penerimaan:', err);
      onShowToast(`Gagal menyimpan: ${err.message || 'Terjadi kesalahan sistem'}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Open Share Modal
  const handleOpenShare = (noSuratJalan: string) => {
    setShareModal({
      isOpen: true,
      noSuratJalan: noSuratJalan,
      targetType: 'wa',
      targetValue: ''
    });
  };

  // Handle Share Submit
  const handleShareSubmit = () => {
    const { noSuratJalan, targetType, targetValue } = shareModal;
    if (!targetValue.trim()) {
      onShowToast(`Silakan masukkan ${targetType === 'wa' ? 'nomor WA' : 'alamat Email'}.`, 'error');
      return;
    }
    
    const items = dataList.filter((d) => (d.no_surat_jalan || '').trim().toUpperCase() === (noSuratJalan || '').trim().toUpperCase());
    if (items.length === 0) {
      onShowToast('Data tidak ditemukan.', 'error');
      return;
    }
    
    if (targetType === 'wa') {
      const totalQty = items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      
      // Group items by kode_produksi
      const groupedItems: Record<string, typeof items> = {};
      items.forEach(item => {
        const kode = (item.kode_produksi || 'Tanpa Kode').trim();
        if (!groupedItems[kode]) {
          groupedItems[kode] = [];
        }
        groupedItems[kode].push(item);
      });

      let waText = `*DATA PENERIMAAN BARANG*\nNo. Surat Jalan: *${noSuratJalan}*\nTotal Qty: ${totalQty} pcs\n\n*Daftar Barang:*\n`;
      
      Object.keys(groupedItems).forEach(kode => {
        const group = groupedItems[kode];
        const groupTotalQty = group.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
        waText += `\n📦 *${kode}* (Total: ${groupTotalQty} pcs)\n`;
        group.forEach(item => {
          waText += `   - ${item.warna} | Size ${item.size}: *${item.qty} pcs*\n`;
        });
      });
      
      const cleanPhone = normalizeWhatsAppNumber(targetValue) || targetValue;
      const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(waText)}`;
      window.open(url, '_blank');
      setShareModal(prev => ({ ...prev, isOpen: false }));
      onShowToast('Membuka WhatsApp...', 'success');
    } else {
      // CSV Export
      const headers = ['Tanggal', 'Kategori', 'No Surat Jalan', 'Kode Produksi', 'Warna', 'Size', 'Qty', 'Catatan', 'Operator'];
      const rows = items.map(it => [
        it.tanggal_penerimaan,
        it.kategori,
        it.no_surat_jalan,
        it.kode_produksi,
        it.warna,
        it.size,
        it.qty,
        it.keterangan || '-',
        it.operator || '-'
      ]);
      const csvContent = [
        headers.join(','),
        ...rows.map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      ].join('\n');
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `Penerimaan_${noSuratJalan}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Open mailto
      const mailtoUrl = `mailto:${targetValue}?subject=Data Penerimaan Produksi - ${noSuratJalan}&body=${encodeURIComponent('Silakan temukan lampiran file CSV data penerimaan produksi yang telah didownload otomatis ke perangkat Anda.')}`;
      window.open(mailtoUrl, '_self');
      
      setShareModal(prev => ({ ...prev, isOpen: false }));
      onShowToast('CSV di-download, silakan lampirkan pada email Anda.', 'success');
    }
  };

  // Open Edit Batch Modal
  const handleOpenEditBatch = (noSuratJalan: string) => {
    const cleanSJ = (noSuratJalan || '').trim().toUpperCase();
    const rows = dataList.filter((d) => (d.no_surat_jalan || '').trim().toUpperCase() === cleanSJ);

    if (rows.length === 0) {
      onShowToast('Data surat jalan tidak ditemukan!', 'error');
      return;
    }

    const first = rows[0];
    setEditingBatch({
      orig_no_surat_jalan: cleanSJ,
      no_surat_jalan: cleanSJ,
      kategori: first.kategori || 'Lokal CMT',
      tanggal: first.tanggal_penerimaan || new Date().toISOString().split('T')[0],
      keterangan: first.keterangan || '',
      items: rows.map((r, idx) => ({ ...r, tempId: r.id || `temp_${Date.now()}_${idx}` })),
    });
  };

  // Save Batch Edit
  const handleSaveBatchEdit = async () => {
    if (!editingBatch) return;
    if (!editingBatch.no_surat_jalan.trim()) {
      onShowToast('Nomor Surat Jalan tidak boleh kosong!', 'error');
      return;
    }
    if (editingBatch.items.length === 0) {
      onShowToast('Minimal harus ada 1 baris barang!', 'warning');
      return;
    }

    setIsUpdatingBatch(true);
    try {
      // Offload any new base64 photos to Google Drive to save 99% Supabase Egress
      const processedItems = [...editingBatch.items];
      for (const it of processedItems) {
        if (it.foto_url && it.foto_url.startsWith('data:')) {
          try {
            const uploadedUrls = await uploadMultipleImagesToGdrive(
              [it.foto_url],
              `PENERIMAAN_EDIT_${editingBatch.no_surat_jalan.replace(/[^a-zA-Z0-9]/g, '_')}_${it.kode_produksi}`
            );
            if (uploadedUrls && uploadedUrls.length > 0) {
              it.foto_url = uploadedUrls[0];
            }
          } catch (ePhoto) {
            console.warn('Gagal upload foto edit ke GDrive, fallback:', ePhoto);
          }
        }
      }

      const payload: SimpanPenerimaanPayload = {
        tanggal: editingBatch.tanggal,
        kategori: editingBatch.kategori,
        no_surat_jalan: editingBatch.no_surat_jalan.trim().toUpperCase(),
        keterangan: editingBatch.keterangan,
        items: processedItems.map((it) => ({
          tanggal_penerimaan: editingBatch.tanggal,
          kategori: editingBatch.kategori,
          no_surat_jalan: editingBatch.no_surat_jalan.trim().toUpperCase(),
          kode_produksi: (it.kode_produksi || '').trim().toUpperCase(),
          warna: (it.warna || '').trim().toUpperCase(),
          size: (it.size || 'Default').trim(),
          qty: Math.max(1, Number(it.qty) || 1),
          foto_url: it.foto_url || '',
          keterangan: (it.keterangan || editingBatch.keterangan || '').trim(),
          operator: it.operator || session?.name || 'Operator',
        })),
      };

      await updateBatchPenerimaanProduksiInSupabase(
        editingBatch.orig_no_surat_jalan,
        payload,
        session?.name || session?.username
      );

      onShowToast(`Penerimaan ${editingBatch.no_surat_jalan} berhasil diperbarui!`, 'success');
      setEditingBatch(null);
    } catch (err: any) {
      console.error('Gagal update batch penerimaan:', err);
      onShowToast(`Gagal menyimpan perubahan: ${err.message || 'Error'}`, 'error');
    } finally {
      setIsUpdatingBatch(false);
    }
  };

  // Delete Action Confirm Trigger
  const handleConfirmDeleteSingle = (item: PenerimaanProduksiItem) => {
    setDeletingTarget({
      type: 'single',
      id: item.id,
      no_surat_jalan: item.no_surat_jalan,
      kode_produksi: `${item.kode_produksi} (${item.warna} / ${item.size})`,
      totalQty: Number(item.qty) || 1,
    });
  };

  const handleConfirmDeleteBatch = (noSuratJalan: string) => {
    const cleanSJ = (noSuratJalan || '').trim().toUpperCase();
    const rows = dataList.filter((d) => (d.no_surat_jalan || '').trim().toUpperCase() === cleanSJ);
    const totalQty = rows.reduce((acc, curr) => acc + (Number(curr.qty) || 0), 0);

    setDeletingTarget({
      type: 'batch',
      no_surat_jalan: cleanSJ,
      totalRows: rows.length,
      totalQty,
    });
  };

  // Execute Delete
  const handleExecuteDelete = async () => {
    if (!deletingTarget) return;

    setIsDeleting(true);
    const prevList = [...dataList];
    if (deletingTarget.type === 'single' && deletingTarget.id) {
      setDataList((prev) => prev.filter((it) => it.id !== deletingTarget.id));
    } else if (deletingTarget.type === 'batch') {
      setDataList((prev) => prev.filter((it) => it.no_surat_jalan !== deletingTarget.no_surat_jalan));
    }

    try {
      if (deletingTarget.type === 'single' && deletingTarget.id) {
        await hapusPenerimaanProduksiSingleRowFromSupabase(deletingTarget.id);
        onShowToast('1 baris item penerimaan berhasil dihapus.', 'success');
      } else if (deletingTarget.type === 'batch') {
        await hapusBatchPenerimaanProduksiFromSupabase(deletingTarget.no_surat_jalan);
        onShowToast(
          `Seluruh data Surat Jalan ${deletingTarget.no_surat_jalan} (${deletingTarget.totalQty} pcs) berhasil dihapus!`,
          'success'
        );
        if (editingBatch && editingBatch.orig_no_surat_jalan === deletingTarget.no_surat_jalan) {
          setEditingBatch(null);
        }
      }
      setDeletingTarget(null);
    } catch (err: any) {
      console.error('Gagal hapus data:', err);
      setDataList(prevList);
      onShowToast('Gagal menghapus data penerimaan barang.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredData.length === 0) {
      onShowToast('Tidak ada data untuk diekspor.', 'warning');
      return;
    }

    const headers = [
      'Tanggal Penerimaan',
      'Kategori',
      'No Surat Jalan',
      'Kode Produksi',
      'Warna',
      'Size',
      'Qty (Pcs)',
      'Keterangan',
      'Operator',
      'Foto URL',
      'Waktu Dibuat',
    ];

    const rows = filteredData.map((d) => [
      `"${d.tanggal_penerimaan || ''}"`,
      `"${d.kategori || ''}"`,
      `"${d.no_surat_jalan || ''}"`,
      `"${d.kode_produksi || ''}"`,
      `"${d.warna || ''}"`,
      `"${d.size || ''}"`,
      Number(d.qty) || 0,
      `"${(d.keterangan || '').replace(/"/g, '""')}"`,
      `"${d.operator || ''}"`,
      `"${d.foto_url || ''}"`,
      `"${d.created_at || ''}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Penerimaan_Barang_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onShowToast(`Berhasil mengekspor ${filteredData.length} baris data ke CSV!`, 'success');
  };

  return (
    <div className="space-y-3.5 sm:space-y-6 pb-16">
      {/* 1. Header Page */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            <div className="p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md shadow-emerald-500/20 shrink-0">
              <Truck className="w-5 h-5 sm:w-7 sm:h-7" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <h1 className="text-base sm:text-2xl font-black tracking-tight text-slate-900 dark:text-white leading-tight">
                  Penerimaan Barang
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  WMS Inbound
                </span>
              </div>
              <p className="hidden sm:block text-xs sm:text-sm text-slate-500 mt-1">
                Catat kedatangan barang fisik Lokal CMT &amp; Kargo, upload foto dokumentasi, dan multi-varian size &amp; warna.
              </p>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              type="button"
              onClick={loadData}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition shadow-xs disabled:opacity-50 cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition shadow-xs cursor-pointer"
              title="Ekspor CSV Data"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Ekspor CSV</span>
            </button>
          </div>
        </div>

        {/* 2. Top-Level Tab Switcher */}
        <div className="mt-3 sm:mt-5 pt-3 sm:pt-4 border-t border-slate-100 dark:border-slate-800">
          <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl sm:flex sm:bg-transparent sm:dark:bg-transparent sm:p-0 sm:gap-3">
            <button
              type="button"
              onClick={() => setActiveTab('riwayat')}
              className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs cursor-pointer ${
                activeTab === 'riwayat'
                  ? 'bg-white dark:bg-slate-700 text-emerald-700 dark:text-emerald-300 sm:bg-emerald-600 sm:text-white sm:shadow-emerald-600/25 sm:ring-2 sm:ring-emerald-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 sm:bg-slate-100 sm:dark:bg-slate-800 sm:hover:bg-slate-200 sm:dark:hover:bg-slate-700 sm:text-slate-700 sm:dark:text-slate-300'
              }`}
            >
              <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Riwayat</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  activeTab === 'riwayat'
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 sm:bg-white/20 sm:text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                {filteredData.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('input')}
              className={`flex items-center justify-center sm:justify-start gap-1.5 sm:gap-2 px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg sm:rounded-xl font-bold text-xs sm:text-sm transition-all shadow-xs cursor-pointer ${
                activeTab === 'input'
                  ? 'bg-white dark:bg-slate-700 text-teal-700 dark:text-teal-300 sm:bg-teal-600 sm:text-white sm:shadow-teal-600/25 sm:ring-2 sm:ring-teal-600/30'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 sm:bg-slate-100 sm:dark:bg-slate-800 sm:hover:bg-slate-200 sm:dark:hover:bg-slate-700 sm:text-slate-700 sm:dark:text-slate-300'
              }`}
            >
              <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span>Input Batch</span>
              <span
                className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full ${
                  activeTab === 'input'
                    ? 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200 sm:bg-white/20 sm:text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                }`}
              >
                Multi
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================
          TAB 1: INPUT KEDATANGAN BARANG (BATCH INPUT)
          ======================================================== */}
      {activeTab === 'input' && (
        <form onSubmit={handleSubmitPenerimaan} className="space-y-4 sm:space-y-6">
          {/* Card 1: Informasi Header Surat Jalan */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-3.5 sm:p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-3.5 sm:mb-5 pb-2.5 sm:pb-3 border-b border-slate-100 dark:border-slate-800">
              <Building2 className="w-4 h-4 sm:w-5 sm:h-5 text-teal-600 dark:text-teal-400" />
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                1. Informasi Dokumen Kedatangan
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {/* Kategori Toggle */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Kategori Kedatangan <span className="text-primary-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setFormKategori('Lokal CMT')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-xs font-black transition cursor-pointer ${
                      formKategori === 'Lokal CMT'
                        ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <span>🏭</span>
                    <span>Lokal CMT</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormKategori('Kargo')}
                    className={`flex items-center justify-center gap-1.5 py-1.5 sm:py-2 px-2 sm:px-3 rounded-lg text-xs font-black transition cursor-pointer ${
                      formKategori === 'Kargo'
                        ? 'bg-white dark:bg-slate-700 text-amber-600 dark:text-amber-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    <span>🚚</span>
                    <span>Kargo</span>
                  </button>
                </div>
              </div>

              {/* Tanggal Penerimaan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tanggal Penerimaan <span className="text-primary-500">*</span>
                </label>
                <input
                  type="date"
                  value={formTanggal}
                  onChange={(e) => setFormTanggal(e.target.value)}
                  required
                  className="w-full px-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs sm:text-sm font-semibold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* No. Surat Jalan / Resi */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  No. Surat Jalan / Resi <span className="text-primary-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder={formKategori === 'Lokal CMT' ? 'SJ-2026/04/001' : 'RESI-JNT-100234'}
                  value={formNoSuratJalan}
                  onChange={(e) => setFormNoSuratJalan(e.target.value.toUpperCase())}
                  required
                  className="w-full px-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs sm:text-sm font-mono font-bold text-slate-900 dark:text-white uppercase placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Keterangan Global */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan Penerimaan Global
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pengiriman batch 1, vendor CMT Jaya"
                  value={formKeteranganGlobal}
                  onChange={(e) => setFormKeteranganGlobal(e.target.value)}
                  className="w-full px-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>
          </div>

          {/* Card 2: Multi-Product Batch Blocks */}
          <div className="space-y-3 sm:space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Package className="w-4 h-4 sm:w-5 sm:h-5 text-emerald-600 dark:text-emerald-400" />
                <h2 className="text-xs sm:text-base font-black text-slate-900 dark:text-white">
                  2. Daftar Produk
                </h2>
              </div>
              <button
                type="button"
                onClick={addProductBlock}
                className="inline-flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 transition shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Produk</span>
              </button>
            </div>

            {productBlocks.map((block, blockIdx) => (
              <div
                key={block.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-3.5 sm:p-5 shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-700"
              >
                {/* Block Header */}
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 flex items-center justify-center text-xs font-black">
                      {blockIdx + 1}
                    </span>
                    <span className="text-sm font-black text-slate-900 dark:text-white">
                      Produk #{blockIdx + 1}
                    </span>
                  </div>

                  {productBlocks.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeProductBlock(blockIdx)}
                      className="inline-flex items-center gap-1 text-xs font-bold text-primary-600 dark:text-primary-400 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-950/40 px-2 py-1 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Kode</span>
                    </button>
                  )}
                </div>

                {/* Block Body */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                  {/* Foto Upload Column */}
                  <div className="lg:col-span-3 flex flex-col items-center justify-center">
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 self-start">
                      Foto Produk
                    </label>

                    {block.foto_url ? (
                      <div className="relative group w-full h-44 rounded-xl overflow-hidden border-2 border-emerald-400 dark:border-emerald-600 shadow-sm bg-slate-100 dark:bg-slate-800">
                        <img
                          src={block.foto_url}
                          alt="Foto Produk"
                          className="w-full h-full object-cover cursor-pointer"
                          onClick={() =>
                            setLightboxImage({
                              url: block.foto_url!,
                              title: block.kode_produksi || `Produk #${blockIdx + 1}`,
                              subtitle: `Surat Jalan: ${formNoSuratJalan || '-'}`,
                            })
                          }
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setLightboxImage({
                                url: block.foto_url!,
                                title: block.kode_produksi || `Produk #${blockIdx + 1}`,
                                subtitle: `Surat Jalan: ${formNoSuratJalan || '-'}`,
                              })
                            }
                            className="p-2 rounded-lg bg-white/90 text-slate-800 hover:bg-white shadow"
                            title="Perbesar"
                          >
                            <Maximize2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => updateProductBlockPhoto(blockIdx, '')}
                            className="p-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 shadow"
                            title="Hapus Foto"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                            handleImageUpload(e.dataTransfer.files[0], blockIdx);
                          }
                        }}
                        className="w-full h-44 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 bg-slate-50 dark:bg-slate-800/50 flex flex-col items-center justify-center p-4 text-center transition"
                      >
                        <Camera className="w-8 h-8 text-slate-400 mb-2" />
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Foto Produk (Drop / Paste)
                        </span>
                        <span className="text-[10px] text-slate-400 mb-3">
                          Tarik foto atau gunakan tombol di bawah
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => startWebcam(blockIdx, false)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm"
                          >
                            <Camera className="w-3.5 h-3.5" />
                            <span>Kamera</span>
                          </button>

                          <label className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-600 cursor-pointer shadow-sm">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Pilih File</span>
                            <input
                              type="file"
                              accept="image/*"
                              className="hidden"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleImageUpload(e.target.files[0], blockIdx);
                                }
                              }}
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Kode Produksi & Varian Table Column */}
                  <div className="lg:col-span-9 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                          Kode Produksi <span className="text-primary-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: CP-DRESS-881 atau CMT-BLOUSE-01"
                          value={block.kode_produksi}
                          onChange={(e) => updateProductBlockField(blockIdx, 'kode_produksi', e.target.value)}
                          required
                          className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                          Catatan Khusus Produk
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: Kancing cadangan terpisah, jahit tepi"
                          value={block.catatan || ''}
                          onChange={(e) => updateProductBlockField(blockIdx, 'catatan', e.target.value)}
                          className="w-full px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    </div>

                    {/* Varian Table */}
                    <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                      <div className="bg-slate-100 dark:bg-slate-800 px-3.5 py-2 flex items-center justify-between border-b border-slate-200 dark:border-slate-700">
                        <span className="text-xs font-black text-slate-700 dark:text-slate-300">
                          Rincian Varian (Warna, Size &amp; Qty)
                        </span>
                        <span className="text-[10px] font-bold text-slate-500">
                          Total: {block.variants.reduce((a, b) => a + (Number(b.qty) || 0), 0)} pcs
                        </span>
                      </div>

                      <div className="p-3 space-y-2">
                        {block.variants.map((v, vIdx) => (
                          <div
                            key={vIdx}
                            className="flex flex-wrap sm:flex-nowrap items-center gap-2 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200/70 dark:border-slate-700/60"
                          >
                            {/* Warna */}
                            <div className="flex-1 min-w-[120px]">
                              <input
                                type="text"
                                placeholder="Warna (cth: BLACK)"
                                value={v.warna}
                                onChange={(e) =>
                                  updateVariantInBlock(blockIdx, vIdx, 'warna', e.target.value)
                                }
                                required
                                className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white uppercase focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>

                            {/* Size */}
                            <div className="w-28">
                              <select
                                value={v.size}
                                onChange={(e) =>
                                  updateVariantInBlock(blockIdx, vIdx, 'size', e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500"
                              >
                                {STANDARD_SIZES.map((sz) => (
                                  <option key={sz} value={sz}>
                                    {sz}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {/* Qty */}
                            <div className="w-24">
                              <input
                                type="number"
                                min={1}
                                value={v.qty}
                                onChange={(e) =>
                                  updateVariantInBlock(blockIdx, vIdx, 'qty', e.target.value)
                                }
                                required
                                className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-black text-center text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>

                            {/* Action */}
                            {block.variants.length > 1 && (
                              <button
                                type="button"
                                onClick={() => removeVariantFromBlock(blockIdx, vIdx)}
                                className="p-1.5 text-primary-500 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-950/50 rounded-lg transition"
                                title="Hapus Varian"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}

                        {/* Add Variant Button */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => addVariantToBlock(blockIdx)}
                            className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 py-1 px-2 rounded-lg hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>
                              Tambah Varian (
                              {getNextSize(block.variants[block.variants.length - 1]?.size || 'S')})
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Action Bar & Summary Footer */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-md sticky bottom-4 z-20 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Ringkasan Input:</span>
              <span className="px-3 py-1 rounded-xl text-xs font-black bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                {formSummary.totalKode} Kode • {formSummary.totalVariants} Varian • {formSummary.totalPcs} Pcs
              </span>
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleResetForm}
                disabled={isSaving}
                className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                Reset Form
              </button>

              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyimpan Seluruh Data...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Simpan Semua Penerimaan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ========================================================
          TAB 2: RIWAYAT PENERIMAAN BARANG (VIEW & TABLE)
          ======================================================== */}
      {activeTab === 'riwayat' && (
        <div className="space-y-3 sm:space-y-6">
          {/* 4 KPI Summary Cards - Compact on mobile */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
            {/* KPI 1 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight truncate">Total Data</span>
                <span className="p-1 sm:p-2 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                  <Layers className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </span>
              </div>
              <div className="text-lg sm:text-2xl lg:text-3xl font-black text-slate-900 dark:text-white leading-tight">
                {metrics.totalRows.toLocaleString()}
              </div>
              <p className="hidden sm:block text-[11px] text-slate-400 mt-1">Baris transaksi tercatat</p>
            </div>

            {/* KPI 2 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight truncate">Total Qty (Pcs)</span>
                <span className="p-1 sm:p-2 rounded-lg sm:rounded-xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </span>
              </div>
              <div className="text-lg sm:text-2xl lg:text-3xl font-black text-emerald-600 dark:text-emerald-400 leading-tight">
                {metrics.totalPcs.toLocaleString()}
              </div>
              <p className="hidden sm:block text-[11px] text-slate-400 mt-1">Fisik pcs kedatangan</p>
            </div>

            {/* KPI 3 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight truncate">Lokal CMT</span>
                <span className="p-1 sm:p-2 rounded-lg sm:rounded-xl bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 shrink-0">
                  <Building2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </span>
              </div>
              <div className="text-lg sm:text-2xl lg:text-3xl font-black text-blue-600 dark:text-blue-400 leading-tight">
                {metrics.lokalCmtPcs.toLocaleString()}
              </div>
              <p className="hidden sm:block text-[11px] text-slate-400 mt-1">Pcs dari vendor lokal CMT</p>
            </div>

            {/* KPI 4 */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-2.5 sm:p-5 shadow-xs">
              <div className="flex items-center justify-between mb-1 sm:mb-2">
                <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-tight truncate">Kargo Ekspedisi</span>
                <span className="p-1 sm:p-2 rounded-lg sm:rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-600 dark:text-amber-400 shrink-0">
                  <Truck className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                </span>
              </div>
              <div className="text-lg sm:text-2xl lg:text-3xl font-black text-amber-600 dark:text-amber-400 leading-tight">
                {metrics.kargoPcs.toLocaleString()}
              </div>
              <p className="hidden sm:block text-[11px] text-slate-400 mt-1">Pcs dari kargo / pengiriman luar</p>
            </div>
          </div>

          {/* Filter Toolbar - Clean & space-efficient */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl sm:rounded-2xl p-3 sm:p-5 shadow-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5 sm:gap-3">
              {/* Search Bar */}
              <div className="lg:col-span-3 relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Cari Kode, SJ, Warna, Catatan..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-8.5 pr-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Filter Kategori */}
              <div className="lg:col-span-3">
                <select
                  value={filterKategori}
                  onChange={(e) => {
                    setFilterKategori(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full px-3 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                >
                  <option value="Semua">Semua Kategori (CMT &amp; Kargo)</option>
                  <option value="Lokal CMT">🏭 Hanya Lokal CMT</option>
                  <option value="Kargo">🚚 Hanya Kargo</option>
                </select>
              </div>

              {/* Date Start & Date End (2-column layout on mobile) */}
              <div className="col-span-1 sm:col-span-2 lg:col-span-4 grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5 sm:hidden">
                    Dari Tanggal:
                  </label>
                  <input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => {
                      setFilterStartDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    title="Dari Tanggal"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 dark:text-slate-400 mb-0.5 sm:hidden">
                    Sampai Tanggal:
                  </label>
                  <input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => {
                      setFilterEndDate(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="w-full px-2.5 py-1.5 sm:py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg sm:rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    title="Sampai Tanggal"
                  />
                </div>
              </div>

              {/* Action Buttons: Reset & Sync Offline side-by-side on mobile */}
              <div className="col-span-1 sm:col-span-2 lg:col-span-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setFilterKategori('Semua');
                    setFilterStartDate('');
                    setFilterEndDate('');
                    setCurrentPage(1);
                  }}
                  className="w-full py-1.5 sm:py-2 px-2.5 rounded-lg sm:rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition text-center cursor-pointer"
                >
                  Reset
                </button>

                <button
                  type="button"
                  onClick={handleSyncOffline}
                  disabled={isSyncing}
                  className="w-full py-1.5 sm:py-2 px-2.5 rounded-lg sm:rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 border border-indigo-200 dark:border-indigo-800 transition flex justify-center items-center gap-1 disabled:opacity-50 cursor-pointer"
                  title="Sinkronisasi Data Offline yang belum masuk ke database"
                >
                  {isSyncing ? (
                    <span className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></span>
                  ) : (
                    <Upload className="w-3.5 h-3.5" />
                  )}
                  <span className="truncate">Sync</span>
                </button>
              </div>
            </div>
          </div>

          {/* Unified Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-3.5">Tanggal</th>
                    <th className="py-3 px-3">Kategori</th>
                    <th className="py-3 px-3">No. Surat Jalan</th>
                    <th className="py-3 px-2 text-center">Foto</th>
                    <th className="py-3 px-3.5">Kode Produksi</th>
                    <th className="py-3 px-3">Warna</th>
                    <th className="py-3 px-2.5 text-center">Size</th>
                    <th className="py-3 px-3 text-right">Qty</th>
                    <th className="py-3 px-3.5">Catatan</th>
                    <th className="py-3 px-3">Operator</th>
                    <th className="py-3 px-3 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isLoading ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-emerald-600" />
                        <span className="font-semibold text-xs">Memuat data penerimaan barang...</span>
                      </td>
                    </tr>
                  ) : paginatedData.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-slate-400">
                        <Package className="w-8 h-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <span className="font-semibold text-xs">
                          {searchQuery || filterKategori !== 'Semua'
                            ? 'Tidak ada data penerimaan yang cocok dengan filter.'
                            : 'Belum ada data kedatangan barang tersimpan.'}
                        </span>
                      </td>
                    </tr>
                  ) : (
                    paginatedData.map((row) => (
                      <tr
                        key={row.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition group"
                      >
                        {/* Tanggal */}
                        <td className="py-2.5 px-3.5 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {row.tanggal_penerimaan}
                        </td>

                        {/* Kategori Badge */}
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black ${
                              row.kategori === 'Lokal CMT'
                                ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            }`}
                          >
                            <span>{row.kategori === 'Lokal CMT' ? '🏭' : '🚚'}</span>
                            <span>{row.kategori}</span>
                          </span>
                        </td>

                        {/* No Surat Jalan */}
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px]">
                            {row.no_surat_jalan}
                          </span>
                        </td>

                        {/* Foto Thumbnail */}
                        <td className="py-2.5 px-2 text-center">
                          {row.foto_url ? (
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxImage({
                                  url: row.foto_url!,
                                  title: row.kode_produksi,
                                  subtitle: `${row.warna} - Size ${row.size} (${row.qty} pcs) • SJ: ${row.no_surat_jalan}`,
                                })
                              }
                              className="relative inline-block w-8 h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 hover:ring-2 hover:ring-emerald-500 transition"
                              title="Klik untuk melihat foto besar"
                            >
                              <img
                                src={row.foto_url}
                                alt="Foto"
                                className="w-full h-full object-cover"
                              />
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-300 dark:text-slate-600">-</span>
                          )}
                        </td>

                        {/* Kode Produksi */}
                        <td className="py-2.5 px-3.5 font-black text-slate-900 dark:text-white whitespace-nowrap">
                          {row.kode_produksi}
                        </td>

                        {/* Warna */}
                        <td className="py-2.5 px-3 font-bold text-slate-800 dark:text-slate-200 uppercase whitespace-nowrap">
                          {row.warna || '-'}
                        </td>

                        {/* Size */}
                        <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            {row.size || 'Default'}
                          </span>
                        </td>

                        {/* Qty */}
                        <td className="py-2.5 px-3 text-right font-black text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {(Number(row.qty) || 0).toLocaleString()} pcs
                        </td>

                        {/* Catatan */}
                        <td className="py-2.5 px-3.5 text-slate-500 max-w-[200px] truncate" title={row.keterangan || ''}>
                          {row.keterangan || '-'}
                        </td>

                        {/* Operator */}
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {row.operator || '-'}
                        </td>

                        {/* Aksi */}
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleOpenShare(row.no_surat_jalan)}
                              className="p-1.5 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition"
                              title="Bagikan Surat Jalan Ini"
                            >
                              <Share2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditBatch(row.no_surat_jalan)}
                              className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 dark:hover:bg-blue-950/40 rounded-lg transition"
                              title="Edit Surat Jalan Ini"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleConfirmDeleteSingle(row)}
                              className="p-1.5 text-primary-500 hover:text-primary-700 hover:bg-primary-50 dark:hover:bg-primary-950/40 rounded-lg transition"
                              title="Hapus Baris Ini"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
              <span className="text-slate-500">
                Menampilkan {filteredData.length === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1} -{' '}
                {Math.min(currentPage * rowsPerPage, filteredData.length)} dari {filteredData.length} data
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="font-bold text-slate-700 dark:text-slate-300 px-2">
                  Halaman {currentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: SHARE WA/EMAIL
          ======================================================== */}
      {shareModal.isOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                  Kirim Data Penerimaan
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShareModal(prev => ({ ...prev, isOpen: false }))}
                className="p-1.5 text-slate-400 hover:text-primary-500 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 sm:p-5 space-y-4">
              <div className="bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700">
                <p className="text-xs text-slate-500 font-medium">No. Surat Jalan</p>
                <p className="text-sm font-bold text-slate-800 dark:text-white">{shareModal.noSuratJalan}</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">Metode Pengiriman</label>
                <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
                  <button
                    type="button"
                    onClick={() => setShareModal(prev => ({ ...prev, targetType: 'wa' }))}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${shareModal.targetType === 'wa' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    WhatsApp
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareModal(prev => ({ ...prev, targetType: 'email' }))}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${shareModal.targetType === 'email' ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Email (CSV)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  {shareModal.targetType === 'wa' ? 'Nomor WhatsApp' : 'Alamat Email'}
                </label>
                <input
                  type={shareModal.targetType === 'wa' ? 'tel' : 'email'}
                  placeholder={shareModal.targetType === 'wa' ? 'Contoh: 08123456789' : 'email@contoh.com'}
                  value={shareModal.targetValue}
                  onChange={(e) => setShareModal(prev => ({ ...prev, targetValue: e.target.value }))}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  autoFocus
                />
              </div>
            </div>

            <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-850">
              <button
                type="button"
                onClick={() => setShareModal(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 bg-white border border-slate-200 hover:bg-slate-50 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleShareSubmit}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-sm transition"
              >
                Kirim
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 1: EDIT SURAT JALAN (BATCH EDIT)
          ======================================================== */}
      {editingBatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">
                    Edit Penerimaan Surat Jalan
                  </h3>
                  <p className="text-xs text-slate-500 font-mono">
                    SJ: {editingBatch.orig_no_surat_jalan}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingBatch(null)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Scrollable Content */}
            <div className="p-4 sm:p-5 overflow-y-auto space-y-5">
              {/* Header Details */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Kategori
                  </label>
                  <select
                    value={editingBatch.kategori}
                    onChange={(e) => setEditingBatch({ ...editingBatch, kategori: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="Lokal CMT">Lokal CMT</option>
                    <option value="Kargo">Kargo</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Tanggal
                  </label>
                  <input
                    type="date"
                    value={editingBatch.tanggal}
                    onChange={(e) => setEditingBatch({ ...editingBatch, tanggal: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    No. Surat Jalan
                  </label>
                  <input
                    type="text"
                    value={editingBatch.no_surat_jalan}
                    onChange={(e) =>
                      setEditingBatch({ ...editingBatch, no_surat_jalan: e.target.value.toUpperCase() })
                    }
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white uppercase"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Catatan Global
                  </label>
                  <input
                    type="text"
                    value={editingBatch.keterangan}
                    onChange={(e) => setEditingBatch({ ...editingBatch, keterangan: e.target.value })}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Items Table */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-slate-900 dark:text-white">
                    Daftar Baris Barang ({editingBatch.items.length} Baris)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const updated = [...editingBatch.items];
                      updated.push({
                        tempId: Date.now(),
                        tanggal_penerimaan: editingBatch.tanggal,
                        kategori: editingBatch.kategori,
                        no_surat_jalan: editingBatch.no_surat_jalan,
                        kode_produksi: '',
                        warna: '',
                        size: 'S',
                        qty: 1,
                        foto_url: '',
                        keterangan: '',
                        operator: session?.name || 'Operator',
                      });
                      setEditingBatch({ ...editingBatch, items: updated });
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 hover:bg-blue-100 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah Baris</span>
                  </button>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 font-bold">
                        <th className="py-2 px-2 text-center">Foto</th>
                        <th className="py-2 px-3">Kode Produksi</th>
                        <th className="py-2 px-3">Warna</th>
                        <th className="py-2 px-2.5 text-center">Size</th>
                        <th className="py-2 px-2 text-right">Qty</th>
                        <th className="py-2 px-3">Catatan</th>
                        <th className="py-2 px-2 text-center">Hapus</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {editingBatch.items.map((it, idx) => (
                        <tr key={it.tempId || idx}>
                          {/* Foto */}
                          <td className="py-2 px-2 text-center">
                            {it.foto_url ? (
                              <div className="relative inline-block w-8 h-8 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                                <img
                                  src={it.foto_url}
                                  alt="Foto"
                                  className="w-full h-full object-cover"
                                />
                                <button
                                  type="button"
                                  onClick={() => {
                                    const updated = [...editingBatch.items];
                                    updated[idx].foto_url = '';
                                    setEditingBatch({ ...editingBatch, items: updated });
                                  }}
                                  className="absolute inset-0 bg-black/60 text-white flex items-center justify-center opacity-0 hover:opacity-100 transition text-[9px]"
                                  title="Hapus Foto"
                                >
                                  ✕
                                </button>
                              </div>
                            ) : (
                              <label className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 cursor-pointer text-slate-400 hover:text-slate-700 transition">
                                <Camera className="w-4 h-4" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  className="hidden"
                                  onChange={async (e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      const res = await compressImage(e.target.files[0], 1024, 0.75);
                                      const updated = [...editingBatch.items];
                                      updated[idx].foto_url = res.dataUrl;
                                      setEditingBatch({ ...editingBatch, items: updated });
                                    }
                                  }}
                                />
                              </label>
                            )}
                          </td>

                          {/* Kode Produksi */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={it.kode_produksi}
                              onChange={(e) => {
                                const updated = [...editingBatch.items];
                                updated[idx].kode_produksi = e.target.value.toUpperCase();
                                setEditingBatch({ ...editingBatch, items: updated });
                              }}
                              className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs font-bold uppercase"
                            />
                          </td>

                          {/* Warna */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={it.warna}
                              onChange={(e) => {
                                const updated = [...editingBatch.items];
                                updated[idx].warna = e.target.value.toUpperCase();
                                setEditingBatch({ ...editingBatch, items: updated });
                              }}
                              className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs uppercase"
                            />
                          </td>

                          {/* Size */}
                          <td className="py-2 px-2.5 text-center">
                            <select
                              value={it.size}
                              onChange={(e) => {
                                const updated = [...editingBatch.items];
                                updated[idx].size = e.target.value;
                                setEditingBatch({ ...editingBatch, items: updated });
                              }}
                              className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs font-bold"
                            >
                              {STANDARD_SIZES.map((s) => (
                                <option key={s} value={s}>
                                  {s}
                                </option>
                              ))}
                            </select>
                          </td>

                          {/* Qty */}
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              min={1}
                              value={it.qty}
                              onChange={(e) => {
                                const updated = [...editingBatch.items];
                                updated[idx].qty = Math.max(1, Number(e.target.value) || 1);
                                setEditingBatch({ ...editingBatch, items: updated });
                              }}
                              className="w-16 px-2 py-1 text-center bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs font-black"
                            />
                          </td>

                          {/* Catatan */}
                          <td className="py-2 px-3">
                            <input
                              type="text"
                              value={it.keterangan || ''}
                              onChange={(e) => {
                                const updated = [...editingBatch.items];
                                updated[idx].keterangan = e.target.value;
                                setEditingBatch({ ...editingBatch, items: updated });
                              }}
                              className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-xs"
                            />
                          </td>

                          {/* Hapus */}
                          <td className="py-2 px-2 text-center">
                            {editingBatch.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const updated = editingBatch.items.filter((_, i) => i !== idx);
                                  setEditingBatch({ ...editingBatch, items: updated });
                                }}
                                className="p-1 text-primary-500 hover:text-primary-700 hover:bg-primary-50 rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 sm:p-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50 dark:bg-slate-850">
              <button
                type="button"
                onClick={() => handleConfirmDeleteBatch(editingBatch.orig_no_surat_jalan)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-950/40 transition"
              >
                <Trash2 className="w-4 h-4" />
                <span>Hapus Seluruh Surat Jalan Ini</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingBatch(null)}
                  disabled={isUpdatingBatch}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 transition"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveBatchEdit}
                  disabled={isUpdatingBatch}
                  className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 transition disabled:opacity-50"
                >
                  {isUpdatingBatch ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Menyimpan...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Simpan Seluruh Penerimaan</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 2: CONFIRM DELETE MODAL
          ======================================================== */}
      {deletingTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md p-5 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3.5">
              <div className="p-3 rounded-2xl bg-primary-100 dark:bg-primary-950/60 text-primary-600 dark:text-primary-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Konfirmasi Hapus Data
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  {deletingTarget.type === 'single'
                    ? `Apakah Anda yakin ingin menghapus 1 baris item: ${deletingTarget.kode_produksi}?`
                    : `Apakah Anda yakin ingin menghapus SELURUH data Surat Jalan ${deletingTarget.no_surat_jalan} (${deletingTarget.totalRows} baris, ${deletingTarget.totalQty} pcs)?`}
                </p>
                <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-[11px] text-slate-600 dark:text-slate-300 font-mono">
                  No Surat Jalan: {deletingTarget.no_surat_jalan}
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setDeletingTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 transition"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={isDeleting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black text-white bg-primary-600 hover:bg-primary-700 shadow-md shadow-primary-600/30 transition disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus Data</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 3: LIGHTBOX FOTO PREVIEW
          ======================================================== */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
          onClick={() => setLightboxImage(null)}
        >
          <div
            className="relative max-w-3xl w-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between text-white">
              <div>
                <h4 className="text-sm font-black">{lightboxImage.title}</h4>
                {lightboxImage.subtitle && (
                  <p className="text-xs text-slate-400">{lightboxImage.subtitle}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={lightboxImage.url}
                  download="Foto_Penerimaan.jpg"
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                  title="Unduh Foto"
                >
                  <Download className="w-4 h-4" />
                </a>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition"
                  title="Tutup"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-2 flex items-center justify-center bg-black/40 max-h-[75vh]">
              <img
                src={lightboxImage.url}
                alt="Enlarged"
                className="max-h-[70vh] w-auto max-w-full rounded-xl object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL 4: WEBCAM CAPTURE MODAL
          ======================================================== */}
      {webcamOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-xs">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-4 text-white shadow-2xl flex flex-col items-center">
            <div className="w-full flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
              <span className="text-sm font-black flex items-center gap-2">
                <Camera className="w-4 h-4 text-emerald-400" />
                <span>Kamera Live Snapshot</span>
              </span>
              <button
                type="button"
                onClick={stopWebcam}
                className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="w-full h-64 sm:h-72 bg-black rounded-xl overflow-hidden relative mb-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex items-center gap-3 w-full">
              <button
                type="button"
                onClick={stopWebcam}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={captureWebcamPhoto}
                className="flex-1 py-2 rounded-xl text-xs font-black bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30"
              >
                <Camera className="w-4 h-4" />
                <span>Ambil Foto</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
