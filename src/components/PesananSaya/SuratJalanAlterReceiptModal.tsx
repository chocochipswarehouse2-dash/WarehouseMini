import React, { useState } from 'react';
import { Printer, X, Scissors, Wrench, Building2, Warehouse, Calendar, User, Clock, CheckCircle2, MessageCircle, Send, Copy, Loader2, Save, ExternalLink, AlertTriangle, ShieldCheck } from 'lucide-react';
import { ManualShipmentOrder } from '../../types';
import QRCode from 'qrcode';
import { sendFonnteMessage, getFonnteConfig, normalizeWhatsAppNumber } from '../../services/whatsapp';
import { resolveOrderSourceStore, getStoreContact, saveStoreContact, getFullStoreName } from '../../services/gasManualShipment';

interface SuratJalanAlterReceiptModalProps {
  order?: ManualShipmentOrder | null;
  orders?: ManualShipmentOrder[];
  initialTab?: 'receipt' | 'wa';
  onClose: () => void;
  onShowToast?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const SuratJalanAlterReceiptModal: React.FC<SuratJalanAlterReceiptModalProps> = ({
  order,
  orders,
  initialTab = 'receipt',
  onClose,
  onShowToast,
}) => {
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'receipt' | 'wa'>(initialTab);
  const [isSendingWa, setIsSendingWa] = useState(false);
  const [selectedOrderIdx, setSelectedOrderIdx] = useState(0);

  const orderList = React.useMemo(() => {
    if (orders && orders.length > 0) return orders;
    if (order) return [order];
    return [];
  }, [order, orders]);

  const activeOrder = orderList[selectedOrderIdx] || orderList[0];
  const sourceInfo = React.useMemo(() => {
    if (!activeOrder) return null;
    return resolveOrderSourceStore(activeOrder);
  }, [activeOrder]);

  const [editablePhone, setEditablePhone] = useState(sourceInfo?.phone || '');
  const [editablePic, setEditablePic] = useState(sourceInfo?.pic || '');
  const [phoneSaved, setPhoneSaved] = useState(false);

  React.useEffect(() => {
    if (sourceInfo) {
      setEditablePhone(sourceInfo.phone || '');
      setEditablePic(sourceInfo.pic || '');
      setPhoneSaved(false);
    }
  }, [sourceInfo, selectedOrderIdx]);

  React.useEffect(() => {
    const genQrs = async () => {
      const map: Record<string, string> = {};
      for (const ord of orderList) {
        try {
          const text = ord.no_pesanan || ord.no_transaksi_customer || 'CHOC-AR-SJ';
          const url = await QRCode.toDataURL(text, { width: 90, margin: 1 });
          map[ord.no_pesanan || (ord as any).id || text] = url;
        } catch (e) {
          console.warn('QR Code generation error', e);
        }
      }
      setQrMap(map);
    };
    if (orderList.length > 0) {
      genQrs();
    }
  }, [orderList]);

  const handlePrint = () => {
    window.print();
  };

  const currentTimeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  if (orderList.length === 0) return null;

  const firstOrder = orderList[0];
  const firstSourceInfo = resolveOrderSourceStore(firstOrder);
  const firstStoreName = firstSourceInfo.sourceStoreName || firstOrder.nama_pengirim || 'Store Outlet';

  // Format pesan WhatsApp untuk order tertentu
  const generateWaMessage = (ord: ManualShipmentOrder, targetPhone: string) => {
    const sInfo = resolveOrderSourceStore(ord);
    const arData = ord.alteration_repair_data;
    const targetStore = sInfo.sourceStoreName;
    const requesterStore = sInfo.requesterStoreName;

    const itemsText = (ord.items || []).map((it, idx) => {
      const fulText = it.fulfillment ? ` (Ambil dari: ${it.fulfillment})` : '';
      const alterText = it.needs_alteration || it.id_form_alter || it.alteration_detail
        ? `\n     ✂️ *Instruksi Alter:* ${it.alteration_detail || it.layanan_type || 'Perlu Alterasi'}`
        : '';
      return `  ${idx + 1}. *${it.sku || '-'}* - ${it.nama_produk} (Size: *${it.size || '-'}*) - *${it.qty || 1} pcs*${fulText}${alterText}`;
    }).join('\n');

    return `📦 *PERMINTAAN PENGIRIMAN PRODUK (STORE ➔ WAREHOUSE)*
--------------------------------------------------
Halo Tim *${targetStore}*,
Terdapat pesanan di mana produk diambil dari Store Anda dan wajib dikirimkan ke Gudang Pusat Chocochips:

📋 *Rincian Pesanan:*
• *Order ID / No. Pesanan:* ${ord.no_transaksi_customer || ord.no_pesanan}
• *Store Pemohon:* ${requesterStore} (PIC: ${ord.pic_store || arData?.pic_pemohon || '-'})
• *Customer Tujuan Akhir:* ${ord.nama_tujuan || '-'}
• *Waktu Permintaan:* ${new Date().toLocaleString('id-ID')}

👕 *Daftar Produk yang Wajib Dikirim ke Gudang:*
${itemsText || '  1. Produk Pakaian Pesanan'}

🚚 *Tujuan Pengiriman:* WAREHOUSE CHOCOCHIPS (Gudang Pusat)
📄 *Dokumen Wajib:* Mohon cetak *Surat Jalan Kirim (Struk Rangkap 2)* di sistem WMS:
   - Lembar 1: Simpan sebagai arsip bukti pengiriman toko Anda
   - Lembar 2: Lampirkan pada fisik pakaian / polybag yang dikirim ke gudang.

Mohon segera diproses dan kirimkan fisik barang ke gudang. Terima kasih!
_WMS Warehouse System_`;
  };

  const handleSaveContact = () => {
    if (!sourceInfo?.sourceStoreName || !editablePhone) return;
    saveStoreContact(sourceInfo.sourceStoreName, editablePhone, editablePic);
    setPhoneSaved(true);
    if (onShowToast) {
      onShowToast(`Nomor WA resmi ${sourceInfo.sourceStoreName} berhasil disimpan ke Direktori Kontak Store!`, 'success');
    }
    setTimeout(() => setPhoneSaved(false), 2500);
  };

  const handleOpenWaWeb = (ord: ManualShipmentOrder) => {
    const sInfo = resolveOrderSourceStore(ord);
    const phoneToUse = editablePhone || sInfo.phone;
    if (!phoneToUse) {
      if (onShowToast) onShowToast('Nomor WhatsApp store belum terisi!', 'warning');
      return;
    }
    const cleanPhone = normalizeWhatsAppNumber(phoneToUse);
    const msg = generateWaMessage(ord, phoneToUse);
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    if (onShowToast) {
      onShowToast(`Membuka WhatsApp ke Tim Store ${sInfo.sourceStoreName}...`, 'info');
    }
  };

  const handleCopyWaText = (ord: ManualShipmentOrder) => {
    const sInfo = resolveOrderSourceStore(ord);
    const msg = generateWaMessage(ord, editablePhone || sInfo.phone);
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(msg);
      if (onShowToast) {
        onShowToast('Format pesan notifikasi WA store berhasil disalin ke clipboard!', 'success');
      }
    }
  };

