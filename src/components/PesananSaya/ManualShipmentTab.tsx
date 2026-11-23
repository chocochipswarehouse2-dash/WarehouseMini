import React, { useState, useEffect, useMemo, useRef } from 'react';
import { NumberInput } from '../common/NumberInput';
import {
  Package, PackageCheck, Search, Plus, Trash2, Send, RefreshCw, Printer, AlertTriangle, Check, CheckCircle2, FileText, ChevronDown, QrCode, ShoppingBag, X, MapPin, Truck, History, Calendar, User, ArrowLeft, Copy, Clock, MessageCircle, MessageSquare, ExternalLink, Store, FileCheck, Layers, AlertOctagon, RotateCcw, Ban, SendHorizonal, Scissors, Sparkles, Camera, Image as ImageIcon, Upload, Eye, Loader2, Mail, Filter, Cog, Play, CheckSquare, Building2, LayoutGrid, Table, GitFork, ShieldAlert, HelpCircle, ArrowUpDown, MoreHorizontal
} from 'lucide-react';
import { AlterationCameraModal } from './AlterationCameraModal';
import { PhotoLightboxModal } from './PhotoLightboxModal';
import { CancelOrderModal } from './CancelOrderModal';
import { OrderActionSheet } from './OrderActionSheet';
import { OrderDetailModal } from './OrderDetailModal';
import { RekapOrderViews } from './RekapOrderViews';
import { RekapToolbar } from './RekapToolbar';
import { compressImage } from '../../utils/imageCompressor';
import { uploadImageToGdrive } from '../../services/gdriveUpload';
import { triggerOrderEmailNotifications } from '../../services/emailService';
import { ProductItem, UserSession, ManualShipmentOrder, ManualShipmentItem } from '../../types';
import { hasPermission, isSuperadmin } from '../../services/permissions';
import { PhysicalScanInput } from '../PhysicalScanInput';
import { AlterationRepairTab } from './AlterationRepairTab';
import { AlterationRepairReceiptModal } from './AlterationRepairReceiptModal';
import { SuratJalanAlterReceiptModal } from './SuratJalanAlterReceiptModal';
import { WaStoreNoticeModal } from './WaStoreNoticeModal';
import { AlterationActionModal, AlterationActionType } from './AlterationActionModal';
import { BulkUpdateResiModal } from './BulkUpdateResiModal';
import { SopPresentationModal } from './SopPresentationModal';
import { StoreHelpModal } from './StoreHelpModal';
import { SuperadminKnowledgeHubModal } from './SuperadminKnowledgeHubModal';
import { fetchStoreHelpTickets } from '../../services/storeHelpService';
import { isRealAlterItem, hasRealAlterItems, getRealAlterItems, hasValidArData, isStandaloneArOrder, orderNeedsResi, isKirimKeStoreOrder, isExternalCourier } from '../../utils/alterationUtils';
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
  updateJadwalKirimStore,
  updateOrderPrintStatus,
  getFullStoreName,
  isSameStore,
  isStoreOrOutletName,
  getValidPersonPicName,
  DEFAULT_OUTLETS,
  OutletItem,
  getStoreContact,
  resolveOrderFulfillmentStores,
  isMarketplaceFulfillmentItem,
  syncAutoPickingTaskForManualOrder,
  removePendingAutoPickingTask,
} from '../../services/gasManualShipment';
import { clearDeltaSyncCache } from '../../services/gasSync';
import { sendFonnteMessage, getFonnteConfig } from '../../services/whatsapp';
import { supabaseFetch, fetchStockForSkus, isWarehouseLocation, getPickingPriority, StockRealtimeItem, searchActiveProductsLive, fetchMasterProductsFromSupabase } from '../../services/supabase';
import QRCode from 'qrcode';
import {
  generateCustomerTransactionNumber,
  generateManualShipmentOrderId,
  isTransactionNumberUnique,
  getStoreCode,
  generateShortOrderId,
} from '../../utils/transactionGenerator';
import { getUserPersonName, formatOperatorWithPersonName } from '../../utils/userResolver';
import { lookupProductBySku } from '../../utils/productLookup';
import { isCorruptedColorCodeSize } from '../../utils/sortUtils';
import { globalRealtimeStore } from '../../services/store';
import { liveChatManager } from '../../services/liveChatService';
import {
  notifyOrderSubmittedToChat,
  notifyAlterSpkToChat,
  notifyOrderResiUpdatedToChat,
  notifyBulkResiUpdatedToChat,
  notifyOrderCancelledToChat,
  notifySjMarketplaceUpdatedToChat,
  notifyWarehouseReceivedStoreItemToChat,
  notifyOrderSoldOutToChat,
  notifySoldItemRestoredToChat,
  notifyStoreScheduleToChat,
} from '../../services/orderChatNotificationService';

interface ManualShipmentViewProps {
  session: UserSession | null;
  productCatalog: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  onRefreshCatalog?: () => Promise<void> | void;
}

export function ensureOrderItems(o: ManualShipmentOrder): ManualShipmentItem[] {
  if (!o) return [];
  let rawItems: any = o.items;
  if (typeof rawItems === 'string' && rawItems.trim()) {
    try {
      rawItems = JSON.parse(rawItems);
    } catch {}
  }

  if (Array.isArray(rawItems) && rawItems.length > 0) {
    return rawItems;
  }

  if ((o as any).sku || (o as any).nama_produk) {
    return [{
      id: o.id || `${o.no_pesanan || 'item'}-1`,
      sku: (o as any).sku || '',
      nama_produk: (o as any).nama_produk || '',
      size: (o as any).size || 'Default',
      qty: Number((o as any).qty) || 1,
      fulfillment: o.nama_pengirim || '',
    }];
  }

  return [];
}

