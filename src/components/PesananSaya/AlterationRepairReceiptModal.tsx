import React from 'react';
import { Printer, X, Download, CheckCircle2, Scissors, Wrench, Calendar, MapPin, User, Tag, Clock, Building2, Warehouse, Store, ShieldCheck, Send } from 'lucide-react';
import { ManualShipmentOrder } from '../../types';
import QRCode from 'qrcode';

interface AlterationRepairReceiptModalProps {
  order: ManualShipmentOrder;
  onClose: () => void;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const AlterationRepairReceiptModal: React.FC<AlterationRepairReceiptModalProps> = ({
  order,
  onClose,
  onShowToast,
}) => {
  const [qrCodeDataUrl, setQrCodeDataUrl] = React.useState<string>('');

  React.useEffect(() => {
    const genQr = async () => {
      try {
        const text = order.no_pesanan || order.no_transaksi_customer || 'CHOC-AR-SPK';
        const url = await QRCode.toDataURL(text, { width: 120, margin: 1 });
        setQrCodeDataUrl(url);
      } catch (e) {
        console.warn('QR Code generation error', e);
      }
    };
    genQr();
  }, [order]);

  const handlePrint = () => {
    window.print();
  };

  const formattedDate = order.created_at
    ? new Date(order.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' });

  const productName = order.items?.[0]?.nama_produk || 'Produk Pakaian';
  const sku = order.items?.[0]?.sku || '';
  const size = order.items?.[0]?.size || '-';
  const qty = order.items?.[0]?.qty || 1;

  const arData = order.alteration_repair_data;
  const sumber = arData?.sumber_barang || (order.nama_pengirim?.toLowerCase().includes('gudang') || order.nama_pengirim?.toLowerCase().includes('warehouse') ? 'warehouse' : 'store');
  const asalName = arData?.nama_asal || order.nama_pengirim || 'Store';
  const picPemohon = arData?.pic_pemohon || order.pic_store || order.submitted_by || 'PIC Pemohon';
  const picWarehouse = arData?.pic_warehouse || 'Tim Warehouse / Penjahit';
  const statusFlow = arData?.status_flow || 'diajukan';

  const stageLabelMap: Record<string, string> = {
    diajukan: '1. Diajukan (Request Baru)',
    diterima_warehouse: '2. Diterima di Gudang',
    dalam_pengerjaan: '3. Dalam Pengerjaan',
    selesai_qc: '4. Selesai QC & Perbaikan',
    siap_dikirim: '5. Siap Dikirim / Diserahkan',
    selesai: '6. Selesai (Closed)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      {/* Container Print & Preview */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto">
        
        {/* Modal Toolbar - Hidden during print */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 print:hidden shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>Surat Perintah Kerja (SPK) Alteration & Repair</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                  Internal Warehouse
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                No. SPK: <strong>{order.no_pesanan || '-'}</strong> • Sumber: {sumber === 'warehouse' ? 'Internal Gudang' : `Store (${asalName})`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak SPK</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Paper Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/60 dark:bg-slate-950/60 print:p-0 print:bg-white">
          <div 
            id="printableAlterationRepairReceipt"
            className="bg-white text-slate-900 border-2 border-slate-900 rounded-2xl p-5 sm:p-7 shadow-md max-w-xl mx-auto print:shadow-none print:border-black print:rounded-none print:max-w-none print:w-full space-y-5"
            style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}
          >
            {/* Header SPK */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-3">
              <div className="space-y-0.5">
                <div className="text-xl font-black tracking-tight text-slate-950 flex items-center gap-2">
                  <Scissors className="w-5 h-5 text-indigo-700 inline" />
                  <span>WMS WORK ORDER</span>
                </div>
                <div className="text-xs font-black uppercase tracking-wider text-indigo-700">
                  SURAT PERINTAH KERJA (SPK) ALTERATION & REPAIR
                </div>
                <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">
                  DIKERJAKAN OLEH DIVISI PERBAIKAN & PENJAHIT WAREHOUSE
                </div>
              </div>

              <div className="text-right flex flex-col items-end">
                <span className="text-[10px] font-bold text-slate-500">NO. TIKET / SPK</span>
                <span className="text-sm font-black font-mono text-slate-900 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-400">
                  {order.no_pesanan || 'AR-00000'}
                </span>
                {qrCodeDataUrl && (
                  <img src={qrCodeDataUrl} alt="QR" className="w-12 h-12 mt-1 object-contain" />
                )}
              </div>
            </div>

            {/* General Info Grid */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-slate-600">
                  <span className="font-bold text-slate-800">Asal / Sumber Barang:</span>
                </div>
                <div className="flex items-center gap-1.5 pl-1 font-extrabold text-slate-900">
                  {sumber === 'warehouse' ? (
                    <span className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 text-[11px]">
                      <Warehouse className="w-3.5 h-3.5" />
                      Ambil Stok Gudang (Order Toko: {asalName})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[11px]">
                      <Store className="w-3.5 h-3.5" />
                      Fisik dari Store: {asalName}
                    </span>
                  )}
                </div>
                {arData?.nama_customer && (
                  <div className="pt-1 text-[11px] text-slate-700">
                    <span className="text-slate-500">Customer: </span>
                    <strong className="text-slate-900">{arData.nama_customer}</strong>
                    {arData.no_hp && <span className="text-slate-500 ml-1">({arData.no_hp})</span>}
                  </div>
                )}
                {arData?.tujuan_pengembalian && (
                  <div className="text-[11px] text-slate-700">
                    <span className="text-slate-500">Tujuan Akhir: </span>
                    <span className="font-semibold text-indigo-900">
                      {arData.tujuan_pengembalian === 'customer' ? 'Kirim Langsung ke Customer' : `Kirim ke Store (${asalName})`}
                    </span>
                  </div>
                )}
                <div className="pt-1 text-[11px]">
                  <span className="text-slate-500">PIC Pemohon: </span>
                  <strong className="text-slate-900">{picPemohon}</strong>
                </div>
                <div className="text-[11px]">
                  <span className="text-slate-500">Tanggal Masuk: </span>
                  <span className="font-semibold text-slate-800">{formattedDate}</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="text-slate-600 font-bold">Target Penyelesaian:</div>
                <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-center">
                  <div className="text-[10px] font-bold text-indigo-700 uppercase flex items-center justify-center gap-1">
                    <Calendar className="w-3 h-3 text-indigo-600" />
                    Target Selesai Warehouse
                  </div>
                  <div className="text-xs font-black font-mono text-indigo-950 mt-0.5">
                    {order.perkiraan_selesai || 'Menyesuaikan Antrian'}
                  </div>
                </div>
                <div className="pt-1 text-[11px]">
                  <span className="text-slate-500">Penjahit / PIC Warehouse: </span>
                  <strong className="text-slate-900">{picWarehouse}</strong>
                </div>
                <div className="text-[11px]">
                  <span className="text-slate-500">Status Flow: </span>
                  <span className="font-bold text-indigo-700">{stageLabelMap[statusFlow] || statusFlow}</span>
                </div>
              </div>
            </div>

            {/* Product Info Block */}
            <div className="border border-slate-300 rounded-xl p-3 bg-white text-xs space-y-1.5">
              <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Nama Produk & SKU</span>
                  <span className="text-sm font-black text-slate-900">{productName}</span>
                  {sku && <span className="text-xs font-mono font-bold text-indigo-600 ml-2">[{sku}]</span>}
                </div>
                <div className="text-right">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Size / Qty</span>
                  <span className="text-xs font-black text-slate-900">Size: {size} • <strong>{qty} pcs</strong></span>
                </div>
              </div>

              <div className="text-[11px] text-slate-700 pt-0.5">
                <span className="text-slate-500 font-semibold">Kondisi Fisik Barang: </span>
                <span className="font-bold text-slate-800">{order.kondisi || 'Baik / Bersih'}</span>
              </div>
            </div>

            {/* Instruction Checklist */}
            <div className="space-y-2.5">
              <div className="text-xs font-extrabold uppercase tracking-wider text-slate-800 border-b border-slate-200 pb-1 flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-indigo-600" />
                <span>Instruksi Spesifik Pengerjaan Gudang:</span>
              </div>

              {order.alteration_detail && (
                <div className="p-2.5 rounded-xl border border-indigo-200 bg-indigo-50/50 text-xs">
                  <div className="font-black text-indigo-900 flex items-center gap-1.5 mb-1">
                    <Scissors className="w-3.5 h-3.5 text-indigo-600" />
                    <span>ALTERATION INSTRUCTIONS:</span>
                  </div>
                  <div className="font-bold text-slate-900 whitespace-pre-wrap pl-5 text-[11px] leading-relaxed">
                    {order.alteration_detail}
                  </div>
                </div>
              )}

              {order.repair_detail && (
                <div className="p-2.5 rounded-xl border border-amber-200 bg-amber-50/50 text-xs">
                  <div className="font-black text-amber-900 flex items-center gap-1.5 mb-1">
                    <Wrench className="w-3.5 h-3.5 text-amber-600" />
                    <span>REPAIR INSTRUCTIONS:</span>
                  </div>
                  <div className="font-bold text-slate-900 whitespace-pre-wrap pl-5 text-[11px] leading-relaxed">
                    {order.repair_detail}
                  </div>
                </div>
              )}

              {!order.alteration_detail && !order.repair_detail && (
                <div className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs text-slate-500 italic">
                  Tidak ada instruksi khusus tercatat. Harap konfirmasi ke PIC Pemohon ({picPemohon}).
                </div>
              )}
            </div>

            {/* QC Quality Control Checklist */}
            <div className="border border-slate-300 rounded-xl p-3 bg-slate-50/80 text-xs space-y-2">
              <div className="font-black text-slate-900 uppercase flex items-center gap-1.5 text-[11px]">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Quality Control Checklist (Wajib dicek sebelum diserahkan)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-700">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="rounded-xs text-indigo-600" />
                  <span>Kesesuaian Ukuran & Potongan</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="rounded-xs text-indigo-600" />
                  <span>Kerapian Keliman & Jahitan</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="rounded-xs text-indigo-600" />
                  <span>Fungsi Resleting / Kancing Kuat</span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" className="rounded-xs text-indigo-600" />
                  <span>Produk Bersih & Lolos QC Gudang</span>
                </label>
              </div>
            </div>

            {/* Signatures */}
            <div className="grid grid-cols-3 gap-2 text-center text-[10px] pt-4 border-t border-slate-300">
              <div className="space-y-9">
                <div className="text-slate-500 font-bold">PIC Pemohon</div>
                <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                  ({picPemohon})
                </div>
              </div>
              <div className="space-y-9">
                <div className="text-slate-500 font-bold">Penjahit / Warehouse</div>
                <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                  ({picWarehouse !== 'Tim Warehouse / Penjahit' ? picWarehouse : 'Petugas Gudang'})
                </div>
              </div>
              <div className="space-y-9">
                <div className="text-slate-500 font-bold">QC Inspector</div>
                <div className="border-t border-slate-400 pt-1 font-bold text-slate-800">
                  (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
                </div>
              </div>
            </div>

            {/* Footer Slip Note */}
            <div className="text-[9px] text-slate-400 text-center border-t border-dashed border-slate-200 pt-2">
              Dokumen Internal WMS Chocochips • Lembar SPK ditempelkan pada fisik pakaian selama proses pengerjaan di gudang
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 print:hidden shrink-0">
          <div className="text-[11px] text-slate-500">
            Cetak pada ukuran kertas A4 / A5 atau printer struk untuk ditempel pada polybag / pakaian.
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>

      </div>
    </div>
  );
};
