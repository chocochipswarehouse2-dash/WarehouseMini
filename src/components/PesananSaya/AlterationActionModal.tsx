import React, { useState } from 'react';
import {
  X,
  Truck,
  PackageCheck,
  Send,
  Camera,
  Share2,
  Calendar,
  Building2,
  Warehouse,
  CheckCircle2,
  MessageSquare,
  Upload,
  User,
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { ManualShipmentOrder, AlterationFlowStage, AlterationFlowLog } from '../../types';
import { editManualShipment } from '../../services/gasManualShipment';
import { triggerOrderEmailNotifications } from '../../services/emailService';
import { sendFonnteMessage, getFonnteConfig } from '../../services/whatsapp';

export type AlterationActionType = 'mark_sent_store' | 'mark_received_warehouse' | 'complete_and_ship' | 'mark_dealpos_received';

interface AlterationActionModalProps {
  order: ManualShipmentOrder;
  actionType: AlterationActionType;
  session?: any;
  onClose: () => void;
  onSuccess: (updatedOrder: ManualShipmentOrder) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const AlterationActionModal: React.FC<AlterationActionModalProps> = ({
  order,
  actionType,
  session,
  onClose,
  onSuccess,
  onShowToast,
}) => {
  const arData = order.alteration_repair_data || {} as any;
  const storeName = arData.nama_asal || order.nama_pengirim || 'Store';
  const productName = order.items?.[0]?.nama_produk || 'Produk Pakaian';
  const sku = order.items?.[0]?.sku || '-';

  const [isLoading, setIsLoading] = useState(false);

  // Form states: Mark Sent Store
  const [tglKirimStore, setTglKirimStore] = useState(() => new Date().toISOString().slice(0, 10));
  const [kurirStore, setKurirStore] = useState(order.jasa_kirim || 'Kurir Internal Toko');
  const [resiStore, setResiStore] = useState(arData.resi_kirim_store || '');
  const [picKirimStore, setPicKirimStore] = useState(arData.pic_pemohon || order.pic_store || order.submitted_by || '');

  // Form states: Mark Received Warehouse
  const [tglTerimaWarehouse, setTglTerimaWarehouse] = useState(() => new Date().toISOString().slice(0, 10));
  const [picTerimaWarehouse, setPicTerimaWarehouse] = useState(arData.pic_warehouse || '');
  const [kondisiTerimaWarehouse, setKondisiTerimaWarehouse] = useState('Fisik lengkap & instruksi jelas');

  // Form states: Complete & Ship (Bukti Kirim)
  const [tujuanPengembalian, setTujuanPengembalian] = useState<'store' | 'customer'>(
    arData.tujuan_pengembalian || (order.nama_tujuan && !order.nama_tujuan.toLowerCase().includes('warehouse') ? 'customer' : 'store')
  );
  const [namaPenerima, setNamaPenerima] = useState(
    tujuanPengembalian === 'customer' ? (order.nama_tujuan || '') : storeName
  );
  const [noTelpPenerima, setNoTelpPenerima] = useState(
    tujuanPengembalian === 'customer' ? (order.no_telp_tujuan || '') : (order.no_telp_store || '')
  );
  const [ekspedisiKembali, setEkspedisiKembali] = useState(order.jasa_kirim || 'JNE / SiCepat / Kurir Internal');
  const [resiKembali, setResiKembali] = useState(order.no_resi || '');
  const [noDeliveryDealpos, setNoDeliveryDealpos] = useState(arData.no_delivery_dealpos || '');
  const [catatanKirimKembali, setCatatanKirimKembali] = useState('');
  const [fotoBuktiKirim, setFotoBuktiKirim] = useState<string[]>(arData.foto_bukti_kirim || []);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Form states: Mark DealPOS Received by Store
  const [picDealposReceiver, setPicDealposReceiver] = useState(
    session?.name || session?.username || arData.pic_pemohon || order.pic_store || ''
  );
  const [tglDealposReceived, setTglDealposReceived] = useState(() => new Date().toISOString().slice(0, 10));
  const [catatanDealpos, setCatatanDealpos] = useState(arData.catatan_dealpos || 'Barang diterima lengkap dan rapi');

  // Handle Photo Upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingPhoto(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        urls.push(base64);
      }
      setFotoBuktiKirim((prev) => [...prev, ...urls]);
      onShowToast(`${files.length} foto bukti kirim berhasil diupload`, 'success');
    } catch {
      onShowToast('Gagal memproses foto bukti kirim', 'error');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const existingLogs: AlterationFlowLog[] = Array.isArray(arData.flow_logs) ? [...arData.flow_logs] : [];
      let nextStage: AlterationFlowStage = arData.status_flow || 'diajukan';
      let nextOrderStatus: ManualShipmentOrder['status'] = order.status;
      let logActor = '';
      let logNotes = '';

      const updatedArData: any = { ...arData };

      if (actionType === 'mark_sent_store') {
        nextStage = 'dikirim_store';
        nextOrderStatus = 'diterima';
        logActor = picKirimStore || 'PIC Store';
        logNotes = `Barang dikirim dari Store (${storeName}) ke Warehouse via ${kurirStore} ${resiStore ? `(Resi: ${resiStore})` : ''}`;

        updatedArData.tgl_kirim_store = tglKirimStore;
        updatedArData.kurir_kirim_store = kurirStore;
        updatedArData.resi_kirim_store = resiStore;
        updatedArData.pic_kirim_store = picKirimStore;
      } else if (actionType === 'mark_received_warehouse') {
        nextStage = 'diterima_warehouse';
        nextOrderStatus = 'diterima';
        logActor = picTerimaWarehouse || 'Tim Warehouse';
        logNotes = `Barang fisik diterima di Warehouse oleh ${picTerimaWarehouse}. Kondisi: ${kondisiTerimaWarehouse}`;

        updatedArData.tgl_terima_warehouse = tglTerimaWarehouse;
        updatedArData.pic_terima_warehouse = picTerimaWarehouse;
        updatedArData.kondisi_terima_warehouse = kondisiTerimaWarehouse;
        if (!updatedArData.pic_warehouse) {
          updatedArData.pic_warehouse = picTerimaWarehouse;
        }
      } else if (actionType === 'complete_and_ship') {
        nextStage = 'dikirim_kembali';
        nextOrderStatus = 'dikirim';
        logActor = session?.name || session?.username || 'Tim Warehouse';
        logNotes = `Pengerjaan alter/repair selesai & lolos QC. Dikirim ke ${tujuanPengembalian === 'customer' ? `Customer (${namaPenerima})` : `Store (${namaPenerima})`} via ${ekspedisiKembali} ${resiKembali ? `(Resi: ${resiKembali})` : ''} ${noDeliveryDealpos ? `[DealPOS: ${noDeliveryDealpos}]` : ''}`;

        updatedArData.tujuan_pengembalian = tujuanPengembalian;
        updatedArData.nama_penerima_kembali = namaPenerima;
        updatedArData.no_telp_penerima_kembali = noTelpPenerima;
        updatedArData.tgl_kirim_kembali = new Date().toISOString().slice(0, 10);
        updatedArData.ekspedisi_kembali = ekspedisiKembali;
        updatedArData.resi_kembali = resiKembali;
        if (noDeliveryDealpos.trim()) {
          updatedArData.no_delivery_dealpos = noDeliveryDealpos.trim();
          updatedArData.tgl_delivery_dealpos = new Date().toISOString().slice(0, 10);
        }
        updatedArData.foto_bukti_kirim = fotoBuktiKirim;
        updatedArData.catatan_kirim_kembali = catatanKirimKembali;
      } else if (actionType === 'mark_dealpos_received') {
        nextStage = 'selesai';
        nextOrderStatus = 'selesai';
        logActor = picDealposReceiver || session?.name || session?.username || 'PIC Store';
        logNotes = `Barang fisik telah DITERIMA (Received) di Store (${storeName}) oleh ${logActor}. Delivery DealPOS: ${noDeliveryDealpos || arData.no_delivery_dealpos || '-'}`;

        updatedArData.status_dealpos_received = true;
        updatedArData.pic_dealpos_receiver = logActor;
        updatedArData.tgl_dealpos_received = tglDealposReceived || new Date().toISOString();
        if (noDeliveryDealpos.trim()) {
          updatedArData.no_delivery_dealpos = noDeliveryDealpos.trim();
        }
        if (catatanDealpos.trim()) {
          updatedArData.catatan_dealpos = catatanDealpos.trim();
        }
      }

      // Append new flow log
      existingLogs.push({
        id: `flow-${Date.now()}`,
        stage: nextStage,
        timestamp: new Date().toISOString(),
        actor_name: logActor,
        notes: logNotes,
      });

      updatedArData.status_flow = nextStage;
      updatedArData.flow_logs = existingLogs;

      const updatedOrder: ManualShipmentOrder = {
        ...order,
        status: nextOrderStatus,
        no_resi: resiKembali || order.no_resi,
        jasa_kirim: ekspedisiKembali || order.jasa_kirim,
        alteration_repair_data: updatedArData,
      };

      const res = await editManualShipment(updatedOrder);
      if (res.success) {
        onShowToast(`Berhasil memperbarui status alur: ${logNotes}`, 'success');

        // Notifikasi WA (Fonnte) ke Store Penginput
        const storePhone = (order.no_telp_store || '').trim();
        if (storePhone) {
          const fonnteCfg = getFonnteConfig();
          let waStatusMsg = '';
          if (actionType === 'mark_received_warehouse') {
            waStatusMsg = `📦 *UPDATE STATUS: PAKET DITERIMA GUDANG PUSAT*\n--------------------------------------------\nHalo Tim *${storeName}*,\nPaket alterasi dengan No. Tiket *${order.no_pesanan}* telah DITERIMA oleh tim Warehouse (${picTerimaWarehouse}).\n\n👗 *Produk:* ${productName} (${sku})\n📋 *Kondisi:* ${kondisiTerimaWarehouse}\n\nStatus saat ini: *Diterima & Siap Masuk Antrean Pengerjaan*.\n_Chocochips Official Boutique_`;
          } else if (actionType === 'complete_and_ship') {
            waStatusMsg = `🚚 *UPDATE STATUS: PESANAN ALTERASI TELAH DIKIRIM*\n--------------------------------------------\nHalo Tim *${storeName}*,\nPengerjaan alterasi untuk No. Tiket *${order.no_pesanan}* telah SELESAI dan diserahkan ke pihak ekspedisi.\n\n👗 *Produk:* ${productName} (${sku})\n🚚 *Ekspedisi:* ${ekspedisiKembali}\n📦 *No. Resi:* *${resiKembali || '-'}*\n📍 *Tujuan:* ${tujuanPengembalian === 'customer' ? `Customer (${namaPenerima})` : `Store (${namaPenerima})`}\n\nSilakan infokan nomor resi ini kepada customer terkait jika diperlukan.\n_Chocochips Official Boutique_`;
          }

          if (waStatusMsg && fonnteCfg.token) {
            sendFonnteMessage(storePhone, waStatusMsg, fonnteCfg.token)
              .then((r) => {
                if (r.success) {
                  console.log(`[WA] Notif status ${actionType} terkirim ke store:`, storePhone);
                }
              })
              .catch((err) => console.warn('WA status notice error:', err));
          }
        }

        // Notifikasi Email (Chocochips Official) ke PIC Store & Customer jika dilampirkan
        if (actionType === 'mark_received_warehouse') {
          triggerOrderEmailNotifications(updatedOrder, 'status_diterima', kondisiTerimaWarehouse)
            .catch((err) => console.warn('Email status_diterima notice error:', err));
        } else if (actionType === 'complete_and_ship') {
          triggerOrderEmailNotifications(updatedOrder, 'status_dikirim', catatanKirimKembali)
            .catch((err) => console.warn('Email status_dikirim notice error:', err));
        }

        onSuccess(updatedOrder);
        onClose();
      } else {
        onShowToast(res.message || 'Gagal menyimpan update', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Terjadi kesalahan sistem', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  // Helper kirim WA pemberitahuan pengiriman
  const handleSendWaNotification = () => {
    const phone = (noTelpPenerima || '').replace(/\D/g, '');
    const cleanPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone.startsWith('62') ? phone : '62' + phone;

    const noTiket = order.no_pesanan || '-';
    const eksp = ekspedisiKembali || 'Ekspedisi';
    const resi = resiKembali || '(Menunggu Update)';
    const targetLabel = tujuanPengembalian === 'customer' ? namaPenerima : `Tim Store ${storeName}`;

    const text = encodeURIComponent(
`Halo Kak *${targetLabel}*! ✨
Pemberitahuan dari *Warehouse Chocochips*:

Produk Alteration & Repair berikut telah SELESAI dikerjakan & lolos QC:
🔖 *No. Tiket:* *${noTiket}*
👗 *Produk:* ${productName} (${sku})
🚚 *Ekspedisi:* ${eksp}
📦 *No. Resi:* *${resi}*
📍 *Tujuan:* ${tujuanPengembalian === 'customer' ? 'Alamat Customer' : `Store ${storeName}`}

${catatanKirimKembali ? `📝 *Catatan:* ${catatanKirimKembali}\n` : ''}Produk saat ini sedang dalam perjalanan pengiriman kembali. Terima kasih atas kerja samanya! ✨🙏`
    );

    if (cleanPhone.length >= 9) {
      window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
    } else {
      navigator.clipboard.writeText(decodeURIComponent(text));
      onShowToast('Nomor HP tidak terdeteksi. Template pesan WA disalin ke clipboard!', 'info');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full max-h-[92vh] flex flex-col overflow-hidden my-auto">
        
        {/* Header Modal */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl text-white ${
              actionType === 'mark_sent_store' ? 'bg-blue-600' :
              actionType === 'mark_received_warehouse' ? 'bg-indigo-600' :
              actionType === 'complete_and_ship' ? 'bg-emerald-600' : 'bg-teal-600'
            }`}>
              {actionType === 'mark_sent_store' && <Truck className="w-4 h-4" />}
              {actionType === 'mark_received_warehouse' && <PackageCheck className="w-4 h-4" />}
              {actionType === 'complete_and_ship' && <Send className="w-4 h-4" />}
              {actionType === 'mark_dealpos_received' && <ShieldCheck className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {actionType === 'mark_sent_store' && 'Tandai Produk Sudah Dikirim oleh Store'}
                {actionType === 'mark_received_warehouse' && 'Tandai Produk Diterima di Warehouse'}
                {actionType === 'complete_and_ship' && 'Produk Selesai & Kirim Bukti Pengiriman'}
                {actionType === 'mark_dealpos_received' && 'Konfirmasi Diterima di Store (DealPOS Received)'}
              </h3>
              <p className="text-[11px] text-slate-500 font-mono">
                No. Tiket: {order.no_pesanan} • {productName}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs flex-1">
          {/* Ringkasan Barang */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 flex items-center justify-between gap-2">
            <div>
              <div className="font-bold text-slate-900 dark:text-white">{productName}</div>
              <div className="text-[11px] text-slate-500">
                SKU: {sku} • Toko: <strong>{storeName}</strong>
              </div>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {arData.layanan_type?.toUpperCase() || 'ALTER & REPAIR'}
            </span>
          </div>

          {/* ======================================================= */}
          {/* AKSI 1: TANDAI DIKIRIM STORE */}
          {/* ======================================================= */}
          {actionType === 'mark_sent_store' && (
            <div className="space-y-3">
              <div className="p-3 bg-blue-50/60 dark:bg-blue-950/30 rounded-xl border border-blue-200 dark:border-blue-800 text-[11px] text-blue-900 dark:text-blue-200">
                Konfirmasikan bahwa pakaian dari Store telah diserahkan ke kurir/ekspedisi untuk dikirim ke Warehouse Pusat.
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Kirim:
                  </label>
                  <input
                    type="date"
                    required
                    value={tglKirimStore || ''}
                    onChange={(e) => setTglKirimStore(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    PIC Store Pengirim:
                  </label>
                  <input
                    type="text"
                    required
                    value={picKirimStore || ''}
                    onChange={(e) => setPicKirimStore(e.target.value)}
                    placeholder="Nama PIC Store..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Kurir / Jasa Ekspedisi Pengantar:
                </label>
                <input
                  type="text"
                  required
                  value={kurirStore || ''}
                  onChange={(e) => setKurirStore(e.target.value)}
                  placeholder="Contoh: Kurir Internal Store / Lalamove / GrabExpress / JNE..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  No. Resi / Catatan Kurir (Opsional):
                </label>
                <input
                  type="text"
                  value={resiStore || ''}
                  onChange={(e) => setResiStore(e.target.value)}
                  placeholder="Nomor resi tracking pengiriman jika ada..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                />
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* AKSI 2: TANDAI DITERIMA DI WAREHOUSE */}
          {/* ======================================================= */}
          {actionType === 'mark_received_warehouse' && (
            <div className="space-y-3">
              <div className="p-3 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-900 dark:text-indigo-200">
                Konfirmasikan bahwa fisik pakaian telah tiba dan diterima oleh Tim Gudang untuk segera diproses perbaikan.
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Tiba Gudang:
                  </label>
                  <input
                    type="date"
                    required
                    value={tglTerimaWarehouse || ''}
                    onChange={(e) => setTglTerimaWarehouse(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Petugas Warehouse Penerima:
                  </label>
                  <input
                    type="text"
                    required
                    value={picTerimaWarehouse || ''}
                    onChange={(e) => setPicTerimaWarehouse(e.target.value)}
                    placeholder="Nama petugas gudang..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Kondisi Fisik Saat Diterima di Gudang:
                </label>
                <input
                  type="text"
                  value={kondisiTerimaWarehouse || ''}
                  onChange={(e) => setKondisiTerimaWarehouse(e.target.value)}
                  placeholder="Contoh: Lengkap, keliman lepas sesuai instruksi, pakaian bersih..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                />
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* AKSI 3: PRODUK SELESAI & BUKTI PENGIRIMAN */}
          {/* ======================================================= */}
          {actionType === 'complete_and_ship' && (
            <div className="space-y-3">
              <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Pengerjaan Alteration & Repair telah selesai & lolos QC. Masukkan bukti kirim untuk menyelesaikan flow.</span>
              </div>

              {/* Pilihan Tujuan */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tujuan Pengiriman Produk:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTujuanPengembalian('store');
                      setNamaPenerima(storeName);
                      setNoTelpPenerima(order.no_telp_store || '');
                    }}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer font-bold ${
                      tujuanPengembalian === 'store'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    🏬 Kirim ke Store Terkait
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setTujuanPengembalian('customer');
                      setNamaPenerima(order.nama_tujuan || '');
                      setNoTelpPenerima(order.no_telp_tujuan || '');
                    }}
                    className={`p-2 rounded-xl border text-center transition-all cursor-pointer font-bold ${
                      tujuanPengembalian === 'customer'
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    }`}
                  >
                    👤 Kirim Langsung ke Customer
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                    Nama Penerima:
                  </label>
                  <input
                    type="text"
                    required
                    value={namaPenerima || ''}
                    onChange={(e) => setNamaPenerima(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                    No. HP / WA Penerima:
                  </label>
                  <input
                    type="text"
                    value={noTelpPenerima || ''}
                    onChange={(e) => setNoTelpPenerima(e.target.value)}
                    placeholder="0812..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                    Ekspedisi / Kurir:
                  </label>
                  <input
                    type="text"
                    required
                    value={ekspedisiKembali || ''}
                    onChange={(e) => setEkspedisiKembali(e.target.value)}
                    placeholder="JNE / SiCepat / Gosend / Kurir Internal..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                    No. Resi Pengiriman:
                  </label>
                  <input
                    type="text"
                    required
                    value={resiKembali || ''}
                    onChange={(e) => setResiKembali(e.target.value)}
                    placeholder="Nomor resi pengiriman..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold"
                  />
                </div>
              </div>

              {tujuanPengembalian === 'store' && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                    No. Delivery DealPOS to Store (Diisi Admin Warehouse):
                  </label>
                  <input
                    type="text"
                    value={noDeliveryDealpos || ''}
                    onChange={(e) => setNoDeliveryDealpos(e.target.value)}
                    placeholder="Contoh: DP-DELIV-2026-001 / No transfer DealPOS..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Nomor ini akan digunakan oleh PIC Store untuk konfirmasi penerimaan (received).
                  </p>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                  Catatan Pengiriman / Hasil Pengerjaan:
                </label>
                <textarea
                  rows={2}
                  value={catatanKirimKembali || ''}
                  onChange={(e) => setCatatanKirimKembali(e.target.value)}
                  placeholder="Contoh: Sudah selesai diperbaiki rapi, kancing terpasang kuat, packing polybag aman..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs resize-none"
                />
              </div>

              {/* Upload Bukti Kirim */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Upload Bukti Kirim (Foto Resi / Foto Paket):
                </label>
                <div className="flex items-center gap-2">
                  <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
                    <Camera className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Upload Foto Bukti Kirim</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                  {isUploadingPhoto && <span className="text-slate-400">Memproses foto...</span>}
                </div>

                {fotoBuktiKirim.length > 0 && (
                  <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1">
                    {fotoBuktiKirim.map((fUrl, fIdx) => (
                      <div key={fIdx} className="relative group shrink-0">
                        <img
                          src={fUrl}
                          alt=""
                          className="w-12 h-12 object-cover rounded-lg border border-slate-300"
                        />
                        <button
                          type="button"
                          onClick={() => setFotoBuktiKirim((prev) => prev.filter((_, i) => i !== fIdx))}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ======================================================= */}
          {/* AKSI 4: KONFIRMASI DITERIMA DI STORE (DEALPOS RECEIVED) */}
          {/* ======================================================= */}
          {actionType === 'mark_dealpos_received' && (
            <div className="space-y-3">
              <div className="p-3 bg-teal-50/70 dark:bg-teal-950/40 rounded-xl border border-teal-200 dark:border-teal-800 text-[11px] text-teal-900 dark:text-teal-200 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-600 shrink-0" />
                <span>
                  Konfirmasikan bahwa barang fisik yang dikirim oleh Warehouse telah <strong>DITERIMA LENGKAP (RECEIVED)</strong> oleh PIC Store.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  No. Delivery DealPOS:
                </label>
                <input
                  type="text"
                  value={noDeliveryDealpos || arData.no_delivery_dealpos || ''}
                  onChange={(e) => setNoDeliveryDealpos(e.target.value)}
                  placeholder="Nomor Delivery DealPOS dari Warehouse..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    PIC Store Penerima *:
                  </label>
                  <input
                    type="text"
                    required
                    value={picDealposReceiver || ''}
                    onChange={(e) => setPicDealposReceiver(e.target.value)}
                    placeholder="Nama PIC Toko..."
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tanggal Diterima:
                  </label>
                  <input
                    type="date"
                    required
                    value={tglDealposReceived || ''}
                    onChange={(e) => setTglDealposReceived(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan Kondisi Barang Saat Diterima:
                </label>
                <input
                  type="text"
                  value={catatanDealpos || ''}
                  onChange={(e) => setCatatanDealpos(e.target.value)}
                  placeholder="Contoh: Fisik pakaian rapi, hasil alter pas, hangtag lengkap..."
                  className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
            {actionType === 'complete_and_ship' ? (
              <button
                type="button"
                onClick={handleSendWaNotification}
                className="px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-800 rounded-xl flex items-center gap-1.5 cursor-pointer"
                title="Kirim pemberitahuan WA ke Store / Customer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Kirim WA Pemberitahuan</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Menyimpan...' : 'Konfirmasi & Simpan'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
