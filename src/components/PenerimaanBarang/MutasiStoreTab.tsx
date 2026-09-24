import React, { useState, useEffect, useMemo } from 'react';
import {
  Store,
  Calendar,
  Layers,
  FileText,
  Camera,
  Save,
  RotateCcw,
  Search,
  Filter,
  Plus,
  Trash2,
  ExternalLink,
  MapPin,
  Clock,
  User,
  CheckCircle2,
  AlertCircle,
  Eye,
  Settings2,
  X,
  Loader2,
  ImageIcon,
  Edit2,
  Tag,
  Send,
  Building2,
  FileCheck2,
  Sparkles,
  ArrowRight,
  ListPlus,
  Check,
} from 'lucide-react';
import {
  UserSession,
  PenerimaanMutasiStoreItem,
  SatuanMutasiStore,
  LocationStamp,
} from '../../types';
import {
  fetchMutasiStoreList,
  saveMutasiStore,
  saveMutasiStoreBulk,
  deleteMutasiStore,
  fetchOutlets,
  saveOutlet,
  deleteOutlet,
  fetchKategoriMutasiList,
  addKategoriMutasi,
  deleteKategoriMutasi,
  updateKategoriMutasi,
  DEFAULT_KATEGORI_MUTASI_STORE,
} from '../../services/penerimaanBarang';
import { savePengirimanStoreBatch } from '../../services/pengirimanStore';
import { CameraWatermarkModal } from './CameraWatermarkModal';

export interface DraftMutasiItem {
  id: string;
  noSuratJalan: string;
  kategoriProduk: string;
  customKategoriText?: string;
  upTujuan: string;
  deskripsi: string;
  qty: number;
  satuanQty: SatuanMutasiStore;
  fotoUrls: string[];
  lokasiStamp?: LocationStamp;
  keterangan?: string;
}

interface MutasiStoreTabProps {
  session: UserSession | null;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const MutasiStoreTab: React.FC<MutasiStoreTabProps> = ({ session, onShowToast }) => {
  const [subTab, setSubTab] = useState<'form' | 'riwayat'>('form');

  // Master Store Data
  const [stores, setStores] = useState<{ id?: string; nama: string; fulfillment?: string }[]>([]);
  const [loadingStores, setLoadingStores] = useState<boolean>(false);
  const [isStoreModalOpen, setIsStoreModalOpen] = useState<boolean>(false);
  const [newStoreName, setNewStoreName] = useState<string>('');
  const [savingStore, setSavingStore] = useState<boolean>(false);

  // Master Kategori Mutasi Data
  const [kategoriList, setKategoriList] = useState<string[]>(DEFAULT_KATEGORI_MUTASI_STORE);
  const [isKategoriModalOpen, setIsKategoriModalOpen] = useState<boolean>(false);
  const [newKategoriInput, setNewKategoriInput] = useState<string>('');
  const [editingKategoriIndex, setEditingKategoriIndex] = useState<number | null>(null);
  const [editKategoriValue, setEditKategoriValue] = useState<string>('');

  // Sesi Penerimaan Utama (Header Batch)
  const [tanggalDiterima, setTanggalDiterima] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [defaultNoSuratJalan, setDefaultNoSuratJalan] = useState<string>('');

  // Antrean Draft Laporan (Multi-Laporan per 1x Submit)
  const [draftItems, setDraftItems] = useState<DraftMutasiItem[]>([]);
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  // Form Input Item Aktif
  const [itemNoSuratJalan, setItemNoSuratJalan] = useState<string>('');
  const [isCustomItemNoSJ, setIsCustomItemNoSJ] = useState<boolean>(false);
  const [kategoriProduk, setKategoriProduk] = useState<string>('Tarikan MD');
  const [customKategoriText, setCustomKategoriText] = useState<string>('');
  const [upTujuan, setUpTujuan] = useState<string>('Warehouse');
  const [isCustomUpTujuan, setIsCustomUpTujuan] = useState<boolean>(false);
  const [customUpTujuanText, setCustomUpTujuanText] = useState<string>('');

  const [deskripsi, setDeskripsi] = useState<string>('');
  const [qty, setQty] = useState<number | ''>('');
  const [satuanQty, setSatuanQty] = useState<SatuanMutasiStore>('Pcs');
  const [fotoUrls, setFotoUrls] = useState<string[]>([]);
  const [lokasiStamp, setLokasiStamp] = useState<LocationStamp | undefined>(undefined);
  const [picNama, setPicNama] = useState<string>(session?.name || 'Petugas Gudang');
  const [picUsername, setPicUsername] = useState<string>(session?.username || 'operator');
  const [keterangan, setKeterangan] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Camera & Watermark Modal
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);

  // Riwayat State
  const [riwayatList, setRiwayatList] = useState<PenerimaanMutasiStoreItem[]>([]);
  const [isLoadingRiwayat, setIsLoadingRiwayat] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [filterKategori, setFilterKategori] = useState<string>('');
  const [selectedItemDetail, setSelectedItemDetail] = useState<PenerimaanMutasiStoreItem | null>(null);

  // Load Initial Data
  useEffect(() => {
    loadStores();
    loadKategori();
    loadRiwayat();
  }, []);

  // Update PIC when session changes
  useEffect(() => {
    if (session) {
      if (session.name) setPicNama(session.name);
      if (session.username) setPicUsername(session.username);
    }
  }, [session]);

  // Sync No Surat Jalan item with default No Surat Jalan jika user belum ubah manual
  useEffect(() => {
    if (!isCustomItemNoSJ && !editingDraftId) {
      setItemNoSuratJalan(defaultNoSuratJalan);
    }
  }, [defaultNoSuratJalan, isCustomItemNoSJ, editingDraftId]);

