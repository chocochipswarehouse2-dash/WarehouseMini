import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package, Search, Plus, Trash2, Send, RefreshCw, Printer, AlertTriangle, Check, CheckCircle2, FileText, ChevronDown, QrCode, ShoppingBag, X, MapPin, Truck, History, Calendar, User, ArrowLeft, Copy, Clock, MessageCircle, ExternalLink, Store, FileCheck, Layers, AlertOctagon, RotateCcw, Ban, SendHorizonal, Scissors, Sparkles, Camera, Image as ImageIcon, Upload, Eye, Loader2, Mail
} from 'lucide-react';
import { AlterationCameraModal } from './AlterationCameraModal';
import { PhotoLightboxModal } from './PhotoLightboxModal';
import { CancelOrderModal } from './CancelOrderModal';
import { compressImage } from '../../utils/imageCompressor';
import { uploadImageToGdrive } from '../../services/gdriveUpload';
import { triggerOrderEmailNotifications } from '../../services/emailService';
import { ProductItem, UserSession, ManualShipmentOrder, ManualShipmentItem } from '../../types';
import { hasPermission, isSuperadmin } from '../../services/permissions';
import { PhysicalScanInput } from '../PhysicalScanInput';
import { AlterationRepairTab } from './AlterationRepairTab';
import { AlterationRepairReceiptModal } from './AlterationRepairReceiptModal';
import { SuratJalanAlterReceiptModal } from './SuratJalanAlterReceiptModal';
import { AlterationActionModal, AlterationActionType } from './AlterationActionModal';
import { BulkUpdateResiModal } from './BulkUpdateResiModal';
import {
  fetchOutlets,
  fetchManualShipments,
  submitManualShipment,
  updateShipmentStatus,
  updateShipmentResi,
  deleteManualShipment,
  fetchJasaKirimList,
  editManualShipment,
  updateItemSjDealpos,
  bulkUpdateOrderSjDealpos,
  markItemSoldAndProcess,
  restoreSoldItem,
  getFullStoreName,
  DEFAULT_OUTLETS,
} from '../../services/gasManualShipment';
import { clearDeltaSyncCache } from '../../services/gasSync';
import { sendFonnteMessage, getFonnteConfig } from '../../services/whatsapp';
import { supabaseFetch } from '../../services/supabase';
import QRCode from 'qrcode';
import {
  generateCustomerTransactionNumber,
  generateManualShipmentOrderId,
  isTransactionNumberUnique,
  getStoreCode,
  generateShortOrderId,
} from '../../utils/transactionGenerator';
import { getUserPersonName, formatOperatorWithPersonName } from '../../utils/userResolver';

interface ManualShipmentViewProps {
  session: UserSession | null;
  productCatalog: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const ManualShipmentTab: React.FC<ManualShipmentViewProps> = ({
  session,
  productCatalog,
  onShowToast,
}) => {
  const userIsAdmin = isSuperadmin(session);
  const canAction = userIsAdmin || hasPermission(session, 'tab_ops_pesanan_manual_shipment');

  const [activeTab, setActiveTab] = useState<'form' | 'alteration_repair' | 'rekap'>('form');
  const [filterOrderType, setFilterOrderType] = useState<'all' | 'manual_shipment' | 'manual_with_alter' | 'alteration_repair'>('all');
  const [filterAlterStatus, setFilterAlterStatus] = useState<'all' | 'manual_with_alter' | 'all_alter' | 'no_alter'>('all');
  const [isBulkResiModalOpen, setIsBulkResiModalOpen] = useState(false);
  const [arReceiptOrder, setArReceiptOrder] = useState<ManualShipmentOrder | null>(null);
  const [sjAlterModalOrder, setSjAlterModalOrder] = useState<ManualShipmentOrder | null>(null);
  const [alterActionData, setAlterActionData] = useState<{
    order: ManualShipmentOrder;
    actionType: AlterationActionType;
  } | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'card'>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'card' : 'table');
  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState<{ nama: string; fulfillment: string }[]>([]);

