import React, { useEffect } from 'react';
import {
  ArrowLeft,
  Ban,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Eye,
  FileCheck,
  FileText,
  History,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Package,
  PackageCheck,
  Printer,
  Scissors,
  Store,
  Truck,
  X,
} from 'lucide-react';
import { ManualShipmentItem, ManualShipmentOrder, ProductItem } from '../../types';
import { OutletItem, getValidPersonPicName } from '../../services/gasManualShipment';
import { lookupProductBySku } from '../../utils/productLookup';
import { isCorruptedColorCodeSize } from '../../utils/sortUtils';
import { formatOperatorWithPersonName } from '../../utils/userResolver';

export interface OrderDetailModalProps {
  order: ManualShipmentOrder | null;
  onClose: () => void;
  userIsAdmin: boolean;
  isStoreUser: boolean;
  userAssignedStore: string;
  productCatalog: ProductItem[];
  outlets: OutletItem[];
  copiedSj: string | null;
  copiedResi: string | null;
  statusLabel: string;
  statusBadgeClass: string;
  isIncomingFulfillment: boolean;
  isKirimKeStore: boolean;
  isSentToWarehouse: boolean;
  isEligibleKirimKeGudang: boolean;
  isEligibleSjStruk: boolean;
  isOrderSelesai: boolean;
  isStoreFulfilledItem: (order: ManualShipmentOrder, item: ManualShipmentItem) => boolean;
  isStoreItemReceived: (order: ManualShipmentOrder, item: ManualShipmentItem) => boolean;
  getValidItemSjDealpos: (order: ManualShipmentOrder, item: any) => string;
  generateCustomerWaTemplate: (order: ManualShipmentOrder) => string;
  getCleanCustomerPhone: (phone?: string) => string;
  // Actions
  onOpenActionSheet: (order: ManualShipmentOrder) => void;
  onCopySj: (sj: string) => void;
  onCopyResi: (orderNo: string, resi: string) => void;
  onCopyWaTemplate: (text: string) => void;
  onCopyFullSummary: (order: ManualShipmentOrder) => void;
  onOpenWaModal: (order: ManualShipmentOrder) => void;
  onOpenJadwal: (order: ManualShipmentOrder) => void;
  onUpdateResi: (order: ManualShipmentOrder) => void;
  onKirimKeGudang: (order: ManualShipmentOrder) => void;
  onPrintPicking: (order: ManualShipmentOrder) => void;
  onPrintLabel: (order: ManualShipmentOrder) => void;
  onPrintSjStruk: (order: ManualShipmentOrder) => void;
  onToggleStoreItemReceived: (order: ManualShipmentOrder, item: ManualShipmentItem, idx: number, received: boolean) => void;
  onPreviewPhoto: (url: string) => void;
}