  // Automatic UP Tujuan determination based on Kategori Produk
  // PRESET vs MANUAL OTOMATIS:
  // - Preset (Tarikan MD, Retur Reject, Request -> Warehouse)
  // - Preset (Complementary -> GA)
  // - Preset (Dokumen / Laporan -> Finance/Accounting)
  // - Preset (Mutasi Antar Store -> Store Tujuan)
  // - Manual (Lainnya (Manual) atau kategori tak dikenal -> Langsung otomatis input manual aktif!)
  useEffect(() => {
    if (kategoriProduk === 'Lainnya (Manual)') {
      setIsCustomUpTujuan(true);
      if (!customUpTujuanText) {
        setUpTujuan('');
      }
    } else if (kategoriProduk === 'Complementary') {
      setIsCustomUpTujuan(false);
      setUpTujuan('GA (General Affair)');
    } else if (kategoriProduk === 'Dokumen / Laporan') {
      setIsCustomUpTujuan(false);
      setUpTujuan('Finance/Accounting');
    } else if (
      kategoriProduk === 'Tarikan MD' ||
      kategoriProduk === 'Retur Reject' ||
      kategoriProduk === 'Request'
    ) {
      setIsCustomUpTujuan(false);
      setUpTujuan('Warehouse');
    } else if (kategoriProduk === 'Mutasi Antar Store') {
      setIsCustomUpTujuan(false);
      setUpTujuan((prev) => {
        // Pertahankan jika user sudah memilih store tujuan yang valid dan bukan asal store
        if (
          prev &&
          prev !== 'Warehouse' &&
          prev !== 'Store Tujuan' &&
          prev !== 'GA (General Affair)' &&
          prev !== 'Finance/Accounting' &&
          prev !== selectedStore &&
          stores.some((s) => s.nama === prev)
        ) {
          return prev;
        }
        const otherStore = stores.find((s) => s.nama !== selectedStore);
        return otherStore ? otherStore.nama : 'Store Tujuan';
      });
    } else {
      // Jika kategori kustom baru ditambahkan oleh user
      setIsCustomUpTujuan(false);
      setUpTujuan('Warehouse');
    }
  }, [kategoriProduk, stores, selectedStore]);

  const loadStores = async () => {
    setLoadingStores(true);
    try {
      const data = await fetchOutlets();
      setStores(data || []);
      if (data && data.length > 0 && !selectedStore) {
        setSelectedStore(data[0].nama);
      }
    } catch (e) {
      console.warn('Gagal load store:', e);
    } finally {
      setLoadingStores(false);
    }
  };

  const loadKategori = () => {
    const list = fetchKategoriMutasiList();
    // Pastikan 'Lainnya (Manual)' selalu ada di list
    if (!list.includes('Lainnya (Manual)')) {
      list.push('Lainnya (Manual)');
    }
    setKategoriList(list);
    if (list.length > 0 && !kategoriProduk) {
      setKategoriProduk(list[0]);
    }
  };

  const loadRiwayat = async () => {
    setIsLoadingRiwayat(true);
    try {
      const data = await fetchMutasiStoreList();
      setRiwayatList(data || []);
    } catch (e) {
      console.warn('Gagal load riwayat:', e);
    } finally {
      setIsLoadingRiwayat(false);
    }
  };

