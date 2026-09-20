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
import { CameraWatermarkModal } from './CameraWatermarkModal';

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

  // Form State
  const [tanggalDiterima, setTanggalDiterima] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedStore, setSelectedStore] = useState<string>('');
  const [noSuratJalan, setNoSuratJalan] = useState<string>('');
  const [kategoriProduk, setKategoriProduk] = useState<string>('Tarikan MD');
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

  // Handle Automatic UP Tujuan determination when Kategori changes
  useEffect(() => {
    if (isCustomUpTujuan) return;

    if (kategoriProduk === 'Complementary') {
      setUpTujuan('GA (General Affair)');
    } else if (kategoriProduk === 'Dokumen / Laporan') {
      setUpTujuan('Finance/Accounting');
    } else if (
      kategoriProduk === 'Tarikan MD' ||
      kategoriProduk === 'Retur Reject' ||
      kategoriProduk === 'Request'
    ) {
      setUpTujuan('Warehouse');
    } else if (kategoriProduk === 'Mutasi Antar Store') {
      // Default to first other store or warehouse if no stores
      const otherStore = stores.find((s) => s.nama !== selectedStore);
      setUpTujuan(otherStore ? otherStore.nama : 'Store Tujuan');
    }
  }, [kategoriProduk, stores, selectedStore, isCustomUpTujuan]);

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
    setKategoriList(updated);
    setKategoriProduk(newKategoriInput.trim());
    setNewKategoriInput('');
    onShowToast(`Kategori "${newKategoriInput.trim()}" berhasil ditambahkan`, 'success');
  };

  const handleDeleteKategori = (cat: string) => {
    if (kategoriList.length <= 1) {
      onShowToast('Minimal harus ada 1 kategori', 'warning');
      return;
    }
    if (!window.confirm(`Yakin ingin menghapus kategori "${cat}"?`)) return;
    const updated = deleteKategoriMutasi(cat);
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
    setKategoriList(updated);
    if (kategoriProduk === oldCat) {
      setKategoriProduk(editKategoriValue.trim());
    }
    setEditingKategoriIndex(null);
    setEditKategoriValue('');
    onShowToast('Kategori berhasil diperbarui', 'success');
  };

  // Handle Photo upload from modal
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

  // Form Reset
  const handleResetForm = () => {
    setTanggalDiterima(new Date().toISOString().split('T')[0]);
    if (stores.length > 0) setSelectedStore(stores[0].nama);
    setNoSuratJalan('');
    setKategoriProduk('Tarikan MD');
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

  // Compute final UP Tujuan
  const finalUpTujuan = isCustomUpTujuan ? customUpTujuanText.trim() || 'Lainnya' : upTujuan;
  const finalNoSuratJalan = noSuratJalan.trim() ? noSuratJalan.trim() : 'Tidak ada surat jalan';

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStore) {
      onShowToast('Pilih atau masukkan Asal Store', 'warning');
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

    setIsSubmitting(true);
    try {
      const matchedStore = stores.find((s) => s.nama === selectedStore);
      const payload: PenerimaanMutasiStoreItem = {
        tanggal_diterima: tanggalDiterima,
        asal_store_id: matchedStore?.id || '',
        asal_store_nama: selectedStore,
        no_surat_jalan: finalNoSuratJalan,
        kategori_produk: kategoriProduk,
        up_tujuan: finalUpTujuan,
        deskripsi: deskripsi.trim(),
        qty: Number(qty),
        satuan_qty: satuanQty,
        foto_urls: fotoUrls,
        lokasi_stamp: lokasiStamp,
        pic_nama: picNama,
        pic_username: picUsername,
        timestamp_input: new Date().toISOString(),
        keterangan: keterangan.trim(),
      };

      const res = await saveMutasiStore(payload);
      if (res.success) {
        onShowToast('Laporan Mutasi Store berhasil disimpan!', 'success');
        handleResetForm();
        await loadRiwayat();
        setSubTab('riwayat');
      } else {
        onShowToast(res.message || 'Gagal menyimpan data', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Terjadi kesalahan sistem', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Riwayat
  const handleDeleteRiwayat = async (id?: string) => {
    if (!id) return;
    if (!window.confirm('Apakah Anda yakin ingin menghapus laporan mutasi ini?')) return;
    try {
      const res = await deleteMutasiStore(id);
      if (res.success) {
        onShowToast(res.message, 'success');
        await loadRiwayat();
        if (selectedItemDetail?.id === id) setSelectedItemDetail(null);
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Gagal menghapus data', 'error');
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

      {/* VIEW: FORM LAPORAN */}
      {subTab === 'form' && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-6 space-y-5"
        >
          <div className="border-b border-slate-100 dark:border-slate-800/80 pb-3">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Store className="w-4 h-4 text-emerald-500" />
              <span>Input Penerimaan Mutasi Dari Store</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Pencatatan barang kiriman mutasi store dengan nomor surat jalan, kategori produk & UP tujuan otomatis.
            </p>
          </div>

          {/* ROW 1: Tanggal & Asal Store */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                  <Plus className="w-3 h-3" /> Tambah Store
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
          </div>

          {/* ROW 2: No Surat Jalan & Kategori Produk */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 3. No Surat Jalan (Opsional, Default "Tidak ada surat jalan") */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <FileCheck2 className="w-3.5 h-3.5 text-emerald-500" />
                <span>No. Surat Jalan</span>
                <span className="text-[10px] text-slate-400 font-normal">(Opsional)</span>
              </label>
              <input
                type="text"
                placeholder="Kosongkan jika tidak ada (tertulis: Tidak ada surat jalan)"
                value={noSuratJalan}
                onChange={(e) => setNoSuratJalan(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 outline-none text-slate-800 dark:text-slate-100"
              />
              <p className="text-[10px] text-slate-400">
                Status:{' '}
                <span className="font-semibold text-slate-600 dark:text-slate-300">
                  {noSuratJalan.trim() ? noSuratJalan.trim() : 'Tidak ada surat jalan'}
                </span>
              </p>
            </div>

            {/* 4. Kategori Produk (Wajib Isi, List Editable) */}
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
                  setIsCustomUpTujuan(false);
                }}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-slate-800 dark:text-slate-100"
              >
                {kategoriList.map((cat, idx) => (
                  <option key={idx} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* ROW 3: UP Tujuan (Dynamic Autofill + Custom Option) */}
          <div className="space-y-2 p-3.5 bg-slate-50 dark:bg-slate-850/70 rounded-2xl border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-emerald-500" />
                <span>UP Tujuan (Unit / Divisi Penerima)</span>
                <span className="text-rose-500">*</span>
              </label>

              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Mode Input:</span>
                <button
                  type="button"
                  onClick={() => setIsCustomUpTujuan(false)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    !isCustomUpTujuan
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Otomatis / Preset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomUpTujuan(true);
                    if (!customUpTujuanText) setCustomUpTujuanText(upTujuan);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    isCustomUpTujuan
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  Manual (Lainnya)
                </button>
              </div>
            </div>

            {!isCustomUpTujuan ? (
              <div>
                {kategoriProduk === 'Mutasi Antar Store' ? (
                  <div className="space-y-1">
                    <p className="text-[11px] text-slate-500">
                      Pilih Store Tujuan mutasi:
                    </p>
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
                    <span className="text-[10px] bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-bold border border-emerald-200/50">
                      Auto-matched ({kategoriProduk})
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <input
                  type="text"
                  placeholder="Ketik manual UP Tujuan (contoh: QC Lab, Merchandise Dept, GA, dll)"
                  value={customUpTujuanText}
                  onChange={(e) => setCustomUpTujuanText(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[10px] text-slate-400">
                  Target disimpan: <span className="font-bold text-slate-700 dark:text-slate-200">{customUpTujuanText || 'Warehouse'}</span>
                </p>
              </div>
            )}
          </div>

          {/* ROW 4: Deskripsi Rincian Barang */}
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

          {/* ROW 5: Qty & Satuan (Pcs | Koli | Pax) */}
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
                required
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

          {/* ROW 6: Dokumentasi Foto dengan Timestamp & GPS Watermark */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Dokumentasi Foto Kamera Watermark HD</span>
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Foto otomatis dikompres, dibubuhi watermark besar & disimpan ke Google Drive.
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

            {/* Photo Previews */}
            {fotoUrls.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
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
                className="border-2 border-dashed border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 sm:p-6 text-center cursor-pointer hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors bg-slate-50/50 dark:bg-slate-800/30"
              >
                <Camera className="w-7 h-7 mx-auto text-slate-400 mb-1" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Belum ada foto dokumentasi
                </p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Klik untuk membuka kamera fullscreen dengan auto watermark (No SJ, Kategori, UP, Tanggal & GPS)
                </p>
              </div>
            )}
          </div>

          {/* ROW 7: PIC & Timestamp Info Bar */}
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

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={handleResetForm}
              disabled={isSubmitting}
              className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset</span>
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-md shadow-emerald-600/20 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Simpan Laporan Mutasi</span>
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
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Deskripsi Barang:
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
                    {selectedItemDetail.deskripsi}
                  </p>
                </div>
              )}

              {/* Photos Gallery */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Dokumentasi Foto Watermark ({selectedItemDetail.foto_urls?.length || 0})</span>
                </span>
                {selectedItemDetail.foto_urls && selectedItemDetail.foto_urls.length > 0 ? (
                  <div className="space-y-3">
                    {selectedItemDetail.foto_urls.map((url, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-900 shadow-sm"
                      >
                        <img
                          src={url}
                          alt={`Dokumentasi #${idx + 1}`}
                          className="w-full object-contain max-h-80 mx-auto"
                          referrerPolicy="no-referrer"
                        />
                        <div className="p-2 bg-slate-900/90 text-white flex items-center justify-between text-[11px]">
                          <span>Foto #{idx + 1}</span>
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sky-400 hover:underline flex items-center gap-1 font-bold"
                          >
                            <ExternalLink className="w-3 h-3" /> Buka Full di GDrive
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500 italic">Tidak ada foto dokumentasi.</p>
                )}
              </div>
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
                <span>Kelola Kategori Produk Mutasi</span>
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
                  placeholder="Kategori baru (contoh: Sampel Promosi)"
                  value={newKategoriInput}
                  onChange={(e) => setNewKategoriInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddKategori();
                    }
                  }}
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
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
                {kategoriList.map((cat, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    {editingKategoriIndex === idx ? (
                      <div className="flex items-center gap-1.5 flex-1 mr-2">
                        <input
                          type="text"
                          value={editKategoriValue}
                          onChange={(e) => setEditKategoriValue(e.target.value)}
                          className="flex-1 px-2 py-1 bg-white dark:bg-slate-700 border border-emerald-500 rounded-lg text-xs"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEditKategori(cat)}
                          className="px-2 py-1 bg-emerald-600 text-white rounded-lg text-[11px] font-bold"
                        >
                          Simpan
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingKategoriIndex(null);
                            setEditKategoriValue('');
                          }}
                          className="p-1 text-slate-400 hover:text-slate-600"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="font-semibold">{cat}</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKategoriIndex(idx);
                              setEditKategoriValue(cat);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-500 rounded"
                            title="Edit nama kategori"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteKategori(cat)}
                            className="p-1 text-slate-400 hover:text-rose-500 rounded"
                            title="Hapus kategori"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
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
        noSuratJalan={finalNoSuratJalan}
        kategori={kategoriProduk}
        upTujuan={finalUpTujuan}
        picName={picNama}
        picUsername={picUsername}
        qtyInfo={qty ? `${qty} ${satuanQty}` : undefined}
      />
    </div>
  );
};
