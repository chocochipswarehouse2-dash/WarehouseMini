import React, { useState } from 'react';
import {
  Store,
  Calendar,
  Truck,
  Plus,
  Trash2,
  Package,
  FileText,
  Search,
  CheckCircle2,
  Clock,
  Camera,
  Layers,
  Save,
  Eye,
  X,
  ExternalLink,
  MapPin,
  Send,
  AlertCircle
} from 'lucide-react';
import { UserSession } from '../../types';

interface PengirimanStoreTabProps {
  session?: UserSession | null;
  onShowToast?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

interface ItemKiriman {
  id: string;
  sku: string;
  nama: string;
  size: string;
  qty: number;
  satuan: string;
}

interface RiwayatStoreKiriman {
  id: string;
  no_sj: string;
  tgl_kirim: string;
  store_tujuan: string;
  jenis_kiriman: string;
  driver_ekspedisi: string;
  total_qty: number;
  total_koli: number;
  pic_nama: string;
  status: 'Draft' | 'Dalam Perjalanan' | 'Telah Diterima';
  keterangan?: string;
  items: ItemKiriman[];
}

export const PengirimanStoreTab: React.FC<PengirimanStoreTabProps> = ({
  session,
  onShowToast = () => {},
}) => {
  const [subTab, setSubTab] = useState<'form' | 'riwayat'>('form');

  // Form State
  const [storeTujuan, setStoreTujuan] = useState('Store Grand Indonesia');
  const [tglKirim, setTglKirim] = useState(() => new Date().toISOString().split('T')[0]);
  const [noSj, setNoSj] = useState(`SJ-OUT-${Date.now().toString().slice(-6)}`);
  const [jenisKiriman, setJenisKiriman] = useState('Restock / Refill Store');
  const [driver, setDriver] = useState('Kurir Internal WMS (Mobil Box B 1234 WMS)');
  const [keterangan, setKeterangan] = useState('');
  
  // Item List State
  const [items, setItems] = useState<ItemKiriman[]>([
    { id: '1', sku: 'TS-OVR-BLK-L', nama: 'Oversized Tee Black', size: 'L', qty: 24, satuan: 'Pcs' },
    { id: '2', sku: 'HOOD-HVY-GRY-XL', nama: 'Heavyweight Hoodie Grey', size: 'XL', qty: 12, satuan: 'Pcs' },
  ]);

  // Input Item Sementara
  const [itemSku, setItemSku] = useState('');
  const [itemNama, setItemNama] = useState('');
  const [itemSize, setItemSize] = useState('All Size');
  const [itemQty, setItemQty] = useState<number | ''>(1);
  const [itemSatuan, setItemSatuan] = useState('Pcs');

  // Dummy Riwayat
  const [riwayatList, setRiwayatList] = useState<RiwayatStoreKiriman[]>([
    {
      id: 'OUT-STR-001',
      no_sj: 'SJ-OUT-2026-081',
      tgl_kirim: new Date().toISOString().split('T')[0],
      store_tujuan: 'Store Grand Indonesia',
      jenis_kiriman: 'Restock / Refill Store',
      driver_ekspedisi: 'Driver Internal - B 9421 KDA',
      total_qty: 36,
      total_koli: 3,
      pic_nama: session?.name || 'Staff WMS',
      status: 'Dalam Perjalanan',
      keterangan: 'Refill batch weekend promo',
      items: [
        { id: '1', sku: 'TS-OVR-BLK-L', nama: 'Oversized Tee Black', size: 'L', qty: 24, satuan: 'Pcs' },
        { id: '2', sku: 'HOOD-HVY-GRY-XL', nama: 'Heavyweight Hoodie Grey', size: 'XL', qty: 12, satuan: 'Pcs' },
      ],
    },
    {
      id: 'OUT-STR-002',
      no_sj: 'SJ-OUT-2026-079',
      tgl_kirim: '2026-03-18',
      store_tujuan: 'Store Senayan City',
      jenis_kiriman: 'Event & Display Baru',
      driver_ekspedisi: 'Lalamove Box',
      total_qty: 60,
      total_koli: 4,
      pic_nama: 'Ahmad Fauzi',
      status: 'Telah Diterima',
      keterangan: 'Diterima oleh SPV Store (Rian)',
      items: [
        { id: '1', sku: 'JCKT-DNM-BLU-M', nama: 'Denim Jacket Indigo', size: 'M', qty: 20, satuan: 'Pcs' },
        { id: '2', sku: 'PNT-CRG-KHK-32', nama: 'Cargo Pants Khaki', size: '32', qty: 40, satuan: 'Pcs' },
      ],
    },
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDetail, setSelectedDetail] = useState<RiwayatStoreKiriman | null>(null);

  const handleAddItem = () => {
    if (!itemSku.trim() && !itemNama.trim()) {
      onShowToast('Masukkan SKU atau Nama Produk terlebih dahulu', 'warning');
      return;
    }
    if (!itemQty || Number(itemQty) <= 0) {
      onShowToast('Qty barang harus lebih dari 0', 'warning');
      return;
    }

    const newItem: ItemKiriman = {
      id: `item_${Date.now()}`,
      sku: itemSku.trim() || 'SKU-CUSTOM',
      nama: itemNama.trim() || itemSku.trim(),
      size: itemSize,
      qty: Number(itemQty),
      satuan: itemSatuan,
    };

    setItems([...items, newItem]);
    setItemSku('');
    setItemNama('');
    setItemQty(1);
    onShowToast('Item berhasil ditambahkan ke daftar kiriman', 'info');
  };

  const handleRemoveItem = (id: string) => {
    setItems(items.filter((i) => i.id !== id));
  };

  const handleSimpanPengiriman = () => {
    if (items.length === 0) {
      onShowToast('Daftar barang kiriman masih kosong', 'warning');
      return;
    }

    const totalQty = items.reduce((acc, curr) => acc + curr.qty, 0);
    const newRecord: RiwayatStoreKiriman = {
      id: `OUT-STR-${Date.now().toString().slice(-4)}`,
      no_sj: noSj,
      tgl_kirim: tglKirim,
      store_tujuan: storeTujuan,
      jenis_kiriman: jenisKiriman,
      driver_ekspedisi: driver,
      total_qty: totalQty,
      total_koli: Math.max(1, Math.ceil(totalQty / 20)),
      pic_nama: session?.name || session?.username || 'Staff WMS',
      status: 'Dalam Perjalanan',
      keterangan: keterangan,
      items: [...items],
    };

    setRiwayatList([newRecord, ...riwayatList]);
    setItems([]);
    setKeterangan('');
    setNoSj(`SJ-OUT-${Date.now().toString().slice(-6)}`);
    onShowToast(`Pengiriman ke ${storeTujuan} berhasil dicatat (Dummy Mode)`, 'success');
    setSubTab('riwayat');
  };

  const filteredRiwayat = riwayatList.filter(
    (r) =>
      r.store_tujuan.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.no_sj.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.jenis_kiriman.toLowerCase().includes(searchQuery.toLowerCase())
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
                ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            <span>Form Pengiriman Store</span>
            {items.length > 0 && (
              <span className="ml-1 px-1.5 py-0.2 bg-indigo-500 text-white rounded-full text-[10px]">
                {items.length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setSubTab('riwayat')}
            className={`px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              subTab === 'riwayat'
                ? 'bg-white dark:bg-[#131d31] text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Riwayat Pengiriman ({riwayatList.length})</span>
          </button>
        </div>

        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/60 px-3 py-1.5 rounded-lg">
          <Store className="w-3.5 h-3.5 text-indigo-500" />
          <span>Pengiriman Barang ke Cabang Store / Outlet</span>
        </div>
      </div>

      {/* FORM PENGIRIMAN STORE */}
      {subTab === 'form' && (
        <div className="space-y-4">
          {/* Header Info Pengiriman */}
          <div className="bg-white dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Store className="w-4 h-4 text-indigo-500" />
              Informasi Tujuan & Surat Jalan
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Store Tujuan <span className="text-red-500">*</span>
                </label>
                <select
                  value={storeTujuan}
                  onChange={(e) => setStoreTujuan(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="Store Grand Indonesia">Store Grand Indonesia (Jakarta Pusat)</option>
                  <option value="Store Senayan City">Store Senayan City (Jakarta Selatan)</option>
                  <option value="Store Pondok Indah Mall">Store Pondok Indah Mall (PIM 2)</option>
                  <option value="Store Paris Van Java">Store Paris Van Java (Bandung)</option>
                  <option value="Store Tunjungan Plaza">Store Tunjungan Plaza (Surabaya)</option>
                  <option value="Store Pakuwon Mall">Store Pakuwon Mall (Jogja)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Tanggal Pengiriman <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Calendar className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="date"
                    value={tglKirim}
                    onChange={(e) => setTglKirim(e.target.value)}
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  No. Surat Jalan
                </label>
                <input
                  type="text"
                  value={noSj}
                  onChange={(e) => setNoSj(e.target.value)}
                  placeholder="Contoh: SJ-OUT-2026-001"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Kategori Kiriman
                </label>
                <select
                  value={jenisKiriman}
                  onChange={(e) => setJenisKiriman(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="Restock / Refill Store">Restock / Refill Stok Store</option>
                  <option value="Event & Display Baru">Event, Promo & Display Baru</option>
                  <option value="Barang Pesanan Khusus">Barang Pesanan Khusus Customer Store</option>
                  <option value="Perlengkapan Toko (ATK/Kantong)">Perlengkapan Toko (ATK/Shopping Bag)</option>
                  <option value="Mutasi Antar Store">Mutasi Kirim Antar Store</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Armada / Driver Pengantar
                </label>
                <div className="relative">
                  <Truck className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={driver}
                    onChange={(e) => setDriver(e.target.value)}
                    placeholder="Contoh: Kurir Internal / Lalamove / Ekspedisi"
                    className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Catatan / Instruksi Driver
                </label>
                <input
                  type="text"
                  value={keterangan}
                  onChange={(e) => setKeterangan(e.target.value)}
                  placeholder="Catatan tambahan (opsional)"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>
            </div>
          </div>

          {/* Daftar Item Kiriman */}
          <div className="bg-white dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-500" />
                Daftar Barang yang Dikirim ({items.length} Item)
              </h3>
              <span className="text-xs font-extrabold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-lg">
                Total: {items.reduce((a, b) => a + b.qty, 0)} {items[0]?.satuan || 'Pcs'}
              </span>
            </div>

            {/* Input Cepat Tambah Item */}
            <div className="p-3 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Tambah Item Kiriman
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div className="sm:col-span-3">
                  <input
                    type="text"
                    placeholder="Kode SKU..."
                    value={itemSku}
                    onChange={(e) => setItemSku(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div className="sm:col-span-4">
                  <input
                    type="text"
                    placeholder="Nama Produk..."
                    value={itemNama}
                    onChange={(e) => setItemNama(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold"
                  />
                </div>
                <div className="sm:col-span-2">
                  <select
                    value={itemSize}
                    onChange={(e) => setItemSize(e.target.value)}
                    className="w-full px-2 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold"
                  >
                    <option value="All Size">All Size</option>
                    <option value="S">S</option>
                    <option value="M">M</option>
                    <option value="L">L</option>
                    <option value="XL">XL</option>
                    <option value="XXL">XXL</option>
                  </select>
                </div>
                <div className="sm:col-span-1">
                  <input
                    type="number"
                    min="1"
                    placeholder="Qty"
                    value={itemQty}
                    onChange={(e) => setItemQty(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-2 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-center"
                  />
                </div>
                <div className="sm:col-span-2">
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Tabel Item Kiriman */}
            {items.length === 0 ? (
              <div className="text-center py-8 text-slate-400 dark:text-slate-500 text-xs">
                Belum ada item kiriman yang ditambahkan. Gunakan form di atas untuk memasukkan barang.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 text-left font-bold w-12">No</th>
                      <th className="py-2 text-left font-bold">SKU</th>
                      <th className="py-2 text-left font-bold">Nama Produk</th>
                      <th className="py-2 text-center font-bold">Size</th>
                      <th className="py-2 text-right font-bold">Qty</th>
                      <th className="py-2 text-center font-bold">Satuan</th>
                      <th className="py-2 text-center font-bold w-12">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {items.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 text-slate-400 font-medium">{idx + 1}</td>
                        <td className="py-2.5 font-bold font-mono text-slate-700 dark:text-slate-300">{item.sku}</td>
                        <td className="py-2.5 font-semibold text-slate-900 dark:text-white">{item.nama}</td>
                        <td className="py-2.5 text-center font-bold text-slate-600 dark:text-slate-400">{item.size}</td>
                        <td className="py-2.5 text-right font-black text-indigo-600 dark:text-indigo-400">{item.qty}</td>
                        <td className="py-2.5 text-center text-slate-500">{item.satuan}</td>
                        <td className="py-2.5 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(item.id)}
                            className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-md transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Tombol Simpan Final */}
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={handleSimpanPengiriman}
                disabled={items.length === 0}
                className={`px-5 py-2.5 rounded-xl text-xs font-black flex items-center gap-2 shadow-md transition-all cursor-pointer ${
                  items.length > 0
                    ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/30'
                    : 'bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                }`}
              >
                <Save className="w-4 h-4" />
                <span>Simpan & Kirim ke Store</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RIWAYAT PENGIRIMAN STORE */}
      {subTab === 'riwayat' && (
        <div className="space-y-3">
          <div className="bg-white dark:bg-[#101726] rounded-2xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 shadow-xs">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Cari store tujuan, no surat jalan, atau kategori..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2.5">
            {filteredRiwayat.map((item) => (
              <div
                key={item.id}
                className="bg-white dark:bg-[#101726] rounded-2xl border border-slate-200/80 dark:border-slate-800/80 p-4 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-800 transition-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-extrabold text-sm text-slate-900 dark:text-white">
                      {item.store_tujuan}
                    </span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        item.status === 'Telah Diterima'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                          : 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                      }`}
                    >
                      {item.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                    <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{item.no_sj}</span>
                    <span>•</span>
                    <span>Tgl: {item.tgl_kirim}</span>
                    <span>•</span>
                    <span>{item.jenis_kiriman}</span>
                    <span>•</span>
                    <span>Armada: {item.driver_ekspedisi}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100 dark:border-slate-800">
                  <div className="text-right">
                    <div className="text-xs font-black text-slate-900 dark:text-white">
                      {item.total_qty} Pcs
                    </div>
                    <div className="text-[10px] text-slate-400">({item.total_koli} Koli/Box)</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedDetail(item)}
                    className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
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

      {/* Modal Detail Kiriman */}
      {selectedDetail && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white dark:bg-[#101726] rounded-2xl max-w-lg w-full p-5 border border-slate-200 dark:border-slate-800 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Detail Pengiriman Store
                </h3>
                <p className="text-xs text-slate-500 font-mono">{selectedDetail.no_sj}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDetail(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">Store Tujuan:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedDetail.store_tujuan}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">Tanggal Kirim:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedDetail.tgl_kirim}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">Kategori:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedDetail.jenis_kiriman}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">Armada / Driver:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedDetail.driver_ekspedisi}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">PIC WMS:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{selectedDetail.pic_nama}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">Status:</span>
                <span className="font-black text-indigo-600 dark:text-indigo-400">{selectedDetail.status}</span>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300">Daftar Barang</h4>
              <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-900 text-slate-500">
                    <tr>
                      <th className="p-2 text-left">Item</th>
                      <th className="p-2 text-center">Size</th>
                      <th className="p-2 text-right">Qty</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedDetail.items.map((it) => (
                      <tr key={it.id}>
                        <td className="p-2">
                          <div className="font-bold">{it.nama}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{it.sku}</div>
                        </td>
                        <td className="p-2 text-center font-bold">{it.size}</td>
                        <td className="p-2 text-right font-black text-indigo-600">{it.qty} {it.satuan}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
