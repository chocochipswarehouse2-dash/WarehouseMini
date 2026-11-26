import React from 'react';
import {
  ArrowUpDown,
  Ban,
  Calendar,
  Camera,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Eye,
  FileCheck,
  FileText,
  MessageCircle,
  MoreHorizontal,
  Package,
  PackageCheck,
  Printer,
  RotateCcw,
  Scissors,
  Store,
  Truck,
  AlertOctagon,
  BellRing,
  Loader2,
} from 'lucide-react';
import { ManualShipmentItem, ManualShipmentOrder, ProductItem } from '../../types';
import { OutletItem, getValidPersonPicName } from '../../services/gasManualShipment';
import { hasRealAlterItems, hasValidArData, isRealAlterItem } from '../../utils/alterationUtils';
import { lookupProductBySku } from '../../utils/productLookup';
import { isCorruptedColorCodeSize } from '../../utils/sortUtils';

export interface RekapOrderViewsProps {
  viewMode: 'table' | 'card';
  filteredOrders: ManualShipmentOrder[];
  directionScopedOrdersCount: number;
  stageTab: string;
  searchTerm: string;
  sortBy: string;
  onChangeSortBy: (updater: (prev: any) => any) => void;
  onShowAllStages: () => void;
  canAction: boolean;
  userIsAdmin: boolean;
  isStoreUser: boolean;
  selectedOrders: Set<string>;
  isAllFilteredSelected: boolean;
  isSomeFilteredSelected: boolean;
  onToggleSelectAllFiltered: () => void;
  onToggleSelectOrder: (key: string) => void;
  getOrderKey: (o: ManualShipmentOrder) => string;
  productCatalog: ProductItem[];
  outlets: OutletItem[];
  copiedSj: string | null;
  copiedResi: string | null;
  onCopySj: (sj: string) => void;
  onCopyResi: (orderNo: string, resi: string) => void;
  // Predicates & metadata helpers
  getOrderStatusBadgeInfo: (o: ManualShipmentOrder) => { label: string; badgeClass: string };
  isOrderIncomingFulfillment: (o: ManualShipmentOrder) => boolean;
  isStoreFulfilledItem: (o: ManualShipmentOrder, it: ManualShipmentItem) => boolean;
  isStoreItemReceived: (o: ManualShipmentOrder, it: ManualShipmentItem) => boolean;
  isOrderSelesai: (o: ManualShipmentOrder) => boolean;
  isKirimKeStore: (o: ManualShipmentOrder) => boolean;
  isOrderSentToWarehouse: (o: ManualShipmentOrder) => boolean;
  isOrderEligibleKirimKeGudang: (o: ManualShipmentOrder) => boolean;
  hasPendingStoreFulfillment?: (o: ManualShipmentOrder) => boolean;
  sendingReminderOrderKey?: string | null;
  isEligibleForSjStruk: (o: ManualShipmentOrder) => boolean;
  getValidItemSjDealpos: (o: ManualShipmentOrder, it: any) => string;
  // Action callbacks
  onOpenDetail: (o: ManualShipmentOrder) => void;
  onOpenActionSheet: (o: ManualShipmentOrder) => void;
  onKirimKeGudang: (o: ManualShipmentOrder) => void;
  onReceiveAllStoreItems?: (o: ManualShipmentOrder) => void;
  onSendStoreReminder?: (o: ManualShipmentOrder) => void;
  onPrintLabel: (o: ManualShipmentOrder) => void;
  onPrintPicking: (o: ManualShipmentOrder) => void;
  onPrintSjStruk: (o: ManualShipmentOrder) => void;
  onInputResi: (o: ManualShipmentOrder) => void;
  onWaCustomer: (o: ManualShipmentOrder) => void;
  onInputSjDealpos: (o: ManualShipmentOrder, existingSj: string) => void;
  onOpenJadwal: (o: ManualShipmentOrder) => void;
  onToggleStoreItemReceived: (o: ManualShipmentOrder, it: ManualShipmentItem, idx: number, received: boolean) => void;
  onMarkItemSold: (o: ManualShipmentOrder, it: ManualShipmentItem) => void;
  onRestoreSoldItem: (o: ManualShipmentOrder, it: ManualShipmentItem) => void;
}

interface PrimaryActionMeta {
  label: string;
  shortLabel: string;
  icon: React.ReactNode;
  variant: 'primary' | 'secondary' | 'success';
  disabled?: boolean;
  onClick: () => void;
}

