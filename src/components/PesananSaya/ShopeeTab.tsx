import React, { useState, useRef } from 'react';
import { Upload, Printer, Package, Search, Trash2, CheckCircle2, FileSpreadsheet, X, ShoppingBag } from 'lucide-react';
import * as XLSX from 'xlsx';
import QRCode from 'qrcode';

interface ShopeeItem {
  namaProduk: string;
  namaVariasi: string;
  sku: string;
  qty: number;
}

interface ShopeeOrder {
  noPesanan: string;
  statusPesanan: string;
  noResi: string;
  opsiPengiriman: string;
  waktuPesananDibuat: string;
  catatanPembeli: string;
  catatan: string;
  usernamePembeli: string;
  namaPenerima: string;
  noTelepon: string;
  alamatPengiriman: string;
  kotaKabupaten: string;
  provinsi: string;
  items: ShopeeItem[];
  qrDataUrl?: string;
}

interface ShopeeTabProps {
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const ShopeeTab: React.FC<ShopeeTabProps> = ({ onShowToast }) => {
  const [orders, setOrders] = useState<ShopeeOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isPrinting, setIsPrinting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });
        
        if (data.length < 2) {
          onShowToast('File Excel kosong atau format tidak sesuai', 'error');
          return;
        }

        const headers = data[0] as string[];
        const rows = data.slice(1);

        const getColIndex = (name: string) => headers.findIndex(h => h && h.toString().toLowerCase().includes(name.toLowerCase()));

        const idxNoPesanan = getColIndex('No. Pesanan');
        const idxStatus = getColIndex('Status Pesanan');
        const idxResi = getColIndex('No. Resi');
        const idxOpsiPengiriman = getColIndex('Opsi Pengiriman');
        const idxWaktuBuat = getColIndex('Waktu Pesanan Dibuat');
        const idxCatatanPembeli = getColIndex('Catatan dari Pembeli');
        const idxCatatan = getColIndex('Catatan');
        const idxUsername = getColIndex('Username (Pembeli)');
        const idxNamaPenerima = getColIndex('Nama Penerima');
        const idxNoTelp = getColIndex('No. Telepon');
        const idxAlamat = getColIndex('Alamat Pengiriman');
        const idxKota = getColIndex('Kota/Kabupaten');
        const idxProvinsi = getColIndex('Provinsi');
        
        const idxNamaProduk = getColIndex('Nama Produk');
        const idxNamaVariasi = getColIndex('Nama Variasi');
        const idxSku = getColIndex('Nomor Referensi SKU');
        const idxQty = getColIndex('Jumlah');

        if (idxNoPesanan === -1) {
          onShowToast('Kolom No. Pesanan tidak ditemukan. Pastikan ini format export Shopee.', 'error');
          return;
        }

        const orderMap = new Map<string, ShopeeOrder>();

        for (const row of rows) {
          if (!row[idxNoPesanan]) continue;
          
          const noPesanan = String(row[idxNoPesanan] || '');
          const item: ShopeeItem = {
            namaProduk: String(row[idxNamaProduk] || ''),
            namaVariasi: String(row[idxNamaVariasi] || ''),
            sku: String(row[idxSku] || ''),
            qty: parseInt(row[idxQty] || '1', 10)
          };

          if (orderMap.has(noPesanan)) {
            const existingOrder = orderMap.get(noPesanan)!;
            existingOrder.items.push(item);
          } else {
            let qrDataUrl = '';
            try {
              qrDataUrl = await QRCode.toDataURL(noPesanan, { margin: 1, width: 256, errorCorrectionLevel: 'M' });
            } catch (err) {
              console.error('QR Generate Error', err);
            }

            orderMap.set(noPesanan, {
              noPesanan,
              statusPesanan: String(row[idxStatus] || ''),
              noResi: String(row[idxResi] || ''),
              opsiPengiriman: String(row[idxOpsiPengiriman] || ''),
              waktuPesananDibuat: String(row[idxWaktuBuat] || ''),
              catatanPembeli: String(row[idxCatatanPembeli] || ''),
              catatan: String(row[idxCatatan] || ''),
              usernamePembeli: String(row[idxUsername] || ''),
              namaPenerima: String(row[idxNamaPenerima] || ''),
              noTelepon: String(row[idxNoTelp] || ''),
              alamatPengiriman: String(row[idxAlamat] || ''),
              kotaKabupaten: String(row[idxKota] || ''),
              provinsi: String(row[idxProvinsi] || ''),
              items: [item],
              qrDataUrl
            });
          }
        }

        setOrders(Array.from(orderMap.values()));
        onShowToast(`Berhasil mengimpor ${orderMap.size} pesanan Shopee`, 'success');
      } catch (err) {
        console.error(err);
        onShowToast('Gagal memproses file Excel', 'error');
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  const handlePrint = () => {
    if (orders.length === 0) {
      onShowToast('Tidak ada data untuk dicetak', 'warning');
      return;
    }
    
    setTimeout(() => {
      window.print();
    }, 500);
  };

  const clearData = () => {
    if (window.confirm('Hapus semua data impor saat ini?')) {
      setOrders([]);
    }
  };

  const filteredOrders = orders.filter(o => 
    o.noPesanan.toLowerCase().includes(searchTerm.toLowerCase()) || 
    o.namaPenerima.toLowerCase().includes(searchTerm.toLowerCase()) ||
    o.noResi.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/50">
      {/* CSS Print A4 Setup */}
      <style>{`
        @media print {
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 100% !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden !important;
          }
          #shopee-print-area, #shopee-print-area * {
            visibility: visible !important;
          }
          #shopee-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            z-index: 999999 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: A4 portrait;
            margin: 0 !important;
          }
        }
      `}</style>

      {/* Main UI */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 print:hidden">
        <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
                <ShoppingBag className="w-6 h-6 text-orange-500" />
                Rekap & Picking List Shopee
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Import file <strong className="text-slate-700 dark:text-slate-300">Order.toship.xxxx.xlsx</strong> dan cetak rekap pesanan (Picking List).
              </p>
            </div>
            
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <input 
                type="file" 
                accept=".xlsx, .xls, .csv" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                className="hidden" 
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-white dark:bg-slate-800 border-2 border-orange-200 dark:border-orange-900/50 hover:border-orange-500 dark:hover:border-orange-500 text-orange-600 dark:text-orange-400 font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Import Excel
              </button>
              
              <button
                onClick={handlePrint}
                disabled={orders.length === 0}
                className="flex-1 sm:flex-none px-4 py-2.5 bg-orange-500 hover:bg-orange-600 disabled:bg-slate-300 dark:disabled:bg-slate-700 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Cetak Picking List
              </button>
            </div>
          </div>

          {orders.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
              <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-4 justify-between items-center bg-slate-50/50 dark:bg-slate-900/20">
                <div className="relative w-full sm:w-96">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Cari No. Pesanan atau Resi..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <button
                  onClick={clearData}
                  className="px-4 py-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl text-sm font-bold flex items-center gap-2 transition-all w-full sm:w-auto justify-center"
                >
                  <Trash2 className="w-4 h-4" />
                  Hapus Data
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                      <th className="p-4 border-b border-slate-200 dark:border-slate-700">No. Pesanan</th>
                      <th className="p-4 border-b border-slate-200 dark:border-slate-700">Penerima</th>
                      <th className="p-4 border-b border-slate-200 dark:border-slate-700">Opsi Pengiriman</th>
                      <th className="p-4 border-b border-slate-200 dark:border-slate-700">Total Item</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-sm">
                    {filteredOrders.map(order => (
                      <tr key={order.noPesanan} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="p-4 font-mono font-bold text-slate-900 dark:text-white">
                          {order.noPesanan}
                          {order.noResi && <div className="text-xs font-normal text-slate-500">{order.noResi}</div>}
                        </td>
                        <td className="p-4">
                          <div className="font-bold text-slate-800 dark:text-white">{order.namaPenerima}</div>
                          <div className="text-xs text-slate-500 line-clamp-1 max-w-xs">{order.alamatPengiriman}</div>
                        </td>
                        <td className="p-4 text-slate-600 dark:text-slate-300">{order.opsiPengiriman}</td>
                        <td className="p-4 font-bold text-slate-800 dark:text-white text-center">
                          {order.items.reduce((sum, item) => sum + item.qty, 0)}
                        </td>
                      </tr>
                    ))}
                    {filteredOrders.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-500">
                          Data pesanan tidak ditemukan.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          
          {orders.length === 0 && (
            <div className="text-center py-20 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
              <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 text-orange-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <FileSpreadsheet className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">Belum ada data Shopee</h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
                Silakan upload file Excel export dari Seller Centre Shopee (Kolom No. Pesanan dsb harus sesuai) untuk memulai rekap dan cetak picking list.
              </p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl shadow-md transition-all inline-flex items-center gap-2"
              >
                <Upload className="w-4 h-4" />
                Pilih File Excel
              </button>
            </div>
          )}
        </div>
      </div>

      {/* A6 Print Area */}
      <div id="shopee-print-area" className="hidden print:block bg-white w-full text-black">
        {orders.map((order, idx) => {
          const totalQty = order.items.reduce((sum, it) => sum + it.qty, 0);
          
          return (
            <div
              key={order.noPesanan}
              className="page-break w-[105mm] h-[148mm] max-h-[148mm] p-[2mm] relative bg-white box-border overflow-hidden flex flex-col justify-between"
              style={{
                pageBreakAfter: idx < orders.length - 1 ? 'always' : 'avoid',
                breakAfter: idx < orders.length - 1 ? 'page' : 'avoid',
                pageBreakInside: 'avoid',
                breakInside: 'avoid',
              }}
            >
              <div className="w-full h-full max-h-[144mm] border-[2px] border-black flex flex-col bg-white box-border text-black overflow-hidden">
                {/* TOP FIXED AREA */}
                <div className="flex flex-col shrink-0">
                  {/* 1. Header Label */}
                  <div className="border-b-[2px] border-black px-3 py-2 bg-gray-50 flex justify-between items-center break-inside-avoid">
                    <div className="text-xl font-black tracking-widest uppercase leading-none text-black flex items-center">
                      <img src="/logo.png" alt="" referrerPolicy="no-referrer" className="h-7 object-contain hidden print:block" onError={(e) => e.currentTarget.style.display = 'none'} />
                    </div>
                    <div className="text-[16px] font-black tracking-wider uppercase leading-none text-black text-right max-w-[60%] line-clamp-2">
                      {order.opsiPengiriman || 'SHOPEE STANDARD'}
                    </div>
                  </div>
              
                  {/* 2. Sender / Receiver + QR Code block */}
                  <div className="flex border-b-[2px] border-black bg-white break-inside-avoid">
                    {/* Main Left Column (Penerima & Pengirim Stacked) */}
                    <div className="flex-1 flex flex-col border-r-[2px] border-black min-w-0">
                      
                      {/* PENERIMA (Top, Gets Maximum Space) */}
                      <div className="p-3 border-b-[2px] border-black flex-1">
                        <div className="text-[11px] font-black uppercase text-gray-600 mb-1">Kepada / Penerima:</div>
                        <div className="text-[18px] font-black uppercase mb-1 leading-tight text-black">{order.namaPenerima || '-'}</div>
                        {order.noTelepon && (
                          <div className="text-[14px] font-black font-mono text-black mb-1.5 leading-none">{order.noTelepon}</div>
                        )}
                        <div className="text-[13px] font-bold leading-snug whitespace-pre-wrap text-black">{order.alamatPengiriman || '-'}</div>
                        {(order.catatan || order.catatanPembeli) && (
                          <div className="mt-2 pt-1.5 border-t border-dashed border-gray-300">
                            <span className="text-[10px] font-black uppercase text-gray-500 mr-1">NOTE:</span>
                            <span className="text-[12px] font-bold text-black whitespace-pre-wrap">{order.catatanPembeli || order.catatan}</span>
                          </div>
                        )}
                      </div>

                      {/* PENGIRIM (Bottom) */}
                      <div className="p-2.5 flex items-center justify-between gap-2 shrink-0 bg-white">
                        <div className="flex-1">
                          <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">Dari / Pengirim:</div>
                          <div className="text-[12px] font-black uppercase text-black leading-tight">CHOCOCHIPS (SHOPEE)</div>
                        </div>
                        <div className="text-right pl-2 border-l border-gray-300">
                          <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">No. Telp:</div>
                          <div className="text-[11px] font-bold font-mono text-gray-800 leading-tight">628118299898</div>
                        </div>
                      </div>
                    </div>
            
                    {/* QR Code and ID */}
                    <div className="w-[110px] p-2 flex flex-col items-center justify-center shrink-0">
                      {order.qrDataUrl && (
                        <img
                          src={order.qrDataUrl}
                          alt="QR Code"
                          className="w-[75px] h-[75px] block object-contain mb-1.5"
                        />
                      )}
                      <div className="text-[10px] font-black text-center break-all mb-0.5 text-black leading-tight">
                        {order.noPesanan}
                      </div>
                      {order.noResi && (
                        <div className="text-[10px] font-bold text-center break-all text-neutral-600 leading-tight mt-0.5 font-mono">
                          {order.noResi}
                        </div>
                      )}
                    </div>
                  </div>
              
                  {/* 3. Warning Box */}
                  <div className="border-b-[2px] border-black py-1.5 px-2 bg-gray-100 flex items-center justify-center text-center break-inside-avoid">
                    <div className="text-[10px] font-black text-black tracking-wide uppercase leading-tight">
                      ⚠️ PERHATIAN: JANGAN DITERIMA JIKA KONDISI PAKET RUSAK ATAU SEGEL TERBUKA &bull; WAJIB VIDEO UNBOXING
                    </div>
                  </div>
                </div>
              
                {/* BOTTOM DYNAMIC AREA: Table for Shopee Shipment */}
                <div className="p-3 bg-white flex-1 overflow-hidden min-h-0 flex flex-col">
                  <div className="text-[12px] font-black uppercase text-gray-600 border-b border-black pb-1 mb-1.5">ISI PRODUK PESANAN</div>
                  <div className="flex-1 overflow-hidden">
                    <table className="w-full border-collapse text-[12px]">
                      <thead>
                        <tr className="border-b border-dashed border-black">
                          <th className="text-left py-1 w-[5%] font-bold">No.</th>
                          <th className="text-left py-1 w-[50%] font-bold">Nama Produk</th>
                          <th className="text-left py-1 w-[15%] font-bold">Variasi</th>
                          <th className="text-left py-1 w-[20%] font-bold">SKU</th>
                          <th className="text-center py-1 w-[10%] font-bold">Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items && order.items.length > 0 ? (
                          order.items.map((it, idx) => {
                            let cleanName = it.namaProduk;
                            return (
                              <tr key={idx} className="border-b border-dashed border-black">
                                <td className="py-1 align-top">{idx + 1}.</td>
                                <td className="py-1 align-top leading-snug line-clamp-2 pr-1">{cleanName}</td>
                                <td className="py-1 align-top">{it.namaVariasi}</td>
                                <td className="py-1 align-top">{it.sku || ''}</td>
                                <td className="py-1 align-top text-center font-bold">{it.qty || 1}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-2 text-center border-b border-dashed border-black text-gray-500">
                              Tidak ada detail produk
                            </td>
                          </tr>
                        )}
                        <tr>
                          <td colSpan={4} className="text-right py-1 pr-2 font-bold uppercase">Total Item</td>
                          <td className="text-center py-1 font-bold text-[14px]">{totalQty}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