  // Deteksi Store pengguna berdasarkan session login (Central Park, La Vela, dll.)
  const userAssignedStore = useMemo(() => {
    if (!session || userIsAdmin) return '';
    const userDiv = (session.divisi || '').toLowerCase().trim();
    const userName = (session.name || '').toLowerCase().trim();
    const userUname = (session.username || '').toLowerCase().trim();

    // OVERRIDE KHUSUS: chococpj di-set ke Gaia Pontianak sesuai request user
    if (userUname === 'chococpj') {
      return 'Gaia Pontianak';
    }

    // List outlets untuk pencocokan
    const allOutlets = outlets.length > 0 ? outlets : DEFAULT_OUTLETS;
    const match = allOutlets.find((o) => {
      const oName = o.nama.toLowerCase().trim();
      return (
        userDiv === oName ||
        userDiv.includes(oName) ||
        oName.includes(userDiv) ||
        userName === oName ||
        userName.includes(oName) ||
        userUname === oName ||
        userUname.includes(oName) ||
        // Cocokkan juga dengan kode outlet (misal: 'chococpj' -> 'cpj')
        ('kode' in o && o.kode && (userUname.includes((o as any).kode.toLowerCase()) || userDiv.includes((o as any).kode.toLowerCase())))
      );
    });

    return match ? match.nama : '';
  }, [session, outlets, userIsAdmin]);
  const [jasaKirimList, setJasaKirimList] = useState<string[]>([]);
  const [orders, setOrders] = useState<ManualShipmentOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterStore, setFilterStore] = useState<string>('all');
  const [filterDealposSj, setFilterDealposSj] = useState<'all' | 'need_sj' | 'has_sj'>('all');
  // Modal Quick Input No SJ DealPOS
  const [sjModalData, setSjModalData] = useState<{
    order: ManualShipmentOrder;
    item?: ManualShipmentItem;
    noSj: string;
    applyToAllMarketplace: boolean;
  } | null>(null);
  const [copiedSj, setCopiedSj] = useState<string | null>(null);

  // Modal Khusus Penanganan Barang Sold Out (Marketplace)
  const [soldModalData, setSoldModalData] = useState<{
    order: ManualShipmentOrder;
    item: ManualShipmentItem;
    resolution: 'mark_only' | 'partial_fulfill' | 'cancel_order';
    note: string;
    sendWaToStore: boolean;
  } | null>(null);

  // Status Filter: Tambahkan filter opsi status barang sold
  const [filterSoldStatus, setFilterSoldStatus] = useState<'all' | 'has_sold'>('all');
  const [filterJasaKirim, setFilterJasaKirim] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const [selectedOrderDetails, setSelectedOrderDetails] = useState<ManualShipmentOrder | null>(null);
  const [editingOrder, setEditingOrder] = useState<ManualShipmentOrder | null>(null);

  // Modal WhatsApp Template untuk PIC Store kirim ke Customer
  const [waModalOrder, setWaModalOrder] = useState<ManualShipmentOrder | null>(null);
  const [copiedResi, setCopiedResi] = useState<string | null>(null);
  const [copiedUpdateMsg, setCopiedUpdateMsg] = useState<boolean>(false);

  // Modal Konfirmasi & Salin Pesan Pembaruan (Diff Log)
  const [updateSuccessModal, setUpdateSuccessModal] = useState<{
    order: ManualShipmentOrder;
    message: string;
    changes: string[];
  } | null>(null);

  // Camera & Photo State untuk Alterasi Store (Disimpan di Google Drive)
  const [cameraModalItem, setCameraModalItem] = useState<{ id: string; nama_produk: string; id_form_alter?: string } | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const [uploadingItemIds, setUploadingItemIds] = useState<Record<string, boolean>>({});
  const [uploadProgressText, setUploadProgressText] = useState<Record<string, string>>({});
  const [isSendingAlterWa, setIsSendingAlterWa] = useState<boolean>(false);

  // Modal Pembatalan Pesanan (Simpan Histori & Alasan)
  const [cancelModalOrder, setCancelModalOrder] = useState<ManualShipmentOrder | null>(null);
  const [isSubmittingCancel, setIsSubmittingCancel] = useState<boolean>(false);

  // Helper Clipboard dengan fallback aman
  const copyToClipboard = async (text: string, successMsg: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        onShowToast(successMsg, 'success');
        return true;
      }
    } catch (err) {
      console.warn('Clipboard writeText failed, fallback to textarea:', err);
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) {
        onShowToast(successMsg, 'success');
        return true;
      }
    } catch (e) {
      console.warn('Fallback copy failed:', e);
    }
    onShowToast('Gagal menyalin teks.', 'error');
    return false;
  };

  const getCleanCustomerPhone = (phone?: string): string => {
    if (!phone) return '';
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1);
    } else if (clean.startsWith('8')) {
      clean = '62' + clean;
    }
    return clean;
  };

  const generateCustomerWaTemplate = (order: ManualShipmentOrder): string => {
    const storeName = order.nama_pengirim || 'Chocochips Store';
    const customerName = order.nama_tujuan || 'Kakak';
    const jasaKirim = order.jasa_kirim || 'Ekspedisi';
    const noResi = order.no_resi || '(Menunggu Update Resi Gudang)';
    const dealposArr = Array.isArray(order.no_transaksi_pengirim)
      ? order.no_transaksi_pengirim.filter(Boolean)
      : (order.no_transaksi_pengirim ? [order.no_transaksi_pengirim] : []);
    const noTrans = dealposArr.length > 0
      ? dealposArr.join(', ')
      : (order.no_transaksi_customer || order.no_pesanan || '-');

    const alterItems = (order.items || []).filter(
      (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail
    );

    let itemsList = '';
    if (order.items && order.items.length > 0) {
      itemsList = order.items.map((it, idx) => {
        const sizeStr = it.size && it.size !== 'ALL' && it.size !== '-' ? ` (${it.size})` : '';
        const alterText = (it.needs_alteration || it.id_form_alter || it.alteration_detail)
          ? `\n     ✂️ _Permintaan Alter: ${it.alteration_detail || 'Sesuai catatan'}_`
          : '';
        return `  ${idx + 1}. *${it.nama_produk}*${sizeStr} - ${it.qty || 1} pcs${alterText}`;
      }).join('\n');
    }

    const hasResi = !!(order.no_resi && order.no_resi.trim());
    const statusNote = hasResi
      ? `Paket pesanan Kakak telah selesai disiapkan dan diserahkan ke kurir *${jasaKirim}* dengan No. Resi: *${noResi}*.`
      : `Pesanan Kakak saat ini sedang dalam proses penyiapan & pengerjaan teliti oleh tim workshop kami.`;

    const contactNote = order.no_telp_store ? `\n\n💬 *Kontak Follow Up Toko:*\nStore: *${storeName}*\nNo. Telp / WA: *${order.no_telp_store}*` : '';

    return `Halo Kak *${customerName}*! ✨
Terima kasih banyak telah berbelanja di *${storeName}*.

${statusNote}

📋 *Rincian Pesanan:*
• *No. Pesanan / Transaksi:* ${noTrans}
• *Store Pengirim:* ${storeName}
• *Ekspedisi:* ${jasaKirim}
${hasResi ? `• 🔖 *No. Resi:* *${noResi}*\n` : ''}• *Alamat Pengiriman:* ${order.alamat_tujuan || '-'}

📦 *Daftar Produk:*
${itemsList || '  - (Rincian produk terlampir)'}
${order.notes_paket ? `\n📝 *Catatan Paket:* ${order.notes_paket}` : ''}${contactNote}

Jika Kakak memiliki pertanyaan atau membutuhkan bantuan seputar pesanan maupun alterasi, silakan langsung menghubungi tim store kami. Terima kasih banyak atas kepercayaan Kakak! 🙏🌸`;
  };

  /**
   * Helper: Format Pesan Surat Perintah Kerja (SPK) Alterasi untuk WhatsApp (Store & Tim Penjahit Gudang)
   */
  const formatAlterationWorkOrderWaMessage = (order: ManualShipmentOrder): string => {
    const alterItems = (order.items || []).filter(
      (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail
    );
    if (alterItems.length === 0) return '';

    const dealposStr = Array.isArray(order.no_transaksi_pengirim)
      ? order.no_transaksi_pengirim.join(', ')
      : (order.no_transaksi_pengirim || '-');

    const itemsList = alterItems.map((it, idx) => {
      const alterId = it.id_form_alter || 'ALT-AUTO';
      const photos = it.foto_urls || [];
      const photoText = photos.length > 0
        ? `\n     📸 *Foto Panduan (Google Drive):*\n` + photos.map((u, i) => `       ${i + 1}. ${u}`).join('\n')
        : '';

      return `*${idx + 1}. [ID ALTER: ${alterId}]*
   • Produk: *${it.nama_produk}* (SKU: \`${it.sku || '-'}\`, Size: *${it.size || '-'}*)
   • Qty: *${it.qty || 1} pcs* | Fulfilment: *${it.fulfillment || 'Store'}*
   • Layanan: *${it.layanan_type || 'Alteration'}*
   • ✂️ *Instruksi Penjahit:*
     _${it.alteration_detail || 'Sesuai instruksi store'}_${photoText}`;
    }).join('\n\n');

    return `✂️ *SURAT PERINTAH KERJA (SPK) ALTERASI PAKAIAN*
--------------------------------------------------
Halo Tim Gudang & Penjahit, terdapat permintaan alterasi pakaian dari store:

📋 *Informasi Pesanan:*
• *Order ID / No. Pesanan:* ${order.no_transaksi_customer || order.no_pesanan}
• *Store Pengirim:* ${order.nama_pengirim} (PIC: ${order.pic_store || '-'})
• *No. HP Store:* ${order.no_telp_store || '-'}
• *No. DealPOS:* ${dealposStr}
• *Penerima / Customer:* ${order.nama_tujuan || '-'}
• *Waktu Registrasi:* ${new Date().toLocaleString('id-ID')}

✂️ *Rincian Item Alterasi (${alterItems.length} Item):*
${itemsList}

📝 *Catatan Paket:* ${order.notes_paket || '-'}

Mohon tim penjahit segera memeriksa detail instruksi & foto panduan terlampir.
Terima kasih!
_WMS Warehouse & Tailor Management System_`;
  };

  /**
   * Action Handler: Kirim notifikasi WA Alterasi via Fonnte langsung
   */
  const handleSendAlterWaFonnte = async (order: ManualShipmentOrder) => {
    const alterItems = (order.items || []).filter(
      (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail
    );
    if (alterItems.length === 0) {
      onShowToast('Tidak ada item alterasi pada pesanan ini', 'info');
      return;
    }

    const cfg = getFonnteConfig();
    if (!cfg.token) {
      onShowToast('Token Fonnte belum diatur. Silakan atur di menu Pengaturan > WhatsApp.', 'error');
      return;
    }

    const msg = formatAlterationWorkOrderWaMessage(order);
    setIsSendingAlterWa(true);

    try {
      let sentCount = 0;
      let errors: string[] = [];

      // 1. Kirim ke Store Pengirim
      if (order.no_telp_store && order.no_telp_store.trim()) {
        const resStore = await sendFonnteMessage(order.no_telp_store, msg, cfg.token);
        if (resStore.success) {
          sentCount++;
        } else {
          errors.push(`Store: ${resStore.message}`);
        }
      }

      // 2. Kirim ke Group Target Gudang / Penjahit
      if (cfg.groupTarget && cfg.groupTarget.trim()) {
        const resGroup = await sendFonnteMessage(cfg.groupTarget, msg, cfg.token);
        if (resGroup.success) {
          sentCount++;
        } else {
          errors.push(`Grup: ${resGroup.message}`);
        }
      }

      if (sentCount > 0) {
        onShowToast(`✅ SPK Alterasi berhasil dikirim ke ${sentCount} tujuan WhatsApp via Fonnte!`, 'success');
      } else {
        onShowToast(`Gagal kirim via Fonnte: ${errors.join(', ') || 'Periksa nomor & kuota'}`, 'error');
      }
    } catch (err: any) {
      onShowToast(`Error kirim Fonnte: ${err?.message || 'Koneksi gagal'}`, 'error');
    } finally {
      setIsSendingAlterWa(false);
    }
  };

  /**
   * Helper Cerdas: Deteksi seluruh poin perubahan data (Diff Summary)
   * Mendeteksi: Ganti produk, ganti qty, ganti fulfilment, ganti alamat, ekspedisi, dll.
   */
  const generateOrderUpdateDiff = (oldOrder: ManualShipmentOrder, newOrder: ManualShipmentOrder): string[] => {
    const changes: string[] = [];

    // 1. Data Penerima & Alamat
    if ((oldOrder.alamat_tujuan || '').trim() !== (newOrder.alamat_tujuan || '').trim()) {
      changes.push(`📍 *Alamat Pengiriman Diubah:*
    • Semula: ${oldOrder.alamat_tujuan || '(Kosong)'}
    • Menjadi: *${newOrder.alamat_tujuan || '(Kosong)'}*`);
    }

    if ((oldOrder.nama_tujuan || '').trim() !== (newOrder.nama_tujuan || '').trim()) {
      changes.push(`👤 *Nama Penerima:* ${oldOrder.nama_tujuan || '-'} ➡️ *${newOrder.nama_tujuan || '-'}*`);
    }

    if ((oldOrder.no_telp_tujuan || '').trim() !== (newOrder.no_telp_tujuan || '').trim()) {
      changes.push(`📱 *No. Telp Penerima:* ${oldOrder.no_telp_tujuan || '-'} ➡️ *${newOrder.no_telp_tujuan || '-'}*`);
    }

    // 2. Ekspedisi / Jasa Kirim & DealPOS
    if ((oldOrder.jasa_kirim || '').trim() !== (newOrder.jasa_kirim || '').trim()) {
      changes.push(`🚚 *Jasa Kirim / Ekspedisi:* ${oldOrder.jasa_kirim || '-'} ➡️ *${newOrder.jasa_kirim || '-'}*`);
    }

    const oldDealpos = Array.isArray(oldOrder.no_transaksi_pengirim)
      ? oldOrder.no_transaksi_pengirim.join(', ')
      : (oldOrder.no_transaksi_pengirim || '');
    const newDealpos = Array.isArray(newOrder.no_transaksi_pengirim)
      ? newOrder.no_transaksi_pengirim.join(', ')
      : (newOrder.no_transaksi_pengirim || '');
    if (oldDealpos.trim() !== newDealpos.trim()) {
      changes.push(`🏷️ *No. Transaksi DealPOS:* ${oldDealpos || '-'} ➡️ *${newDealpos || '-'}*`);
    }

    if ((oldOrder.notes_paket || '').trim() !== (newOrder.notes_paket || '').trim()) {
      changes.push(`📝 *Catatan Paket:* ${oldOrder.notes_paket || '(Kosong)'} ➡️ *${newOrder.notes_paket || '(Kosong)'}*`);
    }

    if ((oldOrder.pic_store || '').trim() !== (newOrder.pic_store || '').trim()) {
      changes.push(`👨‍💼 *PIC Store:* ${oldOrder.pic_store || '-'} ➡️ *${newOrder.pic_store || '-'}*`);
    }

    if (oldOrder.status !== newOrder.status) {
      changes.push(`📊 *Status Pesanan:* ${oldOrder.status} ➡️ *${newOrder.status}*`);
    }

    if ((oldOrder.no_resi || '').trim() !== (newOrder.no_resi || '').trim()) {
      changes.push(`📦 *No. Resi:* ${oldOrder.no_resi || '(Belum Ada)'} ➡️ *${newOrder.no_resi || '(Belum Ada)'}*`);
    }

    // 3. Perubahan Produk, Qty, dan Fulfilment
    const oldItems = oldOrder.items || [];
    const newItems = newOrder.items || [];

    const matchedOldIdx = new Set<number>();
    const matchedNewIdx = new Set<number>();

    // Step A: Match by id
    oldItems.forEach((oldIt, oIdx) => {
      if (!oldIt.id) return;
      const nIdx = newItems.findIndex((newIt, idx) => !matchedNewIdx.has(idx) && newIt.id === oldIt.id);
      if (nIdx !== -1) {
        matchedOldIdx.add(oIdx);
        matchedNewIdx.add(nIdx);
        const newIt = newItems[nIdx];

        const oldSku = (oldIt.sku || '').trim().toUpperCase();
        const newSku = (newIt.sku || '').trim().toUpperCase();
        const oldName = (oldIt.nama_produk || '').trim();
        const newName = (newIt.nama_produk || '').trim();

        if (oldSku !== newSku || oldName !== newName) {
          changes.push(`🔄 *Produk Diganti:*
    • Semula: *${oldIt.sku || '-'}* (${oldIt.nama_produk}) [Qty: ${oldIt.qty} pcs, Fulfilment: ${oldIt.fulfillment || 'Gudang'}]
    • Menjadi: *${newIt.sku || '-'}* (${newIt.nama_produk}) [Qty: ${newIt.qty} pcs, Fulfilment: ${newIt.fulfillment || 'Gudang'}]`);
        } else {
          if (Number(oldIt.qty) !== Number(newIt.qty)) {
            changes.push(`🔢 *Perubahan Qty [${newIt.sku || newIt.nama_produk}]:* ${oldIt.qty} pcs ➡️ *${newIt.qty} pcs*`);
          }
          if ((oldIt.fulfillment || '').trim().toLowerCase() !== (newIt.fulfillment || '').trim().toLowerCase()) {
            changes.push(`🏢 *Perubahan Fulfilment [${newIt.sku || newIt.nama_produk}]:* "${oldIt.fulfillment || 'Gudang'}" ➡️ *"${newIt.fulfillment || 'Gudang'}"*`);
          }
          if ((oldIt.size || '').trim() !== (newIt.size || '').trim()) {
            changes.push(`📏 *Perubahan Size [${newIt.sku || newIt.nama_produk}]:* ${oldIt.size || '-'} ➡️ *${newIt.size || '-'}*`);
          }
        }
      }
    });

    // Step B: Match remaining by SKU
    oldItems.forEach((oldIt, oIdx) => {
      if (matchedOldIdx.has(oIdx)) return;
      const nIdx = newItems.findIndex((newIt, idx) =>
        !matchedNewIdx.has(idx) &&
        oldIt.sku &&
        newIt.sku &&
        oldIt.sku.trim().toUpperCase() === newIt.sku.trim().toUpperCase()
      );
      if (nIdx !== -1) {
        matchedOldIdx.add(oIdx);
        matchedNewIdx.add(nIdx);
        const newIt = newItems[nIdx];
        if (Number(oldIt.qty) !== Number(newIt.qty)) {
          changes.push(`🔢 *Perubahan Qty [${newIt.sku}]:* ${oldIt.qty} pcs ➡️ *${newIt.qty} pcs*`);
        }
        if ((oldIt.fulfillment || '').trim().toLowerCase() !== (newIt.fulfillment || '').trim().toLowerCase()) {
          changes.push(`🏢 *Perubahan Fulfilment [${newIt.sku}]:* "${oldIt.fulfillment || 'Gudang'}" ➡️ *"${newIt.fulfillment || 'Gudang'}"*`);
        }
        if ((oldIt.size || '').trim() !== (newIt.size || '').trim()) {
          changes.push(`📏 *Perubahan Size [${newIt.sku}]:* ${oldIt.size || '-'} ➡️ *${newIt.size || '-'}*`);
        }
      }
    });

    // Step C: If equal unmatched count 1-on-1, detect as swap
    const unmatchedOld = oldItems.filter((_, idx) => !matchedOldIdx.has(idx));
    const unmatchedNew = newItems.filter((_, idx) => !matchedNewIdx.has(idx));

    if (unmatchedOld.length === 1 && unmatchedNew.length === 1) {
      const oldIt = unmatchedOld[0];
      const newIt = unmatchedNew[0];
      changes.push(`🔄 *Produk Diganti:*
    • Semula: *${oldIt.sku || '-'}* (${oldIt.nama_produk}) [Qty: ${oldIt.qty} pcs, Fulfilment: ${oldIt.fulfillment || 'Gudang'}]
    • Menjadi: *${newIt.sku || '-'}* (${newIt.nama_produk}) [Qty: ${newIt.qty} pcs, Fulfilment: ${newIt.fulfillment || 'Gudang'}]`);
    } else {
      unmatchedOld.forEach((oldIt) => {
        changes.push(`❌ *Hapus Produk:* *${oldIt.sku || '-'}* (${oldIt.nama_produk}) — Qty: ${oldIt.qty} pcs, Fulfilment: ${oldIt.fulfillment || 'Gudang'}`);
      });
      unmatchedNew.forEach((newIt) => {
        changes.push(`➕ *Tambah Produk Baru:* *${newIt.sku || '-'}* (${newIt.nama_produk}) — Qty: *${newIt.qty} pcs*, Fulfilment: *${newIt.fulfillment || 'Gudang'}*`);
      });
    }

    if (changes.length === 0) {
      changes.push(`ℹ️ Konfirmasi pembaruan data pesanan (tanpa perbedaan nilai field utama).`);
    }

    return changes;
  };

  /**
   * Format Pesan WhatsApp Pembaruan Pesanan (Sangat Lengkap & Jelas)
   */
  const formatOrderUpdateMessage = (
    oldOrder: ManualShipmentOrder,
    newOrder: ManualShipmentOrder,
    changes: string[],
    editorName: string
  ): string => {
    const dealposStr = Array.isArray(newOrder.no_transaksi_pengirim)
      ? newOrder.no_transaksi_pengirim.join(', ')
      : (newOrder.no_transaksi_pengirim || '-');

    const totalQty = (newOrder.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    const orderId = newOrder.no_transaksi_customer || newOrder.no_pesanan || '-';

    const itemsListStr = (newOrder.items || [])
      .map((it, idx) => {
        const sizeStr = it.size && it.size !== 'ALL' && it.size !== '-' ? ` | Size: ${it.size}` : '';
        const fulStr = it.fulfillment ? ` | Fulfilment: *${it.fulfillment}*` : '';
        return `  ${idx + 1}. *${it.sku || '-'}* - ${it.nama_produk} (Qty: *${it.qty} pcs*${sizeStr}${fulStr})`;
      })
      .join('\n');

    const changesText = changes.map((c) => `• ${c}`).join('\n');

    return `✏️ *PEMBARUAN DATA PESANAN MANUAL SHIPMENT*
--------------------------------------------
Halo Tim *${newOrder.nama_pengirim}*, terdapat pembaruan data pada pesanan manual shipment di sistem WMS Gudang:

📌 *INFORMASI PESANAN:*
• *Order ID / No. Pesanan:* ${orderId}
• *Store Pengirim:* ${newOrder.nama_pengirim} (PIC: ${newOrder.pic_store || '-'})
• *No. DealPOS:* ${dealposStr}
• *Diperbarui Oleh:* ${editorName}
• *Waktu Update:* ${new Date().toLocaleString('id-ID')}

🔄 *POIN-POIN PERUBAHAN DATA:*
${changesText}

📋 *RINCIAN LENGKAP PESANAN TERKINI (FINAL STATE):*
• *Nama Penerima:* ${newOrder.nama_tujuan}
• *No. Telp Customer:* ${newOrder.no_telp_tujuan || '-'}
• *Alamat Pengiriman:* ${newOrder.alamat_tujuan || '-'}
• *Jasa Kirim:* ${newOrder.jasa_kirim || '-'}
• *No. Resi:* ${newOrder.no_resi || 'Menunggu Resi'}
• *Status Pesanan:* ${newOrder.status || 'diterima'}

📦 *Daftar Produk Akhir (${totalQty} Pcs):*
${itemsListStr}
${newOrder.notes_paket ? `\n📝 *Catatan Paket:* ${newOrder.notes_paket}` : ''}

⚠️ *MOHON DICEK KEMBALI:*
Silakan periksa kembali rincian pembaruan di atas untuk memastikan kesesuaian fisik dan sistem. Jika terdapat pertanyaan atau perubahan lanjutan, segera hubungi Tim Admin Gudang sebelum paket diproses kirim.

Terima kasih!
_WMS Warehouse System_`;
  };

  /**
   * Format Rincian Lengkap Pesanan (Full Summary WA)
   */
  const formatOrderFullSummary = (order: ManualShipmentOrder): string => {
    const dealposStr = Array.isArray(order.no_transaksi_pengirim)
      ? order.no_transaksi_pengirim.join(', ')
      : (order.no_transaksi_pengirim || '-');

    const totalQty = (order.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    const orderId = order.no_transaksi_customer || order.no_pesanan || '-';

    const itemsListStr = (order.items || [])
      .map((it, idx) => {
        const sizeStr = it.size && it.size !== 'ALL' && it.size !== '-' ? ` | Size: ${it.size}` : '';
        const fulStr = it.fulfillment ? ` | Fulfilment: *${it.fulfillment}*` : '';
        return `  ${idx + 1}. *${it.sku || '-'}* - ${it.nama_produk} (Qty: *${it.qty} pcs*${sizeStr}${fulStr})`;
      })
      .join('\n');

    return `📦 *RINCIAN PESANAN MANUAL SHIPMENT*
--------------------------------------------
• *Order ID / No. Pesanan:* ${orderId}
• *Store Pengirim:* ${order.nama_pengirim} (PIC: ${order.pic_store || '-'})
• *No. DealPOS:* ${dealposStr}
• *Jasa Kirim:* ${order.jasa_kirim || '-'}
• *No. Resi:* ${order.no_resi || 'Menunggu Resi'}
• *Status:* ${order.status || 'diterima'}

👤 *Data Penerima (Customer):*
• *Nama Tujuan:* ${order.nama_tujuan}
• *No. Telp:* ${order.no_telp_tujuan || '-'}
• *Alamat:* ${order.alamat_tujuan || '-'}

📦 *Daftar Produk (${totalQty} Pcs):*
${itemsListStr}
${order.notes_paket ? `\n📝 *Catatan Paket:* ${order.notes_paket}` : ''}

_WMS Warehouse System_`;
  };
  const [printPayload, setPrintPayload] = useState<{
    mode: 'LABEL' | 'PICKING' | 'ALTER_WORK_ORDER';
    orders: ManualShipmentOrder[];
    qrMap: Record<string, string>;
    timestamp: number;
  } | null>(null);

  // Auto-trigger window.print saat payload cetak siap
  useEffect(() => {
    if (!printPayload) return;
    const timer = setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.warn('Window print direct error:', err);
        alert('Gagal memunculkan dialog cetak. Jika Anda menggunakan iframe preview, silakan buka aplikasi ini di tab baru (Open in New Tab).');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [printPayload?.timestamp]);

  // Form State - langsung terisi Order ID Manual Shipment unik anti-collision
  const [pengirim, setPengirim] = useState('');
  const [picStore, setPicStore] = useState('');
  const [telpPengirim, setTelpPengirim] = useState('');
  const [emailStore, setEmailStore] = useState('');
  const [transPengirim, setTransPengirim] = useState('');
  
  // Pilihan Jasa Kirim (Database outlet kolom C row 2)
  const [jasaKirim, setJasaKirim] = useState('');
  const [customJasaKirim, setCustomJasaKirim] = useState('');
  const [isCustomJasaKirim, setIsCustomJasaKirim] = useState(false);
  const [loadingJasaKirim, setLoadingJasaKirim] = useState(false);

  const [tujuan, setTujuan] = useState('');
  const [telpTujuan, setTelpTujuan] = useState('');
  const [emailCustomer, setEmailCustomer] = useState('');
  const [alamatTujuan, setAlamatTujuan] = useState('');
  const [notesPaket, setNotesPaket] = useState('');
  const [transCustomer, setTransCustomer] = useState<string>(() => generateManualShipmentOrderId([], ''));
  
  const [items, setItems] = useState<ManualShipmentItem[]>([]);

  // Auto-resolve Store & Phone Number from user login session & database
  useEffect(() => {
    let isMounted = true;

    const resolveAccountData = async () => {
      if (!session || editingOrder) return;

      // 1. Resolve Store from session (Kunci mutlak ke userAssignedStore jika bukan Admin)
      let targetStore = userAssignedStore;
      if (userAssignedStore) {
        if (isMounted && pengirim !== userAssignedStore) {
          setPengirim(userAssignedStore);
          setTransCustomer(generateManualShipmentOrderId(orders, userAssignedStore));
        }
      } else if (!pengirim) {
        const userDiv = (session.divisi || '').toLowerCase().trim();
        const userName = (session.name || '').toLowerCase().trim();
        const userUname = (session.username || '').toLowerCase().trim();
        const allOutlets = outlets.length > 0 ? outlets : DEFAULT_OUTLETS;

        const match = allOutlets.find((o) => {
          const oName = o.nama.toLowerCase().trim();
          return (
            userDiv === oName ||
            userDiv.includes(oName) ||
            userName === oName ||
            userName.includes(oName) ||
            userUname === oName ||
            userUname.includes(oName)
          );
        });

        if (match) {
          targetStore = match.nama;
          if (isMounted) {
            setPengirim(match.nama);
            setTransCustomer(generateManualShipmentOrderId(orders, match.nama));
          }
        }
      }

      // 2. Resolve Phone Number from session or database
      if (!telpPengirim) {
        if (session.no_hp && session.no_hp.trim()) {
          if (isMounted) setTelpPengirim(session.no_hp.trim());
        } else {
          try {
            if (session.username) {
              const users = await supabaseFetch<any[]>(
                'wms_users',
                'GET',
                null,
                `username=eq.${encodeURIComponent(session.username)}&limit=1`
              );
              if (isMounted && users && users.length > 0 && users[0].no_hp) {
                setTelpPengirim(users[0].no_hp.trim());
                return;
              }
            }
            if (session.nik) {
              const emps = await supabaseFetch<any[]>(
                'karyawan',
                'GET',
                null,
                `nik=eq.${encodeURIComponent(session.nik)}&limit=1`
              );
              if (isMounted && emps && emps.length > 0 && emps[0].no_hp) {
                setTelpPengirim(emps[0].no_hp.trim());
                return;
              }
            }
          } catch (e) {
            console.warn('Could not auto-fetch user phone number', e);
          }
        }
      }
    };

    resolveAccountData();

    return () => {
      isMounted = false;
    };
  }, [session, outlets, editingOrder]);

  useEffect(() => {
    loadOutlets();
    loadOrders();
    loadJasaKirim();
  }, []);

  const loadJasaKirim = async () => {
    setLoadingJasaKirim(true);
    try {
      const list = await fetchJasaKirimList();
      setJasaKirimList(list);
    } catch (e) {
      console.warn('Error loading jasa kirim:', e);
    } finally {
      setLoadingJasaKirim(false);
    }
  };

  const loadOutlets = async () => {
    const data = await fetchOutlets();
    setOutlets(data);
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await fetchManualShipments();
      // Sanitize jika ada sisa data lama di mana string JSON masuk ke kolom no_transaksi_customer
      const cleaned = data.map(o => {
        const cleanOrder = { ...o };
        if (cleanOrder.no_transaksi_customer && (cleanOrder.no_transaksi_customer.startsWith('[') || cleanOrder.no_transaksi_customer.startsWith('{'))) {
          if (!cleanOrder.items || cleanOrder.items.length === 0) {
            try {
              const parsed = JSON.parse(cleanOrder.no_transaksi_customer);
              if (Array.isArray(parsed)) cleanOrder.items = parsed;
            } catch {}
          }
          cleanOrder.no_transaksi_customer = cleanOrder.no_pesanan || '';
        }
        return cleanOrder;
      });
      const reversed = [...cleaned].reverse();
      setOrders(reversed);

      // Pastikan nomor transaksi customer di form tidak bentrok dengan order yang baru di-load dari server
      setTransCustomer(current => {
        if (!current || reversed.some(o => o.no_transaksi_customer && o.no_transaksi_customer.trim().toUpperCase() === current.trim().toUpperCase())) {
          return generateCustomerTransactionNumber(reversed, pengirim);
        }
        return current;
      });
    } catch (e) {
      console.warn('Error in loadOrders:', e);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Force full reload: reset delta sync cache so ALL data is fetched fresh
   */
  const forceReloadOrders = async () => {
    setLoading(true);
    try {
      await clearDeltaSyncCache('Manual Shipment');
      localStorage.removeItem('wms_cached_manual_shipments'); // Also clear localStorage cache
      await loadOrders();
      if (onShowToast) onShowToast('Muat ulang penuh selesai.', 'success');
    } catch (e) {
      console.warn('Error in forceReloadOrders:', e);
      if (onShowToast) onShowToast('Gagal muat ulang penuh.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const generateAutoMarketplaceAlterId = () => {
    const today = new Date();
    const y = String(today.getFullYear()).slice(-2);
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ALT-MS-${y}${m}${d}-${randomHex}`;
  };

  const handleAddItem = () => {
    setItems(prev => [...prev, {
      id: `item-${Date.now()}`, nama_produk: '', sku: '', qty: 1, fulfillment: '', size: ''
    }]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleToggleItemAlteration = (id: string, checked: boolean) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const isMarketplace = (item.fulfillment || '').toLowerCase().includes('marketplace');
        const autoId = isMarketplace ? generateAutoMarketplaceAlterId() : '';
        return {
          ...item,
          needs_alteration: checked,
          id_form_alter: checked ? (item.id_form_alter || autoId) : undefined,
          layanan_type: checked ? (item.layanan_type || 'alteration') : undefined,
          alteration_status: checked ? (item.alteration_status || 'antrian') : undefined,
          kondisi: checked ? (item.kondisi || 'Kondisi baru / baik') : undefined,
          alteration_detail: checked ? (item.alteration_detail || '') : undefined,
        };
      }
      return item;
    }));
  };

  const handleItemChange = (id: string, field: keyof ManualShipmentItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        if (field === 'fulfillment' && updated.needs_alteration) {
          const isMarketplace = (String(value || '')).toLowerCase().includes('marketplace');
          if (isMarketplace && (!updated.id_form_alter || !updated.id_form_alter.startsWith('ALT-MS-'))) {
            updated.id_form_alter = generateAutoMarketplaceAlterId();
          } else if (!isMarketplace && updated.id_form_alter?.startsWith('ALT-MS-')) {
            updated.id_form_alter = '';
          }
        }
        return updated;
      }
      return item;
    }));
  };

  // Upload Foto Alterasi Store langsung ke Google Drive via GAS Web App
  const handleUploadItemFiles = async (itemId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;

    setUploadingItemIds((prev) => ({ ...prev, [itemId]: true }));
    setUploadProgressText((prev) => ({ ...prev, [itemId]: `Mengompresi 0/${files.length} foto...` }));

    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setUploadProgressText((prev) => ({ ...prev, [itemId]: `Mengunggah foto ${i + 1}/${files.length} ke Google Drive...` }));

        // 1. Kompresi gambar via HTML5 Canvas (WebP/JPEG, ~40-60KB)
        const compressed = await compressImage(file, 1024, 0.7);

        // 2. Upload langsung ke Google Drive
        const cleanName = `Alter_Store_${itemId.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}_${i + 1}.jpg`;
        const res = await uploadImageToGdrive(compressed.dataUrl, cleanName);

        if (res.success && res.url) {
          uploadedUrls.push(res.url);
        } else {
          console.warn('Gagal upload 1 foto ke GDrive:', res.error);
        }
      }

      if (uploadedUrls.length > 0) {
        setItems((prev) =>
          prev.map((it) => {
            if (it.id === itemId) {
              return {
                ...it,
                foto_urls: [...(it.foto_urls || []), ...uploadedUrls],
              };
            }
            return it;
          })
        );
        onShowToast(`${uploadedUrls.length} foto berhasil diunggah ke Google Drive!`, 'success');
      } else {
        onShowToast('Gagal mengupload foto ke Google Drive. Cek koneksi.', 'error');
      }
    } catch (err: any) {
      console.error('Error uploading photos to Drive:', err);
      onShowToast(err?.message || 'Gagal memproses foto', 'error');
    } finally {
      setUploadingItemIds((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
      setUploadProgressText((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  };

  const handleCameraPhotoUploaded = (itemId: string, gdriveUrl: string) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === itemId) {
          return {
            ...it,
            foto_urls: [...(it.foto_urls || []), gdriveUrl],
          };
        }
        return it;
      })
    );
    onShowToast('Foto kamera berhasil disimpan ke Google Drive!', 'success');
  };

  const handleRemoveItemPhoto = (itemId: string, photoIdx: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.id === itemId) {
          const updatedPhotos = (it.foto_urls || []).filter((_, idx) => idx !== photoIdx);
          return {
            ...it,
            foto_urls: updatedPhotos,
          };
        }
        return it;
      })
    );
    onShowToast('Foto dihapus dari item', 'info');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validasi Kelengkapan Data Pengirim & PIC
    if (!pengirim || !pengirim.trim()) {
      onShowToast('Nama Pengirim (Store) wajib dipilih/diisi', 'warning');
      return;
    }
    if (!picStore || !picStore.trim()) {
      onShowToast('PIC Store wajib diisi secara manual', 'warning');
      return;
    }
    if (!telpPengirim || !telpPengirim.trim()) {
      onShowToast('No. Telp Store wajib diisi agar notifikasi konfirmasi WhatsApp dapat terkirim', 'warning');
      return;
    }
    if (!transPengirim || !transPengirim.trim()) {
      onShowToast('No. Transaksi DealPOS wajib diisi', 'warning');
      return;
    }
    if (!tujuan || !tujuan.trim() || !telpTujuan || !telpTujuan.trim() || !alamatTujuan || !alamatTujuan.trim()) {
      onShowToast('Harap lengkapi Data Customer (Nama Tujuan, No. Telp, Alamat)', 'warning');
      return;
    }
    if (items.length === 0 || items.some(i => !i.nama_produk || !i.fulfillment)) {
      onShowToast('Harap lengkapi item produk dan pilihan fulfillment toko', 'warning');
      return;
    }

    // Validasi Item yang membutuhkan Alteration
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.needs_alteration) {
        const isMarketplace = (it.fulfillment || '').toLowerCase().includes('marketplace');
        if (!isMarketplace && (!it.id_form_alter || !it.id_form_alter.trim())) {
          onShowToast(`Item #${i + 1} (${it.nama_produk || it.sku}): Pihak Store wajib mengisi No. ID Form Alter sesuai pendaftaran di Store`, 'warning');
          return;
        }
        if (!it.alteration_detail || !it.alteration_detail.trim()) {
          onShowToast(`Item #${i + 1} (${it.nama_produk || it.sku}): Rincian instruksi alteration/permak wajib diisi`, 'warning');
          return;
        }
      }
    }

    setLoading(true);

    // 1. Validasi & pastikan no_transaksi_customer memuat kode store dan 100% unik
    let finalTransCustomer = transCustomer.trim();
    const expectedPrefix = pengirim ? `MS${getStoreCode(pengirim)}-` : 'MS-';
    
    if (!editingOrder) {
      if (!finalTransCustomer || !finalTransCustomer.startsWith(expectedPrefix) || !isTransactionNumberUnique(finalTransCustomer, orders)) {
        finalTransCustomer = generateCustomerTransactionNumber(orders, pengirim);
        setTransCustomer(finalTransCustomer);
      }
    }

    // 2. Ambil nilai jasa kirim
    const finalJasaKirim = (isCustomJasaKirim ? customJasaKirim : jasaKirim).trim();

    // 3. Cegah bentrokan ID pesanan internal dengan format ringkas yang rapi
    const uniquePesananId = editingOrder ? editingOrder.no_pesanan! : generateShortOrderId(pengirim, orders);

    const orderData: ManualShipmentOrder = {
      ...(editingOrder || {}),
      no_pesanan: uniquePesananId,
      nama_pengirim: pengirim.trim(),
      pic_store: picStore.trim(),
      no_telp_store: telpPengirim.trim(),
      email_store: emailStore.trim(),
      no_transaksi_pengirim: transPengirim.split(',').map(s => s.trim()).filter(Boolean),
      nama_tujuan: tujuan.trim(),
      no_telp_tujuan: telpTujuan.trim(),
      email_customer: emailCustomer.trim(),
      alamat_tujuan: alamatTujuan.trim(),
      notes_paket: notesPaket.trim(),
      no_transaksi_customer: finalTransCustomer,
      jasa_kirim: finalJasaKirim,
      items: items.map((it) => ({
        ...it,
        qty: Math.max(1, Number(it.qty) || 1),
      })),
      status: editingOrder ? editingOrder.status : 'diterima',
      no_resi: editingOrder ? (editingOrder.no_resi || '') : '',
      created_at: editingOrder ? editingOrder.created_at : new Date().toISOString(),
      submitted_by: editingOrder ? editingOrder.submitted_by : (session?.name || getUserPersonName(session?.username) || 'Petugas')
    };

    let result = { success: false, message: '' };
    if (editingOrder) {
      result = await editManualShipment(orderData);
    } else {
      result = await submitManualShipment(orderData);
    }

    if (result.success) {
      onShowToast(editingOrder ? 'Pesanan berhasil diupdate' : 'Pesanan berhasil disubmit', 'success');

      // NOTIFIKASI EMAIL (Chocochips Official) ke Store PIC & Customer jika email dilampirkan
      triggerOrderEmailNotifications(
        orderData,
        editingOrder ? 'status_diproses' : 'submit'
      ).then((res) => {
        if (res.storeSent || res.customerSent) {
          const targets = [res.storeSent && 'Store PIC', res.customerSent && 'Customer'].filter(Boolean).join(' & ');
          onShowToast(`✉️ Email resmi Chocochips terkirim ke ${targets}!`, 'success');
        }
      }).catch((err) => console.warn('Email notification error:', err));

      // OTOMATIS FONNTE: Kirim notifikasi WhatsApp ke No. Telp Store (Pengirim) & Group Gudang
      const fonnteCfg = getFonnteConfig();
      const alterItems = (orderData.items || []).filter(
        (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail
      );
      const isAlterationOrder = alterItems.length > 0 || orderData.order_type === 'alteration_repair';

      if (!fonnteCfg.token) {
        onShowToast('ℹ️ Token Fonnte belum diisi di Pengaturan WhatsApp. Notif WA otomatis dilewati.', 'info');
      } else {
        // 1. Jika pesanan disertai alterasi, kirim pesan SPK Alterasi khusus ke Store & Group Tim Penjahit
        if (isAlterationOrder) {
          const alterSpkMsg = formatAlterationWorkOrderWaMessage(orderData);
          if (alterSpkMsg) {
            // Kirim ke Store
            if (orderData.no_telp_store && orderData.no_telp_store.trim()) {
              sendFonnteMessage(orderData.no_telp_store, alterSpkMsg, fonnteCfg.token)
                .then((res) => {
                  if (res.success) {
                    onShowToast('✅ Notif SPK Alterasi berhasil dikirim otomatis ke WA Store via Fonnte!', 'success');
                  } else {
                    onShowToast(`⚠️ Fonnte ke Store gagal: ${res.message}`, 'warning');
                  }
                })
                .catch((err) => console.warn('Fonnte alter notice error:', err));
            }
            // Kirim ke Grup Gudang / Tim Penjahit jika group target diatur
            if (fonnteCfg.groupTarget && fonnteCfg.groupTarget.trim()) {
              sendFonnteMessage(fonnteCfg.groupTarget, alterSpkMsg, fonnteCfg.token)
                .then((res) => {
                  if (res.success) {
                    onShowToast('✅ Notif SPK Alterasi berhasil dikirim ke Grup Tim Jahit via Fonnte!', 'success');
                  }
                })
                .catch((err) => console.warn('Fonnte group alter notice error:', err));
            }
          }
        }

        // 2. Kirim pesan notifikasi pesanan utama ke No. Telp Store
        if (orderData.no_telp_store && orderData.no_telp_store.trim()) {
          const totalQty = orderData.items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
          const dealposStr = Array.isArray(orderData.no_transaksi_pengirim)
            ? orderData.no_transaksi_pengirim.join(', ')
            : (orderData.no_transaksi_pengirim || '-');

          if (editingOrder) {
            const editorName = session?.name || getUserPersonName(session?.username) || 'Admin Gudang';
            const changes = generateOrderUpdateDiff(editingOrder, orderData);
            const updateMsg = formatOrderUpdateMessage(editingOrder, orderData, changes, editorName);

            setUpdateSuccessModal({
              order: orderData,
              message: updateMsg,
              changes,
            });

            sendFonnteMessage(orderData.no_telp_store, updateMsg, fonnteCfg.token)
              .then((res) => {
                if (res.success) {
                  onShowToast('✅ Notif pembaruan pesanan terkirim ke WA Store via Fonnte!', 'success');
                }
              })
              .catch((err) => console.warn('WA update notice error:', err));
          } else if (!isAlterationOrder) {
            // Jika bukan alterasi, kirim konfirmasi pesanan standar ke store
            const itemsListStr = orderData.items
              .map(
                (it, idx) =>
                  `  ${idx + 1}. *${it.sku || '-'}* - ${it.nama_produk} (Qty: ${it.qty} pcs, Fulfillment: ${it.fulfillment || '-'})${
                    it.needs_alteration
                      ? `\n     ✂️ *[Alteration: ${it.id_form_alter || 'Auto'}]* ${it.alteration_detail || '-'}`
                      : ''
                  }`
              )
              .join('\n');

            const submitMsg = `📦 *KONFIRMASI PESANAN MANUAL SHIPMENT BERHASIL*
--------------------------------------------
Halo Tim *${orderData.nama_pengirim}*, pesanan manual shipment Anda telah berhasil disubmit ke sistem WMS Gudang.

📋 *Rincian Pesanan:*
• *Order ID / No. Pesanan:* ${orderData.no_transaksi_customer || orderData.no_pesanan}
• *Store Pengirim:* ${orderData.nama_pengirim}
• *PIC Store:* ${orderData.pic_store || '-'}
• *No. DealPOS:* ${dealposStr}
• *Jasa Kirim:* ${orderData.jasa_kirim || '-'}
• *Waktu Submit:* ${new Date().toLocaleString('id-ID')}

👤 *Data Penerima (Customer):*
• *Nama Tujuan:* ${orderData.nama_tujuan}
• *No. Telp:* ${orderData.no_telp_tujuan || '-'}
• *Alamat Tujuan:* ${orderData.alamat_tujuan || '-'}

📦 *Daftar Produk (${totalQty} Pcs):*
${itemsListStr}

📝 *Catatan Paket:* ${orderData.notes_paket || '-'}

Terima kasih!
_WMS Warehouse System_`;

            sendFonnteMessage(orderData.no_telp_store, submitMsg, fonnteCfg.token)
              .then((res) => {
                if (res.success) {
                  onShowToast('✅ Konfirmasi pesanan berhasil dikirim ke WA Store via Fonnte!', 'success');
                }
              })
              .catch((err) => console.warn('WA submit notice error:', err));
          }
        }
      }

      resetForm();
      loadOrders();
      setActiveTab('rekap');
    } else {
      onShowToast(result.message || (editingOrder ? 'Gagal update pesanan' : 'Gagal submit pesanan'), 'error');
    }
    setLoading(false);
  };

  const resetForm = () => {
    setEditingOrder(null);
    setPicStore('');
    setEmailStore('');
    setTransPengirim('');
    setJasaKirim('');
    setCustomJasaKirim('');
    setIsCustomJasaKirim(false);
    setTujuan('');
    setTelpTujuan('');
    setEmailCustomer('');
    setAlamatTujuan('');
    setNotesPaket('');
    setTransCustomer(generateManualShipmentOrderId(orders, pengirim));
    setItems([]);
  };

  const handleScanProduct = (sku: string) => {
    const product = productCatalog.find(p => p.k.toUpperCase() === sku.toUpperCase());
    if (!product) {
      onShowToast(`SKU ${sku} tidak terdaftar!`, 'error');
      return;
    }

    setItems(prev => {
      const existing = prev.find(i => i.sku.toUpperCase() === sku.toUpperCase());
      if (existing) {
        // Increment qty
        return prev.map(i => i.sku.toUpperCase() === sku.toUpperCase() ? { ...i, qty: (Number(i.qty) || 0) + 1 } : i);
      }
      
      const displayNama = product.p || product.n || 'Unknown Product';
      const displaySize = product.s && product.s !== 'ALL' ? ` - ${product.s}` : '';
      const fullName = `${displayNama}${displaySize}`;
      return [...prev, {
        id: `item-${Date.now()}`,
        nama_produk: fullName,
        sku: product.k,
        qty: 1,
        fulfillment: '',
        size: product.s && product.s !== 'ALL' ? product.s : ''
      }];
    });
    onShowToast(`Berhasil menambahkan ${product.p || product.n || product.k}`, 'success');
  };

  const renderForm = () => (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200/90 dark:border-slate-800 overflow-hidden transition-colors">
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3.5 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {editingOrder ? 'Edit Pesanan Manual Shipment' : 'Form Pengiriman Manual Shipment'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Input data pesanan store untuk pengiriman ke customer
              </p>
            </div>
          </div>
          {pengirim && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {pengirim}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Top Row: Order ID & Pilihan Jasa Kirim (Compact & Aesthetic) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3.5 sm:p-4 bg-slate-50/80 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Order ID Manual Shipment
              </label>
              <input
                type="text"
                value={transCustomer}
                readOnly
                tabIndex={-1}
                placeholder="Pilih store pengirim..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold text-xs sm:text-sm cursor-not-allowed select-all shadow-xs py-2 px-3 tracking-wide"
              />
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Dibuat otomatis oleh sistem</p>
            </div>

            {/* Pilihan Jasa Kirim */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Pilihan Jasa Kirim / Ekspedisi <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    await loadJasaKirim();
                    onShowToast('Daftar jasa kirim disinkronkan dari Database', 'info');
                  }}
                  disabled={loadingJasaKirim}
                  className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-50 flex items-center gap-1 text-[10px] cursor-pointer"
                  title="Sinkronkan data jasa kirim"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingJasaKirim ? 'animate-spin' : ''}`} />
                  <span>Sync</span>
                </button>
              </div>

              <div className="space-y-1.5">
                <select
                  value={isCustomJasaKirim ? '__custom__' : jasaKirim}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setIsCustomJasaKirim(true);
                      setJasaKirim(customJasaKirim);
                    } else {
                      setIsCustomJasaKirim(false);
                      setJasaKirim(val);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-2 px-3"
                  required={!isCustomJasaKirim}
                >
                  <option value="">-- Pilih Jasa Kirim / Ekspedisi --</option>
                  {jasaKirimList.map((jk, idx) => (
                    <option key={idx} value={jk}>
                      {jk}
                    </option>
                  ))}
                  <option value="__custom__">+ Ketik Jasa Kirim Lainnya (Manual)</option>
                </select>

                {isCustomJasaKirim && (
                  <input
                    type="text"
                    value={customJasaKirim}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomJasaKirim(val);
                      setJasaKirim(val);
                    }}
                    placeholder="Ketik nama ekspedisi manual..."
                    className="w-full rounded-lg border border-indigo-300 dark:border-indigo-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs px-3 py-1.5 bg-indigo-50/40 dark:bg-indigo-950/40 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                    autoFocus
                    required
                  />
                )}
              </div>
            </div>
          </div>

          {/* Section 1: Data Pengirim */}
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-700/80 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Data Pengirim (Store)
              </h3>
              {pengirim && (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  {pengirim}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nama Pengirim (Store) <span className="text-red-500">*</span>
                </label>
                <select
                  value={pengirim}
                  disabled={!userIsAdmin && !!userAssignedStore}
                  onChange={(e) => {
                    const newStore = e.target.value;
                    setPengirim(newStore);
                    setTransCustomer(generateManualShipmentOrderId(orders, newStore));
                  }}
                  className={`w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm py-2 px-3 font-semibold ${
                    !userIsAdmin && !!userAssignedStore
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                      : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                  }`}
                  required
                >
                  <option value="">Pilih Store...</option>
                  {outlets.map((o, idx) => (
                    <option key={idx} value={o.nama}>{o.nama}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  {!userIsAdmin && !!userAssignedStore
                    ? 'Terkunci otomatis sesuai akun login Store'
                    : 'Terisi otomatis sesuai akun login'}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  PIC Store <span className="text-red-500 font-bold">* (Wajib Isi Manual)</span>
                </label>
                <input
                  type="text"
                  value={picStore}
                  onChange={(e) => setPicStore(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3 font-semibold"
                  placeholder="Nama PIC (Wajib Diisi)"
                  required
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Nama staf yang bertugas / bertanggung jawab</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  No. Telp Store (WhatsApp) <span className="text-red-500 font-bold">* (Wajib Diisi)</span>
                </label>
                <input
                  type="text"
                  value={telpPengirim}
                  onChange={(e) => setTelpPengirim(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3 font-mono font-semibold"
                  placeholder="08... (Wajib diisi)"
                  required
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Notifikasi konfirmasi & resi dikirim ke nomor ini</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span>Email Store / PIC (Opsional)</span>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">Notif Submit & WH</span>
                </label>
                <input
                  type="email"
                  value={emailStore}
                  onChange={(e) => setEmailStore(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3 font-sans"
                  placeholder="store@chocochips.co.id (opsional)"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Notifikasi update progress & resi dikirim ke email ini jika diisi</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  No. Transaksi DealPOS <span className="text-red-500 font-bold">* (Wajib Diisi)</span>
                </label>
                <input
                  type="text"
                  value={transPengirim}
                  onChange={(e) => setTransPengirim(e.target.value)}
                  placeholder="Contoh: 26.09.00023 (bisa lebih dari 1, pisahkan koma)"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3 font-mono"
                  required
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  Format DealPOS: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">26.09.00023</span> (bisa lebih dari 1 transaksi jika digabung, pisahkan tanda koma)
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Data Customer */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-200 dark:border-slate-700/80 pb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Data Customer (Penerima)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nama Tujuan / Customer <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={tujuan}
                  onChange={(e) => setTujuan(e.target.value)}
                  placeholder="Nama lengkap customer"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  No. Telp Tujuan (WhatsApp) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={telpTujuan}
                  onChange={(e) => setTelpTujuan(e.target.value)}
                  placeholder="08..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3 font-mono"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span>Email Customer (Opsional)</span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">KOP Chocochips</span>
                </label>
                <input
                  type="email"
                  value={emailCustomer}
                  onChange={(e) => setEmailCustomer(e.target.value)}
                  placeholder="customer@email.com (opsional)"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3 font-sans"
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Email formal & tabel rincian ber-kop Chocochips</p>
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Alamat Lengkap Tujuan <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={alamatTujuan}
                  onChange={(e) => setAlamatTujuan(e.target.value)}
                  placeholder="Jalan, No. Rumah, RT/RW, Kelurahan, Kecamatan, Kota/Kabupaten, Kode Pos"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                  rows={2}
                  required
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notes Tambahan Paket (Opsional)
                </label>
                <input
                  type="text"
                  value={notesPaket}
                  onChange={(e) => setNotesPaket(e.target.value)}
                  placeholder="Contoh: Jangan dibanting, titip di satpam, dll."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Item Pesanan */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-200 dark:border-slate-700/80 pb-2 flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Item Pesanan
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                {items.length} Baris Produk
              </span>
            </h3>

            {/* Scan / Add Product */}
            <div className="mb-4">
              <PhysicalScanInput 
                onScan={handleScanProduct}
                products={productCatalog}
                placeholder="KETIK SKU ATAU SCAN BARCODE..."
              />
            </div>

            <div className="space-y-3">
              {items.length === 0 && (
                <div className="text-center py-8 text-slate-400 dark:text-slate-500 bg-slate-50/60 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <div className="font-semibold text-slate-600 dark:text-slate-400 text-xs">Belum ada item pesanan</div>
                  <div className="text-[11px]">Ketik SKU produk atau scan barcode untuk menambahkan ke pesanan</div>
                </div>
              )}
              {items.map((item) => (
                  <div key={item.id} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 relative transition-colors">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      {/* Product Name */}
                      <div className="md:col-span-5 flex flex-col justify-center">
                        <label className="block text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500 mb-0.5">Nama Produk</label>
                        <div className="font-semibold text-slate-800 dark:text-white text-xs truncate" title={item.nama_produk}>
                          {item.nama_produk}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          SKU: {item.sku}
                        </div>
                      </div>

                      {/* QTY */}
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500 mb-0.5">Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={item.qty ?? ''}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleItemChange(item.id, 'qty', val === '' ? '' : Math.max(0, parseInt(val, 10) || 0));
                          }}
                          onBlur={() => {
                            if (item.qty === '' || Number(item.qty) < 1) {
                              handleItemChange(item.id, 'qty', 1);
                            }
                          }}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 text-xs focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-1 px-2.5 font-bold"
                          required
                        />
                      </div>

                      {/* Fulfillment */}
                      <div className="md:col-span-4">
                        <label className="block text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500 mb-0.5">Fulfillment</label>
                        <select
                          value={item.fulfillment}
                          onChange={(e) => handleItemChange(item.id, 'fulfillment', e.target.value)}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 text-xs focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-1 px-2"
                          required
                        >
                          <option value="">Pilih Fulfillment...</option>
                          <option value="Marketplace">Marketplace</option>
                          {outlets.map((o, idx) => (
                            <option key={idx} value={o.nama}>{o.nama}</option>
                          ))}
                        </select>

                        {/* Input Opsional No SJ DealPOS jika Fulfilment Marketplace */}
                        {(item.fulfillment || '').toLowerCase().includes('marketplace') && (
                          <div className="mt-1.5 flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 shrink-0">No SJ DealPOS:</span>
                            <input
                              type="text"
                              value={item.no_sj_dealpos || ''}
                              onChange={(e) => handleItemChange(item.id, 'no_sj_dealpos', e.target.value)}
                              placeholder="Contoh: TR-202609-0012"
                              className="w-full rounded border border-amber-300 dark:border-amber-700/80 bg-amber-50/50 dark:bg-amber-950/40 text-[11px] font-mono py-0.5 px-1.5 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                            />
                          </div>
                        )}
                      </div>

                      {/* Remove */}
                      <div className="md:col-span-1 flex items-center md:items-end justify-end md:justify-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-1.5 rounded-lg transition-colors text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-1 text-xs font-semibold cursor-pointer"
                          title="Hapus item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="md:hidden">Hapus</span>
                        </button>
                      </div>
                    </div>

                    {/* Alteration Feature per Item */}
                    <div className="mt-2.5 pt-2 border-t border-slate-200/80 dark:border-slate-700/80">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={!!item.needs_alteration}
                            onChange={(e) => handleToggleItemAlteration(item.id, e.target.checked)}
                            className="w-4 h-4 text-rose-600 rounded border-slate-300 focus:ring-rose-500 cursor-pointer"
                          />
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                            <Scissors className="w-3.5 h-3.5 text-rose-600" />
                            <span>Butuh Alteration / Permak Pakaian</span>
                          </span>
                        </label>
                        {item.needs_alteration && (
                          <span className="text-[10px] bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 px-2 py-0.5 rounded-full font-bold">
                            {(item.fulfillment || '').toLowerCase().includes('marketplace')
                              ? 'ID Auto WMS'
                              : 'ID Manual Store'}
                          </span>
                        )}
                      </div>

                      {item.needs_alteration && (
                        <div className="mt-2.5 p-3 bg-rose-50/60 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/60 space-y-2.5 animate-in fade-in">
                          {/* ID Form Alter & Jenis Layanan */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* ID Form Alter: Auto for Marketplace, Manual for Store */}
                            <div>
                              <div className="flex items-center justify-between mb-0.5">
                                <label className="block text-[10px] font-bold text-rose-900 dark:text-rose-200">
                                  No. ID Form Alter *
                                </label>
                                {(item.fulfillment || '').toLowerCase().includes('marketplace') ? (
                                  <span className="text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-400">
                                    (Otomatis oleh WMS)
                                  </span>
                                ) : (
                                  <span className="text-[9.5px] font-semibold text-amber-700 dark:text-amber-400">
                                    (Diisi manual sesuai form store)
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  required
                                  value={item.id_form_alter || ''}
                                  readOnly={(item.fulfillment || '').toLowerCase().includes('marketplace')}
                                  onChange={(e) => handleItemChange(item.id, 'id_form_alter', e.target.value)}
                                  placeholder={(item.fulfillment || '').toLowerCase().includes('marketplace') ? 'ALT-MS-XXXXX' : 'Ketik No. ID Form Alter Store...'}
                                  className={`w-full px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold shadow-2xs border ${
                                    (item.fulfillment || '').toLowerCase().includes('marketplace')
                                      ? 'bg-slate-100 dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 cursor-not-allowed'
                                      : 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-rose-300 dark:border-rose-700'
                                  }`}
                                />
                                {(item.fulfillment || '').toLowerCase().includes('marketplace') && (
                                  <button
                                    type="button"
                                    onClick={() => handleItemChange(item.id, 'id_form_alter', generateAutoMarketplaceAlterId())}
                                    title="Regenerate ID Alter"
                                    className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold shrink-0 border border-indigo-200 cursor-pointer"
                                  >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Jenis Layanan */}
                            <div>
                              <label className="block text-[10px] font-bold text-rose-900 dark:text-rose-200 mb-0.5">
                                Jenis Layanan:
                              </label>
                              <select
                                value={item.layanan_type || 'alteration'}
                                onChange={(e) => handleItemChange(item.id, 'layanan_type', e.target.value)}
                                className="w-full px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-rose-300 dark:border-rose-700 shadow-2xs"
                              >
                                <option value="alteration">✂️ Alteration Only (Potong / Kecilkan)</option>
                                <option value="repair">🔧 Repair Only (Permak / Resleting / Kancing)</option>
                                <option value="both">✂️🔧 Alter & Repair</option>
                              </select>
                            </div>
                          </div>

                          {/* Detail Instruksi Alteration / Permak */}
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-[10px] font-bold text-rose-900 dark:text-rose-200">
                                Rincian Instruksi Alteration / Permak *
                              </label>
                              <div className="flex flex-wrap gap-1">
                                {['Potong keliman 5cm', 'Kecilkan pinggang 2cm', 'Ganti resleting', 'Pasang kancing'].map((preset) => (
                                  <button
                                    key={preset}
                                    type="button"
                                    onClick={() => {
                                      const cur = item.alteration_detail ? `${item.alteration_detail}, ${preset}` : preset;
                                      handleItemChange(item.id, 'alteration_detail', cur);
                                    }}
                                    className="text-[9px] bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded border border-rose-200 hover:bg-rose-100 cursor-pointer"
                                  >
                                    + {preset}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <textarea
                              rows={2}
                              required
                              value={item.alteration_detail || ''}
                              onChange={(e) => handleItemChange(item.id, 'alteration_detail', e.target.value)}
                              placeholder="Misal: Potong keliman bawah 4cm dijahit rapi dengan benang senada..."
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 rounded-lg text-slate-900 dark:text-white text-xs resize-none shadow-2xs"
                            />
                          </div>

                          {/* Lampiran Foto Fisik / Kamera saat Fulfil dari Store */}
                          {!((item.fulfillment || '').toLowerCase().includes('marketplace')) && (
                            <div className="pt-2.5 mt-2.5 border-t border-rose-200/80 dark:border-rose-900/60">
                              <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                                <span className="text-[10px] font-bold text-rose-950 dark:text-rose-200 flex items-center gap-1.5">
                                  <ImageIcon className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Dokumentasi Foto Fisik Alterasi (Store)</span>
                                </span>
                                <span className="text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                                  <span>☁️ Simpan ke Google Drive</span>
                                </span>
                              </div>

                              {/* Tombol Opsi: 1 Tombol Buka Kamera & 1 Tombol Upload File */}
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                {/* Tombol Buka Kamera */}
                                <button
                                  type="button"
                                  disabled={!!uploadingItemIds[item.id]}
                                  onClick={() => setCameraModalItem({
                                    id: item.id,
                                    nama_produk: item.nama_produk || item.sku || 'Item Alterasi',
                                    id_form_alter: item.id_form_alter
                                  })}
                                  className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 transition-colors"
                                  title="Buka kamera perangkat untuk mengambil foto"
                                >
                                  <Camera className="w-3.5 h-3.5" />
                                  <span>Buka Kamera</span>
                                </button>

                                {/* Tombol Upload dari Galeri / File */}
                                <label className="px-3 py-1.5 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-semibold border border-rose-300 dark:border-rose-800 flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors">
                                  <Upload className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Upload Galeri / File</span>
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    disabled={!!uploadingItemIds[item.id]}
                                    onChange={(e) => handleUploadItemFiles(item.id, e.target.files)}
                                    className="hidden"
                                  />
                                </label>

                                {item.foto_urls && item.foto_urls.length > 0 && (
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 font-semibold ml-auto">
                                    {item.foto_urls.length} Foto Terlampir
                                  </span>
                                )}
                              </div>

                              {/* Indikator Sedang Mengupload ke Google Drive */}
                              {uploadingItemIds[item.id] && (
                                <div className="p-2 mb-2 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-xs text-emerald-800 dark:text-emerald-300 animate-pulse">
                                  <Loader2 className="w-4 h-4 animate-spin text-emerald-600 dark:text-emerald-400 shrink-0" />
                                  <span className="font-semibold">{uploadProgressText[item.id] || 'Mengunggah ke Google Drive...'}</span>
                                </div>
                              )}

                              {/* Grid / List Foto yang Sudah Diunggah */}
                              {item.foto_urls && item.foto_urls.length > 0 && (
                                <div className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5">
                                  {item.foto_urls.map((photoUrl, pIdx) => (
                                    <div key={pIdx} className="relative group shrink-0 rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xs">
                                      <img
                                        src={photoUrl}
                                        alt={`Foto ${pIdx + 1}`}
                                        className="w-14 h-14 object-cover cursor-pointer hover:scale-105 transition-transform"
                                        onClick={() => setPreviewPhotoUrl(photoUrl)}
                                      />
                                      {/* Overlay View & Delete */}
                                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity">
                                        <button
                                          type="button"
                                          onClick={() => setPreviewPhotoUrl(photoUrl)}
                                          title="Lihat Foto"
                                          className="p-1 bg-white/90 text-slate-900 rounded-full hover:bg-white cursor-pointer"
                                        >
                                          <Eye className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleRemoveItemPhoto(item.id, pIdx)}
                                          title="Hapus Foto"
                                          className="p-1 bg-rose-600 text-white rounded-full hover:bg-rose-500 cursor-pointer"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                      {/* Badge Google Drive */}
                                      <div className="absolute bottom-0 inset-x-0 bg-slate-900/80 text-[8px] text-emerald-300 font-mono text-center py-0.2">
                                        GDrive
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5">
            {editingOrder && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-xl text-slate-700 dark:text-slate-300 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Batal Edit
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2 rounded-xl text-white text-xs font-bold flex items-center shadow-xs cursor-pointer transition-colors ${
                loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
              }`}
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-1.5" />
              )}
              {loading ? 'Submitting...' : editingOrder ? 'Update Pesanan' : 'Submit Pesanan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  const toggleSelectOrder = (no_pesanan: string) => {
    const newSet = new Set(selectedOrders);
    if (newSet.has(no_pesanan)) newSet.delete(no_pesanan);
    else newSet.add(no_pesanan);
    setSelectedOrders(newSet);
  };

  const handlePrintPickingList = async () => {
    if (selectedOrders.size === 0) {
      onShowToast('Pilih setidaknya satu pesanan untuk mencetak picking list', 'info');
      return;
    }
    const itemsToPrint = orders.filter(o => o.no_pesanan && selectedOrders.has(o.no_pesanan));
    if (itemsToPrint.length === 0) return;
    
    // Update status to diproses
    setLoading(true);
    for (const id of selectedOrders) {
      await updateShipmentStatus(id, 'diproses');
    }
    loadOrders();
    setLoading(false);

    // Set payload cetak in-page (100% didukung di HP dan desktop)
    setPrintPayload({
      mode: 'PICKING',
      orders: itemsToPrint,
      qrMap: {},
      timestamp: Date.now(),
    });
    
    setSelectedOrders(new Set());
    onShowToast(`Menyiapkan cetak ${itemsToPrint.length} picking list`, 'success');
  };

  const handlePrintAlterWorkOrder = async (target: ManualShipmentOrder | ManualShipmentOrder[]) => {
    const targetList = Array.isArray(target) ? target : [target];
    if (targetList.length === 0) {
      onShowToast('Pilih setidaknya satu pesanan dengan kebutuhan alteration', 'warning');
      return;
    }

    // Generate QR Map for fast scanning on physical ticket
    const qrMap: Record<string, string> = {};
    for (const o of targetList) {
      if (o.no_pesanan) {
        try {
          qrMap[o.no_pesanan] = await QRCode.toDataURL(o.no_pesanan, {
            width: 150,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
          });
        } catch (err) {
          console.warn('QR code gen error:', err);
        }
      }
    }

    setPrintPayload({
      mode: 'ALTER_WORK_ORDER',
      orders: targetList,
      qrMap,
      timestamp: Date.now(),
    });

    onShowToast(`Menyiapkan cetak SPK Penjahit (${targetList.length} pesanan)`, 'success');
  };

  
  // Handler simpan No SJ DealPOS
  const handleSaveSjDealpos = async () => {
    if (!sjModalData) return;
    const { order, item, noSj, applyToAllMarketplace } = sjModalData;
    const cleanSj = noSj.trim();

    setLoading(true);
    try {
      let success = false;
      const operatorName = session?.name || getUserPersonName(session?.username) || session?.role || 'Admin';

      if (applyToAllMarketplace || !item) {
        // Bulk update semua item marketplace dalam pesanan ini
        const res = await bulkUpdateOrderSjDealpos(order.no_pesanan || (order as any).id, cleanSj, operatorName);
        success = res.success;
      } else {
        // Update item spesifik
        const res = await updateItemSjDealpos(order.no_pesanan || (order as any).id, item.id, cleanSj, operatorName);
        success = res.success;
      }

      if (success) {
        onShowToast(`No. Surat Jalan DealPOS berhasil ${cleanSj ? 'disimpan' : 'dihapus'}!`, 'success');
        // Update local state orders agar instan
        setOrders(prev => prev.map(o => {
          if (o.no_pesanan === order.no_pesanan) {
            const updatedItems = (o.items || []).map(it => {
              if (applyToAllMarketplace || !item) {
                if ((it.fulfillment || '').toLowerCase().includes('marketplace')) {
                  return { ...it, no_sj_dealpos: cleanSj, sj_updated_at: new Date().toISOString(), sj_updated_by: operatorName };
                }
              } else if (it.id === item.id) {
                return { ...it, no_sj_dealpos: cleanSj, sj_updated_at: new Date().toISOString(), sj_updated_by: operatorName };
              }
              return it;
            });
            return { ...o, items: updatedItems };
          }
          return o;
        }));
        setSjModalData(null);
      } else {
        onShowToast('Gagal menyimpan No. Surat Jalan DealPOS', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Terjadi kesalahan sistem', 'error');
    } finally {
      setLoading(false);
    }
  };


  // Handler Memproses Barang Sold Out
  const handleConfirmSoldProcess = async () => {
    if (!soldModalData) return;
    const { order, item, resolution, note, sendWaToStore } = soldModalData;
    const cleanNote = note.trim() || 'Stok di Marketplace DealPOS kosong / sold out.';
    const operatorName = session?.name || getUserPersonName(session?.username) || session?.role || 'Admin Gudang';

    setLoading(true);
    try {
      const res = await markItemSoldAndProcess(
        order.no_pesanan || (order as any).id,
        item.id,
        resolution,
        cleanNote,
        operatorName
      );

      if (res.success && res.updatedOrder) {
        const updated = res.updatedOrder;
        onShowToast('Status barang sold berhasil diproses!', 'success');

        // Update list orders di memori
        setOrders(prev => prev.map(o => o.no_pesanan === order.no_pesanan ? updated : o));
        if (selectedOrderDetails?.no_pesanan === order.no_pesanan) {
          setSelectedOrderDetails(updated);
        }

        // Kirim WhatsApp ke PIC Store jika dicentang
        if (sendWaToStore && order.no_telp_store && order.no_telp_store.trim()) {
          const storePhone = order.no_telp_store;
          const remainingReadyCount = (updated.items || []).filter(
            it => it.item_status !== 'sold_out' && it.item_status !== 'cancelled'
          ).length;

          let waResolutionText = '';
          if (resolution === 'cancel_order') {
            waResolutionText = '⛔ *TINDAKAN GUDANG:* Seluruh pesanan ini telah *DIBATALKAN*.';
          } else if (resolution === 'partial_fulfill') {
            waResolutionText = `🚚 *TINDAKAN GUDANG:* Melanjutkan pengiriman sebagian (*Partial Fulfillment*) untuk *${remainingReadyCount} produk* yang siap kirim. Item yang sold dikeluarkan dari paket.`;
          } else {
            waResolutionText = '⏳ *TINDAKAN GUDANG:* Menunggu konfirmasi dari tim Store apakah ingin kirim sebagian atau ganti produk lain.';
          }

          const waSoldMsg = `⚠️ *PEMBERITAHUAN BARANG SOLD OUT (MARKETPLACE)*
--------------------------------------------
Halo Tim *${order.nama_pengirim || 'Store'}* (PIC: ${order.pic_store || '-'}),
Ada produk pesanan manual shipment yang stoknya *KOSONG / SOLD OUT* di alokasi DealPOS Marketplace:

📋 *Rincian Pesanan:*
• *Order ID:* ${order.no_transaksi_customer || order.no_pesanan}
• *Nama Customer:* ${order.nama_tujuan} (${order.no_telp_tujuan || '-'})
• *Jasa Kirim:* ${order.jasa_kirim || '-'}

🔴 *Produk Kosong (Sold Out):*
• *SKU:* ${item.sku}
• *Nama Produk:* ${item.nama_produk}
• *Qty:* ${item.qty} pcs ${item.size && item.size !== '-' ? `(Size: ${item.size})` : ''}
• *Catatan Admin:* ${cleanNote}

${waResolutionText}

_Pemberitahuan otomatis WMS Warehouse System_`;

          sendFonnteMessage(storePhone, waSoldMsg)
            .then(waRes => {
              if (waRes.success) {
                onShowToast(`Pesan WA notifikasi terkirim ke Store (${order.nama_pengirim})`, 'info');
              }
            })
            .catch(err => console.warn('Gagal kirim WA sold notice', err));
        }

        setSoldModalData(null);
      } else {
        onShowToast(res.message || 'Gagal memproses barang sold', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Terjadi kesalahan sistem', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Handler Pulihkan Barang Sold Out
  const handleRestoreSoldItem = async (order: ManualShipmentOrder, item: ManualShipmentItem) => {
    if (!window.confirm(`Pulihkan status item [${item.sku}] ${item.nama_produk} menjadi Ready?`)) return;
    const operatorName = session?.name || getUserPersonName(session?.username) || session?.role || 'Admin Gudang';

    setLoading(true);
    try {
      const res = await restoreSoldItem(order.no_pesanan || (order as any).id, item.id, operatorName);
      if (res.success && res.updatedOrder) {
        onShowToast('Status item berhasil dikembalikan ke Ready', 'success');
        setOrders(prev => prev.map(o => o.no_pesanan === order.no_pesanan ? res.updatedOrder! : o));
        if (selectedOrderDetails?.no_pesanan === order.no_pesanan) {
          setSelectedOrderDetails(res.updatedOrder);
        }
      } else {
        onShowToast(res.message || 'Gagal memulihkan status item', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Terjadi kesalahan sistem', 'error');
    } finally {
      setLoading(false);
    }
  };

  
  // Modal Penanganan Produk Sold Out
  const renderSoldOutModal = () => {
    if (!soldModalData) return null;
    const { order, item, resolution, note, sendWaToStore } = soldModalData;
    const totalOrderItems = (order.items || []).length;
    const isMultiItem = totalOrderItems > 1;

    return (
      <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl">
          {/* Header */}
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-red-500/10">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-red-600 text-white shadow-xs">
                <AlertOctagon className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Tandai Produk Sold Out (Marketplace)
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Stok kosong pada sistem DealPOS Marketplace
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSoldModalData(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
            {/* Box Rincian Produk yang Sold */}
            <div className="p-3.5 bg-red-50/70 dark:bg-red-950/40 rounded-xl border border-red-200 dark:border-red-800/60 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-red-700 dark:text-red-400">
                  Produk Bermasalah:
                </span>
                <span className="text-xs font-bold text-red-800 dark:text-red-300">
                  Qty: {item.qty} pcs
                </span>
              </div>
              <div className="font-bold text-slate-900 dark:text-white text-sm">
                {item.nama_produk}
              </div>
              <div className="text-xs font-mono text-slate-600 dark:text-slate-300 flex items-center gap-2">
                <span>SKU: {item.sku}</span>
                {item.size && item.size !== '-' && <span>• Size: {item.size}</span>}
              </div>
            </div>

            {/* Opsi Tindakan Lanjutan */}
            <div>
              <label className="block text-xs font-bold text-slate-800 dark:text-slate-200 mb-2">
                Pilih Tindakan Lanjutan:
              </label>
              <div className="space-y-2">
                {/* Opsi 1: Kirim Sebagian (Jika order > 1 produk) */}
                {isMultiItem && (
                  <label className={`block p-3 rounded-xl border cursor-pointer transition-all ${
                    resolution === 'partial_fulfill'
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 ring-1 ring-indigo-500'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}>
                    <div className="flex items-start gap-2.5">
                      <input
                        type="radio"
                        name="resolution"
                        value="partial_fulfill"
                        checked={resolution === 'partial_fulfill'}
                        onChange={() => setSoldModalData(prev => prev ? { ...prev, resolution: 'partial_fulfill' } : null)}
                        className="mt-1 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div>
                        <div className="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                          <span>📦 Kirim Sebagian (Partial Fulfillment)</span>
                          <span className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300 px-1.5 py-0.2 rounded font-semibold">
                            Disarankan
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Keluarkan item yang sold ini dari paket. Lanjutkan pengiriman untuk <b>{totalOrderItems - 1} item lainnya</b> yang ready ke customer.
                        </div>
                      </div>
                    </div>
                  </label>
                )}

                {/* Opsi 2: Batalkan Seluruh Pesanan */}
                <label className={`block p-3 rounded-xl border cursor-pointer transition-all ${
                  resolution === 'cancel_order'
                    ? 'border-red-500 bg-red-50/50 dark:bg-red-950/40 ring-1 ring-red-500'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}>
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="resolution"
                      value="cancel_order"
                      checked={resolution === 'cancel_order'}
                      onChange={() => setSoldModalData(prev => prev ? { ...prev, resolution: 'cancel_order' } : null)}
                      className="mt-1 text-red-600 focus:ring-red-500"
                    />
                    <div>
                      <div className="font-bold text-xs text-red-700 dark:text-red-400">
                        ⛔ Batalkan Seluruh Pesanan (Cancel Order)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Ubah status pesanan #{order.no_pesanan} menjadi <b>BATAL</b>. Pesanan tidak akan diproses packing atau kirim.
                      </div>
                    </div>
                  </div>
                </label>

                {/* Opsi 3: Hanya Beri Tanda Sold (Menunggu Konfirmasi Store) */}
                <label className={`block p-3 rounded-xl border cursor-pointer transition-all ${
                  resolution === 'mark_only'
                    ? 'border-amber-500 bg-amber-50/50 dark:bg-amber-950/40 ring-1 ring-amber-500'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}>
                  <div className="flex items-start gap-2.5">
                    <input
                      type="radio"
                      name="resolution"
                      value="mark_only"
                      checked={resolution === 'mark_only'}
                      onChange={() => setSoldModalData(prev => prev ? { ...prev, resolution: 'mark_only' } : null)}
                      className="mt-1 text-amber-600 focus:ring-amber-500"
                    />
                    <div>
                      <div className="font-bold text-xs text-amber-800 dark:text-amber-300">
                        ⏳ Hanya Tandai Sold (Tunggu Konfirmasi Store / Ganti Produk)
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Beri label peringatan merah pada item ini di aplikasi & kirim notifikasi agar tim Store mengonfirmasi penggantian barang atau pembatalan.
                      </div>
                    </div>
                  </div>
                </label>
              </div>
            </div>

            {/* Input Alasan / Catatan Admin */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Catatan / Alasan Stok Kosong:
              </label>
              <textarea
                rows={2}
                value={note}
                onChange={(e) => setSoldModalData(prev => prev ? { ...prev, note: e.target.value } : null)}
                placeholder="Contoh: Stok di alokasi DealPOS Marketplace habis / fisik rusak."
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-white"
              />
            </div>

            {/* Opsi Notifikasi WhatsApp ke PIC Store */}
            <div className="p-3 bg-emerald-50/80 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWaToStore}
                  onChange={(e) => setSoldModalData(prev => prev ? { ...prev, sendWaToStore: e.target.checked } : null)}
                  className="w-4 h-4 mt-0.5 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
                <div className="text-xs">
                  <div className="font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Kirim Notifikasi WhatsApp Otomatis ke PIC Store</span>
                  </div>
                  <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-0.5">
                    Pesan rincian barang kosong dan tindakan akan langsung dikirim ke WhatsApp Store: <b>{order.no_telp_store}</b> ({order.nama_pengirim} - PIC: {order.pic_store || '-'}).
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* Footer Modal */}
          <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSoldModalData(null)}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleConfirmSoldProcess}
              className="px-4 py-1.5 text-xs font-bold rounded-xl bg-red-600 hover:bg-red-700 text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Konfirmasi & Simpan</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

    const renderSjDealposModal = () => {
    if (!sjModalData) return null;
    const { order, item, noSj, applyToAllMarketplace } = sjModalData;
    const mktItems = (order.items || []).filter(it => (it.fulfillment || '').toLowerCase().includes('marketplace'));

    return (
      <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-amber-500/10">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500 text-white shadow-xs">
                <FileCheck className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Input No. Surat Jalan DealPOS
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Mutasi Marketplace ➡️ {order.nama_pengirim}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSjModalData(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-1">
              <div className="text-xs font-semibold text-slate-800 dark:text-white">
                Pesanan: <span className="font-mono text-indigo-600 dark:text-indigo-400">{order.no_pesanan}</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Tujuan Toko: <span className="font-medium text-slate-700 dark:text-slate-300">{order.nama_pengirim}</span>
              </div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Customer: <span className="font-medium text-slate-700 dark:text-slate-300">{order.nama_tujuan}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nomor Surat Jalan DealPOS (Copas dari DealPOS):
              </label>
              <div className="relative">
                <input
                  type="text"
                  autoFocus
                  value={noSj}
                  onChange={(e) => setSjModalData(prev => prev ? { ...prev, noSj: e.target.value } : null)}
                  placeholder="Contoh: TR-202609-0042 atau SJ-MKT-089"
                  className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-800 border-2 border-amber-400 dark:border-amber-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900 dark:text-white"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSaveSjDealpos();
                    }
                  }}
                />
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                *Salin nomor transfer/surat jalan dari sistem DealPOS lalu tempel di sini.
              </p>
            </div>

            {mktItems.length > 1 && (
              <div className="p-3 bg-amber-50/70 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800/60">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyToAllMarketplace}
                    onChange={(e) => setSjModalData(prev => prev ? { ...prev, applyToAllMarketplace: e.target.checked } : null)}
                    className="w-4 h-4 mt-0.5 rounded border-amber-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-amber-900 dark:text-amber-200">
                      Terapkan ke semua item Marketplace ({mktItems.length} produk)
                    </span>
                    <p className="text-[10px] text-amber-700 dark:text-amber-400 mt-0.5">
                      Cocok jika produk-produk marketplace untuk order ini dikirim dalam satu surat jalan yang sama dari DealPOS.
                    </p>
                  </div>
                </label>
              </div>
            )}

            <div className="text-xs border-t border-slate-100 dark:border-slate-800 pt-3">
              <span className="font-semibold text-slate-500 dark:text-slate-400 text-[11px] uppercase tracking-wider block mb-1.5">
                Daftar Produk Fulfilment Marketplace:
              </span>
              <div className="max-h-28 overflow-y-auto space-y-1">
                {mktItems.map((it, idx) => (
                  <div key={idx} className="flex justify-between items-center text-[11px] p-1.5 rounded bg-slate-50 dark:bg-slate-800/50">
                    <div className="truncate max-w-[240px]">
                      <span className="font-bold font-mono text-indigo-600 dark:text-indigo-400">{it.sku}</span>
                      <span className="text-slate-600 dark:text-slate-300 ml-1.5">{it.nama_produk}</span>
                    </div>
                    <span className="font-bold text-slate-700 dark:text-slate-300">{it.qty} pcs</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="px-5 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSjModalData(null)}
              className="px-3.5 py-1.5 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSaveSjDealpos}
              className="px-4 py-1.5 text-xs font-bold rounded-xl bg-amber-500 hover:bg-amber-600 text-white shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Simpan No. SJ DealPOS</span>
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderOrderDetailsModal = () => {
    if (!selectedOrderDetails) return null;
    const order = selectedOrderDetails;
    const totalQty = order.items?.reduce((acc, it) => acc + (Number(it.qty) || 0), 0) || 0;

    return (
      <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl transition-colors">
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSelectedOrderDetails(null)} 
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 dark:text-slate-400 cursor-pointer"
                title="Kembali"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">ORDER ID #{order.no_pesanan}</h2>
            </div>
            <button 
              onClick={() => setSelectedOrderDetails(null)} 
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 dark:text-slate-400 cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-900">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column */}
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Shipping Address</h3>
                  <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                    <div className="font-semibold text-slate-800 dark:text-white text-base">{order.nama_tujuan}</div>
                    <div className="font-mono">{order.no_telp_tujuan}</div>
                    <div className="mt-2 whitespace-pre-wrap leading-relaxed">{order.alamat_tujuan}</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Pengirim / Store Info</h3>
                  <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                    <div className="font-semibold text-slate-800 dark:text-white text-base">{order.nama_pengirim}</div>
                    {order.pic_store && <div>PIC: <span className="text-slate-800 dark:text-slate-200 font-medium">{order.pic_store}</span></div>}
                    {order.no_telp_store && <div className="font-mono">{order.no_telp_store}</div>}
                    {order.no_transaksi_pengirim && order.no_transaksi_pengirim.length > 0 && (
                      <div className="mt-2">
                        <span className="font-medium text-slate-800 dark:text-slate-200">DealPOS:</span> {order.no_transaksi_pengirim.join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Customer Info</h3>
                  <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                    <div className="font-semibold text-slate-800 dark:text-white">{order.nama_tujuan}</div>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-8">
                <div className="flex gap-2 flex-wrap items-center">
                  <button 
                    onClick={() => { setSelectedOrderDetails(null); handlePrintLabel(order); }}
                    className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold rounded-lg text-xs border border-slate-300 dark:border-slate-700 flex items-center transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1.5" />
                    Print Label
                  </button>
                  {((order.items || []).some(it => it.needs_alteration || it.id_form_alter || it.alteration_detail) || order.order_type === 'alteration_repair' || (order.no_pesanan || '').toUpperCase().startsWith('AR-')) && (
                    <>
                      <button 
                        onClick={() => { setSelectedOrderDetails(null); handlePrintAlterWorkOrder(order); }}
                        className="px-3.5 py-1.5 bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/60 font-semibold rounded-lg text-xs border border-rose-300 dark:border-rose-800 flex items-center transition-colors cursor-pointer"
                        title="Cetak SPK & Instruksi Pengerjaan untuk Penjahit"
                      >
                        <Scissors className="w-3.5 h-3.5 mr-1.5 text-rose-600" />
                        Cetak SPK Penjahit
                      </button>
                      <button 
                        type="button"
                        disabled={isSendingAlterWa}
                        onClick={() => handleSendAlterWaFonnte(order)}
                        className="px-3.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 font-semibold rounded-lg text-xs border border-emerald-300 dark:border-emerald-800 flex items-center transition-colors cursor-pointer disabled:opacity-50"
                        title="Kirim SPK Alterasi langsung via WhatsApp Fonnte ke Store & Tim Penjahit"
                      >
                        {isSendingAlterWa ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                            <span>Mengirim Fonnte...</span>
                          </>
                        ) : (
                          <>
                            <SendHorizonal className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                            <span>Kirim WA Alter (Fonnte)</span>
                          </>
                        )}
                      </button>
                    </>
                  )}
                  <button 
                    type="button"
                    onClick={() => {
                      const summary = formatOrderFullSummary(order);
                      copyToClipboard(summary, 'Rincian lengkap pesanan (format WA) berhasil disalin!');
                    }}
                    className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold rounded-lg text-xs border border-slate-300 dark:border-slate-700 flex items-center transition-colors cursor-pointer"
                    title="Salin Rincian Pesanan Lengkap untuk WhatsApp"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                    Salin Rincian (WA)
                  </button>
                  {userIsAdmin && (
                    <>
                      <button 
                        onClick={() => { setSelectedOrderDetails(null); handleEdit(order); }}
                        className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold rounded-lg text-xs border border-slate-300 dark:border-slate-700 flex items-center transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => { handleUpdateResi(order.no_pesanan!); }}
                        className="px-3.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-semibold rounded-lg text-xs border border-indigo-200 dark:border-indigo-800 flex items-center transition-colors cursor-pointer"
                      >
                        Update Resi
                      </button>
                      {order.status !== 'batal' && (
                        <button 
                          type="button"
                          onClick={() => { setCancelModalOrder(order); }}
                          className="px-3.5 py-1.5 bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/60 font-semibold rounded-lg text-xs border border-red-300 dark:border-red-800 flex items-center transition-colors cursor-pointer"
                          title="Batalkan pesanan dan catat alasan ke histori"
                        >
                          <Ban className="w-3.5 h-3.5 mr-1.5 text-red-600" />
                          Batalkan Pesanan
                        </button>
                      )}
                    </>
                  )}
                </div>

                {/* Section No. Resi & Template WA Customer (Khusus PIC Store & Admin) */}
                <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                        Nomor Resi Pengiriman
                      </span>
                      <div className="text-base font-mono font-black text-emerald-950 dark:text-emerald-200 mt-0.5">
                        {order.no_resi ? (
                          <span className="bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
                            {order.no_resi}
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-sans font-semibold text-xs flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Menunggu update resi dari Admin Gudang
                          </span>
                        )}
                      </div>
                    </div>
                    {order.no_resi && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            copyToClipboard(order.no_resi || '', `No. Resi ${order.no_resi} berhasil disalin!`);
                            setCopiedResi(order.no_pesanan);
                            setTimeout(() => setCopiedResi(null), 2000);
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                        >
                          {copiedResi === order.no_pesanan ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>Salin No. Resi</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setWaModalOrder(order)}
                          className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Template WA Customer</span>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* WhatsApp Message Preview Box */}
                  <div className="pt-2 border-t border-emerald-200/80 dark:border-emerald-800/40">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Format Pesan WA untuk Customer (Kirim Manual oleh PIC Store):
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(generateCustomerWaTemplate(order), 'Format pesan WA customer berhasil disalin!')}
                        className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        Salin Format WA
                      </button>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-emerald-200/90 dark:border-emerald-800/50 rounded-lg p-3 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans max-h-40 overflow-y-auto leading-relaxed select-all">
                      {generateCustomerWaTemplate(order)}
                    </div>
                    {order.no_telp_tujuan && (
                      <div className="mt-2 flex justify-end">
                        <a
                          href={`https://wa.me/${getCleanCustomerPhone(order.no_telp_tujuan)}?text=${encodeURIComponent(generateCustomerWaTemplate(order))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Buka Chat WhatsApp Customer ({order.no_telp_tujuan})
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Order Items</h3>
                  <div className="space-y-3">
                    {order.items?.map((item, idx) => (
                      <div key={idx} className="text-sm text-slate-700 dark:text-slate-300 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                        <div>
                          <div className="font-semibold text-indigo-600 dark:text-indigo-400">{item.nama_produk}</div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                            <span>SKU: {item.sku}</span>
                            {item.size && item.size !== 'ALL' && item.size !== '-' && <span>| Size: {item.size}</span>}
                            {item.fulfillment && (
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                                (item.fulfillment || '').toLowerCase().includes('marketplace')
                                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-700'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                              }`}>
                                Fulfilment: {item.fulfillment}
                              </span>
                            )}
                            {item.item_status === 'sold_out' && (
                              <span className="px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-950/80 text-[10px] font-bold text-red-700 dark:text-red-300 border border-red-300 dark:border-red-800 flex items-center gap-1">
                                <Ban className="w-2.5 h-2.5" />
                                <span>SOLD OUT {item.sold_note ? `(${item.sold_note})` : ''}</span>
                              </span>
                            )}
                            {item.item_status !== 'sold_out' && (item.fulfillment || '').toLowerCase().includes('marketplace') && (
                              item.no_sj_dealpos ? (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-[10px] font-mono font-bold text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700">
                                  <FileCheck className="w-2.5 h-2.5" />
                                  <span>SJ DealPOS: {item.no_sj_dealpos}</span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      copyToClipboard(item.no_sj_dealpos || '', `No. SJ ${item.no_sj_dealpos} disalin!`);
                                      setCopiedSj(item.no_sj_dealpos || null);
                                      setTimeout(() => setCopiedSj(null), 2000);
                                    }}
                                    className="hover:underline p-0.5"
                                    title="Salin No. SJ"
                                  >
                                    {copiedSj === item.no_sj_dealpos ? <Check className="w-2.5 h-2.5" /> : <Copy className="w-2.5 h-2.5" />}
                                  </button>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100/70 dark:bg-amber-900/40 text-[10px] font-medium text-amber-800 dark:text-amber-300 border border-amber-300/80">
                                  <Clock className="w-2.5 h-2.5" />
                                  <span>Menunggu SJ DealPOS</span>
                                </span>
                              )
                            )}
                            {item.needs_alteration && (
                              <div className="w-full mt-1.5 p-2 rounded-lg bg-rose-50/80 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-[11px] text-rose-900 dark:text-rose-200 space-y-0.5">
                                <div className="flex items-center justify-between font-bold">
                                  <span className="flex items-center gap-1">
                                    <Scissors className="w-3 h-3 text-rose-600" />
                                    <span>ID Form Alter: <strong className="font-mono text-indigo-700 dark:text-indigo-300">{item.id_form_alter || '-'}</strong></span>
                                  </span>
                                  <span className="text-[9.5px] uppercase px-1.5 py-0.5 rounded bg-rose-200 dark:bg-rose-900 text-rose-950 dark:text-rose-100 font-bold">
                                    {item.layanan_type || 'Alteration'}
                                  </span>
                                </div>
                                {item.alteration_detail && (
                                  <div className="text-slate-600 dark:text-slate-400 text-[10.5px]">
                                    <strong>Instruksi:</strong> {item.alteration_detail}
                                  </div>
                                )}
                                {item.foto_urls && item.foto_urls.length > 0 && (
                                  <div className="pt-1.5 border-t border-rose-200 dark:border-rose-900/60">
                                    <div className="flex items-center justify-between text-[10px] font-bold text-rose-800 dark:text-rose-300 mb-1">
                                      <span className="flex items-center gap-1">
                                        <Camera className="w-3 h-3 text-rose-600" />
                                        Foto Panduan Alterasi ({item.foto_urls.length})
                                      </span>
                                      <span className="text-[9px] text-emerald-600 dark:text-emerald-400 font-semibold">☁️ Google Drive</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      {item.foto_urls.map((fUrl, fIdx) => (
                                        <div
                                          key={fIdx}
                                          onClick={() => setPreviewPhotoUrl(fUrl)}
                                          className="group relative cursor-pointer rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 hover:border-rose-500 shadow-2xs"
                                        >
                                          <img src={fUrl} alt="" className="w-12 h-12 object-cover group-hover:scale-105 transition-transform" />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                            <Eye className="w-3.5 h-3.5 text-white" />
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="font-bold bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">x{item.qty}</div>
                      </div>
                    ))}
                    <div className="pt-2 font-bold text-slate-800 dark:text-white flex justify-between text-base">
                      <span>Total</span>
                      <span>{totalQty} Items</span>
                    </div>
                  </div>
                  <div className="mt-6 text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-medium text-slate-800 dark:text-slate-200">Jasa Kirim:</span> {order.jasa_kirim || '-'}
                  </div>
                  {order.no_transaksi_customer && (
                     <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                       <span className="font-medium text-slate-800 dark:text-slate-200">Order ID:</span> {order.no_transaksi_customer}
                     </div>
                  )}
                  {order.notes_paket && (
                     <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                       <span className="font-medium text-slate-800 dark:text-slate-200">Notes:</span> {order.notes_paket}
                     </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2 flex items-center justify-between">
                    <span>History & Audit Trail</span>
                    {order.history_logs && order.history_logs.length > 0 && (
                      <span className="text-[10px] font-normal text-slate-400 lowercase">
                        {order.history_logs.length} catatan
                      </span>
                    )}
                  </h3>
                  <div className="text-xs text-slate-500 dark:text-slate-400 space-y-3">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                      <div>Order was placed on <span className="font-semibold text-slate-700 dark:text-slate-300">{new Date(order.created_at || '').toLocaleString('id-ID')}</span></div>
                      {order.submitted_by && <div>Submitted by <span className="font-semibold text-slate-700 dark:text-slate-300">{formatOperatorWithPersonName(order.submitted_by)}</span></div>}
                      <div className="inline-block mt-1">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${
                          order.status === 'diterima' ? 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800' : 
                          order.status === 'diproses' ? 'border-yellow-400 dark:border-yellow-600/70 text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40' : 
                          order.status === 'dikirim' ? 'border-emerald-400 dark:border-emerald-600/70 text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' : 
                          order.status === 'batal' ? 'border-red-400 dark:border-red-600/70 text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40' : 
                          'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
                        }`}>
                          Status: {order.status}
                        </span>
                      </div>
                    </div>

                    {/* Timeline Log Catatan Perubahan & Pembatalan */}
                    {order.history_logs && order.history_logs.length > 0 && (
                      <div className="space-y-2 mt-3">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide block">
                          Log Perubahan / Pembatalan Barang:
                        </span>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                          {order.history_logs.map((log) => (
                            <div key={log.id} className="p-2.5 rounded-lg bg-amber-50/60 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-xs">
                              <div className="flex items-center justify-between text-[10px] text-amber-800 dark:text-amber-400 font-semibold mb-1">
                                <span className="flex items-center gap-1">
                                  <History className="w-3 h-3" />
                                  <span>{log.actor}</span>
                                </span>
                                <span>{new Date(log.timestamp).toLocaleString('id-ID')}</span>
                              </div>
                              <div className="text-slate-700 dark:text-slate-200 text-[11px] leading-relaxed">
                                {log.note}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handlePrintLabel = async (singleOrder?: ManualShipmentOrder) => {
    const itemsToPrint = singleOrder
      ? [singleOrder]
      : orders.filter(o => o.no_pesanan && selectedOrders.has(o.no_pesanan));

    if (itemsToPrint.length === 0) {
      onShowToast('Pilih setidaknya satu pesanan untuk dicetak labelnya', 'info');
      return;
    }

    setLoading(true);
    const qrMap: Record<string, string> = {};
    for (const order of itemsToPrint) {
      try {
        const qrDataUrl = await QRCode.toDataURL(order.no_pesanan || 'UNKNOWN', { 
          errorCorrectionLevel: 'M', 
          margin: 1, 
          width: 180 
        });
        qrMap[order.no_pesanan || ''] = qrDataUrl;
      } catch (err) {
        console.error('QR generation error:', err);
      }
    }
    setLoading(false);

    // Set payload cetak in-page (100% didukung di HP / mobile dan desktop)
    setPrintPayload({
      mode: 'LABEL',
      orders: itemsToPrint,
      qrMap,
      timestamp: Date.now(),
    });

    if (!singleOrder) {
      setSelectedOrders(new Set());
    }
    onShowToast(`Menyiapkan cetak label A6 ${itemsToPrint.length} paket`, 'success');
  };

  const handleUpdateResi = async (no_pesanan: string) => {
    const resi = prompt('Masukkan Nomor Resi:');
    if (!resi || !resi.trim()) return;
    
    const cleanResi = resi.trim();
    setLoading(true);
    const targetOrder = orders.find(o => o.no_pesanan === no_pesanan || (o as any).id === no_pesanan);
    const success = await updateShipmentResi(no_pesanan, cleanResi);
    if (success) {
      onShowToast('Resi berhasil diupdate', 'success');

      // OTOMATIS FONNTE: Kirim notifikasi WhatsApp ke Store
      const storePhone = targetOrder?.no_telp_store;
      if (storePhone && storePhone.trim()) {
        const resiMsg = `🚚 *UPDATE RESI PENGIRIMAN MANUAL SHIPMENT*
--------------------------------------------
Halo Tim *${targetOrder?.nama_pengirim || 'Store'}*, nomor resi pengiriman untuk pesanan Anda telah diperbarui di sistem WMS Gudang:

📋 *Rincian Pesanan:*
• *Order ID / No. Pesanan:* ${targetOrder?.no_transaksi_customer || targetOrder?.no_pesanan}
• *Store Pengirim:* ${targetOrder?.nama_pengirim || '-'} (PIC: ${targetOrder?.pic_store || '-'})
• *Jasa Kirim:* ${targetOrder?.jasa_kirim || '-'}
• *Nama Customer:* ${targetOrder?.nama_tujuan || '-'}
• *No. Telp Customer:* ${targetOrder?.no_telp_tujuan || '-'}

📦 *Nomor Resi Baru:*
👉 *${cleanResi}*

Status pengiriman paket telah diperbarui. Silakan simpan dan teruskan nomor resi ini kepada customer Anda.

Terima kasih!
_WMS Warehouse System_`;

        sendFonnteMessage(storePhone, resiMsg)
          .then((res) => {
            if (res.success) {
              console.log('Notifikasi WA update resi terkirim ke store:', storePhone);
            }
          })
          .catch((err) => console.warn('WA resi notice error:', err));
      }

      // NOTIFIKASI EMAIL RESI (Chocochips Official) ke Store & Customer jika dilampirkan
      if (targetOrder) {
        triggerOrderEmailNotifications(
          { ...targetOrder, no_resi: cleanResi, status: 'dikirim' },
          'status_dikirim'
        ).catch((err) => console.warn('Resi email trigger error:', err));
      }

      loadOrders();
    } else {
      onShowToast('Gagal update resi', 'error');
    }
    setLoading(false);
  };

  const handleEdit = (order: ManualShipmentOrder) => {
    // Validasi otorisasi Store: Store tidak boleh mengedit pesanan milik Store lain
    if (!userIsAdmin && userAssignedStore && order.nama_pengirim.toLowerCase().trim() !== userAssignedStore.toLowerCase().trim()) {
      onShowToast(`Anda tidak memiliki izin mengedit pesanan dari ${order.nama_pengirim}. Akun Anda terdaftar sebagai ${userAssignedStore}.`, 'error');
      return;
    }
    setEditingOrder(order);
    setPengirim(order.nama_pengirim || '');
    setPicStore(order.pic_store || '');
    setTelpPengirim(order.no_telp_store || '');
    setEmailStore(order.email_store || (order.alteration_repair_data?.pic_store_email) || '');
    setTransPengirim((order.no_transaksi_pengirim || []).join(', '));
    
    if (jasaKirimList.includes(order.jasa_kirim || '')) {
      setJasaKirim(order.jasa_kirim || '');
      setIsCustomJasaKirim(false);
    } else {
      setJasaKirim('custom');
      setCustomJasaKirim(order.jasa_kirim || '');
      setIsCustomJasaKirim(true);
    }
    
    setTujuan(order.nama_tujuan || '');
    setTelpTujuan(order.no_telp_tujuan || '');
    setEmailCustomer(order.email_customer || '');
    setAlamatTujuan(order.alamat_tujuan || '');
    setNotesPaket(order.notes_paket || '');
    setTransCustomer(order.no_transaksi_customer || '');
    setItems(order.items || []);
    
    setActiveTab('form');
  };

  const handleDelete = async (no_pesanan: string) => {
    if (!confirm(`Yakin ingin menghapus pesanan ${no_pesanan}?`)) return;
    setLoading(true);
    const success = await deleteManualShipment(no_pesanan);
    if (success) {
      onShowToast('Pesanan berhasil dihapus', 'success');
      loadOrders();
    } else {
      onShowToast('Gagal hapus pesanan', 'error');
    }
    setLoading(false);
  };

  /**
   * Action Handler: Batalkan Pesanan Manual Shipment
   * Status diubah menjadi 'batal', alasan pembatalan dicatat ke audit trail history_logs,
   * histori tetap tersimpan permanen di sistem, dan notifikasi WA dikirim via Fonnte jika dipilih.
   */
  const handleConfirmCancelOrder = async (
    order: ManualShipmentOrder,
    reason: string,
    notes: string,
    sendWa: boolean
  ) => {
    setIsSubmittingCancel(true);
    try {
      const actor = session?.name || getUserPersonName(session?.username) || 'Admin';
      const nowStr = new Date().toISOString();
      const reasonText = reason === 'Lainnya (Tuliskan alasan spesifik)' && notes
        ? notes
        : `${reason}${notes ? ` - ${notes}` : ''}`;

      const cancelLog = {
        id: `hist_cancel_${Date.now()}`,
        timestamp: nowStr,
        actor,
        action: 'cancelled_all' as const,
        note: `Pesanan dibatalkan. Alasan: ${reasonText}`,
      };

      const existingLogs = Array.isArray(order.history_logs) ? order.history_logs : [];
      const updatedLogs = [...existingLogs, cancelLog];

      // Tandai status items juga agar konsisten
      const updatedItems = (order.items || []).map((it) => ({
        ...it,
        item_status: 'cancelled' as const,
      }));

      const dateIdStr = new Date().toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      const updatedOrder: ManualShipmentOrder = {
        ...order,
        status: 'batal',
        items: updatedItems,
        history_logs: updatedLogs,
        notes_paket: `${order.notes_paket || ''}\n[BATAL]: Alasan: ${reasonText} (oleh ${actor} pada ${dateIdStr})`.trim(),
      };

      const res = await editManualShipment(updatedOrder);
      if (res.success) {
        onShowToast(`Pesanan ${order.no_pesanan} berhasil dibatalkan. Histori tersimpan.`, 'success');

        // Kirim notifikasi WA pembatalan via Fonnte jika diminta
        if (sendWa && order.no_telp_store && order.no_telp_store.trim()) {
          const fonnteCfg = getFonnteConfig();
          if (fonnteCfg.token) {
            const waCancelMsg = `🚫 *PEMBATALAN PESANAN MANUAL SHIPMENT*\n--------------------------------------------\nHalo Tim *${order.nama_pengirim || 'Store'}*, pesanan berikut telah dibatalkan di sistem WMS Gudang:\n\n📋 *Rincian Pesanan:*\n• *Order ID / No. Pesanan:* ${order.no_transaksi_customer || order.no_pesanan}\n• *Store Pengirim:* ${order.nama_pengirim || '-'} (PIC: ${order.pic_store || '-'})\n• *Customer Tujuan:* ${order.nama_tujuan || '-'} (${order.no_telp_tujuan || '-'})\n• *Alamat:* ${order.alamat_tujuan || '-'}\n• *Total Produk:* ${order.items?.length || 0} item\n\n⚠️ *Alasan Pembatalan:*\n👉 *${reasonText}*\n• *Dibatalkan Oleh:* ${actor} (${dateIdStr})\n\nHistori pesanan ini tetap disimpan di sistem rekap WMS untuk kebutuhan pelacakan & audit.\nTerima kasih!\n_WMS Warehouse System_`;

            sendFonnteMessage(order.no_telp_store, waCancelMsg, fonnteCfg.token)
              .then((r) => {
                if (r.success) {
                  onShowToast('✅ Notif pembatalan terkirim ke WA Store via Fonnte!', 'success');
                } else {
                  console.warn('Fonnte cancel notice warning:', r.message);
                }
              })
              .catch((err) => console.warn('Fonnte cancel error:', err));

            if (fonnteCfg.groupTarget && fonnteCfg.groupTarget.trim()) {
              sendFonnteMessage(fonnteCfg.groupTarget, waCancelMsg, fonnteCfg.token).catch(() => {});
            }
          }
        }

        // NOTIFIKASI EMAIL PEMBATALAN (Chocochips Official) ke Store & Customer jika dilampirkan
        triggerOrderEmailNotifications(updatedOrder, 'status_batal', reasonText)
          .catch((err) => console.warn('Cancel email error:', err));

        setCancelModalOrder(null);
        if (selectedOrderDetails?.no_pesanan === order.no_pesanan) {
          setSelectedOrderDetails(updatedOrder);
        }
        await loadOrders();
      } else {
        onShowToast(`Gagal membatalkan pesanan: ${res.message}`, 'error');
      }
    } catch (err: any) {
      console.error('Error saat batalkan pesanan:', err);
      onShowToast(`Error: ${err?.message || 'Gagal membatalkan pesanan'}`, 'error');
    } finally {
      setIsSubmittingCancel(false);
    }
  };

  const filteredOrders = useMemo(() => {
    let result = orders;

    // Proteksi Keamanan: Akun Store hanya boleh melihat pesanan tokonya sendiri
    if (!userIsAdmin && userAssignedStore) {
      result = result.filter(o => 
        (o.nama_pengirim || '').toLowerCase().trim() === userAssignedStore.toLowerCase().trim()
      );
    }

    // Filter Jenis Pesanan (Manual Shipment vs Alteration & Repair vs Manual With Alter)
    if (filterOrderType !== 'all') {
      result = result.filter(o => {
        const isAr = o.order_type === 'alteration_repair' || (o.no_pesanan || '').toUpperCase().startsWith('AR-') || !!o.alteration_repair_data;
        const hasAlterItem = (o.items || []).some(
          (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail
        );
        if (filterOrderType === 'alteration_repair') return isAr;
        if (filterOrderType === 'manual_with_alter') return !isAr && hasAlterItem;
        if (filterOrderType === 'manual_shipment') return !isAr && !hasAlterItem;
        return true;
      });
    }

    // Filter Status Alteration Dropdown
    if (filterAlterStatus !== 'all') {
      result = result.filter(o => {
        const isAr = o.order_type === 'alteration_repair' || (o.no_pesanan || '').toUpperCase().startsWith('AR-') || !!o.alteration_repair_data;
        const hasAlterItem = (o.items || []).some(
          (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail
        );
        if (filterAlterStatus === 'manual_with_alter') return !isAr && hasAlterItem;
        if (filterAlterStatus === 'all_alter') return isAr || hasAlterItem;
        if (filterAlterStatus === 'no_alter') return !isAr && !hasAlterItem;
        return true;
      });
    }
    
    // Status filter
    if (filterStatus !== 'all') {
      const targetStatus = filterStatus.toLowerCase().trim();
      result = result.filter(o => {
        const s = (o.status || '').toLowerCase().trim();
        if (targetStatus === 'pending') {
          return s === 'pending' || s === 'menunggu' || s === 'diajukan' || !s;
        }
        if (targetStatus === 'diterima') {
          return s === 'diterima' || s === 'terima';
        }
        if (targetStatus === 'diproses') {
          return s === 'diproses' || s === 'proses' || s === 'proses_packing' || s === 'sedang_diproses';
        }
        if (targetStatus === 'dikirim') {
          return s === 'dikirim' || s === 'kirim';
        }
        if (targetStatus === 'batal') {
          return s === 'batal' || s === 'cancelled' || s === 'canceled';
        }
        return s === targetStatus;
      });
    }
    
    // Store filter
    if (filterStore !== 'all') {
      const targetStore = filterStore.toLowerCase().trim();
      result = result.filter(o => {
        const sender = (o.nama_pengirim || '').toLowerCase().trim();
        return sender === targetStore || sender.includes(targetStore) || targetStore.includes(sender);
      });
    }

    // Jasa Kirim filter
    if (filterJasaKirim !== 'all') {
      const targetJk = filterJasaKirim.toLowerCase().trim();
      result = result.filter(o => (o.jasa_kirim || '').toLowerCase().trim() === targetJk);
    }
    
    // Date filter
    if (filterStartDate) {
      const start = new Date(filterStartDate);
      start.setHours(0, 0, 0, 0);
      result = result.filter(o => {
        const rawDate = o.created_at || (o as any).tanggal;
        if (!rawDate) return false;
        const d = new Date(rawDate);
        return !isNaN(d.getTime()) && d >= start;
      });
    }
    if (filterEndDate) {
      const end = new Date(filterEndDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(o => {
        const rawDate = o.created_at || (o as any).tanggal;
        if (!rawDate) return false;
        const d = new Date(rawDate);
        return !isNaN(d.getTime()) && d <= end;
      });
    }

    // Filter DealPOS Surat Jalan (Khusus produk fulfilment Marketplace)
    if (filterDealposSj === 'need_sj') {
      result = result.filter(o => 
        (o.items || []).some(it => 
          (it.fulfillment || '').toLowerCase().includes('marketplace') && !it.no_sj_dealpos
        )
      );
    } else if (filterDealposSj === 'has_sj') {
      result = result.filter(o => 
        (o.items || []).some(it => 
          (it.fulfillment || '').toLowerCase().includes('marketplace') && !!it.no_sj_dealpos
        )
      );
    }

    // Filter Khusus Pesanan yang Mengalami Sold Out
    if (filterSoldStatus === 'has_sold') {
      result = result.filter(o => 
        (o.items || []).some(it => it.item_status === 'sold_out')
      );
    }

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(o => 
        (o.no_pesanan && o.no_pesanan.toLowerCase().includes(q)) ||
        (o.no_transaksi_customer && o.no_transaksi_customer.toLowerCase().includes(q)) ||
        (o.jasa_kirim && o.jasa_kirim.toLowerCase().includes(q)) ||
        (o.no_transaksi_pengirim && o.no_transaksi_pengirim.some(p => p.toLowerCase().includes(q))) ||
        (o.nama_tujuan && o.nama_tujuan.toLowerCase().includes(q)) ||
        (o.nama_pengirim && o.nama_pengirim.toLowerCase().includes(q)) ||
        (o.no_resi && o.no_resi.toLowerCase().includes(q)) ||
        (o.no_telp_tujuan && o.no_telp_tujuan.toLowerCase().includes(q)) ||
        (o.items && o.items.some(i => i.nama_produk?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q) || i.no_sj_dealpos?.toLowerCase().includes(q)))
      );
    }
    
    return result;
  }, [
    orders,
    searchTerm,
    filterStore,
    filterJasaKirim,
    filterStatus,
    filterStartDate,
    filterEndDate,
    filterDealposSj,
    filterSoldStatus,
    filterOrderType,
    filterAlterStatus,
    userIsAdmin,
    userAssignedStore,
  ]);

    // Hitung jumlah order yang memiliki produk Marketplace yang butuh No SJ DealPOS
  const pendingSjCount = useMemo(() => {
    return orders.filter(o => 
      (o.items || []).some(it => 
        (it.fulfillment || '').toLowerCase().includes('marketplace') && !it.no_sj_dealpos
      )
    ).length;
  }, [orders]);

  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      onShowToast('Tidak ada data untuk diexport', 'warning');
      return;
    }
    
    // Standar format database seperti yang diterapkan di sheet:
    // Setiap baris merepresentasikan 1 item produk dengan kolom terpisah:
    // SKU | Nama produk | size | qty
    const headers = [
      'Order ID',
      'Tanggal',
      'Pengirim',
      'PIC Store',
      'No Telp Pengirim',
      'No Transaksi DealPOS',
      'Nama Tujuan',
      'No Telp Tujuan',
      'Alamat Tujuan',
      'Jasa Kirim',
      'No Resi',
      'Status',
      'Notes Paket',
      'Submitted By',
      'SKU',
      'Nama Produk',
      'Size',
      'Qty',
      'Fulfillment',
      'No SJ DealPOS',
    ];

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows: string[] = [];

    filteredOrders.forEach((o) => {
      const orderDate = o.created_at ? new Date(o.created_at).toLocaleDateString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }) : '';

      const dealposStr = Array.isArray(o.no_transaksi_pengirim)
        ? o.no_transaksi_pengirim.join('; ')
        : (o.no_transaksi_pengirim || '');

      const baseOrderCols = [
        o.no_pesanan || '',
        orderDate,
        o.nama_pengirim || '',
        o.pic_store || '',
        o.no_telp_store || '',
        dealposStr,
        o.nama_tujuan || '',
        o.no_telp_tujuan || '',
        o.alamat_tujuan || '',
        o.jasa_kirim || '',
        o.no_resi || '',
        o.status || '',
        o.notes_paket || '',
        o.submitted_by || '',
      ];

      if (o.items && o.items.length > 0) {
        o.items.forEach((it) => {
          let size = it.size || '';
          if (!size && it.nama_produk) {
            const parts = it.nama_produk.split('-');
            if (parts.length > 1) {
              size = parts[parts.length - 1].trim();
            }
          }

          const rowCols = [
            ...baseOrderCols,
            it.sku || '',
            it.nama_produk || '',
            size,
            it.qty || 1,
            it.fulfillment || '',
          it.no_sj_dealpos || '',
          ];

          rows.push(rowCols.map(escapeCsv).join(','));
        });
      } else {
        const rowCols = [
          ...baseOrderCols,
          '',
          '',
          '',
          '',
          '',
        ];
        rows.push(rowCols.map(escapeCsv).join(','));
      }
    });

    // Tambahkan UTF-8 BOM (\uFEFF) agar terbaca sempurna di Microsoft Excel dan Google Databases
    const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `manual_shipment_database_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowToast(`Berhasil mengekspor ${rows.length} baris data ke format database`, 'success');
  };

  const renderRekap = () => {
    const totalArCount = orders.filter(o => o.order_type === 'alteration_repair' || (o.no_pesanan || '').toUpperCase().startsWith('AR-') || !!o.alteration_repair_data).length;
    const totalManualWithAlterCount = orders.filter(o => {
      const isAr = o.order_type === 'alteration_repair' || (o.no_pesanan || '').toUpperCase().startsWith('AR-') || !!o.alteration_repair_data;
      return !isAr && (o.items || []).some(
        (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail
      );
    }).length;
    const totalManualPureCount = orders.filter(o => {
      const isAr = o.order_type === 'alteration_repair' || (o.no_pesanan || '').toUpperCase().startsWith('AR-') || !!o.alteration_repair_data;
      const hasAlter = (o.items || []).some(
        (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail
      );
      return !isAr && !hasAlter;
    }).length;
    const unassignedResiCount = orders.filter(o => o.status !== 'batal' && !(o.no_resi || '').trim()).length;

    const selectedAlterOrders = orders.filter(o => {
      if (!selectedOrders.has(o.no_pesanan)) return false;
      const isAr = o.order_type === 'alteration_repair' || (o.no_pesanan || '').toUpperCase().startsWith('AR-') || !!o.alteration_repair_data;
      return isAr || (o.items || []).some(it => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail);
    });

    return (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-full min-h-[600px] transition-colors">
      <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3 bg-slate-50 dark:bg-slate-800/60">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white flex items-center">
              <FileText className="w-5 h-5 mr-1.5 sm:mr-2 text-indigo-600 dark:text-indigo-400 shrink-0" />
              Rekap Pesanan Toko
            </h2>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-200/80 dark:bg-slate-700/80 px-2.5 py-0.5 rounded-full">
              {filteredOrders.length} Pesanan
            </span>

            {/* Quick Filter Jenis Pesanan */}
            <div className="inline-flex p-0.5 bg-slate-200/70 dark:bg-slate-700/60 rounded-lg text-xs font-bold flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setFilterOrderType('all');
                  setFilterAlterStatus('all');
                }}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterOrderType === 'all' && filterAlterStatus === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                }`}
              >
                Semua ({orders.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterOrderType('manual_shipment');
                  setFilterAlterStatus('all');
                }}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  filterOrderType === 'manual_shipment' && filterAlterStatus === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'
                }`}
              >
                <Package className="w-3 h-3" />
                <span>Manual Shipment ({totalManualPureCount})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterOrderType('manual_with_alter');
                  setFilterAlterStatus('all');
                }}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  filterOrderType === 'manual_with_alter'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-rose-700 dark:text-rose-400 hover:text-rose-900 dark:hover:text-rose-300 bg-rose-50/70 dark:bg-rose-950/40'
                }`}
                title="Filter hanya pesanan Manual Shipment yang memiliki item permintaan alteration"
              >
                <Scissors className="w-3 h-3" />
                <span>Manual + Alter ({totalManualWithAlterCount})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterOrderType('alteration_repair');
                  setFilterAlterStatus('all');
                }}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer flex items-center gap-1 ${
                  filterOrderType === 'alteration_repair'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-300 hover:text-purple-600'
                }`}
              >
                <Scissors className="w-3 h-3" />
                <span>Alter & Repair Standalone ({totalArCount})</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {/* Tombol Update Resi Massal */}
            <button
              onClick={() => setIsBulkResiModalOpen(true)}
              className="px-2.5 py-1.5 text-indigo-700 dark:text-indigo-300 hover:text-indigo-900 bg-indigo-50 dark:bg-indigo-950/70 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 text-xs font-bold cursor-pointer"
              title="Update No. Resi Massal via Input Tabel Langsung atau Import CSV"
            >
              <Truck className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Update Resi Massal</span>
              {unassignedResiCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-2xs">
                  {unassignedResiCount}
                </span>
              )}
            </button>

            <button
              onClick={handleExportCSV}
              className="px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="Export CSV Format Database (SKU, Nama, Size, Qty)"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">Export</span>
            </button>
            <button
              onClick={loadOrders}
              className="px-2.5 py-1.5 flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer text-xs font-semibold"
              title="Refresh delta (hanya data baru)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={forceReloadOrders}
              className="px-2.5 py-1.5 flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800/60 rounded-lg shadow-xs transition-colors cursor-pointer text-xs font-semibold"
              title="Muat ulang SEMUA data dari awal (reset cache lokal)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Muat Ulang Penuh</span>
            </button>
            
            <div className="flex border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800 shadow-xs">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  viewMode === 'table' 
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 font-bold' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                Tabel
              </button>
              <button
                onClick={() => setViewMode('card')}
                className={`px-2.5 py-1.5 text-xs font-semibold border-l border-slate-200 dark:border-slate-700 transition-colors cursor-pointer ${
                  viewMode === 'card' 
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 font-bold' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                Kartu
              </button>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari Order ID, DealPOS, Jasa Kirim, resi..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-2 sm:flex items-center gap-1.5 flex-wrap">
            <select
              value={filterStore}
              onChange={(e) => setFilterStore(e.target.value)}
              className="py-1.5 px-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 truncate"
            >
              <option value="all">Semua Store</option>
              {outlets.map((o, idx) => (
                <option key={idx} value={o.nama}>{o.nama}</option>
              ))}
            </select>

            <select
              value={filterJasaKirim}
              onChange={(e) => setFilterJasaKirim(e.target.value)}
              className="py-1.5 px-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 truncate"
            >
              <option value="all">Semua Jasa Kirim</option>
              {jasaKirimList.map((jk, idx) => (
                <option key={idx} value={jk}>{jk}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="py-1.5 px-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Semua Status</option>
              <option value="pending">Pending</option>
              <option value="diterima">Diterima</option>
              <option value="diproses">Diproses</option>
              <option value="dikirim">Dikirim</option>
              <option value="batal">Batal</option>
            </select>

            {/* Filter Alteration */}
            <select
              value={filterAlterStatus}
              onChange={(e) => setFilterAlterStatus(e.target.value as any)}
              className={`py-1.5 px-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-rose-500 font-medium ${
                filterAlterStatus === 'manual_with_alter'
                  ? 'bg-rose-50 dark:bg-rose-950/70 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200 font-bold'
                  : filterAlterStatus === 'all_alter'
                  ? 'bg-purple-50 dark:bg-purple-950/70 border-purple-300 dark:border-purple-700 text-purple-900 dark:text-purple-200 font-bold'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white'
              }`}
            >
              <option value="all">Semua Kondisi Alter</option>
              <option value="manual_with_alter">✂️ Manual Shipment + Alter ({totalManualWithAlterCount})</option>
              <option value="all_alter">✂️ Semua Disertai Alter ({totalManualWithAlterCount + totalArCount})</option>
              <option value="no_alter">📦 Tanpa Alteration</option>
            </select>

            {/* Filter Khusus Surat Jalan DealPOS untuk Fulfilment Marketplace */}
            <select
              value={filterDealposSj}
              onChange={(e) => setFilterDealposSj(e.target.value as any)}
              className={`py-1.5 px-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-amber-500 font-medium ${
                filterDealposSj === 'need_sj'
                  ? 'bg-amber-50 dark:bg-amber-950/70 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                  : filterDealposSj === 'has_sj'
                  ? 'bg-emerald-50 dark:bg-emerald-950/70 border-emerald-300 dark:border-emerald-700 text-emerald-900 dark:text-emerald-200'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white'
              }`}
            >
              <option value="all">Semua Fulfilment</option>
              <option value="need_sj">
                ⚡ Butuh SJ DealPOS {pendingSjCount > 0 ? `(${pendingSjCount})` : ''}
              </option>
              <option value="has_sj">✅ Ada SJ DealPOS</option>
            </select>

            {/* Filter Status Stok: Item Sold Out */}
            <select
              value={filterSoldStatus}
              onChange={(e) => setFilterSoldStatus(e.target.value as any)}
              className={`py-1.5 px-2 text-xs border rounded-lg focus:outline-none focus:ring-1 focus:ring-red-500 font-medium ${
                filterSoldStatus === 'has_sold'
                  ? 'bg-red-50 dark:bg-red-950/70 border-red-300 dark:border-red-700 text-red-900 dark:text-red-200'
                  : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white'
              }`}
            >
              <option value="all">Semua Kondisi Stok</option>
              <option value="has_sold">🔴 Ada Item Sold Out</option>
            </select>
            
            <div className="flex items-center gap-1 col-span-2 sm:col-span-1">
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="py-1.5 px-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">-</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="py-1.5 px-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full"
              />
            </div>

            {/* Tombol Reset Semua Filter */}
            {(searchTerm || filterStore !== 'all' || filterJasaKirim !== 'all' || filterStatus !== 'all' || filterAlterStatus !== 'all' || filterOrderType !== 'all' || filterDealposSj !== 'all' || filterSoldStatus !== 'all' || filterStartDate || filterEndDate) && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setFilterStore('all');
                  setFilterJasaKirim('all');
                  setFilterStatus('all');
                  setFilterAlterStatus('all');
                  setFilterOrderType('all');
                  setFilterDealposSj('all');
                  setFilterSoldStatus('all');
                  setFilterStartDate('');
                  setFilterEndDate('');
                }}
                className="px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 border border-rose-200 dark:border-rose-800 rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer"
                title="Reset semua filter kembali ke awal"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Filter</span>
              </button>
            )}
          </div>
        </div>

        {canAction && selectedOrders.size > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/80 flex-wrap">
            <button
              onClick={handlePrintPickingList}
              className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/60 text-xs font-semibold flex items-center transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Cetak Picking ({selectedOrders.size})
            </button>
            <button
              onClick={() => handlePrintLabel()}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs font-semibold flex items-center transition-colors cursor-pointer shadow-xs"
              title="Cetak Label Paket A6 untuk pesanan yang dipilih"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Cetak Label A6 ({selectedOrders.size})
            </button>
            {selectedAlterOrders.length > 0 && (
              <button
                onClick={() => handlePrintAlterWorkOrder(selectedAlterOrders)}
                className="px-3 py-1.5 bg-rose-600 text-white rounded-lg hover:bg-rose-700 text-xs font-semibold flex items-center transition-colors cursor-pointer shadow-xs animate-in fade-in"
                title="Cetak Surat Perintah Kerja (SPK) Penjahit & Rincian Alterasi"
              >
                <Scissors className="w-3.5 h-3.5 mr-1.5" />
                Cetak SPK Penjahit ({selectedAlterOrders.length})
              </button>
            )}
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-900/50">
        {viewMode === 'table' ? (
          <table className="min-w-full">
            <thead className="bg-white dark:bg-slate-800/90 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 backdrop-blur-xs">
              <tr>
                {userIsAdmin && (
                  <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal w-10">
                    <input
                      type="checkbox"
                      className="rounded-sm border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                      onChange={(e) => {
                        if (e.target.checked) setSelectedOrders(new Set(filteredOrders.map(o => o.no_pesanan)));
                        else setSelectedOrders(new Set());
                      }}
                      checked={filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length}
                    />
                  </th>
                )}
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Order</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Date</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Store / Pengirim</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Customer</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Ekspedisi</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">No. Resi</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Status</th>
                <th scope="col" className="px-3 py-2 text-center text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Total Items</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">SJ DealPOS (MKT)</th>
                {userIsAdmin && (
                  <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={userIsAdmin ? 11 : 9} className="px-3 py-8 text-center text-[11px] text-slate-500 dark:text-slate-400">
                    {searchTerm ? 'Tidak ada pesanan yang cocok dengan pencarian' : 'Tidak ada data pesanan'}
                  </td>
                </tr>
              ) : (
              filteredOrders.map((order) => (
                <tr key={order.no_pesanan} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  {userIsAdmin && (
                    <td className="px-3 py-2.5 whitespace-nowrap align-top">
                      <input
                        type="checkbox"
                        className="rounded-sm border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer mt-0.5"
                        checked={selectedOrders.has(order.no_pesanan)}
                        onChange={() => toggleSelectOrder(order.no_pesanan)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <div 
                      className="text-[11px] font-semibold text-[#00a8e8] dark:text-sky-400 hover:underline cursor-pointer"
                      onClick={() => setSelectedOrderDetails(order)}
                    >
                      {order.no_pesanan}
                    </div>
                    {(() => {
                      const isAr = order.order_type === 'alteration_repair' || (order.no_pesanan || '').toUpperCase().startsWith('AR-') || !!order.alteration_repair_data;
                      if (isAr) {
                        const ar = order.alteration_repair_data;
                        const layanan = ar?.layanan_type || order.layanan_type || 'both';
                        const layananText = layanan === 'alteration' ? 'ALTER' : layanan === 'repair' ? 'REPAIR' : 'ALTER + REPAIR';
                        const flowStage = ar?.status_flow || 'diajukan';

                        let stageBadge = 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300';
                        let stageText = 'Menunggu Kirim';
                        if (flowStage === 'dikirim_store') {
                          stageBadge = 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300';
                          stageText = 'Dikirim ke Gudang';
                        } else if (flowStage === 'diterima_warehouse') {
                          stageBadge = 'bg-indigo-100 text-indigo-800 border-indigo-300 dark:bg-indigo-950/60 dark:text-indigo-300';
                          stageText = 'Diterima di Gudang';
                        } else if (flowStage === 'dalam_pengerjaan') {
                          stageBadge = 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/60 dark:text-purple-300';
                          stageText = 'Sedang Pengerjaan';
                        } else if (flowStage === 'selesai_qc') {
                          stageBadge = 'bg-teal-100 text-teal-800 border-teal-300 dark:bg-teal-950/60 dark:text-teal-300';
                          stageText = 'Selesai QC';
                        } else if (flowStage === 'dikirim_kembali') {
                          stageBadge = 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300';
                          stageText = 'Dikirim Kembali';
                        } else if (flowStage === 'selesai') {
                          stageBadge = 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300';
                          stageText = 'Selesai';
                        }

                        return (
                          <div className="mt-1 flex flex-col gap-1 items-start">
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              <Scissors className="w-2.5 h-2.5 text-rose-600" />
                              {layananText}
                            </span>
                            <span className={`inline-flex items-center text-[8.5px] font-bold px-1.5 py-0.2 rounded border ${stageBadge}`}>
                              {stageText}
                            </span>
                          </div>
                        );
                      }

                      // Badge Penanda Khusus Manual Shipment yang Disertai Alter
                      const alterItems = (order.items || []).filter(
                        (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail
                      );
                      if (alterItems.length > 0) {
                        return (
                          <div className="mt-1 flex flex-col gap-1 items-start">
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-2xs">
                              <Scissors className="w-2.5 h-2.5 text-rose-600 animate-pulse" />
                              <span>Disertai Alter ({alterItems.length} Item)</span>
                            </span>
                          </div>
                        );
                      }

                      return null;
                    })()}
                    {order.no_transaksi_customer && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        ID: {order.no_transaksi_customer}
                      </div>
                    )}
                    {order.no_transaksi_pengirim && order.no_transaksi_pengirim.length > 0 && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        DPOS: {order.no_transaksi_pengirim.join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      {new Date(order.created_at || '').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="text-[11px] font-semibold text-slate-800 dark:text-white">{order.nama_pengirim}</div>
                    {order.pic_store && <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">PIC: {order.pic_store}</div>}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div 
                      className="text-[11px] font-medium text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer inline-flex transition-colors"
                      onClick={() => setSelectedOrderDetails(order)}
                    >
                      {order.nama_tujuan}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[160px] mt-0.5" title={order.alamat_tujuan}>
                      {order.alamat_tujuan}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <div className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5 font-medium">{order.jasa_kirim || '-'}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    {order.no_resi ? (
                      <div className="flex flex-col gap-1 items-start">
                        <div className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 rounded-md px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-800 dark:text-emerald-300">
                          <Truck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>{order.no_resi}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(order.no_resi || '', `No. Resi ${order.no_resi} berhasil disalin!`);
                              setCopiedResi(order.no_pesanan);
                              setTimeout(() => setCopiedResi(null), 2000);
                            }}
                            className="ml-1 p-0.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-950 dark:hover:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded cursor-pointer transition-colors"
                            title="Salin No. Resi"
                          >
                            {copiedResi === order.no_pesanan ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWaModalOrder(order);
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 bg-emerald-100/70 dark:bg-emerald-950/60 hover:bg-emerald-200/70 dark:hover:bg-emerald-900/80 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60 transition-colors cursor-pointer"
                          title="Format pesan WhatsApp untuk customer"
                        >
                          <MessageCircle className="w-2.5 h-2.5" />
                          <span>WA Customer</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/50 font-medium">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>Menunggu Resi</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <span className={`mt-0.5 px-2 py-0.5 inline-block text-[10px] font-semibold rounded-md border ${
                      order.status === 'diterima' ? 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800' : 
                      order.status === 'diproses' ? 'border-yellow-400 dark:border-yellow-600/70 text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40' : 
                      order.status === 'dikirim' ? 'border-emerald-400 dark:border-emerald-600/70 text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' : 
                      order.status === 'batal' ? 'border-red-400 dark:border-red-600/70 text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40' : 
                      'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
                    }`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-top text-center">
                    <button 
                      type="button"
                      onClick={() => setSelectedOrderDetails(order)}
                      className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-2.5 py-1 rounded-md border border-indigo-100 dark:border-indigo-800/80 transition-colors cursor-pointer"
                    >
                      {order.items?.reduce((acc, it) => acc + (Number(it.qty) || 0), 0) || 0} Items
                    </button>
                    {(() => {
                      const isAr = order.order_type === 'alteration_repair' || (order.no_pesanan || '').toUpperCase().startsWith('AR-') || !!order.alteration_repair_data;
                      const alterItems = (order.items || []).filter(it => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail);
                      if (!isAr && alterItems.length > 0) {
                        const alterPhotoCount = (order.items || []).reduce((acc, it) => acc + (it.foto_urls?.length || 0), 0);
                        return (
                          <div className="flex flex-col items-center gap-0.5 mt-1">
                            <div className="text-[9px] font-bold text-rose-600 dark:text-rose-400 flex items-center justify-center gap-0.5">
                              <Scissors className="w-2.5 h-2.5" />
                              <span>{alterItems.length} alter</span>
                            </div>
                            {alterPhotoCount > 0 && (
                              <span className="text-[8.5px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-0.5">
                                <Camera className="w-2.5 h-2.5" />
                                <span>{alterPhotoCount} foto</span>
                              </span>
                            )}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </td>
                  <td className="px-3 py-2.5 align-top min-w-[200px] max-w-[280px]">
                    {(() => {
                      const mktItems = (order.items || []).filter(it => (it.fulfillment || '').toLowerCase().includes('marketplace'));
                      if (mktItems.length === 0) {
                        return <span className="text-[10px] text-slate-400 dark:text-slate-500">-</span>;
                      }
                      const sjList = Array.from(new Set(mktItems.map(it => it.no_sj_dealpos).filter(Boolean)));
                      const hasMissingSj = mktItems.some(it => !it.no_sj_dealpos);

                      return (
                        <div className="flex flex-col gap-1.5 items-start">
                          {/* Status Badge & Tombol Input SJ */}
                          <div className="flex items-center justify-between w-full gap-1.5 flex-wrap">
                            {hasMissingSj ? (
                              <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-700/80 rounded px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300">
                                <Clock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                <span>{mktItems.filter(i => !i.no_sj_dealpos).length} Item Butuh SJ</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-700/80 rounded px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300">
                                <FileCheck className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                                <span>SJ Lengkap</span>
                              </span>
                            )}

                            {userIsAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSjModalData({
                                    order,
                                    noSj: sjList[0] || '',
                                    applyToAllMarketplace: true
                                  });
                                }}
                                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                              >
                                {sjList.length > 0 ? 'Edit SJ' : '+ Input SJ DealPOS'}
                              </button>
                            )}
                          </div>

                          {/* List Produk Marketplace Langsung di Tabel */}
                          <div className="w-full space-y-1 bg-slate-50 dark:bg-slate-800/60 p-1.5 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                            {mktItems.map((it, idx) => (
                              <div key={it.id || idx} className="text-[11px] leading-tight flex flex-col gap-0.5 pb-1 border-b border-slate-200/60 dark:border-slate-700/60 last:border-0 last:pb-0">
                                <div className="flex items-start justify-between gap-1">
                                  <div className="font-semibold text-slate-800 dark:text-slate-100 truncate" title={it.nama_produk}>
                                    {it.nama_produk}
                                  </div>
                                  <span className="font-bold text-slate-700 dark:text-slate-300 text-[10px] shrink-0 bg-white dark:bg-slate-900 px-1 py-0.2 rounded border border-slate-200 dark:border-slate-700">
                                    x{it.qty}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400 flex-wrap">
                                  <span className="font-mono text-indigo-600 dark:text-indigo-400 font-semibold">{it.sku}</span>
                                  {it.size && it.size !== 'ALL' && it.size !== '-' && <span>• {it.size}</span>}
                                </div>
                                {/* Status Item: Ready vs Sold Out */}
                                {it.item_status === 'sold_out' ? (
                                  <div className="mt-1 p-1 bg-red-100/80 dark:bg-red-950/70 border border-red-300 dark:border-red-800 rounded flex flex-col gap-0.5">
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="text-[9.5px] font-bold text-red-700 dark:text-red-300 flex items-center gap-1">
                                        <Ban className="w-2.5 h-2.5" />
                                        <span>SOLD OUT</span>
                                      </span>
                                      {userIsAdmin && (
                                        <button
                                          type="button"
                                          onClick={() => handleRestoreSoldItem(order, it)}
                                          className="text-[9px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                                          title="Pulihkan jadi Ready"
                                        >
                                          <RotateCcw className="w-2.5 h-2.5" />
                                          <span>Pulihkan</span>
                                        </button>
                                      )}
                                    </div>
                                    {it.sold_note && (
                                      <span className="text-[9px] text-red-600 dark:text-red-400 italic truncate" title={it.sold_note}>
                                        {it.sold_note}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <div className="mt-0.5 flex items-center justify-between gap-1 flex-wrap">
                                    {it.no_sj_dealpos ? (
                                      <div className="inline-flex items-center gap-1 font-mono text-[9.5px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100/60 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded w-fit">
                                        <FileCheck className="w-2.5 h-2.5 text-emerald-600" />
                                        <span>SJ: {it.no_sj_dealpos}</span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(it.no_sj_dealpos || '', `No. SJ ${it.no_sj_dealpos} disalin!`);
                                            setCopiedSj(it.no_sj_dealpos || null);
                                            setTimeout(() => setCopiedSj(null), 2000);
                                          }}
                                          className="hover:underline p-0.5 text-emerald-600"
                                          title="Salin No. SJ"
                                        >
                                          {copiedSj === it.no_sj_dealpos ? <Check className="w-2.5 h-2.5 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="text-[9.5px] text-amber-700 dark:text-amber-400 font-medium">
                                        ⏳ Menunggu SJ DealPOS
                                      </div>
                                    )}

                                    {userIsAdmin && order.status !== 'batal' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const isMulti = (order.items || []).length > 1;
                                          setSoldModalData({
                                            order,
                                            item: it,
                                            resolution: isMulti ? 'partial_fulfill' : 'cancel_order',
                                            note: 'Stok kosong di alokasi DealPOS Marketplace.',
                                            sendWaToStore: true
                                          });
                                        }}
                                        className="text-[9px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800/60 cursor-pointer flex items-center gap-0.5"
                                        title="Tandai stok ini kosong / sold"
                                      >
                                        <AlertOctagon className="w-2.5 h-2.5" />
                                        <span>Tandai Sold</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  {userIsAdmin && (
                    <td className="px-3 py-2.5 whitespace-nowrap text-right align-top">
                      <select
                        className="text-[10px] text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm font-medium"
                        onChange={(e) => {
                          const action = e.target.value;
                          if (action === 'print') handlePrintLabel(order);
                          if (action === 'spk_penjahit') handlePrintAlterWorkOrder(order);
                          if (action === 'spk') setArReceiptOrder(order);
                          if (action === 'sj_struk') setSjAlterModalOrder(order);
                          if (action === 'mark_sent') setAlterActionData({ order, actionType: 'mark_sent_store' });
                          if (action === 'mark_received') setAlterActionData({ order, actionType: 'mark_received_warehouse' });
                          if (action === 'complete_ship') setAlterActionData({ order, actionType: 'complete_and_ship' });
                          if (action === 'edit') {
                            handleEdit(order);
                            setActiveTab('form');
                          }
                          if (action === 'sj_dealpos') {
                            setSjModalData({
                              order,
                              noSj: (order.items || []).find(it => it.no_sj_dealpos)?.no_sj_dealpos || '',
                              applyToAllMarketplace: true
                            });
                          }
                          if (action === 'kirim_wa_alter') handleSendAlterWaFonnte(order);
                          if (action === 'cancel') setCancelModalOrder(order);
                          if (action === 'resi') handleUpdateResi(order.no_pesanan!);
                          if (action === 'delete') handleDelete(order.no_pesanan!);
                          e.target.value = ''; // reset after selection
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Aksi</option>
                        <option value="print">Print Label</option>
                        {((order.items || []).some(it => it.needs_alteration || it.id_form_alter || it.alteration_detail) || order.order_type === 'alteration_repair' || (order.no_pesanan || '').toUpperCase().startsWith('AR-')) && (
                          <>
                            <option value="spk_penjahit">✂️ Cetak SPK Penjahit</option>
                            <option value="kirim_wa_alter">💬 Kirim WA Alter (Fonnte)</option>
                          </>
                        )}
                        {(order.order_type === 'alteration_repair' || (order.no_pesanan || '').toUpperCase().startsWith('AR-') || !!order.alteration_repair_data) && (
                          <>
                            <option value="sj_struk">Cetak SJ Struk (Rangkap 2)</option>
                            <option value="spk">Cetak SPK Gudang</option>
                            {order.alteration_repair_data?.status_flow === 'diajukan' && (
                              <option value="mark_sent">Tandai Dikirim Store</option>
                            )}
                            {(order.alteration_repair_data?.status_flow === 'dikirim_store' || order.alteration_repair_data?.status_flow === 'diajukan') && (
                              <option value="mark_received">Tandai Diterima Warehouse</option>
                            )}
                            {(order.alteration_repair_data?.status_flow === 'dalam_pengerjaan' || order.alteration_repair_data?.status_flow === 'selesai_qc') && (
                              <option value="complete_ship">Input Bukti Kirim & Selesai</option>
                            )}
                          </>
                        )}
                        <option value="edit">Edit</option>
                        <option value="sj_dealpos">Input SJ DealPOS</option>
                        <option value="resi">Update Resi</option>
                        {order.status !== 'batal' && (
                          <option value="cancel">🚫 Batalkan Pesanan (Simpan Histori)</option>
                        )}
                        <option value="delete">🗑️ Hapus Pesanan (Permanen)</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOrders.length === 0 ? (
              <div className="col-span-full py-8 text-center text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                {searchTerm ? 'Tidak ada pesanan yang cocok dengan pencarian' : 'Tidak ada data pesanan'}
              </div>
            ) : (
              filteredOrders.map((order) => (
                <div key={order.no_pesanan} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col transition-shadow hover:shadow-md">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start">
                    <div className="flex gap-2 items-start">
                      {userIsAdmin && (
                        <input
                          type="checkbox"
                          className="rounded-sm border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer mt-0.5"
                          checked={selectedOrders.has(order.no_pesanan)}
                          onChange={() => toggleSelectOrder(order.no_pesanan)}
                        />
                      )}
                      <div>
                        <div 
                          className="font-bold text-[#00a8e8] dark:text-sky-400 hover:underline cursor-pointer text-sm"
                          onClick={() => setSelectedOrderDetails(order)}
                        >
                          {order.no_pesanan}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {new Date(order.created_at || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border ${
                        order.status === 'diterima' ? 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800' : 
                        order.status === 'diproses' ? 'border-yellow-400 dark:border-yellow-600/70 text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40' : 
                        order.status === 'dikirim' ? 'border-emerald-400 dark:border-emerald-600/70 text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' : 
                        order.status === 'batal' ? 'border-red-400 dark:border-red-600/70 text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40' : 
                        'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
                      }`}>
                        {order.status.charAt(0).toUpperCase() + order.status.slice(1).toLowerCase()}
                      </span>
                      {(() => {
                        const isAr = order.order_type === 'alteration_repair' || (order.no_pesanan || '').toUpperCase().startsWith('AR-') || !!order.alteration_repair_data;
                        const alterItems = (order.items || []).filter(
                          (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail
                        );
                        if (!isAr && alterItems.length > 0) {
                          const photoCount = (order.items || []).reduce((acc, it) => acc + (it.foto_urls?.length || 0), 0);
                          return (
                            <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-800 shadow-2xs">
                              <Scissors className="w-2.5 h-2.5 text-rose-600 animate-pulse" />
                              <span>Disertai Alter ({alterItems.length})</span>
                              {photoCount > 0 && (
                                <span className="text-emerald-700 dark:text-emerald-400 font-bold ml-0.5 flex items-center gap-0.5">
                                  <Camera className="w-2.5 h-2.5" />
                                  <span>{photoCount} Foto</span>
                                </span>
                              )}
                            </span>
                          );
                        }
                        return null;
                      })()}
                    </div>
                  </div>
                  
                  <div className="p-4 flex-1 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 shrink-0 mt-0.5">
                        <Package className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pengirim</div>
                        <div className="text-xs font-semibold text-slate-800 dark:text-white">{order.nama_pengirim}</div>
                        {order.pic_store && <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">PIC: {order.pic_store}</div>}
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 shrink-0 mt-0.5">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Customer</div>
                        <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{order.nama_tujuan}</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 shrink-0 mt-0.5">
                        <Truck className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Jasa Kirim</div>
                        <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{order.jasa_kirim || '-'}</div>
                      </div>
                    </div>

                    {/* Box Surat Jalan DealPOS (Khusus Produk Fulfilment Marketplace) */}
                    {(() => {
                      const mktItems = (order.items || []).filter(it => (it.fulfillment || '').toLowerCase().includes('marketplace'));
                      if (mktItems.length === 0) return null;
                      const sjList = Array.from(new Set(mktItems.map(it => it.no_sj_dealpos).filter(Boolean)));
                      const hasMissingSj = mktItems.some(it => !it.no_sj_dealpos);

                      return (
                        <div className="p-3 bg-amber-50/60 dark:bg-amber-950/40 rounded-xl border border-amber-300 dark:border-amber-800/80 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider flex items-center gap-1">
                              <FileCheck className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                              <span>Produk dari Marketplace ({mktItems.length})</span>
                            </span>
                            {userIsAdmin && (
                              <button
                                type="button"
                                onClick={() => {
                                  setSjModalData({
                                    order,
                                    noSj: sjList[0] || '',
                                    applyToAllMarketplace: true
                                  });
                                }}
                                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 cursor-pointer"
                              >
                                {sjList.length > 0 ? 'Edit SJ DealPOS' : '+ Input SJ DealPOS'}
                              </button>
                            )}
                          </div>

                          {/* List Produk Marketplace */}
                          <div className="space-y-1.5 bg-white dark:bg-slate-900/80 p-2 rounded-lg border border-amber-200 dark:border-amber-900/50">
                            {mktItems.map((it, idx) => (
                              <div key={it.id || idx} className="text-xs pb-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0">
                                <div className="flex justify-between items-start gap-1">
                                  <span className="font-semibold text-slate-800 dark:text-slate-100 leading-tight">
                                    {it.nama_produk}
                                  </span>
                                  <span className="font-bold text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 shrink-0">
                                    x{it.qty}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                                  {it.sku} {it.size && it.size !== 'ALL' && it.size !== '-' ? `| Size: ${it.size}` : ''}
                                </div>
                                {/* Card View: Status Item Ready vs Sold Out */}
                                {it.item_status === 'sold_out' ? (
                                  <div className="mt-1 p-1.5 bg-red-100/90 dark:bg-red-950/80 border border-red-300 dark:border-red-800 rounded-lg flex items-center justify-between">
                                    <div className="flex items-center gap-1 text-[10px] font-bold text-red-700 dark:text-red-300">
                                      <Ban className="w-3 h-3" />
                                      <span>SOLD OUT: {it.sold_note || 'Stok Marketplace Kosong'}</span>
                                    </div>
                                    {userIsAdmin && (
                                      <button
                                        type="button"
                                        onClick={() => handleRestoreSoldItem(order, it)}
                                        className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        <span>Pulihkan</span>
                                      </button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="mt-1 flex items-center justify-between gap-1 flex-wrap">
                                    {it.no_sj_dealpos ? (
                                      <div className="inline-flex items-center gap-1 font-mono text-[10px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60">
                                        <span>SJ: {it.no_sj_dealpos}</span>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            copyToClipboard(it.no_sj_dealpos || '', `No. SJ ${it.no_sj_dealpos} disalin!`);
                                            setCopiedSj(it.no_sj_dealpos || null);
                                            setTimeout(() => setCopiedSj(null), 2000);
                                          }}
                                          className="p-0.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-900"
                                          title="Salin No. SJ"
                                        >
                                          {copiedSj === it.no_sj_dealpos ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                                        </button>
                                      </div>
                                    ) : (
                                      <div className="text-[10px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        <span>Menunggu No. SJ DealPOS</span>
                                      </div>
                                    )}

                                    {userIsAdmin && order.status !== 'batal' && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const isMulti = (order.items || []).length > 1;
                                          setSoldModalData({
                                            order,
                                            item: it,
                                            resolution: isMulti ? 'partial_fulfill' : 'cancel_order',
                                            note: 'Stok kosong di alokasi DealPOS Marketplace.',
                                            sendWaToStore: true
                                          });
                                        }}
                                        className="text-[10px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 px-2 py-0.5 rounded border border-red-200 dark:border-red-800/60 cursor-pointer flex items-center gap-1"
                                      >
                                        <AlertOctagon className="w-3 h-3" />
                                        <span>Tandai Sold</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })()}

                    {/* No. Resi Box (Khusus agar PIC Store bisa copas langsung) */}
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">No. Resi Pengiriman</span>
                        {order.no_resi && (
                          <button
                            type="button"
                            onClick={() => {
                              copyToClipboard(order.no_resi || '', `No. Resi ${order.no_resi} berhasil disalin!`);
                              setCopiedResi(order.no_pesanan);
                              setTimeout(() => setCopiedResi(null), 2000);
                            }}
                            className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            {copiedResi === order.no_pesanan ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>Salin</span>
                          </button>
                        )}
                      </div>
                      {order.no_resi ? (
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-xs font-mono font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/50">
                            {order.no_resi}
                          </span>
                          <button
                            type="button"
                            onClick={() => setWaModalOrder(order)}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>WA Customer</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded border border-amber-200 dark:border-amber-800/40 font-medium">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>Menunggu resi dari Admin</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex justify-between items-center">
                    <button 
                      type="button"
                      onClick={() => setSelectedOrderDetails(order)}
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-3 py-1.5 rounded-md border border-indigo-100 dark:border-indigo-800/80 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      {order.items?.reduce((acc, it) => acc + (Number(it.qty) || 0), 0) || 0} Items
                    </button>
                    
                    {userIsAdmin && (
                      <div className="flex items-center gap-1.5">
                        {((order.items || []).some(it => it.needs_alteration || it.id_form_alter || it.alteration_detail) || order.order_type === 'alteration_repair' || (order.no_pesanan || '').toUpperCase().startsWith('AR-')) && (
                          <button
                            type="button"
                            onClick={() => handlePrintAlterWorkOrder(order)}
                            title="Cetak Surat Perintah Kerja (SPK) Penjahit"
                            className="p-1.5 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                          >
                            <Scissors className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handlePrintLabel(order)}
                          title="Print Label A6"
                          className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <select
                          className="text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm font-medium w-24"
                          onChange={(e) => {
                            const action = e.target.value;
                            if (action === 'print') handlePrintLabel(order);
                            if (action === 'spk_penjahit') handlePrintAlterWorkOrder(order);
                            if (action === 'spk') setArReceiptOrder(order);
                            if (action === 'edit') {
                              handleEdit(order);
                              setActiveTab('form');
                            }
                            if (action === 'sj_dealpos') {
                            setSjModalData({
                              order,
                              noSj: (order.items || []).find(it => it.no_sj_dealpos)?.no_sj_dealpos || '',
                              applyToAllMarketplace: true
                            });
                          }
                            if (action === 'kirim_wa_alter') handleSendAlterWaFonnte(order);
                            if (action === 'cancel') setCancelModalOrder(order);
                            if (action === 'resi') handleUpdateResi(order.no_pesanan!);
                            if (action === 'delete') handleDelete(order.no_pesanan!);
                            e.target.value = ''; // reset after selection
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Aksi</option>
                          <option value="print">Print Label</option>
                          {((order.items || []).some(it => it.needs_alteration || it.id_form_alter || it.alteration_detail) || order.order_type === 'alteration_repair' || (order.no_pesanan || '').toUpperCase().startsWith('AR-')) && (
                            <>
                              <option value="spk_penjahit">✂️ SPK Penjahit</option>
                              <option value="kirim_wa_alter">💬 Kirim WA Alter (Fonnte)</option>
                            </>
                          )}
                          {(order.order_type === 'alteration_repair' || (order.no_pesanan || '').toUpperCase().startsWith('AR-') || !!order.alteration_repair_data) && (
                            <option value="spk">Cetak SPK</option>
                          )}
                          <option value="edit">Edit</option>
                          <option value="resi">Update Resi</option>
                          {order.status !== 'batal' && (
                            <option value="cancel">🚫 Batalkan Pesanan (Simpan Histori)</option>
                          )}
                          <option value="delete">🗑️ Hapus Pesanan (Permanen)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

  return (
    <div className="max-w-7xl mx-auto p-2.5 sm:p-5 lg:p-6 animate-in fade-in duration-300">
      {/* Tab Navigation - Compact, Sleek & Aesthetic */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 mb-4">
        <div className="inline-flex p-1 bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-xs">
          <button
            type="button"
            id="tab-manual-form"
            className={`py-1.5 px-3.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 flex items-center gap-2 cursor-pointer ${
              activeTab === 'form'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            onClick={() => {
              if (editingOrder) resetForm();
              setActiveTab('form');
            }}
          >
            <Package className="w-4 h-4 shrink-0" />
            <span>{editingOrder ? 'Edit Pesanan' : 'Manual Shipment'}</span>
          </button>

          <button
            type="button"
            id="tab-manual-alteration"
            className={`py-1.5 px-3.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 flex items-center gap-2 cursor-pointer ${
              activeTab === 'alteration_repair'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            onClick={() => {
              setActiveTab('alteration_repair');
            }}
          >
            <Scissors className="w-4 h-4 shrink-0 text-rose-500" />
            <span>Alteration & Repair</span>
          </button>

          <button
            type="button"
            id="tab-manual-rekap"
            className={`py-1.5 px-3.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 flex items-center gap-2 cursor-pointer ${
              activeTab === 'rekap'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            onClick={() => {
              setActiveTab('rekap');
              loadOrders();
            }}
          >
            <History className="w-4 h-4 shrink-0" />
            <span>Rekap Pesanan</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              {orders.length}
            </span>
          </button>
        </div>

        {pengirim && (
          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Store: <strong className="text-slate-900 dark:text-white font-semibold">{pengirim}</strong></span>
            {picStore && <span className="text-slate-400 text-[11px]">(PIC: {picStore})</span>}
          </div>
        )}
      </div>

      <div className="w-full">
        <div className={activeTab === 'form' ? 'block' : 'hidden'}>
          {renderForm()}
        </div>

        <div className={activeTab === 'alteration_repair' ? 'block' : 'hidden'}>
          <AlterationRepairTab
            session={session}
            productCatalog={productCatalog}
            onShowToast={onShowToast}
            orders={orders}
            onOrdersUpdated={loadOrders}
            onOrderSaved={() => {
              loadOrders();
            }}
            onGoToRekap={() => {
              setActiveTab('rekap');
              loadOrders();
            }}
          />
        </div>
        
        <div className={activeTab === 'rekap' ? 'block' : 'hidden'}>
          {renderRekap()}
        </div>
      </div>

      {arReceiptOrder && (
        <AlterationRepairReceiptModal
          order={arReceiptOrder}
          onClose={() => setArReceiptOrder(null)}
          onShowToast={onShowToast}
        />
      )}
      {renderSjDealposModal()}
        {renderSoldOutModal()}
        {renderOrderDetailsModal()}

      {/* Modal WhatsApp Template Customer */}
      {waModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-emerald-50/80 dark:bg-emerald-950/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-600 text-white">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                    Template Pesan WhatsApp Customer
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Disalin atau dikirim langsung oleh PIC Store ke customer
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWaModalOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Customer</span>
                  <span className="font-bold text-slate-800 dark:text-white truncate block">{waModalOrder.nama_tujuan || '-'}</span>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{waModalOrder.no_telp_tujuan || '-'}</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Ekspedisi</span>
                  <span className="font-bold text-slate-800 dark:text-white truncate block">{waModalOrder.jasa_kirim || '-'}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Store: {waModalOrder.nama_pengirim}</span>
                </div>
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800/60 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase font-bold block">No. Resi</span>
                  <span className="font-bold font-mono text-emerald-900 dark:text-emerald-200 truncate block text-sm">
                    {waModalOrder.no_resi || 'Belum Ada'}
                  </span>
                  {waModalOrder.no_resi && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(waModalOrder.no_resi || '', `No. Resi disalin: ${waModalOrder.no_resi}`)}
                      className="text-[10px] text-emerald-700 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                    >
                      Salin Resi Saja
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Format Pesan WhatsApp (Siap Kirim):</span>
                  <span className="text-[10px] font-normal text-slate-400">Dapat diedit sebelum disalin</span>
                </label>
                <textarea
                  defaultValue={generateCustomerWaTemplate(waModalOrder)}
                  id="wa-template-textarea"
                  rows={9}
                  className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-slate-800 dark:text-slate-100 font-sans focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed select-all"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const ta = document.getElementById('wa-template-textarea') as HTMLTextAreaElement | null;
                  const textToCopy = ta ? ta.value : generateCustomerWaTemplate(waModalOrder);
                  copyToClipboard(textToCopy, 'Template pesan WhatsApp Customer berhasil disalin!');
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>Salin Pesan WA</span>
              </button>

              <div className="flex items-center gap-2">
                {waModalOrder.no_telp_tujuan && (
                  <button
                    type="button"
                    onClick={() => {
                      const ta = document.getElementById('wa-template-textarea') as HTMLTextAreaElement | null;
                      const textToSend = ta ? ta.value : generateCustomerWaTemplate(waModalOrder);
                      const cleanPhone = getCleanCustomerPhone(waModalOrder.no_telp_tujuan);
                      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(textToSend)}`, '_blank');
                    }}
                    className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Buka WhatsApp Customer</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setWaModalOrder(null)}
                  className="px-3.5 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview & Salin Pesan Pembaruan Data (Diff Log) */}
      {updateSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-indigo-50/80 dark:bg-indigo-950/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">
                    Pembaruan Pesanan Berhasil Disimpan
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pesan notifikasi pembaruan lengkap &amp; siap dikirim / disalin ke WhatsApp
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUpdateSuccessModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* Highlight Poin-Poin Perubahan */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  🔍 Ringkasan Perubahan Terdeteksi ({updateSuccessModal.changes.length} Poin):
                </span>
                <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {updateSuccessModal.changes.map((ch, idx) => (
                    <div key={idx} className="flex items-start gap-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="text-indigo-600 font-bold shrink-0">•</span>
                      <span className="leading-relaxed whitespace-pre-wrap">{ch}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Textarea Template WA */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Format Pesan WhatsApp Pembaruan (Siap Kirim):</span>
                  <span className="text-[10px] font-normal text-slate-400">Dapat diedit sebelum disalin</span>
                </label>
                <textarea
                  id="update-msg-textarea"
                  defaultValue={updateSuccessModal.message}
                  rows={10}
                  className="w-full text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed select-all"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const ta = document.getElementById('update-msg-textarea') as HTMLTextAreaElement | null;
                  const textToCopy = ta ? ta.value : updateSuccessModal.message;
                  copyToClipboard(textToCopy, 'Pesan pembaruan pesanan berhasil disalin!');
                  setCopiedUpdateMsg(true);
                  setTimeout(() => setCopiedUpdateMsg(false), 2500);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                {copiedUpdateMsg ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedUpdateMsg ? 'Tersalin ke Clipboard!' : 'Salin Pesan Pembaruan'}</span>
              </button>

              <div className="flex items-center gap-2">
                {updateSuccessModal.order.no_telp_store && (
                  <button
                    type="button"
                    onClick={() => {
                      const ta = document.getElementById('update-msg-textarea') as HTMLTextAreaElement | null;
                      const textToSend = ta ? ta.value : updateSuccessModal.message;
                      const cleanPhone = getCleanCustomerPhone(updateSuccessModal.order.no_telp_store);
                      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(textToSend)}`, '_blank');
                    }}
                    className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Kirim WA Store</span>
                  </button>
                )}
                {updateSuccessModal.order.no_telp_tujuan && (
                  <button
                    type="button"
                    onClick={() => {
                      const ta = document.getElementById('update-msg-textarea') as HTMLTextAreaElement | null;
                      const textToSend = ta ? ta.value : updateSuccessModal.message;
                      const cleanPhone = getCleanCustomerPhone(updateSuccessModal.order.no_telp_tujuan);
                      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(textToSend)}`, '_blank');
                    }}
                    className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Kirim WA Customer</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setUpdateSuccessModal(null)}
                  className="px-3.5 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CSS @media print terisolasi ke #manual-shipment-print-area untuk keandalan cetak di HP / mobile & desktop */}
      {printPayload && (
        <style>{`
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              ${printPayload.mode === 'LABEL' ? 'width: 105mm !important; height: 148mm !important;' : ''}
              overflow: visible !important;
            }
            body * {
              visibility: hidden !important;
            }
            #manual-shipment-print-area, #manual-shipment-print-area * {
              visibility: visible !important;
            }
            #manual-shipment-print-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: ${printPayload.mode === 'LABEL' ? '105mm' : '100%'} !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              z-index: 999999 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @page {
              size: ${printPayload.mode === 'LABEL' ? '105mm 148mm' : 'auto'};
              margin: ${printPayload.mode === 'LABEL' ? '0 !important' : '10mm !important'};
            }
            .page-break {
              box-sizing: border-box !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .page-break:not(:last-child) {
              page-break-after: always !important;
              break-after: page !important;
            }
            .page-break:last-child {
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
          }
        `}</style>
      )}

      {/* Floating Action Bar jika dialog cetak perlu dipicu manual di HP */}
      {printPayload && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 bg-slate-900 text-white p-3 sm:p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-3 border border-slate-700 print:hidden animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">
                {printPayload.mode === 'LABEL'
                  ? `Siap Cetak Label A6 (${printPayload.orders.length} Paket)`
                  : `Siap Cetak Picking List (${printPayload.orders.length} Pesanan)`}
              </div>
              <div className="text-[10px] text-slate-300 truncate">
                Tekan Cetak jika dialog belum muncul di HP
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                try {
                  window.print();
                } catch (err) {
                  console.error('Print error:', err);
                  alert('Gagal memunculkan dialog cetak. Silakan buka aplikasi di Tab Baru (Open in New Tab).');
                }
              }}
              className="px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak
            </button>
            <button
              type="button"
              onClick={() => setPrintPayload(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              title="Tutup banner cetak"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Hidden In-Page Print Area (sama persis dengan arsitektur CetakLabelView yang terbukti bisa via HP) */}
      {printPayload && (
        <div id="manual-shipment-print-area" className="hidden print:block bg-white w-full text-black">
          {printPayload.mode === 'LABEL' ? (
            printPayload.orders.map((order, orderIdx) => {
              const qrDataUrl = printPayload.qrMap[order.no_pesanan || ''] || '';
              // Hitung total QTY hanya untuk produk yang siap dikirim (tidak sold out)
              const activeItems = (order.items || []).filter(it => it.item_status !== 'sold_out' && it.item_status !== 'cancelled');
              const totalQty = activeItems.reduce((acc, it) => acc + (Number(it.qty) || 0), 0) || 0;

              return (
                <div
                  key={order.no_pesanan || orderIdx}
                  className="page-break w-[105mm] min-h-[140mm] p-[2mm] box-border bg-white relative flex flex-col justify-between"
                  style={{
                    pageBreakAfter: orderIdx < printPayload.orders.length - 1 ? 'always' : 'auto',
                    breakAfter: orderIdx < printPayload.orders.length - 1 ? 'page' : 'auto',
                    pageBreakInside: 'avoid',
                    breakInside: 'avoid',
                  }}
                >
                  <div className="w-full h-full min-h-[136mm] border-[2px] border-black flex flex-col bg-white box-border text-black">
                    {/* TOP FIXED AREA */}
                    <div className="flex flex-col shrink-0">
                       {/* 1. Header Label */}
                       <div className="border-b-[2px] border-black px-3 py-2 bg-gray-50 flex justify-between items-center break-inside-avoid">
                         <div className="text-xl font-black tracking-widest uppercase leading-none text-black flex items-center">
                           <img src="/logo.svg" alt="" referrerPolicy="no-referrer" className="h-7 object-contain hidden print:block" onError={(e) => e.currentTarget.style.display = 'none'} />
                         </div>
                         <div className="text-lg font-black tracking-wider uppercase leading-none text-black">
                           {order.jasa_kirim || 'PENGIRIMAN PAKET'}
                         </div>
                       </div>
                  
                       {/* 2. Sender / Receiver + QR Code block */}
                       <div className="flex border-b-[2px] border-black bg-white break-inside-avoid">
                          {/* Main Left Column (Penerima & Pengirim Stacked) */}
                          <div className="flex-1 flex flex-col border-r-[2px] border-black min-w-0">
                            
                            {/* PENERIMA (Top, Gets Maximum Space) */}
                            <div className="p-3 border-b-[2px] border-black flex-1">
                              <div className="text-[11px] font-black uppercase text-gray-600 mb-1">Kepada / Penerima:</div>
                              <div className="text-[18px] font-black uppercase mb-1 leading-tight text-black">{order.nama_tujuan || '-'}</div>
                              {order.no_telp_tujuan && (
                                <div className="text-[14px] font-black font-mono text-black mb-1.5 leading-none">{order.no_telp_tujuan}</div>
                              )}
                              <div className="text-[13px] font-bold leading-snug whitespace-pre-wrap text-black">{order.alamat_tujuan || '-'}</div>
                              {order.notes_paket && (
                                <div className="mt-2 pt-1.5 border-t border-dashed border-gray-300">
                                  <span className="text-[10px] font-black uppercase text-gray-500 mr-1">NOTE:</span>
                                  <span className="text-[12px] font-bold text-black whitespace-pre-wrap">{order.notes_paket}</span>
                                </div>
                              )}
                            </div>

                            {/* PENGIRIM (Bottom) */}
                            <div className="p-2.5 flex items-center justify-between gap-2 shrink-0 bg-white">
                              <div className="flex-1">
                                <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">Dari / Pengirim:</div>
                                <div className="text-[12px] font-black uppercase text-black leading-tight">{order.nama_pengirim || 'CHOCOCHIPS'}</div>
                              </div>
                              {order.pic_store && (
                                <div className="px-2 border-l border-gray-300">
                                  <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">PIC:</div>
                                  <div className="text-[11px] font-bold text-gray-800 leading-tight">{order.pic_store}</div>
                                </div>
                              )}
                              {order.no_telp_store && (
                                <div className="text-right pl-2 border-l border-gray-300">
                                  <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">No. Telp:</div>
                                  <div className="text-[11px] font-bold font-mono text-gray-800 leading-tight">{order.no_telp_store}</div>
                                </div>
                              )}
                            </div>
                          </div>
                  
                          {/* QR Code and ID */}
                          <div className="w-[110px] p-2 flex flex-col items-center justify-center shrink-0">
                            {qrDataUrl && (
                              <img
                                src={qrDataUrl}
                                alt="QR Code"
                                className="w-[75px] h-[75px] block object-contain mb-1.5"
                              />
                            )}
                            <div className="text-[10px] font-black text-center break-all mb-0.5 text-black leading-tight">
                              ID: {order.no_pesanan || ''}
                            </div>
                            {order.no_transaksi_customer && (
                              <div className="text-[9px] font-bold text-center break-all text-neutral-600 leading-tight mt-0.5">
                                Ref: {order.no_transaksi_customer}
                              </div>
                            )}
                          </div>
                       </div>
                  
                       {/* 3. Warning Box */}
                       <div className="border-b-[2px] border-black py-1.5 px-2 bg-gray-100 flex items-center justify-center text-center break-inside-avoid">
                         <div className="text-[8.5px] font-black text-black tracking-wide uppercase leading-tight">
                           ⚠️ PERHATIAN: JANGAN DITERIMA JIKA KONDISI PAKET RUSAK ATAU SEGEL TERBUKA &bull; MOHON DOKUMENTASIKAN PENERIMAAN DAN UNBOXING PAKET UNTUK KLAIM KOMPLAIN PAKET YANG DITERIMA
                         </div>
                       </div>
                    </div>
                  
                    {/* BOTTOM DYNAMIC AREA: Table for Manual Shipment */}
                    <div className="p-3 bg-white flex-1 flex flex-col">
                      <div className="text-[12px] font-black uppercase text-gray-600 border-b border-black pb-1 mb-1.5">ISI PRODUK PESANAN</div>
                      <div className="flex-1">
                        <table className="w-full border-collapse text-[12px]">
                          <thead>
                            <tr className="border-b border-dashed border-black">
                              <th className="text-left py-1 w-[5%] font-bold">No.</th>
                              <th className="text-left py-1 w-[50%] font-bold">Nama Produk</th>
                              <th className="text-left py-1 w-[15%] font-bold">Size</th>
                              <th className="text-left py-1 w-[20%] font-bold">SKU</th>
                              <th className="text-center py-1 w-[10%] font-bold">Qty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items && order.items.length > 0 ? (
                              order.items.map((it, idx) => {
                                let cleanName = it.nama_produk;
                                let size = '';
                                const parts = it.nama_produk.split('-');
                                if (parts.length > 1) {
                                  size = parts[parts.length - 1].trim();
                                  cleanName = parts.slice(0, parts.length - 1).join('-').trim();
                                }
                                const isSold = it.item_status === 'sold_out' || it.item_status === 'cancelled';
                                return (
                                  <tr key={idx} className={`border-b border-dashed border-black ${isSold ? 'opacity-50 line-through' : ''}`}>
                                    <td className="py-1 align-top">{idx + 1}.</td>
                                    <td className="py-1 align-top leading-snug line-clamp-2 pr-1">
                                      {cleanName}
                                      {isSold && <span className="no-underline font-black text-red-600 ml-1">[SOLD OUT - DIBATALKAN]</span>}
                                    </td>
                                    <td className="py-1 align-top">{size}</td>
                                    <td className="py-1 align-top">{it.sku || ''}</td>
                                    <td className="py-1 align-top text-center font-bold">{isSold ? '0' : (it.qty || 1)}</td>
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
            })
          ) : printPayload.mode === 'ALTER_WORK_ORDER' ? (
            // Work Order / SPK Penjahit Mode
            printPayload.orders.map((order, oIdx) => {
              const isAr = order.order_type === 'alteration_repair' || (order.no_pesanan || '').toUpperCase().startsWith('AR-') || !!order.alteration_repair_data;
              const arData = order.alteration_repair_data;
              const alterItems = (order.items || []).filter(
                (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail || isAr
              );
              const qrDataUrl = printPayload.qrMap[order.no_pesanan || ''] || '';
              const todayStr = new Date().toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              return (
                <div
                  key={order.no_pesanan || oIdx}
                  className="page-break p-6 max-w-[820px] mx-auto text-slate-900 bg-white"
                  style={{ pageBreakAfter: 'always', breakAfter: 'page' }}
                >
                  {/* Header SPK Penjahit */}
                  <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xl font-black text-rose-600 font-mono tracking-wider">✂️ CHOCOCHIPS WMS</span>
                        <span className="text-[10px] font-bold uppercase bg-slate-900 text-white px-2 py-0.5 rounded">
                          SPK PENJAHIT
                        </span>
                      </div>
                      <div className="text-sm font-extrabold text-slate-900 mt-1">
                        SURAT PERINTAH KERJA (SPK) & TIKET ALTERATION
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Tgl Cetak: <b>{todayStr}</b> • Operator: <b>{session?.name || getUserPersonName(session?.username) || 'Admin WMS'}</b>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {qrDataUrl && (
                        <img
                          src={qrDataUrl}
                          alt="QR"
                          className="w-16 h-16 object-contain border border-slate-300 rounded-sm"
                        />
                      )}
                      <div className="text-right">
                        <div className="text-sm font-black font-mono border-2 border-rose-600 text-rose-700 px-2.5 py-1 rounded-md inline-block">
                          {order.no_pesanan}
                        </div>
                        <div className="text-xs font-bold text-slate-700 mt-1">
                          Store: <span className="text-indigo-600">{order.nama_pengirim}</span>
                        </div>
                        {order.pic_store && (
                          <div className="text-[11px] text-slate-500">PIC Store: {order.pic_store}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Customer & Return Destination Info */}
                  <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200 mb-4 text-xs">
                    <div>
                      <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Informasi Pemilik / Customer</div>
                      <div className="font-bold text-slate-900 text-sm mt-0.5">{order.nama_tujuan}</div>
                      <div className="text-slate-600 mt-0.5">No. Telp / WA: <strong>{order.no_telp_tujuan || '-'}</strong></div>
                      <div className="text-slate-500 text-[11px] mt-0.5">{order.alamat_tujuan || '-'}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">Tujuan Pengiriman & Ekspedisi</div>
                      <div className="font-bold text-slate-900 mt-0.5">
                        Jasa Kirim: <span className="text-indigo-600 font-extrabold">{order.jasa_kirim || '-'}</span>
                      </div>
                      <div className="text-slate-600 mt-0.5">
                        Order ID Ref: <strong>{order.no_transaksi_customer || order.no_pesanan}</strong>
                      </div>
                      {order.notes_paket && (
                        <div className="text-slate-700 text-[11px] mt-1 bg-white p-1.5 rounded border border-slate-200">
                          <strong>Catatan Paket:</strong> {order.notes_paket}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Warning Banner */}
                  <div className="mb-4 p-2.5 bg-rose-50 border-2 border-rose-500 rounded-xl text-rose-950 text-xs flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">✂️</span>
                      <div>
                        <div className="font-black">INSTRUKSI WAJIB BAGI PENJAHIT & CHECKER QC:</div>
                        <div className="text-[10px] text-rose-800">
                          Kerjakan sesuai rincian ukuran & instruksi di bawah. Setelah selesai, lakukan QC kelim/fitting dan serahkan kembali ke meja packing.
                        </div>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider">
                      Prioritas Alter
                    </span>
                  </div>

                  {/* Table of Alteration Items */}
                  <div className="border border-slate-300 rounded-xl overflow-hidden mb-5">
                    <table className="w-full border-collapse text-xs">
                      <thead className="bg-slate-100 border-b border-slate-300 text-slate-700 uppercase font-black text-[10px]">
                        <tr>
                          <th className="p-2.5 text-center w-8">No</th>
                          <th className="p-2.5 text-left w-36">ID Form Alter</th>
                          <th className="p-2.5 text-left">SKU & Nama Produk Pakaian</th>
                          <th className="p-2.5 text-center w-16">Size</th>
                          <th className="p-2.5 text-center w-12">Qty</th>
                          <th className="p-2.5 text-left min-w-[220px]">Instruksi Pengerjaan Penjahit</th>
                          <th className="p-2.5 text-center w-14">Paraf</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {alterItems.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="p-4 text-center text-slate-400">
                              Tidak ada item yang memerlukan alterasi pada pesanan ini.
                            </td>
                          </tr>
                        ) : (
                          alterItems.map((item, itIdx) => {
                            const alterId = item.id_form_alter || (isAr ? order.no_pesanan : 'ALT-AUTO');
                            const instruction = item.alteration_detail || (isAr ? (arData?.alteration_detail || order.alteration_detail) : '-') || '-';

                            return (
                              <tr key={itIdx} className="bg-white">
                                <td className="p-2.5 text-center font-bold text-slate-500 align-top">
                                  {itIdx + 1}
                                </td>
                                <td className="p-2.5 font-mono font-black text-rose-700 align-top">
                                  <div className="bg-rose-50 px-2 py-1 rounded border border-rose-200 inline-block text-[11px]">
                                    {alterId}
                                  </div>
                                </td>
                                <td className="p-2.5 align-top">
                                  <div className="font-bold text-slate-900">{item.nama_produk}</div>
                                  <div className="font-mono text-[10px] text-slate-500 mt-0.5">SKU: {item.sku || '-'}</div>
                                </td>
                                <td className="p-2.5 text-center font-bold text-slate-800 align-top">
                                  <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                                    {item.size || '-'}
                                  </span>
                                </td>
                                <td className="p-2.5 text-center font-extrabold text-slate-900 text-sm align-top">
                                  {item.qty || 1}
                                </td>
                                <td className="p-2.5 align-top">
                                  <div className="p-2 rounded-lg bg-amber-50/90 border border-amber-300 text-amber-950 font-bold text-xs leading-relaxed">
                                    ✂️ {instruction}
                                  </div>
                                  {item.foto_urls && item.foto_urls.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-200">
                                      <div className="text-[10px] font-bold text-slate-600 mb-1">
                                        Foto Panduan Store ({item.foto_urls.length} Foto):
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {item.foto_urls.map((fUrl, fIdx) => (
                                          <img
                                            key={fIdx}
                                            src={fUrl}
                                            alt="Panduan Alterasi"
                                            className="w-16 h-16 object-cover rounded border border-slate-300 shadow-2xs"
                                          />
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </td>
                                <td className="p-2.5 text-center align-top">
                                  <div className="w-8 h-8 border-2 border-slate-400 rounded-md mx-auto" />
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* Verification Signatures */}
                  <div className="grid grid-cols-4 gap-4 pt-4 border-t-2 border-slate-300 text-center text-xs">
                    <div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase">1. Diajukan Oleh</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Store / Admin</div>
                      <div className="h-14"></div>
                      <div className="border-t border-slate-400 font-bold text-slate-800 pt-1">
                        ({order.pic_store || session?.name || 'PIC Store'})
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase">2. Diterima Penjahit</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Tgl Masuk: ___/___</div>
                      <div className="h-14"></div>
                      <div className="border-t border-slate-400 font-bold text-slate-800 pt-1">
                        (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase">3. Selesai Dijahit</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Tgl Selesai: ___/___</div>
                      <div className="h-14"></div>
                      <div className="border-t border-slate-400 font-bold text-slate-800 pt-1">
                        (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-slate-500 uppercase">4. QC & Siap Packing</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">Checker QC</div>
                      <div className="h-14"></div>
                      <div className="border-t border-slate-400 font-bold text-slate-800 pt-1">
                        (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            // Massal Multi-Order Picking List Mode (Hemat Kertas, Banyak Order per Lembar)
            (() => {
              const todayStr = new Date().toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const totalOrders = printPayload.orders.length;
              const totalAllItems = printPayload.orders.reduce((acc, o) => acc + (o.items?.length || 0), 0);
              const totalAllQty = printPayload.orders.reduce((acc, o) => acc + (o.items || []).reduce((q, it) => q + (Number(it.qty) || 0), 0), 0);
              const operatorName = session?.name || getUserPersonName(session?.username) || 'Petugas Gudang';

              return (
                <div className="p-4 max-w-[850px] mx-auto text-black bg-white">
                  {/* Batch Header Sekali di Atas */}
                  <div className="border-b-2 border-black pb-2.5 mb-3 flex justify-between items-center break-inside-avoid">
                    <div className="flex items-center gap-2.5">
                      <img src="/logo.svg" alt="" referrerPolicy="no-referrer" className="h-6 object-contain hidden print:block" onError={(e) => e.currentTarget.style.display = 'none'} />
                      <div>
                        <div className="text-base font-black tracking-wider uppercase text-black">
                          CHOCOCHIPS WMS — DAFTAR PICKING MASSAL
                        </div>
                        <div className="text-[10px] text-gray-700">
                          Tgl Cetak: <strong>{todayStr}</strong> • Picker/Admin: <strong>{operatorName}</strong>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="border border-black px-2 py-0.5 rounded text-[11px] font-black uppercase inline-block">
                        {totalOrders} Pesanan | {totalAllItems} SKU | {totalAllQty} Pcs
                      </span>
                    </div>
                  </div>

                  {/* Daftar Pesanan Mengalir Rapi per Lembar */}
                  <div className="space-y-3">
                    {printPayload.orders.map((order, oIdx) => {
                      const dealPosStr = (order.no_transaksi_pengirim || []).join(', ') || '-';
                      const orderQty = (order.items || []).reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
                      const alterItems = (order.items || []).filter(
                        (it) => it.needs_alteration || !!it.id_form_alter || !!it.layanan_alter || !!it.alteration_detail
                      );

                      return (
                        <div
                          key={order.no_pesanan || oIdx}
                          className="border border-black rounded-sm bg-white overflow-hidden text-black"
                          style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                        >
                          {/* Order Separator Header Bar */}
                          <div className="bg-gray-100 border-b border-black px-2.5 py-1 flex items-center justify-between text-[11px] font-bold flex-wrap gap-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-black text-black">
                                #{oIdx + 1}. [{order.no_pesanan}]
                              </span>
                              {order.no_transaksi_customer && (
                                <span className="text-gray-800">
                                  Ref: <strong>{order.no_transaksi_customer}</strong>
                                </span>
                              )}
                              <span>&bull;</span>
                              <span>Tujuan: <strong>{order.nama_tujuan}</strong></span>
                              <span>&bull;</span>
                              <span>Store: <strong>{order.nama_pengirim}</strong></span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-gray-700">Kurir: <strong>{order.jasa_kirim || '-'}</strong></span>
                              <span>&bull;</span>
                              <span>DealPOS: <strong>{dealPosStr}</strong></span>
                              <span className="bg-black text-white px-1.5 py-0.2 rounded text-[10px] font-black">
                                {orderQty} Pcs
                              </span>
                            </div>
                          </div>

                          {/* Alert Alterasi jika Ada */}
                          {alterItems.length > 0 && (
                            <div className="px-2.5 py-0.5 bg-rose-50 border-b border-rose-300 text-[10px] font-bold text-rose-950 flex items-center justify-between">
                              <span>
                                ✂️ PERHATIAN: TERDAPAT {alterItems.length} ITEM BUTUH ALTERASI! (Pisahkan ke penjahit dengan SPK)
                              </span>
                              <span className="uppercase text-[9px] bg-rose-600 text-white px-1 rounded font-black">
                                Wajib Alter
                              </span>
                            </div>
                          )}

                          {/* Tabel Item Pesanan Kompak */}
                          <table className="w-full border-collapse text-[10.5px]">
                            <thead>
                              <tr className="border-b border-gray-300 bg-gray-50 text-[9.5px] uppercase text-gray-700 font-bold">
                                <th className="py-1 px-1.5 text-center w-7 border-r border-gray-200">No</th>
                                <th className="py-1 px-2 text-left w-32 border-r border-gray-200">SKU / Kode</th>
                                <th className="py-1 px-2 text-left border-r border-gray-200">Nama Produk</th>
                                <th className="py-1 px-1.5 text-center w-12 border-r border-gray-200">Size</th>
                                <th className="py-1 px-1.5 text-center w-10 border-r border-gray-200">Qty</th>
                                <th className="py-1 px-2 text-center w-24 border-r border-gray-200">Lokasi Rak</th>
                                <th className="py-1 px-1.5 text-center w-9 border-r border-gray-200">Cek</th>
                                <th className="py-1 px-2 text-left w-44">Keterangan / Alter</th>
                              </tr>
                            </thead>
                            <tbody>
                              {order.items?.map((item, itemIdx) => {
                                let location = '-';
                                let variasi = item.size || '-';
                                let cleanName = item.nama_produk;
                                const parts = item.nama_produk.split('-');
                                if (parts.length > 1 && (!item.size || item.size === '-')) {
                                  variasi = parts[parts.length - 1].trim();
                                  cleanName = parts.slice(0, parts.length - 1).join('-').trim();
                                }

                                if (item.fulfillment === 'Marketplace') {
                                  const prod = productCatalog.find(p => p.k === item.sku);
                                  if (prod && prod.lokasi) location = prod.lokasi;
                                } else {
                                  location = item.fulfillment || '-';
                                }

                                const hasItemAlter = item.needs_alteration || !!item.id_form_alter || !!item.alteration_detail;

                                return (
                                  <tr key={itemIdx} className={`border-b border-gray-200 ${hasItemAlter ? 'bg-rose-50/40' : ''}`}>
                                    <td className="py-1 px-1.5 text-center text-gray-600 border-r border-gray-200">{itemIdx + 1}</td>
                                    <td className="py-1 px-2 font-mono font-bold text-black border-r border-gray-200">{item.sku}</td>
                                    <td className="py-1 px-2 font-semibold text-black border-r border-gray-200">
                                      {cleanName}
                                    </td>
                                    <td className="py-1 px-1.5 text-center font-bold border-r border-gray-200">{variasi}</td>
                                    <td className="py-1 px-1.5 text-center font-extrabold text-black text-[11px] border-r border-gray-200">{item.qty || 1}</td>
                                    <td className="py-1 px-2 text-center font-black text-black border-r border-gray-200 bg-gray-50/50">{location}</td>
                                    <td className="py-1 px-1.5 text-center border-r border-gray-200">
                                      <div className="w-3.5 h-3.5 border border-black rounded-xs mx-auto" />
                                    </td>
                                    <td className="py-1 px-2 text-[10px] text-gray-800">
                                      {hasItemAlter ? (
                                        <span className="font-bold text-rose-900">
                                          ✂️ {item.alteration_detail || 'Alterasi'} {item.id_form_alter ? `(${item.id_form_alter})` : ''}
                                        </span>
                                      ) : (
                                        '-'
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>

                  {/* Summary & Signatures Sekali di Akhir Halaman */}
                  <div
                    className="mt-4 pt-3 border-t-2 border-black flex justify-between items-end text-[11px] text-black"
                    style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                  >
                    <div>
                      <div className="font-bold">Total Batch Picking: {totalOrders} Pesanan | {totalAllItems} SKU | {totalAllQty} Pcs</div>
                      <div className="text-[10px] text-gray-600 mt-0.5">
                        * Centang [✓] setiap item yang telah diambil dari rak. Pisahkan produk alter ke tim penjahit.
                      </div>
                    </div>
                    <div className="flex gap-8 text-center">
                      <div>
                        <div className="text-[10px] text-gray-600 mb-7">Petugas Picker</div>
                        <div className="font-bold border-t border-black pt-1 min-w-[80px]">
                          ({operatorName})
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-600 mb-7">Checker / QC</div>
                        <div className="font-bold border-t border-black pt-1 min-w-[80px]">
                          (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-gray-600 mb-7">Packing / Ekspedisi</div>
                        <div className="font-bold border-t border-black pt-1 min-w-[80px]">
                          (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Modal Update Resi Massal */}
      <BulkUpdateResiModal
        isOpen={isBulkResiModalOpen}
        onClose={() => setIsBulkResiModalOpen(false)}
        orders={orders}
        onSuccess={() => loadOrders()}
        onShowToast={onShowToast}
      />

      {/* Modal Kamera Alterasi Store */}
      <AlterationCameraModal
        isOpen={!!cameraModalItem}
        onClose={() => setCameraModalItem(null)}
        itemTitle={cameraModalItem?.nama_produk}
        idFormAlter={cameraModalItem?.id_form_alter}
        onPhotoUploaded={(gdriveUrl) => {
          if (cameraModalItem) {
            handleCameraPhotoUploaded(cameraModalItem.id, gdriveUrl);
          }
        }}
      />

      {/* Modal Lightbox Foto Full Resolution */}
      <PhotoLightboxModal
        photoUrl={previewPhotoUrl}
        onClose={() => setPreviewPhotoUrl(null)}
        title="Dokumentasi Foto Fisik Alterasi Store"
      />

      {/* Modal Pembatalan Pesanan (Simpan Histori & Alasan) */}
      <CancelOrderModal
        isOpen={!!cancelModalOrder}
        order={cancelModalOrder}
        onClose={() => setCancelModalOrder(null)}
        onConfirmCancel={handleConfirmCancelOrder}
        isSubmitting={isSubmittingCancel}
      />
    </div>
  );
};
