import React, { useEffect } from 'react';
import {
  X,
  Eye,
  Printer,
  FileText,
  Send,
  Truck,
  Calendar,
  MessageCircle,
  MessageSquare,
  Scissors,
  Edit3,
  Ban,
  Trash2,
  HelpCircle,
  Play,
  FileCheck,
  CheckCircle2,
  PackageCheck,
  AlertOctagon,
  RotateCcw,
  Copy,
  ChevronRight,
} from 'lucide-react';
import { ManualShipmentOrder, ManualShipmentItem } from '../../types';

export interface OrderActionSheetProps {
  order: ManualShipmentOrder | null;
  onClose: () => void;
  userIsAdmin: boolean;
  isStoreUser: boolean;
  isSendingPickingWa: boolean;
  statusLabel: string;
  statusBadgeClass: string;
  hasAlterItems: boolean;
  eligibleSjStruk: boolean;
  sentToWarehouse: boolean;
  eligibleKirimKeGudang: boolean;
  kirimKeStore: boolean;
  hasMarketplaceItems: boolean;
  orderIsSelesai: boolean;
  existingSjDealpos: string;
  // Item helpers
  isStoreFulfilledItem: (order: ManualShipmentOrder, item: ManualShipmentItem) => boolean;
  isStoreItemReceived: (order: ManualShipmentOrder, item: ManualShipmentItem) => boolean;
  // Action callbacks
  onViewDetail: (order: ManualShipmentOrder) => void;
  onPrintLabel: (order: ManualShipmentOrder) => void;
  onPrintPicking: (order: ManualShipmentOrder) => void;
  onSendPickingWaGroup: (order: ManualShipmentOrder) => void;
  onPrintSjStruk: (order: ManualShipmentOrder) => void;
  onPrintAlterSpkPenjahit: (order: ManualShipmentOrder) => void;
  onPrintAlterSpkGudang: (order: ManualShipmentOrder) => void;
  onKirimKeGudang: (order: ManualShipmentOrder) => void;
  onInputSjDealpos: (order: ManualShipmentOrder) => void;
  onAturJadwalStore: (order: ManualShipmentOrder) => void;
  onUpdateResi: (order: ManualShipmentOrder) => void;
  onMarkDiproses: (order: ManualShipmentOrder) => void;
  onWaCustomer: (order: ManualShipmentOrder) => void;
  onChatWarehouse: (order: ManualShipmentOrder) => void;
  onNotifLiveChatStore: (order: ManualShipmentOrder) => void;
  onSendAlterSpkChat: (order: ManualShipmentOrder) => void;
  onCopyFullSummary?: (order: ManualShipmentOrder) => void;
  onEditOrder: (order: ManualShipmentOrder) => void;
  onCancelOrder: (order: ManualShipmentOrder) => void;
  onDeleteOrder: (order: ManualShipmentOrder) => void;
  onRequestCancelHelp: () => void;
  onCopyText: (text: string, label: string) => void;
  onToggleStoreItemReceived: (order: ManualShipmentOrder, item: ManualShipmentItem, idx: number, received: boolean) => void;
  onMarkItemSold: (order: ManualShipmentOrder, item: ManualShipmentItem) => void;
  onRestoreSoldItem: (order: ManualShipmentOrder, item: ManualShipmentItem) => void;
}

interface ActionRowItem {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  badge?: string;
  badgeTone?: 'emerald' | 'amber' | 'indigo' | 'rose';
  tone?: 'default' | 'primary' | 'danger';
  disabled?: boolean;
  onClick: () => void;
}

interface ActionGroup {
  title: string;
  items: ActionRowItem[];
}