  // Add new store
  const handleAddStore = async () => {
    if (!newStoreName.trim()) {
      onShowToast('Nama store tidak boleh kosong', 'warning');
      return;
    }
    setSavingStore(true);
    try {
      const res = await saveOutlet({ nama: newStoreName.trim(), fulfillment: newStoreName.trim() });
      if (res.success) {
        onShowToast(res.message, 'success');
        setSelectedStore(newStoreName.trim());
        setNewStoreName('');
        setIsStoreModalOpen(false);
        await loadStores();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Gagal menambah store', 'error');
    } finally {
      setSavingStore(false);
    }
  };

  // Delete store
  const handleDeleteStore = async (id?: string) => {
    if (!id) return;
    if (!window.confirm('Yakin ingin menghapus store ini dari daftar?')) return;
    try {
      const res = await deleteOutlet(id);
      if (res.success) {
        onShowToast('Store berhasil dihapus', 'success');
        await loadStores();
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal menghapus store', 'error');
    }
  };

  // Kategori Management
  const handleAddKategori = () => {
    if (!newKategoriInput.trim()) {
      onShowToast('Nama kategori tidak boleh kosong', 'warning');
      return;
    }
    const updated = addKategoriMutasi(newKategoriInput.trim());
    if (!updated.includes('Lainnya (Manual)')) {
      updated.push('Lainnya (Manual)');
    }
    setKategoriList(updated);
    setKategoriProduk(newKategoriInput.trim());
    setNewKategoriInput('');
    onShowToast(`Kategori "${newKategoriInput.trim()}" berhasil ditambahkan`, 'success');
  };

  const handleDeleteKategori = (cat: string) => {
    if (cat === 'Lainnya (Manual)') {
      onShowToast('Kategori Lainnya (Manual) adalah sistem bawaan', 'warning');
      return;
    }
    if (kategoriList.length <= 1) {
      onShowToast('Minimal harus ada 1 kategori', 'warning');
      return;
    }
    if (!window.confirm(`Yakin ingin menghapus kategori "${cat}"?`)) return;
    const updated = deleteKategoriMutasi(cat);
    if (!updated.includes('Lainnya (Manual)')) {
      updated.push('Lainnya (Manual)');
    }
    setKategoriList(updated);
    if (kategoriProduk === cat) {
      setKategoriProduk(updated[0]);
    }
    onShowToast(`Kategori "${cat}" dihapus`, 'info');
  };

  const handleSaveEditKategori = (oldCat: string) => {
    if (!editKategoriValue.trim()) {
      onShowToast('Nama kategori tidak boleh kosong', 'warning');
      return;
    }
    const updated = updateKategoriMutasi(oldCat, editKategoriValue.trim());
    if (!updated.includes('Lainnya (Manual)')) {
      updated.push('Lainnya (Manual)');
    }
    setKategoriList(updated);
    if (kategoriProduk === oldCat) {
      setKategoriProduk(editKategoriValue.trim());
    }
    setEditingKategoriIndex(null);
    setEditKategoriValue('');
    onShowToast('Kategori berhasil diperbarui', 'success');
  };

  // Photo uploaded from modal
  const handlePhotosUploaded = (urls: string[], loc?: LocationStamp) => {
    setFotoUrls((prev) => [...prev, ...urls]);
    if (loc) {
      setLokasiStamp(loc);
    }
    onShowToast(`${urls.length} foto berhasil disimpan dengan watermark HD!`, 'success');
  };

  const removePhoto = (index: number) => {
    setFotoUrls((prev) => prev.filter((_, i) => i !== index));
  };

  // Reset Form Item Aktif
  const resetActiveItemForm = () => {
    setEditingDraftId(null);
    setIsCustomItemNoSJ(false);
    setItemNoSuratJalan(defaultNoSuratJalan);
    setKategoriProduk('Tarikan MD');
    setCustomKategoriText('');
    setUpTujuan('Warehouse');
    setIsCustomUpTujuan(false);
    setCustomUpTujuanText('');
    setDeskripsi('');
    setQty('');
    setSatuanQty('Pcs');
    setFotoUrls([]);
    setLokasiStamp(undefined);
    setKeterangan('');
  };

  // Reset Seluruh Sesi Form (Header & Draft)
  const handleResetFullSession = () => {
    if (draftItems.length > 0) {
      if (!window.confirm('Reset seluruh sesi formulir? Daftar laporan yang belum disimpan akan terhapus.')) {
        return;
      }
    }
    setTanggalDiterima(new Date().toISOString().split('T')[0]);
    if (stores.length > 0) setSelectedStore(stores[0].nama);
    setDefaultNoSuratJalan('');
    setDraftItems([]);
    resetActiveItemForm();
  };

  // Hitung Final No Surat Jalan & UP Tujuan untuk Item Aktif
  const activeComputedNoSJ = itemNoSuratJalan.trim() ? itemNoSuratJalan.trim() : 'Tidak ada surat jalan';
  const activeComputedKategori =
    kategoriProduk === 'Lainnya (Manual)' && customKategoriText.trim()
      ? customKategoriText.trim()
      : kategoriProduk;
  const activeComputedUpTujuan = isCustomUpTujuan
    ? customUpTujuanText.trim() || 'Warehouse'
    : upTujuan;

  // Handler: Tambahkan Item Aktif ke Antrean Draft Laporan
  const handleAddOrUpdateDraftItem = () => {
    if (!selectedStore) {
      onShowToast('Pilih Asal Store terlebih dahulu', 'warning');
      return;
    }
    if (!kategoriProduk) {
      onShowToast('Kategori Produk wajib dipilih', 'warning');
      return;
    }
    if (!qty || Number(qty) <= 0) {
      onShowToast('Jumlah Qty harus lebih dari 0', 'warning');
      return;
    }

    if (isCustomUpTujuan && !customUpTujuanText.trim()) {
      onShowToast('Silakan masukkan UP Tujuan manual', 'warning');
      return;
    }

    const newItem: DraftMutasiItem = {
      id: editingDraftId || `draft_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
      noSuratJalan: activeComputedNoSJ,
      kategoriProduk: activeComputedKategori,
      customKategoriText: customKategoriText.trim(),
      upTujuan: activeComputedUpTujuan,
      deskripsi: deskripsi.trim(),
      qty: Number(qty),
      satuanQty: satuanQty,
      fotoUrls: [...fotoUrls],
      lokasiStamp: lokasiStamp,
      keterangan: keterangan.trim(),
    };

    if (editingDraftId) {
      setDraftItems((prev) => prev.map((item) => (item.id === editingDraftId ? newItem : item)));
      onShowToast('Laporan berhasil diperbarui dalam daftar antrean!', 'success');
    } else {
      setDraftItems((prev) => [...prev, newItem]);
      onShowToast('Item laporan berhasil ditambahkan ke daftar!', 'success');
    }

    resetActiveItemForm();
  };

  // Edit item dari Draft
  const handleEditDraftItem = (item: DraftMutasiItem) => {
    setEditingDraftId(item.id);
    setItemNoSuratJalan(item.noSuratJalan === 'Tidak ada surat jalan' ? '' : item.noSuratJalan);
    setIsCustomItemNoSJ(true);

    const isExistingCat = kategoriList.includes(item.kategoriProduk);
    if (isExistingCat) {
      setKategoriProduk(item.kategoriProduk);
      setCustomKategoriText('');
    } else {
      setKategoriProduk('Lainnya (Manual)');
      setCustomKategoriText(item.kategoriProduk);
    }

    if (
      item.kategoriProduk === 'Complementary' ||
      item.kategoriProduk === 'Dokumen / Laporan' ||
      ['Tarikan MD', 'Retur Reject', 'Request', 'Mutasi Antar Store'].includes(item.kategoriProduk)
    ) {
      setUpTujuan(item.upTujuan);
      setIsCustomUpTujuan(false);
      setCustomUpTujuanText('');
    } else {
      setIsCustomUpTujuan(true);
      setCustomUpTujuanText(item.upTujuan);
    }

    setDeskripsi(item.deskripsi || '');
    setQty(item.qty);
    setSatuanQty(item.satuanQty);
    setFotoUrls([...item.fotoUrls]);
    setLokasiStamp(item.lokasiStamp);
    setKeterangan(item.keterangan || '');

    // Smooth scroll ke atas form
    window.scrollTo({ top: 100, behavior: 'smooth' });
  };

  // Hapus item dari Draft
  const handleRemoveDraftItem = (id: string) => {
    setDraftItems((prev) => prev.filter((item) => item.id !== id));
    if (editingDraftId === id) {
      resetActiveItemForm();
    }
    onShowToast('Item dihapus dari daftar', 'info');
  };

  // Submit Semua Laporan (Batch Submit)
  const handleSubmitAll = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedStore) {
      onShowToast('Pilih Asal Store terlebih dahulu', 'warning');
      return;
    }

    // Persiapkan kumpulan item yang akan disimpan
    let itemsToSubmit = [...draftItems];

    // Jika antrean kosong, atau ada form aktif yang sedang diisi dengan valid (qty > 0), sertakan item form aktif
    if (qty && Number(qty) > 0) {
      const activeItem: DraftMutasiItem = {
        id: editingDraftId || `draft_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
        noSuratJalan: activeComputedNoSJ,
        kategoriProduk: activeComputedKategori,
        customKategoriText: customKategoriText.trim(),
        upTujuan: activeComputedUpTujuan,
        deskripsi: deskripsi.trim(),
        qty: Number(qty),
        satuanQty: satuanQty,
        fotoUrls: [...fotoUrls],
        lokasiStamp: lokasiStamp,
        keterangan: keterangan.trim(),
      };

      if (editingDraftId) {
        itemsToSubmit = itemsToSubmit.map((item) => (item.id === editingDraftId ? activeItem : item));
      } else {
        itemsToSubmit.push(activeItem);
      }
    }

    if (itemsToSubmit.length === 0) {
      onShowToast('Masukkan minimal 1 item laporan (isi Qty dan klik Tambahkan ke Daftar)', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const matchedStore = stores.find((s) => s.nama === selectedStore);
      const payloads: PenerimaanMutasiStoreItem[] = itemsToSubmit.map((item) => ({
        tanggal_diterima: tanggalDiterima,
        asal_store_id: matchedStore?.id || '',
        asal_store_nama: selectedStore,
        no_surat_jalan: item.noSuratJalan || 'Tidak ada surat jalan',
        kategori_produk: item.kategoriProduk,
        up_tujuan: item.upTujuan,
        deskripsi: item.deskripsi,
        qty: item.qty,
        satuan_qty: item.satuanQty,
        foto_urls: item.fotoUrls,
        lokasi_stamp: item.lokasiStamp,
        pic_nama: picNama,
        pic_username: picUsername,
        timestamp_input: new Date().toISOString(),
        keterangan: item.keterangan || '',
      }));

      const res = await saveMutasiStoreBulk(payloads);
      if (res.success) {
        // Khusus Kategori Produk 'Mutasi Antar Store': Otomatis masukkan ke Antrean Dispatched Pengiriman Store
        const mutasiAntarStoreItems = itemsToSubmit.filter(
          (item) => item.kategoriProduk === 'Mutasi Antar Store'
        );

        if (mutasiAntarStoreItems.length > 0) {
          try {
            const allPhotos = mutasiAntarStoreItems.flatMap((item) => item.fotoUrls || []);
            const dispatchItems = mutasiAntarStoreItems.map((item) => ({
              store_tujuan: item.upTujuan?.trim() || 'Store Tujuan',
              no_surat_jalan: item.noSuratJalan?.trim() || 'No Surat Jalan Mutasi',
              deskripsi: item.deskripsi?.trim() || 'Barang Mutasi Antar Store',
              qty: item.qty,
              satuan: (item.satuanQty === 'Koli' ? 'Koli' : 'Pcs') as 'Pcs' | 'Koli',
              keterangan: `[Penerimaan Mutasi Antar Store dari ${selectedStore}] ${item.keterangan || ''}`.trim(),
              foto_barang: item.fotoUrls && item.fotoUrls.length > 0 ? item.fotoUrls[0] : '',
              foto_urls: item.fotoUrls || [],
            }));

            const dispatchRes = await savePengirimanStoreBatch({
              items: dispatchItems,
              foto_urls: allPhotos,
              pic_nama: picNama,
              pic_username: picUsername,
            });

            if (dispatchRes.success) {
              onShowToast(
                `Sukses! ${res.count} laporan penerimaan disimpan & otomatis masuk ke antrean Dispatched Pengiriman Store.`,
                'success'
              );
            } else {
              onShowToast(`Penerimaan tersimpan (${res.count} item), namun antrean pengiriman tertunda: ${dispatchRes.message}`, 'warning');
            }
          } catch (dispatchErr: any) {
            console.warn('Gagal otomatis memasukkan mutasi ke antrean pengiriman:', dispatchErr);
            onShowToast(`Penerimaan tersimpan. Antrean pengiriman gagal otomatis disinkron.`, 'warning');
          }
        } else {
          onShowToast(`Sukses! ${res.count} laporan mutasi store berhasil disimpan.`, 'success');
        }

        setDraftItems([]);
        resetActiveItemForm();
        setDefaultNoSuratJalan('');
        await loadRiwayat();
        setSubTab('riwayat');
      } else {
        onShowToast(res.message || 'Gagal menyimpan laporan', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Terjadi kesalahan sistem saat menyimpan laporan', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Riwayat Modal State
  const [deletingRiwayatId, setDeletingRiwayatId] = useState<string | null>(null);
  const [isDeletingRiwayat, setIsDeletingRiwayat] = useState<boolean>(false);

  const handleDeleteRiwayat = (id?: string) => {
    if (!id) return;
    setDeletingRiwayatId(id);
  };

  const handleConfirmDeleteRiwayat = async () => {
    if (!deletingRiwayatId) return;
    setIsDeletingRiwayat(true);
    try {
      const res = await deleteMutasiStore(deletingRiwayatId);
      if (res.success) {
        onShowToast(res.message, 'success');
        setDeletingRiwayatId(null);
        await loadRiwayat();
        if (selectedItemDetail?.id === deletingRiwayatId) setSelectedItemDetail(null);
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Gagal menghapus data', 'error');
    } finally {
      setIsDeletingRiwayat(false);
    }
  };

  // Filtered Riwayat
  const filteredRiwayat = useMemo(() => {
    return riwayatList.filter((item) => {
      const matchQuery =
        !searchQuery ||
        item.asal_store_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.no_surat_jalan && item.no_surat_jalan.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.kategori_produk && item.kategori_produk.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.up_tujuan && item.up_tujuan.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.deskripsi.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.pic_nama.toLowerCase().includes(searchQuery.toLowerCase());

      const matchDate = !filterDate || item.tanggal_diterima === filterDate;
      const matchKategori = !filterKategori || item.kategori_produk === filterKategori;

      return matchQuery && matchDate && matchKategori;
    });
  }, [riwayatList, searchQuery, filterDate, filterKategori]);

  // Hitung total Qty pada antrean draft
  const totalDraftQty = useMemo(() => {
    return draftItems.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
  }, [draftItems]);

  return (
    <div className="space-y-4">
      {/* Sub Tab Switcher: Form Laporan vs Riwayat Laporan */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="bg-slate-200/80 dark:bg-slate-800/80 p-1 rounded-xl flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSubTab('form')}
            className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              subTab === 'form'
                ? 'bg-white dark:bg-[#131d31] text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Form Mutasi Store</span>
            {draftItems.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-emerald-500 text-white rounded-full text-[10px]">
                {draftItems.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('riwayat')}
            className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              subTab === 'riwayat'
                ? 'bg-white dark:bg-[#131d31] text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Riwayat Laporan ({riwayatList.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          {subTab === 'form' && (
            <>
              <button
                type="button"
                onClick={() => setIsKategoriModalOpen(true)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Tag className="w-3.5 h-3.5 text-emerald-500" />
                <span>Kelola Kategori</span>
              </button>
              <button
                type="button"
                onClick={() => setIsStoreModalOpen(true)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Settings2 className="w-3.5 h-3.5 text-slate-500" />
                <span>Daftar Store</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* VIEW: FORM LAPORAN MULTI-ITEM */}
      {subTab === 'form' && (
        <form onSubmit={handleSubmitAll} className="space-y-4">
          {/* SECTION 1: HEADER INFORMASI KIRIMAN STORE */}
          <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
              <div>
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Store className="w-4 h-4 text-emerald-500" />
                  <span>Informasi Sesi Kiriman Dari Store</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Tentukan tanggal penerimaan, asal store, dan nomor surat jalan utama untuk pengelompokan laporan.
                </p>
              </div>

              {draftItems.length > 0 && (
                <div className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>{draftItems.length} Laporan Siap Disimpan</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* 1. Tanggal Diterima */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Tanggal Diterima</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={tanggalDiterima}
                  onChange={(e) => setTanggalDiterima(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-semibold text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* 2. Asal Barang (Store) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Store className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Asal Barang (Store)</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsStoreModalOpen(true)}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> Tambah
                  </button>
                </div>

                <select
                  required
                  value={selectedStore}
                  onChange={(e) => setSelectedStore(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-semibold text-slate-800 dark:text-slate-100"
                >
                  <option value="" disabled>
                    -- Pilih Asal Store --
                  </option>
                  {stores.map((s, idx) => (
                    <option key={s.id || idx} value={s.nama}>
                      {s.nama}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. No Surat Jalan Utama / Default */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>No. SJ Utama / Default</span>
                  <span className="text-[10px] text-slate-400 font-normal">(Opsional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Cth: SJ/2026/09/001 atau kosongkan"
                  value={defaultNoSuratJalan}
                  onChange={(e) => setDefaultNoSuratJalan(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100"
                />
                <p className="text-[10px] text-slate-400">
                  Otomatis terisi ke tiap item laporan di bawah (tetap dapat diubah).
                </p>
              </div>
            </div>
          </div>

          {/* SECTION 2: INPUT ITEM LAPORAN / BARANG (DAPAT DITAMBAHKAN BERULANG) */}
          <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-emerald-500/30 dark:border-emerald-500/20 shadow-xs p-4 sm:p-5 space-y-4 relative overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-xs">
                  {editingDraftId ? '✏️' : draftItems.length + 1}
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <span>
                      {editingDraftId ? 'Edit Item Laporan' : 'Input Rincian Item Laporan / Barang'}
                    </span>
                    {editingDraftId && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-bold border border-amber-500/20">
                        Mode Edit
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pilih kategori produk, UP tujuan otomatis/manual, isi qty, dan foto kamera watermark.
                  </p>
                </div>
              </div>

              {editingDraftId && (
                <button
                  type="button"
                  onClick={resetActiveItemForm}
                  className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Batal Edit</span>
                </button>
              )}
            </div>

            {/* BARIS A: No Surat Jalan Khusus Item Ini & Kategori Produk */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* No Surat Jalan Item */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span>No. Surat Jalan Item Ini</span>
                  <span className="text-[10px] text-slate-400 font-normal">(Opsional)</span>
                </label>
                <input
                  type="text"
                  placeholder="Kosongkan jika 'Tidak ada surat jalan'"
                  value={itemNoSuratJalan}
                  onChange={(e) => {
                    setItemNoSuratJalan(e.target.value);
                    setIsCustomItemNoSJ(true);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100"
                />
                <p className="text-[10px] text-slate-400">
                  Tercatat:{' '}
                  <span className="font-semibold text-slate-600 dark:text-slate-300">
                    {itemNoSuratJalan.trim() ? itemNoSuratJalan.trim() : 'Tidak ada surat jalan'}
                  </span>
                </p>
              </div>

              {/* Kategori Produk (Termasuk 'Lainnya (Manual)' yang otomatis mengaktifkan mode manual) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Kategori Produk</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsKategoriModalOpen(true)}
                    className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-0.5"
                  >
                    <Plus className="w-3 h-3" /> Tambah / Edit Kategori
                  </button>
                </div>

                <select
                  required
                  value={kategoriProduk}
                  onChange={(e) => {
                    setKategoriProduk(e.target.value);
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800 dark:text-slate-100"
                >
                  {kategoriList.map((cat, idx) => (
                    <option key={idx} value={cat}>
                      {cat === 'Lainnya (Manual)' ? '✍️ Lainnya (Manual)' : cat}
                    </option>
                  ))}
                </select>

                {kategoriProduk === 'Lainnya (Manual)' && (
                  <input
                    type="text"
                    placeholder="Ketik nama kategori khusus (cth: Sampel Promosi, Display Event, dll)"
                    value={customKategoriText}
                    onChange={(e) => setCustomKategoriText(e.target.value)}
                    className="w-full mt-1 px-3 py-1.5 bg-white dark:bg-slate-800 border border-emerald-300 dark:border-emerald-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                )}
              </div>
            </div>

            {/* BARIS B: UP TUJUAN (OTOMATIS PRESET vs OTOMATIS MANUAL DARI KATEGORI) */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-850/70 rounded-2xl border border-slate-200/80 dark:border-slate-800 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <Send className="w-3.5 h-3.5 text-emerald-500" />
                  <span>UP Tujuan (Unit / Divisi Penerima)</span>
                  <span className="text-rose-500">*</span>
                </label>

                {/* Status Mode Badge */}
                <div className="flex items-center gap-2">
                  {kategoriProduk === 'Lainnya (Manual)' || isCustomUpTujuan ? (
                    <span className="text-[10px] bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-bold border border-amber-200/60 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-amber-500" /> Mode Manual Aktif
                    </span>
                  ) : (
                    <span className="text-[10px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold border border-emerald-200/50 flex items-center gap-1">
                      <Check className="w-3 h-3 text-emerald-500" /> Preset Otomatis ({kategoriProduk})
                    </span>
                  )}

                  {/* Tombol switch fleksibel jika pada preset ingin diedit manual */}
                  {kategoriProduk !== 'Lainnya (Manual)' && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsCustomUpTujuan(!isCustomUpTujuan);
                        if (!isCustomUpTujuan && !customUpTujuanText) {
                          setCustomUpTujuanText(upTujuan);
                        }
                      }}
                      className="text-[11px] text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
                    >
                      {isCustomUpTujuan ? 'Gunakan Preset' : 'Edit Manual'}
                    </button>
                  )}
                </div>
              </div>

              {/* RENDER UP TUJUAN:
                  1. Jika Kategori Lainnya (Manual) atau user aktifkan custom -> Langsung Input Text Manual
                  2. Jika Mutasi Antar Store -> Dropdown Pilih Store Tujuan
                  3. Jika Preset Lain -> Tampilan Card Preset Otomatis
              */}
              {kategoriProduk === 'Lainnya (Manual)' || isCustomUpTujuan ? (
                <div className="space-y-1">
                  <input
                    type="text"
                    required
                    placeholder="Ketik manual unit penerima (cth: QC Lab, Merchandise Dept, GA, Direksi, dll)..."
                    value={customUpTujuanText}
                    onChange={(e) => setCustomUpTujuanText(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-700/80 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <p className="text-[10px] text-slate-400">
                    UP Tujuan yang akan dicatat:{' '}
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {customUpTujuanText.trim() || 'Harap ketik UP Tujuan'}
                    </span>
                  </p>
                </div>
              ) : kategoriProduk === 'Mutasi Antar Store' ? (
                <div className="space-y-1">
                  <p className="text-[11px] text-slate-500">Pilih Store Tujuan mutasi:</p>
                  <select
                    value={upTujuan}
                    onChange={(e) => setUpTujuan(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {stores.map((s, idx) => (
                      <option key={s.id || idx} value={s.nama}>
                        Store: {s.nama}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="flex items-center justify-between p-2.5 bg-white dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-500" />
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Tujuan Otomatis:</span>
                      <span className="font-black text-emerald-600 dark:text-emerald-400 text-xs sm:text-sm">
                        {upTujuan}
                      </span>
                    </div>
                  </div>
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md font-semibold">
                    Divisi Terhubung
                  </span>
                </div>
              )}
            </div>

            {/* BARIS C: Deskripsi Rincian Barang */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-emerald-500" />
                <span>Deskripsi / Rincian Barang</span>
              </label>
              <textarea
                rows={2}
                placeholder="Contoh: Baju Dress Seri A, Reject Display, Retur Season, Dokumen Laporan Bulanan..."
                value={deskripsi}
                onChange={(e) => setDeskripsi(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100"
              />
            </div>

            {/* BARIS D: Qty & Satuan (Pcs | Koli | Pax) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Jumlah Qty</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  placeholder="Contoh: 15"
                  value={qty}
                  onChange={(e) => setQty(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800 dark:text-slate-100"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Satuan Qty
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(['Pcs', 'Koli', 'Pax'] as SatuanMutasiStore[]).map((satuan) => (
                    <button
                      key={satuan}
                      type="button"
                      onClick={() => setSatuanQty(satuan)}
                      className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                        satuanQty === satuan
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      {satuan}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* BARIS E: Foto Kamera Watermark HD */}
            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Camera className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Dokumentasi Foto Watermark HD (Item Ini)</span>
                  </label>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Otomatis dibubuhi watermark besar No SJ, Kategori, UP Tujuan & GPS.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setIsCameraModalOpen(true)}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition-all"
                >
                  <Camera className="w-4 h-4" />
                  <span>Buka Kamera Fullscreen</span>
                </button>
              </div>

              {fotoUrls.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                  {fotoUrls.map((url, idx) => (
                    <div
                      key={idx}
                      className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-video bg-slate-900 shadow-xs"
                    >
                      <img
                        src={url}
                        alt={`Dokumentasi ${idx + 1}`}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(idx)}
                        className="absolute top-1 right-1 p-1 bg-rose-600/90 text-white rounded-lg opacity-90 hover:opacity-100 transition-opacity"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-slate-900/90 text-[9px] text-white rounded font-mono font-bold">
                        Foto #{idx + 1}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  onClick={() => setIsCameraModalOpen(true)}
                  className="border-2 border-dashed border-slate-200 dark:border-slate-700/80 rounded-2xl p-3 sm:p-4 text-center cursor-pointer hover:border-emerald-500 transition-colors bg-slate-50/50 dark:bg-slate-800/30"
                >
                  <Camera className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    Belum ada foto untuk item ini (Opsional)
                  </p>
                  <p className="text-[10px] text-slate-400">
                    Klik untuk membuka kamera auto-watermark
                  </p>
                </div>
              )}
            </div>

            {/* TOMBOL AKSI: TAMBAH ITEM KE ANTREAN DRAFT */}
            <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800/80">
              <div className="text-[11px] text-slate-500">
                {editingDraftId
                  ? 'Sedang mengedit item yang ada di daftar'
                  : 'Klik tombol di kanan untuk menambahkan item ke daftar kiriman ini'}
              </div>

              <div className="flex items-center gap-2">
                {editingDraftId && (
                  <button
                    type="button"
                    onClick={resetActiveItemForm}
                    className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors"
                  >
                    Batal
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleAddOrUpdateDraftItem}
                  className="px-4 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-700 dark:text-emerald-300 text-xs sm:text-sm font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>
                    {editingDraftId ? 'Perbarui Item di Daftar' : '+ Tambah ke Daftar Laporan'}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* SECTION 3: DAFTAR DRAFT LAPORAN SIAP DISIMPAN (BATCH QUEUE) */}
          {draftItems.length > 0 && (
            <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2 border-b border-slate-100 dark:border-slate-800/80 pb-3">
                <div className="flex items-center gap-2">
                  <ListPlus className="w-5 h-5 text-emerald-500" />
                  <div>
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                      Daftar Item Laporan yang Siap Disimpan ({draftItems.length} Laporan)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Total Qty: <span className="font-bold text-emerald-600">{totalDraftQty} Pcs/Koli/Pax</span> • Asal Store: <span className="font-bold text-slate-700 dark:text-slate-200">{selectedStore}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Kosongkan semua daftar laporan di atas?')) {
                      setDraftItems([]);
                    }
                  }}
                  className="text-xs text-rose-500 hover:text-rose-600 font-semibold flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Kosongkan Daftar</span>
                </button>
              </div>

              {/* Items Card List */}
              <div className="space-y-2">
                {draftItems.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex items-center justify-between gap-3 text-xs"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center font-bold text-xs shrink-0">
                        {index + 1}
                      </div>

                      <div className="space-y-1 min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                            {item.qty} {item.satuanQty}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-bold text-[11px] border border-blue-200/50">
                            🏷️ {item.kategoriProduk}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 font-bold text-[11px] border border-purple-200/50">
                            🎯 UP: {item.upTujuan}
                          </span>
                          <span className="text-[11px] text-amber-700 dark:text-amber-300 font-semibold bg-amber-50 dark:bg-amber-900/20 px-2 py-0.5 rounded-md border border-amber-200/50">
                            📄 SJ: {item.noSuratJalan}
                          </span>
                        </div>

                        {item.deskripsi && (
                          <p className="text-slate-600 dark:text-slate-300 line-clamp-1 text-[11px]">
                            {item.deskripsi}
                          </p>
                        )}

                        {item.fotoUrls && item.fotoUrls.length > 0 && (
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
                            <Camera className="w-3 h-3" /> {item.fotoUrls.length} Foto Watermark
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditDraftItem(item)}
                        className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                        title="Edit Item Laporan"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveDraftItem(item.id)}
                        className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-500 transition-colors"
                        title="Hapus dari antrean"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 4: PIC & TIMESTAMP INFO BAR */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <User className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">PIC Penerima</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {picNama} (@{picUsername})
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Clock className="w-4 h-4 text-emerald-500 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">Waktu Input</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {new Date().toLocaleString('id-ID')} WIB (Auto-recorded)
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 5: FINAL ACTION BUTTONS (SUBMIT 1x BANYAK LAPORAN) */}
          <div className="flex items-center justify-between gap-2 pt-2">
            <button
              type="button"
              onClick={handleResetFullSession}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Sesi</span>
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-lg shadow-emerald-600/25 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan ke Database...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>
                    {draftItems.length > 0
                      ? `Simpan Semua (${draftItems.length + (qty && Number(qty) > 0 ? 1 : 0)} Laporan)`
                      : 'Simpan Laporan Mutasi'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* VIEW: RIWAYAT LAPORAN */}
      {subTab === 'riwayat' && (
        <div className="space-y-3">
          {/* Search & Filter Bar */}
          <div className="bg-white dark:bg-[#131d31] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari store, no SJ, kategori, UP tujuan, PIC..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {/* Filter Kategori */}
              <select
                value={filterKategori}
                onChange={(e) => setFilterKategori(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none"
              >
                <option value="">Semua Kategori</option>
                {kategoriList.map((c, i) => (
                  <option key={i} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {/* Filter Date */}
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none"
              />
              {(filterDate || filterKategori || searchQuery) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterDate('');
                    setFilterKategori('');
                    setSearchQuery('');
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100"
                  title="Reset Filter"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* List Kartu Riwayat */}
          {isLoadingRiwayat ? (
            <div className="text-center py-12 bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800">
              <Loader2 className="w-8 h-8 animate-spin text-emerald-500 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Memuat riwayat mutasi store...</p>
            </div>
          ) : filteredRiwayat.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <Store className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Belum ada data riwayat mutasi
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery || filterDate || filterKategori
                  ? 'Tidak ada data yang sesuai dengan filter pencarian.'
                  : 'Gunakan tab "Form Mutasi Store" untuk menginput penerimaan mutasi baru.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredRiwayat.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition-all p-4 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    {/* Header Card: Store & Tanggal */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                          <Store className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                            {item.asal_store_nama}
                          </h4>
                          <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                            <Calendar className="w-3 h-3" />
                            {item.tanggal_diterima}
                          </span>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 text-xs font-black border border-emerald-200/60 dark:border-emerald-800/50 shrink-0">
                        {item.qty} {item.satuan_qty}
                      </span>
                    </div>

                    {/* Badge No SJ, Kategori & UP Tujuan */}
                    <div className="flex flex-wrap gap-1.5 text-[10px]">
                      <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200/60 dark:border-amber-800/40">
                        📄 SJ: {item.no_surat_jalan || 'Tidak ada surat jalan'}
                      </span>
                      {item.kategori_produk && (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-semibold border border-blue-200/60 dark:border-blue-800/40">
                          🏷️ {item.kategori_produk}
                        </span>
                      )}
                      {item.up_tujuan && (
                        <span className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 font-semibold border border-purple-200/60 dark:border-purple-800/40">
                          🎯 UP: {item.up_tujuan}
                        </span>
                      )}
                    </div>

                    {/* Deskripsi */}
                    {item.deskripsi && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/40 p-2 rounded-xl line-clamp-2">
                        {item.deskripsi}
                      </p>
                    )}

                    {/* Photos Preview Thumbnails */}
                    {item.foto_urls && item.foto_urls.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                        {item.foto_urls.slice(0, 3).map((url, i) => (
                          <div
                            key={i}
                            onClick={() => setSelectedItemDetail(item)}
                            className="w-14 h-14 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer hover:opacity-80 transition-opacity bg-slate-900"
                          >
                            <img
                              src={url}
                              alt="Foto"
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                          </div>
                        ))}
                        {item.foto_urls.length > 3 && (
                          <div
                            onClick={() => setSelectedItemDetail(item)}
                            className="w-14 h-14 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 shrink-0 cursor-pointer"
                          >
                            +{item.foto_urls.length - 3}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer Card: PIC & Actions */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1 text-[11px] text-slate-500">
                      <User className="w-3 h-3 text-slate-400" />
                      <span className="truncate max-w-[120px]">{item.pic_nama}</span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedItemDetail(item)}
                        className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-blue-600 dark:text-blue-400 rounded-lg transition-colors"
                        title="Lihat Detail & Foto Lengkap"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRiwayat(item.id)}
                        className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-500 rounded-lg transition-colors"
                        title="Hapus Laporan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: DETAIL LAPORAN & FOTO FULL */}
      {selectedItemDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#131d31] w-full max-w-xl rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/40">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Store className="w-4 h-4 text-emerald-500" />
                  <span>Detail Mutasi: {selectedItemDetail.asal_store_nama}</span>
                </h3>
                <span className="text-xs text-slate-500">
                  Tanggal Terima: {selectedItemDetail.tanggal_diterima}
                </span>
              </div>
              <button
                onClick={() => setSelectedItemDetail(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-4">
              {/* Badges Info */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">No. Surat Jalan</span>
                  <span className="font-bold text-amber-600 dark:text-amber-400">
                    {selectedItemDetail.no_surat_jalan || 'Tidak ada surat jalan'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Kategori Produk</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400">
                    {selectedItemDetail.kategori_produk || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">UP Tujuan</span>
                  <span className="font-bold text-purple-600 dark:text-purple-400">
                    {selectedItemDetail.up_tujuan || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Total Qty</span>
                  <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                    {selectedItemDetail.qty} {selectedItemDetail.satuan_qty}
                  </span>
                </div>
                <div className="col-span-2">
                  <span className="text-[10px] text-slate-400 block font-bold">PIC Penerima</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedItemDetail.pic_nama} (@{selectedItemDetail.pic_username})
                  </span>
                </div>
              </div>

              {selectedItemDetail.deskripsi && (
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Rincian / Deskripsi Barang:
                  </span>
                  <p className="text-xs sm:text-sm bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl border border-slate-100 dark:border-slate-800 text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                    {selectedItemDetail.deskripsi}
                  </p>
                </div>
              )}

              {/* Foto Gallery Watermark */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Foto Dokumentasi Watermark ({selectedItemDetail.foto_urls?.length || 0})</span>
                </span>

                {selectedItemDetail.foto_urls && selectedItemDetail.foto_urls.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {selectedItemDetail.foto_urls.map((url, i) => (
                      <div
                        key={i}
                        className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 group relative aspect-video"
                      >
                        <img
                          src={url}
                          alt={`Dokumentasi ${i + 1}`}
                          className="w-full h-full object-contain"
                          referrerPolicy="no-referrer"
                        />
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="absolute bottom-2 right-2 px-2.5 py-1 bg-slate-900/80 hover:bg-emerald-600 text-white rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors"
                        >
                          <ExternalLink className="w-3 h-3" /> Buka Foto HD
                        </a>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Tidak ada foto dokumentasi terlampir.</p>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                onClick={() => setSelectedItemDetail(null)}
                className="px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: KELOLA KATEGORI PRODUK */}
      {isKategoriModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#131d31] w-full max-w-md rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/40">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-emerald-500" />
                <span>Kelola Kategori Produk</span>
              </h3>
              <button
                onClick={() => setIsKategoriModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Form Tambah Kategori */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nama kategori baru..."
                  value={newKategoriInput}
                  onChange={(e) => setNewKategoriInput(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleAddKategori}
                  disabled={!newKategoriInput.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah</span>
                </button>
              </div>

              {/* List Kategori */}
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
                {kategoriList.map((cat, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    {editingKategoriIndex === idx ? (
                      <div className="flex items-center gap-2 flex-1 mr-2">
                        <input
                          type="text"
                          value={editKategoriValue}
                          onChange={(e) => setEditKategoriValue(e.target.value)}
                          className="flex-1 px-2 py-1 bg-white dark:bg-slate-900 border border-emerald-500 rounded-lg text-xs"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditKategori(cat)}
                          className="p-1 text-emerald-600 font-bold"
                        >
                          Simpan
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingKategoriIndex(null)}
                          className="p-1 text-slate-400"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="flex items-center gap-1.5">
                          {cat === 'Lainnya (Manual)' ? '✍️ ' : '🏷️ '}
                          {cat}
                        </span>
                        {cat !== 'Lainnya (Manual)' && (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingKategoriIndex(idx);
                                setEditKategoriValue(cat);
                              }}
                              className="p-1 text-slate-400 hover:text-blue-500 rounded"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteKategori(cat)}
                              className="p-1 text-slate-400 hover:text-rose-500 rounded"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: KELOLA DAFTAR STORE */}
      {isStoreModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#131d31] w-full max-w-md rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-900/40">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Store className="w-4 h-4 text-emerald-500" />
                <span>Daftar Store / Outlet</span>
              </h3>
              <button
                onClick={() => setIsStoreModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Form Tambah Store */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nama store baru (contoh: Mall Kelapa Gading)"
                  value={newStoreName}
                  onChange={(e) => setNewStoreName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleAddStore}
                  disabled={savingStore || !newStoreName.trim()}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah</span>
                </button>
              </div>

              {/* List Stores */}
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
                {stores.map((s, idx) => (
                  <div
                    key={s.id || idx}
                    className="p-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>{s.nama}</span>
                    {s.id && (
                      <button
                        type="button"
                        onClick={() => handleDeleteStore(s.id)}
                        className="p-1 text-slate-400 hover:text-rose-500 rounded"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CAMERA & WATERMARK MODAL */}
      <CameraWatermarkModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onPhotosUploaded={handlePhotosUploaded}
        title="Mutasi Store"
        entityName={selectedStore}
        noSuratJalan={activeComputedNoSJ}
        kategori={activeComputedKategori}
        upTujuan={activeComputedUpTujuan}
        picName={picNama}
        picUsername={picUsername}
        qtyInfo={qty ? `${qty} ${satuanQty}` : undefined}
      />

      {/* MODAL KONFIRMASI HAPUS RIWAYAT */}
      {deletingRiwayatId && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="w-10 h-10 rounded-xl bg-rose-100 dark:bg-rose-950/60 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Hapus Laporan Penerimaan</h3>
                <p className="text-xs text-slate-500">Aksi ini tidak dapat dibatalkan</p>
              </div>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300">
              Apakah Anda yakin ingin menghapus data laporan penerimaan mutasi ini secara permanen dari Supabase & memori lokal?
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setDeletingRiwayatId(null)}
                disabled={isDeletingRiwayat}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteRiwayat}
                disabled={isDeletingRiwayat}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                {isDeletingRiwayat ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                <span>Hapus Permanen</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