export const ManualShipmentTab: React.FC<ManualShipmentViewProps> = ({
  session,
  productCatalog,
  onShowToast,
  onRefreshCatalog,
}) => {
  const userIsAdmin = isSuperadmin(session);
  const canAction = true; // Selalu aktifkan pemilihan & multi-choice untuk semua pengguna

  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);

  const handleSyncCatalog = async () => {
    if (isSyncingCatalog) return;
    setIsSyncingCatalog(true);
    try {
      if (onRefreshCatalog) {
        await onRefreshCatalog();
      } else {
        await fetchMasterProductsFromSupabase(50000, true);
      }
      onShowToast('Katalog produk berhasil disinkronkan!', 'success');
    } catch (err) {
      console.warn('Sync catalog error:', err);
      onShowToast('Gagal menyinkronkan katalog.', 'error');
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  const [activeTab, setActiveTab] = useState<'form' | 'alteration_repair' | 'rekap'>(() => {
    if (typeof window !== 'undefined') {
      const pending = (window as any).__wms_pending_pesanan_target;
      if (pending?.manualSubTab === 'rekap' || pending?.manualSubTab === 'form' || pending?.manualSubTab === 'alteration_repair') {
        return pending.manualSubTab;
      }
    }
    return userIsAdmin ? 'rekap' : 'form';
  });
  const [filterOrderType, setFilterOrderType] = useState<'all' | 'manual_shipment' | 'manual_with_alter' | 'alteration_repair'>('all');
  const [filterAlterStatus, setFilterAlterStatus] = useState<'all' | 'manual_with_alter' | 'all_alter' | 'no_alter'>('all');
  const [isBulkResiModalOpen, setIsBulkResiModalOpen] = useState(false);
  const [arReceiptOrder, setArReceiptOrder] = useState<ManualShipmentOrder | null>(null);
  const [sjAlterModalOrders, setSjAlterModalOrders] = useState<ManualShipmentOrder[] | null>(null);
  const [waNoticeModalOrder, setWaNoticeModalOrder] = useState<ManualShipmentOrder | null>(null);
  const [isSopPresentationOpen, setIsSopPresentationOpen] = useState(false);
  const [filterStoreDirection, setFilterStoreDirection] = useState<'all' | 'outgoing' | 'incoming'>('all');
  const [alterActionData, setAlterActionData] = useState<{
    order: ManualShipmentOrder;
    actionType: AlterationActionType;
    targetItems?: ManualShipmentItem[];
  } | null>(null);
  const [viewMode, setViewMode] = useState<'table' | 'card'>(() => {
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('manual_shipment_view_mode_v2');
      if (saved === 'table' || saved === 'card') return saved;
      return window.innerWidth < 768 ? 'card' : 'table';
    }
    return 'table';
  });
  const [actionSheetOrder, setActionSheetOrder] = useState<ManualShipmentOrder | null>(null);
  const [isRekapUtilsMenuOpen, setIsRekapUtilsMenuOpen] = useState(false);

  const handleSetViewMode = (mode: 'table' | 'card') => {
    setViewMode(mode);
    try {
      sessionStorage.setItem('manual_shipment_view_mode_v2', mode);
    } catch {}
  };

  // Help & Q&A Knowledge Hub
  const [isStoreHelpOpen, setIsStoreHelpOpen] = useState(false);
  const [isSuperadminHubOpen, setIsSuperadminHubOpen] = useState(false);
  const [unansweredTicketsCount, setUnansweredTicketsCount] = useState(0);

  const refreshUnansweredCount = () => {
    if (userIsAdmin) {
      fetchStoreHelpTickets().then(tickets => {
        const count = (tickets || []).filter(t => t.status === 'unanswered').length;
        setUnansweredTicketsCount(count);
      }).catch(() => {});
    }
  };

  useEffect(() => {
    refreshUnansweredCount();
  }, [userIsAdmin]);

  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState<OutletItem[]>([]);

  // Deteksi Store pengguna berdasarkan session login (Central Park, La Vela, dll.)
  const userAssignedStore = useMemo(() => {
    if (!session || userIsAdmin) return '';
    const userDiv = (session.divisi || '').toLowerCase().trim();
    const userName = (session.name || '').toLowerCase().trim();
    const userUname = (session.username || '').toLowerCase().trim();

    // Mapping langsung kode username outlet resmi
    const USERNAME_TO_STORE: Record<string, string> = {
      chococpj: 'Central Park Jakarta',
      chocogaia: 'Gaia Pontianak',
      chocobts: 'By The Sea PIK',
      chococws: 'Ciputra World Surabaya',
      chocodpm: 'Deli Park Medan',
      chocogst: 'Gading Serpong Tangerang',
      chocolmp: 'Lippo Mall Puri',
      chocolvl: 'La Vela Tangerang',
      chocolws: 'Living World Tangerang',
      chocomkg: 'Mall Kelapa Gading',
      choconsj: 'Neo Soho Jakarta',
      chocophb: 'Paskal Hyper Square Bandung',
      chocopim: 'Pondok Indah Mall',
      chocopms: 'Pakuwon Mall Surabaya',
      chocospm: 'Sun Plaza Medan',
      chocotp: 'Tunjungan Plaza Surabaya',
      chocostyling: 'Chocostyling',
      chocolive: 'chocoLIVE',
      // Aliases & kode singkat
      gst: 'Gading Serpong Tangerang',
      gading: 'Gading Serpong Tangerang',
      gadingserpong: 'Gading Serpong Tangerang',
      chocogs: 'Gading Serpong Tangerang',
      cpj: 'Central Park Jakarta',
      centralpark: 'Central Park Jakarta',
      bts: 'By The Sea PIK',
      bythesea: 'By The Sea PIK',
      gaia: 'Gaia Pontianak',
      lmp: 'Lippo Mall Puri',
      lippopuri: 'Lippo Mall Puri',
      mkg: 'Mall Kelapa Gading',
      kelapagading: 'Mall Kelapa Gading',
      nsj: 'Neo Soho Jakarta',
      neosoho: 'Neo Soho Jakarta',
      phb: 'Paskal Hyper Square Bandung',
      paskal: 'Paskal Hyper Square Bandung',
      pim: 'Pondok Indah Mall',
      pondokindah: 'Pondok Indah Mall',
      pms: 'Pakuwon Mall Surabaya',
      pakuwon: 'Pakuwon Mall Surabaya',
      spm: 'Sun Plaza Medan',
      sunplaza: 'Sun Plaza Medan',
      tp: 'Tunjungan Plaza Surabaya',
      tunjungan: 'Tunjungan Plaza Surabaya',
      dpm: 'Deli Park Medan',
      delipark: 'Deli Park Medan',
      lvl: 'La Vela Tangerang',
      lavela: 'La Vela Tangerang',
      lws: 'Living World Tangerang',
      livingworld: 'Living World Tangerang',
      cws: 'Ciputra World Surabaya',
      ciputraworld: 'Ciputra World Surabaya',
    };
    if (USERNAME_TO_STORE[userUname]) {
      return USERNAME_TO_STORE[userUname];
    }

    // List outlets untuk pencocokan dinamis
    const allOutlets = outlets.length > 0 ? outlets : DEFAULT_OUTLETS;
    const match = allOutlets.find((o) => {
      const oName = o.nama.toLowerCase().trim();
      const oKode = 'kode' in o && o.kode ? (o as any).kode.toLowerCase() : '';
      
      // Jangan gunakan kata generic 'store' untuk mencocokkan nama outlet
      const isGenericDiv = userDiv === 'store' || userDiv === 'outlet';

      return (
        (!isGenericDiv && userDiv && (userDiv === oName || userDiv.includes(oName) || oName.includes(userDiv))) ||
        (userName && (userName === oName || userName.includes(oName) || oName.includes(userName))) ||
        (userUname && (userUname === oName || userUname.includes(oName))) ||
        (oKode && userUname && userUname.includes(oKode)) ||
        (oKode && userDiv && userDiv.includes(oKode))
      );
    });

    return match ? match.nama : '';
  }, [session, outlets, userIsAdmin]);

  const isStoreUser = useMemo(() => {
    if (userIsAdmin) return false;
    if (userAssignedStore) return true;
    const uname = (session?.username || '').toLowerCase();
    const role = (session?.role || '').toLowerCase();
    const div = (session?.divisi || '').toLowerCase();
    return (uname.startsWith('choco') && uname !== 'chocoadm') || div === 'store' || div === 'outlet' || role === 'store' || role === 'outlet';
  }, [userIsAdmin, userAssignedStore, session]);
  const [jasaKirimList, setJasaKirimList] = useState<string[]>([]);
  const [orders, setOrders] = useState<ManualShipmentOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Tahap Utama Rekap Pesanan: 'baru' | 'diproses' | 'selesai' | 'batal' | 'semua'
  const [stageTab, setStageTab] = useState<'baru' | 'diproses' | 'selesai' | 'batal' | 'semua'>('semua');

  // Modal Input Jadwal Kirim ke Store
  const [jadwalModalOrder, setJadwalModalOrder] = useState<ManualShipmentOrder | null>(null);
  const [inputJadwalDate, setInputJadwalDate] = useState<string>('');
  const [inputJadwalCatatan, setInputJadwalCatatan] = useState<string>('');
  const [isSavingJadwal, setIsSavingJadwal] = useState<boolean>(false);

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterStore, setFilterStore] = useState<string>('all');
  const [filterDealposSj, setFilterDealposSj] = useState<'all' | 'need_sj' | 'has_sj'>('all');
  const [filterPrintStatus, setFilterPrintStatus] = useState<'all' | 'unprinted_label' | 'printed_label' | 'unprinted_picking' | 'printed_picking' | 'incomplete_print' | 'complete_print'>('all');
  // Modal Quick Input No SJ DealPOS
  const [sjModalData, setSjModalData] = useState<{
    order: ManualShipmentOrder;
    item?: ManualShipmentItem;
    noSj: string;
    applyToAllMarketplace: boolean;
  } | null>(null);
  const [copiedSj, setCopiedSj] = useState<string | null>(null);

  // Modal Update Resi
  const [resiModalOrder, setResiModalOrder] = useState<ManualShipmentOrder | null>(null);
  const [inputResiValue, setInputResiValue] = useState<string>('');
  const [isSavingResi, setIsSavingResi] = useState<boolean>(false);

  // Modal Khusus Penanganan Barang Sold Out (Marketplace)
  const [soldModalData, setSoldModalData] = useState<{
    order: ManualShipmentOrder;
    item: ManualShipmentItem;
    resolution: 'mark_only' | 'partial_fulfill' | 'cancel_order';
    note: string;
    sendWaToStore: boolean;
  } | null>(null);

  const [isFilterExpanded, setIsFilterExpanded] = useState<boolean>(false);
  const [filterSoldStatus, setFilterSoldStatus] = useState<'all' | 'has_sold'>('all');
  const [filterJasaKirim, setFilterJasaKirim] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [sortBy, setSortBy] = useState<
    | 'newest'
    | 'oldest'
    | 'store_asc'
    | 'store_desc'
    | 'customer_asc'
    | 'customer_desc'
    | 'courier_asc'
    | 'qty_desc'
    | 'qty_asc'
    | 'unprinted_first'
    | 'target_alter_asc'
  >('newest');

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

  // Shopee-Style "Chat ke Gudang / Store" dari pesanan
  const handleChatWarehouse = (order: ManualShipmentOrder) => {
    const anyOrder = order as any;
    const itemsSummary = Array.isArray(order.items)
      ? order.items.map((i) => `${i.nama_produk || i.sku} (${i.qty}x)`).join(', ')
      : anyOrder.rincian_produk || '';
    const totalPcs =
      anyOrder.total_qty ||
      (Array.isArray(order.items)
        ? order.items.reduce((s, x) => s + (Number(x.qty) || 0), 0)
        : undefined);
    const resolvedStoreName = order.nama_pengirim || anyOrder.nama_toko || anyOrder.store_name;
    const resolvedCustomerName = order.nama_tujuan || anyOrder.nama_pembeli;

    void liveChatManager.openOrderChat({
      order_id: anyOrder.no_pesanan || anyOrder.no_sj || String(order.id),
      store_name: resolvedStoreName,
      customer_name: resolvedCustomerName,
      items_summary: itemsSummary,
      total_pcs: totalPcs,
      status: order.status,
      no_resi: order.no_resi,
    });
    onShowToast?.(
      `Membuka percakapan untuk pesanan #${anyOrder.no_pesanan || anyOrder.no_sj}...`,
      'info'
    );
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
      : (order.no_pesanan || order.no_transaksi_customer || '-');

    const alterItems = (order.items || []).filter(isRealAlterItem);

    let itemsList = '';
    if (order.items && order.items.length > 0) {
      itemsList = order.items.map((it, idx) => {
        const sizeStr = it.size && it.size !== 'ALL' && it.size !== '-' ? ` (${it.size})` : '';
        const alterText = isRealAlterItem(it)
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
    const alterItems = (order.items || []).filter(isRealAlterItem);
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
• *Order ID / No. Pesanan:* ${order.no_pesanan || order.no_transaksi_customer}
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
   * Helper: Ambil No. SJ DealPOS (MKT ➔ Store) yang valid dari Admin WH.
   * Mencegah No. Transaksi DealPOS penjualan Store (no_transaksi_pengirim) tampil sebagai SJ DealPOS Admin WH.
   */
  const getValidItemSjDealpos = (order: ManualShipmentOrder | null | undefined, it: any): string => {
    const rawSj = String(it?.no_sj_dealpos || '').trim();
    if (!rawSj) return '';
    const txList: string[] = Array.isArray(order?.no_transaksi_pengirim)
      ? order!.no_transaksi_pengirim.map(t => String(t || '').trim().toLowerCase()).filter(Boolean)
      : order?.no_transaksi_pengirim
        ? String(order.no_transaksi_pengirim).split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
        : [];
    if (txList.includes(rawSj.toLowerCase()) && !it?.sj_updated_by) {
      return '';
    }
    return rawSj;
  };

  /**
   * Action Handler: Kirim SPK Alterasi ke Grup Live Chat WMS Store
   */
  const handleSendAlterWaFonnte = async (order: ManualShipmentOrder) => {
    const alterItems = (order.items || []).filter(isRealAlterItem);
    if (alterItems.length === 0) {
      onShowToast('Tidak ada item alterasi pada pesanan ini', 'info');
      return;
    }

    setIsSendingAlterWa(true);
    try {
      const actorName = session?.name || getUserPersonName(session?.username) || session?.username || 'Admin Gudang';
      const sent = await notifyAlterSpkToChat(order, actorName);
      if (sent) {
        onShowToast(`SPK Alterasi berhasil dikirim ke Grup Live Chat WMS (${order.nama_pengirim || 'Store'})!`, 'success');
      } else {
        onShowToast('Gagal mengirim SPK Alterasi ke Grup Live Chat WMS (pastikan nama Store pengirim valid).', 'error');
      }
    } catch (err: any) {
      onShowToast(`Error kirim Live Chat: ${err?.message || 'Koneksi gagal'}`, 'error');
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
    const orderId = newOrder.no_pesanan || newOrder.no_transaksi_customer || '-';

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
    const orderId = order.no_pesanan || order.no_transaksi_customer || '-';

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
  const [spkPaperSize, setSpkPaperSize] = useState<'100x150' | 'A4'>('100x150');
  const [printPayload, setPrintPayload] = useState<{
    mode: 'LABEL' | 'PICKING' | 'ALTER_WORK_ORDER';
    orders: ManualShipmentOrder[];
    qrMap: Record<string, string>;
    timestamp: number;
    spkPaperSize?: '100x150' | 'A4';
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
  
  // Pilihan Jasa Kirim & Mode Penyerahan (Database outlet)
  const [deliveryMethod, setDeliveryMethod] = useState<'expedition' | 'drop_store'>('expedition');
  const [dropStoreTarget, setDropStoreTarget] = useState<string>('');
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

      // 2. Resolve Phone Number: Default ke nomor WhatsApp resmi store
      const storeContact = getStoreContact(targetStore);
      if (storeContact && storeContact.no_wa && storeContact.no_wa.trim()) {
        if (isMounted) setTelpPengirim(storeContact.no_wa.trim());
      } else if (!telpPengirim) {
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

      // 3. PENTING: Kolom PIC Store WAJIB KOSONG dari awal agar staf/orang yang menginput wajib mengetik nama pribadinya sendiri (BUKAN nama toko dari session.name!)
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

    let debounceTimer: any = null;
    const unsubscribe = globalRealtimeStore.subscribe('manual_shipment', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadOrders();
      }, 600);
    });

    const applyManualShipmentDraft = (draft: any) => {
      if (!draft || typeof draft !== 'object') return;
      setEditingOrder(null);
      setActiveTab('form');
      if (draft.nama_pengirim && userIsAdmin) {
        setPengirim(String(draft.nama_pengirim));
      } else if (draft.nama_pengirim && !userAssignedStore) {
        setPengirim(String(draft.nama_pengirim));
      }
      if (draft.delivery_method === 'drop_store') {
        setDeliveryMethod('drop_store');
        if (draft.drop_store_target) setDropStoreTarget(String(draft.drop_store_target));
      } else {
        setDeliveryMethod('expedition');
      }
      if (draft.jasa_kirim) {
        setIsCustomJasaKirim(false);
        setJasaKirim(String(draft.jasa_kirim));
      }
      if (draft.nama_tujuan) setTujuan(String(draft.nama_tujuan));
      if (draft.no_telp_tujuan) setTelpTujuan(String(draft.no_telp_tujuan));
      if (draft.email_customer) setEmailCustomer(String(draft.email_customer));
      if (draft.alamat_tujuan) setAlamatTujuan(String(draft.alamat_tujuan));
      if (draft.notes_paket) setNotesPaket(String(draft.notes_paket));
      if (Array.isArray(draft.items) && draft.items.length > 0) {
        setItems(
          draft.items.map((it: any, idx: number) => ({
            id: `ai-ms-${Date.now()}-${idx}`,
            sku: String(it.sku || '').toUpperCase().trim(),
            nama_produk: String(it.nama_produk || '').trim(),
            size: String(it.size || '-').trim(),
            qty: Math.max(1, Number(it.qty) || 1),
            fulfillment: String(it.fulfillment || 'Gudang').trim(),
            lokasi: String(it.lokasi || '').trim(),
          }))
        );
      }
      onShowToast('✨ Draft Manual Shipment dari AI berhasil diisikan ke formulir. Silakan cek lalu Submit.', 'info');
    };

    const applyPesananTarget = (target: any) => {
      if (!target) return;
      const targetSubTab = target.manualSubTab || 'rekap';
      if (targetSubTab === 'rekap' || targetSubTab === 'form' || targetSubTab === 'alteration_repair') {
        setActiveTab(targetSubTab);
      }
      if (targetSubTab === 'form' && target.draft) {
        applyManualShipmentDraft(target.draft);
      }
      if (targetSubTab === 'rekap') {
        const validStages = ['baru', 'diproses', 'selesai', 'batal', 'semua'];
        const validOrderTypes = ['all', 'manual_shipment', 'manual_with_alter', 'alteration_repair'];
        setStageTab(validStages.includes(target.stageTab) ? target.stageTab : 'semua');
        setFilterOrderType(validOrderTypes.includes(target.filterOrderType) ? target.filterOrderType : 'all');
        setFilterAlterStatus('all');
        setFilterStatus('all');
        setFilterStore('all');
        setFilterStoreDirection('all');
        if (target.orderId) {
          const cleanOrderId = String(target.orderId).replace(/^#/, '').trim();
          if (cleanOrderId) setSearchTerm(cleanOrderId);
        }
        loadOrders();
      }
      if (typeof window !== 'undefined') {
        delete (window as any).__wms_pending_pesanan_target;
      }
    };

    if (typeof window !== 'undefined' && (window as any).__wms_pending_pesanan_target) {
      applyPesananTarget((window as any).__wms_pending_pesanan_target);
    }

    const handleOpenPesananTarget = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      applyPesananTarget(detail);
    };

    const handlePrefillManualDraft = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      if (detail) {
        applyManualShipmentDraft(detail);
        if (typeof window !== 'undefined') {
          delete (window as any).__wms_pending_pesanan_target;
        }
      }
    };

    window.addEventListener('wms_open_pesanan_target', handleOpenPesananTarget);
    window.addEventListener('wms_prefill_manual_shipment_form', handlePrefillManualDraft);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      unsubscribe();
      window.removeEventListener('wms_open_pesanan_target', handleOpenPesananTarget);
      window.removeEventListener('wms_prefill_manual_shipment_form', handlePrefillManualDraft);
    };
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

      // Enrich location rack data asynchronously from Supabase stok_real_fisik and product catalog
      enrichOrdersWithLocations(reversed).then(enriched => {
        setOrders(enriched);
      }).catch(err => console.warn('Async location enrichment failed:', err));

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

  const handleSplitItem = (id: string) => {
    setItems(prev => {
      const targetIndex = prev.findIndex(i => i.id === id);
      if (targetIndex === -1) return prev;
      const target = prev[targetIndex];
      const currentQty = Number(target.qty) || 1;
      if (currentQty <= 1) return prev;

      // Kurangi qty target sebanyak 1
      const updatedTarget: ManualShipmentItem = {
        ...target,
        qty: currentQty - 1,
      };

      // Buat baris baru untuk 1 pc yang dipisah dengan fulfillment kosong agar bisa dipilih beda
      const newItem: ManualShipmentItem = {
        ...target,
        id: `item-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        qty: 1,
        fulfillment: '',
        no_sj_dealpos: '',
        id_form_alter: '', // Kosongkan agar PIC Store dapat menginput ID Form Alter manual jika berbeda
      };

      const next = [...prev];
      next[targetIndex] = updatedTarget;
      next.splice(targetIndex + 1, 0, newItem);
      return next;
    });
    onShowToast('1 pcs produk berhasil dipisahkan ke baris baru. Silakan tentukan fulfillment yang berbeda.', 'info');
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleToggleItemAlteration = (id: string, checked: boolean) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return {
          ...item,
          needs_alteration: checked,
          id_form_alter: checked ? (item.id_form_alter || '') : undefined,
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
        return { ...item, [field]: value };
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

    // Validasi otorisasi: Store tidak boleh mengedit pesanan yang sudah ada
    if (editingOrder && !userIsAdmin) {
      onShowToast('Akses ditolak: Hanya Admin Gudang / Superadmin yang memiliki izin mengedit pesanan.', 'error');
      return;
    }

    // Validasi Kelengkapan Data Pengirim & PIC
    if (!pengirim || !pengirim.trim()) {
      onShowToast('Store / Cabang Pengirim wajib dipilih/diisi', 'warning');
      return;
    }
    if (!picStore || !picStore.trim()) {
      onShowToast('Nama PIC Store (Nama Orang yang menginput pesanan) wajib diisi secara manual!', 'warning');
      return;
    }
    if (isStoreOrOutletName(picStore, pengirim, outlets)) {
      onShowToast('Kolom PIC Store wajib diisi dengan NAMA ORANG (staf yang menginput pesanan), BUKAN nama toko/cabang!', 'error');
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
        if (!it.id_form_alter || !it.id_form_alter.trim()) {
          onShowToast(`Item #${i + 1} (${it.nama_produk || it.sku}): No. ID Form Alter wajib diisi manual oleh Store (baik fulfillment Store maupun Marketplace)`, 'warning');
          return;
        }
        if (!it.alteration_detail || !it.alteration_detail.trim()) {
          onShowToast(`Item #${i + 1} (${it.nama_produk || it.sku}): Rincian instruksi alteration/permak wajib diisi`, 'warning');
          return;
        }
      }
    }

    setLoading(true);

    // 1. Satu Order ID Tunggal yang 100% Konsisten di seluruh sistem (Form, Rekap, Input Resi, Label, WA)
    let finalOrderId = editingOrder
      ? (editingOrder.no_pesanan || editingOrder.no_transaksi_customer || '').trim()
      : transCustomer.trim();
    const expectedPrefix = pengirim ? `MS${getStoreCode(pengirim)}-` : 'MS-';
    
    if (!editingOrder) {
      if (!finalOrderId || !finalOrderId.startsWith(expectedPrefix) || !isTransactionNumberUnique(finalOrderId, orders)) {
        finalOrderId = generateCustomerTransactionNumber(orders, pengirim);
        setTransCustomer(finalOrderId);
      }
    }

    // 2. Ambil nilai jasa kirim
    const finalJasaKirim = (isCustomJasaKirim ? customJasaKirim : jasaKirim).trim();

    // 3. Gunakan Order ID tunggal yang sama persis untuk no_pesanan & no_transaksi_customer
    const uniquePesananId = finalOrderId;
    const finalTransCustomer = finalOrderId;

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
      items: items.map((it) => {
        const cleanSku = String(it.sku || '').trim().toUpperCase();
        const master = cleanSku ? lookupProductBySku(cleanSku, productCatalog, it.nama_produk, it.size) : null;
        const officialName = (master && master.found) ? master.nama_produk : (it.nama_produk || cleanSku);
        const officialSize = (master && master.found)
          ? (master.size ? master.size : 'Default')
          : (!isCorruptedColorCodeSize(cleanSku, it.size) && it.size ? it.size : 'Default');
        return {
          ...it,
          nama_produk: officialName,
          size: officialSize,
          qty: Math.max(1, Number(it.qty) || 1),
          no_sj_dealpos: editingOrder ? (it.no_sj_dealpos || '') : '',
        };
      }),
      status: editingOrder ? editingOrder.status : 'diterima',
      no_resi: editingOrder ? (editingOrder.no_resi || '') : '',
      created_at: editingOrder ? editingOrder.created_at : new Date().toISOString(),
      submitted_by: editingOrder
        ? editingOrder.submitted_by
        : `${picStore.trim()} (${pengirim.trim()})`
    };

    let result = { success: false, message: '' };
    if (editingOrder) {
      result = await editManualShipment(orderData);
    } else {
      result = await submitManualShipment(orderData);
    }

    if (result.success) {
      onShowToast(editingOrder ? 'Pesanan berhasil diupdate' : 'Pesanan berhasil disubmit', 'success');

      // OTOMATIS TUGAS PICKING (Kategori Manual shipment/alter) untuk item fulfillment Marketplace / Gudang
      try {
        const pickRes = await syncAutoPickingTaskForManualOrder(orderData, {
          isEdit: Boolean(editingOrder),
          productCatalog,
        });
        if (pickRes.status === 'created') {
          onShowToast(
            `📋 Tugas Picking otomatis dibuat untuk ${pickRes.itemCount} SKU Marketplace (${orderData.no_pesanan})`,
            'info'
          );
        } else if (pickRes.status === 'updated') {
          onShowToast(
            `📋 Tugas Picking ${orderData.no_pesanan} ikut diperbarui (${pickRes.itemCount} SKU Marketplace)`,
            'info'
          );
        } else if (pickRes.status === 'removed') {
          onShowToast(
            `📋 Tugas Picking PENDING ${orderData.no_pesanan} dihapus (tidak ada item Marketplace)`,
            'info'
          );
        } else if (pickRes.status === 'error') {
          onShowToast(
            `⚠️ Pesanan tersimpan, namun Tugas Picking otomatis gagal dibuat: ${pickRes.message || 'Cek koneksi'}`,
            'warning'
          );
        }
      } catch (pickErr) {
        console.warn('Auto picking sync error:', pickErr);
      }

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

      // OTOMATIS LIVE CHAT WMS: Buat / perbarui grup Store Ops (@warehouse + @chocoadm + Store) & kirim update pesanan / inter-store
      const actorName = session?.name || getUserPersonName(session?.username) || session?.username || 'Tim WMS';

      if (editingOrder) {
        const changes = generateOrderUpdateDiff(editingOrder, orderData);
        const updateMsg = formatOrderUpdateMessage(editingOrder, orderData, changes, actorName);

        setUpdateSuccessModal({
          order: orderData,
          message: updateMsg,
          changes,
        });

        await Promise.race([
          notifyOrderSubmittedToChat(orderData, {
            isEdit: true,
            diffChanges: changes,
            actorName,
          }).then((res) => {
            if (res.requesterSent || res.interStoreSentCount > 0) {
              onShowToast('Pembaruan pesanan dikirim ke Grup Live Chat WMS!', 'info');
            }
          }),
          new Promise<void>((r) => setTimeout(r, 6000)),
        ]);
      } else {
        await Promise.race([
          notifyOrderSubmittedToChat(orderData, {
            isEdit: false,
            actorName,
          }).then((res) => {
            if (res.requesterSent || res.interStoreSentCount > 0) {
              onShowToast(`Notifikasi pesanan dikirim ke Grup Live Chat WMS (${orderData.nama_pengirim})`, 'info');
            }
          }),
          new Promise<void>((r) => setTimeout(r, 6000)),
        ]);
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

  const handleScanProduct = async (sku: string) => {
    const cleanSku = (sku || '').trim().toUpperCase();
    if (!cleanSku) return;

    let product = productCatalog.find(p => (p.k || (p as any).sku || '').toUpperCase() === cleanSku);
    if (!product) {
      // Live fallback lookup in Supabase if not present in local cache
      try {
        const liveItems = await searchActiveProductsLive(cleanSku);
        if (liveItems && liveItems.length > 0) {
          product = liveItems.find(p => (p.k || (p as any).sku || '').toUpperCase() === cleanSku) || liveItems[0];
        }
      } catch (err) {
        console.warn('Live lookup error for SKU:', cleanSku, err);
      }
    }

    if (!product) {
      onShowToast(`SKU ${cleanSku} tidak terdaftar di database!`, 'error');
      return;
    }

    setItems(prev => {
      const existing = prev.find(i => i.sku.toUpperCase() === product!.k.toUpperCase());
      if (existing) {
        // Increment qty hanya pada baris pertama yang cocok
        return prev.map(i => i.id === existing.id ? { ...i, qty: (Number(i.qty) || 0) + 1 } : i);
      }
      
      const master = lookupProductBySku(product!.k, productCatalog, product!.p || (product as any).nama_produk, product!.s);
      const displayNama = master.found ? master.nama_produk : (product!.p || (product as any).nama_produk || product!.n || 'Unknown Product');
      const cleanSize = master.found
        ? (master.size || '')
        : (!isCorruptedColorCodeSize(product!.k, product!.s) && product!.s ? product!.s : '');
      return [...prev, {
        id: `item-${Date.now()}`,
        nama_produk: displayNama,
        sku: product!.k,
        qty: 1,
        fulfillment: '',
        size: cleanSize
      }];
    });
    onShowToast(`Berhasil menambahkan ${product.p || (product as any).nama_produk || product.n || product.k}`, 'success');
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
                      if (val.includes('Drop ke Store')) {
                        setDeliveryMethod('drop_store');
                        const target = userAssignedStore || (pengirim && !pengirim.toLowerCase().includes('gudang') ? pengirim : '') || dropStoreTarget;
                        if (target) {
                          setDropStoreTarget(target);
                          const contact = getStoreContact(target);
                          setAlamatTujuan(
                            `[DROP OFF STORE]: ${target} - ${contact.alamat_store || 'Outlet Store Chocochips'}`
                          );
                          if (contact.no_wa && !telpTujuan) {
                            setTelpTujuan(contact.no_wa);
                          }
                        }
                      }
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
                  Store / Cabang Pengirim <span className="text-red-500">*</span>
                </label>
                <select
                  value={pengirim}
                  disabled={!userIsAdmin && !!userAssignedStore}
                  onChange={(e) => {
                    const newStore = e.target.value;
                    setPengirim(newStore);
                    setTransCustomer(generateManualShipmentOrderId(orders, newStore));
                    const contact = getStoreContact(newStore);
                    if (contact && contact.no_wa) {
                      setTelpPengirim(contact.no_wa);
                    }
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
                    ? 'Nama cabang toko terkunci otomatis sesuai login Store'
                    : 'Nama cabang toko pengirim'}
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
                  className={`w-full rounded-lg border shadow-xs focus:ring-1 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3 font-semibold ${
                    picStore.trim() && isStoreOrOutletName(picStore, pengirim, outlets)
                      ? 'border-red-500 focus:border-red-500 focus:ring-red-500'
                      : 'border-slate-300 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500'
                  }`}
                  placeholder="Nama PIC Store yang menginput..."
                  required
                />
                {picStore.trim() && isStoreOrOutletName(picStore, pengirim, outlets) ? (
                  <p className="text-[10px] text-red-600 dark:text-red-400 font-bold mt-1">
                    ⚠️ Jangan diisi nama toko! Ketik nama PIC yang menginput pesanan.
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                    Wajib diisi manual oleh PIC yang menginput pesanan
                  </p>
                )}
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

          {/* Section 2: Data Customer & Opsi Penyerahan */}
          <div>
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700/80 pb-2 mb-3 flex-wrap gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Data Customer & Opsi Penyerahan</span>
              </h3>

              {/* Toggle Opsi Pengiriman: Ekspedisi vs Drop ke Store Terkait */}
              <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setDeliveryMethod('expedition');
                    if (jasaKirim.startsWith('Drop ke Store')) {
                      setJasaKirim('');
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    deliveryMethod === 'expedition'
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Truck className="w-3 h-3" />
                  <span>Kirim via Ekspedisi</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDeliveryMethod('drop_store');
                    setJasaKirim('Drop ke Store Terkait (Pick Up / Handover Store)');
                    const target = userAssignedStore || (pengirim && !pengirim.toLowerCase().includes('gudang') ? pengirim : '') || dropStoreTarget;
                    if (target) {
                      setDropStoreTarget(target);
                      const contact = getStoreContact(target);
                      setAlamatTujuan(
                        `[DROP OFF STORE]: ${target} - ${contact.alamat_store || 'Outlet Store Chocochips'}`
                      );
                      if (contact.no_wa && !telpTujuan) {
                        setTelpTujuan(contact.no_wa);
                      }
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    deliveryMethod === 'drop_store'
                      ? 'bg-amber-600 text-white shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                  title="Pilih opsi ini jika barang diserahkan/di-drop ke toko terkait untuk diambil customer"
                >
                  <Building2 className="w-3 h-3" />
                  <span>Drop ke Store Terkait</span>
                </button>
              </div>
            </div>

            {/* Opsi Drop ke Store Terkait Banner & Selection */}
            {deliveryMethod === 'drop_store' && (
              <div className="mb-3.5 p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/80 rounded-xl space-y-2.5 animate-in fade-in">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 dark:text-amber-200">
                    <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Opsi Penyerahan: Drop Off ke Store Terkait</span>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100 rounded-full">
                    Pick Up / Handover Store
                  </span>
                </div>

                {(() => {
                  const effectiveStore = userAssignedStore || (pengirim && !pengirim.toLowerCase().includes('gudang') ? pengirim : '');
                  return effectiveStore ? (
                    <div className="flex items-center gap-3 p-2.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/80 rounded-xl shadow-2xs">
                      <div className="w-9 h-9 rounded-lg bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                        <Building2 className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-black text-amber-950 dark:text-amber-100">
                            Store Penyerahan: {effectiveStore}
                          </span>
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 px-2 py-0.2 rounded-full font-bold">
                            Otomatis Sesuai Akun Login Store
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Customer mengambil barang langsung di outlet {effectiveStore}. Alamat toko dan kontak otomatis terisi tanpa perlu dipilih manual.
                        </p>
                      </div>
                    </div>
                  ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-amber-950 dark:text-amber-200 mb-1">
                        Pilih Store Tujuan Drop Off: *
                      </label>
                      <select
                        value={dropStoreTarget}
                        onChange={(e) => {
                          const targetStore = e.target.value;
                          setDropStoreTarget(targetStore);
                          if (targetStore) {
                            const contact = getStoreContact(targetStore);
                            setAlamatTujuan(
                              `[DROP OFF STORE]: ${targetStore} - ${contact.alamat_store || 'Outlet Store Chocochips'}`
                            );
                            if (contact.no_wa && !telpTujuan) {
                              setTelpTujuan(contact.no_wa);
                            }
                            setJasaKirim('Drop ke Store Terkait (Pick Up / Handover Store)');
                          }
                        }}
                        className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700/80 rounded-lg text-slate-900 dark:text-white font-bold text-xs shadow-2xs"
                        required={deliveryMethod === 'drop_store'}
                      >
                        <option value="">-- Pilih Outlet / Store Tujuan --</option>
                        {outlets.map((o, idx) => (
                          <option key={idx} value={o.nama}>
                            {o.nama}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end">
                      <p className="text-[11px] text-amber-800 dark:text-amber-300/90 leading-relaxed">
                        Alamat &amp; ekspedisi pengiriman otomatis disesuaikan ke lokasi outlet store tujuan drop off.
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

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
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Email formal &amp; tabel rincian ber-kop Chocochips</p>
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSyncCatalog}
                  disabled={isSyncingCatalog}
                  className="flex items-center gap-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 px-2 py-0.5 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer shadow-2xs"
                  title="Sinkronkan katalog produk terbaru dari database"
                >
                  <RefreshCw className={`w-3 h-3 ${isSyncingCatalog ? 'animate-spin' : ''}`} />
                  <span>{isSyncingCatalog ? 'Sinkronisasi...' : `${productCatalog.length} Produk`}</span>
                </button>
                <span className="text-[11px] font-semibold text-slate-500">
                  {items.length} Baris Produk
                </span>
              </div>
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
                        <NumberInput
                          min={1}
                          value={item.qty ?? 1}
                          selectOnFocus
                          onValueChange={(val) => handleItemChange(item.id, 'qty', Math.max(1, val))}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 text-xs focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-1 px-2.5 font-bold"
                          required
                        />
                        {Number(item.qty) > 1 && (
                          <button
                            type="button"
                            onClick={() => handleSplitItem(item.id)}
                            className="mt-1.5 w-full flex items-center justify-center gap-1 text-[10px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 dark:hover:bg-indigo-900/80 px-1.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer shadow-2xs"
                            title="Pisahkan 1 pcs ke baris baru agar bisa memilih fulfillment yang berbeda (contoh: 1 Marketplace, 1 Store)"
                          >
                            <GitFork className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                            <span>Split Fulfil</span>
                          </button>
                        )}
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

                        {/* Input No SJ DealPOS (MKT -> Store) khusus Admin WH saat Edit, Store/Form Baru hanya View */}
                        {(item.fulfillment || '').toLowerCase().includes('marketplace') && (
                          editingOrder && userIsAdmin && !isStoreUser ? (
                            <div className="mt-1.5 flex items-center gap-1.5">
                              <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 shrink-0">No SJ Delivery (MKT➔Store):</span>
                              <input
                                type="text"
                                value={item.no_sj_dealpos || ''}
                                onChange={(e) => handleItemChange(item.id, 'no_sj_dealpos', e.target.value)}
                                placeholder="Diisi Admin WH (Cth: Transfer Order #26.10.00195)"
                                className="w-full rounded border border-amber-300 dark:border-amber-700/80 bg-amber-50/50 dark:bg-amber-950/40 text-[11px] font-mono py-0.5 px-1.5 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-amber-500"
                              />
                            </div>
                          ) : (
                            <div className="mt-1.5 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50/60 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 rounded px-2 py-1 flex items-center justify-between">
                              <span>No. SJ Delivery (MKT ➔ Store):</span>
                              <span className="font-mono font-bold">{(editingOrder && item.no_sj_dealpos) ? item.no_sj_dealpos : 'Diinput oleh Admin WH'}</span>
                            </div>
                          )
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
                            No. ID Alter Wajib Diisi
                          </span>
                        )}
                      </div>

                      {item.needs_alteration && (
                        <div className="mt-2.5 p-3 bg-rose-50/60 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-900/60 space-y-2.5 animate-in fade-in">
                          {/* ID Form Alter & Jenis Layanan */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            {/* ID Form Alter: Selalu Diisi Manual oleh Store untuk semua fulfillment */}
                            <div>
                              <div className="flex items-center justify-between mb-0.5">
                                <label className="block text-[10px] font-bold text-rose-900 dark:text-rose-200">
                                  No. ID Form Alter Store *
                                </label>
                                <span className="text-[9.5px] font-semibold text-rose-600 dark:text-rose-400">
                                  (Wajib diisi manual oleh tim Store)
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <input
                                  type="text"
                                  required
                                  value={item.id_form_alter || ''}
                                  onChange={(e) => handleItemChange(item.id, 'id_form_alter', e.target.value)}
                                  placeholder="Ketik No. ID Form Alter Store (Contoh: ALT-2610-001)..."
                                  className="w-full px-2.5 py-1.5 rounded-lg text-xs font-mono font-bold shadow-2xs border bg-white dark:bg-slate-900 text-slate-900 dark:text-white border-rose-300 dark:border-rose-700 focus:outline-none focus:ring-1 focus:ring-rose-500"
                                />
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

          {items.some(isMarketplaceFulfillmentItem) && (
            <div className="rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 bg-indigo-50/70 dark:bg-indigo-950/30 px-3.5 py-2.5 flex items-start gap-2.5 text-xs text-indigo-800 dark:text-indigo-200">
              <PackageCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <span className="font-bold">Tugas Picking Otomatis Aktif:</span>{' '}
                <span>
                  {items.filter(isMarketplaceFulfillmentItem).length} baris produk ({items.filter(isMarketplaceFulfillmentItem).reduce((s, it) => s + (Number(it.qty) || 1), 0)} pcs) dengan fulfillment <strong className="font-semibold">Marketplace</strong> akan otomatis memunculkan Tugas Picking di kategori <strong className="font-semibold">Manual shipment/alter</strong> begitu pesanan disubmit.
                </span>
              </div>
            </div>
          )}

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

  // Bersihkan pilihan pesanan jika berganti login/user, sub-tab, stage tab, atau filter arah store
  useEffect(() => {
    setSelectedOrders(new Set());
  }, [session?.username, activeTab, stageTab, filterStoreDirection, filterOrderType, filterStatus, filterPrintStatus]);

  const getOrderKey = (o: ManualShipmentOrder) => o.no_pesanan || (o as any).id || '';

  const toggleSelectOrder = (no_pesanan: string) => {
    if (!no_pesanan) return;
    const newSet = new Set(selectedOrders);
    if (newSet.has(no_pesanan)) newSet.delete(no_pesanan);
    else newSet.add(no_pesanan);
    setSelectedOrders(newSet);
  };

  /**
   * Helper to fetch and attach real-time rack locations from Supabase stok_real_fisik & catalog
   * for all items in the given list of ManualShipmentOrder
   */
  const enrichOrdersWithLocations = async (targetOrders: ManualShipmentOrder[]): Promise<ManualShipmentOrder[]> => {
    if (!targetOrders || targetOrders.length === 0) return targetOrders;

    const allSkus: string[] = [];
    targetOrders.forEach(o => {
      const items = ensureOrderItems(o);
      items.forEach(it => {
        if (it.sku) {
          const cleanSku = it.sku.trim().toUpperCase();
          if (cleanSku) allSkus.push(cleanSku);
        }
      });
    });

    if (allSkus.length === 0) {
      return targetOrders.map(o => ({
        ...o,
        items: ensureOrderItems(o),
      }));
    }

    try {
      const stockItems = await fetchStockForSkus(allSkus);
      
      const skuLocationMap = new Map<string, string>();
      const skuStocksMap = new Map<string, StockRealtimeItem[]>();

      stockItems.forEach(stk => {
        const cleanSku = (stk.sku || '').trim().toUpperCase();
        if (!cleanSku) return;
        if (!skuStocksMap.has(cleanSku)) {
          skuStocksMap.set(cleanSku, []);
        }
        skuStocksMap.get(cleanSku)!.push(stk);
      });

      // 1. Authoritative check: live Supabase stok_real_fisik data
      // Strictly enforce Rule 7: Priority 1 (Warehouse A-D, Aksesoris, Transit) -> Priority 2 (Kolian R/V/Z) -> Priority 3 (Blok F).
      // Strictly exclude Perbaikan (Cuci, Permak, Defect) and Anomali from automated picking recommendations!
      allSkus.forEach(cleanSku => {
        const stocks = skuStocksMap.get(cleanSku) || [];
        const validLocStocks = stocks.filter(s => s.lokasi && s.lokasi !== '-' && s.lokasi !== 'KOSONG');
        const activeWarehouse = validLocStocks.filter(s => (s.sisa_stok ?? 0) > 0 && isWarehouseLocation(s.lokasi || '', s.area || ''));

        if (activeWarehouse.length > 0) {
          activeWarehouse.sort((a, b) => {
            const pA = getPickingPriority(a.lokasi || '', a.area || '');
            const pB = getPickingPriority(b.lokasi || '', b.area || '');
            if (pA !== pB) return pA - pB;
            return (b.sisa_stok ?? 0) - (a.sisa_stok ?? 0);
          });
          const formattedLoc = Array.from(new Set(activeWarehouse.map(l => `${l.lokasi} (${l.sisa_stok ?? 0} pcs)`).filter(Boolean))).join(', ');
          skuLocationMap.set(cleanSku, formattedLoc || activeWarehouse[0].lokasi || '- (Belum Ada Rak/Habis)');
        } else {
          // HAPUS FALLBACK CACHE LOKAL:
          // Jika di database Supabase stok fisik habis / 0 / belum ditaruh di rak picking valid,
          // tampilkan '- (Belum Ada Rak/Habis)' agar picker tidak tersesat atau disesatkan ke rak kosong!
          skuLocationMap.set(cleanSku, '- (Belum Ada Rak/Habis)');
        }
      });

      // 2. Map enriched locations back onto order items
      return targetOrders.map(o => {
        const items = ensureOrderItems(o);
        return {
          ...o,
          items: items.map(it => {
            const cleanSku = (it.sku || '').trim().toUpperCase();
            const ful = (it.fulfillment || (it as any).toko_asal || (it as any).store_name || '').trim();
            const fulLower = ful.toLowerCase();

            // Jika fulfillment dari Store (bukan Marketplace / Gudang / Warehouse)
            const isStoreFulfillment = ful && 
              !fulLower.includes('marketplace') && 
              !fulLower.includes('gudang') && 
              !fulLower.includes('warehouse');

            if (isStoreFulfillment) {
              const storeCode = getStoreCode(ful) || ful;
              return {
                ...it,
                lokasi: storeCode,
              };
            }

            // Jika fulfillment Marketplace / Gudang, gunakan hasil live query stok fisik Supabase
            const foundLoc = skuLocationMap.get(cleanSku);
            return {
              ...it,
              lokasi: foundLoc || '- (Belum Ada Rak/Habis)',
            };
          }),
        };
      });
    } catch (err) {
      console.warn('Gagal memuat lokasi rak untuk picking list:', err);
      return targetOrders.map(o => ({
        ...o,
        items: ensureOrderItems(o).map(it => {
          const ful = (it.fulfillment || (it as any).toko_asal || (it as any).store_name || '').trim();
          const fulLower = ful.toLowerCase();
          const isStoreFulfillment = ful && 
            !fulLower.includes('marketplace') && 
            !fulLower.includes('gudang') && 
            !fulLower.includes('warehouse');
          return {
            ...it,
            lokasi: isStoreFulfillment ? (getStoreCode(ful) || ful) : '- (Gagal Memuat Lokasi)',
          };
        }),
      }));
    }
  };

  const handlePrintPickingList = async (singleOrBatchOrder?: ManualShipmentOrder | ManualShipmentOrder[] | any) => {
    const isOrderArray = Array.isArray(singleOrBatchOrder);
    // Robust check: Pastikan singleOrder benar-benar objek ManualShipmentOrder dan bukan MouseEvent dari onClick
    const isRealOrder = Boolean(
      !isOrderArray &&
      singleOrBatchOrder &&
      typeof singleOrBatchOrder === 'object' &&
      !('nativeEvent' in singleOrBatchOrder) &&
      !('bubbles' in singleOrBatchOrder) &&
      (singleOrBatchOrder.no_pesanan || singleOrBatchOrder.id || (Array.isArray(singleOrBatchOrder.items) && singleOrBatchOrder.items.length > 0))
    );

    const itemsToPrint = isOrderArray
      ? (singleOrBatchOrder as ManualShipmentOrder[])
      : isRealOrder
      ? [singleOrBatchOrder as ManualShipmentOrder]
      : scopedOrders.filter(o => {
          const k = getOrderKey(o);
          return k && selectedOrders.has(k);
        });

    if (itemsToPrint.length === 0) {
      onShowToast('Pilih setidaknya satu pesanan yang tampil untuk mencetak picking list', 'info');
      return;
    }

    // Validasi pesanan memiliki rincian item sebelum diproses cetak
    const validOrdersToPrint = itemsToPrint.filter(o => ensureOrderItems(o).length > 0);
    if (validOrdersToPrint.length === 0) {
      onShowToast('Pesanan yang dipilih tidak memiliki rincian item produk untuk dipicking', 'warning');
      return;
    }

    setLoading(true);
    const enrichedOrders = await enrichOrdersWithLocations(validOrdersToPrint);
    
    // Tandai picking list sudah dicetak; hanya pindah ke 'diproses' jika Label Paket JUGA sudah dicetak
    const orderIds = enrichedOrders.map(o => o.no_pesanan || (o as any).id).filter(Boolean);
    const nowIso = new Date().toISOString();
    let movedToDiprosesCount = 0;

    // Update local state immediately for instant responsive UI
    setOrders(prev => prev.map(o => {
      const id = o.no_pesanan || (o as any).id;
      if (orderIds.includes(id) || (o.no_pesanan && orderIds.includes(o.no_pesanan))) {
        const bothDone = !!o.is_label_printed;
        const flowStr = (o.alteration_repair_data?.status_flow || '').toLowerCase();
        const isFlowAktif = ['dalam_pengerjaan', 'selesai_qc', 'diterima_warehouse', 'siap_dikirim'].includes(flowStr);
        const canTransition = o.status !== 'batal' && !isOrderSelesai(o);
        if (bothDone && canTransition && o.status !== 'diproses') movedToDiprosesCount++;
        return {
          ...o,
          status: canTransition ? ((bothDone || isFlowAktif) ? 'diproses' : 'diterima') : o.status,
          is_picking_printed: true,
          tgl_cetak_picking: nowIso,
        };
      }
      return o;
    }));

    if (selectedOrderDetails) {
      const detailId = selectedOrderDetails.no_pesanan || (selectedOrderDetails as any).id;
      if (orderIds.includes(detailId) || (selectedOrderDetails.no_pesanan && orderIds.includes(selectedOrderDetails.no_pesanan))) {
        setSelectedOrderDetails(prev => {
          if (!prev) return null;
          const bothDone = !!prev.is_label_printed;
          const flowStr = (prev.alteration_repair_data?.status_flow || '').toLowerCase();
          const isFlowAktif = ['dalam_pengerjaan', 'selesai_qc', 'diterima_warehouse', 'siap_dikirim'].includes(flowStr);
          const canTransition = prev.status !== 'batal' && !isOrderSelesai(prev);
          return {
            ...prev,
            status: canTransition ? ((bothDone || isFlowAktif) ? 'diproses' : 'diterima') : prev.status,
            is_picking_printed: true,
            tgl_cetak_picking: nowIso,
          };
        });
      }
    }

    updateOrderPrintStatus(orderIds, 'picking').catch(err => console.warn('Async print status error:', err));

    // Set payload cetak in-page (100% didukung di HP dan desktop)
    setPrintPayload({
      mode: 'PICKING',
      orders: enrichedOrders,
      qrMap: {},
      timestamp: Date.now(),
    });
    
    if (!isRealOrder && !isOrderArray) {
      setSelectedOrders(new Set());
    }
    setLoading(false);
    if (movedToDiprosesCount > 0) {
      onShowToast(`Menyiapkan cetak ${enrichedOrders.length} Picking List (2/2 tahap selesai — pesanan pindah ke Sedang Diproses)`, 'success');
    } else {
      onShowToast(`Menyiapkan cetak ${enrichedOrders.length} Picking List (Tahap 1/2 — cetak Label Paket juga agar pindah ke Sedang Diproses)`, 'info');
    }
  };

  const [isSendingPickingWa, setIsSendingPickingWa] = useState(false);

  const handleSendPickingWaGroup = async (singleOrBatchOrder?: ManualShipmentOrder | ManualShipmentOrder[] | any) => {
    if (!userIsAdmin || isStoreUser) {
      onShowToast('Akses ditolak: Fitur Picking WA Grup hanya tersedia untuk Admin Gudang / Superadmin.', 'error');
      return;
    }

    const isOrderArray = Array.isArray(singleOrBatchOrder);
    const isRealOrder = Boolean(
      !isOrderArray &&
      singleOrBatchOrder &&
      typeof singleOrBatchOrder === 'object' &&
      !('nativeEvent' in singleOrBatchOrder) &&
      !('bubbles' in singleOrBatchOrder) &&
      (singleOrBatchOrder.no_pesanan || singleOrBatchOrder.id || (Array.isArray(singleOrBatchOrder.items) && singleOrBatchOrder.items.length > 0))
    );

    const itemsToSend = isOrderArray
      ? (singleOrBatchOrder as ManualShipmentOrder[])
      : isRealOrder
      ? [singleOrBatchOrder as ManualShipmentOrder]
      : scopedOrders.filter(o => {
          const k = getOrderKey(o);
          return k && selectedOrders.has(k);
        });

    if (itemsToSend.length === 0) {
      onShowToast('Pilih setidaknya satu pesanan untuk dikirim daftar picking-nya ke Grup WA', 'info');
      return;
    }

    const isMarketplacePickingItem = (it: ManualShipmentItem): boolean => {
      if (it.item_status === 'sold_out' || it.item_status === 'cancelled') return false;
      const ful = (it.fulfillment || (it as any).toko_asal || (it as any).store_name || '').trim().toLowerCase();
      return !ful || ful.includes('marketplace') || ful.includes('gudang') || ful.includes('warehouse');
    };

    const validOrdersToSend = itemsToSend.filter(
      o => o.status !== 'batal' && ensureOrderItems(o).some(isMarketplacePickingItem)
    );
    if (validOrdersToSend.length === 0) {
      onShowToast(
        'Tidak ada item fulfillment Marketplace / Gudang untuk dikirim ke Picking WA Grup Picker (item Store dikirim lewat Live Chat WMS).',
        'info'
      );
      return;
    }

    const cfg = getFonnteConfig();
    if (!cfg.token || !cfg.groupTarget) {
      onShowToast('Token Fonnte atau ID Grup WhatsApp belum diatur di menu Pengaturan > Integrasi WhatsApp.', 'warning');
      return;
    }

    setIsSendingPickingWa(true);
    try {
      const enrichedOrders = await enrichOrdersWithLocations(validOrdersToSend);

      let totalItems = 0;
      let totalPcs = 0;
      enrichedOrders.forEach(ord => {
        const activeItems = ensureOrderItems(ord).filter(isMarketplacePickingItem);
        totalItems += activeItems.length;
        totalPcs += activeItems.reduce((s, it) => s + (Number(it.qty) || 1), 0);
      });

      const formatOrderItemsList = (ord: ManualShipmentOrder): string => {
        const activeItems = ensureOrderItems(ord).filter(isMarketplacePickingItem);
        return activeItems
          .map((it, idx) => {
            const itemNum = idx + 1;
            const cleanSku = (it.sku || '-').trim();
            const lookup = lookupProductBySku(cleanSku, productCatalog, it.nama_produk, it.size);
            const cleanName = (lookup && lookup.found) ? lookup.nama_produk : (it.nama_produk || cleanSku);
            const cleanSize = (lookup && lookup.found)
              ? (lookup.size ? lookup.size : '-')
              : (!isCorruptedColorCodeSize(cleanSku, it.size) && it.size && it.size !== '-' && it.size.toLowerCase() !== 'default' ? it.size : '-');

            const cleanLoc = it.lokasi && it.lokasi !== '-' && it.lokasi !== 'KOSONG'
              ? it.lokasi
              : '-';

            return (
              `${itemNum}. 📦 *${cleanName}*\n` +
              `   ├ Size    : *${cleanSize}*\n` +
              `   ├ SKU     : \`${cleanSku}\`\n` +
              `   ├ QTY     : *${Number(it.qty) || 1} pcs*\n` +
              `   └ 📍 Lokasi: *${cleanLoc}*`
            );
          })
          .join('\n\n');
      };

      const msgLines: string[] = [];

      if (enrichedOrders.length === 1) {
        const ord = enrichedOrders[0];
        msgLines.push(
          `*🚨 PICKING LIST MARKETPLACE / GUDANG*`,
          `*No. Pesanan:* \`${ord.no_pesanan || '-'}\``,
          ``,
          `📋 *DAFTAR ITEM PICKING GUDANG (${totalItems} Item / ${totalPcs} Pcs):*`,
          formatOrderItemsList(ord)
        );
      } else {
        msgLines.push(
          `*🚨 PICKING LIST MARKETPLACE / GUDANG*`,
          `📋 *DAFTAR ITEM PICKING GUDANG (${enrichedOrders.length} Pesanan / ${totalItems} Item / ${totalPcs} Pcs):*`,
          ``
        );
        enrichedOrders.forEach((ord, oIdx) => {
          msgLines.push(`*${oIdx + 1}) No. Pesanan:* \`${ord.no_pesanan || '-'}\``);
          msgLines.push(formatOrderItemsList(ord));
          if (oIdx < enrichedOrders.length - 1) {
            msgLines.push(``);
          }
        });
      }

      const res = await sendFonnteMessage(cfg.groupTarget, msgLines.join('\n'), cfg.token);
      if (!res.success) {
        onShowToast(`Gagal mengirim Picking List ke Grup WA: ${res.message || 'Error Fonnte'}`, 'error');
        return;
      }

      // Catatan Sesuai Aturan: Picking WA Grup hanya fitur pembantu (khusus item Marketplace/Gudang).
      // Syarat pindah dari Pesanan Baru ke Sedang Diproses tetap wajib: Cetak Picking List (A4) & Cetak Label Paket (A6).
      if (!isRealOrder && !isOrderArray) {
        setSelectedOrders(new Set());
      }

      onShowToast(
        `Daftar Picking Marketplace (${enrichedOrders.length} pesanan, ${totalItems} item) terkirim ke Grup WA Picker via Fonnte!`,
        'success'
      );
    } catch (err: any) {
      onShowToast(`Gagal memproses pengiriman WA Grup: ${err?.message || 'Unknown error'}`, 'error');
    } finally {
      setIsSendingPickingWa(false);
    }
  };

  const handlePrintAlterWorkOrder = async (target: ManualShipmentOrder | ManualShipmentOrder[]) => {
    const targetList = Array.isArray(target) ? target : [target];
    if (targetList.length === 0) {
      onShowToast('Pilih setidaknya satu pesanan dengan kebutuhan alteration', 'warning');
      return;
    }

    setLoading(true);
    const enrichedTargetList = await enrichOrdersWithLocations(targetList);

    // Catatan: Cetak SPK / Struk tidak boleh mengubah status pesanan dari diterima (baru) ke diproses
    const orderIds = enrichedTargetList.map(o => o.no_pesanan || (o as any).id).filter(Boolean);
    updateOrderPrintStatus(orderIds, 'spk').catch(err => console.warn('Async print status error:', err));

    // Generate QR Map for fast scanning on physical ticket
    const qrMap: Record<string, string> = {};
    for (const o of enrichedTargetList) {
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
      orders: enrichedTargetList,
      qrMap,
      timestamp: Date.now(),
      spkPaperSize,
    });

    setLoading(false);
    onShowToast(`Menyiapkan cetak SPK Penjahit (${enrichedTargetList.length} pesanan)`, 'success');
  };

  
  // Handler simpan No SJ DealPOS (Khusus Admin WH)
  const handleSaveSjDealpos = async () => {
    if (!sjModalData) return;
    if (!userIsAdmin) {
      onShowToast('Akses ditolak: Hanya Admin WH yang dapat mengisi atau mengubah No. SJ Delivery DealPOS.', 'error');
      return;
    }
    const { order, item, noSj, applyToAllMarketplace } = sjModalData;
    const cleanSj = noSj.trim();

    if (cleanSj) {
      const storeTxList = Array.isArray(order.no_transaksi_pengirim)
        ? order.no_transaksi_pengirim.map(t => String(t || '').trim().toLowerCase()).filter(Boolean)
        : order.no_transaksi_pengirim
          ? String(order.no_transaksi_pengirim).split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
          : [];
      if (storeTxList.includes(cleanSj.toLowerCase())) {
        onShowToast('No. SJ DealPOS (MKT ➔ Store) tidak boleh sama dengan No. Transaksi DealPOS Penjualan Store! Masukkan nomor Transfer Order dari Admin WH.', 'error');
        return;
      }
    }

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
        const nowIso = new Date().toISOString();
        const mapOrderItems = (o: ManualShipmentOrder): ManualShipmentOrder => {
          const updatedItems = (o.items || []).map(it => {
            if (applyToAllMarketplace || !item || item.id === 'ALL_MKT') {
              const ful = (it.fulfillment || '').toLowerCase();
              const isTarget = ful.includes('marketplace') || ful.includes('gudang') || ful.includes('warehouse') || order.no_pesanan?.startsWith('AR-') || !ful;
              if (isTarget) {
                return { ...it, no_sj_dealpos: cleanSj, sj_updated_at: nowIso, sj_updated_by: operatorName };
              }
            } else if (item && it.id === item.id) {
              return { ...it, no_sj_dealpos: cleanSj, sj_updated_at: nowIso, sj_updated_by: operatorName };
            }
            return it;
          });
          return { ...o, items: updatedItems };
        };

        // Update local state orders agar instan
        setOrders(prev => prev.map(o => o.no_pesanan === order.no_pesanan ? mapOrderItems(o) : o));
        if (selectedOrderDetails?.no_pesanan === order.no_pesanan) {
          setSelectedOrderDetails(prev => prev ? mapOrderItems(prev) : null);
        }

        // Kirim update SJ Marketplace ke Grup Live Chat WMS Store
        const targetLabel =
          applyToAllMarketplace || !item || item.id === 'ALL_MKT'
            ? 'Semua item Marketplace / Gudang'
            : `[${item.sku || '-'}] ${item.nama_produk}`;
        void notifySjMarketplaceUpdatedToChat(order, cleanSj, targetLabel, operatorName);

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

        // Kirim notifikasi ke Grup Live Chat WMS Store jika dicentang
        if (sendWaToStore) {
          const remainingReadyCount = (updated.items || []).filter(
            it => it.item_status !== 'sold_out' && it.item_status !== 'cancelled'
          ).length;

          void notifyOrderSoldOutToChat(
            order,
            item,
            resolution,
            cleanNote,
            remainingReadyCount,
            operatorName
          ).then((ok) => {
            if (ok) {
              onShowToast(`Notifikasi barang sold out dikirim ke Grup Live Chat WMS (${order.nama_pengirim || 'Store'})`, 'info');
            }
          });
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
        void notifySoldItemRestoredToChat(res.updatedOrder, item, operatorName);
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

            {/* Opsi Notifikasi Grup Live Chat WMS ke Store */}
            <div className="p-3 bg-indigo-50/80 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800/60">
              <label className="flex items-start gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWaToStore}
                  onChange={(e) => setSoldModalData(prev => prev ? { ...prev, sendWaToStore: e.target.checked } : null)}
                  className="w-4 h-4 mt-0.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div className="text-xs">
                  <div className="font-bold text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                    <MessageCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    <span>Kirim Notifikasi ke Grup Live Chat WMS Store</span>
                  </div>
                  <div className="text-[11px] text-indigo-700 dark:text-indigo-400 mt-0.5">
                    Pesan rincian barang kosong & tindakan dikirim otomatis ke Grup Live Chat {order.nama_pengirim || 'Store'} (@warehouse · @chocoadm · Store).
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
    const isTargetItem = (it: any) => {
      const ful = (it.fulfillment || '').toLowerCase();
      return ful.includes('marketplace') || ful.includes('gudang') || ful.includes('warehouse') || order.no_pesanan?.startsWith('AR-') || !ful;
    };
    const mktItems = (order.items || []).filter(isTargetItem);

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
                  Transfer MKT / Warehouse ➡️ {order.nama_pengirim}
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

  const renderJadwalKirimStoreModal = () => {
    if (!jadwalModalOrder) return null;
    const order = jadwalModalOrder;

    return (
      <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">
          <div className="flex justify-between items-center px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-indigo-50 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <Store className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 dark:text-white text-base">Atur Jadwal Kirim ke Store</h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Order ID: #{order.no_pesanan}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setJadwalModalOrder(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-4">
            {/* Info Pesanan */}
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Store / Tujuan:</span>
                <span className="font-bold text-slate-800 dark:text-white">{order.nama_tujuan || order.nama_pengirim}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Produk:</span>
                <span className="font-semibold text-slate-800 dark:text-white">{order.items?.length || 0} item</span>
              </div>
              {order.jasa_kirim && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Jasa Kirim / Kurir:</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">{order.jasa_kirim}</span>
                </div>
              )}
            </div>

            {/* Input Tanggal Jadwal Kirim */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Tanggal Jadwal Kirim ke Store: <span className="text-red-500">*</span></span>
              </label>
              <input
                type="date"
                value={inputJadwalDate}
                onChange={(e) => setInputJadwalDate(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-800 border-2 border-indigo-300 dark:border-indigo-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold text-slate-900 dark:text-white"
              />
            </div>

            {/* Input Catatan / Keterangan Kirim */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Catatan Pengiriman (Opsional):
              </label>
              <textarea
                value={inputJadwalCatatan}
                onChange={(e) => setInputJadwalCatatan(e.target.value)}
                placeholder="Contoh: Dibawa kurir internal rute sore / titip delivery toko"
                rows={2}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white resize-none"
              />
            </div>

            {/* Info Status Otomatis Selesai */}
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800/60 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <p className="text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
                Menyimpan jadwal kirim ini akan otomatis memperbarui status pesanan menjadi <strong>Selesai</strong> dalam rekap pesanan.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2.5 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
            <button
              type="button"
              disabled={isSavingJadwal}
              onClick={() => setJadwalModalOrder(null)}
              className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isSavingJadwal || !inputJadwalDate}
              onClick={handleSaveJadwalKirimStore}
              className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isSavingJadwal ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Simpan Jadwal Store</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderResiModal = () => {
    if (!resiModalOrder) return null;

    return (
      <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
          <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-indigo-50/80 dark:bg-indigo-950/40">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-indigo-600 text-white">
                <Truck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 dark:text-white">Input / Update Nomor Resi</h3>
                <p className="text-[10px] text-slate-500 font-mono">{resiModalOrder.no_pesanan}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setResiModalOrder(null)}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="p-5 flex flex-col gap-3.5">
            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 text-[11px] text-slate-600 dark:text-slate-300 space-y-1 border border-slate-200/80 dark:border-slate-800">
              <p><span className="font-semibold text-slate-400">Penerima:</span> <strong className="text-slate-800 dark:text-slate-200">{resiModalOrder.nama_tujuan || '-'}</strong> ({resiModalOrder.no_telp_tujuan || '-'})</p>
              <p><span className="font-semibold text-slate-400">Jasa Kirim:</span> {resiModalOrder.jasa_kirim || '-'}</p>
              <p><span className="font-semibold text-slate-400">Alamat:</span> <span className="line-clamp-2">{resiModalOrder.alamat_tujuan || '-'}</span></p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Nomor Resi Pengiriman:
              </label>
              <input
                type="text"
                value={inputResiValue}
                onChange={(e) => setInputResiValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && inputResiValue.trim() && !isSavingResi) {
                    handleSaveResiModal();
                  }
                }}
                placeholder="Contoh: JNE1234567890 / SPX012345"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-white text-xs font-mono font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                autoFocus
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40">
            <button
              type="button"
              onClick={() => setResiModalOrder(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="button"
              disabled={isSavingResi || !inputResiValue.trim()}
              onClick={handleSaveResiModal}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md shadow-indigo-600/20 disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {isSavingResi ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" />
                  <span>Simpan & Kirim Notif</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderOrderDetailsModal = () => {
    if (!selectedOrderDetails) return null;
    const badgeInfo = getOrderStatusBadgeInfo(selectedOrderDetails);
    return (
      <OrderDetailModal
        order={selectedOrderDetails}
        onClose={() => setSelectedOrderDetails(null)}
        userIsAdmin={userIsAdmin}
        isStoreUser={isStoreUser}
        userAssignedStore={userAssignedStore}
        productCatalog={productCatalog}
        outlets={outlets}
        copiedSj={copiedSj}
        copiedResi={copiedResi}
        statusLabel={badgeInfo.label}
        statusBadgeClass={badgeInfo.badgeClass}
        isIncomingFulfillment={isOrderIncomingFulfillment(selectedOrderDetails)}
        isKirimKeStore={isKirimKeStore(selectedOrderDetails)}
        isSentToWarehouse={isOrderSentToWarehouse(selectedOrderDetails)}
        isEligibleKirimKeGudang={isOrderEligibleKirimKeGudang(selectedOrderDetails)}
        isEligibleSjStruk={isEligibleForSjStruk(selectedOrderDetails)}
        isOrderSelesai={isOrderSelesai(selectedOrderDetails)}
        isStoreFulfilledItem={isStoreFulfilledItem}
        isStoreItemReceived={isStoreItemReceived}
        getValidItemSjDealpos={getValidItemSjDealpos}
        generateCustomerWaTemplate={generateCustomerWaTemplate}
        getCleanCustomerPhone={getCleanCustomerPhone}
        onOpenActionSheet={(o) => setActionSheetOrder(o)}
        onCopySj={(sj) => {
          copyToClipboard(sj, `No. SJ DealPOS ${sj} disalin!`);
          setCopiedSj(sj);
          setTimeout(() => setCopiedSj((prev) => (prev === sj ? null : prev)), 2000);
        }}
        onCopyResi={(orderNo, resi) => {
          copyToClipboard(resi, `Nomor Resi ${resi} disalin!`);
          setCopiedResi(orderNo);
          setTimeout(() => setCopiedResi((prev) => (prev === orderNo ? null : prev)), 2000);
        }}
        onCopyWaTemplate={(text) =>
          copyToClipboard(text, "Format pesan WA Customer berhasil disalin!")
        }
        onCopyFullSummary={(o) =>
          copyToClipboard(
            formatOrderFullSummary(o),
            "Rincian lengkap pesanan (format WA) berhasil disalin!"
          )
        }
        onOpenWaModal={(o) => setWaModalOrder(o)}
        onOpenJadwal={(o) => handleOpenJadwalModal(o)}
        onUpdateResi={(o) => {
          if (!userIsAdmin) {
            onShowToast("Akses ditolak: Hanya Admin yang dapat memperbarui nomor resi.", "error");
            return;
          }
          handleUpdateResi(o.no_pesanan!);
        }}
        onKirimKeGudang={(o) => {
          const storeItems = (o.items || []).filter(
            (it) =>
              it.fulfillment &&
              !it.fulfillment.toLowerCase().includes("marketplace") &&
              !it.fulfillment.toLowerCase().includes("gudang")
          );
          const myStoreItems = userAssignedStore
            ? storeItems.filter((it) => isSameStore(it.fulfillment, userAssignedStore))
            : storeItems;
          setAlterActionData({
            order: o,
            targetItems: myStoreItems.length > 0 ? myStoreItems : o.items || [],
            actionType: "mark_sent_store",
          });
        }}
        onPrintPicking={(o) => handlePrintPickingList(o)}
        onPrintLabel={(o) => handlePrintLabel(o)}
        onPrintSjStruk={(o) => setSjAlterModalOrders([o])}
        onToggleStoreItemReceived={(o, it, idx, received) =>
          handleMarkStoreItemReceived(o, it, idx, received)
        }
        onPreviewPhoto={(url) => setPreviewPhotoUrl(url)}
      />
    );
  };

  const handlePrintLabel = async (singleOrBatchOrder?: ManualShipmentOrder | ManualShipmentOrder[] | any) => {
    if (isStoreUser) {
      onShowToast('Akun Store hanya memiliki akses cetak Struk Surat Jalan (Rangkap 2), bukan Label Pengiriman A6.', 'warning');
      return;
    }

    const isOrderArray = Array.isArray(singleOrBatchOrder);
    const isRealOrder = Boolean(
      !isOrderArray &&
      singleOrBatchOrder &&
      typeof singleOrBatchOrder === 'object' &&
      !('nativeEvent' in singleOrBatchOrder) &&
      !('bubbles' in singleOrBatchOrder) &&
      (singleOrBatchOrder.no_pesanan || singleOrBatchOrder.id || (Array.isArray(singleOrBatchOrder.items) && singleOrBatchOrder.items.length > 0))
    );

    const itemsToPrint = isOrderArray
      ? (singleOrBatchOrder as ManualShipmentOrder[])
      : isRealOrder
      ? [singleOrBatchOrder as ManualShipmentOrder]
      : scopedOrders.filter(o => {
          const k = getOrderKey(o);
          return k && selectedOrders.has(k);
        });

    if (itemsToPrint.length === 0) {
      onShowToast('Pilih setidaknya satu pesanan untuk dicetak labelnya', 'info');
      return;
    }

    setLoading(true);
    const enrichedOrders = await enrichOrdersWithLocations(itemsToPrint);

    const orderIds = enrichedOrders.map(o => o.no_pesanan || (o as any).id).filter(Boolean);
    const nowIso = new Date().toISOString();
    let movedToDiprosesCount = 0;

    // Tandai label sudah dicetak; hanya pindah ke 'diproses' jika Picking List JUGA sudah dicetak
    setOrders(prev => prev.map(o => {
      const id = o.no_pesanan || (o as any).id;
      if (orderIds.includes(id) || (o.no_pesanan && orderIds.includes(o.no_pesanan))) {
        const bothDone = !!o.is_picking_printed;
        const flowStr = (o.alteration_repair_data?.status_flow || '').toLowerCase();
        const isFlowAktif = ['dalam_pengerjaan', 'selesai_qc', 'diterima_warehouse', 'siap_dikirim'].includes(flowStr);
        const canTransition = o.status !== 'batal' && !isOrderSelesai(o);
        if (bothDone && canTransition && o.status !== 'diproses') movedToDiprosesCount++;
        return {
          ...o,
          status: canTransition ? ((bothDone || isFlowAktif) ? 'diproses' : 'diterima') : o.status,
          is_label_printed: true,
          tgl_cetak_label: nowIso,
        };
      }
      return o;
    }));

    if (selectedOrderDetails) {
      const detailId = selectedOrderDetails.no_pesanan || (selectedOrderDetails as any).id;
      if (orderIds.includes(detailId) || (selectedOrderDetails.no_pesanan && orderIds.includes(selectedOrderDetails.no_pesanan))) {
        setSelectedOrderDetails(prev => {
          if (!prev) return null;
          const bothDone = !!prev.is_picking_printed;
          const flowStr = (prev.alteration_repair_data?.status_flow || '').toLowerCase();
          const isFlowAktif = ['dalam_pengerjaan', 'selesai_qc', 'diterima_warehouse', 'siap_dikirim'].includes(flowStr);
          const canTransition = prev.status !== 'batal' && !isOrderSelesai(prev);
          return {
            ...prev,
            status: canTransition ? ((bothDone || isFlowAktif) ? 'diproses' : 'diterima') : prev.status,
            is_label_printed: true,
            tgl_cetak_label: nowIso,
          };
        });
      }
    }

    updateOrderPrintStatus(orderIds, 'label').catch(err => console.warn('Async print status error:', err));

    const qrMap: Record<string, string> = {};
    for (const order of enrichedOrders) {
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
      orders: enrichedOrders,
      qrMap,
      timestamp: Date.now(),
    });

    if (!isRealOrder && !isOrderArray) {
      setSelectedOrders(new Set());
    }
    if (movedToDiprosesCount > 0) {
      onShowToast(`Menyiapkan cetak label A6 ${itemsToPrint.length} paket (2/2 tahap selesai — pesanan pindah ke Sedang Diproses)`, 'success');
    } else {
      onShowToast(`Menyiapkan cetak label A6 ${itemsToPrint.length} paket (Tahap 1/2 — cetak Picking List juga agar pindah ke Sedang Diproses)`, 'info');
    }
  };

  const handleUpdateResi = (no_pesanan: string) => {
    const targetOrder = orders.find(o => o.no_pesanan === no_pesanan || (o as any).id === no_pesanan);
    if (!targetOrder) {
      onShowToast('Pesanan tidak ditemukan', 'error');
      return;
    }
    setResiModalOrder(targetOrder);
    setInputResiValue(targetOrder.no_resi || '');
  };

  const handleSaveResiModal = async () => {
    if (!resiModalOrder) return;
    if (!inputResiValue.trim()) {
      onShowToast('Silakan masukkan nomor resi', 'warning');
      return;
    }

    const cleanResi = inputResiValue.trim();
    const no_pesanan = resiModalOrder.no_pesanan || (resiModalOrder as any).id;
    setIsSavingResi(true);
    try {
      const success = await updateShipmentResi(no_pesanan, cleanResi);
      if (success) {
        const nowIso = new Date().toISOString();
        const autoReceiveItems = (itemsList?: ManualShipmentItem[]) =>
          (itemsList || []).map((it) => {
            if (isStoreFulfilledItem(resiModalOrder, it) && it.item_status !== 'sold_out' && it.item_status !== 'cancelled' && !it.received_at_warehouse) {
              return {
                ...it,
                received_at_warehouse: true,
                received_at: nowIso,
                received_by: 'Otomatis (Pesanan Terkirim)',
              };
            }
            return it;
          });

        const updatedItemsForDb = autoReceiveItems(resiModalOrder.items);
        const hadUnreceivedStoreItems = (resiModalOrder.items || []).some(
          (it) => isStoreFulfilledItem(resiModalOrder, it) && it.item_status !== 'sold_out' && it.item_status !== 'cancelled' && !it.received_at_warehouse
        );
        if (hadUnreceivedStoreItems) {
          editManualShipment({
            ...resiModalOrder,
            no_resi: cleanResi,
            status: 'dikirim',
            items: updatedItemsForDb,
          }).catch((err) => console.warn('Auto-receive store items on resi update warning:', err));
        }

        setOrders(prev => prev.map(o => (o.no_pesanan === no_pesanan || (o as any).id === no_pesanan) ? { ...o, no_resi: cleanResi, status: 'dikirim', items: autoReceiveItems(o.items) } : o));
        if (selectedOrderDetails && (selectedOrderDetails.no_pesanan === no_pesanan || (selectedOrderDetails as any).id === no_pesanan)) {
          setSelectedOrderDetails(prev => prev ? { ...prev, no_resi: cleanResi, status: 'dikirim', items: autoReceiveItems(prev.items) } : null);
        }
        onShowToast('Resi berhasil diupdate & status otomatis berubah menjadi Dikirim (Item Store otomatis Sudah Terima)', 'success');

        // OTOMATIS LIVE CHAT WMS: Kirim notifikasi update resi ke Grup Store
        const resiActor = session?.name || getUserPersonName(session?.username) || session?.username || 'Admin Gudang';
        void notifyOrderResiUpdatedToChat(resiModalOrder, cleanResi, resiActor);

        // NOTIFIKASI EMAIL RESI (Chocochips Official) ke Store & Customer jika dilampirkan
        triggerOrderEmailNotifications(
          { ...resiModalOrder, no_resi: cleanResi, status: 'dikirim' },
          'status_dikirim'
        ).catch((err) => console.warn('Resi email trigger error:', err));

        setResiModalOrder(null);
        loadOrders();
      } else {
        onShowToast('Gagal memperbarui nomor resi di database', 'error');
      }
    } catch (err: any) {
      onShowToast(`Error: ${err?.message || 'Gagal menyimpan resi'}`, 'error');
    } finally {
      setIsSavingResi(false);
    }
  };

  const handleEdit = (order: ManualShipmentOrder) => {
    // Validasi otorisasi: Hanya Admin Gudang / Superadmin yang memiliki izin mengedit pesanan
    if (!userIsAdmin) {
      onShowToast('Akses dibatasi: Hanya Admin Gudang / Superadmin yang berhak mengedit pesanan. Jika ada kesalahan data, silakan ajukan ke Admin via Pusat Bantuan.', 'error');
      return;
    }
    setEditingOrder(order);
    setPengirim(order.nama_pengirim || '');
    setPicStore(
      getValidPersonPicName(
        order.pic_store || order.alteration_repair_data?.pic_pemohon,
        order.nama_pengirim,
        outlets
      )
    );
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
    setTransCustomer(order.no_pesanan || order.no_transaksi_customer || '');
    setItems(order.items || []);
    
    setActiveTab('form');
  };

  const handleDelete = async (no_pesanan: string) => {
    if (!userIsAdmin) {
      onShowToast('Akses ditolak: Hanya Admin Gudang / Superadmin yang memiliki izin menghapus pesanan.', 'error');
      return;
    }
    if (!confirm(`Yakin ingin menghapus pesanan ${no_pesanan}?`)) return;
    setLoading(true);
    const success = await deleteManualShipment(no_pesanan);
    if (success) {
      void removePendingAutoPickingTask(no_pesanan).catch(() => {});
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
    if (!userIsAdmin) {
      onShowToast('Akses ditolak: Hanya Admin Gudang / Superadmin yang berhak membatalkan pesanan. Store silakan ajukan permohonan pembatalan ke Admin.', 'error');
      return;
    }
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
        void removePendingAutoPickingTask(order.no_pesanan).catch(() => {});
        onShowToast(`Pesanan ${order.no_pesanan} berhasil dibatalkan. Histori tersimpan.`, 'success');

        // Kirim notifikasi pembatalan ke Grup Live Chat WMS jika diminta
        if (sendWa) {
          void notifyOrderCancelledToChat(updatedOrder, reasonText, actor).then(() => {
            onShowToast('Notifikasi pembatalan dikirim ke Grup Live Chat WMS!', 'info');
          });
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

  // Helper: Deteksi apakah pesanan ditujukan kirim ke Store atau ke Customer
  const isKirimKeStore = (order: ManualShipmentOrder): boolean => {
    return isKirimKeStoreOrder(order);
  };

  // Helper: Tahap Selesai
  // Selesai = Sudah terisi resi paket untuk paket yang memerlukan resi (ke customer / store via ekspedisi) | Opsi kirim drop di toko tanpa jasa kirim tidak memerlukan resi paket
  const isOrderSelesai = (order: ManualShipmentOrder): boolean => {
    if (order.status === 'batal') return false;

    if (!orderNeedsResi(order)) {
      // Drop di toko tanpa jasa kirim eksternal: tidak wajib isi resi paket
      return !!(order.tgl_jadwal_kirim_store && order.tgl_jadwal_kirim_store.trim()) || order.status === 'dikirim' || order.status === 'selesai';
    } else {
      // Kirim ke Customer atau Kirim ke Store via Ekspedisi: WAJIB sudah ada No. Resi!
      return !!(order.no_resi && order.no_resi.trim());
    }
  };

  // Helper: Tahap Sedang Diproses
  // ATURAN WAJIB 2 KLIK ADMIN: Pindah dari Pesanan Baru ke Sedang Diproses HARUS melalui 2 klik:
  // 1. Cetak Picking List (lembar ceklis) AND 2. Cetak Label Paket
  // Jika baru 1 tahapan cetak (hanya picking list saja atau hanya label paket saja), tetap di Pesanan Baru.
  const isOrderSedangDiproses = (order: ManualShipmentOrder): boolean => {
    if (order.status === 'batal') return false;
    if (isOrderSelesai(order)) return false;

    const hasBothPrinted = !!(order.is_picking_printed && order.is_label_printed);
    const flowStr = (order.alteration_repair_data?.status_flow || '').toLowerCase();
    const isFlowAktif = ['dalam_pengerjaan', 'selesai_qc', 'diterima_warehouse', 'siap_dikirim'].includes(flowStr);

    return hasBothPrinted || isFlowAktif;
  };

  // Helper: Tahap Pesanan Baru
  // Pesanan baru = baru disubmit belum pernah di proses atau dikerjakan oleh admin
  const isOrderPesananBaru = (order: ManualShipmentOrder): boolean => {
    if (order.status === 'batal') return false;
    if (isOrderSelesai(order)) return false;
    if (isOrderSedangDiproses(order)) return false;
    return true;
  };

  // Helper: Status efektif & konfigurasi badge yang selalu sinkron dengan 3 Tahap Utama (Aturan 2 Klik Cetak)
  const getOrderStatusBadgeInfo = (order: ManualShipmentOrder): {
    effectiveStatus: 'batal' | 'dikirim' | 'diproses' | 'diterima';
    label: string;
    badgeClass: string;
  } => {
    if (order.status === 'batal') {
      return {
        effectiveStatus: 'batal',
        label: 'Batal',
        badgeClass: 'border-red-400 dark:border-red-600/70 text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40',
      };
    }
    if (isOrderSelesai(order)) {
      return {
        effectiveStatus: 'dikirim',
        label: order.status === 'selesai' ? 'Selesai' : 'Dikirim',
        badgeClass: 'border-emerald-400 dark:border-emerald-600/70 text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40',
      };
    }
    if (isOrderSedangDiproses(order)) {
      return {
        effectiveStatus: 'diproses',
        label: 'Diproses',
        badgeClass: 'border-yellow-400 dark:border-yellow-600/70 text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40',
      };
    }
    return {
      effectiveStatus: 'diterima',
      label: 'Diterima',
      badgeClass: 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800',
    };
  };

  /**
   * Helper: Standar Kelayakan Cetak SJ Struk (Rangkap 2)
   * Hanya berlaku untuk kepentingan:
   * 1. Pesanan alter/repair produk diambil dari store
   * 2. Pesanan manual shipment yang menyertakan fitur alter dan produk diambil dari store
   * 3. Pesanan manual shipment produk diambil dari store sebagai lampiran kirim dari store to warehouse
   *    (fitur ini memunculkan notif ke store terkait untuk mengirimkan produk dari store tersebut ke warehouse)
   */
  const isEligibleForSjStruk = (order: ManualShipmentOrder): boolean => {
    if (!order) return false;
    const isAr = hasRealAlterItems(order);
    const hasAlter = (order.items || []).some(isRealAlterItem);

    const sender = (order.nama_pengirim || '').toLowerCase().trim();
    const arOrigin = (order.alteration_repair_data?.nama_asal || '').toLowerCase().trim();
    const sumberBarang = order.alteration_repair_data?.sumber_barang;
    
    // Apakah produk diambil dari store (bukan dari internal gudang murni)
    const isFromStore = 
      sumberBarang === 'store' ||
      (sender !== '' && !sender.includes('gudang') && !sender.includes('warehouse')) ||
      (arOrigin !== '' && !arOrigin.includes('gudang') && !arOrigin.includes('warehouse')) ||
      (order.items || []).some(it => {
        const ful = (it.fulfillment || '').toLowerCase().trim();
        return ful !== '' && !ful.includes('gudang') && !ful.includes('warehouse');
      });

    // 1. Pesanan alter/repair produk diambil dari store
    if (isAr && isFromStore) return true;

    // 2. Pesanan manual shipment yang menyertakan fitur alter dan produk diambil dari store
    if (hasAlter && isFromStore) return true;

    // 3. Pesanan manual shipment produk diambil dari store sebagai lampiran kirim store to warehouse
    if (isFromStore) return true;

    return false;
  };

  /**
   * Mengirimkan notifikasi WhatsApp ke Store penyedia produk terkait
   * agar store mengirimkan fisik produk pesanan ke gudang pusat / penjahit
   */
  const handleSendWaStoreNoticeDirect = (targetOrder: ManualShipmentOrder) => {
    setWaNoticeModalOrder(targetOrder);
  };

  // Scope pesanan berdasarkan otorisasi Store pengguna atau Filter Store yang dipilih
  const scopedOrders = useMemo(() => {
    let result = orders;
    // Proteksi Keamanan: Akun Store hanya boleh melihat pesanan tokonya sendiri
    if (!userIsAdmin && userAssignedStore) {
      result = result.filter(o => {
        const isFromThisStore = isSameStore(o.nama_pengirim, userAssignedStore) ||
                                isSameStore(o.alteration_repair_data?.nama_asal, userAssignedStore);
        const hasStoreItem = (o.items || []).some(it => isSameStore(it.fulfillment, userAssignedStore));
        return isFromThisStore || hasStoreItem;
      });
    } else if (filterStore && filterStore !== 'all') {
      result = result.filter(o => {
        const isFromFilterStore = isSameStore(o.nama_pengirim, filterStore) ||
                                  isSameStore(o.alteration_repair_data?.nama_asal, filterStore);
        const hasStoreItem = (o.items || []).some(it => isSameStore(it.fulfillment, filterStore));
        return isFromFilterStore || hasStoreItem;
      });
    }
    return result;
  }, [orders, userIsAdmin, userAssignedStore, filterStore]);

  // Helper: Deteksi apakah pesanan dibuat sendiri oleh store yang sedang login
  const isOrderOutgoingStore = (order: ManualShipmentOrder): boolean => {
    if (!userAssignedStore) return true;
    return isSameStore(order.nama_pengirim, userAssignedStore);
  };

  // Helper: Deteksi apakah pesanan diminta oleh toko lain dan barang difulfill dari store yang sedang login
  const isOrderIncomingFulfillment = (order: ManualShipmentOrder): boolean => {
    if (!userAssignedStore) return false;
    // Jika pesanan dibuat sendiri oleh toko ini, bukan pesanan masuk
    if (isSameStore(order.nama_pengirim, userAssignedStore)) return false;
    
    // Jika toko asal alterasi adalah toko ini
    if (isSameStore(order.alteration_repair_data?.nama_asal, userAssignedStore)) return true;
    
    // Jika salah satu item difulfill dari toko ini
    const itemsList = Array.isArray(order.items) ? order.items : [];
    return itemsList.some(it => isSameStore(it.fulfillment, userAssignedStore));
  };

  // Helper: Cek apakah suatu item dipenuhi dari Store Cabang (bukan Marketplace / Gudang / Warehouse)
  const isStoreFulfilledItem = (order: ManualShipmentOrder, it: ManualShipmentItem): boolean => {
    const ful = (it?.fulfillment || (it as any)?.toko_asal || (it as any)?.store_name || '').trim();
    if (!ful) return false;
    const fulLower = ful.toLowerCase();
    return (
      !fulLower.includes('marketplace') &&
      !fulLower.includes('gudang') &&
      !fulLower.includes('warehouse')
    );
  };

  // Helper: Cek apakah item yang difulfill dari Store sudah diterima fisik di Gudang (atau otomatis dianggap Sudah Terima saat status pesanan Terkirim / Selesai)
  const isStoreItemReceived = (order: ManualShipmentOrder, it: ManualShipmentItem): boolean => {
    if (!isStoreFulfilledItem(order, it)) return false;
    if (it.received_at_warehouse) return true;
    // AUTO-RECEIVE RULE: Sekalipun Admin belum klik Tandai Terima, begitu status pesanan Terkirim / Selesai, otomatis dianggap Sudah Terima
    if (isOrderSelesai(order)) return true;
    const ar = order?.alteration_repair_data;
    if (ar?.tgl_terima_warehouse) return true;
    const flowStr = (ar?.status_flow || '').toLowerCase();
    if (['diterima_warehouse', 'dalam_pengerjaan', 'selesai_qc', 'siap_dikirim', 'dikirim_kembali', 'selesai'].includes(flowStr)) {
      return true;
    }
    return false;
  };

  // Helper: Cek apakah seluruh item fulfillment store pada pesanan ini sudah diterima di Gudang
  const areAllStoreItemsReceived = (order: ManualShipmentOrder): boolean => {
    const storeItems = (order.items || []).filter(
      (it) => isStoreFulfilledItem(order, it) && it.item_status !== 'sold_out' && it.item_status !== 'cancelled'
    );
    if (storeItems.length === 0) return false;
    return storeItems.every((it) => isStoreItemReceived(order, it));
  };

  // Handler: Tandai item fulfillment Store sudah diterima fisik di Gudang Pusat (1-Click Admin Action)
  const handleMarkStoreItemReceived = async (
    order: ManualShipmentOrder,
    targetItem: ManualShipmentItem,
    targetIdx?: number,
    markAsReceived = true
  ) => {
    if (!userIsAdmin) {
      onShowToast('Akses ditolak: Hanya Admin Gudang / Superadmin yang dapat menandai penerimaan barang dari Store.', 'error');
      return;
    }
    if (!markAsReceived && isOrderSelesai(order)) {
      onShowToast('Pesanan yang sudah berstatus Terkirim / Selesai otomatis tercatat Sudah Terima di Gudang.', 'info');
      return;
    }

    const actor = session?.name || getUserPersonName(session?.username) || session?.username || 'Admin Gudang';
    const nowIso = new Date().toISOString();

    const updatedItems = (order.items || []).map((it, idx) => {
      const isMatch =
        (it.id && targetItem.id && it.id === targetItem.id) ||
        (targetIdx !== undefined && idx === targetIdx) ||
        (!it.id && !targetItem.id && it.sku === targetItem.sku && it.fulfillment === targetItem.fulfillment);
      if (!isMatch) return it;
      return {
        ...it,
        received_at_warehouse: markAsReceived,
        received_at: markAsReceived ? nowIso : undefined,
        received_by: markAsReceived ? actor : undefined,
      };
    });

    const storeItemsAfter = updatedItems.filter(
      (it) => isStoreFulfilledItem(order, it) && it.item_status !== 'sold_out' && it.item_status !== 'cancelled'
    );
    const allStoreReceivedNow = storeItemsAfter.length > 0 && storeItemsAfter.every((it) => Boolean(it.received_at_warehouse));

    let updatedArData = order.alteration_repair_data ? { ...order.alteration_repair_data } : undefined;
    if (allStoreReceivedNow && updatedArData) {
      updatedArData.tgl_terima_warehouse = updatedArData.tgl_terima_warehouse || nowIso.slice(0, 10);
      updatedArData.pic_terima_warehouse = updatedArData.pic_terima_warehouse || actor;
      if (!updatedArData.status_flow || updatedArData.status_flow === 'diajukan' || updatedArData.status_flow === 'dikirim_store') {
        updatedArData.status_flow = 'diterima_warehouse';
      }
    } else if (!markAsReceived && updatedArData && updatedArData.status_flow === 'diterima_warehouse' && !allStoreReceivedNow) {
      updatedArData.tgl_terima_warehouse = undefined;
      updatedArData.status_flow = updatedArData.tgl_kirim_store ? 'dikirim_store' : 'diajukan';
    }

    const newLog = {
      id: `log-recv-${Date.now()}`,
      timestamp: nowIso,
      actor,
      action: 'edited' as const,
      note: markAsReceived
        ? `Produk fulfillment store [${targetItem.sku}] ${targetItem.nama_produk} (${targetItem.fulfillment}) ditandai SUDAH TERIMA di Gudang.`
        : `Status terima gudang untuk [${targetItem.sku}] ${targetItem.nama_produk} (${targetItem.fulfillment}) dibatalkan.`,
      affected_sku: targetItem.sku,
      affected_item_name: targetItem.nama_produk,
    };

    const existingLogs = Array.isArray(order.history_logs) ? order.history_logs : [];
    const updatedOrder: ManualShipmentOrder = {
      ...order,
      items: updatedItems,
      ...(updatedArData ? { alteration_repair_data: updatedArData } : {}),
      history_logs: [newLog, ...existingLogs],
    };

    const orderKey = order.no_pesanan || (order as any).id;
    setOrders((prev) =>
      prev.map((o) => (o.no_pesanan === orderKey || (o as any).id === orderKey ? updatedOrder : o))
    );
    if (selectedOrderDetails && (selectedOrderDetails.no_pesanan === orderKey || (selectedOrderDetails as any).id === orderKey)) {
      setSelectedOrderDetails(updatedOrder);
    }

    const res = await editManualShipment(updatedOrder);
    if (res.success) {
      onShowToast(
        markAsReceived
          ? `✅ [${targetItem.sku}] dari ${targetItem.fulfillment} ditandai Sudah Terima di Gudang!`
          : `Status terima [${targetItem.sku}] dibatalkan`,
        markAsReceived ? 'success' : 'info'
      );
      void notifyWarehouseReceivedStoreItemToChat(updatedOrder, targetItem, markAsReceived, actor);
    } else {
      onShowToast(`Gagal menyimpan status terima: ${res.message}`, 'error');
      loadOrders();
    }
  };

  // Helper: Cek apakah produk fisik sudah diatur kirim dari store ke warehouse
  const isOrderSentToWarehouse = (order: ManualShipmentOrder): boolean => {
    if (areAllStoreItemsReceived(order)) return true;
    const ar = order?.alteration_repair_data;
    if (!ar) return false;
    if (['dikirim_store', 'diterima_warehouse', 'dalam_pengerjaan', 'selesai_qc', 'dikirim_kembali', 'selesai'].includes(ar.status_flow || '')) {
      return true;
    }
    if (ar.tgl_kirim_store || ar.kurir_kirim_store) {
      return true;
    }
    return false;
  };

  // Helper: Cek apakah pesanan memenuhi kriteria "Kirim ke Gudang" oleh Store
  // Berlaku untuk:
  // 1. Cross-store fulfillment (incoming request ke store ini)
  // 2. Produk yang difulfill dari store yang sedang login (myStoreItems)
  // 3. Pesanan Alteration/Repair yang fisiknya berada di store dan perlu dikirim ke gudang/penjahit pusat
  const isOrderEligibleKirimKeGudang = (order: ManualShipmentOrder): boolean => {
    if (!order || order.status === 'batal' || isOrderSelesai(order) || areAllStoreItemsReceived(order)) return false;

    // 1. Incoming cross-store fulfillment
    if (isOrderIncomingFulfillment(order)) return true;

    // 2. Jika ada item yang difulfill dari store user yang sedang login
    const storeItems = (order.items || []).filter(it => {
      const ful = (it.fulfillment || '').toLowerCase().trim();
      return ful && !ful.includes('marketplace') && !ful.includes('gudang') && !ful.includes('warehouse');
    });

    if (userAssignedStore) {
      const hasMyStoreItem = storeItems.some(it => isSameStore(it.fulfillment, userAssignedStore));
      if (hasMyStoreItem) return true;

      // 3. Alter/Repair yang diajukan oleh store user atau barang fisiknya dari store
      const isMyStoreOrder = isSameStore(order.nama_pengirim, userAssignedStore) || isSameStore(order.alteration_repair_data?.nama_asal, userAssignedStore);
      const isArOrder = order.order_type === 'alteration_repair' || (order.no_pesanan || '').toUpperCase().startsWith('AR-') || hasRealAlterItems(order);
      const isFisikStore = order.alteration_repair_data?.sumber_barang !== 'warehouse';
      if (isMyStoreOrder && isArOrder && isFisikStore) return true;
    } else if (!isStoreUser) {
      // Untuk Admin / Warehouse: tampil jika ada store fulfillment atau pesanan AR dari store
      const isArOrder = order.order_type === 'alteration_repair' || (order.no_pesanan || '').toUpperCase().startsWith('AR-') || hasRealAlterItems(order);
      return storeItems.length > 0 || isArOrder;
    }

    return false;
  };

  const directionScopedOrders = useMemo(() => {
    if (filterStoreDirection === 'outgoing') {
      return scopedOrders.filter(o => isOrderOutgoingStore(o));
    }
    if (filterStoreDirection === 'incoming') {
      return scopedOrders.filter(o => isOrderIncomingFulfillment(o));
    }
    return scopedOrders;
  }, [scopedOrders, filterStoreDirection, userAssignedStore]);

  // Hitung jumlah pesanan per tahap untuk badges pada Tab Rekap (konsisten dengan directionScopedOrders)
  const { countBaru, countDiproses, countSelesai, countBatal } = useMemo(() => {
    let baru = 0;
    let diproses = 0;
    let selesai = 0;
    let batal = 0;

    directionScopedOrders.forEach(o => {
      if (o.status === 'batal') {
        batal++;
        return;
      }
      if (isOrderSelesai(o)) selesai++;
      else if (isOrderSedangDiproses(o)) diproses++;
      else if (isOrderPesananBaru(o)) baru++;
    });

    return { countBaru: baru, countDiproses: diproses, countSelesai: selesai, countBatal: batal };
  }, [directionScopedOrders]);

  // Switch filter arah toko sekaligus set stageTab ke 'semua' agar semua pesanan arah tersebut langsung tampil
  const handleSelectStoreDirection = (dir: 'all' | 'outgoing' | 'incoming') => {
    setFilterStoreDirection(dir);
    setStageTab('semua');
  };

  // Hitung jumlah pesanan toko sendiri vs permintaan dari toko lain
  const { countOutgoing, countIncoming } = useMemo(() => {
    let outCount = 0;
    let inCount = 0;
    scopedOrders.forEach(o => {
      if (isOrderIncomingFulfillment(o)) inCount++;
      else outCount++;
    });
    return { countOutgoing: outCount, countIncoming: inCount };
  }, [scopedOrders, userAssignedStore]);

  const handleOpenJadwalModal = (order: ManualShipmentOrder) => {
    setJadwalModalOrder(order);
    setInputJadwalDate(order.tgl_jadwal_kirim_store || new Date().toISOString().split('T')[0]);
    setInputJadwalCatatan(order.catatan_jadwal_store || '');
  };

  const handleSaveJadwalKirimStore = async () => {
    if (!jadwalModalOrder) return;
    if (!inputJadwalDate) {
      onShowToast('Silakan pilih tanggal jadwal kirim ke store', 'warning');
      return;
    }

    setIsSavingJadwal(true);
    try {
      const orderId = jadwalModalOrder.no_pesanan || (jadwalModalOrder as any).id;
      const actorName = session?.name || getUserPersonName(session?.username) || session?.role || 'Admin';
      const res = await updateJadwalKirimStore(orderId, inputJadwalDate, inputJadwalCatatan, actorName);

      if (res.success) {
        const nowIso = new Date().toISOString();
        const autoReceiveItems = (itemsList?: ManualShipmentItem[]) =>
          (itemsList || []).map((it) => {
            if (isStoreFulfilledItem(jadwalModalOrder, it) && it.item_status !== 'sold_out' && it.item_status !== 'cancelled' && !it.received_at_warehouse) {
              return {
                ...it,
                received_at_warehouse: true,
                received_at: nowIso,
                received_by: 'Otomatis (Pesanan Terkirim)',
              };
            }
            return it;
          });

        onShowToast('Tanggal jadwal kirim ke store berhasil disimpan & status pesanan ditandai Selesai!', 'success');
        void notifyStoreScheduleToChat(jadwalModalOrder, inputJadwalDate, inputJadwalCatatan, actorName);
        setOrders(prev => prev.map(o => {
          if (o.no_pesanan === jadwalModalOrder.no_pesanan || (o as any).id === orderId) {
            return {
              ...o,
              tgl_jadwal_kirim_store: inputJadwalDate,
              catatan_jadwal_store: inputJadwalCatatan,
              status: 'dikirim',
              items: autoReceiveItems(o.items),
            };
          }
          return o;
        }));
        if (selectedOrderDetails && (selectedOrderDetails.no_pesanan === jadwalModalOrder.no_pesanan || (selectedOrderDetails as any).id === orderId)) {
          setSelectedOrderDetails(prev => prev ? {
            ...prev,
            tgl_jadwal_kirim_store: inputJadwalDate,
            catatan_jadwal_store: inputJadwalCatatan,
            status: 'dikirim',
            items: autoReceiveItems(prev.items),
          } : null);
        }
        setJadwalModalOrder(null);
      } else {
        onShowToast(`Gagal menyimpan jadwal: ${res.message}`, 'error');
      }
    } catch (err: any) {
      onShowToast(`Error: ${err?.message || 'Gagal menyimpan jadwal'}`, 'error');
    } finally {
      setIsSavingJadwal(false);
    }
  };

  /**
   * Helper Component: Render Badges Penanda
   * Badge 1: Reminder SJ DealPOS (Marketplace / Ambil dari Gudang ke Store)
   * Badge 2: Penanda Perlu Alter / Repair
   * Jika keduanya terpenuhi, kedua badge akan dirender berdampingan!
   */
  /**
   * Helper Component: Render Badges Penanda (1 Row Baris, Ringkas, Rapi)
   */
  const renderOrderBadges = (order: ManualShipmentOrder, isCompactTable = false) => {
    const mktOrGudangItems = (order.items || []).filter(it => {
      const ful = (it.fulfillment || '').toLowerCase();
      return ful.includes('marketplace') || ful.includes('gudang') || ful.includes('warehouse') || order.no_pesanan?.startsWith('AR-') || !ful;
    });
    const isWarehouseAr = order.alteration_repair_data?.sumber_barang === 'warehouse';
    const hasMarketplaceOrWarehouse = mktOrGudangItems.length > 0 || isWarehouseAr;

    const findItemSj = (it: any) => {
      return getValidItemSjDealpos(order, it);
    };

    const missingSj = mktOrGudangItems.some(it => !findItemSj(it));
    const existingSj = mktOrGudangItems.map(findItemSj).find(Boolean) || '';

    const hasAlterFeature = hasRealAlterItems(order);
    const isSentToWh = isOrderSentToWarehouse(order);
    const showPrintBadges = order.status !== 'batal';

    if (!hasMarketplaceOrWarehouse && !hasAlterFeature && !isSentToWh && !showPrintBadges) return null;

    return (
      <div className="flex flex-wrap items-center gap-1 mt-0.5">
        {/* BADGE 0: Indikator Cetak Label Paket */}
        {showPrintBadges && (
          order.is_label_printed ? (
            <span
              className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-2xs whitespace-nowrap"
              title={`Label Paket A6 sudah dicetak${order.tgl_cetak_label ? ` pada ${new Date(order.tgl_cetak_label).toLocaleString('id-ID')}` : ''}`}
            >
              <CheckCircle2 className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
              <span>Label OK</span>
            </span>
          ) : !isStoreUser ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrintLabel(order);
              }}
              className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/60 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
              title="Label Paket A6 belum dicetak. Klik untuk langsung cetak Label Paket"
            >
              <Printer className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Belum Label</span>
            </button>
          ) : (
            <span
              className="inline-flex items-center gap-0.5 text-[8.5px] font-semibold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-300 dark:border-slate-700 whitespace-nowrap"
              title="Menunggu Admin Gudang mencetak Label Paket"
            >
              <Clock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
              <span>Belum Label</span>
            </span>
          )
        )}

        {/* BADGE 1: Indikator Cetak Picking List */}
        {showPrintBadges && (
          order.is_picking_printed ? (
            <span
              className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-700 shadow-2xs whitespace-nowrap"
              title={`Picking List sudah dicetak${order.tgl_cetak_picking ? ` pada ${new Date(order.tgl_cetak_picking).toLocaleString('id-ID')}` : ''}`}
            >
              <CheckCircle2 className="w-2.5 h-2.5 text-indigo-600 shrink-0" />
              <span>Picking OK</span>
            </span>
          ) : !isStoreUser ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handlePrintPickingList(order);
              }}
              className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-300 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
              title="Picking List belum dicetak. Klik untuk langsung cetak Picking List"
            >
              <FileText className="w-2.5 h-2.5 text-slate-500 shrink-0" />
              <span>Belum Picking</span>
            </button>
          ) : null
        )}

        {/* BADGE 2: Reminder SJ DealPOS (Marketplace/Gudang to Store) */}
        {hasMarketplaceOrWarehouse && (
          missingSj ? (
            userIsAdmin ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSjModalData({
                    order,
                    noSj: '',
                    applyToAllMarketplace: true,
                  });
                }}
                className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/60 shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                title="Perlu Buat Dokumen SJ DealPOS (Marketplace / Gudang to Store). Klik untuk input No. SJ"
              >
                <AlertTriangle className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0 animate-bounce" />
                <span>Butuh SJ</span>
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-700 shadow-2xs whitespace-nowrap"
                title="Menunggu Admin WH menginput No. SJ Delivery DealPOS"
              >
                <Clock className="w-2.5 h-2.5 text-amber-600 dark:text-amber-400 shrink-0" />
                <span>Menunggu SJ</span>
              </span>
            )
          ) : !isCompactTable ? (
            <span 
              className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 shadow-2xs whitespace-nowrap"
              title={`Dokumen SJ DealPOS: ${existingSj || 'Lengkap'}`}
            >
              <FileCheck className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
              <span>SJ: {existingSj || 'Lengkap'}</span>
            </span>
          ) : null
        )}

        {/* BADGE 3: Penanda Perlu Alter / Repair */}
        {hasAlterFeature && (
          <span 
            className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 border border-rose-300 dark:border-rose-700 shadow-2xs whitespace-nowrap"
            title="Pesanan ini menyertakan fitur alter / perbaikan pakaian"
          >
            <Scissors className="w-2.5 h-2.5 text-rose-600 dark:text-rose-400 shrink-0" />
            <span>Alter</span>
          </span>
        )}

        {/* BADGE 4: Penanda Sudah Atur Kirim ke Warehouse */}
        {isSentToWh && (
          <span 
            className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded bg-blue-50 dark:bg-blue-950/80 text-blue-800 dark:text-blue-200 border border-blue-300 dark:border-blue-700 shadow-2xs whitespace-nowrap"
            title={`Barang telah diatur dikirim dari Store ke Warehouse via ${order.alteration_repair_data?.kurir_kirim_store || 'Kurir'}${order.alteration_repair_data?.tgl_kirim_store ? ` (Tgl: ${order.alteration_repair_data.tgl_kirim_store})` : ''}`}
          >
            <Truck className="w-2.5 h-2.5 text-blue-600 dark:text-blue-400 shrink-0" />
            <span>Kirim WH</span>
          </span>
        )}
      </div>
    );
  };

  const filteredOrders = useMemo(() => {
    let result = scopedOrders;

    // Tahap Utama Rekap Pesanan: 'baru' | 'diproses' | 'selesai' | 'batal' | 'semua'
    if (stageTab === 'baru') {
      result = result.filter(o => isOrderPesananBaru(o));
    } else if (stageTab === 'diproses') {
      result = result.filter(o => isOrderSedangDiproses(o));
    } else if (stageTab === 'selesai') {
      result = result.filter(o => isOrderSelesai(o));
    } else if (stageTab === 'batal') {
      result = result.filter(o => o.status === 'batal');
    }

    // Filter Arah Pesanan Toko (Semua vs Dibuat Toko Ini vs Permintaan Toko Lain)
    if (filterStoreDirection === 'outgoing') {
      result = result.filter(o => isOrderOutgoingStore(o));
    } else if (filterStoreDirection === 'incoming') {
      result = result.filter(o => isOrderIncomingFulfillment(o));
    }

    // Filter Jenis Pesanan (Manual Shipment vs Alteration & Repair vs Manual With Alter)
    if (filterOrderType !== 'all') {
      result = result.filter(o => {
        const isAr = isStandaloneArOrder(o);
        const hasAlterItem = (o.items || []).some(isRealAlterItem) || hasValidArData(o.alteration_repair_data);
        if (filterOrderType === 'alteration_repair') return isAr;
        if (filterOrderType === 'manual_with_alter') return !isAr && hasAlterItem;
        if (filterOrderType === 'manual_shipment') return !isAr && !hasAlterItem;
        return true;
      });
    }

    // Filter Status Alteration Dropdown
    if (filterAlterStatus !== 'all') {
      result = result.filter(o => {
        const isAr = isStandaloneArOrder(o);
        const hasAlterItem = (o.items || []).some(isRealAlterItem) || hasValidArData(o.alteration_repair_data);
        if (filterAlterStatus === 'manual_with_alter') return !isAr && hasAlterItem;
        if (filterAlterStatus === 'all_alter') return isAr || hasAlterItem;
        if (filterAlterStatus === 'no_alter') return !isAr && !hasAlterItem;
        return true;
      });
    }
    
    // Status filter (diselaraskan dengan status efektif tahapan pesanan)
    if (filterStatus !== 'all') {
      const targetStatus = filterStatus.toLowerCase().trim();
      result = result.filter(o => {
        if (targetStatus === 'batal') {
          return o.status === 'batal';
        }
        if (targetStatus === 'dikirim') {
          return isOrderSelesai(o);
        }
        if (targetStatus === 'diproses') {
          return isOrderSedangDiproses(o);
        }
        if (targetStatus === 'pending' || targetStatus === 'diterima') {
          return isOrderPesananBaru(o);
        }
        const s = (o.status || '').toLowerCase().trim();
        return s === targetStatus;
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
          (it.fulfillment || '').toLowerCase().includes('marketplace') && !getValidItemSjDealpos(o, it)
        )
      );
    } else if (filterDealposSj === 'has_sj') {
      result = result.filter(o => 
        (o.items || []).some(it => 
          (it.fulfillment || '').toLowerCase().includes('marketplace') && !!getValidItemSjDealpos(o, it)
        )
      );
    }

    // Filter Khusus Pesanan yang Mengalami Sold Out
    if (filterSoldStatus === 'has_sold') {
      result = result.filter(o => 
        (o.items || []).some(it => it.item_status === 'sold_out')
      );
    }

    // Filter Status Cetak Label Paket & Picking List
    if (filterPrintStatus === 'unprinted_label') {
      result = result.filter(o => o.status !== 'batal' && !o.is_label_printed);
    } else if (filterPrintStatus === 'printed_label') {
      result = result.filter(o => !!o.is_label_printed);
    } else if (filterPrintStatus === 'unprinted_picking') {
      result = result.filter(o => o.status !== 'batal' && !o.is_picking_printed);
    } else if (filterPrintStatus === 'printed_picking') {
      result = result.filter(o => !!o.is_picking_printed);
    } else if (filterPrintStatus === 'incomplete_print') {
      result = result.filter(o => o.status !== 'batal' && (!o.is_picking_printed || !o.is_label_printed));
    } else if (filterPrintStatus === 'complete_print') {
      result = result.filter(o => !!(o.is_picking_printed && o.is_label_printed));
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

    // Custom Sorting (Terbaru, Terlama/FIFO, Per Toko, Customer, Ekspedisi, Qty, Prioritas Cetak, Target Alter)
    const getOrderTimestamp = (o: ManualShipmentOrder): number => {
      const raw = o.created_at || (o as any).tanggal || '';
      if (!raw) return 0;
      const t = new Date(raw).getTime();
      return isNaN(t) ? 0 : t;
    };

    const getOrderTotalQty = (o: ManualShipmentOrder): number => {
      return (o.items || []).reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
    };

    const getAlterTargetTime = (o: ManualShipmentOrder): number => {
      const raw = o.alteration_repair_data?.perkiraan_selesai || '';
      if (!raw) return Number.MAX_SAFE_INTEGER;
      const t = new Date(raw).getTime();
      return isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
    };

    const sorted = [...result];
    sorted.sort((a, b) => {
      const timeA = getOrderTimestamp(a);
      const timeB = getOrderTimestamp(b);

      switch (sortBy) {
        case 'oldest':
          return timeA - timeB;
        case 'store_asc': {
          const storeA = (a.nama_pengirim || '').trim().toLowerCase();
          const storeB = (b.nama_pengirim || '').trim().toLowerCase();
          const cmp = storeA.localeCompare(storeB, 'id');
          return cmp !== 0 ? cmp : timeB - timeA;
        }
        case 'store_desc': {
          const storeA = (a.nama_pengirim || '').trim().toLowerCase();
          const storeB = (b.nama_pengirim || '').trim().toLowerCase();
          const cmp = storeB.localeCompare(storeA, 'id');
          return cmp !== 0 ? cmp : timeB - timeA;
        }
        case 'customer_asc': {
          const custA = (a.nama_tujuan || '').trim().toLowerCase();
          const custB = (b.nama_tujuan || '').trim().toLowerCase();
          const cmp = custA.localeCompare(custB, 'id');
          return cmp !== 0 ? cmp : timeB - timeA;
        }
        case 'customer_desc': {
          const custA = (a.nama_tujuan || '').trim().toLowerCase();
          const custB = (b.nama_tujuan || '').trim().toLowerCase();
          const cmp = custB.localeCompare(custA, 'id');
          return cmp !== 0 ? cmp : timeB - timeA;
        }
        case 'courier_asc': {
          const jkA = (a.jasa_kirim || 'ZZZ').trim().toLowerCase();
          const jkB = (b.jasa_kirim || 'ZZZ').trim().toLowerCase();
          const cmp = jkA.localeCompare(jkB, 'id');
          return cmp !== 0 ? cmp : timeB - timeA;
        }
        case 'qty_desc': {
          const diff = getOrderTotalQty(b) - getOrderTotalQty(a);
          return diff !== 0 ? diff : timeB - timeA;
        }
        case 'qty_asc': {
          const diff = getOrderTotalQty(a) - getOrderTotalQty(b);
          return diff !== 0 ? diff : timeB - timeA;
        }
        case 'unprinted_first': {
          const scoreA = (a.status === 'batal' ? 3 : 0) + (a.is_label_printed ? 1 : 0) + (a.is_picking_printed ? 1 : 0);
          const scoreB = (b.status === 'batal' ? 3 : 0) + (b.is_label_printed ? 1 : 0) + (b.is_picking_printed ? 1 : 0);
          return scoreA !== scoreB ? scoreA - scoreB : timeA - timeB;
        }
        case 'target_alter_asc': {
          const targetA = getAlterTargetTime(a);
          const targetB = getAlterTargetTime(b);
          return targetA !== targetB ? targetA - targetB : timeA - timeB;
        }
        case 'newest':
        default:
          return timeB - timeA;
      }
    });

    return sorted;
  }, [
    scopedOrders,
    stageTab,
    searchTerm,
    filterJasaKirim,
    filterStatus,
    filterStartDate,
    filterEndDate,
    filterDealposSj,
    filterSoldStatus,
    filterPrintStatus,
    filterOrderType,
    filterAlterStatus,
    filterStoreDirection,
    sortBy,
  ]);

  // Multi-choice Helper: Hitung pesanan terpilih dalam filter saat ini
  const selectedInFilteredCount = useMemo(() => {
    return filteredOrders.filter(o => {
      const k = getOrderKey(o);
      return k && selectedOrders.has(k);
    }).length;
  }, [filteredOrders, selectedOrders]);

  const isAllFilteredSelected = filteredOrders.length > 0 && selectedInFilteredCount === filteredOrders.length;
  const isSomeFilteredSelected = selectedInFilteredCount > 0 && !isAllFilteredSelected;

  const handleSelectAllFiltered = () => {
    if (filteredOrders.length === 0) return;
    const newSet = new Set(selectedOrders);
    filteredOrders.forEach((o) => {
      const k = getOrderKey(o);
      if (k) newSet.add(k);
    });
    setSelectedOrders(newSet);
    onShowToast(`${filteredOrders.length} pesanan berhasil dipilih`, 'info');
  };

  const handleUnselectAll = () => {
    setSelectedOrders(new Set());
    onShowToast('Semua pilihan pesanan dibatalkan', 'info');
  };

  const handleToggleSelectAllFiltered = () => {
    if (filteredOrders.length === 0) return;
    const newSet = new Set(selectedOrders);
    if (isAllFilteredSelected) {
      filteredOrders.forEach((o) => {
        const k = getOrderKey(o);
        if (k) newSet.delete(k);
      });
      onShowToast('Pilihan pesanan di halaman ini dibatalkan', 'info');
    } else {
      filteredOrders.forEach((o) => {
        const k = getOrderKey(o);
        if (k) newSet.add(k);
      });
      onShowToast(`${filteredOrders.length} pesanan berhasil dipilih`, 'info');
    }
    setSelectedOrders(newSet);
  };

  const handlePrintBatchSjStruk = (targetOrder?: ManualShipmentOrder) => {
    if (targetOrder) {
      setSjAlterModalOrders([targetOrder]);
      return;
    }
    const selectedList = scopedOrders.filter(o => {
      const k = getOrderKey(o);
      return k && selectedOrders.has(k);
    });
    if (selectedList.length === 0) {
      onShowToast('Pilih setidaknya satu pesanan untuk dicetak Surat Jalan Struk', 'info');
      return;
    }
    setSjAlterModalOrders(selectedList);
    onShowToast(`Membuka Surat Jalan Struk Rangkap 2 untuk ${selectedList.length} pesanan`, 'success');
  };

  // Hitung jumlah order yang memiliki produk Marketplace yang butuh No SJ DealPOS
  const pendingSjCount = useMemo(() => {
    return scopedOrders.filter(o => 
      (o.items || []).some(it => 
        (it.fulfillment || '').toLowerCase().includes('marketplace') && !getValidItemSjDealpos(o, it)
      )
    ).length;
  }, [scopedOrders]);

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
          const lookup = lookupProductBySku(it.sku, productCatalog, it.nama_produk, it.size);
          const cleanName = (lookup && lookup.found) ? lookup.nama_produk : (it.nama_produk || '');
          const size = (lookup && lookup.found)
            ? (lookup.size ? lookup.size : '')
            : (!isCorruptedColorCodeSize(it.sku, it.size) && it.size && it.size !== '-' && it.size.toLowerCase() !== 'default' ? it.size : '');

          const rowCols = [
            ...baseOrderCols,
            it.sku || '',
            cleanName,
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
    const stageScopedOrders = directionScopedOrders.filter(o => {
      if (stageTab === 'baru') return isOrderPesananBaru(o);
      if (stageTab === 'diproses') return isOrderSedangDiproses(o);
      if (stageTab === 'selesai') return isOrderSelesai(o);
      if (stageTab === 'batal') return o.status === 'batal';
      return true;
    });
    const totalArCount = stageScopedOrders.filter(o => isStandaloneArOrder(o)).length;
    const totalManualWithAlterCount = stageScopedOrders.filter(o => {
      const isAr = isStandaloneArOrder(o);
      const hasAlter = (o.items || []).some(isRealAlterItem) || hasValidArData(o.alteration_repair_data);
      return !isAr && hasAlter;
    }).length;
    const totalManualPureCount = stageScopedOrders.filter(o => {
      const isAr = isStandaloneArOrder(o);
      const hasAlter = (o.items || []).some(isRealAlterItem) || hasValidArData(o.alteration_repair_data);
      return !isAr && !hasAlter;
    }).length;
    const unassignedResiCount = scopedOrders.filter(o => o.status !== 'batal' && orderNeedsResi(o) && !(o.no_resi || '').trim()).length;
    const unprintedLabelCount = stageScopedOrders.filter(o => o.status !== 'batal' && !o.is_label_printed).length;
    const unprintedPickingCount = stageScopedOrders.filter(o => o.status !== 'batal' && !o.is_picking_printed).length;
    const printedLabelCount = stageScopedOrders.filter(o => o.status !== 'batal' && !!o.is_label_printed).length;

    const selectedAlterOrders = scopedOrders.filter(o => {
      const k = getOrderKey(o);
      if (!selectedOrders.has(k)) return false;
      const isAr = isStandaloneArOrder(o);
      return isAr || (o.items || []).some(isRealAlterItem) || hasValidArData(o.alteration_repair_data);
    });

    const unprintedPickingFilteredCount =
      filterPrintStatus === "unprinted_picking"
        ? filteredOrders.length
        : filteredOrders.filter((o) => !o.is_picking_printed).length || filteredOrders.length;

    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-full min-h-[560px] transition-colors">
        <RekapToolbar
          viewMode={viewMode}
          onSetViewMode={handleSetViewMode}
          filteredOrdersCount={filteredOrders.length}
          directionScopedOrdersCount={directionScopedOrders.length}
          scopedOrdersCount={scopedOrders.length}
          loading={loading}
          userIsAdmin={userIsAdmin}
          isStoreUser={isStoreUser}
          userAssignedStore={userAssignedStore}
          countBaru={countBaru}
          countDiproses={countDiproses}
          countSelesai={countSelesai}
          countBatal={countBatal}
          countOutgoing={countOutgoing}
          countIncoming={countIncoming}
          totalManualPureCount={totalManualPureCount}
          totalManualWithAlterCount={totalManualWithAlterCount}
          totalArCount={totalArCount}
          unassignedResiCount={unassignedResiCount}
          unprintedLabelCount={unprintedLabelCount}
          unprintedPickingCount={unprintedPickingCount}
          printedLabelCount={printedLabelCount}
          pendingSjCount={pendingSjCount}
          unprintedPickingFilteredCount={unprintedPickingFilteredCount}
          stageTab={stageTab}
          onSetStageTab={setStageTab}
          filterStoreDirection={filterStoreDirection}
          onSelectStoreDirection={handleSelectStoreDirection}
          filterOrderType={filterOrderType}
          onSetFilterOrderType={setFilterOrderType}
          filterPrintStatus={filterPrintStatus}
          onSetFilterPrintStatus={setFilterPrintStatus}
          searchTerm={searchTerm}
          onSetSearchTerm={setSearchTerm}
          sortBy={sortBy}
          onSetSortBy={setSortBy}
          isFilterExpanded={isFilterExpanded}
          onToggleFilterExpanded={() => setIsFilterExpanded(!isFilterExpanded)}
          filterStore={filterStore}
          onSetFilterStore={setFilterStore}
          filterJasaKirim={filterJasaKirim}
          onSetFilterJasaKirim={setFilterJasaKirim}
          filterStatus={filterStatus}
          onSetFilterStatus={setFilterStatus}
          filterAlterStatus={filterAlterStatus}
          onSetFilterAlterStatus={setFilterAlterStatus}
          filterDealposSj={filterDealposSj}
          onSetFilterDealposSj={setFilterDealposSj}
          filterSoldStatus={filterSoldStatus}
          onSetFilterSoldStatus={setFilterSoldStatus}
          filterStartDate={filterStartDate}
          onSetFilterStartDate={setFilterStartDate}
          filterEndDate={filterEndDate}
          onSetFilterEndDate={setFilterEndDate}
          onResetAllFilters={() => {
            setSearchTerm("");
            setSortBy("newest");
            setFilterStore("all");
            setFilterJasaKirim("all");
            setFilterStatus("all");
            setFilterAlterStatus("all");
            setFilterOrderType("all");
            setFilterDealposSj("all");
            setFilterSoldStatus("all");
            setFilterPrintStatus("all");
            setFilterStartDate("");
            setFilterEndDate("");
          }}
          outlets={outlets}
          jasaKirimList={jasaKirimList}
          isUtilsMenuOpen={isRekapUtilsMenuOpen}
          onSetUtilsMenuOpen={setIsRekapUtilsMenuOpen}
          onOpenBulkResi={() => setIsBulkResiModalOpen(true)}
          onOpenSopPresentation={() => setIsSopPresentationOpen(true)}
          onExportCsv={handleExportCSV}
          onRefreshDelta={loadOrders}
          onForceReload={forceReloadOrders}
          isSendingPickingWa={isSendingPickingWa}
          onQuickPrintMassLabel={() => handlePrintLabel(filteredOrders)}
          onQuickPrintMassPicking={() => handlePrintPickingList(filteredOrders)}
          onQuickSendPickingWaGroup={() => {
            const targetList =
              filterPrintStatus === "unprinted_picking"
                ? filteredOrders
                : filteredOrders.filter((o) => !o.is_picking_printed);
            handleSendPickingWaGroup(targetList.length > 0 ? targetList : filteredOrders);
          }}
          selectedCount={selectedOrders.size}
          selectedAlterCount={selectedAlterOrders.length}
          isAllFilteredSelected={isAllFilteredSelected}
          isSomeFilteredSelected={isSomeFilteredSelected}
          onToggleSelectAllFiltered={handleToggleSelectAllFiltered}
          onUnselectAll={handleUnselectAll}
          onBatchPrintSjStruk={() => handlePrintBatchSjStruk()}
          onBatchPrintPicking={() => handlePrintPickingList()}
          onBatchSendPickingWaGroup={() => handleSendPickingWaGroup()}
          onBatchPrintLabel={() => handlePrintLabel()}
          onBatchPrintAlterSpk={() => handlePrintAlterWorkOrder(selectedAlterOrders)}
        />

        <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-900/50">
          <RekapOrderViews
            viewMode={viewMode}
            filteredOrders={filteredOrders}
            directionScopedOrdersCount={directionScopedOrders.length}
            stageTab={stageTab}
            searchTerm={searchTerm}
            sortBy={sortBy}
            onChangeSortBy={setSortBy}
            onShowAllStages={() => setStageTab("semua")}
            canAction={canAction}
            userIsAdmin={userIsAdmin}
            isStoreUser={isStoreUser}
            selectedOrders={selectedOrders}
            isAllFilteredSelected={isAllFilteredSelected}
            isSomeFilteredSelected={isSomeFilteredSelected}
            onToggleSelectAllFiltered={handleToggleSelectAllFiltered}
            onToggleSelectOrder={toggleSelectOrder}
            getOrderKey={getOrderKey}
            productCatalog={productCatalog}
            outlets={outlets}
            copiedSj={copiedSj}
            copiedResi={copiedResi}
            onCopySj={(sj) => {
              copyToClipboard(sj, `No. SJ ${sj} disalin!`);
              setCopiedSj(sj);
              setTimeout(() => setCopiedSj(null), 2000);
            }}
            onCopyResi={(orderNo, resi) => {
              copyToClipboard(resi, `No. Resi ${resi} berhasil disalin!`);
              setCopiedResi(orderNo);
              setTimeout(() => setCopiedResi(null), 2000);
            }}
            getOrderStatusBadgeInfo={getOrderStatusBadgeInfo}
            isOrderIncomingFulfillment={isOrderIncomingFulfillment}
            isStoreFulfilledItem={isStoreFulfilledItem}
            isStoreItemReceived={isStoreItemReceived}
            isOrderSelesai={isOrderSelesai}
            isKirimKeStore={isKirimKeStore}
            isOrderSentToWarehouse={isOrderSentToWarehouse}
            isOrderEligibleKirimKeGudang={isOrderEligibleKirimKeGudang}
            isEligibleForSjStruk={isEligibleForSjStruk}
            getValidItemSjDealpos={getValidItemSjDealpos}
            onOpenDetail={(o) => setSelectedOrderDetails(o)}
            onOpenActionSheet={(o) => setActionSheetOrder(o)}
            onKirimKeGudang={(o) => {
              const storeItems = (o.items || []).filter(
                (it) =>
                  it.fulfillment &&
                  !it.fulfillment.toLowerCase().includes("marketplace") &&
                  !it.fulfillment.toLowerCase().includes("gudang")
              );
              const myStoreItems = userAssignedStore
                ? storeItems.filter((it) => isSameStore(it.fulfillment, userAssignedStore))
                : storeItems;
              setAlterActionData({
                order: o,
                targetItems: myStoreItems.length > 0 ? myStoreItems : o.items || [],
                actionType: "mark_sent_store",
              });
            }}
            onPrintLabel={(o) => handlePrintLabel(o)}
            onPrintPicking={(o) => handlePrintPickingList(o)}
            onPrintSjStruk={(o) => setSjAlterModalOrders([o])}
            onInputResi={(o) => handleUpdateResi(o.no_pesanan!)}
            onWaCustomer={(o) => setWaModalOrder(o)}
            onInputSjDealpos={(o, existingSj) =>
              setSjModalData({
                order: o,
                noSj: existingSj,
                applyToAllMarketplace: true,
              })
            }
            onOpenJadwal={(o) => handleOpenJadwalModal(o)}
            onToggleStoreItemReceived={(o, it, idx, received) =>
              handleMarkStoreItemReceived(o, it, idx, received)
            }
            onMarkItemSold={(o, it) => {
              const isMulti = (o.items || []).length > 1;
              setSoldModalData({
                order: o,
                item: it,
                resolution: isMulti ? "partial_fulfill" : "cancel_order",
                note: "Stok kosong di alokasi DealPOS Marketplace.",
                sendWaToStore: true,
              });
            }}
            onRestoreSoldItem={(o, it) => handleRestoreSoldItem(o, it)}
          />
        </div>
      </div>
    );
  };

  return (
    <>
    <div className="w-full max-w-full p-0 animate-in fade-in duration-300 print:hidden">
      {/* Tab Navigation - Horizontal swipe on mobile, clean toolbar on desktop */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2.5 sm:mb-3.5">
        <div className="flex items-center p-1 bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-2xs overflow-x-auto no-scrollbar whitespace-nowrap">
          <button
            type="button"
            id="tab-manual-form"
            className={`py-2 sm:py-1.5 px-3 sm:px-3.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 ${
              activeTab === 'form'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            onClick={() => {
              if (editingOrder) resetForm();
              setActiveTab('form');
            }}
          >
            <Package className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>{editingOrder ? 'Edit Pesanan' : 'Manual Shipment'}</span>
          </button>

          <button
            type="button"
            id="tab-manual-alteration"
            className={`py-2 sm:py-1.5 px-3 sm:px-3.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 ${
              activeTab === 'alteration_repair'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            onClick={() => {
              setActiveTab('alteration_repair');
            }}
          >
            <Scissors className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 text-rose-500" />
            <span>Alteration &amp; Repair</span>
          </button>

          <button
            type="button"
            id="tab-manual-rekap"
            className={`py-2 sm:py-1.5 px-3 sm:px-3.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 flex items-center gap-1.5 sm:gap-2 cursor-pointer shrink-0 ${
              activeTab === 'rekap'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            onClick={() => {
              setActiveTab('rekap');
              loadOrders();
            }}
          >
            <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>Rekap Pesanan</span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300 tabular-nums">
              {scopedOrders.length}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          {pengirim && (
            <div className="hidden md:flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
              <Store className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="font-semibold text-slate-900 dark:text-white">{pengirim}</span>
              {picStore && <span className="text-slate-400 text-[11px]">· {picStore}</span>}
            </div>
          )}

          {/* Tombol Bantuan Flow untuk Store & Admin (Neutral outline) */}
          <button
            type="button"
            id="btn-store-help-flow"
            onClick={() => setIsStoreHelpOpen(true)}
            className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Pusat Bantuan Flow & FAQ Pesanan Store (Tanya Jawab & Panduan Solusi)"
          >
            <HelpCircle className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span>Bantuan</span>
          </button>

          {/* Tombol Hub Superadmin (Khusus Superadmin/Admin - Neutral outline) */}
          {userIsAdmin && (
            <button
              type="button"
              id="btn-superadmin-hub"
              onClick={() => setIsSuperadminHubOpen(true)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Hub Superadmin: Kelola Pertanyaan Store, Salin Prompt ke AI Developer & Kelola FAQ"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>Hub Admin</span>
              {unansweredTicketsCount > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-rose-600 text-white tabular-nums">
                  {unansweredTicketsCount}
                </span>
              )}
            </button>
          )}
        </div>
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
            onRefreshCatalog={handleSyncCatalog}
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
      {sjAlterModalOrders && sjAlterModalOrders.length > 0 && (
        <SuratJalanAlterReceiptModal
          orders={sjAlterModalOrders}
          order={sjAlterModalOrders[0]}
          onClose={() => setSjAlterModalOrders(null)}
          onShowToast={onShowToast}
        />
      )}
      {waNoticeModalOrder && (
        <SuratJalanAlterReceiptModal
          orders={[waNoticeModalOrder]}
          order={waNoticeModalOrder}
          initialTab="wa"
          onClose={() => setWaNoticeModalOrder(null)}
          onShowToast={onShowToast}
        />
      )}
      {alterActionData && (
        <AlterationActionModal
          order={alterActionData.order}
          actionType={alterActionData.actionType}
          targetItems={alterActionData.targetItems}
          session={session}
          onClose={() => setAlterActionData(null)}
          onSuccess={(updatedOrder?: ManualShipmentOrder) => {
            const wasMarkSentStore = alterActionData?.actionType === 'mark_sent_store';
            const orderToOpen = updatedOrder || alterActionData?.order;
            setAlterActionData(null);
            loadOrders();
            if (wasMarkSentStore && orderToOpen) {
              setSjAlterModalOrders([orderToOpen]);
              onShowToast('🚚 Berhasil atur Kirim ke Gudang! Membuka Surat Jalan Struk Rangkap 2...', 'success');
            }
          }}
          onShowToast={onShowToast}
        />
      )}
      {renderSjDealposModal()}
      {renderSoldOutModal()}
      {renderOrderDetailsModal()}
      {renderJadwalKirimStoreModal()}
      {renderResiModal()}

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

      {/* Modal Slide Presentasi SOP - Khusus Superadmin */}
      {isSopPresentationOpen && (
        <SopPresentationModal
          session={session}
          onClose={() => setIsSopPresentationOpen(false)}
          onShowToast={onShowToast}
        />
      )}

    </div>


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
                  : printPayload.mode === 'ALTER_WORK_ORDER'
                  ? `Siap Cetak SPK Penjahit (${printPayload.orders.length} Pesanan)`
                  : `Siap Cetak Picking List (${printPayload.orders.length} Pesanan)`}
              </div>
              <div className="text-[10px] text-slate-300 truncate">
                Tekan Cetak jika dialog belum muncul di HP
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {/* Toggle Ukuran Kertas SPK Penjahit: 100x150 Thermal vs A4 */}
            {printPayload.mode === 'ALTER_WORK_ORDER' && (
              <div className="flex items-center gap-1 bg-slate-800 p-1 rounded-xl border border-slate-700">
                <button
                  type="button"
                  onClick={() => {
                    setSpkPaperSize('100x150');
                    setPrintPayload(prev => prev ? { ...prev, spkPaperSize: '100x150' } : null);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                    (printPayload.spkPaperSize ?? spkPaperSize) === '100x150'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Format Thermal Sticker 100 x 150 mm"
                >
                  100x150 (Thermal)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSpkPaperSize('A4');
                    setPrintPayload(prev => prev ? { ...prev, spkPaperSize: 'A4' } : null);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors cursor-pointer ${
                    (printPayload.spkPaperSize ?? spkPaperSize) === 'A4'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                  title="Format Kertas HVS A4 Standar"
                >
                  A4 (HVS)
                </button>
              </div>
            )}
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

      {/* Hidden In-Page Print Area dengan Isolasi Total (Anti Bocor Tab / Navigasi) */}
      {printPayload && (
        <>
          <style>{`
            @media print {
              html, body {
                background: #ffffff !important;
                margin: 0 !important;
                padding: 0 !important;
                height: auto !important;
                overflow: visible !important;
              }
              .fixed, [class*="fixed"], .overflow-y-auto, .overflow-hidden, [class*="overflow-"] {
                position: static !important;
                overflow: visible !important;
                max-height: none !important;
                height: auto !important;
                inset: auto !important;
                transform: none !important;
                backdrop-filter: none !important;
                box-shadow: none !important;
                border: none !important;
                background: transparent !important;
              }
              #manual-shipment-print-area,
              #manual-shipment-print-area * {
                visibility: visible !important;
              }
              #manual-shipment-print-area {
                display: block !important;
                position: relative !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                z-index: 999999 !important;
              }
              header, nav, aside, footer, [role="navigation"], .no-print, .print\\:hidden, [class*="print:hidden"], button {
                display: none !important;
                height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
              }
              @page {
                size: ${
                  printPayload.mode === 'LABEL' ||
                  (printPayload.mode === 'ALTER_WORK_ORDER' && (printPayload.spkPaperSize ?? spkPaperSize) === '100x150')
                    ? '100mm 150mm'
                    : 'A4 portrait'
                };
                margin: ${
                  printPayload.mode === 'LABEL' ||
                  (printPayload.mode === 'ALTER_WORK_ORDER' && (printPayload.spkPaperSize ?? spkPaperSize) === '100x150')
                    ? '0mm'
                    : '4mm 6mm'
                };
              }
            }
          `}</style>
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
                  className="page-break w-full h-[148mm] max-h-[148mm] box-border bg-white relative flex flex-col justify-between overflow-hidden"
                  style={{
                    pageBreakAfter: orderIdx < printPayload.orders.length - 1 ? 'always' : 'auto',
                    breakAfter: orderIdx < printPayload.orders.length - 1 ? 'page' : 'auto',
                    pageBreakInside: 'avoid',
                    breakInside: 'avoid',
                  }}
                >
                  <div className="w-full h-full border-[2px] border-black flex flex-col bg-white box-border text-black overflow-hidden">
                    {/* TOP FIXED AREA */}
                    <div className="flex flex-col shrink-0">
                       {/* 1. Header Label */}
                       <div className="border-b-[2px] border-black px-3 py-2 bg-gray-50 flex justify-between items-center break-inside-avoid">
                         <div className="text-xl font-black tracking-widest uppercase leading-none text-black flex items-center">
                           <img src="/logo.svg" alt="CHOCOCHIPS" referrerPolicy="no-referrer" className="h-7 object-contain block" onError={(e) => e.currentTarget.style.display = 'none'} />
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
                              {(() => {
                                const p = order.pic_store || order.alteration_repair_data?.pic_pemohon || order.submitted_by;
                                return p ? (
                                  <div className="px-2 border-l border-gray-300">
                                    <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">PIC:</div>
                                    <div className="text-[11px] font-bold text-gray-800 leading-tight">{p}</div>
                                  </div>
                                ) : null;
                              })()}
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
                              ID: {order.no_pesanan || order.no_transaksi_customer || ''}
                            </div>
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
                                const lookup = lookupProductBySku(it.sku, productCatalog, it.nama_produk, it.size);
                                const cleanName = (lookup && lookup.found) ? lookup.nama_produk : (it.nama_produk || it.sku);
                                const size = (lookup && lookup.found)
                                  ? (lookup.size ? lookup.size : '-')
                                  : (!isCorruptedColorCodeSize(it.sku, it.size) && it.size && it.size !== '-' && it.size.toLowerCase() !== 'default' ? it.size : '-');
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
              const isAr = hasRealAlterItems(order);
              const arData = order.alteration_repair_data;
              const alterItems = isAr ? (order.items || []) : (order.items || []).filter(isRealAlterItem);
              const qrDataUrl = printPayload.qrMap[order.no_pesanan || ''] || '';
              const todayStr = new Date().toLocaleDateString('id-ID', {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              });

              const isThermal = (printPayload.spkPaperSize ?? spkPaperSize) === '100x150';

              if (isThermal) {
                return (
                  <div
                    key={order.no_pesanan || oIdx}
                    className="page-break w-[100mm] h-[148mm] max-h-[148mm] box-border bg-white text-black p-2.5 flex flex-col justify-between overflow-hidden relative border-[2px] border-black"
                    style={{
                      pageBreakAfter: oIdx < printPayload.orders.length - 1 ? 'always' : 'auto',
                      breakAfter: oIdx < printPayload.orders.length - 1 ? 'page' : 'auto',
                      pageBreakInside: 'avoid',
                      breakInside: 'avoid',
                    }}
                  >
                    {/* TOP SECTION: KOP, ORDER ID & QR */}
                    <div className="flex flex-col shrink-0">
                      <div className="flex justify-between items-center border-b-[2px] border-black pb-1 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-black tracking-wider uppercase text-black">CHOCOCHIPS</span>
                          <span className="text-[9px] font-black uppercase bg-black text-white px-1.5 py-0.5 rounded-xs">
                            SPK PENJAHIT
                          </span>
                        </div>
                        <div className="text-[8px] font-bold text-gray-700 font-mono">
                          100x150 THERMAL
                        </div>
                      </div>

                      {/* No. Pesanan / Tiket & QR Code */}
                      <div className="flex justify-between items-center bg-gray-50 border border-black p-1.5 rounded-xs mb-1.5">
                        <div className="min-w-0 flex-1">
                          <div className="text-[8px] font-bold text-gray-600 uppercase">NO. PESANAN / TIKET</div>
                          <div className="text-base font-black font-mono tracking-tight text-black truncate">
                            {order.no_pesanan}
                          </div>
                          <div className="text-[8.5px] text-gray-800 mt-0.5 font-medium truncate">
                            Store: <b>{order.nama_pengirim}</b> {order.pic_store ? `(PIC: ${order.pic_store})` : ''}
                          </div>
                          <div className="text-[7.5px] text-gray-600 font-mono">
                            Tgl Cetak: {todayStr}
                          </div>
                        </div>
                        {qrDataUrl && (
                          <img
                            src={qrDataUrl}
                            alt="QR"
                            className="w-13 h-13 object-contain shrink-0 ml-1 border border-black/40"
                          />
                        )}
                      </div>

                      {/* Customer & Destination Info */}
                      <div className="border border-black p-1.5 rounded-xs text-[8.5px] mb-1.5 bg-white space-y-0.5">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Customer:</span>
                          <span className="font-black text-black truncate max-w-[180px]">{order.nama_tujuan || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">No. HP:</span>
                          <span className="font-bold font-mono text-black">{order.no_telp_tujuan || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Kirim / Tujuan:</span>
                          <span className="font-bold text-black">{order.jasa_kirim || '-'}</span>
                        </div>
                        {order.notes_paket && (
                          <div className="pt-0.5 border-t border-dashed border-gray-300 text-[8px] text-gray-800 truncate">
                            <b>Catatan:</b> {order.notes_paket}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* MIDDLE SECTION: INSTRUKSI ALTERASI PENJAHIT */}
                    <div className="flex-1 overflow-hidden flex flex-col justify-start my-0.5">
                      <div className="text-[8.5px] font-black uppercase tracking-wider bg-black text-white px-1.5 py-0.5 mb-1 flex justify-between items-center">
                        <span>✂️ INSTRUKSI PENJAHIT</span>
                        <span className="text-[7.5px] font-normal">{alterItems.length} Produk</span>
                      </div>

                      <div className="space-y-1 overflow-hidden">
                        {alterItems.slice(0, 3).map((item, itIdx) => {
                          const alterId = item.id_form_alter || (isAr ? order.no_pesanan : 'ALT-AUTO');
                          const instruction = item.alteration_detail || (isAr ? (arData?.alteration_detail || order.alteration_detail) : '-') || '-';

                          return (
                            <div key={itIdx} className="border border-black p-1 rounded-xs bg-white text-[8.5px]">
                              <div className="flex justify-between items-start gap-1">
                                <div className="font-black text-[9px] text-black truncate flex-1">
                                  {item.nama_produk}
                                </div>
                                <div className="font-mono font-black text-[8px] bg-gray-100 px-1 border border-black/40 shrink-0">
                                  {alterId}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 text-[8px] text-gray-700 mt-0.5 font-medium">
                                <span>SKU: <b>{item.sku || '-'}</b></span>
                                <span>Size: <b>{item.size || '-'}</b></span>
                                <span>Qty: <b>{item.qty || 1} Pcs</b></span>
                              </div>
                              <div className="mt-0.5 p-1 bg-gray-50 border border-black font-black text-[8.5px] leading-tight text-black">
                                👉 {instruction}
                              </div>
                            </div>
                          );
                        })}
                        {alterItems.length > 3 && (
                          <div className="text-[7.5px] italic text-center font-bold text-gray-600">
                            + {alterItems.length - 3} produk lainnya
                          </div>
                        )}
                      </div>
                    </div>

                    {/* BOTTOM SECTION: TANDA TANGAN / QC */}
                    <div className="shrink-0 border-t-[2px] border-black pt-1">
                      <div className="grid grid-cols-3 gap-1 text-center text-[7.5px]">
                        <div className="border border-black p-0.5 rounded-xs">
                          <div className="font-bold text-gray-800">1. PENJAHIT</div>
                          <div className="h-4"></div>
                          <div className="border-t border-dotted border-gray-400 font-mono text-[7px] pt-0.5">
                            Tgl: ___/___
                          </div>
                        </div>
                        <div className="border border-black p-0.5 rounded-xs">
                          <div className="font-bold text-gray-800">2. SELESAI</div>
                          <div className="h-4"></div>
                          <div className="border-t border-dotted border-gray-400 font-mono text-[7px] pt-0.5">
                            Paraf: ( &nbsp; )
                          </div>
                        </div>
                        <div className="border border-black p-0.5 rounded-xs">
                          <div className="font-bold text-gray-800">3. QC FITTING</div>
                          <div className="h-4"></div>
                          <div className="border-t border-dotted border-gray-400 font-mono text-[7px] pt-0.5">
                            Pass [ &nbsp; ]
                          </div>
                        </div>
                      </div>
                      <div className="text-[7px] text-center text-gray-600 mt-0.5 font-mono">
                        WMS Chocochips • Tempelkan label ini pada fisik pakaian
                      </div>
                    </div>
                  </div>
                );
              }

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
                        Order ID: <strong>{order.no_pesanan || order.no_transaksi_customer}</strong>
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
            // Massal Multi-Order Picking List Mode (Shopee Tabular Style)
            (() => {
              const todayStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
              const totalOrders = printPayload.orders.length;
              const totalAllQty = printPayload.orders.reduce((acc, o) => {
                const items = ensureOrderItems(o);
                return acc + items.reduce((q, it) => q + (Number(it.qty) || 0), 0);
              }, 0);
              const operatorName = session?.name || getUserPersonName(session?.username) || 'Petugas Gudang';

              return (
                <div className="bg-white w-full text-black p-2 max-w-[850px] mx-auto text-[9.5px]">
                  {/* Print Header */}
                  <div className="border-b-2 border-black pb-2 mb-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h1 className="text-base font-black tracking-tight uppercase">
                          SURAT JALAN & PICKING LIST MANUAL SHIPMENT
                        </h1>
                        <div className="text-[10px] text-gray-700 mt-0.5">
                          WMS Warehouse Management System • Format A4 Portrait
                        </div>
                      </div>
                      <div className="text-right text-[10px] font-mono">
                        <div><b>Tgl Cetak:</b> {todayStr}</div>
                        <div><b>Filter:</b> Manual Shipment</div>
                      </div>
                    </div>
                  </div>

                  {/* Summary Info */}
                  <div className="flex justify-between items-center text-[10px] mb-3 bg-gray-100 p-2 border border-gray-300 rounded">
                    <div><b>Total Pesanan:</b> {totalOrders} Pesanan</div>
                    <div><b>Total Barang:</b> {totalAllQty} Pcs</div>
                    <div><b>Petugas Picking:</b> {operatorName}</div>
                    <div><b>Petugas QC / Packing:</b> ____________________</div>
                  </div>

                  {/* Orders Table */}
                  <table className="w-full border-collapse text-[9.5px]">
                    <thead>
                      <tr className="bg-gray-200">
                        <th className="border border-black p-1 text-center font-black w-[4%]">No</th>
                        <th className="border border-black p-1 text-center font-black w-[15%]">No. Pesanan & Resi</th>
                        <th className="border border-black p-1 text-center font-black w-[12%]">Opsi Pengiriman</th>
                        <th className="border border-black p-1 text-center font-black w-[15%]">Nama Penerima & HP</th>
                        <th className="border border-black p-1 text-center font-black w-[10%]">Lokasi Rak</th>
                        <th className="border border-black p-1 text-left font-black w-[25%]">SKU & Nama Barang</th>
                        <th className="border border-black p-1 text-center font-black w-[5%]">Qty</th>
                        <th className="border border-black p-1 text-center font-black w-[4%]">Pick</th>
                        <th className="border border-black p-1 text-left font-black w-[10%]">Catatan</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printPayload.orders.map((order, orderIdx) => {
                        const items = ensureOrderItems(order);
                        const rowCount = items.length || 1;
                        
                        return items.map((item, itemIdx) => (
                          <tr key={`${order.no_pesanan}-${itemIdx}`}>
                            {/* Order-level merged columns */}
                            {itemIdx === 0 && (
                              <>
                                <td rowSpan={rowCount} className="border border-black p-1 text-center align-middle font-bold">
                                  {orderIdx + 1}
                                </td>
                                <td rowSpan={rowCount} className="border border-black p-1 text-center align-middle font-mono">
                                  <div className="font-black text-[10px]">{order.no_pesanan}</div>
                                  {order.no_resi && <div className="text-[8.5px] text-gray-700 mt-0.5">{order.no_resi}</div>}
                                </td>
                                <td rowSpan={rowCount} className="border border-black p-1 text-center align-middle font-bold text-[9px]">
                                  {order.jasa_kirim || '-'}
                                  {order.no_transaksi_pengirim && order.no_transaksi_pengirim.length > 0 && (
                                    <div className="text-[8px] text-gray-600 mt-0.5">
                                      DealPOS: {order.no_transaksi_pengirim.join(', ')}
                                    </div>
                                  )}
                                </td>
                                <td rowSpan={rowCount} className="border border-black p-1 align-middle">
                                  <div className="font-bold">{order.nama_tujuan}</div>
                                  {order.no_telp_tujuan && <div className="font-mono text-[8.5px] text-gray-700">{order.no_telp_tujuan}</div>}
                                </td>
                              </>
                            )}

                            {/* Item-level Lokasi Rak */}
                            <td className="border border-black p-1 text-center align-middle font-black text-[10px] bg-gray-50">
                              {(() => {
                                const ful = (item.fulfillment || (item as any).toko_asal || (item as any).store_name || '').trim();
                                const fulLower = ful.toLowerCase();
                                const isStoreFulfillment = ful && 
                                  !fulLower.includes('marketplace') && 
                                  !fulLower.includes('gudang') && 
                                  !fulLower.includes('warehouse');

                                if (isStoreFulfillment) {
                                  const code = getStoreCode(ful) || ful;
                                  return (
                                    <span className="text-blue-900 font-black uppercase text-[10px]">
                                      {code}
                                    </span>
                                  );
                                }
                                return item.lokasi || '-';
                              })()}
                            </td>

                            {/* Item SKU & Nama */}
                            <td className="border border-black p-1 align-middle">
                              <div className="font-black text-[9.5px]">{item.sku}</div>
                              <div className="text-gray-800 text-[8.5px]">{item.nama_produk}</div>
                              {item.size && (
                                <div className="text-gray-600 italic text-[8px]">Var: {item.size}</div>
                              )}
                              {(() => {
                                const ful = (item.fulfillment || '').trim();
                                const isStore = ful && !ful.toLowerCase().includes('marketplace') && !ful.toLowerCase().includes('gudang') && !ful.toLowerCase().includes('warehouse');
                                if (isStore) {
                                  return (
                                    <div className="text-blue-700 font-bold text-[8px] mt-0.5">
                                      Fulfill: {ful}
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                              {(item.needs_alteration || !!item.id_form_alter) && (
                                <div className="text-rose-600 font-bold text-[8px] mt-0.5">Wajib Alterasi!</div>
                              )}
                            </td>

                            {/* Qty */}
                            <td className="border border-black p-1 text-center align-middle font-black text-[11px]">
                              {item.qty}
                            </td>

                            {/* Checkbox */}
                            <td className="border border-black p-1 align-middle text-center">
                              <div className="w-3.5 h-3.5 border border-black mx-auto"></div>
                            </td>

                            {/* Catatan / Keterangan */}
                            <td className="border border-black p-1 text-[8px] align-middle">
                              {itemIdx === 0 && order.notes_paket ? order.notes_paket : ''}
                            </td>
                          </tr>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()
          )}
        </div>
        </>
      )}


      {/* Modal Update Resi Massal */}
      <BulkUpdateResiModal
        isOpen={isBulkResiModalOpen}
        onClose={() => setIsBulkResiModalOpen(false)}
        orders={orders}
        onSuccess={(_, updatedEntries) => {
          if (updatedEntries && updatedEntries.length > 0) {
            const actorName = session?.name || getUserPersonName(session?.username) || session?.username || 'Admin Gudang';
            void notifyBulkResiUpdatedToChat(updatedEntries, actorName);
          }
          loadOrders();
        }}
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

      {/* Modal Pusat Bantuan Store (FAQ & Tanya Jawab Alur) */}
      <StoreHelpModal
        isOpen={isStoreHelpOpen}
        onClose={() => setIsStoreHelpOpen(false)}
        session={session}
        onShowToast={onShowToast}
      />

      {/* Modal Hub Superadmin (Eskalasi, Salin Prompt Developer, FAQ Sync) */}
      {userIsAdmin && (
        <SuperadminKnowledgeHubModal
          isOpen={isSuperadminHubOpen}
          onClose={() => setIsSuperadminHubOpen(false)}
          session={session}
          onShowToast={onShowToast}
          onTicketsUpdated={refreshUnansweredCount}
        />
      )}

      {/* Unified Order Action Sheet (Native Bottom Sheet on Mobile, Clean Modal on Desktop) */}
      {(() => {
        if (!actionSheetOrder) return null;
        const badgeInfo = getOrderStatusBadgeInfo(actionSheetOrder);
        const mktItems = (actionSheetOrder.items || []).filter((it) => {
          const ful = (it.fulfillment || '').toLowerCase().trim();
          return (
            ful.includes('marketplace') ||
            ful.includes('gudang') ||
            ful.includes('warehouse') ||
            actionSheetOrder.no_pesanan?.startsWith('AR-') ||
            !ful
          );
        });
        const existingSj = mktItems.map((it) => getValidItemSjDealpos(actionSheetOrder, it)).find(Boolean) || '';
        return (
          <OrderActionSheet
            order={actionSheetOrder}
            onClose={() => setActionSheetOrder(null)}
            userIsAdmin={userIsAdmin}
            isStoreUser={isStoreUser}
            isSendingPickingWa={isSendingPickingWa}
            statusLabel={badgeInfo.label}
            statusBadgeClass={badgeInfo.badgeClass}
            hasAlterItems={hasRealAlterItems(actionSheetOrder)}
            eligibleSjStruk={isEligibleForSjStruk(actionSheetOrder)}
            sentToWarehouse={isOrderSentToWarehouse(actionSheetOrder)}
            eligibleKirimKeGudang={isOrderEligibleKirimKeGudang(actionSheetOrder)}
            kirimKeStore={isKirimKeStore(actionSheetOrder)}
            hasMarketplaceItems={mktItems.length > 0}
            orderIsSelesai={isOrderSelesai(actionSheetOrder)}
            existingSjDealpos={existingSj}
            isStoreFulfilledItem={isStoreFulfilledItem}
            isStoreItemReceived={isStoreItemReceived}
            onViewDetail={(o) => setSelectedOrderDetails(o)}
            onPrintLabel={(o) => {
              setSelectedOrderDetails(null);
              handlePrintLabel(o);
            }}
            onPrintPicking={(o) => {
              setSelectedOrderDetails(null);
              handlePrintPickingList(o);
            }}
            onSendPickingWaGroup={(o) => handleSendPickingWaGroup(o)}
            onPrintSjStruk={(o) => {
              setSelectedOrderDetails(null);
              setSjAlterModalOrders([o]);
            }}
            onPrintAlterSpkPenjahit={(o) => {
              setSelectedOrderDetails(null);
              handlePrintAlterWorkOrder(o);
            }}
            onPrintAlterSpkGudang={(o) => {
              setSelectedOrderDetails(null);
              setArReceiptOrder(o);
            }}
            onKirimKeGudang={(o) => {
              setSelectedOrderDetails(null);
              const storeItems = (o.items || []).filter(
                (it) =>
                  it.fulfillment &&
                  !it.fulfillment.toLowerCase().includes('marketplace') &&
                  !it.fulfillment.toLowerCase().includes('gudang')
              );
              const myStoreItems = userAssignedStore
                ? storeItems.filter((it) => isSameStore(it.fulfillment, userAssignedStore))
                : storeItems;
              setAlterActionData({
                order: o,
                targetItems: myStoreItems.length > 0 ? myStoreItems : o.items || [],
                actionType: 'mark_sent_store',
              });
            }}
            onInputSjDealpos={(o) => {
              if (!userIsAdmin) {
                onShowToast('Akses ditolak: Hanya Admin Gudang yang berhak menginput SJ DealPOS.', 'error');
                return;
              }
              setSjModalData({
                order: o,
                noSj: (o.items || []).map((it) => getValidItemSjDealpos(o, it)).find(Boolean) || '',
                applyToAllMarketplace: true,
              });
            }}
            onAturJadwalStore={(o) => {
              if (!userIsAdmin) {
                onShowToast('Akses ditolak: Hanya Admin yang dapat mengatur jadwal kirim ke store.', 'error');
                return;
              }
              handleOpenJadwalModal(o);
            }}
            onUpdateResi={(o) => {
              if (!userIsAdmin) {
                onShowToast('Akses ditolak: Hanya Admin yang dapat memperbarui nomor resi.', 'error');
                return;
              }
              handleUpdateResi(o.no_pesanan!);
            }}
            onMarkDiproses={(o) => {
              if (!userIsAdmin) {
                onShowToast('Akses ditolak: Hanya Admin Gudang yang berhak memproses pesanan.', 'error');
                return;
              }
              updateShipmentStatus(o.no_pesanan!, 'diproses').then((ok) => {
                if (ok) {
                  onShowToast('Status pesanan diubah ke Sedang Diproses', 'success');
                  loadOrders();
                }
              });
            }}
            onWaCustomer={(o) => setWaModalOrder(o)}
            onChatWarehouse={(o) => handleChatWarehouse(o)}
            onNotifLiveChatStore={(o) => handleSendWaStoreNoticeDirect(o)}
            onSendAlterSpkChat={(o) => handleSendAlterWaFonnte(o)}
            onCopyFullSummary={(o) =>
              copyToClipboard(
                formatOrderFullSummary(o),
                'Rincian lengkap pesanan (format WA) berhasil disalin!'
              )
            }
            onEditOrder={(o) => {
              if (!userIsAdmin) {
                onShowToast('Akses ditolak: Hanya Admin Gudang / Superadmin yang memiliki izin mengedit pesanan.', 'error');
                return;
              }
              setSelectedOrderDetails(null);
              handleEdit(o);
              setActiveTab('form');
            }}
            onCancelOrder={(o) => {
              if (!userIsAdmin) {
                onShowToast('Akses ditolak: Pembatalan pesanan hanya dapat dilakukan oleh Admin Gudang / Superadmin.', 'error');
                return;
              }
              setSelectedOrderDetails(null);
              setCancelModalOrder(o);
            }}
            onDeleteOrder={(o) => {
              if (!userIsAdmin) {
                onShowToast('Akses ditolak: Hanya Admin yang dapat menghapus pesanan.', 'error');
                return;
              }
              setSelectedOrderDetails(null);
              handleDelete(o.no_pesanan!);
            }}
            onRequestCancelHelp={() => {
              setSelectedOrderDetails(null);
              setIsStoreHelpOpen(true);
            }}
            onCopyText={(text, label) => copyToClipboard(text, label)}
            onToggleStoreItemReceived={(o, it, idx, received) =>
              handleMarkStoreItemReceived(o, it, idx, received)
            }
            onMarkItemSold={(o, it) => {
              const isMulti = (o.items || []).length > 1;
              setSoldModalData({
                order: o,
                item: it,
                resolution: isMulti ? 'partial_fulfill' : 'cancel_order',
                note: 'Stok kosong di alokasi DealPOS Marketplace.',
                sendWaToStore: true,
              });
            }}
            onRestoreSoldItem={(o, it) => handleRestoreSoldItem(o, it)}
          />
        );
      })()}
    </>
  );
};
