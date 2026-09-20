import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Store,
  Calendar,
  Layers,
  FileText,
  Plus,
  Trash2,
  Printer,
  Send,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  User,
  Box,
  Copy,
  QrCode,
  ArrowRight,
  RefreshCw,
  CheckSquare,
  Square,
  Edit,
  XCircle,
  History,
  AlertTriangle,
  Info,
  Camera,
  Image as ImageIcon,
  Eye,
  Loader2,
  UploadCloud,
} from 'lucide-react';
import {
  UserSession,
  PengirimanStoreReport,
  PengirimanStoreItem,
  PengirimanStoreTrip,
  KoliMarkingLabel,
  SatuanPengirimanStore,
  PengirimanAuditLog,
} from '../../types';
import {
  fetchPengirimanStoreReports,
  savePengirimanStoreBatch,
  processKirimStoreReports,
  deletePengirimanStoreReport,
  editPengirimanStoreReport,
  cancelPengirimanStoreReport,
  generateKoliLabelsForReport,
  getTodayDateString,
  getCurrentTimeString,
} from '../../services/pengirimanStore';
import { fetchOutlets, DEFAULT_OUTLETS } from '../../services/gasManualShipment';
import { uploadMultipleImagesToGdrive } from '../../services/gdriveUpload';
import { compressImage } from '../../utils/imageCompressor';
import { KoliMarkingPrintModal } from './KoliMarkingPrintModal';
import { SuratJalanPrintModal } from './SuratJalanPrintModal';

