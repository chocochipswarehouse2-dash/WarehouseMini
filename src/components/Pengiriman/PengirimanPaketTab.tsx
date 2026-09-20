import React, { useState } from 'react';
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
  Printer
} from 'lucide-react';
import { UserSession } from '../../types';

interface PengirimanPaketTabProps {
  session?: UserSession | null;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

interface ScannedResi {
  id: string;
  no_resi: string;
  waktu_scan: string;
}

interface RiwayatHandoverPaket {
  id: string;
  no_manifest: string;
  tgl_kirim: string;
  ekspedisi: string;
  driver_kurir: string;
  no_kendaraan: string;
  total_paket: number;
  pic_nama: string;
  waktu_handover: string;
  status: 'Diserahkan ke Kurir' | 'Selesai';
  keterangan?: string;
  resi_list: string[];
}

export const PengirimanPaketTab: React.FC<PengirimanPaketTabProps> = ({
  session,
  onShowToast = () => {},
}) => {
  const [subTab, setSubTab] = useState<'form' | 'riwayat'>('form');

  // Form State
  const [ekspedisi, setEkspedisi] = useState('J&T Express');
  const [tglKirim, setTglKirim] = useState(() => new Date().toISOString().split('T')[0]);
  const [noManifest, setNoManifest] = useState(
    () => `MNF-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`
  );
  const [driverKurir, setDriverKurir] = useState('Budi Santoso (Kurir Pick Up)');
  const [noKendaraan, setNoKendaraan] = useState('B 9876 JNT');
  const [keterangan, setKeterangan] = useState('');

  // Scanned Resi State
  const [resiInput, setResiInput] = useState('');
  const [scannedResis, setScannedResis] = useState<ScannedResi[]>([
    { id: '1', no_resi: 'JX01982736192', waktu_scan: '14:20:15' },
    { id: '2', no_resi: 'JX01982736193', waktu_scan: '14:20:30' },
    { id: '3', no_resi: 'JX01982736194', waktu_scan: '14:21:02' },
  ]);

  // Dummy Riwayat Handover
  const [riwayatList, setRiwayatList] = useState<RiwayatHandoverPaket[]>([
    {
      id: 'HO-PKT-001',
      no_manifest: 'MNF-260319-8921',
      tgl_kirim: new Date().toISOString().split('T')[0],
      ekspedisi: 'J&T Express',
      driver_kurir: 'Budi Santoso (Kurir Pick Up)',
      no_kendaraan: 'B 9876 JNT',
      total_paket: 3,
      pic_nama: session?.name || 'Staff WMS',
      waktu_handover: '14:25',
      status: 'Diserahkan ke Kurir',
      keterangan: 'Pick up sore kloter 1',
      resi_list: ['JX01982736192', 'JX01982736193', 'JX01982736194'],
    },
    {
      id: 'HO-PKT-002',
      no_manifest: 'MNF-260318-4512',
      tgl_kirim: '2026-03-18',
      ekspedisi: 'Shopee Xpress (SPX)',
      driver_kurir: 'Ahmad Supriatna',
      no_kendaraan: 'B 5432 SPX',
      total_paket: 128,
      pic_nama: 'Dian Permana',
      waktu_handover: '17:40',
      status: 'Selesai',
      keterangan: 'Handover pesanan flash sale',
      resi_list: ['SPXID02918231', 'SPXID02918232', 'SPXID02918233'],
    },
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<RiwayatHandoverPaket | null>(null);

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
    onShowToast(`Resi ${cleanResi} tercatat`, 'success');
  };

  const handleRemoveResi = (id: string) => {
    setScannedResis(scannedResis.filter((r) => r.id !== id));
  };

  const handleSimpanHandover = () => {
    if (scannedResis.length === 0) {
      onShowToast('Belum ada resi paket yang di-scan!', 'warning');
      return;
    }

    const newRecord: RiwayatHandoverPaket = {
      id: `HO-PKT-${Date.now().toString().slice(-4)}`,
      no_manifest: noManifest,
      tgl_kirim: tglKirim,
      ekspedisi: ekspedisi,
      driver_kurir: driverKurir,
      no_kendaraan: noKendaraan,
      total_paket: scannedResis.length,
      pic_nama: session?.name || session?.username || 'Staff WMS',
      waktu_handover: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }),
      status: 'Diserahkan ke Kurir',
      keterangan: keterangan,
      resi_list: scannedResis.map((r) => r.no_resi),
    };

    setRiwayatList([newRecord, ...riwayatList]);
    setScannedResis([]);
    setKeterangan('');
    setNoManifest(
      `MNF-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Date.now().toString().slice(-4)}`
    );
    onShowToast(`Handover ${newRecord.total_paket} paket ke ${ekspedisi} berhasil disimpan (Dummy Mode)`, 'success');
    setSubTab('riwayat');
  };