export const OrderDetailModal: React.FC<OrderDetailModalProps> = ({
  order,
  onClose,
  userIsAdmin,
  isStoreUser,
  userAssignedStore,
  productCatalog,
  outlets,
  copiedSj,
  copiedResi,
  statusLabel,
  statusBadgeClass,
  isIncomingFulfillment,
  isKirimKeStore,
  isSentToWarehouse,
  isEligibleKirimKeGudang,
  isEligibleSjStruk,
  isOrderSelesai,
  isStoreFulfilledItem,
  isStoreItemReceived,
  getValidItemSjDealpos,
  generateCustomerWaTemplate,
  getCleanCustomerPhone,
  onOpenActionSheet,
  onCopySj,
  onCopyResi,
  onCopyWaTemplate,
  onCopyFullSummary,
  onOpenWaModal,
  onOpenJadwal,
  onUpdateResi,
  onKirimKeGudang,
  onPrintPicking,
  onPrintLabel,
  onPrintSjStruk,
  onToggleStoreItemReceived,
  onPreviewPhoto,
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

  const totalQty = order.items?.reduce((acc, it) => acc + (Number(it.qty) || 0), 0) || 0;
  const validPic = getValidPersonPicName(
    order.pic_store ||
      order.alteration_repair_data?.pic_pemohon ||
      order.alteration_repair_data?.pic_kirim_store,
    order.nama_pengirim,
    outlets
  );

  // Determine 1 crisp contextual primary action for the sticky footer (same rule as Table & Card!)
  const primaryCta = (() => {
    if (order.status !== 'batal') {
      if (isEligibleKirimKeGudang && !isSentToWarehouse) {
        return {
          label: 'Kirim ke Gudang',
          icon: <Truck className="w-4 h-4 shrink-0" />,
          cls: 'bg-indigo-600 hover:bg-indigo-700 text-white',
          onClick: () => {
            onClose();
            onKirimKeGudang(order);
          },
        };
      }
      if (!isStoreUser) {
        if (!order.is_picking_printed) {
          return {
            label: 'Cetak Picking List',
            icon: <FileText className="w-4 h-4 shrink-0" />,
            cls: 'bg-indigo-600 hover:bg-indigo-700 text-white',
            onClick: () => {
              onClose();
              onPrintPicking(order);
            },
          };
        }
        if (!order.is_label_printed) {
          return {
            label: 'Cetak Label A6',
            icon: <Printer className="w-4 h-4 shrink-0" />,
            cls: 'bg-indigo-600 hover:bg-indigo-700 text-white',
            onClick: () => {
              onClose();
              onPrintLabel(order);
            },
          };
        }
        if (userIsAdmin && !order.no_resi && !isKirimKeStore) {
          return {
            label: 'Input Nomor Resi',
            icon: <Truck className="w-4 h-4 shrink-0" />,
            cls: 'bg-indigo-600 hover:bg-indigo-700 text-white',
            onClick: () => onUpdateResi(order),
          };
        }
        if (userIsAdmin && isKirimKeStore && !order.tgl_jadwal_kirim_store) {
          return {
            label: 'Atur Jadwal Store',
            icon: <Calendar className="w-4 h-4 shrink-0" />,
            cls: 'bg-indigo-600 hover:bg-indigo-700 text-white',
            onClick: () => onOpenJadwal(order),
          };
        }
      }
      if (order.no_resi) {
        return {
          label: 'Kirim WA Customer',
          icon: <MessageCircle className="w-4 h-4 shrink-0" />,
          cls: 'bg-emerald-600 hover:bg-emerald-700 text-white',
          onClick: () => onOpenWaModal(order),
        };
      }
      if (isStoreUser && isEligibleSjStruk) {
        return {
          label: 'Cetak SJ Struk',
          icon: <Printer className="w-4 h-4 shrink-0" />,
          cls: 'bg-indigo-600 hover:bg-indigo-700 text-white',
          onClick: () => {
            onClose();
            onPrintSjStruk(order);
          },
        };
      }
    }
    return {
      label: 'Menu Aksi Pesanan',
      icon: <MoreHorizontal className="w-4 h-4 shrink-0" />,
      cls: 'bg-indigo-600 hover:bg-indigo-700 text-white',
      onClick: () => onOpenActionSheet(order),
    };
  })();

  const mktItems = (order.items || []).filter((it) => !isStoreFulfilledItem(order, it));
  const missingSjCount = mktItems.filter((it) => !getValidItemSjDealpos(order, it)).length;
  const waTemplate = generateCustomerWaTemplate(order);

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-[2px] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Detail pesanan ${order.no_pesanan}`}
    >
      <div
        className="bg-white dark:bg-slate-900 border-t sm:border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-t-3xl sm:rounded-2xl w-full max-w-4xl max-h-[92vh] sm:max-h-[88vh] overflow-hidden flex flex-col shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Mobile Drag Handle */}
        <div className="sm:hidden flex justify-center pt-2.5 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
        </div>

        {/* Sticky Clean Header */}
        <div className="px-4 sm:px-5 pt-1.5 sm:pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0 bg-white dark:bg-slate-900">
          <div className="flex items-start gap-2.5 min-w-0">
            <button
              type="button"
              onClick={onClose}
              className="hidden sm:flex w-8 h-8 rounded-lg items-center justify-center text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 mt-0.5"
              title="Kembali"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-extrabold font-mono text-slate-900 dark:text-white tracking-tight truncate">
                  #{order.no_pesanan}
                </h2>
                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${statusBadgeClass}`}>
                  {statusLabel}
                </span>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap mt-1.5 text-[10.5px] font-semibold">
                {!isStoreUser && (
                  <>
                    <span
                      className={`px-1.5 py-0.5 rounded-md border ${
                        order.is_picking_printed
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      Picking {order.is_picking_printed ? '✓' : 'Belum'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded-md border ${
                        order.is_label_printed
                          ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                      }`}
                    >
                      Label A6 {order.is_label_printed ? '✓' : 'Belum'}
                    </span>
                  </>
                )}
                {mktItems.length > 0 && missingSjCount > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md border bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800">
                    Butuh SJ ({missingSjCount})
                  </span>
                )}
                {isSentToWarehouse && (
                  <span className="px-1.5 py-0.5 rounded-md border bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800">
                    Kirim WH ✓
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Tutup detail pesanan"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content — Clean 2-Column Desktop / Single-Column Native App Mobile */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5 bg-slate-50/40 dark:bg-slate-950/20">
          {isIncomingFulfillment && (
            <div className="p-3 bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800/60 rounded-xl text-xs text-orange-900 dark:text-orange-200 flex items-start gap-2">
              <Truck className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong>Permintaan Ambil Toko Lain:</strong> Diminta oleh{' '}
                <strong>{order.nama_pengirim}</strong>, namun barang diambil dari toko Anda (
                <strong>{userAssignedStore}</strong>). Cetak SJ Struk dan kirim fisik barang ke Gudang.
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-start">
            {/* LEFT COLUMN (Customer + Store + Audit) */}
            <div className="lg:col-span-5 space-y-4">
              {/* 1. Penerima & Pengiriman (Merged — no duplicate Customer Info!) */}
              <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5" />
                    <span>Penerima &amp; Kurir</span>
                  </span>
                  <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-[11px] font-bold">
                    {order.jasa_kirim || '-'}
                  </span>
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900 dark:text-white">
                    {order.nama_tujuan || '-'}
                  </div>
                  {order.no_telp_tujuan && (
                    <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                      {order.no_telp_tujuan}
                    </div>
                  )}
                </div>
                {order.alamat_tujuan && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed pt-1 border-t border-slate-100 dark:border-slate-800">
                    {order.alamat_tujuan}
                  </p>
                )}
                {order.notes_paket && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Catatan: </span>
                    <span className="text-slate-800 dark:text-slate-200">{order.notes_paket}</span>
                  </div>
                )}
              </section>

              {/* 2. Store & Pengirim */}
              <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                  <Store className="w-3.5 h-3.5" />
                  <span>Pengirim / Store</span>
                </span>
                <div className="text-sm font-bold text-slate-900 dark:text-white">
                  {order.nama_pengirim || '-'}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400">PIC Store</span>
                    {validPic ? (
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{validPic}</span>
                    ) : (
                      <span className="italic text-amber-600 dark:text-amber-400">Belum diisi</span>
                    )}
                  </div>
                  {order.no_telp_store && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400">Telp Store</span>
                      <span className="font-mono">{order.no_telp_store}</span>
                    </div>
                  )}
                  {order.no_transaksi_pengirim && order.no_transaksi_pengirim.length > 0 && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-400 shrink-0">DealPOS</span>
                      <span className="font-mono font-semibold text-right truncate">
                        {order.no_transaksi_pengirim.join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </section>

              {/* 3. Riwayat & Audit Trail */}
              <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5" />
                    <span>Riwayat Pesanan</span>
                  </span>
                  {order.history_logs && order.history_logs.length > 0 && (
                    <span className="text-[10.5px] text-slate-400 tabular-nums">
                      {order.history_logs.length} log
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1">
                  <div>
                    Dibuat:{' '}
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {new Date(order.created_at || '').toLocaleString('id-ID')}
                    </span>
                  </div>
                  {order.submitted_by && (
                    <div>
                      Oleh:{' '}
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {formatOperatorWithPersonName(order.submitted_by)}
                      </span>
                    </div>
                  )}
                </div>

                {order.history_logs && order.history_logs.length > 0 && (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2 max-h-44 overflow-y-auto">
                    {order.history_logs.map((log) => (
                      <div
                        key={log.id}
                        className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-2 text-[10px] text-slate-500 dark:text-slate-400 font-semibold mb-0.5">
                          <span className="truncate">{log.actor}</span>
                          <span className="shrink-0 tabular-nums">
                            {new Date(log.timestamp).toLocaleString('id-ID')}
                          </span>
                        </div>
                        <div className="text-slate-700 dark:text-slate-200 leading-relaxed">
                          {log.note}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* RIGHT COLUMN (Products + Schedule + Resi & WA Template) */}
            <div className="lg:col-span-7 space-y-4">
              {/* 1. Rincian Produk */}
              <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5" />
                    <span>Rincian Produk</span>
                  </span>
                  <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                    Total {totalQty} pcs
                  </span>
                </div>

                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(order.items || []).map((item, idx) => {
                    const cleanSku = String(item.sku || '').trim().toUpperCase();
                    const master = cleanSku
                      ? lookupProductBySku(cleanSku, productCatalog, item.nama_produk, item.size)
                      : null;
                    const effectiveName =
                      master && master.found ? master.nama_produk : item.nama_produk || item.sku || '-';
                    const effectiveSize =
                      master && master.found
                        ? master.size || ''
                        : !isCorruptedColorCodeSize(cleanSku, item.size) && item.size
                        ? item.size
                        : '';
                    const isStoreItem = isStoreFulfilledItem(order, item);
                    const isReceived = isStoreItemReceived(order, item);
                    const validSj = !isStoreItem ? getValidItemSjDealpos(order, item) : '';

                    return (
                      <div key={item.id || idx} className="p-3.5 sm:p-4 space-y-1.5">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div
                              className={`text-xs sm:text-[13px] font-bold leading-snug ${
                                item.item_status === 'sold_out'
                                  ? 'line-through text-slate-400'
                                  : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {effectiveName}
                              {effectiveSize && effectiveSize !== 'ALL' && effectiveSize !== '-'
                                ? ` · ${effectiveSize}`
                                : ''}
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap mt-0.5">
                              <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                                {item.sku}
                              </span>
                              <span>·</span>
                              <span>{item.fulfillment || 'Marketplace'}</span>
                            </div>
                          </div>
                          <span className="font-mono text-xs font-extrabold text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md shrink-0 tabular-nums">
                            ×{item.qty}
                          </span>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap pt-0.5">
                          {item.item_status === 'sold_out' && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-[10.5px] font-bold text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                              <Ban className="w-3 h-3" />
                              <span>Sold Out {item.sold_note ? `(${item.sold_note})` : ''}</span>
                            </span>
                          )}

                          {item.item_status !== 'sold_out' && isStoreItem && (
                            isReceived ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (userIsAdmin && !isOrderSelesai) {
                                    onToggleStoreItemReceived(order, item, idx, false);
                                  }
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 ${
                                  userIsAdmin && !isOrderSelesai ? 'cursor-pointer hover:bg-emerald-100' : 'cursor-default'
                                }`}
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Diterima WH</span>
                              </button>
                            ) : userIsAdmin && order.status !== 'batal' ? (
                              <button
                                type="button"
                                onClick={() => onToggleStoreItemReceived(order, item, idx, true)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer"
                              >
                                <PackageCheck className="w-3 h-3" />
                                <span>Tandai Terima WH</span>
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/50 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                <Clock className="w-3 h-3" />
                                <span>Menunggu Terima WH</span>
                              </span>
                            )
                          )}

                          {item.item_status !== 'sold_out' && !isStoreItem && (
                            validSj ? (
                              <button
                                type="button"
                                onClick={() => onCopySj(validSj)}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 text-[10.5px] font-mono font-bold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 cursor-pointer"
                                title="Ketuk untuk salin No. SJ DealPOS"
                              >
                                <FileCheck className="w-3 h-3" />
                                <span>SJ: {validSj}</span>
                                {copiedSj === validSj ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3 opacity-70" />
                                )}
                              </button>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 text-[10.5px] font-semibold text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                <Clock className="w-3 h-3" />
                                <span>Menunggu SJ DealPOS</span>
                              </span>
                            )
                          )}
                        </div>

                        {item.needs_alteration && (
                          <div className="mt-2 p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/60 text-xs text-rose-900 dark:text-rose-200 space-y-1.5">
                            <div className="flex items-center justify-between gap-2 font-bold">
                              <span className="flex items-center gap-1">
                                <Scissors className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span>
                                  Form Alter:{' '}
                                  <span className="font-mono text-indigo-700 dark:text-indigo-300">
                                    {item.id_form_alter || '-'}
                                  </span>
                                </span>
                              </span>
                              <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-200 font-bold">
                                {item.layanan_type || 'Alteration'}
                              </span>
                            </div>
                            {item.alteration_detail && (
                              <p className="text-[11.5px] text-slate-700 dark:text-slate-300 leading-relaxed">
                                {item.alteration_detail}
                              </p>
                            )}
                            {item.foto_urls && item.foto_urls.length > 0 && (
                              <div className="pt-1.5 border-t border-rose-200/70 dark:border-rose-900/50 space-y-1.5">
                                <div className="flex items-center gap-1 text-[10.5px] font-semibold text-rose-700 dark:text-rose-300">
                                  <Camera className="w-3 h-3" />
                                  <span>Foto Panduan ({item.foto_urls.length})</span>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  {item.foto_urls.map((fUrl, fIdx) => (
                                    <button
                                      key={fIdx}
                                      type="button"
                                      onClick={() => onPreviewPhoto(fUrl)}
                                      className="group relative rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 cursor-pointer"
                                    >
                                      <img
                                        src={fUrl}
                                        alt=""
                                        className="w-14 h-14 object-cover group-hover:scale-105 transition-transform"
                                      />
                                      <div className="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                        <Eye className="w-4 h-4 text-white" />
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* 2. Jadwal Pengiriman ke Store (If applicable) */}
              {isKirimKeStore && (
                <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                      Jadwal Pengiriman ke Store
                    </span>
                    <div className="text-sm font-bold text-slate-900 dark:text-white mt-1">
                      {order.tgl_jadwal_kirim_store ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                          <Calendar className="w-4 h-4" />
                          <span>
                            {new Date(order.tgl_jadwal_kirim_store).toLocaleDateString('id-ID', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 text-xs font-semibold inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Belum dijadwalkan</span>
                        </span>
                      )}
                    </div>
                    {order.catatan_jadwal_store && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic">
                        {order.catatan_jadwal_store}
                      </p>
                    )}
                  </div>
                  {userIsAdmin && (
                    <button
                      type="button"
                      onClick={() => onOpenJadwal(order)}
                      className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-xs font-bold text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>{order.tgl_jadwal_kirim_store ? 'Ubah Jadwal' : 'Atur Jadwal'}</span>
                    </button>
                  )}
                </section>
              )}

              {/* 3. Resi & Template WA Customer (Clean, Never Squished) */}
              <section className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                      Nomor Resi Pengiriman
                    </span>
                    <div className="mt-1">
                      {order.no_resi ? (
                        <span className="font-mono text-sm font-extrabold text-emerald-700 dark:text-emerald-400">
                          {order.no_resi}
                        </span>
                      ) : (
                        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Menunggu update resi dari Gudang</span>
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {order.no_resi && (
                      <button
                        type="button"
                        onClick={() => onCopyResi(order.no_pesanan || '', order.no_resi || '')}
                        className="h-8 px-2.5 rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedResi === order.no_pesanan ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>Salin Resi</span>
                      </button>
                    )}
                    {userIsAdmin && (
                      <button
                        type="button"
                        onClick={() => onUpdateResi(order)}
                        className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold cursor-pointer"
                      >
                        {order.no_resi ? 'Ubah Resi' : '+ Input Resi'}
                      </button>
                    )}
                  </div>
                </div>

                {/* Format Pesan WA Customer */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 min-w-0 truncate">
                      <MessageCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      <span className="truncate">Format Pesan WA Customer</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => onCopyWaTemplate(waTemplate)}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      <span>Salin WA</span>
                    </button>
                  </div>

                  <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 rounded-xl p-3 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap max-h-36 overflow-y-auto leading-relaxed select-all">
                    {waTemplate}
                  </div>

                  {order.no_telp_tujuan && (
                    <div className="flex justify-end">
                      <a
                        href={`https://wa.me/${getCleanCustomerPhone(
                          order.no_telp_tujuan
                        )}?text=${encodeURIComponent(waTemplate)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Buka WhatsApp Customer</span>
                      </a>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>

        {/* Sticky Native App Footer — ONLY 1 Primary CTA + Quick Copy + Unified Aksi Menu! */}
        <div className="px-4 sm:px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={primaryCta.onClick}
            className={`flex-1 h-11 sm:h-10 px-4 rounded-xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 transition-colors cursor-pointer ${primaryCta.cls}`}
          >
            {primaryCta.icon}
            <span className="truncate">{primaryCta.label}</span>
          </button>

          <button
            type="button"
            onClick={() => onCopyFullSummary(order)}
            className="h-11 sm:h-10 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            title="Salin rincian lengkap pesanan (WA)"
          >
            <Copy className="w-4 h-4 text-slate-500" />
            <span className="hidden sm:inline">Salin Info</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenActionSheet(order)}
            className="h-11 sm:h-10 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 text-xs sm:text-sm font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
            title="Buka semua menu aksi (Cetak, Resi, Chat, Edit, Batal)"
          >
            <MoreHorizontal className="w-4 h-4" />
            <span>Aksi</span>
          </button>
        </div>
      </div>
    </div>
  );
};
