import React, { useState, useEffect, useMemo } from 'react';
import {
  Package,
  Calendar,
  Truck,
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
  Layers,
  FileText,
  Barcode,
} from 'lucide-react';
import {
  UserSession,
  PenerimaanPaketItem,
  LocationStamp,
} from '../../types';
import {
  fetchPenerimaanPaketList,
  savePenerimaanPaket,
  deletePenerimaanPaket,
  fetchEkspedisiList,
  saveEkspedisi,
  deleteEkspedisi,
} from '../../services/penerimaanBarang';
import { CameraWatermarkModal } from './CameraWatermarkModal';
import { SearchableSelect } from '../common/SearchableSelect';

interface PenerimaanPaketTabProps {
  session: UserSession | null;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const PenerimaanPaketTab: React.FC<PenerimaanPaketTabProps> = ({ session, onShowToast }) => {
  const [subTab, setSubTab] = useState<'form' | 'riwayat'>('form');

  // Master Ekspedisi Data
  const [ekspedisiList, setEkspedisiList] = useState<string[]>([]);
  const [loadingEkspedisi, setLoadingEkspedisi] = useState<boolean>(false);
  const [isEkspedisiModalOpen, setIsEkspedisiModalOpen] = useState<boolean>(false);
  const [newEkspedisiName, setNewEkspedisiName] = useState<string>('');
  const [savingEkspedisi, setSavingEkspedisi] = useState<boolean>(false);

  // Form State
  const [tanggalDiterima, setTanggalDiterima] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [selectedEkspedisi, setSelectedEkspedisi] = useState<string>('');
  const [noResi, setNoResi] = useState<string>('');
  const [qtyPaket, setQtyPaket] = useState<number | ''>('');
  const [fotoUrls, setFotoUrls] = useState<string[]>([]);
  const [lokasiStamp, setLokasiStamp] = useState<LocationStamp | undefined>(undefined);
  const [picNama, setPicNama] = useState<string>(session?.name || 'Petugas Gudang');
  const [picUsername, setPicUsername] = useState<string>(session?.username || 'operator');
  const [keterangan, setKeterangan] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Camera & Watermark Modal
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);