  // Kirim via Fonnte API
  const handleSendWaFonnte = async () => {
    setIsSendingWa(true);
    const fonnteCfg = getFonnteConfig();
    let sentSuccess = 0;
    let fallbackText = '';

    for (const ord of orderList) {
      const sInfo = resolveOrderSourceStore(ord);
      const phone = editablePhone || sInfo.phone;
      const waMsg = generateWaMessage(ord, phone);
      fallbackText = waMsg;

      if (fonnteCfg.token && phone) {
        try {
          const res = await sendFonnteMessage(phone, waMsg, fonnteCfg.token);
          if (res.success) sentSuccess++;
        } catch (e) {
          console.warn('Fonnte send error:', e);
        }
      }
    }

    setIsSendingWa(false);

    if (sentSuccess > 0) {
      if (onShowToast) {
        onShowToast(`✅ Notifikasi permintaan kirim berhasil terkirim ke WA Store via Fonnte (${sentSuccess} pesan)!`, 'success');
      }
    } else {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        navigator.clipboard.writeText(fallbackText);
      }
      if (onShowToast) {
        onShowToast('📋 Format notifikasi disalin ke clipboard (Fonnte API token belum dikonfigurasi / nomor tidak aktif)', 'info');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printableSuratJalanKasir, #printableSuratJalanKasir * {
            visibility: visible !important;
          }
          #printableSuratJalanKasir {
            position: absolute !important;
            left: 0 !important;
            right: 0 !important;
            top: 0 !important;
            width: 80mm !important;
            max-width: 80mm !important;
            margin: 0 auto !important;
            padding: 2mm !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            z-index: 999999 !important;
          }
          .receipt-page-break {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full max-h-[95vh] flex flex-col overflow-hidden my-auto">
        
        {/* Header Toolbar (Hidden saat print) */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 print:hidden shrink-0">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold ${
              activeTab === 'wa' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            }`}>
              {activeTab === 'wa' ? <MessageCircle className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                {activeTab === 'wa' ? 'Notifikasi WA Permintaan Kirim' : 'Surat Jalan Kirim (Struk Rangkap 2)'}
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-500 font-mono">
                {orderList.length > 1 ? `${orderList.length} Pesanan Terpilih` : firstOrder.no_pesanan} • {firstStoreName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Tab Toggles */}
            <div className="inline-flex p-0.5 bg-slate-200/80 dark:bg-slate-800 rounded-lg text-xs font-bold mr-1">
              <button
                type="button"
                onClick={() => setActiveTab('receipt')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer ${
                  activeTab === 'receipt'
                    ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                Struk 80mm
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('wa')}
                className={`px-2.5 py-1 rounded-md transition-all cursor-pointer flex items-center gap-1 ${
                  activeTab === 'wa'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <MessageCircle className="w-3 h-3 text-emerald-500" />
                <span>Notif WA</span>
              </button>
            </div>

            {activeTab === 'receipt' && (
              <button
                type="button"
                onClick={handlePrint}
                className="px-3.5 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak {orderList.length > 1 ? `(${orderList.length})` : 'Struk'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* TAB 1: PANEL NOTIFIKASI WHATSAPP STORE */}
        {activeTab === 'wa' && (
          <div className="flex-1 overflow-y-auto p-4 sm:p-5 bg-slate-50 dark:bg-slate-950 space-y-4 print:hidden text-xs">
            {/* Multi-Order Selector jika ada banyak order */}
            {orderList.length > 1 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                <span className="text-[11px] font-bold text-slate-500 shrink-0">Pilih Pesanan:</span>
                {orderList.map((ord, idx) => (
                  <button
                    key={ord.no_pesanan || idx}
                    type="button"
                    onClick={() => setSelectedOrderIdx(idx)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold transition-all shrink-0 cursor-pointer ${
                      selectedOrderIdx === idx
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    {ord.no_pesanan}
                  </button>
                ))}
              </div>
            )}

            {/* Kotak Info Identifikasi Toko & Sumber Barang */}
            <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2.5 shadow-2xs">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold">
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Toko Target Penerima WA</div>
                    <div className="text-sm font-black text-slate-900 dark:text-white">
                      {sourceInfo?.sourceStoreName || 'Store Outlet'}
                    </div>
                  </div>
                </div>
                {sourceInfo?.isInterStoreFulfillment && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 text-[10px] font-bold border border-amber-300 dark:border-amber-700">
                    Inter-Store Fulfillment
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Toko Pemohon (Requester):</div>
                  <div className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {sourceInfo?.requesterStoreName || '-'}
                  </div>
                </div>
                <div className="bg-slate-50 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Tujuan Pengiriman:</div>
                  <div className="font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                    WAREHOUSE (Gudang Pusat)
                  </div>
                </div>
              </div>

              {sourceInfo?.isInterStoreFulfillment && (
                <div className="p-2 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded-lg text-[10.5px] text-amber-900 dark:text-amber-200 leading-relaxed flex items-start gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <strong>Skema Ambil Toko Lain:</strong> Pesanan diminta oleh <strong>{sourceInfo.requesterStoreName}</strong>, namun fisik barang diambil dari <strong>{sourceInfo.sourceStoreName}</strong>. Notifikasi WhatsApp ini ditujukan ke tim <strong>{sourceInfo.sourceStoreName}</strong> agar segera mengirimkan produk ke Warehouse.
                  </div>
                </div>
              )}
            </div>

            {/* Input Form Kontak WhatsApp Toko Sumber */}
            <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Kontak WhatsApp Toko {sourceInfo?.sourceStoreName}</span>
                </label>
                <button
                  type="button"
                  onClick={handleSaveContact}
                  className="px-2.5 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-300 dark:border-emerald-700 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                  title="Simpan nomor ini ke Master Direktori Kontak Store"
                >
                  <Save className="w-3 h-3" />
                  <span>{phoneSaved ? 'Tersimpan!' : 'Simpan ke Master'}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-slate-500 mb-1 font-medium">Nomor WhatsApp Store:</div>
                  <input
                    type="text"
                    value={editablePhone}
                    onChange={(e) => setEditablePhone(e.target.value)}
                    placeholder="0812xxxxxxxx"
                    className="w-full px-3 py-1.5 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 mb-1 font-medium">Nama PIC Store:</div>
                  <input
                    type="text"
                    value={editablePic}
                    onChange={(e) => setEditablePic(e.target.value)}
                    placeholder="Tim Store..."
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
                <span>💡</span>
                <span>Nomor kontak diambil dari Direktori Kontak Store Resmi Chocochips. Perubahan nomor dapat disimpan permanen.</span>
              </div>
            </div>

            {/* Preview Teks Format Pesan WhatsApp */}
            <div className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl space-y-2 shadow-2xs">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Pratinjau Pesan WhatsApp ({activeOrder.no_pesanan}):
                </span>
                <button
                  type="button"
                  onClick={() => handleCopyWaText(activeOrder)}
                  className="px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 bg-slate-100 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>Salin Teks</span>
                </button>
              </div>

              <div className="p-3 bg-slate-100/80 dark:bg-slate-950 font-mono text-[11px] text-slate-800 dark:text-slate-200 rounded-lg whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto border border-slate-200/80 dark:border-slate-800 select-all">
                {generateWaMessage(activeOrder, editablePhone)}
              </div>
            </div>

            {/* Tombol Aksi Pengiriman WhatsApp */}
            <div className="pt-1 flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => handleOpenWaWeb(activeOrder)}
                className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Buka Chat WhatsApp (wa.me)</span>
              </button>

              <button
                type="button"
                disabled={isSendingWa}
                onClick={handleSendWaFonnte}
                className="py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer disabled:opacity-50"
                title="Kirim otomatis ke nomor store melalui integrasi Fonnte WhatsApp API"
              >
                {isSendingWa ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                <span>Kirim via Fonnte API</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 2: PRINTABLE AREA STRUK KASIR 80MM */}
        {activeTab === 'receipt' && (
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-slate-100/60 dark:bg-slate-950/60 print:p-0 print:bg-white">
          <div
            id="printableSuratJalanKasir"
            className="bg-white text-slate-950 w-full max-w-[80mm] mx-auto p-3.5 border border-slate-300 print:border-none print:shadow-none print:w-[80mm] print:max-w-[80mm] space-y-6 text-[11px] leading-tight select-text shadow-sm"
            style={{ fontFamily: "'Courier New', Courier, monospace" }}
          >
            {orderList.map((ord, oIndex) => {
              const formattedDate = ord.created_at
                ? new Date(ord.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                : new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });

              const arData = ord.alteration_repair_data;
              const sInfo = resolveOrderSourceStore(ord);
              const senderStore = sInfo.requesterStoreName || ord.nama_pengirim || 'Store Outlet';
              const sourceStore = sInfo.sourceStoreName || arData?.nama_asal || senderStore;
              const picStore = sInfo.pic || arData?.pic_pemohon || arData?.pic_kirim_store || ord.pic_store || ord.submitted_by || 'PIC Store';
              const kurirStore = arData?.kurir_kirim_store || ord.jasa_kirim || 'Kurir Toko / Ekspedisi';
              const resiStore = arData?.resi_kirim_store || ord.no_resi || '-';
              const ordQr = qrMap[ord.no_pesanan || (ord as any).id || ''] || '';

              const item = ord.items?.[0];
              const productName = item?.nama_produk || 'Produk Pakaian';
              const sku = item?.sku || '-';
              const size = item?.size || '-';
              const qty = item?.qty || 1;

              // Deteksi apakah ada item yang diambil dari store lain
              const differentFulfillments = Array.from(new Set(
                (ord.items || [])
                  .map(it => it.fulfillment)
                  .filter(f => f && f.toLowerCase() !== 'marketplace' && f.toLowerCase() !== 'gudang' && f.toLowerCase() !== senderStore.toLowerCase())
              ));

              return (
                <div key={ord.no_pesanan || oIndex} className={`space-y-4 ${oIndex < orderList.length - 1 ? 'receipt-page-break pb-6 border-b-2 border-slate-400 print:border-none' : ''}`}>
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
                      <div className="text-[8.5px] font-bold text-slate-700 uppercase font-sans">
                        [PENGIRIMAN FISIK STORE ➔ WAREHOUSE]
                      </div>
                      <div className="text-[9px] font-bold bg-slate-100 border border-slate-400 px-1 py-0.5 inline-block rounded-xs mt-0.5">
                        [COPY 1: ARSIP TOKO PENGIRIM]
                      </div>
                    </div>

                    {/* Meta Informasi */}
                    <div className="space-y-1 text-[10px]">
                      <div className="flex justify-between">
                        <span>No. Pesanan:</span>
                        <strong className="font-bold font-mono">{ord.no_pesanan}</strong>
                      </div>
                      {arData?.id_form_alter && (
                        <div className="flex justify-between">
                          <span>No. ID Form Alter:</span>
                          <strong className="font-bold font-mono">{arData.id_form_alter}</strong>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>Tanggal:</span>
                        <span>{formattedDate} {currentTimeStr}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Dari Store (Sumber):</span>
                        <strong className="font-bold">{sourceStore}</strong>
                      </div>
                      {differentFulfillments.length > 0 && (
                        <div className="flex justify-between text-[9px] text-indigo-900 bg-indigo-50 px-1 py-0.5 rounded">
                          <span>Ambil dari Store:</span>
                          <strong>{differentFulfillments.join(', ')}</strong>
                        </div>
                      )}
                      {senderStore !== sourceStore && (
                        <div className="flex justify-between">
                          <span>Store Pemohon:</span>
                          <span>{senderStore}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span>PIC Toko:</span>
                        <span>{picStore} {arData?.pic_store_phone ? `(${arData.pic_store_phone})` : ''}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Tujuan:</span>
                        <span className="font-bold">WAREHOUSE (GUDANG PUSAT)</span>
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
                        Daftar Pakaian Kirim ({ord.items?.length || 1} Item / Total {ord.items?.reduce((s, it) => s + (Number(it.qty) || 1), 0) || qty} pcs):
                      </div>
                      {(ord.items && ord.items.length > 0 ? ord.items : [{ nama_produk: productName, sku, size, qty }]).map((it, idx) => (
                        <div key={idx} className="space-y-0.5 border-b border-dotted border-slate-300 pb-1 last:border-b-0">
                          <div className="flex justify-between items-start font-bold">
                            <span className="truncate pr-1">{idx + 1}. {it.nama_produk || 'Produk Pakaian'}</span>
                            <span className="shrink-0">{it.qty || 1}x</span>
                          </div>
                          <div className="flex justify-between text-[10px] text-slate-700">
                            <span>SKU: {it.sku || '-'}</span>
                            <span>Size: {it.size || '-'}</span>
                          </div>
                          {it.fulfillment && (
                            <div className="text-[9px] text-slate-600">
                              Ambil dari: <strong>{it.fulfillment}</strong>
                            </div>
                          )}
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
                    {(ord.alteration_detail || ord.repair_detail) && (!ord.items || ord.items.length <= 1) && (
                      <div className="bg-slate-50 border border-slate-300 p-1.5 rounded-xs text-[9.5px] space-y-0.5 mt-1">
                        {ord.alteration_detail && (
                          <div>
                            <strong>Alter: </strong>
                            <span>{ord.alteration_detail}</span>
                          </div>
                        )}
                        {ord.repair_detail && (
                          <div>
                            <strong>Repair: </strong>
                            <span>{ord.repair_detail}</span>
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
                      * Simpan lembar ini sebagai arsip bukti pengiriman Store ke Gudang
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
                      <div className="text-[8.5px] font-bold text-indigo-900 uppercase font-sans">
                        [PENGIRIMAN FISIK STORE ➔ WAREHOUSE]
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
                          <span>No. Pesanan: </span>
                          <strong className="font-bold font-mono">{ord.no_pesanan}</strong>
                        </div>
                        {arData?.id_form_alter && (
                          <div>
                            <span>ID Form Alter: </span>
                            <strong className="font-bold font-mono">{arData.id_form_alter}</strong>
                          </div>
                        )}
                        <div>
                          <span>Store Asal: </span>
                          <strong className="font-bold">{sourceStore}</strong>
                        </div>
                        {differentFulfillments.length > 0 && (
                          <div className="text-[9px] text-indigo-900 font-semibold">
                            Ambil dari: {differentFulfillments.join(', ')}
                          </div>
                        )}
                        {senderStore !== sourceStore && (
                          <div>
                            <span>Store Pemohon: </span>
                            <span>{senderStore}</span>
                          </div>
                        )}
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
                      {ordQr && (
                        <img src={ordQr} alt="QR" className="w-14 h-14 object-contain shrink-0" />
                      )}
                    </div>

                    <div className="border-t border-dashed border-slate-800 my-1" />

                    {/* Detail Barang (Support Multi-Item) */}
                    <div className="space-y-1.5">
                      <div className="text-[9px] font-bold uppercase text-slate-500 font-sans">
                        Daftar Pakaian Kirim ({ord.items?.length || 1} Item / Total {ord.items?.reduce((s, it) => s + (Number(it.qty) || 1), 0) || qty} pcs):
                      </div>
                      {(ord.items && ord.items.length > 0 ? ord.items : [{ nama_produk: productName, sku, size, qty }]).map((it, idx) => (
                        <div key={idx} className="space-y-0.5 border-b border-dotted border-slate-300 pb-1 last:border-b-0">
                          <div className="flex justify-between items-start font-bold">
                            <span className="truncate pr-1">{idx + 1}. {it.nama_produk || 'Produk Pakaian'}</span>
                            <span className="shrink-0">{it.qty || 1}x</span>
                          </div>
                          <div className="flex justify-between text-[10px]">
                            <span>SKU: {it.sku || '-'}</span>
                            <span>Size: {it.size || '-'}</span>
                          </div>
                          {it.fulfillment && (
                            <div className="text-[9px] text-slate-600">
                              Ambil dari: <strong>{it.fulfillment}</strong>
                            </div>
                          )}
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
                    {(ord.alteration_detail || ord.repair_detail) && (!ord.items || ord.items.length <= 1) && (
                      <div className="bg-slate-50 border border-slate-300 p-1.5 rounded-xs text-[9.5px] space-y-0.5">
                        {ord.alteration_detail && (
                          <div>
                            <strong>✂️ ALTER: </strong>
                            <span>{ord.alteration_detail}</span>
                          </div>
                        )}
                        {ord.repair_detail && (
                          <div>
                            <strong>🔧 REPAIR: </strong>
                            <span>{ord.repair_detail}</span>
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
                      Dokumen Otentik WMS Chocochips • Lembar ini menyertai pakaian dari Store sampai tiba di Gudang
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 print:hidden shrink-0 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-slate-500">
              Format Struk Kasir Thermal (80mm) Rangkap 2
            </span>
          </div>
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
