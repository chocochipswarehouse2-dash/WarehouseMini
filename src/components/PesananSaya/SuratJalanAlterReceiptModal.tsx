import React from 'react';
import { Printer, X, Scissors, Wrench, Building2, Warehouse, Calendar, User, Clock, CheckCircle2 } from 'lucide-react';
import { ManualShipmentOrder } from '../../types';
import QRCode from 'qrcode';

interface SuratJalanAlterReceiptModalProps {
  order: ManualShipmentOrder;
  onClose: () => void;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const SuratJalanAlterReceiptModal: React.FC<SuratJalanAlterReceiptModalProps> = ({
  order,
  onClose,
  onShowToast,
}) => {
  const [qrCodeDataUrl, setQrCodeDataUrl] = React.useState<string>('');

  React.useEffect(() => {
    const genQr = async () => {
      try {
        const text = order.no_pesanan || order.no_transaksi_customer || 'CHOC-AR-SJ';
        const url = await QRCode.toDataURL(text, { width: 90, margin: 1 });
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
    ? new Date(order.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    : new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

  const currentTimeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  const item = order.items?.[0];
  const productName = item?.nama_produk || 'Produk Pakaian';
  const sku = item?.sku || '-';
  const size = item?.size || '-';
  const qty = item?.qty || 1;

  const arData = order.alteration_repair_data;
  const storeName = arData?.nama_asal || order.nama_pengirim || 'Store Outlet';
  const picStore = arData?.pic_pemohon || arData?.pic_kirim_store || order.pic_store || order.submitted_by || 'PIC Store';
  const kurirStore = arData?.kurir_kirim_store || order.jasa_kirim || 'Kurir Toko / Ekspedisi';
  const resiStore = arData?.resi_kirim_store || '-';
  const targetSelesai = order.perkiraan_selesai || arData?.perkiraan_selesai || 'Sesuai Antrian';

  const layananLabel = 
    arData?.layanan_type === 'alteration' ? 'ALTER' :
    arData?.layanan_type === 'repair' ? 'REPAIR' : 'ALTER + REPAIR';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full max-h-[95vh] flex flex-col overflow-hidden my-auto">
        
        {/* Header Toolbar (Hidden saat print) */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Surat Jalan Kirim (Struk Rangkap 2)
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-mono">
                {order.no_pesanan} • {storeName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={handlePrint}
              className="px-3.5 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak Struk</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Area: Ukuran Thermal Struk Kasir 80mm */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-slate-100/60 dark:bg-slate-950/60 print:p-0 print:bg-white">
          <div
            id="printableSuratJalanKasir"
            className="bg-white text-slate-950 w-full max-w-[80mm] mx-auto p-3.5 border border-slate-300 print:border-none print:shadow-none print:w-[80mm] print:max-w-[80mm] space-y-4 text-[11px] leading-tight select-text shadow-sm"
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
          >
            {/* ======================================================= */}
            {/* RANGKAP 1: LEMBAR ARSIP STORE (COPY 1) */}
            {/* ======================================================= */}
            <div className="space-y-2">
              <div className="text-center space-y-0.5 border-b border-dashed border-slate-800 pb-2">
                <div className="text-base font-black tracking-wider uppercase font-sans">
                  chocochips
                </div>
                <div className="text-[10px] font-black uppercase">
                  SURAT JALAN PENGIRIMAN BARANG
                </div>
                <div className="text-[9px] font-bold bg-slate-100 border border-slate-400 px-1 py-0.5 inline-block rounded-xs mt-0.5">
                  [COPY 1: ARSIP TOKO PENGIRIM]
                </div>
              </div>

              {/* Meta Informasi */}
              <div className="space-y-1 text-[10px]">
                <div className="flex justify-between">
                  <span>No. ID Form Alter:</span>
                  <strong className="font-bold font-mono">{arData?.id_form_alter || order.no_pesanan}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Tanggal:</span>
                  <span>{formattedDate} {currentTimeStr}</span>
                </div>
                <div className="flex justify-between">
                  <span>Dari Store:</span>
                  <strong className="font-bold">{storeName}</strong>
                </div>
                <div className="flex justify-between">
                  <span>PIC Toko:</span>
                  <span>{picStore} {arData?.pic_store_phone ? `(${arData.pic_store_phone})` : ''}</span>
                </div>
                <div className="flex justify-between">
                  <span>Tujuan:</span>
                  <span className="font-bold">WAREHOUSE (ALTER & REPAIR)</span>
                </div>
                <div className="flex justify-between">
                  <span>Kurir/Ekspedisi:</span>
                  <span>{kurirStore}</span>
                </div>
                {resiStore && resiStore !== '-' && (
                  <div className="flex justify-between">
                    <span>No. Resi:</span>
                    <span>{resiStore}</span>
                  </div>
                )}
                {arData?.no_delivery_dealpos && (
                  <div className="flex justify-between text-indigo-900 font-bold bg-indigo-50 px-1 py-0.5 rounded">
                    <span>Delivery DealPOS:</span>
                    <span>{arData.no_delivery_dealpos}</span>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-slate-800 my-1" />

              {/* Rincian Produk (Support Multi-Item) */}
              <div className="space-y-1.5">
                <div className="text-[9px] font-bold uppercase text-slate-500 font-sans">
                  Daftar Pakaian ({order.items?.length || 1} Item / Total {order.items?.reduce((s, it) => s + (Number(it.qty) || 1), 0) || qty} pcs):
                </div>
                {(order.items && order.items.length > 0 ? order.items : [{ nama_produk: productName, sku, size, qty }]).map((it, idx) => (
                  <div key={idx} className="space-y-0.5 border-b border-dotted border-slate-300 pb-1 last:border-b-0">
                    <div className="flex justify-between items-start font-bold">
                      <span className="truncate pr-1">{idx + 1}. {it.nama_produk || 'Produk Pakaian'}</span>
                      <span className="shrink-0">{it.qty || 1}x</span>
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-700">
                      <span>SKU: {it.sku || '-'}</span>
                      <span>Size: {it.size || '-'}</span>
                    </div>
                    {it.layanan_type && (
                      <div className="text-[9px] text-indigo-900 font-semibold font-sans">
                        Layanan: [{it.layanan_type.toUpperCase()}]
                      </div>
                    )}
                    {(it.alteration_detail || it.repair_detail) && (
                      <div className="text-[9px] text-slate-600 bg-slate-50 p-1 rounded-xs">
                        {it.alteration_detail && <div>• Alter: {it.alteration_detail}</div>}
                        {it.repair_detail && <div>• Repair: {it.repair_detail}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Instruksi Singkat Keseluruhan (jika ada di header level) */}
              {(order.alteration_detail || order.repair_detail) && (!order.items || order.items.length <= 1) && (
                <div className="bg-slate-50 border border-slate-300 p-1.5 rounded-xs text-[9.5px] space-y-0.5 mt-1">
                  {order.alteration_detail && (
                    <div>
                      <strong>Alter: </strong>
                      <span>{order.alteration_detail}</span>
                    </div>
                  )}
                  {order.repair_detail && (
                    <div>
                      <strong>Repair: </strong>
                      <span>{order.repair_detail}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Tanda Tangan */}
              <div className="grid grid-cols-2 gap-2 text-center text-[9px] pt-3">
                <div className="space-y-6">
                  <div>Pengirim (Store)</div>
                  <div className="border-t border-slate-700 pt-0.5">
                    ({picStore})
                  </div>
                </div>
                <div className="space-y-6">
                  <div>Kurir / Driver</div>
                  <div className="border-t border-slate-700 pt-0.5">
                    (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
                  </div>
                </div>
              </div>

              <div className="text-[8.5px] text-center text-slate-500 pt-1">
                * Simpan lembar ini sebagai arsip bukti pengiriman Store
              </div>
            </div>

            {/* ======================================================= */}
            {/* GARIS PERFORASI / PEMBATAS POTONG */}
            {/* ======================================================= */}
            <div className="relative py-2.5 my-1 text-center">
              <div className="border-b-2 border-dashed border-slate-800 w-full" />
              <div className="absolute left-1/2 -top-1 -translate-x-1/2 bg-white px-2 text-[9px] font-bold uppercase tracking-wider text-slate-700 font-sans">
                ✂️ POTONG DI SINI (RANGKAP 2) ✂️
              </div>
            </div>

            {/* ======================================================= */}
            {/* RANGKAP 2: LEMBAR LAMPIRAN FISIK PRODUK (COPY 2) */}
            {/* ======================================================= */}
            <div className="space-y-2">
              <div className="text-center space-y-0.5 border-b border-dashed border-slate-800 pb-2">
                <div className="text-base font-black tracking-wider uppercase font-sans">
                  chocochips
                </div>
                <div className="text-[10px] font-black uppercase">
                  SURAT JALAN PENGIRIMAN BARANG
                </div>
                <div className="text-[9px] font-bold bg-indigo-50 border border-indigo-400 text-indigo-900 px-1.5 py-0.5 inline-block rounded-xs mt-0.5">
                  [COPY 2: LAMPIRAN PADA PRODUK KE GUDANG]
                </div>
                <div className="text-[8px] text-slate-500 font-bold">
                  *Wajib disematkan pada hanger / polybag pakaian
                </div>
              </div>

              {/* QR Code & Meta */}
              <div className="flex items-center justify-between gap-2">
                <div className="space-y-0.5 text-[10px] flex-1">
                  <div>
                    <span>ID Form Alter: </span>
                    <strong className="font-bold font-mono">{arData?.id_form_alter || order.no_pesanan}</strong>
                  </div>
                  <div>
                    <span>Store: </span>
                    <strong className="font-bold">{storeName}</strong>
                  </div>
                  {arData?.pic_store_phone && (
                    <div>
                      <span>PIC Store: </span>
                      <span>{picStore} ({arData.pic_store_phone})</span>
                    </div>
                  )}
                  {arData?.no_delivery_dealpos && (
                    <div>
                      <span>DealPOS: </span>
                      <strong className="font-mono text-indigo-900">{arData.no_delivery_dealpos}</strong>
                    </div>
                  )}
                  <div>
                    <span>Tgl Kirim: </span>
                    <span>{formattedDate}</span>
                  </div>
                  <div>
                    <span>Target: </span>
                    <strong>{targetSelesai}</strong>
                  </div>
                </div>
                {qrCodeDataUrl && (
                  <img src={qrCodeDataUrl} alt="QR" className="w-14 h-14 object-contain shrink-0" />
                )}
              </div>

              <div className="border-t border-dashed border-slate-800 my-1" />

              {/* Detail Barang (Support Multi-Item) */}
              <div className="space-y-1.5">
                <div className="text-[9px] font-bold uppercase text-slate-500 font-sans">
                  Daftar Pakaian ({order.items?.length || 1} Item / Total {order.items?.reduce((s, it) => s + (Number(it.qty) || 1), 0) || qty} pcs):
                </div>
                {(order.items && order.items.length > 0 ? order.items : [{ nama_produk: productName, sku, size, qty }]).map((it, idx) => (
                  <div key={idx} className="space-y-0.5 border-b border-dotted border-slate-300 pb-1 last:border-b-0">
                    <div className="flex justify-between items-start font-bold">
                      <span className="truncate pr-1">{idx + 1}. {it.nama_produk || 'Produk Pakaian'}</span>
                      <span className="shrink-0">{it.qty || 1}x</span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span>SKU: {it.sku || '-'}</span>
                      <span>Size: {it.size || '-'}</span>
                    </div>
                    {it.layanan_type && (
                      <div className="text-[9px] text-indigo-900 font-semibold font-sans">
                        Layanan: [{it.layanan_type.toUpperCase()}]
                      </div>
                    )}
                    {(it.alteration_detail || it.repair_detail) && (
                      <div className="text-[9px] text-slate-700 bg-slate-50 p-1 rounded-xs border border-slate-200">
                        {it.alteration_detail && <div><strong>• Alter:</strong> {it.alteration_detail}</div>}
                        {it.repair_detail && <div><strong>• Repair:</strong> {it.repair_detail}</div>}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Detail Instruksi Pengerjaan untuk Warehouse (Global level) */}
              {(order.alteration_detail || order.repair_detail) && (!order.items || order.items.length <= 1) && (
                <div className="border border-slate-800 p-1.5 rounded-xs space-y-1 bg-slate-50 text-[10px]">
                  <div className="font-bold uppercase text-[9px] border-b border-slate-300 pb-0.5 font-sans">
                    INSTRUKSI PENGERJAAN WAREHOUSE:
                  </div>
                  {order.alteration_detail && (
                    <div>
                      <strong>✂️ ALTERATION: </strong>
                      <span>{order.alteration_detail}</span>
                    </div>
                  )}
                  {order.repair_detail && (
                    <div>
                      <strong>🔧 REPAIR: </strong>
                      <span>{order.repair_detail}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Checklist Penerimaan di Warehouse */}
              <div className="border border-dashed border-slate-600 p-1.5 rounded-xs space-y-1 text-[9px]">
                <div className="font-bold uppercase text-[8.5px] font-sans">
                  VERIFIKASI PENERIMAAN WAREHOUSE:
                </div>
                <div className="grid grid-cols-2 gap-1 text-[8.5px]">
                  <div>Tgl Tiba: ___/___/___</div>
                  <div>Diterima: _____________</div>
                  <div>Penjahit: _____________</div>
                  <div>QC Pass : [  ] Lolos</div>
                </div>
              </div>

              <div className="text-[8px] text-center text-slate-500 pt-0.5">
                Dokumen Otentik WMS Chocochips • Lembar ini menyertai pakaian sampai selesai di gudang
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 print:hidden shrink-0 text-xs">
          <span className="text-[11px] text-slate-500">
            Format Struk Kasir Thermal (80mm) Rangkap 2
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 text-xs font-semibold bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
