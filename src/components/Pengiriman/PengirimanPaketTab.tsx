import React, { useState, useEffect } from 'react';
import {
  Package,
  Calendar,
  Truck,
  Plus,
  Trash2,
  Barcode,
  Search,
  CheckCircle2,
  Camera,
  Layers,
  Save,
  Eye,
  X,
  Send,
  ScanLine,
  FileCheck2,
  Clock,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { UserSession, RiwayatHandoverPaket } from '../../types';
import {
  fetchHandoverPaketList,
  saveHandoverPaket,
  deleteHandoverPaket,
  generateManifestId,
} from '../../services/pengirimanPaket';
import { CourierManifestPrintModal } from './CourierManifestPrintModal';

interface PengirimanPaketTabProps {
  session?: UserSession | null;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

interface ScannedResi {
  id: string;
  no_resi: string;
  waktu_scan: string;
}

const DEFAULT_EKSPEDISI_OPTIONS = [
  'J&T Express',
  'Shopee Xpress (SPX)',
  'JNE Express',
  'SiCepat Ekspres',
  'Anteraja',
  'Ninja Xpress',
  'TIKI',
  'POS Indonesia',
  'Wahana',
  'Lion Parcel',
  'Lalamove',
  'GoSend / GrabExpress',
  'Lainnya',
];

export const PengirimanPaketTab: React.FC<PengirimanPaketTabProps> = ({
  session,
  onShowToast = () => {},
}) => {
  const [subTab, setSubTab] = useState<'form' | 'riwayat'>('form');

  // Form State
  const [ekspedisi, setEkspedisi] = useState('J&T Express');
  const [customEkspedisi, setCustomEkspedisi] = useState('');
  const [tglKirim, setTglKirim] = useState(() => new Date().toISOString().split('T')[0]);
  const [noManifest, setNoManifest] = useState(() => generateManifestId());
  const [driverKurir, setDriverKurir] = useState('');
  const [noKendaraan, setNoKendaraan] = useState('');
  const [keterangan, setKeterangan] = useState('');

  // Scanned Resi State
  const [resiInput, setResiInput] = useState('');
  const [scannedResis, setScannedResis] = useState<ScannedResi[]>([]);

  // Riwayat Handover State
  const [riwayatList, setRiwayatList] = useState<RiwayatHandoverPaket[]>([]);
  const [isLoadingRiwayat, setIsLoadingRiwayat] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<RiwayatHandoverPaket | null>(null);
  const [manifestToPrint, setManifestToPrint] = useState<RiwayatHandoverPaket | null>(null);

  const loadData = async () => {
    setIsLoadingRiwayat(true);
    try {
      const data = await fetchHandoverPaketList();
      setRiwayatList(data);
    } catch (e) {
      console.warn('Gagal memuat riwayat handover:', e);
    } finally {
      setIsLoadingRiwayat(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAddResi = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanResi = resiInput.trim().toUpperCase();
    if (!cleanResi) return;

    if (scannedResis.some((r) => r.no_resi === cleanResi)) {
      onShowToast(`Resi ${cleanResi} sudah pernah di-scan!`, 'warning');
      setResiInput('');
      return;
    }

    const newResi: ScannedResi = {
      id: `resi_${Date.now()}_${Math.random()}`,
      no_resi: cleanResi,
      waktu_scan: new Date().toLocaleTimeString('id-ID'),
    };

    setScannedResis([newResi, ...scannedResis]);
    setResiInput('');
    onShowToast(`Resi ${cleanResi} tercatat (${scannedResis.length + 1} paket)`, 'success');
  };

  const handleRemoveResi = (id: string) => {
    setScannedResis(scannedResis.filter((r) => r.id !== id));
  };

  const handleSimpanHandover = async () => {
    if (scannedResis.length === 0) {
      onShowToast('Belum ada resi paket yang di-scan!', 'warning');
      return;
    }

    const chosenEkspedisi = ekspedisi === 'Lainnya' ? customEkspedisi.trim() || 'Ekspedisi Lainnya' : ekspedisi;

    setIsSubmitting(true);
    try {
      const res = await saveHandoverPaket({
        no_manifest: noManifest,
        tgl_kirim: tglKirim,
        ekspedisi: chosenEkspedisi,
        driver_kurir: driverKurir.trim(),
        no_kendaraan: noKendaraan.trim(),
        total_paket: scannedResis.length,
        pic_nama: session?.name || session?.username || 'Staff WMS',
        pic_username: session?.username || 'operator',
        waktu_handover: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
        status: 'Diserahkan ke Kurir',
        keterangan: keterangan.trim(),
        resi_list: scannedResis.map((r) => r.no_resi),
      });

      if (res.success && res.data) {
        onShowToast(res.message, 'success');
        setManifestToPrint(res.data);
        setScannedResis([]);
        setKeterangan('');
        setDriverKurir('');
        setNoKendaraan('');
        setNoManifest(generateManifestId());
        await loadData();
        setSubTab('riwayat');
      } else {
        onShowToast(res.message || 'Gagal menyimpan handover paket', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Terjadi kesalahan sistem', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteHandover = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Yakin ingin menghapus riwayat serah terima manifest ini?')) return;

    try {
      const res = await deleteHandoverPaket(id);
      if (res.success) {
        onShowToast(res.message, 'success');
        if (selectedDetail?.id === id) setSelectedDetail(null);
        await loadData();
      } else {
        onShowToast(res.message, 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Gagal menghapus data', 'error');
    }
  };

  const filteredRiwayat = riwayatList.filter(
    (r) =>
      r.ekspedisi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.no_manifest.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.driver_kurir.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (r.resi_list && r.resi_list.some((resi) => resi.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  return (
    <div className="space-y-4">
      {/* Sub Tab Buttons: Form vs Riwayat */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <div className="bg-slate-200/80 dark:bg-slate-800/80 p-1 rounded-xl flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSubTab('form')}
            className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              subTab === 'form'
                ? 'bg-white dark:bg-[#131d31] text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Form Handover Paket</span>
            {scannedResis.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-blue-500 text-white rounded-full text-[10px]">
                {scannedResis.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => {
              setSubTab('riwayat');
              loadData();
            }}
            className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              subTab === 'riwayat'
                ? 'bg-white dark:bg-[#131d31] text-blue-600 dark:text-blue-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Riwayat Handover ({riwayatList.length})</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadData}
            disabled={isLoadingRiwayat}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
            title="Refresh data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingRiwayat ? 'animate-spin' : ''}`} />
            <span className="text-[11px] font-semibold">Sync</span>
          </button>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg">
            <Package className="w-3.5 h-3.5 text-blue-500" />
            <span>Serah Terima (Handover) Paket ke Ekspedisi / Kurir</span>
          </div>
        </div>
      </div>

      {/* FORM INPUT HANDOVER PAKET */}
      {subTab === 'form' && (
        <div className="space-y-4">
          {/* Header Manifest & Ekspedisi */}
          <div className="bg-white dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Informasi Ekspedisi & Driver Pick Up</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              {/* Ekspedisi Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Pilih Ekspedisi / Kurir
                </label>
                <select
                  value={ekspedisi}
                  onChange={(e) => setEkspedisi(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  {DEFAULT_EKSPEDISI_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                {ekspedisi === 'Lainnya' && (
                  <input
                    type="text"
                    placeholder="Ketik nama ekspedisi manual..."
                    value={customEkspedisi}
                    onChange={(e) => setCustomEkspedisi(e.target.value)}
                    className="mt-2 w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                )}
              </div>

              {/* Tanggal Kirim */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Tanggal Handover
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="date"
                    value={tglKirim}
                    onChange={(e) => setTglKirim(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              {/* No Manifest Auto */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Nomor Manifest (Auto)
                </label>
                <div className="relative">
                  <FileCheck2 className="w-4 h-4 absolute left-3 top-2.5 text-blue-500" />
                  <input
                    type="text"
                    value={noManifest}
                    readOnly
                    className="w-full pl-9 pr-3 py-2 bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 rounded-xl text-xs font-mono font-black text-blue-700 dark:text-blue-300 outline-none"
                  />
                </div>
              </div>

              {/* Nama Driver */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Nama Driver / Kurir Pick Up
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Budi Santoso (Kurir SPX)"
                  value={driverKurir}
                  onChange={(e) => setDriverKurir(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Plat Nomor */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Nomor Kendaraan / Plat
                </label>
                <input
                  type="text"
                  placeholder="Contoh: B 1234 SPX"
                  value={noKendaraan}
                  onChange={(e) => setNoKendaraan(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              {/* Catatan */}
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                  Catatan Handover (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Pick up sore kloter 1"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* SCANNER RESI BOX */}
          <div className="bg-white dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Barcode className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                <span>Scan / Input Nomor Resi Paket</span>
              </h3>
              <div className="text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-3 py-1 rounded-lg">
                Total di-Scan: {scannedResis.length} Paket
              </div>
            </div>

            {/* Input Resi with Auto Enter */}
            <form onSubmit={handleAddResi} className="flex gap-2">
              <div className="relative flex-1">
                <ScanLine className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Scan barcode resi atau ketik no resi lalu tekan Enter..."
                  value={resiInput}
                  onChange={(e) => setResiInput(e.target.value)}
                  autoFocus
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-blue-300 dark:border-blue-800 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-600/20 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Tambah</span>
              </button>
            </form>

            {/* Resi Scanned List */}
            {scannedResis.length === 0 ? (
              <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
                Belum ada paket yang di-scan. Silakan scan nomor resi paket di input atas.
              </div>
            ) : (
              <div className="space-y-2">
                <div className="max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 border border-slate-100 dark:border-slate-800 rounded-xl">
                  {scannedResis.map((item, idx) => (
                    <div
                      key={item.id}
                      className="p-2.5 flex items-center justify-between text-xs hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-slate-400 font-bold w-6">{idx + 1}.</span>
                        <span className="font-mono font-black text-slate-800 dark:text-slate-200 tracking-wider">
                          {item.no_resi}
                        </span>
                        <span className="text-[10px] text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {item.waktu_scan}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveResi(item.id)}
                        className="p-1 text-red-500 hover:text-red-700 rounded-md cursor-pointer"
                        title="Hapus resi"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Bar */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleSimpanHandover}
                disabled={scannedResis.length === 0 || isSubmitting}
                className={`px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition-all cursor-pointer ${
                  scannedResis.length > 0 && !isSubmitting
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/30'
                    : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Handover Paket'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RIWAYAT HANDOVER PAKET */}
      {subTab === 'riwayat' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-xs">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari ekspedisi, no manifest, resi, atau driver..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

          {filteredRiwayat.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs">
              Tidak ada data riwayat serah terima manifest paket.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {filteredRiwayat.map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-[#101726] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-4 shadow-xs hover:border-blue-300 dark:hover:border-blue-800 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                        {item.ekspedisi}
                      </span>
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          item.status === 'Selesai'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                            : 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-400'
                        }`}
                      >
                        {item.status}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                      <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">
                        {item.no_manifest}
                      </span>
                      <span>•</span>
                      <span>
                        Tgl: {item.tgl_kirim} ({item.waktu_handover})
                      </span>
                      {item.driver_kurir && (
                        <>
                          <span>•</span>
                          <span>
                            Kurir: {item.driver_kurir} {item.no_kendaraan ? `(${item.no_kendaraan})` : ''}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                    <div className="text-right mr-2">
                      <div className="text-xs font-black text-slate-900 dark:text-white">
                        {item.total_paket} Paket
                      </div>
                      <div className="text-[10px] text-slate-400">PIC: {item.pic_nama}</div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setManifestToPrint(item)}
                      className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Cetak Lembar Manifest"
                    >
                      <Printer className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setSelectedDetail(item)}
                      className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-600 dark:text-blue-300 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Detail</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteHandover(item.id, e)}
                      className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/50 rounded-xl text-xs transition-colors cursor-pointer"
                      title="Hapus"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal Detail Handover */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white dark:bg-[#101726] rounded-2xl max-w-lg w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Detail Handover Paket
                </h3>
                <p className="text-xs text-slate-500 font-mono">{selectedDetail.no_manifest}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">Ekspedisi:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedDetail.ekspedisi}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">Tanggal & Waktu:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {selectedDetail.tgl_kirim} ({selectedDetail.waktu_handover})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">Driver / No Plat:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">
                  {selectedDetail.driver_kurir || '-'} ({selectedDetail.no_kendaraan || '-'})
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">PIC WMS:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedDetail.pic_nama}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">Total Paket:</span>
                <span className="font-black text-blue-600 dark:text-blue-400">{selectedDetail.total_paket} Resi</span>
              </div>
              {selectedDetail.keterangan && (
                <div className="py-1 border-b border-slate-100 dark:border-slate-800/60">
                  <span className="text-slate-500 block mb-0.5">Catatan:</span>
                  <p className="italic text-slate-700 dark:text-slate-300">{selectedDetail.keterangan}</p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Daftar Resi Handover ({selectedDetail.resi_list.length})
              </h4>
              <div className="max-h-48 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
                {selectedDetail.resi_list.map((resi, i) => (
                  <div
                    key={i}
                    className="py-1.5 px-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between"
                  >
                    <span>{resi}</span>
                    <span className="text-[10px] text-emerald-500 font-sans font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Terverifikasi
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setManifestToPrint(selectedDetail);
                }}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md shadow-blue-600/20"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Lembar Manifest</span>
              </button>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="py-2 px-4 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Printable Courier Manifest Modal */}
      <CourierManifestPrintModal
        isOpen={!!manifestToPrint}
        onClose={() => setManifestToPrint(null)}
        manifest={manifestToPrint}
      />
    </div>
  );
};