interface PengirimanStoreTabProps {
  session?: UserSession | null;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

interface ItemInputRow {
  tempId: string;
  storeTujuan: string;
  isCustomStore?: boolean;
  customStoreInput?: string;
  noSuratJalan: string;
  deskripsi: string;
  qty: number | '';
  satuan: SatuanPengirimanStore;
  keterangan: string;
  fotoBarang?: string;
  isCompressingPhoto?: boolean;
}

export const PengirimanStoreTab: React.FC<PengirimanStoreTabProps> = ({
  session = null,
  onShowToast = () => {},
}) => {
  // Sub-tab Navigation: Laporan, Dispatched, Kirim, Histori
  const [activeSubTab, setActiveSubTab] = useState<'laporan' | 'dispatched' | 'kirim' | 'histori'>('laporan');

  // Master Store Data
  const [stores, setStores] = useState<{ id?: string; nama: string; fulfillment?: string }[]>([]);
  const [loadingStores, setLoadingStores] = useState<boolean>(false);

  // Data Reports
  const [reports, setReports] = useState<PengirimanStoreReport[]>([]);
  const [loadingReports, setLoadingReports] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // 1. FORM LAPORAN STATE
  // --------------------------------------------------------------------------
  const [isSubmittingReport, setIsSubmittingReport] = useState<boolean>(false);
  const [itemRows, setItemRows] = useState<ItemInputRow[]>([
    {
      tempId: 'row-1',
      storeTujuan: 'Grand Indonesia',
      noSuratJalan: '',
      deskripsi: '',
      qty: 1,
      satuan: 'Koli',
      keterangan: '',
      fotoBarang: '',
    },
  ]);

  // Overall shipment photos (Opsi B: Foto Pengiriman Keseluruhan / Koli / Packing)
  const [overallPhotos, setOverallPhotos] = useState<string[]>([]);
  const [isCompressingOverall, setIsCompressingOverall] = useState<boolean>(false);
  const overallFileInputRef = useRef<HTMLInputElement | null>(null);

  // Modal Preview Foto
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const [previewPhotoTitle, setPreviewPhotoTitle] = useState<string>('Preview Dokumentasi Foto');

  // --------------------------------------------------------------------------
  // 2. DISPATCHED TAB STATE
  // --------------------------------------------------------------------------
  const [searchDispatched, setSearchDispatched] = useState<string>('');
  const [filterStoreDispatched, setFilterStoreDispatched] = useState<string>('');
  const [selectedDispatchedIds, setSelectedDispatchedIds] = useState<string[]>([]);

  // --------------------------------------------------------------------------
  // 3. TAB KIRIM (SETUP PENGIRIMAN) STATE
  // Sesuai instruksi user:
  // - Pilih Store Tujuan -> daftar dispatched toko tersebut otomatis muncul
  // - Bisa pilih semua atau pilih beberapa
  // - Dikirim Oleh (perlu)
  // - Catatan Kirim (perlu)
  // - Jam berangkat (tidak perlu), Armada (tidak perlu), No kendaraan (tidak perlu)
  // --------------------------------------------------------------------------
  const [selectedStoreKirim, setSelectedStoreKirim] = useState<string>('');
  const [selectedReportIdsForKirim, setSelectedReportIdsForKirim] = useState<string[]>([]);
  const [tanggalKirim, setTanggalKirim] = useState<string>(getTodayDateString());
  const [dikirimOleh, setDikirimOleh] = useState<string>('');
  const [catatanKirim, setCatatanKirim] = useState<string>('');
  const [isProcessingKirim, setIsProcessingKirim] = useState<boolean>(false);

  // --------------------------------------------------------------------------
  // 4. TAB HISTORI PENGIRIMAN STATE
  // Sesuai instruksi user:
  // - Cetak ulang surat jalan
  // - Edit pengiriman
  // - Delete atau Cancel (kembali ke dispatched)
  // - Histori log audit edit / cancel
  // --------------------------------------------------------------------------
  const [searchHistori, setSearchHistori] = useState<string>('');
  const [filterStoreHistori, setFilterStoreHistori] = useState<string>('');
  const [selectedDetailReport, setSelectedDetailReport] = useState<PengirimanStoreReport | null>(null);

  // Modals for Histori: Edit, Cancel, Audit History
  const [editingReport, setEditingReport] = useState<PengirimanStoreReport | null>(null);
  const [editDikirimOleh, setEditDikirimOleh] = useState<string>('');
  const [editCatatanKirim, setEditCatatanKirim] = useState<string>('');
  const [editTanggalKirim, setEditTanggalKirim] = useState<string>('');
  const [isSavingEdit, setIsSavingEdit] = useState<boolean>(false);

  const [cancellingReport, setCancellingReport] = useState<PengirimanStoreReport | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [isProcessingCancel, setIsProcessingCancel] = useState<boolean>(false);

  const [viewingAuditReport, setViewingAuditReport] = useState<PengirimanStoreReport | null>(null);

  // --------------------------------------------------------------------------
  // PRINT MODAL STATES
  // --------------------------------------------------------------------------
  const [printModalOpen, setPrintModalOpen] = useState<boolean>(false);
  const [labelsToPrint, setLabelsToPrint] = useState<KoliMarkingLabel[]>([]);
  const [printModalTitle, setPrintModalTitle] = useState<string>('');

  const [suratJalanModalOpen, setSuratJalanModalOpen] = useState<boolean>(false);
  const [suratJalanReportsToPrint, setSuratJalanReportsToPrint] = useState<PengirimanStoreReport[]>([]);
  const [suratJalanTripToPrint, setSuratJalanTripToPrint] = useState<Partial<PengirimanStoreTrip> | null>(null);

  // --------------------------------------------------------------------------
  // INITIAL DATA LOAD
  // --------------------------------------------------------------------------
  useEffect(() => {
    loadStores();
    loadReportsList();
  }, []);

  const loadStores = async () => {
    setLoadingStores(true);
    try {
      const data = await fetchOutlets();
      if (data && data.length > 0) {
        setStores(data);
        setItemRows((prev) =>
          prev.map((r, idx) => (idx === 0 && !r.storeTujuan ? { ...r, storeTujuan: data[0].nama } : r))
        );
      } else {
        setStores(DEFAULT_OUTLETS);
      }
    } catch (e) {
      console.warn('Gagal memuat outlet, menggunakan default:', e);
      setStores(DEFAULT_OUTLETS);
    } finally {
      setLoadingStores(false);
    }
  };

  const loadReportsList = async () => {
    setLoadingReports(true);
    try {
      const data = await fetchPengirimanStoreReports();
      setReports(data || []);
    } catch (e) {
      console.warn('Gagal memuat laporan pengiriman store:', e);
    } finally {
      setLoadingReports(false);
    }
  };

  // Grouping reports
  const dispatchedReports = useMemo(() => {
    return reports.filter((r) => r.status === 'dispatched');
  }, [reports]);

  const sentReports = useMemo(() => {
    return reports.filter((r) => r.status === 'sent');
  }, [reports]);

  // Daftar store yang memiliki barang di antrean Dispatched
  const dispatchedStoresList = useMemo(() => {
    const map = new Map<string, { count: number; koli: number }>();
    dispatchedReports.forEach((r) => {
      const cur = map.get(r.store_tujuan) || { count: 0, koli: 0 };
      map.set(r.store_tujuan, {
        count: cur.count + 1,
        koli: cur.koli + r.total_koli,
      });
    });
    return Array.from(map.entries()).map(([storeName, info]) => ({
      storeName,
      count: info.count,
      koli: info.koli,
    }));
  }, [dispatchedReports]);

  // Saat berpindah ke tab Kirim, jika belum ada store terpilih, set store pertama yang memiliki dispatched
  useEffect(() => {
    if (activeSubTab === 'kirim' && !selectedStoreKirim && dispatchedStoresList.length > 0) {
      const firstStore = dispatchedStoresList[0].storeName;
      setSelectedStoreKirim(firstStore);
    }
  }, [activeSubTab, selectedStoreKirim, dispatchedStoresList]);

  // Saat selectedStoreKirim berubah, otomatis tampilkan dan centang seluruh dispatched toko tersebut
  const dispatchedForSelectedStore = useMemo(() => {
    if (!selectedStoreKirim) return [];
    return dispatchedReports.filter((r) => r.store_tujuan === selectedStoreKirim);
  }, [dispatchedReports, selectedStoreKirim]);

  useEffect(() => {
    if (selectedStoreKirim) {
      const idsForThisStore = dispatchedReports
        .filter((r) => r.store_tujuan === selectedStoreKirim)
        .map((r) => r.id);
      setSelectedReportIdsForKirim(idsForThisStore);
    } else {
      setSelectedReportIdsForKirim([]);
    }
  }, [selectedStoreKirim, dispatchedReports]);

  // --------------------------------------------------------------------------
  // FORM LAPORAN HANDLERS
  // --------------------------------------------------------------------------
  const handleAddRow = () => {
    const lastRow = itemRows[itemRows.length - 1];
    const defaultStore = lastRow?.storeTujuan || stores[0]?.nama || 'Grand Indonesia';
    const defaultSJ = lastRow?.noSuratJalan || '';

    setItemRows((prev) => [
      ...prev,
      {
        tempId: `row-${Date.now()}-${Math.random()}`,
        storeTujuan: defaultStore,
        noSuratJalan: defaultSJ,
        deskripsi: '',
        qty: 1,
        satuan: 'Koli',
        keterangan: '',
      },
    ]);
  };

  const handleDuplicateRow = (index: number) => {
    const target = itemRows[index];
    if (!target) return;
    const duplicated: ItemInputRow = {
      ...target,
      tempId: `row-${Date.now()}-${Math.random()}`,
    };
    const updated = [...itemRows];
    updated.splice(index + 1, 0, duplicated);
    setItemRows(updated);
  };

  const handleRemoveRow = (index: number) => {
    if (itemRows.length <= 1) {
      onShowToast('Minimal harus ada 1 baris barang dalam laporan', 'warning');
      return;
    }
    setItemRows((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpdateRow = (index: number, field: keyof ItemInputRow, val: any) => {
    setItemRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  // Handler Foto Per Baris (Opsi A)
  const handleItemPhotoUpload = async (index: number, file: File) => {
    if (!file) return;
    handleUpdateRow(index, 'isCompressingPhoto', true);
    try {
      const compressed = await compressImage(file, {
        maxWidth: 1200,
        maxHeight: 1200,
        quality: 0.75,
        maxSizeMB: 0.4,
      });
      handleUpdateRow(index, 'fotoBarang', compressed);
      onShowToast(`Foto barang #${index + 1} berhasil diambil`, 'success');
    } catch (err: any) {
      console.error('Compress photo failed:', err);
      onShowToast('Gagal memproses foto barang: ' + (err.message || ''), 'error');
    } finally {
      handleUpdateRow(index, 'isCompressingPhoto', false);
    }
  };

  const handleRemoveItemPhoto = (index: number) => {
    handleUpdateRow(index, 'fotoBarang', '');
  };

  // Handler Foto Keseluruhan / Koli / Packing (Opsi B)
  const handleOverallPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (overallPhotos.length + files.length > 8) {
      onShowToast('Maksimal 8 foto dokumentasi pengiriman', 'warning');
      return;
    }

    setIsCompressingOverall(true);
    try {
      const newCompressedPhotos: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const compressed = await compressImage(file, {
          maxWidth: 1200,
          maxHeight: 1200,
          quality: 0.75,
          maxSizeMB: 0.4,
        });
        newCompressedPhotos.push(compressed);
      }
      setOverallPhotos((prev) => [...prev, ...newCompressedPhotos]);
      onShowToast(`${newCompressedPhotos.length} foto dokumentasi berhasil ditambahkan`, 'success');
    } catch (err: any) {
      console.error('Compress overall photos failed:', err);
      onShowToast('Gagal memproses foto dokumentasi: ' + (err.message || ''), 'error');
    } finally {
      setIsCompressingOverall(false);
      if (overallFileInputRef.current) {
        overallFileInputRef.current.value = '';
      }
    }
  };

  const handleRemoveOverallPhoto = (photoIdx: number) => {
    setOverallPhotos((prev) => prev.filter((_, idx) => idx !== photoIdx));
  };

  const formCalculatedKoli = useMemo(() => {
    return itemRows.reduce((acc, row) => {
      const q = Math.max(1, Number(row.qty) || 1);
      return acc + (row.satuan === 'Pcs' ? 1 : q);
    }, 0);
  }, [itemRows]);

  const handleSubmitReport = async (autoPrint: boolean = false) => {
    for (let i = 0; i < itemRows.length; i++) {
      const row = itemRows[i];
      const targetStore = row.isCustomStore ? row.customStoreInput?.trim() : row.storeTujuan;
      if (!targetStore) {
        onShowToast(`Baris #${i + 1}: Tentukan Store Tujuan terlebih dahulu`, 'warning');
        return;
      }
      if (!row.deskripsi.trim()) {
        onShowToast(`Baris #${i + 1}: Deskripsi barang tidak boleh kosong`, 'warning');
        return;
      }
    }

    setIsSubmittingReport(true);
    try {
      // 1. Upload foto barang per baris ke Google Drive jika ada
      const uploadedRowPhotos: { [key: number]: string } = {};
      const rowsWithPhotos = itemRows
        .map((r, idx) => ({ idx, foto: r.fotoBarang }))
        .filter((r): r is { idx: number; foto: string } => Boolean(r.foto && r.foto.startsWith('data:image/')));

      if (rowsWithPhotos.length > 0) {
        onShowToast(`Mengunggah ${rowsWithPhotos.length} foto barang ke Google Drive...`, 'info');
        const photoDataUrls = rowsWithPhotos.map((r) => r.foto);
        const uploadResult = await uploadMultipleImagesToGdrive(
          photoDataUrls,
          'WMS_Dokumentasi_Barang_Store',
          `barang_${Date.now()}`
        );
        uploadResult.forEach((url, i) => {
          if (url) {
            uploadedRowPhotos[rowsWithPhotos[i].idx] = url;
          }
        });
      }

      // 2. Upload foto keseluruhan / koli / packing ke Google Drive jika ada
      let finalOverallPhotoUrls: string[] = [];
      const overallDataUrls = overallPhotos.filter((p) => p.startsWith('data:image/'));
      const existingOverallUrls = overallPhotos.filter((p) => !p.startsWith('data:image/'));

      if (overallDataUrls.length > 0) {
        onShowToast(`Mengunggah ${overallDataUrls.length} foto koli/packing ke Google Drive...`, 'info');
        const uploadOverallRes = await uploadMultipleImagesToGdrive(
          overallDataUrls,
          'WMS_Dokumentasi_Kirim_Store',
          `packing_${Date.now()}`
        );
        const validUploaded = uploadOverallRes.filter((u) => Boolean(u));
        finalOverallPhotoUrls = [...existingOverallUrls, ...validUploaded];
      } else {
        finalOverallPhotoUrls = existingOverallUrls;
      }

      const payloadItems = itemRows.map((r, idx) => ({
        store_tujuan: r.isCustomStore ? r.customStoreInput?.trim() || 'Store' : r.storeTujuan,
        no_surat_jalan: r.noSuratJalan.trim() || 'Tidak ada no surat jalan',
        deskripsi: r.deskripsi.trim(),
        qty: r.qty,
        satuan: r.satuan,
        keterangan: r.keterangan.trim(),
        foto_barang: uploadedRowPhotos[idx] || r.fotoBarang || '',
      }));

      const res = await savePengirimanStoreBatch({
        items: payloadItems,
        pic_nama: session?.name || 'Petugas Gudang',
        pic_username: session?.username || 'operator',
        foto_urls: finalOverallPhotoUrls,
      });

      if (res.success && res.reports.length > 0) {
        onShowToast(res.message, 'success');
        await loadReportsList();

        if (autoPrint) {
          const allLabels: KoliMarkingLabel[] = [];
          res.reports.forEach((rep) => {
            const labels = generateKoliLabelsForReport(rep);
            allLabels.push(...labels);
          });
          if (allLabels.length > 0) {
            setLabelsToPrint(allLabels);
            setPrintModalTitle(`Cetak Label Koli (${allLabels.length} Label)`);
            setPrintModalOpen(true);
          }
        }

        setItemRows([
          {
            tempId: `row-${Date.now()}`,
            storeTujuan: stores[0]?.nama || 'Grand Indonesia',
            noSuratJalan: '',
            deskripsi: '',
            qty: 1,
            satuan: 'Koli',
            keterangan: '',
            fotoBarang: '',
          },
        ]);
        setOverallPhotos([]);

        setActiveSubTab('dispatched');
      } else {
        onShowToast(res.message || 'Gagal menyimpan laporan', 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Terjadi kesalahan sistem saat submit', 'error');
    } finally {
      setIsSubmittingReport(false);
    }
  };

  // --------------------------------------------------------------------------
  // DISPATCHED SELECTION
  // --------------------------------------------------------------------------
  const filteredDispatched = useMemo(() => {
    return dispatchedReports.filter((r) => {
      const matchSearch =
        searchDispatched === '' ||
        r.store_tujuan.toLowerCase().includes(searchDispatched.toLowerCase()) ||
        r.id.toLowerCase().includes(searchDispatched.toLowerCase()) ||
        r.items.some((it) => it.deskripsi.toLowerCase().includes(searchDispatched.toLowerCase()));
      const matchStore = filterStoreDispatched === '' || r.store_tujuan === filterStoreDispatched;
      return matchSearch && matchStore;
    });
  }, [dispatchedReports, searchDispatched, filterStoreDispatched]);

  const handleToggleSelectDispatched = (id: string) => {
    setSelectedDispatchedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllDispatched = () => {
    if (selectedDispatchedIds.length === filteredDispatched.length) {
      setSelectedDispatchedIds([]);
    } else {
      setSelectedDispatchedIds(filteredDispatched.map((r) => r.id));
    }
  };

  const handleSendSelectedFromDispatched = (report: PengirimanStoreReport) => {
    setSelectedStoreKirim(report.store_tujuan);
    setSelectedReportIdsForKirim([report.id]);
    setActiveSubTab('kirim');
  };

  // --------------------------------------------------------------------------
  // TAB KIRIM: SELECTION & SUBMISSION
  // --------------------------------------------------------------------------
  const handleToggleSelectKirimItem = (reportId: string) => {
    setSelectedReportIdsForKirim((prev) =>
      prev.includes(reportId) ? prev.filter((id) => id !== reportId) : [...prev, reportId]
    );
  };

  const handleToggleAllKirimForStore = () => {
    if (selectedReportIdsForKirim.length === dispatchedForSelectedStore.length) {
      setSelectedReportIdsForKirim([]);
    } else {
      setSelectedReportIdsForKirim(dispatchedForSelectedStore.map((r) => r.id));
    }
  };

  const selectedDispatchedObjectsForKirim = useMemo(() => {
    return dispatchedForSelectedStore.filter((r) => selectedReportIdsForKirim.includes(r.id));
  }, [dispatchedForSelectedStore, selectedReportIdsForKirim]);

  const totalKoliSelectedForKirim = useMemo(() => {
    return selectedDispatchedObjectsForKirim.reduce((acc, r) => acc + r.total_koli, 0);
  }, [selectedDispatchedObjectsForKirim]);

  // SUBMIT KIRIM -> CETAK SURAT JALAN -> MASUK HISTORI
  const handleSubmitKirim = async () => {
    if (!selectedStoreKirim) {
      onShowToast('Pilih Store Tujuan terlebih dahulu', 'warning');
      return;
    }

    if (selectedReportIdsForKirim.length === 0) {
      onShowToast('Pilih minimal 1 barang / laporan dispatched untuk dikirim', 'warning');
      return;
    }

    if (!dikirimOleh.trim()) {
      onShowToast('Isi nama petugas yang mengirim (Dikirim Oleh)', 'warning');
      return;
    }

    setIsProcessingKirim(true);
    try {
      const res = await processKirimStoreReports({
        report_ids: selectedReportIdsForKirim,
        tanggal_kirim: tanggalKirim,
        waktu_kirim: getCurrentTimeString(),
        dikirim_oleh: dikirimOleh.trim(),
        catatan: catatanKirim.trim(),
        pic_nama: session?.name || 'Petugas Gudang',
        pic_username: session?.username || 'operator',
      });

      if (res.success) {
        onShowToast(res.message, 'success');
        const shippedReports = selectedDispatchedObjectsForKirim;

        // Reset kirim form
        setSelectedReportIdsForKirim([]);
        setCatatanKirim('');
        await loadReportsList();

        // 1. Otomatis buka modal Cetak Surat Jalan Pengiriman!
        handleOpenSuratJalanPrint(shippedReports, res.trip);

        // 2. Otomatis masuk ke tab Histori Pengiriman!
        setActiveSubTab('histori');
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal memproses pengiriman', 'error');
    } finally {
      setIsProcessingKirim(false);
    }
  };

  // --------------------------------------------------------------------------
  // HISTORI: EDIT, CANCEL, DELETE, AUDIT LOG
  // --------------------------------------------------------------------------
  const handleOpenEdit = (rep: PengirimanStoreReport) => {
    setEditingReport(rep);
    setEditDikirimOleh(rep.dikirim_oleh || '');
    setEditCatatanKirim(rep.catatan_kirim || '');
    setEditTanggalKirim(rep.tanggal_kirim || rep.tanggal_laporan || getTodayDateString());
  };

  const handleSaveEdit = async () => {
    if (!editingReport) return;
    if (!editDikirimOleh.trim()) {
      onShowToast('Nama petugas pengirim (Dikirim Oleh) tidak boleh kosong', 'warning');
      return;
    }

    setIsSavingEdit(true);
    try {
      const res = await editPengirimanStoreReport(
        editingReport.id,
        {
          dikirim_oleh: editDikirimOleh.trim(),
          catatan_kirim: editCatatanKirim.trim(),
          tanggal_kirim: editTanggalKirim,
        },
        {
          name: session?.name || 'Petugas Gudang',
          username: session?.username || 'operator',
        }
      );

      if (res.success) {
        onShowToast(res.message, 'success');
        setEditingReport(null);
        await loadReportsList();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal mengubah data pengiriman', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleOpenCancel = (rep: PengirimanStoreReport) => {
    setCancellingReport(rep);
    setCancelReason('');
  };

  const handleConfirmCancel = async () => {
    if (!cancellingReport) return;

    setIsProcessingCancel(true);
    try {
      const res = await cancelPengirimanStoreReport(
        cancellingReport.id,
        cancelReason.trim(),
        {
          name: session?.name || 'Petugas Gudang',
          username: session?.username || 'operator',
        }
      );

      if (res.success) {
        onShowToast(res.message, 'success');
        setCancellingReport(null);
        await loadReportsList();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal membatalkan pengiriman', 'error');
    } finally {
      setIsProcessingCancel(false);
    }
  };

  const handleDeleteReport = async (rep: PengirimanStoreReport) => {
    const confirmDel = window.confirm(
      `Apakah Anda yakin ingin menghapus data pengiriman ke ${rep.store_tujuan} (${rep.id}) secara permanen?`
    );
    if (!confirmDel) return;

    try {
      const res = await deletePengirimanStoreReport(rep.id);
      if (res.success) {
        onShowToast(res.message, 'info');
        await loadReportsList();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal menghapus', 'error');
    }
  };

  // --------------------------------------------------------------------------
  // PRINT HELPERS
  // --------------------------------------------------------------------------
  const handleOpenSuratJalanPrint = (
    reportsToPrint: PengirimanStoreReport[],
    tripInfo?: Partial<PengirimanStoreTrip>
  ) => {
    if (reportsToPrint.length === 0) {
      onShowToast('Pilih laporan pengiriman untuk mencetak surat jalan', 'warning');
      return;
    }
    setSuratJalanReportsToPrint(reportsToPrint);
    setSuratJalanTripToPrint(
      tripInfo || {
        tanggal_kirim: tanggalKirim,
        dikirim_oleh: dikirimOleh || 'Kurir Toko / Driver',
        catatan: catatanKirim,
        created_by_nama: session?.name || 'Admin Gudang',
      }
    );
    setSuratJalanModalOpen(true);
  };

  const handlePrintLabelsForReport = (rep: PengirimanStoreReport) => {
    const lbls = generateKoliLabelsForReport(rep);
    if (lbls.length === 0) {
      onShowToast('Tidak ada koli untuk dicetak labelnya', 'warning');
      return;
    }
    setLabelsToPrint(lbls);
    setPrintModalTitle(`Cetak Label Koli: ${rep.store_tujuan} (${lbls.length} Koli)`);
    setPrintModalOpen(true);
  };

  // --------------------------------------------------------------------------
  // FILTERED HISTORI LIST
  // --------------------------------------------------------------------------
  const filteredHistori = useMemo(() => {
    return sentReports.filter((r) => {
      const matchSearch =
        searchHistori === '' ||
        r.store_tujuan.toLowerCase().includes(searchHistori.toLowerCase()) ||
        (r.dikirim_oleh && r.dikirim_oleh.toLowerCase().includes(searchHistori.toLowerCase())) ||
        (r.catatan_kirim && r.catatan_kirim.toLowerCase().includes(searchHistori.toLowerCase())) ||
        r.id.toLowerCase().includes(searchHistori.toLowerCase()) ||
        r.items.some((it) => it.deskripsi.toLowerCase().includes(searchHistori.toLowerCase()));
      const matchStore = filterStoreHistori === '' || r.store_tujuan === filterStoreHistori;
      return matchSearch && matchStore;
    });
  }, [sentReports, searchHistori, filterStoreHistori]);

  return (
    <div className="space-y-4">
      {/* ==================================================================== */}
      {/* NAVIGATION TABS: Laporan | Dispatched | Kirim | Histori              */}
      {/* ==================================================================== */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white dark:bg-[#131d31] p-2.5 sm:p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {/* 1. Form Laporan */}
          <button
            type="button"
            onClick={() => setActiveSubTab('laporan')}
            className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'laporan'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Form Laporan</span>
          </button>

          {/* 2. Dispatched Tab */}
          <button
            type="button"
            onClick={() => setActiveSubTab('dispatched')}
            className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'dispatched'
                ? 'bg-amber-600 text-white shadow-md shadow-amber-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Box className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Dispatched</span>
            {dispatchedReports.length > 0 && (
              <span
                className={`ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeSubTab === 'dispatched'
                    ? 'bg-white text-amber-700'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                }`}
              >
                {dispatchedReports.length}
              </span>
            )}
          </button>

          {/* 3. Kirim Tab */}
          <button
            type="button"
            onClick={() => setActiveSubTab('kirim')}
            className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'kirim'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Kirim</span>
            {dispatchedReports.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-black bg-emerald-500 text-white">
                {dispatchedStoresList.length} Toko
              </span>
            )}
          </button>

          {/* 4. Histori Tab */}
          <button
            type="button"
            onClick={() => setActiveSubTab('histori')}
            className={`py-2 px-3 sm:px-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer select-none ${
              activeSubTab === 'histori'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60'
            }`}
          >
            <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span>Histori Pengiriman</span>
            {sentReports.length > 0 && (
              <span className="ml-1 text-[11px] opacity-80">({sentReports.length})</span>
            )}
          </button>
        </div>

        {/* Refresh button */}
        <button
          type="button"
          onClick={loadReportsList}
          disabled={loadingReports}
          className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          title="Segarkan Data"
        >
          <RefreshCw className={`w-4 h-4 ${loadingReports ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* ==================================================================== */}
      {/* 1. SUB-TAB: FORM LAPORAN                                             */}
      {/* ==================================================================== */}
      {activeSubTab === 'laporan' && (
        <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 space-y-5">
          <div className="border-b border-slate-200/80 dark:border-slate-800/80 pb-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Store className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  Form Laporan Pengiriman Store
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Input pengiriman barang cabang toko. Tiap baris memuat: Store Tujuan, No SJ, Deskripsi, Qty. Tanggal laporan otomatis timestamp submit.
                </p>
              </div>

              <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 px-3 py-1.5 rounded-xl">
                <Box className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <div className="text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Total: </span>
                  <span className="font-black text-indigo-700 dark:text-indigo-300 text-sm">
                    {formCalculatedKoli} Koli
                  </span>
                  <span className="text-[10px] text-slate-400 ml-1">({itemRows.length} Barang)</span>
                </div>
              </div>
            </div>
          </div>

          {/* Rows List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-indigo-500" />
                Daftar Barang Dikirim ({itemRows.length} Baris)
              </span>

              <button
                type="button"
                onClick={handleAddRow}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 flex items-center gap-1 transition-all cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                Tambah Barang
              </button>
            </div>

            <div className="space-y-3">
              {itemRows.map((row, index) => {
                const rowQty = Math.max(1, Number(row.qty) || 1);
                const rowKoli = row.satuan === 'Pcs' ? 1 : rowQty;

                return (
                  <div
                    key={row.tempId}
                    className="p-3 sm:p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/30 space-y-3 relative group transition-all hover:border-slate-300"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-700/60 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          Barang #{index + 1}
                        </span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300">
                          {rowKoli} Koli
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleDuplicateRow(index)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 transition-colors"
                          title="Duplikasi Baris"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveRow(index)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 transition-colors"
                          title="Hapus Baris"
                          disabled={itemRows.length <= 1}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
                      {/* Store Tujuan */}
                      <div className="sm:col-span-4 space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <Store className="w-3 h-3 text-indigo-500" />
                          Store Tujuan <span className="text-rose-500">*</span>
                        </label>
                        {!row.isCustomStore ? (
                          <select
                            value={row.storeTujuan}
                            onChange={(e) => {
                              if (e.target.value === '__custom__') {
                                handleUpdateRow(index, 'isCustomStore', true);
                                handleUpdateRow(index, 'customStoreInput', '');
                              } else {
                                handleUpdateRow(index, 'storeTujuan', e.target.value);
                              }
                            }}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
                          >
                            {stores.map((s, sIdx) => (
                              <option key={s.id || sIdx} value={s.nama}>
                                {s.nama}
                              </option>
                            ))}
                            <option value="__custom__">+ Toko Lainnya (Manual)...</option>
                          </select>
                        ) : (
                          <div className="flex gap-1">
                            <input
                              type="text"
                              placeholder="Nama store tujuan..."
                              value={row.customStoreInput || ''}
                              onChange={(e) => handleUpdateRow(index, 'customStoreInput', e.target.value)}
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-400 rounded-lg text-xs font-bold outline-none"
                              autoFocus
                            />
                            <button
                              type="button"
                              onClick={() => handleUpdateRow(index, 'isCustomStore', false)}
                              className="px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-200 rounded-lg"
                            >
                              Batal
                            </button>
                          </div>
                        )}
                      </div>

                      {/* No Surat Jalan */}
                      <div className="sm:col-span-3 space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          <FileText className="w-3 h-3 text-slate-400" />
                          No. Surat Jalan
                        </label>
                        <input
                          type="text"
                          placeholder="SJ-XXXX (Boleh kosong)"
                          value={row.noSuratJalan}
                          onChange={(e) => handleUpdateRow(index, 'noSuratJalan', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-mono outline-none"
                        />
                      </div>

                      {/* Deskripsi Barang */}
                      <div className="sm:col-span-5 space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1">
                          Deskripsi Barang <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          placeholder="Contoh: Dress Satin Pink S / Brosur Toko..."
                          value={row.deskripsi}
                          onChange={(e) => handleUpdateRow(index, 'deskripsi', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs outline-none"
                        />
                      </div>

                      {/* Qty & Satuan */}
                      <div className="sm:col-span-4 flex gap-2">
                        <div className="flex-1 space-y-1">
                          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            Qty <span className="text-rose-500">*</span>
                          </label>
                          <input
                            type="number"
                            min="1"
                            value={row.qty}
                            onChange={(e) => {
                              const val = e.target.value === '' ? '' : Math.max(1, Number(e.target.value));
                              handleUpdateRow(index, 'qty', val);
                            }}
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-center outline-none"
                          />
                        </div>
                        <div className="w-24 space-y-1">
                          <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                            Satuan
                          </label>
                          <select
                            value={row.satuan}
                            onChange={(e) => handleUpdateRow(index, 'satuan', e.target.value as SatuanPengirimanStore)}
                            className="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold outline-none"
                          >
                            <option value="Koli">Koli</option>
                            <option value="Pcs">Pcs</option>
                          </select>
                        </div>
                      </div>

                      {/* Keterangan */}
                      <div className="sm:col-span-8 space-y-1">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-400">
                          Keterangan Tambahan (opsional)
                        </label>
                        <input
                          type="text"
                          placeholder="Catatan barang, nomor batch, instruksi..."
                          value={row.keterangan}
                          onChange={(e) => handleUpdateRow(index, 'keterangan', e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs outline-none"
                        />
                      </div>

                      {/* Dokumentasi Foto Barang (Opsi A) */}
                      <div className="sm:col-span-12 pt-1 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Camera className="w-3.5 h-3.5 text-indigo-500" />
                              Foto Barang #{index + 1} (Opsional):
                            </span>

                            {row.fotoBarang ? (
                              <div className="flex items-center gap-2">
                                <div
                                  onClick={() => {
                                    setPreviewPhotoUrl(row.fotoBarang || null);
                                    setPreviewPhotoTitle(`Foto Barang: ${row.deskripsi || 'Baris #' + (index + 1)}`);
                                  }}
                                  className="relative group cursor-pointer w-10 h-10 rounded-lg border border-indigo-200 dark:border-indigo-800 overflow-hidden shrink-0 bg-slate-100"
                                >
                                  <img
                                    src={row.fotoBarang}
                                    alt="Foto Barang"
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                  />
                                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                                    <Eye className="w-3.5 h-3.5" />
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewPhotoUrl(row.fotoBarang || null);
                                    setPreviewPhotoTitle(`Foto Barang: ${row.deskripsi || 'Baris #' + (index + 1)}`);
                                  }}
                                  className="text-[11px] text-indigo-600 hover:text-indigo-700 font-bold cursor-pointer"
                                >
                                  Lihat Foto
                                </button>
                                <span className="text-slate-300 dark:text-slate-700">•</span>
                                <button
                                  type="button"
                                  onClick={() => handleRemoveItemPhoto(index)}
                                  className="text-[11px] text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                                >
                                  Hapus Foto
                                </button>
                              </div>
                            ) : (
                              <label className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 text-[11px] font-bold hover:bg-indigo-100/60 cursor-pointer transition-colors">
                                {row.isCompressingPhoto ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Memproses Foto...</span>
                                  </>
                                ) : (
                                  <>
                                    <Camera className="w-3.5 h-3.5" />
                                    <span>Upload / Ambil Foto</span>
                                  </>
                                )}
                                <input
                                  type="file"
                                  accept="image/*"
                                  capture="environment"
                                  className="hidden"
                                  disabled={row.isCompressingPhoto}
                                  onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleItemPhotoUpload(index, file);
                                  }}
                                />
                              </label>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            Format otomatis dikompresi & disimpan ke Google Drive saat submit
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              onClick={handleAddRow}
              className="w-full py-2.5 rounded-xl border border-dashed border-indigo-300 dark:border-indigo-800 bg-indigo-50/40 dark:bg-indigo-950/20 text-indigo-600 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Baris Barang Lagi</span>
            </button>

            {/* DOKUMENTASI PENGIRIMAN KESELURUHAN (OPSI B: FOTO KOLI / PACKING / BUKTI KIRIM) */}
            <div className="mt-5 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-850/60 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <ImageIcon className="w-4 h-4 text-emerald-600" />
                    Dokumentasi Pengiriman Keseluruhan (Foto Koli / Packing / Bukti Fisik)
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Foto tumpukan koli, karung, kardus bersegel, atau kondisi fisik sebelum dikirim (Maks 8 foto).
                  </p>
                </div>

                <div>
                  <input
                    ref={overallFileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    capture="environment"
                    className="hidden"
                    disabled={isCompressingOverall}
                    onChange={handleOverallPhotoUpload}
                  />
                  <button
                    type="button"
                    onClick={() => overallFileInputRef.current?.click()}
                    disabled={isCompressingOverall || overallPhotos.length >= 8}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/60 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isCompressingOverall ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Memproses Foto...</span>
                      </>
                    ) : (
                      <>
                        <Camera className="w-3.5 h-3.5" />
                        <span>+ Tambah Foto Koli / Packing</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {overallPhotos.length === 0 ? (
                <div
                  onClick={() => overallFileInputRef.current?.click()}
                  className="p-6 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 text-center space-y-1.5 cursor-pointer hover:bg-slate-100/70 transition-colors"
                >
                  <UploadCloud className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400">
                    Klik untuk upload foto packing keseluruhan (opsional)
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Bisa ambil langsung dari kamera HP atau pilih dari galeri
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5 pt-1">
                  {overallPhotos.map((photo, pIdx) => (
                    <div
                      key={pIdx}
                      className="group relative rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900 aspect-square shadow-2xs"
                    >
                      <img
                        src={photo}
                        alt={`Foto Packing ${pIdx + 1}`}
                        className="w-full h-full object-cover cursor-pointer"
                        referrerPolicy="no-referrer"
                        onClick={() => {
                          setPreviewPhotoUrl(photo);
                          setPreviewPhotoTitle(`Dokumentasi Pengiriman #${pIdx + 1}`);
                        }}
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                        <button
                          type="button"
                          onClick={() => {
                            setPreviewPhotoUrl(photo);
                            setPreviewPhotoTitle(`Dokumentasi Pengiriman #${pIdx + 1}`);
                          }}
                          className="p-1 rounded-md bg-white/90 text-slate-800 hover:bg-white cursor-pointer"
                          title="Lihat Foto"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveOverallPhoto(pIdx)}
                          className="p-1 rounded-md bg-rose-600/90 text-white hover:bg-rose-700 cursor-pointer"
                          title="Hapus Foto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <span className="absolute bottom-1 left-1 bg-black/60 text-white text-[9px] px-1.5 py-0.5 rounded font-bold">
                        #{pIdx + 1}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Barang yang disubmit langsung masuk ke antrean <strong className="text-amber-600">Dispatched</strong>.
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => handleSubmitReport(false)}
                disabled={isSubmittingReport}
                className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4 text-slate-500" />
                <span>Simpan ke Dispatched</span>
              </button>

              <button
                type="button"
                onClick={() => handleSubmitReport(true)}
                disabled={isSubmittingReport}
                className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/25 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <QrCode className="w-4 h-4" />
                <span>Submit & Cetak Barcode Koli</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. SUB-TAB: DISPATCHED (READY KIRIM)                                 */}
      {/* ==================================================================== */}
      {activeSubTab === 'dispatched' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#131d31] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari Store, ID, Deskripsi..."
                  value={searchDispatched}
                  onChange={(e) => setSearchDispatched(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>

              <select
                value={filterStoreDispatched}
                onChange={(e) => setFilterStoreDispatched(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold outline-none"
              >
                <option value="">Semua Store Tujuan</option>
                {stores.map((s, idx) => (
                  <option key={s.id || idx} value={s.nama}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSelectAllDispatched}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer"
              >
                {selectedDispatchedIds.length === filteredDispatched.length && filteredDispatched.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-indigo-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>Pilih Semua ({filteredDispatched.length})</span>
              </button>
            </div>
          </div>

          {filteredDispatched.length === 0 ? (
            <div className="bg-white dark:bg-[#131d31] p-10 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <Box className="w-12 h-12 text-slate-300 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Tidak ada laporan dispatched yang menunggu kirim
              </h4>
              <p className="text-xs text-slate-500">
                Silakan input barang di tab Form Laporan untuk mencatat barang yang ready dikirim.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredDispatched.map((rep) => {
                const isChecked = selectedDispatchedIds.includes(rep.id);

                return (
                  <div
                    key={rep.id}
                    className={`bg-white dark:bg-[#131d31] rounded-2xl border transition-all p-4 space-y-3 ${
                      isChecked
                        ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md'
                        : 'border-slate-200 dark:border-slate-800 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => handleToggleSelectDispatched(rep.id)}
                          className="mt-0.5 text-slate-400 hover:text-indigo-600 cursor-pointer"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-5 h-5 text-indigo-600" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-400" />
                          )}
                        </button>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-base font-black text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                              <Store className="w-4 h-4 text-indigo-500" />
                              {rep.store_tujuan}
                            </h4>
                            <span className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">
                              Dispatched
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {rep.tanggal_laporan} • PIC: {rep.pic_nama}
                          </div>
                        </div>
                      </div>

                      <div className="bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 px-3 py-1 rounded-xl text-right">
                        <span className="text-[10px] text-slate-400 block">Total Koli</span>
                        <span className="text-sm font-black text-indigo-600 dark:text-indigo-400">
                          {rep.total_koli} Koli
                        </span>
                      </div>
                    </div>

                    {/* Rincian Barang */}
                    <div className="bg-slate-50/80 dark:bg-slate-800/40 rounded-xl p-2.5 border border-slate-200/80 dark:border-slate-800/80">
                      <div className="text-[10px] font-black uppercase text-slate-500 mb-1">
                        Rincian Barang ({rep.items.length} item):
                      </div>
                      <div className="divide-y divide-slate-200/60 dark:divide-slate-700/60 text-xs">
                        {rep.items.map((it, itIdx) => (
                          <div key={it.id || itIdx} className="py-1 flex justify-between items-center gap-2">
                            <div className="truncate flex items-center gap-1">
                              <span className="font-mono text-[10px] text-slate-400 mr-1.5">
                                [{it.no_surat_jalan}]
                              </span>
                              <span className="font-bold">{it.deskripsi}</span>
                              {it.foto_barang && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPreviewPhotoUrl(it.foto_barang || null);
                                    setPreviewPhotoTitle(`Foto Barang: ${it.deskripsi}`);
                                  }}
                                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 text-[10px] font-bold hover:bg-indigo-100 cursor-pointer shrink-0 ml-1"
                                  title="Lihat Foto Dokumentasi Barang"
                                >
                                  <Camera className="w-3 h-3 text-indigo-500" />
                                  <span>Foto</span>
                                </button>
                              )}
                            </div>
                            <div className="shrink-0 font-semibold">
                              {it.qty} {it.satuan} ({it.hitung_koli} Koli)
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Foto Dokumentasi Pengiriman Keseluruhan (Jika Ada) */}
                    {rep.foto_urls && rep.foto_urls.length > 0 && (
                      <div className="flex items-center gap-2 pt-0.5">
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                          <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                          Dokumentasi Koli ({rep.foto_urls.length}):
                        </span>
                        <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                          {rep.foto_urls.map((photoUrl, pIdx) => (
                            <div
                              key={pIdx}
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewPhotoUrl(photoUrl);
                                setPreviewPhotoTitle(`Dokumentasi Pengiriman ${rep.store_tujuan} #${pIdx + 1}`);
                              }}
                              className="w-7 h-7 rounded-md border border-slate-300 dark:border-slate-700 overflow-hidden shrink-0 cursor-pointer hover:opacity-80 transition-opacity bg-slate-100"
                              title="Klik untuk memperbesar"
                            >
                              <img
                                src={photoUrl}
                                alt="Dokumentasi"
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-1">
                      <button
                        type="button"
                        onClick={() => handleDeleteReport(rep)}
                        className="text-xs text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Hapus
                      </button>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handlePrintLabelsForReport(rep)}
                          className="px-3 py-1.5 rounded-xl text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Label Koli</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSendSelectedFromDispatched(rep)}
                          className="px-3.5 py-1.5 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <span>Setup Kirim</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. SUB-TAB: TAB KIRIM (SETUP PENGIRIMAN SPESIFIK STORE)               */}
      {/* ==================================================================== */}
      {activeSubTab === 'kirim' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 sm:p-5 space-y-5">
            {/* Header */}
            <div className="border-b border-slate-200 dark:border-slate-800 pb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  Atur Pengiriman Barang ke Store
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Pilih Store Tujuan. Daftar barang dispatched toko tersebut akan otomatis muncul dan dapat dipilih untuk dikirim.
                </p>
              </div>

              {/* Status summary */}
              {selectedStoreKirim && (
                <div className="bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800/80 px-3 py-1.5 rounded-xl text-xs">
                  <span className="text-slate-500">Terpilih untuk dikirim: </span>
                  <strong className="text-blue-700 dark:text-blue-300">
                    {totalKoliSelectedForKirim} Koli ({selectedReportIdsForKirim.length} Laporan)
                  </strong>
                </div>
              )}
            </div>

            {/* FORM SETUP KIRIM */}
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3.5">
              {/* 1. Pilih Store Tujuan */}
              <div className="sm:col-span-6 space-y-1">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <Store className="w-4 h-4 text-blue-600" />
                  Pilih Store Tujuan <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedStoreKirim}
                  onChange={(e) => setSelectedStoreKirim(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-2 border-blue-400 dark:border-blue-600 rounded-xl text-xs font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- Pilih Toko Cabang Tujuan --</option>
                  {/* Prioritaskan toko yang memiliki barang dispatched */}
                  {dispatchedStoresList.map((ds) => (
                    <option key={ds.storeName} value={ds.storeName}>
                      {ds.storeName} ({ds.koli} Koli Ready - {ds.count} Laporan)
                    </option>
                  ))}
                  {/* Toko lainnya dari master */}
                  {stores
                    .filter((s) => !dispatchedStoresList.some((ds) => ds.storeName === s.nama))
                    .map((s, idx) => (
                      <option key={s.id || idx} value={s.nama}>
                        {s.nama} (0 Koli Ready)
                      </option>
                    ))}
                </select>
                <div className="text-[11px] text-slate-400">
                  Saat store dipilih, seluruh barang yang ready kirim di toko ini otomatis muncul di bawah.
                </div>
              </div>

              {/* 2. Dikirim Oleh (Driver / Kurir) - PERLU */}
              <div className="sm:col-span-6 space-y-1">
                <label className="text-xs font-black text-slate-800 dark:text-slate-200 flex items-center gap-1">
                  <User className="w-4 h-4 text-blue-600" />
                  Dikirim Oleh (Driver / Kurir) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pak Joko (Driver Internal) / Nama Petugas"
                  value={dikirimOleh}
                  onChange={(e) => setDikirimOleh(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500"
                />
                {/* Quick suggestions */}
                <div className="flex gap-1.5 mt-1 flex-wrap">
                  {['Driver Toko Internal', 'Kurir Operasional', 'Staff Logistik'].map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => setDikirimOleh(sug)}
                      className="text-[10px] px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 cursor-pointer"
                    >
                      {sug}
                    </button>
                  ))}
                </div>
              </div>

              {/* 3. Tanggal Kirim */}
              <div className="sm:col-span-4 space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  Tanggal Kirim
                </label>
                <input
                  type="date"
                  value={tanggalKirim}
                  onChange={(e) => setTanggalKirim(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
                />
              </div>

              {/* 4. Catatan Kirim - PERLU */}
              <div className="sm:col-span-8 space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-slate-400" />
                  Catatan Kirim
                </label>
                <input
                  type="text"
                  placeholder="Catatan pengiriman untuk toko atau driver (opsional)..."
                  value={catatanKirim}
                  onChange={(e) => setCatatanKirim(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 outline-none"
                />
              </div>
            </div>

            {/* DAFTAR BARANG DISPATCHED TOKO TERSEBUT (OTOMATIS MUNCUL) */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Box className="w-4 h-4 text-amber-500" />
                    Daftar Dispatched Toko:{' '}
                    <span className="text-blue-600 underline">{selectedStoreKirim || '(Pilih Toko di Atas)'}</span>
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Centang barang yang akan diberangkatkan sekarang (bisa semua atau pilih beberapa).
                  </p>
                </div>

                {dispatchedForSelectedStore.length > 0 && (
                  <button
                    type="button"
                    onClick={handleToggleAllKirimForStore}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    {selectedReportIdsForKirim.length === dispatchedForSelectedStore.length ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400" />
                    )}
                    <span>
                      {selectedReportIdsForKirim.length === dispatchedForSelectedStore.length
                        ? 'Batal Pilih Semua'
                        : `Pilih Semua (${dispatchedForSelectedStore.length})`}
                    </span>
                  </button>
                )}
              </div>

              {!selectedStoreKirim ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-300 text-slate-400 text-xs">
                  Pilih Store Tujuan pada dropdown di atas untuk memuat daftar barang dispatched toko tersebut.
                </div>
              ) : dispatchedForSelectedStore.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-dashed border-slate-300 space-y-2 text-xs">
                  <Box className="w-8 h-8 text-slate-300 mx-auto" />
                  <p className="text-slate-500">
                    Tidak ada barang di antrean Dispatched untuk store <strong>{selectedStoreKirim}</strong>.
                  </p>
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('laporan')}
                    className="text-indigo-600 font-bold hover:underline cursor-pointer"
                  >
                    + Buat Laporan Pengiriman Toko Ini
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {dispatchedForSelectedStore.map((r) => {
                    const isSelected = selectedReportIdsForKirim.includes(r.id);

                    return (
                      <div
                        key={r.id}
                        onClick={() => handleToggleSelectKirimItem(r.id)}
                        className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2.5 ${
                          isSelected
                            ? 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-500 ring-2 ring-blue-500/20 shadow-sm'
                            : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleSelectKirimItem(r.id);
                              }}
                              className="text-slate-400 hover:text-blue-600 cursor-pointer"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-5 h-5 text-blue-600" />
                              ) : (
                                <Square className="w-5 h-5 text-slate-400" />
                              )}
                            </button>
                            <div>
                              <div className="text-xs font-black text-slate-800 dark:text-slate-200 font-mono">
                                {r.id}
                              </div>
                              <div className="text-[10px] text-slate-400">Tgl: {r.tanggal_laporan}</div>
                            </div>
                          </div>

                          <span className="bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-black text-xs px-2 py-0.5 rounded-md">
                            {r.total_koli} Koli
                          </span>
                        </div>

                        {/* Rincian item */}
                        <div className="bg-white/80 dark:bg-slate-900/60 p-2 rounded-lg border border-slate-200 dark:border-slate-800 text-[11px] space-y-1">
                          {r.items.map((it, i) => (
                            <div key={i} className="flex justify-between items-center gap-2">
                              <span className="truncate max-w-[200px] text-slate-700 dark:text-slate-300">
                                • {it.deskripsi}
                              </span>
                              <span className="font-semibold text-slate-500 shrink-0">
                                {it.qty} {it.satuan}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* SUBMIT BUTTON */}
            <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                Alur: <strong>Submit Kirim</strong> → <strong>Cetak Surat Jalan (A4 Rangkap 2)</strong> → Masuk ke <strong>Histori</strong>.
              </div>

              <button
                type="button"
                onClick={handleSubmitKirim}
                disabled={isProcessingKirim || selectedReportIdsForKirim.length === 0}
                className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-black text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                <span>Submit Kirim & Cetak Surat Jalan ({totalKoliSelectedForKirim} Koli)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 4. SUB-TAB: HISTORI PENGIRIMAN                                       */}
      {/* Fitur: Cetak Ulang Surat Jalan, Edit, Cancel/Delete, Histori Log     */}
      {/* ==================================================================== */}
      {activeSubTab === 'histori' && (
        <div className="space-y-3">
          {/* Toolbar */}
          <div className="bg-white dark:bg-[#131d31] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 flex-1">
              <div className="relative flex-1 min-w-[200px] max-w-md">
                <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Cari Store, Driver, Catatan, ID..."
                  value={searchHistori}
                  onChange={(e) => setSearchHistori(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs outline-none"
                />
              </div>

              <select
                value={filterStoreHistori}
                onChange={(e) => setFilterStoreHistori(e.target.value)}
                className="px-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold outline-none"
              >
                <option value="">Semua Store Tujuan</option>
                {stores.map((s, idx) => (
                  <option key={s.id || idx} value={s.nama}>
                    {s.nama}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-xs font-bold text-slate-500">
              Total <strong className="text-emerald-600">{filteredHistori.length}</strong> Pengiriman
            </div>
          </div>

          {filteredHistori.length === 0 ? (
            <div className="bg-white dark:bg-[#131d31] p-10 rounded-2xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
              <Clock className="w-12 h-12 text-slate-300 mx-auto" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Belum ada histori pengiriman
              </h4>
              <p className="text-xs text-slate-500">
                Laporan yang telah diproses di tab Kirim akan otomatis tercatat di sini.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="px-3.5 py-3">Tgl Kirim</th>
                      <th className="px-3.5 py-3">Store Tujuan</th>
                      <th className="px-3.5 py-3">Dikirim Oleh</th>
                      <th className="px-3.5 py-3">Catatan Pengiriman</th>
                      <th className="px-3.5 py-3">Muatan Koli</th>
                      <th className="px-3.5 py-3">Status & Riwayat</th>
                      <th className="px-3.5 py-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredHistori.map((rep) => {
                      const hasAuditLogs = rep.audit_logs && rep.audit_logs.length > 0;
                      const isCancelled = rep.status === 'cancelled';

                      return (
                        <tr key={rep.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          {/* Tanggal Kirim */}
                          <td className="px-3.5 py-3">
                            <div className="font-bold text-slate-800 dark:text-slate-200">
                              {rep.tanggal_kirim || rep.tanggal_laporan}
                            </div>
                            <div className="text-[10px] text-slate-400 font-mono">{rep.id}</div>
                          </td>

                          {/* Store Tujuan */}
                          <td className="px-3.5 py-3">
                            <div className="font-black text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                              <Store className="w-3.5 h-3.5 text-indigo-500" />
                              {rep.store_tujuan}
                            </div>
                            <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                              <span>{rep.items.length} Macam Barang</span>
                              {rep.foto_urls && rep.foto_urls.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewPhotoUrl(rep.foto_urls![0]);
                                    setPreviewPhotoTitle(`Dokumentasi Pengiriman ${rep.store_tujuan}`);
                                  }}
                                  className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-bold hover:underline cursor-pointer"
                                  title="Lihat Foto Dokumentasi Pengiriman"
                                >
                                  <ImageIcon className="w-3 h-3" />
                                  <span>{rep.foto_urls.length} Foto</span>
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Dikirim Oleh */}
                          <td className="px-3.5 py-3 font-semibold text-slate-800 dark:text-slate-200">
                            {rep.dikirim_oleh || '-'}
                          </td>

                          {/* Catatan Kirim */}
                          <td className="px-3.5 py-3 text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                            {rep.catatan_kirim || '-'}
                          </td>

                          {/* Muatan Koli */}
                          <td className="px-3.5 py-3">
                            <span className="bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-black px-2 py-0.5 rounded-md">
                              {rep.total_koli} Koli
                            </span>
                          </td>

                          {/* Status & Riwayat Log */}
                          <td className="px-3.5 py-3">
                            <div className="flex items-center gap-1.5">
                              {isCancelled ? (
                                <span className="bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300 font-black text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <XCircle className="w-3 h-3 text-rose-600" />
                                  Dibatalkan
                                </span>
                              ) : (
                                <span className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 font-black text-[10px] px-2 py-0.5 rounded-full flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Terkirim
                                </span>
                              )}

                              {hasAuditLogs && (
                                <button
                                  type="button"
                                  onClick={() => setViewingAuditReport(rep)}
                                  className="text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5 bg-amber-50 dark:bg-amber-950/40 px-1.5 py-0.5 rounded-md cursor-pointer"
                                  title="Lihat Riwayat Edit / Cancel"
                                >
                                  <History className="w-3 h-3" />
                                  <span>Log ({rep.audit_logs?.length})</span>
                                </button>
                              )}
                            </div>
                          </td>

                          {/* Aksi: Cetak Ulang Surat Jalan, Edit, Cancel, Delete */}
                          <td className="px-3.5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* 1. Cetak Ulang Surat Jalan */}
                              <button
                                type="button"
                                onClick={() => handleOpenSuratJalanPrint([rep])}
                                className="px-2.5 py-1 text-[11px] font-bold text-blue-600 dark:text-blue-400 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/40 rounded-lg flex items-center gap-1 cursor-pointer"
                                title="Cetak Ulang Surat Jalan Pengiriman (A4 Rangkap 2)"
                              >
                                <FileText className="w-3 h-3" />
                                Surat Jalan
                              </button>

                              {/* 2. Edit Pengiriman */}
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(rep)}
                                className="px-2 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg flex items-center gap-1 cursor-pointer"
                                title="Edit Info Pengiriman"
                              >
                                <Edit className="w-3 h-3 text-slate-500" />
                                Edit
                              </button>

                              {/* 3. Cancel Pengiriman */}
                              <button
                                type="button"
                                onClick={() => handleOpenCancel(rep)}
                                className="px-2 py-1 text-[11px] font-bold text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-lg flex items-center gap-1 cursor-pointer"
                                title="Batalkan Pengiriman & Kembalikan ke Dispatched"
                              >
                                <XCircle className="w-3 h-3" />
                                Cancel
                              </button>

                              {/* 4. Delete Pengiriman */}
                              <button
                                type="button"
                                onClick={() => handleDeleteReport(rep)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer"
                                title="Hapus Permanen"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: EDIT PENGIRIMAN                                               */}
      {/* ==================================================================== */}
      {editingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/60">
              <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                <Edit className="w-4 h-4 text-blue-600" />
                Edit Pengiriman ke {editingReport.store_tujuan}
              </h4>
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Tanggal Kirim <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={editTanggalKirim}
                  onChange={(e) => setEditTanggalKirim(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Dikirim Oleh (Driver / Kurir) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={editDikirimOleh}
                  onChange={(e) => setEditDikirimOleh(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Catatan Pengiriman
                </label>
                <textarea
                  rows={2}
                  value={editCatatanKirim}
                  onChange={(e) => setEditCatatanKirim(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-300">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Perubahan ini akan otomatis dicatat ke riwayat log audit pengiriman.</span>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setEditingReport(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                disabled={isSavingEdit}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 cursor-pointer disabled:opacity-50"
              >
                Simpan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CANCEL PENGIRIMAN (KEMBALIKAN KE DISPATCHED)                  */}
      {/* ==================================================================== */}
      {cancellingReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-rose-50 dark:bg-rose-950/40">
              <h4 className="text-sm font-black text-rose-700 dark:text-rose-300 uppercase flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600" />
                Batalkan Pengiriman (Cancel)
              </h4>
              <button
                type="button"
                onClick={() => setCancellingReport(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs">
              <p className="text-slate-600 dark:text-slate-400">
                Apakah Anda yakin ingin membatalkan pengiriman ke <strong>{cancellingReport.store_tujuan}</strong> ({cancellingReport.total_koli} Koli)?
              </p>
              <p className="text-emerald-700 dark:text-emerald-400 font-bold bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200 dark:border-emerald-800/60">
                ✓ Barang akan otomatis dikembalikan ke antrean <strong>Dispatched</strong> sehingga siap diatur kembali pengirimannya.
              </p>

              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Alasan Pembatalan <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Jadwal kirim ditunda / Armada rusak / Salah input..."
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                  autoFocus
                />
              </div>
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2 bg-slate-50 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setCancellingReport(null)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                disabled={isProcessingCancel}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 cursor-pointer disabled:opacity-50"
              >
                Konfirmasi Pembatalan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: AUDIT LOG (RIWAYAT EDIT & CANCEL)                             */}
      {/* ==================================================================== */}
      {viewingAuditReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/60">
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase flex items-center gap-1.5">
                  <History className="w-4 h-4 text-amber-500" />
                  Riwayat Log Pengiriman ke {viewingAuditReport.store_tujuan}
                </h4>
                <p className="text-[10px] text-slate-400 font-mono">{viewingAuditReport.id}</p>
              </div>
              <button
                type="button"
                onClick={() => setViewingAuditReport(null)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs max-h-[60vh] overflow-y-auto">
              {!viewingAuditReport.audit_logs || viewingAuditReport.audit_logs.length === 0 ? (
                <div className="text-center py-6 text-slate-400">Belum ada riwayat perubahan data.</div>
              ) : (
                <div className="space-y-2.5">
                  {viewingAuditReport.audit_logs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-1.5"
                    >
                      <div className="flex justify-between items-center">
                        <span
                          className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                            log.action === 'cancel'
                              ? 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                              : log.action === 'edit'
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'
                              : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                          }`}
                        >
                          {log.action.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(log.timestamp).toLocaleString('id-ID')}
                        </span>
                      </div>

                      <div className="font-bold text-slate-800 dark:text-slate-200">
                        Oleh: {log.user_nama} ({log.user_username || 'user'})
                      </div>

                      <div className="text-slate-600 dark:text-slate-400 text-[11px]">
                        {log.keterangan}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex justify-end bg-slate-50 dark:bg-slate-800/60">
              <button
                type="button"
                onClick={() => setViewingAuditReport(null)}
                className="px-4 py-1.5 rounded-xl text-xs font-bold text-slate-700 bg-slate-200 hover:bg-slate-300 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: PREVIEW DOKUMENTASI FOTO (ZOOM / FULL VIEW)                   */}
      {/* ==================================================================== */}
      {previewPhotoUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewPhotoUrl(null)}
        >
          <div
            className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full overflow-hidden shadow-2xl space-y-3 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
              <h3 className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-indigo-500" />
                <span>{previewPhotoTitle}</span>
              </h3>
              <button
                type="button"
                onClick={() => setPreviewPhotoUrl(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="relative rounded-xl overflow-hidden bg-slate-950 flex items-center justify-center max-h-[70vh]">
              <img
                src={previewPhotoUrl}
                alt="Preview"
                className="max-h-[68vh] w-auto object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="flex items-center justify-between pt-1 text-xs">
              <span className="text-[11px] text-slate-400">
                Tersimpan di cloud / Google Drive
              </span>
              <div className="flex items-center gap-2">
                {previewPhotoUrl.startsWith('http') && (
                  <a
                    href={previewPhotoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
                  >
                    Buka di Tab Baru
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewPhotoUrl(null)}
                  className="px-4 py-1.5 rounded-xl text-xs font-bold text-white bg-slate-800 hover:bg-slate-700 cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MODAL: CETAK BARCODE MARKING KOLI (50x20 & A6)                       */}
      {/* ==================================================================== */}
      <KoliMarkingPrintModal
        isOpen={printModalOpen}
        onClose={() => setPrintModalOpen(false)}
        labels={labelsToPrint}
        title={printModalTitle}
      />

      {/* ==================================================================== */}
      {/* MODAL: CETAK SURAT JALAN PENGIRIMAN (A4 BAGI 2 DENGAN KOTAK CEKLIS)  */}
      {/* ==================================================================== */}
      <SuratJalanPrintModal
        isOpen={suratJalanModalOpen}
        onClose={() => setSuratJalanModalOpen(false)}
        trip={suratJalanTripToPrint}
        reports={suratJalanReportsToPrint}
      />
    </div>
  );
};