export const RekapOrderViews: React.FC<RekapOrderViewsProps> = ({
  viewMode,
  filteredOrders,
  directionScopedOrdersCount,
  stageTab,
  searchTerm,
  sortBy,
  onChangeSortBy,
  onShowAllStages,
  canAction,
  userIsAdmin,
  isStoreUser,
  selectedOrders,
  isAllFilteredSelected,
  isSomeFilteredSelected,
  onToggleSelectAllFiltered,
  onToggleSelectOrder,
  getOrderKey,
  productCatalog,
  outlets,
  copiedSj,
  copiedResi,
  onCopySj,
  onCopyResi,
  getOrderStatusBadgeInfo,
  isOrderIncomingFulfillment,
  isStoreFulfilledItem,
  isStoreItemReceived,
  isOrderSelesai,
  isKirimKeStore,
  isOrderSentToWarehouse,
  isOrderEligibleKirimKeGudang,
  hasPendingStoreFulfillment,
  sendingReminderOrderKey,
  isEligibleForSjStruk,
  getValidItemSjDealpos,
  onOpenDetail,
  onOpenActionSheet,
  onKirimKeGudang,
  onReceiveAllStoreItems,
  onSendStoreReminder,
  onPrintLabel,
  onPrintPicking,
  onPrintSjStruk,
  onInputResi,
  onWaCustomer,
  onInputSjDealpos,
  onOpenJadwal,
  onToggleStoreItemReceived,
  onMarkItemSold,
  onRestoreSoldItem,
}) => {
  const resolveItemDisplay = (it: ManualShipmentItem) => {
    const cleanSku = String(it.sku || '').trim().toUpperCase();
    const master = cleanSku ? lookupProductBySku(cleanSku, productCatalog, it.nama_produk, it.size) : null;
    const effectiveName = master && master.found ? master.nama_produk : it.nama_produk || it.sku || '-';
    const effectiveSize =
      master && master.found
        ? master.size || ''
        : !isCorruptedColorCodeSize(cleanSku, it.size) && it.size
        ? it.size
        : '';
    return { effectiveName, effectiveSize };
  };

  const getOrderMktSjMeta = (order: ManualShipmentOrder) => {
    const mktItems = (order.items || []).filter((it) => {
      const ful = (it.fulfillment || '').toLowerCase().trim();
      return (
        ful.includes('marketplace') ||
        ful.includes('gudang') ||
        ful.includes('warehouse') ||
        order.no_pesanan?.startsWith('AR-') ||
        !ful
      );
    });
    const sjList = Array.from(new Set(mktItems.map((it) => getValidItemSjDealpos(order, it)).filter(Boolean)));
    const missingCount = mktItems.filter((it) => !getValidItemSjDealpos(order, it)).length;
    return { mktItems, sjList, missingCount };
  };

  // Single clear contextual primary CTA per order — eliminates scattered buttons!
  const getPrimaryAction = (order: ManualShipmentOrder): PrimaryActionMeta => {
    const orderKey = getOrderKey(order);
    const isSendingReminder = sendingReminderOrderKey === orderKey;
    const hasPendingStore = Boolean(hasPendingStoreFulfillment?.(order));
    const sentToWh = isOrderSentToWarehouse(order);

    if (order.status !== 'batal') {
      // STRICT ROLE: "Kirim ke Gudang" HANYA untuk Store (bukan Admin)
      if (isStoreUser && isOrderEligibleKirimKeGudang(order) && !sentToWh) {
        return {
          label: 'Kirim ke Gudang',
          shortLabel: 'Kirim WH',
          icon: <Truck className="w-3.5 h-3.5 shrink-0" />,
          variant: 'primary',
          onClick: () => onKirimKeGudang(order),
        };
      }
      // STRICT ROLE: Admin Gudang melihat tombol Terima Barang Store (jika store sudah kirim) atau Reminder Store (jika belum kirim)
      if (!isStoreUser && userIsAdmin && hasPendingStore) {
        if (sentToWh && onReceiveAllStoreItems) {
          return {
            label: 'Terima Barang',
            shortLabel: 'Terima WH',
            icon: <PackageCheck className="w-3.5 h-3.5 shrink-0" />,
            variant: 'primary',
            onClick: () => onReceiveAllStoreItems(order),
          };
        }
        if (!sentToWh && onSendStoreReminder) {
          return {
            label: isSendingReminder ? 'Mengirim...' : 'Reminder Store',
            shortLabel: isSendingReminder ? 'Kirim...' : 'Reminder',
            icon: isSendingReminder ? (
              <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin" />
            ) : (
              <BellRing className="w-3.5 h-3.5 shrink-0" />
            ),
            variant: 'primary',
            disabled: isSendingReminder,
            onClick: () => onSendStoreReminder(order),
          };
        }
      }
      if (!isStoreUser) {
        if (!order.is_picking_printed) {
          return {
            label: 'Cetak Picking',
            shortLabel: 'Picking',
            icon: <FileText className="w-3.5 h-3.5 shrink-0" />,
            variant: 'primary',
            onClick: () => onPrintPicking(order),
          };
        }
        if (!order.is_label_printed) {
          return {
            label: 'Cetak Label A6',
            shortLabel: 'Label A6',
            icon: <Printer className="w-3.5 h-3.5 shrink-0" />,
            variant: 'primary',
            onClick: () => onPrintLabel(order),
          };
        }
        if (userIsAdmin && !order.no_resi && !isKirimKeStore(order)) {
          return {
            label: 'Input Resi',
            shortLabel: 'Resi',
            icon: <Truck className="w-3.5 h-3.5 shrink-0" />,
            variant: 'primary',
            onClick: () => onInputResi(order),
          };
        }
        if (userIsAdmin && isKirimKeStore(order) && !order.tgl_jadwal_kirim_store) {
          return {
            label: 'Atur Jadwal',
            shortLabel: 'Jadwal',
            icon: <Calendar className="w-3.5 h-3.5 shrink-0" />,
            variant: 'primary',
            onClick: () => onOpenJadwal(order),
          };
        }
      }
      if (order.no_resi) {
        return {
          label: 'WA Customer',
          shortLabel: 'WA Resi',
          icon: <MessageCircle className="w-3.5 h-3.5 shrink-0" />,
          variant: 'success',
          onClick: () => onWaCustomer(order),
        };
      }
      if (isStoreUser && isEligibleForSjStruk(order)) {
        return {
          label: 'Cetak SJ Struk',
          shortLabel: 'SJ Struk',
          icon: <Printer className="w-3.5 h-3.5 shrink-0" />,
          variant: 'secondary',
          onClick: () => onPrintSjStruk(order),
        };
      }
    }
    return {
      label: 'Lihat Detail',
      shortLabel: 'Detail',
      icon: <Eye className="w-3.5 h-3.5 shrink-0" />,
      variant: 'secondary',
      onClick: () => onOpenDetail(order),
    };
  };

  const getPrimaryBtnClass = (variant: PrimaryActionMeta['variant']) => {
    if (variant === 'primary') {
      return 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white border border-indigo-600 shadow-2xs';
    }
    if (variant === 'success') {
      return 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white border border-emerald-600 shadow-2xs';
    }
    return 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700';
  };

  const renderEmptyState = () => (
    <div className="px-4 py-12 text-center bg-white dark:bg-slate-900">
      <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto mb-3 text-slate-400">
        <Package className="w-5 h-5" />
      </div>
      {searchTerm ? (
        <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
          Tidak ada pesanan yang cocok dengan pencarian &ldquo;{searchTerm}&rdquo;.
        </p>
      ) : directionScopedOrdersCount > 0 && stageTab !== 'semua' ? (
        <div className="space-y-2.5 max-w-sm mx-auto">
          <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
            Tidak ada pesanan pada tahap{' '}
            <strong className="text-slate-800 dark:text-white">
              {stageTab === 'baru'
                ? 'Pesanan Baru'
                : stageTab === 'diproses'
                ? 'Sedang Diproses'
                : stageTab === 'batal'
                ? 'Dibatalkan'
                : 'Selesai'}
            </strong>
            . Tersedia <strong>{directionScopedOrdersCount} pesanan</strong> di tahap lainnya.
          </p>
          <button
            type="button"
            onClick={onShowAllStages}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            Tampilkan Semua ({directionScopedOrdersCount})
          </button>
        </div>
      ) : (
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Belum ada data pesanan pada tampilan ini.
        </p>
      )}
    </div>
  );

  // =========================================================================
  // VIEW MODE 1: TABEL (Desktop Executive Table + Mobile Native Compact List)
  // =========================================================================
  if (viewMode === 'table') {
    if (filteredOrders.length === 0) {
      return renderEmptyState();
    }

    return (
      <div className="bg-white dark:bg-slate-900">
        {/* MOBILE NATIVE COMPACT LIST-TABLE (< 768px) — ZERO HORIZONTAL SCROLL */}
        <div className="md:hidden divide-y divide-slate-200/80 dark:divide-slate-800">
          {/* Sticky-style Mobile List Header */}
          {canAction && (
            <div className="px-2.5 py-2 bg-slate-50/90 dark:bg-slate-800/50 flex items-center justify-between text-[11px]">
              <label className="inline-flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  ref={(el) => {
                    if (el) el.indeterminate = isSomeFilteredSelected;
                  }}
                  checked={isAllFilteredSelected}
                  onChange={onToggleSelectAllFiltered}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>Pilih Semua ({filteredOrders.length})</span>
              </label>
              <span className="text-[10.5px] text-slate-400 dark:text-slate-500">
                Ketuk baris untuk detail
              </span>
            </div>
          )}

          {filteredOrders.map((order) => {
            const key = getOrderKey(order);
            const badgeInfo = getOrderStatusBadgeInfo(order);
            const totalPcs = (order.items || []).reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
            const firstItem = (order.items || [])[0];
            const firstItemName = firstItem ? resolveItemDisplay(firstItem).effectiveName : '-';
            const extraItemsCount = Math.max(0, (order.items || []).length - 1);
            const hasAlter = hasRealAlterItems(order);
            const needKirimWh =
              isStoreUser &&
              order.status !== 'batal' &&
              isOrderEligibleKirimKeGudang(order) &&
              !isOrderSentToWarehouse(order);
            const adminPendingStore =
              !isStoreUser &&
              userIsAdmin &&
              order.status !== 'batal' &&
              Boolean(hasPendingStoreFulfillment?.(order));
            const adminStoreSent = adminPendingStore && isOrderSentToWarehouse(order);
            const { mktItems, sjList } = getOrderMktSjMeta(order);
            const isSelected = selectedOrders.has(key);

            return (
              <div
                key={key}
                onClick={() => onOpenDetail(order)}
                className={`px-2.5 py-2.5 flex items-start gap-2 transition-colors active:bg-slate-100/80 dark:active:bg-slate-800/70 cursor-pointer ${
                  isSelected ? 'bg-indigo-50/50 dark:bg-indigo-950/25' : ''
                }`}
              >
                {canAction && (
                  <div
                    className="pt-0.5 pr-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelectOrder(key)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>
                )}

                <div className="flex-1 min-w-0 space-y-1">
                  {/* Line 1: Customer Name + Status */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-bold text-slate-900 dark:text-white truncate">
                      {order.nama_tujuan || '-'}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 text-[9.5px] font-bold rounded-md border shrink-0 ${badgeInfo.badgeClass}`}
                    >
                      {badgeInfo.label}
                    </span>
                  </div>

                  {/* Line 2: Order ID · Store · Pcs · Kurir */}
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 flex-wrap leading-tight">
                    <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      #{order.no_pesanan}
                    </span>
                    <span>·</span>
                    <span className="truncate max-w-[115px] font-medium text-slate-700 dark:text-slate-300">
                      {order.nama_pengirim || '-'}
                    </span>
                    <span>·</span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                      {totalPcs} pcs
                    </span>
                    {order.jasa_kirim && (
                      <>
                        <span>·</span>
                        <span className="truncate max-w-[95px]">{order.jasa_kirim}</span>
                      </>
                    )}
                  </div>

                  {/* Line 3: First item + compact status chips */}
                  <div className="flex items-center justify-between gap-2 pt-0.5">
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                      {firstItemName}
                      {extraItemsCount > 0 ? ` +${extraItemsCount} item` : ''}
                    </p>
                    <div className="flex items-center gap-1 shrink-0">
                      {hasAlter && (
                        <span className="text-[9.5px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/50 px-1.5 py-0.5 rounded">
                          Alter
                        </span>
                      )}
                      {needKirimWh && (
                        <span className="text-[9.5px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-1.5 py-0.5 rounded">
                          Kirim WH
                        </span>
                      )}
                      {adminPendingStore && (
                        <span
                          className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded ${
                            adminStoreSent
                              ? 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60'
                              : 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60'
                          }`}
                        >
                          {adminStoreSent ? 'Terima WH' : 'Tunggu Store'}
                        </span>
                      )}
                      {order.no_resi ? (
                        <span className="text-[9.5px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-1.5 py-0.5 rounded">
                          Resi ✓
                        </span>
                      ) : mktItems.length > 0 && sjList.length > 0 ? (
                        <span className="text-[9.5px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                          SJ ✓
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>

                {/* Right 44x44px Touch Action Trigger */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenActionSheet(order);
                  }}
                  className="w-10 h-10 -mr-1 rounded-xl flex items-center justify-center text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 active:bg-slate-200 dark:active:bg-slate-700 shrink-0 cursor-pointer"
                  aria-label={`Menu aksi pesanan ${order.no_pesanan}`}
                >
                  <MoreHorizontal className="w-5 h-5" />
                </button>
              </div>
            );
          })}
        </div>

        {/* DESKTOP EXECUTIVE TABLE (>= 768px) — CLEAN 6-COLUMN PROPORTIONS */}
        <div className="hidden md:block w-full overflow-x-auto">
          <table className="w-full min-w-[880px] text-left border-collapse lg:table-fixed">
            <thead>
              <tr className="bg-slate-50/90 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[10.5px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {canAction && (
                  <th scope="col" className="py-3 px-3 w-10 text-center">
                    <input
                      type="checkbox"
                      ref={(el) => {
                        if (el) el.indeterminate = isSomeFilteredSelected;
                      }}
                      className="rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer"
                      onChange={onToggleSelectAllFiltered}
                      checked={isAllFilteredSelected}
                      title={isAllFilteredSelected ? 'Batalkan semua pilihan' : 'Pilih semua'}
                    />
                  </th>
                )}
                <th
                  scope="col"
                  onClick={() =>
                    onChangeSortBy((prev) =>
                      prev === 'newest'
                        ? 'oldest'
                        : prev === 'oldest'
                        ? 'store_asc'
                        : prev === 'store_asc'
                        ? 'store_desc'
                        : 'newest'
                    )
                  }
                  className="py-3 px-3 lg:w-[20%] cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none transition-colors"
                >
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span>Pesanan &amp; Store</span>
                    <ArrowUpDown
                      className={`w-3 h-3 shrink-0 ${
                        ['newest', 'oldest', 'store_asc', 'store_desc'].includes(sortBy)
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'opacity-40'
                      }`}
                    />
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() =>
                    onChangeSortBy((prev) =>
                      prev === 'customer_asc'
                        ? 'customer_desc'
                        : prev === 'customer_desc'
                        ? 'courier_asc'
                        : 'customer_asc'
                    )
                  }
                  className="py-3 px-3 lg:w-[17%] cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none transition-colors"
                >
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span>Customer &amp; Kurir</span>
                    <ArrowUpDown
                      className={`w-3 h-3 shrink-0 ${
                        ['customer_asc', 'customer_desc', 'courier_asc'].includes(sortBy)
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'opacity-40'
                      }`}
                    />
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() => onChangeSortBy((prev) => (prev === 'qty_desc' ? 'qty_asc' : 'qty_desc'))}
                  className="py-3 px-3 lg:w-[27%] cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none transition-colors"
                >
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span>Produk</span>
                    <ArrowUpDown
                      className={`w-3 h-3 shrink-0 ${
                        ['qty_desc', 'qty_asc'].includes(sortBy)
                          ? 'text-indigo-600 dark:text-indigo-400'
                          : 'opacity-40'
                      }`}
                    />
                  </div>
                </th>
                <th
                  scope="col"
                  onClick={() =>
                    onChangeSortBy((prev) => (prev === 'unprinted_first' ? 'newest' : 'unprinted_first'))
                  }
                  className="py-3 px-3 lg:w-[20%] cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 select-none transition-colors"
                >
                  <div className="flex items-center gap-1 whitespace-nowrap">
                    <span>Dokumen &amp; Resi</span>
                    <ArrowUpDown
                      className={`w-3 h-3 shrink-0 ${
                        sortBy === 'unprinted_first' ? 'text-indigo-600 dark:text-indigo-400' : 'opacity-40'
                      }`}
                    />
                  </div>
                </th>
                <th scope="col" className="py-3 px-3 text-right lg:w-[16%] whitespace-nowrap">
                  Aksi
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200/75 dark:divide-slate-800 text-xs bg-white dark:bg-slate-900">
              {filteredOrders.map((order) => {
                const key = getOrderKey(order);
                const badgeInfo = getOrderStatusBadgeInfo(order);
                const pic = getValidPersonPicName(
                  order.pic_store ||
                    order.alteration_repair_data?.pic_pemohon ||
                    order.alteration_repair_data?.pic_kirim_store,
                  order.nama_pengirim,
                  outlets
                );
                const showRef =
                  order.no_transaksi_customer &&
                  order.no_transaksi_customer !== order.no_pesanan &&
                  !/^MS[A-Z0-9]*-[A-Z0-9]{4,6}$/i.test(order.no_transaksi_customer);
                const { mktItems, sjList, missingCount } = getOrderMktSjMeta(order);
                const primaryAction = getPrimaryAction(order);
                const isSelected = selectedOrders.has(key);
                const hasAlter = hasRealAlterItems(order);
                const alterPhotoCount = (order.items || []).reduce(
                  (acc, it) => acc + (it.foto_urls?.length || 0),
                  0
                );

                return (
                  <tr
                    key={key}
                    className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/35 ${
                      isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                    }`}
                  >
                    {canAction && (
                      <td className="py-3.5 px-3 w-10 text-center align-top">
                        <input
                          type="checkbox"
                          className="rounded border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer mt-0.5"
                          checked={isSelected}
                          onChange={() => onToggleSelectOrder(key)}
                        />
                      </td>
                    )}

                    {/* Col 1: Pesanan & Store (Clean typography, zero boxed clutter) */}
                    <td className="py-3.5 px-3 align-top">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => onOpenDetail(order)}
                            className="font-mono text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer tracking-tight"
                          >
                            #{order.no_pesanan}
                          </button>
                          <span
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded-md border ${badgeInfo.badgeClass}`}
                          >
                            {badgeInfo.label}
                          </span>
                        </div>

                        <div className="flex items-center gap-1 text-[11px] text-slate-700 dark:text-slate-200 font-semibold">
                          <span className="truncate">{order.nama_pengirim || '-'}</span>
                          <span className="text-slate-300 dark:text-slate-600">·</span>
                          <span className="font-normal text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                            {new Date(order.created_at || '').toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </span>
                        </div>

                        <div className="text-[10.5px] text-slate-500 dark:text-slate-400 space-y-0.5">
                          <div className="truncate">
                            PIC:{' '}
                            <span
                              className={
                                pic
                                  ? 'font-medium text-slate-700 dark:text-slate-300'
                                  : 'italic text-amber-600 dark:text-amber-400'
                              }
                            >
                              {pic || 'Belum diisi'}
                            </span>
                          </div>
                          {showRef && (
                            <div className="font-mono text-[10px] truncate" title={order.no_transaksi_customer}>
                              Ref: {order.no_transaksi_customer}
                            </div>
                          )}
                          {order.no_transaksi_pengirim && order.no_transaksi_pengirim.length > 0 && (
                            <div
                              className="font-mono text-[10px] truncate"
                              title={order.no_transaksi_pengirim.join(', ')}
                            >
                              DPOS: {order.no_transaksi_pengirim.join(', ')}
                            </div>
                          )}
                        </div>

                        {isOrderIncomingFulfillment(order) && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-950/50 px-1.5 py-0.5 rounded border border-orange-200 dark:border-orange-800">
                            <Truck className="w-2.5 h-2.5" />
                            <span>Fulfillment Anda</span>
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Col 2: Customer & Kurir */}
                    <td className="py-3.5 px-3 align-top">
                      <div className="space-y-1">
                        <button
                          type="button"
                          onClick={() => onOpenDetail(order)}
                          className="text-xs font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 text-left truncate block w-full cursor-pointer"
                          title={order.nama_tujuan || '-'}
                        >
                          {order.nama_tujuan || '-'}
                        </button>
                        {order.no_telp_tujuan && (
                          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            {order.no_telp_tujuan}
                          </div>
                        )}
                        <div className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                          <Truck className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{order.jasa_kirim || '-'}</span>
                        </div>
                        {order.alamat_tujuan && (
                          <p
                            className="text-[10.5px] text-slate-400 dark:text-slate-500 line-clamp-2 leading-snug"
                            title={order.alamat_tujuan}
                          >
                            {order.alamat_tujuan}
                          </p>
                        )}
                      </div>
                    </td>

                    {/* Col 3: Produk (Clean hairline list, zero outer colored boxes) */}
                    <td className="py-3.5 px-3 align-top">
                      <div className="space-y-1.5">
                        <div className="divide-y divide-slate-100 dark:divide-slate-800">
                          {(order.items || []).map((it, idx) => {
                            const { effectiveName, effectiveSize } = resolveItemDisplay(it);
                            const isStoreItem = isStoreFulfilledItem(order, it);
                            const isReceived = isStoreItemReceived(order, it);
                            const alterText =
                              it.alteration_detail ||
                              it.repair_detail ||
                              (hasValidArData(order.alteration_repair_data)
                                ? order.alteration_repair_data?.alteration_detail ||
                                  order.alteration_repair_data?.repair_detail
                                : '');

                            return (
                              <div key={it.id || idx} className="py-1.5 first:pt-0 last:pb-0 space-y-0.5">
                                <div className="flex items-start justify-between gap-2">
                                  <span
                                    className={`text-[11.5px] font-semibold leading-snug line-clamp-1 ${
                                      it.item_status === 'sold_out'
                                        ? 'line-through text-slate-400 dark:text-slate-500'
                                        : 'text-slate-800 dark:text-slate-100'
                                    }`}
                                    title={effectiveName}
                                  >
                                    {effectiveName}
                                    {effectiveSize && effectiveSize !== 'ALL' && effectiveSize !== '-'
                                      ? ` (${effectiveSize})`
                                      : ''}
                                  </span>
                                  <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-200 shrink-0 tabular-nums">
                                    ×{it.qty}
                                  </span>
                                </div>

                                <div className="flex items-center justify-between gap-2 text-[10.5px]">
                                  <div className="flex items-center gap-1.5 min-w-0 text-slate-500 dark:text-slate-400">
                                    <span className="font-mono text-indigo-600/90 dark:text-indigo-400 truncate">
                                      {it.sku}
                                    </span>
                                    <span>·</span>
                                    <span className="truncate">
                                      {it.fulfillment ||
                                        (order.no_pesanan?.startsWith('AR-') ? 'Warehouse' : 'Marketplace')}
                                    </span>
                                  </div>

                                  {/* Subtle contextual item status / quick toggle */}
                                  {it.item_status === 'sold_out' ? (
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">
                                        Sold Out
                                      </span>
                                      {userIsAdmin && (
                                        <button
                                          type="button"
                                          onClick={() => onRestoreSoldItem(order, it)}
                                          className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                        >
                                          Pulihkan
                                        </button>
                                      )}
                                    </div>
                                  ) : order.status !== 'batal' && isStoreItem ? (
                                    isReceived ? (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (userIsAdmin && !isOrderSelesai(order)) {
                                            onToggleStoreItemReceived(order, it, idx, false);
                                          }
                                        }}
                                        className={`text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 shrink-0 ${
                                          userIsAdmin && !isOrderSelesai(order)
                                            ? 'cursor-pointer hover:underline'
                                            : 'cursor-default'
                                        }`}
                                      >
                                        <CheckCircle2 className="w-3 h-3" />
                                        <span>Diterima WH</span>
                                      </button>
                                    ) : userIsAdmin ? (
                                      <button
                                        type="button"
                                        onClick={() => onToggleStoreItemReceived(order, it, idx, true)}
                                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                                      >
                                        <PackageCheck className="w-3 h-3" />
                                        <span>Tandai Terima</span>
                                      </button>
                                    ) : (
                                      <span className="text-[10px] text-amber-600 dark:text-amber-400 shrink-0">
                                        Menunggu WH
                                      </span>
                                    )
                                  ) : userIsAdmin && order.status !== 'batal' && !isOrderSelesai(order) ? (
                                    <button
                                      type="button"
                                      onClick={() => onMarkItemSold(order, it)}
                                      className="text-[10px] font-medium text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors shrink-0 cursor-pointer"
                                      title="Tandai stok Marketplace ini kosong / sold"
                                    >
                                      Tandai Sold
                                    </button>
                                  ) : null}
                                </div>

                                {(isRealAlterItem(it) || alterText) && (
                                  <div className="flex items-center gap-1 text-[10px] text-rose-600 dark:text-rose-400 font-medium">
                                    <Scissors className="w-2.5 h-2.5 shrink-0" />
                                    <span className="truncate" title={alterText || 'Perlu Alterasi'}>
                                      {alterText || 'Perlu Alterasi'}
                                    </span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {hasAlter && alterPhotoCount > 0 && (
                          <div className="inline-flex items-center gap-1 text-[10px] font-medium text-emerald-700 dark:text-emerald-400">
                            <Camera className="w-3 h-3" />
                            <span>{alterPhotoCount} foto alterasi terlampir</span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Col 4: Dokumen & Resi (Unified clean 3-line summary, zero button clutter) */}
                    <td className="py-3.5 px-3 align-top">
                      <div className="space-y-2 text-[11px]">
                        {/* Row A: SJ DealPOS */}
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500">
                              SJ DealPOS
                            </span>
                            {userIsAdmin && mktItems.length > 0 && (
                              <button
                                type="button"
                                onClick={() => onInputSjDealpos(order, sjList[0] || '')}
                                className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                              >
                                {sjList.length > 0 ? 'Edit' : '+ Input'}
                              </button>
                            )}
                          </div>
                          {mktItems.length === 0 ? (
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">
                              Fulfillment Store
                            </span>
                          ) : sjList.length > 0 ? (
                            <div className="space-y-0.5">
                              {sjList.map((sj) => (
                                <div key={sj} className="flex items-center gap-1 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                  <span className="truncate" title={sj}>
                                    {sj}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onCopySj(sj)}
                                    className="text-slate-400 hover:text-emerald-600 p-0.5 cursor-pointer shrink-0"
                                    title="Salin No. SJ"
                                  >
                                    {copiedSj === sj ? (
                                      <Check className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">
                              Butuh SJ ({missingCount})
                            </span>
                          )}
                        </div>

                        {/* Row B: Resi or Jadwal Kirim Store */}
                        <div className="space-y-0.5 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                          {isKirimKeStore(order) ? (
                            <>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500">
                                  Jadwal Store
                                </span>
                                {userIsAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => onOpenJadwal(order)}
                                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                  >
                                    {order.tgl_jadwal_kirim_store ? 'Ubah' : '+ Atur'}
                                  </button>
                                )}
                              </div>
                              {order.tgl_jadwal_kirim_store ? (
                                <div className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                                  {new Date(order.tgl_jadwal_kirim_store).toLocaleDateString('id-ID', {
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </div>
                              ) : (
                                <span className="text-[11px] text-amber-600 dark:text-amber-400">
                                  Belum dijadwalkan
                                </span>
                              )}
                            </>
                          ) : (
                            <>
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500">
                                  No. Resi
                                </span>
                                {userIsAdmin && (
                                  <button
                                    type="button"
                                    onClick={() => onInputResi(order)}
                                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                  >
                                    {order.no_resi ? 'Ubah' : '+ Input'}
                                  </button>
                                )}
                              </div>
                              {order.no_resi ? (
                                <div className="flex items-center gap-1 font-mono text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                                  <span className="truncate" title={order.no_resi}>
                                    {order.no_resi}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => onCopyResi(order.no_pesanan || '', order.no_resi || '')}
                                    className="text-slate-400 hover:text-emerald-600 p-0.5 cursor-pointer shrink-0"
                                    title="Salin No. Resi"
                                  >
                                    {copiedResi === order.no_pesanan ? (
                                      <Check className="w-3 h-3 text-emerald-600" />
                                    ) : (
                                      <Copy className="w-3 h-3" />
                                    )}
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                                  Menunggu Resi
                                </span>
                              )}
                            </>
                          )}
                        </div>

                        {/* Row C: Print Progress Indicator (Admin/Gudang only) */}
                        {!isStoreUser && (
                          <div className="flex items-center gap-2 pt-1 text-[10px] font-semibold">
                            <span
                              className={
                                order.is_picking_printed
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }
                            >
                              Pick {order.is_picking_printed ? '✓' : '–'}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700">·</span>
                            <span
                              className={
                                order.is_label_printed
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-slate-400 dark:text-slate-500'
                              }
                            >
                              Label {order.is_label_printed ? '✓' : '–'}
                            </span>
                          </div>
                        )}
                      </div>
                    </td>

                    {/* Col 5: Aksi — Clean, predictable action cluster (max 1 solid primary + neutral secondary) */}
                    <td className="py-3.5 px-3 align-top text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          disabled={primaryAction.disabled}
                          onClick={primaryAction.onClick}
                          className={`h-8 px-2.5 rounded-lg text-[11px] font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap ${getPrimaryBtnClass(
                            primaryAction.variant
                          )}`}
                        >
                          {primaryAction.icon}
                          <span>{primaryAction.shortLabel}</span>
                        </button>
                        {!isStoreUser &&
                          userIsAdmin &&
                          order.status !== 'batal' &&
                          Boolean(hasPendingStoreFulfillment?.(order)) &&
                          !isOrderSentToWarehouse(order) &&
                          onReceiveAllStoreItems && (
                            <button
                              type="button"
                              onClick={() => onReceiveAllStoreItems(order)}
                              className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-300 hover:border-emerald-300 text-slate-700 dark:text-slate-200 text-[11px] font-bold inline-flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap"
                              title="Tandai seluruh item fulfillment store sudah diterima fisik di Gudang"
                            >
                              <PackageCheck className="w-3.5 h-3.5 shrink-0" />
                              <span>Terima</span>
                            </button>
                          )}
                        <button
                          type="button"
                          onClick={() => onOpenActionSheet(order)}
                          className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 inline-flex items-center justify-center transition-colors cursor-pointer shrink-0"
                          title="Semua aksi (Cetak, Resi, Chat, Edit, Batal)"
                          aria-label={`Menu aksi pesanan ${order.no_pesanan}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      </div>
                      {isOrderSentToWarehouse(order) && (
                        <div className="mt-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 flex items-center justify-end gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>Terkirim ke WH</span>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW MODE 2: KARTU (Native App Cards on Mobile + Clean Grid on Desktop)
  // =========================================================================
  if (filteredOrders.length === 0) {
    return renderEmptyState();
  }

  return (
    <div className="p-1.5 sm:p-4 bg-slate-50/70 dark:bg-slate-950/30">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5 sm:gap-4">
        {filteredOrders.map((order) => {
          const key = getOrderKey(order);
          const badgeInfo = getOrderStatusBadgeInfo(order);
          const totalPcs = (order.items || []).reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
          const { mktItems, sjList, missingCount } = getOrderMktSjMeta(order);
          const primaryAction = getPrimaryAction(order);
          const isSelected = selectedOrders.has(key);
          const pic = getValidPersonPicName(
            order.pic_store ||
              order.alteration_repair_data?.pic_pemohon ||
              order.alteration_repair_data?.pic_kirim_store,
            order.nama_pengirim,
            outlets
          );

          return (
            <div
              key={key}
              className={`bg-white dark:bg-slate-900 rounded-2xl border transition-colors flex flex-col overflow-hidden ${
                isSelected
                  ? 'border-indigo-400 dark:border-indigo-600 ring-1 ring-indigo-500/20'
                  : 'border-slate-200/90 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* 1. Card Header: Order ID + Date | Status */}
              <div className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {canAction && (
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelectOrder(key)}
                      className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => onOpenDetail(order)}
                      className="font-mono text-xs font-extrabold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer block truncate"
                    >
                      #{order.no_pesanan}
                    </button>
                    <span className="text-[10.5px] text-slate-400 dark:text-slate-500 tabular-nums">
                      {new Date(order.created_at || '').toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {isOrderIncomingFulfillment(order) && (
                    <span className="px-1.5 py-0.5 rounded-md bg-orange-50 dark:bg-orange-950/60 border border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300 text-[9.5px] font-bold">
                      Ambil Toko
                    </span>
                  )}
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md border ${badgeInfo.badgeClass}`}
                  >
                    {badgeInfo.label}
                  </span>
                </div>
              </div>

              {/* 2. Customer & Store Route (Clean unboxed hierarchy) */}
              <div
                onClick={() => onOpenDetail(order)}
                className="px-3.5 py-2.5 border-b border-slate-100 dark:border-slate-800 cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-[13px] font-bold text-slate-900 dark:text-white truncate">
                      {order.nama_tujuan || '-'}
                    </h3>
                    {order.no_telp_tujuan && (
                      <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                        {order.no_telp_tujuan}
                      </p>
                    )}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-md shrink-0 max-w-[130px] truncate">
                    <Truck className="w-3 h-3 text-slate-400 shrink-0" />
                    <span className="truncate">{order.jasa_kirim || '-'}</span>
                  </span>
                </div>

                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  <Store className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                    {order.nama_pengirim || '-'}
                  </span>
                  {pic && (
                    <>
                      <span>·</span>
                      <span className="truncate">PIC: {pic}</span>
                    </>
                  )}
                </div>
              </div>

              {/* 3. Product Items (Hairline separated, single surface) */}
              <div className="px-3.5 py-2.5 flex-1 divide-y divide-slate-100 dark:divide-slate-800">
                {(order.items || []).map((it, idx) => {
                  const { effectiveName, effectiveSize } = resolveItemDisplay(it);
                  const isStoreItem = isStoreFulfilledItem(order, it);
                  const isReceived = isStoreItemReceived(order, it);
                  const alterText =
                    it.alteration_detail ||
                    it.repair_detail ||
                    (hasValidArData(order.alteration_repair_data)
                      ? order.alteration_repair_data?.alteration_detail ||
                        order.alteration_repair_data?.repair_detail
                      : '');

                  return (
                    <div key={it.id || idx} className="py-2 first:pt-0 last:pb-0 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <span
                          className={`text-xs font-semibold leading-snug ${
                            it.item_status === 'sold_out'
                              ? 'line-through text-slate-400'
                              : 'text-slate-800 dark:text-slate-100'
                          }`}
                        >
                          {effectiveName}
                          {effectiveSize && effectiveSize !== 'ALL' && effectiveSize !== '-'
                            ? ` · ${effectiveSize}`
                            : ''}
                        </span>
                        <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200 shrink-0 tabular-nums">
                          ×{it.qty}
                        </span>
                      </div>

                      <div className="flex items-center justify-between gap-2 text-[10.5px]">
                        <div className="flex items-center gap-1.5 min-w-0 text-slate-500 dark:text-slate-400">
                          <span className="font-mono text-indigo-600/90 dark:text-indigo-400 truncate">
                            {it.sku}
                          </span>
                          <span>·</span>
                          <span className="truncate">
                            {it.fulfillment ||
                              (order.no_pesanan?.startsWith('AR-') ? 'Warehouse' : 'Marketplace')}
                          </span>
                        </div>

                        {it.item_status === 'sold_out' ? (
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="font-bold text-rose-600 dark:text-rose-400 inline-flex items-center gap-0.5">
                              <Ban className="w-3 h-3" />
                              <span>Sold</span>
                            </span>
                            {userIsAdmin && (
                              <button
                                type="button"
                                onClick={() => onRestoreSoldItem(order, it)}
                                className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                              >
                                Pulihkan
                              </button>
                            )}
                          </div>
                        ) : order.status !== 'batal' && isStoreItem ? (
                          isReceived ? (
                            <button
                              type="button"
                              onClick={() => {
                                if (userIsAdmin && !isOrderSelesai(order)) {
                                  onToggleStoreItemReceived(order, it, idx, false);
                                }
                              }}
                              className={`font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 shrink-0 ${
                                userIsAdmin && !isOrderSelesai(order) ? 'cursor-pointer hover:underline' : 'cursor-default'
                              }`}
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Diterima WH</span>
                            </button>
                          ) : userIsAdmin ? (
                            <button
                              type="button"
                              onClick={() => onToggleStoreItemReceived(order, it, idx, true)}
                              className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                            >
                              <PackageCheck className="w-3 h-3" />
                              <span>Terima WH</span>
                            </button>
                          ) : (
                            <span className="text-amber-600 dark:text-amber-400 shrink-0 inline-flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              <span>Menunggu WH</span>
                            </span>
                          )
                        ) : userIsAdmin && order.status !== 'batal' && !isOrderSelesai(order) ? (
                          <button
                            type="button"
                            onClick={() => onMarkItemSold(order, it)}
                            className="text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 inline-flex items-center gap-0.5 shrink-0 cursor-pointer"
                          >
                            <AlertOctagon className="w-3 h-3" />
                            <span>Sold</span>
                          </button>
                        ) : null}
                      </div>

                      {(isRealAlterItem(it) || alterText) && (
                        <div className="flex items-center gap-1 text-[10.5px] font-medium text-rose-600 dark:text-rose-400">
                          <Scissors className="w-3 h-3 shrink-0" />
                          <span className="truncate">{alterText || 'Perlu Alterasi'}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* 4. Compact 2-Column Document Strip (SJ DealPOS | Resi or Jadwal) */}
              <div className="grid grid-cols-2 divide-x divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 text-[11px]">
                {/* SJ DealPOS */}
                <div className="px-3 py-2 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className="text-[9.5px] uppercase tracking-wide font-semibold text-slate-400">
                      SJ DealPOS
                    </span>
                    {userIsAdmin && mktItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onInputSjDealpos(order, sjList[0] || '')}
                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        {sjList.length > 0 ? 'Edit' : '+ Input'}
                      </button>
                    )}
                  </div>
                  {mktItems.length === 0 ? (
                    <span className="text-slate-500 dark:text-slate-400 font-medium truncate block">
                      Dari Store
                    </span>
                  ) : sjList.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => onCopySj(sjList[0])}
                      className="flex items-center gap-1 font-mono font-bold text-emerald-700 dark:text-emerald-400 max-w-full cursor-pointer"
                      title="Ketuk untuk salin No. SJ"
                    >
                      <span className="truncate">{sjList[0]}</span>
                      {copiedSj === sjList[0] ? (
                        <Check className="w-3 h-3 shrink-0" />
                      ) : (
                        <Copy className="w-3 h-3 text-slate-400 shrink-0" />
                      )}
                    </button>
                  ) : (
                    <span className="text-amber-600 dark:text-amber-400 font-semibold">
                      Butuh SJ ({missingCount})
                    </span>
                  )}
                </div>

                {/* Resi / Jadwal Store */}
                <div className="px-3 py-2 min-w-0">
                  {isKirimKeStore(order) ? (
                    <>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9.5px] uppercase tracking-wide font-semibold text-slate-400">
                          Jadwal Store
                        </span>
                        {userIsAdmin && (
                          <button
                            type="button"
                            onClick={() => onOpenJadwal(order)}
                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            {order.tgl_jadwal_kirim_store ? 'Ubah' : '+ Atur'}
                          </button>
                        )}
                      </div>
                      {order.tgl_jadwal_kirim_store ? (
                        <span className="font-semibold text-emerald-700 dark:text-emerald-400 truncate block">
                          {new Date(order.tgl_jadwal_kirim_store).toLocaleDateString('id-ID', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-semibold">
                          Belum diatur
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[9.5px] uppercase tracking-wide font-semibold text-slate-400">
                          Resi · {totalPcs} pcs
                        </span>
                        {userIsAdmin && (
                          <button
                            type="button"
                            onClick={() => onInputResi(order)}
                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            {order.no_resi ? 'Ubah' : '+ Input'}
                          </button>
                        )}
                      </div>
                      {order.no_resi ? (
                        <button
                          type="button"
                          onClick={() => onCopyResi(order.no_pesanan || '', order.no_resi || '')}
                          className="flex items-center gap-1 font-mono font-bold text-emerald-700 dark:text-emerald-400 max-w-full cursor-pointer"
                          title="Ketuk untuk salin No. Resi"
                        >
                          <span className="truncate">{order.no_resi}</span>
                          {copiedResi === order.no_pesanan ? (
                            <Check className="w-3 h-3 shrink-0" />
                          ) : (
                            <Copy className="w-3 h-3 text-slate-400 shrink-0" />
                          )}
                        </button>
                      ) : (
                        <span className="text-slate-400 dark:text-slate-500">Menunggu Resi</span>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* Subtle print progress strip for Admin/Warehouse */}
              {!isStoreUser && (
                <div className="px-3.5 py-1.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[10.5px] text-slate-500 dark:text-slate-400">
                  <div className="flex items-center gap-3">
                    <span
                      className={
                        order.is_picking_printed
                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          : ''
                      }
                    >
                      Picking {order.is_picking_printed ? '✓' : 'Belum'}
                    </span>
                    <span
                      className={
                        order.is_label_printed
                          ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          : ''
                      }
                    >
                      Label A6 {order.is_label_printed ? '✓' : 'Belum'}
                    </span>
                  </div>
                  {isOrderSentToWarehouse(order) && (
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                      Kirim WH ✓
                    </span>
                  )}
                </div>
              )}

              {/* 5. Native App Footer: Primary CTA + Contextual Neutral Secondary + Aksi Sheet */}
              <div className="px-3 py-2.5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2">
                <button
                  type="button"
                  disabled={primaryAction.disabled}
                  onClick={primaryAction.onClick}
                  className={`flex-1 h-10 sm:h-9 px-3 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 ${getPrimaryBtnClass(
                    primaryAction.variant
                  )}`}
                >
                  {primaryAction.icon}
                  <span className="truncate">{primaryAction.label}</span>
                </button>
                {!isStoreUser &&
                  userIsAdmin &&
                  order.status !== 'batal' &&
                  Boolean(hasPendingStoreFulfillment?.(order)) &&
                  !isOrderSentToWarehouse(order) &&
                  onReceiveAllStoreItems && (
                    <button
                      type="button"
                      onClick={() => onReceiveAllStoreItems(order)}
                      className="h-10 sm:h-9 px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-300 hover:border-emerald-300 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0"
                      title="Tandai seluruh item fulfillment store sudah diterima fisik di Gudang"
                    >
                      <PackageCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Terima</span>
                    </button>
                  )}
                <button
                  type="button"
                  onClick={() => onOpenActionSheet(order)}
                  className="h-10 sm:h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 active:bg-slate-100 text-slate-700 dark:text-slate-200 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  aria-label={`Aksi lainnya untuk pesanan ${order.no_pesanan}`}
                >
                  <MoreHorizontal className="w-4 h-4" />
                  <span>Aksi</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