  // Riwayat State
  const [riwayatList, setRiwayatList] = useState<PenerimaanPaketItem[]>([]);
  const [isLoadingRiwayat, setIsLoadingRiwayat] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterEkspedisi, setFilterEkspedisi] = useState<string>('');
  const [filterDate, setFilterDate] = useState<string>('');
  const [selectedItemDetail, setSelectedItemDetail] = useState<PenerimaanPaketItem | null>(null);

  // Load Ekspedisi & Riwayat on mount
  useEffect(() => {
    loadEkspedisi();
    loadRiwayat();
  }, []);

  // Sync PIC from session
  useEffect(() => {
    if (session) {
      if (session.name) setPicNama(session.name);
      if (session.username) setPicUsername(session.username);
    }
  }, [session]);

  const loadEkspedisi = async () => {
    setLoadingEkspedisi(true);
    try {
      const data = await fetchEkspedisiList();
      setEkspedisiList(data || []);
      if (data && data.length > 0 && !selectedEkspedisi) {
        setSelectedEkspedisi(data[0]);
      }
    } catch (e) {
      console.warn('Gagal load ekspedisi:', e);
    } finally {
      setLoadingEkspedisi(false);
    }
  };

  const loadRiwayat = async () => {
    setIsLoadingRiwayat(true);
    try {
      const data = await fetchPenerimaanPaketList();
      setRiwayatList(data || []);
    } catch (e) {
      console.warn('Gagal load riwayat paket:', e);
    } finally {
      setIsLoadingRiwayat(false);
    }
  };

  // Add new ekspedisi
  const handleAddEkspedisi = async () => {
    if (!newEkspedisiName.trim()) {
      onShowToast('Nama ekspedisi tidak boleh kosong', 'warning');
      return;
    }
    setSavingEkspedisi(true);
    try {
      const res = await saveEkspedisi(newEkspedisiName.trim());
      if (res.success) {
        onShowToast(res.message, 'success');
        setSelectedEkspedisi(newEkspedisiName.trim());
        setNewEkspedisiName('');
        setIsEkspedisiModalOpen(false);
        await loadEkspedisi();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Gagal menambah ekspedisi', 'error');
    } finally {
      setSavingEkspedisi(false);
    }
  };

  // Delete ekspedisi
  const handleDeleteEkspedisi = async (nama: string) => {
    if (!window.confirm(`Yakin ingin menghapus ekspedisi "${nama}"?`)) return;
    try {
      const res = await deleteEkspedisi(nama);
      if (res.success) {
        onShowToast(res.message, 'success');
        await loadEkspedisi();
      }
    } catch (e: any) {
      onShowToast(e.message || 'Gagal menghapus ekspedisi', 'error');
    }
  };

  // Handle Photo upload from modal
  const handlePhotosUploaded = (urls: string[], loc?: LocationStamp) => {
    setFotoUrls((prev) => [...prev, ...urls]);
    if (loc) {
      setLokasiStamp(loc);
    }
    onShowToast(`${urls.length} foto berhasil ditambahkan dengan watermark!`, 'success');
  };

  const removePhoto = (index: number) => {
    setFotoUrls((prev) => prev.filter((_, i) => i !== index));
  };

  // Reset Form
  const handleResetForm = () => {
    setTanggalDiterima(new Date().toISOString().split('T')[0]);
    if (ekspedisiList.length > 0) setSelectedEkspedisi(ekspedisiList[0]);
    setNoResi('');
    setQtyPaket('');
    setFotoUrls([]);
    setLokasiStamp(undefined);
    setKeterangan('');
  };

  // Submit Form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEkspedisi) {
      onShowToast('Pilih Ekspedisi pengirim', 'warning');
      return;
    }
    if (!qtyPaket || Number(qtyPaket) <= 0) {
      onShowToast('Jumlah Qty Paket harus lebih dari 0', 'warning');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: PenerimaanPaketItem = {
        tanggal_diterima: tanggalDiterima,
        ekspedisi: selectedEkspedisi,
        no_resi: noResi.trim(),
        qty_paket: Number(qtyPaket),
        foto_urls: fotoUrls,
        lokasi_stamp: lokasiStamp,
        pic_nama: picNama,
        pic_username: picUsername,
        timestamp_input: new Date().toISOString(),
        keterangan: keterangan.trim(),
      };

      const res = await savePenerimaanPaket(payload);
      if (res.success) {
        onShowToast('Laporan Penerimaan Paket berhasil disimpan!', 'success');
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
    if (!window.confirm('Apakah Anda yakin ingin menghapus data penerimaan paket ini?')) return;
    try {
      const res = await deletePenerimaanPaket(id);
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
        item.ekspedisi.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.no_resi && item.no_resi.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.pic_nama.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.keterangan && item.keterangan.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchEkspedisi = !filterEkspedisi || item.ekspedisi === filterEkspedisi;
      const matchDate = !filterDate || item.tanggal_diterima === filterDate;

      return matchQuery && matchEkspedisi && matchDate;
    });
  }, [riwayatList, searchQuery, filterEkspedisi, filterDate]);

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
                ? 'bg-white dark:bg-[#131d31] text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Form Laporan</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('riwayat')}
            className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
              subTab === 'riwayat'
                ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Riwayat Laporan ({riwayatList.length})</span>
          </button>
        </div>

        {subTab === 'form' && (
          <button
            type="button"
            onClick={() => setIsEkspedisiModalOpen(true)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-750 text-slate-700 dark:text-slate-300 text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors"
          >
            <Settings2 className="w-3.5 h-3.5 text-slate-500" />
            <span>Kelola Daftar Ekspedisi</span>
          </button>
        )}
      </div>

      {/* VIEW: FORM LAPORAN */}
      {subTab === 'form' && (
        <form
          onSubmit={handleSubmit}
          className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-4 sm:p-6 space-y-5"
        >
          <div className="border-b border-slate-100 dark:border-slate-800/80 pb-3">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Package className="w-4 h-4 text-blue-500" />
              <span>Input Penerimaan Paket Ekspedisi</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Form pencatatan penerimaan paket dari kurir ekspedisi (JNE, J&T, SiCepat, dll).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 1. Tanggal Diterima */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-500" />
                <span>Tanggal Diterima</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                required
                value={tanggalDiterima}
                onChange={(e) => setTanggalDiterima(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 outline-none font-semibold text-slate-800 dark:text-slate-100"
              />
            </div>

            {/* 2. Ekspedisi */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-blue-500" />
                  <span>Ekspedisi Pengirim</span>
                  <span className="text-rose-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => setIsEkspedisiModalOpen(true)}
                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" /> Tambah / Edit
                </button>
              </div>

              <SearchableSelect
                options={ekspedisiList.map((eksp) => ({ value: eksp, label: eksp }))}
                value={selectedEkspedisi}
                onChange={(val) => setSelectedEkspedisi(val)}
                placeholder="-- Pilih Ekspedisi --"
                searchPlaceholder="Ketik nama ekspedisi..."
                allowCustom={true}
                size="md"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 3. Qty Paket */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-blue-500" />
                <span>Qty Paket (Jumlah Paket / Dus)</span>
                <span className="text-rose-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                required
                placeholder="Contoh: 3 Paket"
                value={qtyPaket}
                onChange={(e) => setQtyPaket(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 outline-none font-bold text-slate-800 dark:text-slate-100"
              />
            </div>

            {/* 4. No Resi / Surat Jalan (Opsional) */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Barcode className="w-3.5 h-3.5 text-blue-500" />
                <span>No. Resi / Surat Jalan (Opsional)</span>
              </label>
              <input
                type="text"
                placeholder="Scan atau ketik no resi jika ada..."
                value={noResi}
                onChange={(e) => setNoResi(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100 font-mono"
              />
            </div>
          </div>

          {/* 5. Catatan / Keterangan */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-blue-500" />
              <span>Catatan Tambahan (Pengirim / Kondisi)</span>
            </label>
            <input
              type="text"
              placeholder="Contoh: Paket dari Supplier Bahan, Kondisi Dus Rapi..."
              value={keterangan}
              onChange={(e) => setKeterangan(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 outline-none text-slate-800 dark:text-slate-100"
            />
          </div>

          {/* 6. Dokumentasi Foto dengan Timestamp & GPS Location Watermark */}
          <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-blue-500" />
                  <span>Dokumentasi Foto Paket (Auto Stamp Waktu & GPS ke GDrive)</span>
                </label>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Foto akan otomatis dibubuhi stempel tanggal, koordinat GPS, dan info PIC.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsCameraModalOpen(true)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Ambil / Upload Foto</span>
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
                    <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-slate-900/80 text-[9px] text-white rounded font-mono">
                      Foto #{idx + 1}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => setIsCameraModalOpen(true)}
                className="border-2 border-dashed border-slate-200 dark:border-slate-700/80 rounded-2xl p-4 text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 transition-colors bg-slate-50/50 dark:bg-slate-800/30"
              >
                <Camera className="w-6 h-6 mx-auto text-slate-400 mb-1" />
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  Belum ada foto dokumentasi paket
                </p>
                <p className="text-[11px] text-slate-500">
                  Klik di sini untuk mengambil foto kamera dengan auto watermark timestamp & GPS
                </p>
              </div>
            )}
          </div>

          {/* 7. PIC & Timestamp Info Bar */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800/60 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <User className="w-4 h-4 text-blue-500 shrink-0" />
              <div>
                <span className="text-[10px] text-slate-400 block font-bold">PIC Penerima</span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {picNama} (@{picUsername})
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
              <Clock className="w-4 h-4 text-blue-500 shrink-0" />
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
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-md shadow-blue-600/20 transition-all disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Simpan Laporan Paket</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* VIEW: RIWAYAT LAPORAN (VIEW KARTU) */}
      {subTab === 'riwayat' && (
        <div className="space-y-3">
          {/* Search & Filter Bar */}
          <div className="bg-white dark:bg-[#131d31] p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Cari ekspedisi, no resi, atau PIC..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <div className="min-w-[180px]">
                <SearchableSelect
                  options={[
                    { value: '', label: 'Semua Ekspedisi' },
                    ...ekspedisiList.map((eksp) => ({ value: eksp, label: eksp })),
                  ]}
                  value={filterEkspedisi}
                  onChange={(val) => setFilterEkspedisi(val)}
                  placeholder="Filter Ekspedisi"
                  searchPlaceholder="Cari ekspedisi..."
                  allowCustom={false}
                  size="sm"
                />
              </div>

              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-300 outline-none h-[34px]"
              />
              {(filterDate || filterEkspedisi) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterDate('');
                    setFilterEkspedisi('');
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* List Kartu Riwayat */}
          {isLoadingRiwayat ? (
            <div className="text-center py-12 bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
              <p className="text-xs text-slate-500">Memuat riwayat penerimaan paket...</p>
            </div>
          ) : filteredRiwayat.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
              <Package className="w-10 h-10 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Belum ada data penerimaan paket
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                {searchQuery || filterDate || filterEkspedisi
                  ? 'Tidak ada data yang sesuai dengan filter pencarian.'
                  : 'Gunakan tab "Form Laporan" untuk mencatat paket ekspedisi baru.'}
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
                    {/* Header Card: Ekspedisi & Tanggal */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                          <Truck className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-1">
                            {item.ekspedisi}
                          </h4>
                          <span className="text-[11px] text-slate-500 flex items-center gap-1 font-medium">
                            <Calendar className="w-3 h-3" />
                            {item.tanggal_diterima}
                          </span>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-black border border-blue-200/60 dark:border-blue-800/50 shrink-0">
                        {item.qty_paket} Paket
                      </span>
                    </div>

                    {/* Resi & Catatan */}
                    {item.no_resi && (
                      <div className="flex items-center gap-1.5 text-xs font-mono text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1.5 rounded-xl border border-slate-100 dark:border-slate-800">
                        <Barcode className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="truncate">{item.no_resi}</span>
                      </div>
                    )}

                    {item.keterangan && (
                      <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50/70 dark:bg-slate-800/30 p-2 rounded-xl line-clamp-2">
                        {item.keterangan}
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
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Truck className="w-4 h-4 text-blue-500" />
                  <span>Detail Paket: {selectedItemDetail.ekspedisi}</span>
                </h3>
                <span className="text-xs text-slate-500">
                  Tanggal: {selectedItemDetail.tanggal_diterima}
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
              <div className="grid grid-cols-2 gap-2 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">Qty Paket</span>
                  <span className="font-bold text-blue-600 dark:text-blue-400 text-sm">
                    {selectedItemDetail.qty_paket} Paket
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block font-bold">No. Resi</span>
                  <span className="font-mono text-slate-800 dark:text-slate-200">
                    {selectedItemDetail.no_resi || '-'}
                  </span>
                </div>
                <div className="col-span-2 pt-1 border-t border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 block font-bold">PIC Penerima</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {selectedItemDetail.pic_nama} (@{selectedItemDetail.pic_username})
                  </span>
                </div>
              </div>

              {selectedItemDetail.keterangan && (
                <div className="space-y-1">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Catatan / Kondisi:
                  </span>
                  <p className="text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-xl">
                    {selectedItemDetail.keterangan}
                  </p>
                </div>
              )}

              {/* Photos Gallery */}
              <div className="space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-blue-500" />
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

      {/* MODAL: KELOLA DAFTAR EKSPEDISI */}
      {isEkspedisiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white dark:bg-[#131d31] w-full max-w-md rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-500" />
                <span>Daftar Ekspedisi</span>
              </h3>
              <button
                onClick={() => setIsEkspedisiModalOpen(false)}
                className="p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Form Tambah Ekspedisi */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Nama ekspedisi baru (contoh: Pos Indonesia)"
                  value={newEkspedisiName}
                  onChange={(e) => setNewEkspedisiName(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddEkspedisi}
                  disabled={savingEkspedisi || !newEkspedisiName.trim()}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tambah</span>
                </button>
              </div>

              {/* List Ekspedisi */}
              <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 border border-slate-100 dark:border-slate-800 rounded-xl">
                {ekspedisiList.map((eksp, idx) => (
                  <div
                    key={idx}
                    className="p-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 text-xs font-medium text-slate-700 dark:text-slate-200"
                  >
                    <span>{eksp}</span>
                    <button
                      type="button"
                      onClick={() => handleDeleteEkspedisi(eksp)}
                      className="p-1 text-slate-400 hover:text-rose-500 rounded"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
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
        title="Penerimaan Paket"
        entityName={selectedEkspedisi}
        picName={picNama}
        picUsername={picUsername}
        qtyInfo={qtyPaket ? `${qtyPaket} Paket` : undefined}
      />
    </div>
  );
};