export const OrderActionSheet: React.FC<OrderActionSheetProps> = ({
  order,
  onClose,
  userIsAdmin,
  isStoreUser,
  isSendingPickingWa,
  statusLabel,
  statusBadgeClass,
  hasAlterItems,
  eligibleSjStruk,
  sentToWarehouse,
  eligibleKirimKeGudang,
  kirimKeStore,
  hasMarketplaceItems,
  orderIsSelesai,
  existingSjDealpos,
  isStoreFulfilledItem,
  isStoreItemReceived,
  onViewDetail,
  onPrintLabel,
  onPrintPicking,
  onSendPickingWaGroup,
  onPrintSjStruk,
  onPrintAlterSpkPenjahit,
  onPrintAlterSpkGudang,
  onKirimKeGudang,
  onInputSjDealpos,
  onAturJadwalStore,
  onUpdateResi,
  onMarkDiproses,
  onWaCustomer,
  onChatWarehouse,
  onNotifLiveChatStore,
  onSendAlterSpkChat,
  onCopyFullSummary,
  onEditOrder,
  onCancelOrder,
  onDeleteOrder,
  onRequestCancelHelp,
  onCopyText,
  onToggleStoreItemReceived,
  onMarkItemSold,
  onRestoreSoldItem,
}) => {
  useEffect(() => {
    if (!order) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [order, onClose]);

  if (!order) return null;

  const runAndClose = (fn: () => void) => {
    onClose();
    fn();
  };

  // Build logical, self-explanatory action groups strictly respecting roles
  const docItems: ActionRowItem[] = [];
  if (!isStoreUser) {
    docItems.push({
      id: 'print_picking',
      label: 'Cetak Picking List (A4)',
      description: order.is_picking_printed
        ? 'Sudah dicetak · Klik untuk cetak ulang lembar ambil barang'
        : 'Tahap 1/2 · Cetak daftar ambil barang beserta lokasi rak',
      icon: <FileText className="w-4 h-4" />,
      badge: order.is_picking_printed ? 'Sudah Cetak' : 'Belum Cetak',
      badgeTone: order.is_picking_printed ? 'emerald' : 'amber',
      onClick: () => runAndClose(() => onPrintPicking(order)),
    });
    docItems.push({
      id: 'print_label',
      label: 'Cetak Label Paket (A6)',
      description: order.is_label_printed
        ? 'Sudah dicetak · Klik untuk cetak ulang label pengiriman'
        : 'Tahap 2/2 · Cetak label alamat & barcode thermal A6',
      icon: <Printer className="w-4 h-4" />,
      badge: order.is_label_printed ? 'Sudah Cetak' : 'Belum Cetak',
      badgeTone: order.is_label_printed ? 'emerald' : 'amber',
      onClick: () => runAndClose(() => onPrintLabel(order)),
    });
    if (userIsAdmin) {
      docItems.push({
        id: 'wa_picking_group',
        label: 'Kirim Picking ke WA Grup',
        description: 'Broadcast daftar ambil barang Marketplace ke grup WA gudang',
        icon: <Send className="w-4 h-4" />,
        disabled: isSendingPickingWa,
        onClick: () => runAndClose(() => onSendPickingWaGroup(order)),
      });
    }
  }
  if (eligibleSjStruk || isStoreUser) {
    docItems.push({
      id: 'sj_struk',
      label: 'Cetak SJ Struk Rangkap 2',
      description: 'Surat Jalan pengiriman format struk kasir (58mm / 80mm)',
      icon: <Printer className="w-4 h-4" />,
      onClick: () => runAndClose(() => onPrintSjStruk(order)),
    });
  }
  if (hasAlterItems) {
    docItems.push({
      id: 'spk_penjahit',
      label: 'Cetak SPK Penjahit',
      description: 'Surat Perintah Kerja & detail ukuran alterasi untuk penjahit',
      icon: <Scissors className="w-4 h-4" />,
      onClick: () => runAndClose(() => onPrintAlterSpkPenjahit(order)),
    });
    docItems.push({
      id: 'spk_gudang',
      label: 'Cetak Struk SPK Gudang',
      description: 'Tanda terima & label alterasi untuk lampiran fisik barang',
      icon: <FileText className="w-4 h-4" />,
      onClick: () => runAndClose(() => onPrintAlterSpkGudang(order)),
    });
  }

  const workflowItems: ActionRowItem[] = [];
  if (eligibleKirimKeGudang && !sentToWarehouse) {
    workflowItems.push({
      id: 'kirim_wh',
      label: 'Tandai Kirim ke Gudang',
      description: 'Konfirmasi barang dari store dikirim ke Gudang + cetak SJ',
      icon: <Truck className="w-4 h-4" />,
      tone: 'primary',
      onClick: () => runAndClose(() => onKirimKeGudang(order)),
    });
  }
  if (userIsAdmin && hasMarketplaceItems) {
    workflowItems.push({
      id: 'sj_dealpos',
      label: existingSjDealpos ? 'Edit No. SJ DealPOS' : 'Input No. SJ DealPOS',
      description: existingSjDealpos
        ? `Tersimpan: ${existingSjDealpos}`
        : 'Masukkan nomor Surat Jalan DealPOS untuk item Marketplace',
      icon: <FileCheck className="w-4 h-4" />,
      badge: existingSjDealpos ? 'Ada SJ' : 'Butuh SJ',
      badgeTone: existingSjDealpos ? 'emerald' : 'amber',
      onClick: () => runAndClose(() => onInputSjDealpos(order)),
    });
  }
  if (userIsAdmin && kirimKeStore) {
    workflowItems.push({
      id: 'jadwal_store',
      label: order.tgl_jadwal_kirim_store ? 'Ubah Jadwal Kirim Store' : 'Atur Jadwal Kirim Store',
      description: order.tgl_jadwal_kirim_store
        ? `Terjadwal: ${new Date(order.tgl_jadwal_kirim_store).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`
        : 'Tentukan tanggal pengiriman barang kembali ke toko',
      icon: <Calendar className="w-4 h-4" />,
      onClick: () => runAndClose(() => onAturJadwalStore(order)),
    });
  }
  if (userIsAdmin) {
    workflowItems.push({
      id: 'resi',
      label: order.no_resi ? 'Ubah Nomor Resi' : 'Input Nomor Resi',
      description: order.no_resi
        ? `Resi saat ini: ${order.no_resi}`
        : 'Masukkan nomor resi ekspedisi untuk menyelesaikan pesanan',
      icon: <Truck className="w-4 h-4" />,
      onClick: () => runAndClose(() => onUpdateResi(order)),
    });
  }
  if (
    userIsAdmin &&
    order.status !== 'diproses' &&
    order.status !== 'dikirim' &&
    order.status !== 'selesai' &&
    order.status !== 'batal'
  ) {
    workflowItems.push({
      id: 'mark_diproses',
      label: 'Ubah Status ke Sedang Diproses',
      description: 'Pindahkan pesanan ke tahap pengerjaan / packing',
      icon: <Play className="w-4 h-4" />,
      onClick: () => runAndClose(() => onMarkDiproses(order)),
    });
  }

  const commItems: ActionRowItem[] = [
    {
      id: 'view_detail',
      label: 'Lihat Detail Lengkap Pesanan',
      description: 'Rincian produk, foto alterasi, alamat & riwayat lengkap',
      icon: <Eye className="w-4 h-4" />,
      onClick: () => runAndClose(() => onViewDetail(order)),
    },
  ];
  if (order.no_resi) {
    commItems.push({
      id: 'wa_customer',
      label: 'Kirim Info Resi ke WA Customer',
      description: 'Buka format pesan WhatsApp otomatis beserta nomor resi',
      icon: <MessageCircle className="w-4 h-4" />,
      onClick: () => runAndClose(() => onWaCustomer(order)),
    });
  }
  commItems.push({
    id: 'chat_warehouse',
    label: 'Chat Gudang / Tanya Pesanan',
    description: 'Buka obrolan Live Chat WMS terkait pesanan ini',
    icon: <MessageSquare className="w-4 h-4" />,
    onClick: () => runAndClose(() => onChatWarehouse(order)),
  });
  commItems.push({
    id: 'notif_store',
    label: 'Kirim Notifikasi ke Store',
    description: 'Kirim pemberitahuan pesanan ke Live Chat / WA Store',
    icon: <MessageCircle className="w-4 h-4" />,
    onClick: () => runAndClose(() => onNotifLiveChatStore(order)),
  });
  if (hasAlterItems) {
    commItems.push({
      id: 'kirim_spk_chat',
      label: 'Kirim SPK Alter ke Live Chat',
      description: 'Bagikan ringkasan SPK alterasi langsung ke Live Chat WMS',
      icon: <Scissors className="w-4 h-4" />,
      onClick: () => runAndClose(() => onSendAlterSpkChat(order)),
    });
  }
  if (onCopyFullSummary) {
    commItems.push({
      id: 'copy_full_summary',
      label: 'Salin Rincian Lengkap (WA)',
      description: 'Salin ringkasan teks lengkap pesanan untuk ditempel ke WhatsApp',
      icon: <Copy className="w-4 h-4" />,
      onClick: () => runAndClose(() => onCopyFullSummary(order)),
    });
  }

  const manageItems: ActionRowItem[] = [];
  if (userIsAdmin) {
    manageItems.push({
      id: 'edit',
      label: 'Edit Data Pesanan',
      description: 'Ubah data customer, kurir, atau daftar item di formulir',
      icon: <Edit3 className="w-4 h-4" />,
      onClick: () => runAndClose(() => onEditOrder(order)),
    });
    if (order.status !== 'batal') {
      manageItems.push({
        id: 'cancel',
        label: 'Batalkan Pesanan',
        description: 'Tandai batal dengan menyimpan alasan & histori pembatalan',
        icon: <Ban className="w-4 h-4" />,
        tone: 'danger',
        onClick: () => runAndClose(() => onCancelOrder(order)),
      });
    }
    manageItems.push({
      id: 'delete',
      label: 'Hapus Permanen',
      description: 'Hapus catatan pesanan ini dari database secara permanen',
      icon: <Trash2 className="w-4 h-4" />,
      tone: 'danger',
      onClick: () => runAndClose(() => onDeleteOrder(order)),
    });
  } else if (order.status !== 'batal') {
    manageItems.push({
      id: 'help_cancel',
      label: 'Ajukan Pembatalan ke Admin',
      description: 'Kirim permintaan pembatalan atau kendala ke Superadmin',
      icon: <HelpCircle className="w-4 h-4" />,
      tone: 'danger',
      onClick: () => runAndClose(() => onRequestCancelHelp()),
    });
  }

  const groups: ActionGroup[] = [
    { title: 'Dokumen & Cetak', items: docItems },
    { title: 'Alur & Pengiriman', items: workflowItems },
    { title: 'Komunikasi & Detail', items: commItems },
    { title: 'Pengelolaan Pesanan', items: manageItems },
  ].filter((g) => g.items.length > 0);

  // Admin quick item-level actions (terima WH / sold out / pulihkan)
  const actionableItems = userIsAdmin && order.status !== 'batal'
    ? (order.items || []).map((it, idx) => ({ it, idx })).filter(({ it }) => {
        if (it.item_status === 'sold_out') return true;
        if (isStoreFulfilledItem(order, it)) return !orderIsSelesai;
        return !orderIsSelesai;
      })
    : [];

  const getBadgeToneClass = (tone?: ActionRowItem['badgeTone']) => {
    switch (tone) {
      case 'emerald':
        return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
      case 'amber':
        return 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
      case 'rose':
        return 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
      default:
        return 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-950/55 backdrop-blur-[2px] p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Menu aksi pesanan ${order.no_pesanan}`}
    >
      <div
        className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[88vh] sm:max-h-[84vh] overflow-hidden animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag Handle (Mobile) */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Sheet Header */}
        <div className="px-4 pt-2 sm:pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-extrabold text-indigo-600 dark:text-indigo-400">
                #{order.no_pesanan}
              </span>
              <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${statusBadgeClass}`}>
                {statusLabel}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate mt-1">
              {order.nama_tujuan || '-'}
              {order.nama_pengirim ? (
                <span className="font-normal text-slate-500 dark:text-slate-400"> · {order.nama_pengirim}</span>
              ) : null}
            </p>
            {(order.no_resi || existingSjDealpos) && (
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {existingSjDealpos && (
                  <button
                    type="button"
                    onClick={() => onCopyText(existingSjDealpos, `No. SJ ${existingSjDealpos} disalin`)}
                    className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
                  >
                    <span>SJ: {existingSjDealpos}</span>
                    <Copy className="w-2.5 h-2.5 text-slate-400" />
                  </button>
                )}
                {order.no_resi && (
                  <button
                    type="button"
                    onClick={() => onCopyText(order.no_resi || '', `No. Resi ${order.no_resi} disalin`)}
                    className="inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 px-2 py-0.5 rounded-md hover:bg-emerald-100 dark:hover:bg-emerald-900/50 cursor-pointer"
                  >
                    <span>Resi: {order.no_resi}</span>
                    <Copy className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            aria-label="Tutup menu aksi"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Action Groups */}
        <div className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {groups.map((group) => (
            <div key={group.title} className="space-y-1">
              <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {group.title}
              </div>
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 divide-y divide-slate-200/70 dark:divide-slate-800 overflow-hidden">
                {group.items.map((item) => {
                  const isDanger = item.tone === 'danger';
                  const isPrimary = item.tone === 'primary';
                  return (
                    <button
                      key={item.id}
                      type="button"
                      disabled={item.disabled}
                      onClick={item.onClick}
                      className={`w-full min-h-[48px] px-3 py-2.5 flex items-center gap-3 text-left transition-colors cursor-pointer disabled:opacity-50 ${
                        isPrimary
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          : isDanger
                          ? 'hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400'
                          : 'hover:bg-white dark:hover:bg-slate-800/80 text-slate-800 dark:text-slate-100'
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                          isPrimary
                            ? 'bg-white/15 text-white'
                            : isDanger
                            ? 'bg-rose-100/80 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400'
                            : 'bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {item.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-[13px] font-bold truncate">
                            {item.label}
                          </span>
                          {item.badge && (
                            <span
                              className={`px-1.5 py-0.5 rounded text-[9.5px] font-bold border shrink-0 ${getBadgeToneClass(
                                item.badgeTone
                              )}`}
                            >
                              {item.badge}
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-[11px] leading-snug line-clamp-1 mt-0.5 ${
                            isPrimary
                              ? 'text-indigo-100'
                              : isDanger
                              ? 'text-rose-500/80 dark:text-rose-400/80'
                              : 'text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          {item.description}
                        </p>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 ${
                          isPrimary ? 'text-white/80' : 'text-slate-300 dark:text-slate-600'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Quick Item-level Fulfillment / Sold Actions (Admin only) */}
          {actionableItems.length > 0 && (
            <div className="space-y-1">
              <div className="px-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Status Per Item (Admin)
              </div>
              <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/30 divide-y divide-slate-200/70 dark:divide-slate-800 overflow-hidden">
                {actionableItems.map(({ it, idx }) => {
                  const isSold = it.item_status === 'sold_out';
                  const isStoreItem = isStoreFulfilledItem(order, it);
                  const isReceived = isStoreItemReceived(order, it);
                  return (
                    <div
                      key={it.id || idx}
                      className="px-3 py-2.5 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                          {it.nama_produk || it.sku}
                        </p>
                        <p className="text-[10.5px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          {it.sku} · x{it.qty} · {it.fulfillment || 'Marketplace'}
                        </p>
                      </div>
                      {isSold ? (
                        <button
                          type="button"
                          onClick={() => runAndClose(() => onRestoreSoldItem(order, it))}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Pulihkan</span>
                        </button>
                      ) : isStoreItem ? (
                        <button
                          type="button"
                          onClick={() =>
                            runAndClose(() => onToggleStoreItemReceived(order, it, idx, !isReceived))
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 shrink-0 cursor-pointer ${
                            isReceived
                              ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800'
                              : 'text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-800 border-indigo-200 dark:border-indigo-700'
                          }`}
                        >
                          {isReceived ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Sudah Terima</span>
                            </>
                          ) : (
                            <>
                              <PackageCheck className="w-3 h-3" />
                              <span>Tandai Terima</span>
                            </>
                          )}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => runAndClose(() => onMarkItemSold(order, it))}
                          className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <AlertOctagon className="w-3 h-3" />
                          <span>Tandai Sold</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