  const filteredRiwayat = riwayatList.filter(
    (r) =>
      r.ekspedisi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.no_manifest.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.driver_kurir.toLowerCase().includes(searchQuery.toLowerCase())
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
            onClick={() => setSubTab('riwayat')}
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

        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg">
          <Package className="w-3.5 h-3.5 text-blue-500" />
          <span>Serah Terima (Handover) Paket ke Ekspedisi / Kurir</span>
        </div>
      </div>

      {/* FORM INPUT HANDOVER PAKET */}
      {subTab === 'form' && (
        <div className="space-y-4">
          {/* Header Manifest & Ekspedisi */}
          <div className="bg-white dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-500" />
              Informasi Ekspedisi & Kurir Pick Up
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Ekspedisi / Kurir <span className="text-red-500">*</span>
                </label>
                <select
                  value={ekspedisi}
                  onChange={(e) => setEkspedisi(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                >
                  <option value="J&T Express">J&T Express (EZ / Cargo)</option>
                  <option value="Shopee Xpress (SPX)">Shopee Xpress (SPX Standard)</option>
                  <option value="SiCepat Ekspres">SiCepat Ekspres</option>
                  <option value="JNE Express">JNE Express (REG / YES)</option>
                  <option value="TikTok Express (J&T Cargo)">TikTok Express (J&T Cargo)</option>
                  <option value="Ninja Xpress">Ninja Xpress</option>
                  <option value="GoSend / GrabExpress">GoSend / GrabExpress (Instant / Sameday)</option>
                  <option value="Lainnya">Ekspedisi Lainnya</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tanggal Handover <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="date"
                    value={tglKirim}
                    onChange={(e) => setTglKirim(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  No. Manifest Pengiriman
                </label>
                <input
                  type="text"
                  value={noManifest}
                  onChange={(e) => setNoManifest(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none font-mono"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nama Driver / Kurir Pick Up
                </label>
                <input
                  type="text"
                  value={driverKurir}
                  onChange={(e) => setDriverKurir(e.target.value)}
                  placeholder="Contoh: Budi Santoso"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nomor Plat Mobil / Motor
                </label>
                <input
                  type="text"
                  value={noKendaraan}
                  onChange={(e) => setNoKendaraan(e.target.value)}
                  placeholder="Contoh: B 1234 XYZ"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Catatan Handover
                </label>
                <input
                  type="text"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Catatan tambahan (opsional)"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Scanner / Input Resi Paket */}
          <div className="bg-white dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ScanLine className="w-4 h-4 text-blue-500" />
                Scan Resi Paket Handover
              </h3>
              <span className="text-xs font-black text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/50 px-3 py-1 rounded-lg">
                Total Paket: {scannedResis.length} Koli/Paket
              </span>
            </div>

            {/* Input Barcode Scanner */}
            <form onSubmit={handleAddResi} className="flex gap-2">
              <div className="relative flex-1">
                <Barcode className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Scan barcode nomor resi paket di sini lalu tekan Enter..."
                  value={resiInput}
                  onChange={(e) => setResiInput(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold font-mono focus:ring-2 focus:ring-blue-500 outline-none"
                  autoFocus
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer shrink-0"
              >
                <Plus className="w-4 h-4" />
                <span>Input</span>
              </button>
            </form>

            {/* List Resi yang Sudah di-scan */}
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
                disabled={scannedResis.length === 0}
                className={`px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition-all cursor-pointer ${
                  scannedResis.length > 0
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-600/30'
                    : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>Simpan Handover Paket</span>
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
                placeholder="Cari ekspedisi, no manifest, atau nama driver..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
              />
            </div>
          </div>

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
                    <span className="font-mono text-blue-600 dark:text-blue-400 font-bold">{item.no_manifest}</span>
                    <span>•</span>
                    <span>Tgl: {item.tgl_kirim} ({item.waktu_handover})</span>
                    <span>•</span>
                    <span>Kurir: {item.driver_kurir} ({item.no_kendaraan})</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                  <div className="text-right">
                    <div className="text-xs font-black text-slate-900 dark:text-white">
                      {item.total_paket} Paket
                    </div>
                    <div className="text-[10px] text-slate-400">PIC: {item.pic_nama}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDetail(item)}
                    className="px-3 py-1.5 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 text-blue-600 dark:text-blue-300 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Detail</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
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
                  {selectedDetail.driver_kurir} ({selectedDetail.no_kendaraan})
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
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Daftar Resi Handover</h4>
              <div className="max-h-48 overflow-y-auto border border-slate-100 dark:border-slate-800 rounded-xl p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
                {selectedDetail.resi_list.map((resi, i) => (
                  <div key={i} className="py-1.5 px-2 text-xs font-mono font-bold text-slate-700 dark:text-slate-300 flex items-center justify-between">
                    <span>{resi}</span>
                    <span className="text-[10px] text-emerald-500 font-sans font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Terverifikasi
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="w-full py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
