import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Radio,
  Search,
  Filter,
  Plus,
  Edit2,
  Trash2,
  XCircle,
  Printer,
  RefreshCw,
  Settings,
  CheckCircle2,
  Clock,
  Truck,
  Package,
  Layers,
  ChevronDown,
  ArrowUpDown,
  FileSpreadsheet,
  AlertCircle,
  MapPin,
  CheckSquare,
  Square,
  Copy,
  ExternalLink,
  ShoppingBag,
  ListOrdered,
  X,
  Zap,
  Rocket
} from 'lucide-react';
import { UserSession, ProductItem } from '../../types';
import {
  IGLiveOrder,
  IGLiveItem,
  IGLiveOrderStatus,
  getStoredIgLiveOrders,
  saveStoredIgLiveOrders,
  getStoredIgLiveGasUrl,
  saveStoredIgLiveGasUrl,
  getStoredIgLiveSheetName,
  saveStoredIgLiveSheetName,
  DEFAULT_IG_LIVE_GAS_URL,
  DEFAULT_IG_LIVE_SHEET_NAME,
  fetchOrdersFromGas,
  lookupMasterProduct,
  postUpdateResiToGas,
  postBulkUpdateResiToGas,
  postUpdateStatusToGas,
  postUpdateCourierToGas,
  postEditOrderToGas,
  fetchIgLiveOrdersFromSupabase,
  generateUUID,
} from '../../services/igLiveService';
import { getFormalStoreBrandName } from '../../services/emailService';
import { hasPermission, isSuperadmin } from '../../services/permissions';
import { BulkUpdateResiIgLiveModal } from './BulkUpdateResiIgLiveModal';
import { ImportPesananIgLiveModal } from './ImportPesananIgLiveModal';
import QRCode from 'qrcode';

const QRCodeDisplay = ({ text }: { text: string }) => {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    QRCode.toDataURL(text, { width: 120, margin: 1 })
      .then(res => setUrl(res))
      .catch(err => console.error(err));
  }, [text]);
  if (!url) return <div className="w-16 h-16 bg-gray-100 flex items-center justify-center text-[8px] mx-auto border border-dashed border-gray-300">QR</div>;
  return <img src={url} alt="QR Code" className="w-16 h-16 mx-auto object-contain" />;
};

export type IGLiveWorkflowTab = 'baru' | 'diproses' | 'selesai' | 'picking' | 'semua' | 'batal';

interface IGLiveTabProps {
  session: UserSession | null;
  productCatalog: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const IGLiveTab: React.FC<IGLiveTabProps> = ({
  session,
  productCatalog,
  onShowToast,
}) => {
  // State Data
  const [orders, setOrders] = useState<IGLiveOrder[]>([]);
  const gasUrl = DEFAULT_IG_LIVE_GAS_URL;
  const sheetName = DEFAULT_IG_LIVE_SHEET_NAME;
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const userIsAdmin = isSuperadmin(session);

  // Filter & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [ekspedisiFilter, setEkspedisiFilter] = useState<string>('ALL');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);

  // Workflow Lifecycle Sub-Tabs: 'baru' | 'diproses' | 'selesai' | 'picking' | 'semua' | 'batal'
  const [activeWorkflowTab, setActiveWorkflowTab] = useState<IGLiveWorkflowTab>('baru');

  // Bulk Resi & Import Modal State
  const [isBulkUpdateResiModalOpen, setIsBulkUpdateResiModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  const saveAndSetOrders = (updatedOrders: IGLiveOrder[]) => {
    setOrders(updatedOrders);
    saveStoredIgLiveOrders(updatedOrders);
  };

  const [isAddEditModalOpen, setIsAddEditModalOpen] = useState<boolean>(false);
  const [editingOrder, setEditingOrder] = useState<IGLiveOrder | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState<boolean>(false);
  const [orderToDelete, setOrderToDelete] = useState<IGLiveOrder | null>(null);

  const [isCancelModalOpen, setIsCancelModalOpen] = useState<boolean>(false);
  const [orderToCancel, setOrderToCancel] = useState<IGLiveOrder | null>(null);
  const [cancelReason, setCancelReason] = useState<string>('');

  // Print Mode State ('labelA6' | 'pickingMassal' | null)
  const [printMode, setPrintMode] = useState<'labelA6' | 'pickingMassal' | null>(null);
  const [printOrders, setPrintOrders] = useState<IGLiveOrder[]>([]);
  const [printQrMap, setPrintQrMap] = useState<Record<string, string>>({});
  const [printTimestamp, setPrintTimestamp] = useState<number>(0);

  // Auto-trigger window.print saat payload cetak siap (QR sudah selesai di-generate)
  useEffect(() => {
    if (!printMode || printOrders.length === 0 || !printTimestamp) return;
    const timer = setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.warn('Window print direct error:', err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [printTimestamp, printMode, printOrders.length]);

  // Form State for Add / Edit
  const [formNoPesanan, setFormNoPesanan] = useState<string>('');
  const [formUsernameIg, setFormUsernameIg] = useState<string>('');
  const [formNamaPembeli, setFormNamaPembeli] = useState<string>('');
  const [formNoTelp, setFormNoTelp] = useState<string>('');
  const [formAlamat, setFormAlamat] = useState<string>('');
  const [formKota, setFormKota] = useState<string>('');
  const [formEkspedisi, setFormEkspedisi] = useState<string>('JNE');
  const [formLayanan, setFormLayanan] = useState<string>('REG');
  const [formNoResi, setFormNoResi] = useState<string>('');
  const [formStatus, setFormStatus] = useState<IGLiveOrderStatus>('siap_diproses');
  const [formCatatan, setFormCatatan] = useState<string>('');
  const [formItems, setFormItems] = useState<
    { sku: string; nama_produk: string; size: string; qty: number; lokasi: string; harga: number }[]
  >([]);

  // State Status Penulisan Resi ke Spreadsheet (GAS)
  const [resiSavingState, setResiSavingState] = useState<Record<string, 'saving' | 'saved' | 'error'>>({});
  const resiDebounceTimers = useRef<Record<string, NodeJS.Timeout>>({});

  // Helper Kurir & Layanan
  const getCourierKey = (ekspedisi?: string, layanan?: string) => {
    const e = (ekspedisi || '').toUpperCase();
    const l = (layanan || '').toUpperCase();
    if (l.includes('YES') || e.includes('YES')) return 'JNE_YES';
    if (e.includes('INSTAN') || l.includes('INSTAN') || e.includes('GOSEND') || e.includes('GRAB')) return 'INSTAN';
    if (e.includes('SAMEDAY') || l.includes('SAMEDAY')) return 'SAMEDAY';
    if (e.includes('J&T')) return 'JT';
    if (e.includes('SICEPAT')) return 'SICEPAT';
    return 'JNE_REG';
  };

  // Ubah Ekspedisi & Tulis Langsung ke Spreadsheet
  const handleUpdateCourier = async (orderId: string, courierKey: string) => {
    let newExp = 'JNE';
    let newLay = 'REG';
    if (courierKey === 'JNE_YES') {
      newExp = 'JNE';
      newLay = 'YES';
    } else if (courierKey === 'INSTAN') {
      newExp = 'Instan';
      newLay = 'Instant';
    } else if (courierKey === 'SAMEDAY') {
      newExp = 'Sameday';
      newLay = 'Sameday';
    } else if (courierKey === 'JT') {
      newExp = 'J&T Express';
      newLay = 'Reguler';
    } else if (courierKey === 'SICEPAT') {
      newExp = 'SiCepat';
      newLay = 'Reguler';
    } else {
      newExp = 'JNE';
      newLay = 'REG';
    }

    // 1. Update lokal
    const updated = orders.map((o) =>
      o.id === orderId
        ? { ...o, ekspedisi: newExp, layanan: newLay, updated_at: new Date().toISOString() }
        : o
    );
    saveAndSetOrders(updated);

    // 2. Tulis langsung ke Kolom AR Spreadsheet Google Sheets via GAS
    if (gasUrl) {
      try {
        const res = await postUpdateCourierToGas(gasUrl, orderId, newExp, newLay);
        if (res.success) {
          onShowToast(`Ekspedisi diubah ke ${newExp} ${newLay} & ditulis ke Kolom AR Spreadsheet!`, 'success');
        } else {
          onShowToast(`Ekspedisi lokal diperbarui (${res.message})`, 'info');
        }
      } catch (err: any) {
        console.warn('Gagal sync kurir ke GAS:', err);
      }
    }
  };

  // Simpan Resi Tunggal ke Kolom AQ Google Sheets Spreadsheet & Supabase
  const handleSaveSingleResi = async (
    orderId: string,
    rawResi: string,
    finalizeStatusToDikirim: boolean = true
  ) => {
    if (resiDebounceTimers.current[orderId]) {
      clearTimeout(resiDebounceTimers.current[orderId]);
      delete resiDebounceTimers.current[orderId];
    }

    const cleanResi = (rawResi || '').trim().toUpperCase();
    if (!cleanResi || cleanResi === '-') return;

    setResiSavingState((prev) => ({ ...prev, [orderId]: 'saving' }));

    let targetOrderNo = orderId;
    let gsheetStatus = 'Dikirim';
    let targetEkspedisi = 'JNE';
    let targetLayanan = 'REG';

    setOrders((prevOrders) => {
      const targetOrder = prevOrders.find((o) => o.id === orderId || o.no_pesanan === orderId);
      if (targetOrder?.no_pesanan) {
        targetOrderNo = targetOrder.no_pesanan;
      }
      if (targetOrder?.ekspedisi) {
        targetEkspedisi = targetOrder.ekspedisi;
      }
      if (targetOrder?.layanan) {
        targetLayanan = targetOrder.layanan;
      }
      const shouldSetDikirim =
        finalizeStatusToDikirim &&
        targetOrder &&
        (targetOrder.status === 'siap_diproses' || targetOrder.status === 'diproses');

      const nextStatus: IGLiveOrderStatus = shouldSetDikirim
        ? 'dikirim'
        : (targetOrder?.status || 'siap_diproses');

      gsheetStatus =
        nextStatus === 'dikirim' || finalizeStatusToDikirim
          ? 'Dikirim'
          : nextStatus === 'selesai'
          ? 'Selesai'
          : nextStatus === 'diproses'
          ? 'Diproses'
          : 'Siap Diproses';

      const updated = prevOrders.map((o) => {
        if (o.id === orderId || o.no_pesanan === orderId) {
          return {
            ...o,
            no_resi: cleanResi,
            status: nextStatus,
            updated_at: new Date().toISOString(),
          };
        }
        return o;
      });
      saveStoredIgLiveOrders(updated);
      return updated;
    });

    // Tulis ke Kolom AQ (Resi) & Kolom AR (Ekspedisi) di Spreadsheet via GAS Backend & Supabase
    if (gasUrl) {
      try {
        const res = await postUpdateResiToGas(
          gasUrl,
          targetOrderNo,
          cleanResi,
          gsheetStatus,
          targetEkspedisi,
          targetLayanan
        );
        if (res.success) {
          setResiSavingState((prev) => ({ ...prev, [orderId]: 'saved' }));
          if (finalizeStatusToDikirim) {
            onShowToast(`No. Resi ${cleanResi} berhasil ditulis ke Kolom AQ Sheet & Supabase!`, 'success');
          }
          setTimeout(() => {
            setResiSavingState((prev) => {
              const copy = { ...prev };
              delete copy[orderId];
              return copy;
            });
          }, 4000);
        } else {
          setResiSavingState((prev) => ({ ...prev, [orderId]: 'error' }));
          onShowToast(`Gagal menulis resi ke Spreadsheet: ${res.message}`, 'error');
        }
      } catch (err: any) {
        setResiSavingState((prev) => ({ ...prev, [orderId]: 'error' }));
        onShowToast(`Koneksi GAS gagal: ${err?.message || err}`, 'error');
      }
    }
  };

  // Tangani perubahan ketikan No Resi dengan debounce auto-save ke spreadsheet (tanpa menutup baris sebelum klik Simpan)
  const handleResiChange = (orderId: string, val: string) => {
    const upperVal = val.toUpperCase();
    setOrders((prevOrders) => {
      const updated = prevOrders.map((o) =>
        o.id === orderId ? { ...o, no_resi: upperVal, updated_at: new Date().toISOString() } : o
      );
      saveStoredIgLiveOrders(updated);
      return updated;
    });

    if (resiDebounceTimers.current[orderId]) {
      clearTimeout(resiDebounceTimers.current[orderId]);
    }

    if (upperVal.trim() && upperVal.trim() !== '-') {
      resiDebounceTimers.current[orderId] = setTimeout(() => {
        handleSaveSingleResi(orderId, upperVal, false);
      }, 900);
    }
  };

  const hasInitialFetchedRef = useRef<boolean>(false);

  // Load Initial Data from Supabase & Google Apps Script (GAS) Backend
  useEffect(() => {

    if (!hasInitialFetchedRef.current) {
      hasInitialFetchedRef.current = true;

      // Clean up old stale caches & force official GAS endpoint
      if (typeof window !== 'undefined') {
        try {
          localStorage.removeItem('chocochips_iglive_orders_v1');
          localStorage.removeItem('wms_iglive_rls_needed');
          localStorage.setItem('chocochips_iglive_gas_url_v1', DEFAULT_IG_LIVE_GAS_URL);
          localStorage.setItem('chocochips_iglive_sheet_name_v1', DEFAULT_IG_LIVE_SHEET_NAME);
        } catch {}
      }

      // 1. Tampilkan instan dari cache lokal / Supabase terlebih dahulu
      const local = getStoredIgLiveOrders(productCatalog);
      if (local && local.length > 0) {
        setOrders(local);
      } else {
        fetchIgLiveOrdersFromSupabase().then((sbOrders) => {
          if (sbOrders && sbOrders.length > 0) {
            setOrders((prev) => (prev.length === 0 ? sbOrders : prev));
          }
        });
      }

      // 2. Sinkronisasi dengan Google Sheets (GAS) + Auto-Heal resi ke Sheet
      setIsSyncing(true);
      fetchOrdersFromGas(DEFAULT_IG_LIVE_GAS_URL, productCatalog, DEFAULT_IG_LIVE_SHEET_NAME)
        .then((gasRes) => {
          setIsSyncing(false);
          if (gasRes.success && gasRes.orders && gasRes.orders.length > 0) {
            setOrders(gasRes.orders);
            saveStoredIgLiveOrders(gasRes.orders);
          }
        })
        .catch((err) => {
          setIsSyncing(false);
          console.warn('[IGLIVE] Error fetch dari GAS, fallback ke cache lokal:', err);
        });
    } else if (productCatalog && productCatalog.length > 0) {
      // Re-enrich item lokasi/nama/size saat katalog selesai dimuat tanpa menimpa input resi
      setOrders((prevOrders) =>
        prevOrders.map((o) => ({
          ...o,
          items: (o.items || []).map((it) => {
            const master = lookupMasterProduct(it.sku, productCatalog);
            return {
              ...it,
              sku: master.sku || it.sku,
              nama_produk: master.nama_produk || it.nama_produk,
              size: master.size !== '-' ? master.size : it.size,
              lokasi: master.lokasi !== '-' ? master.lokasi : it.lokasi,
              area: master.area,
              priority: master.priority,
            };
          }),
        }))
      );
    }
  }, [productCatalog]);

  // Sync / Refresh from GAS / Google Sheets
  const handleSyncGas = async () => {
    setIsSyncing(true);
    onShowToast('Menyinkronkan data pesanan dari Google Sheets...', 'info');

    const result = await fetchOrdersFromGas(DEFAULT_IG_LIVE_GAS_URL, productCatalog, DEFAULT_IG_LIVE_SHEET_NAME);
    setIsSyncing(false);

    if (result.success && result.orders) {
      setOrders(result.orders);
      saveStoredIgLiveOrders(result.orders);
      onShowToast(result.message || `Berhasil sinkronisasi ${result.orders.length} pesanan dari Google Sheets!`, 'success');
    } else {
      onShowToast(result.message || 'Gagal mengambil data pesanan dari Google Sheets', 'error');
    }
  };

  // Status Styling Helper
  const getStatusBadge = (status: IGLiveOrderStatus) => {
    switch (status) {
      case 'menunggu_pembayaran':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800 flex items-center gap-1">
            <Clock className="w-3 h-3" /> Unpaid / Bayar
          </span>
        );
      case 'siap_diproses':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1">
            <Package className="w-3 h-3" /> Siap Diproses
          </span>
        );
      case 'diproses':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 flex items-center gap-1">
            <Layers className="w-3 h-3" /> Sedang Dipacking
          </span>
        );
      case 'dikirim':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
            <Truck className="w-3 h-3" /> Telah Dikirim
          </span>
        );
      case 'selesai':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border border-teal-200 dark:border-teal-800 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Selesai
          </span>
        );
      case 'batal':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800 flex items-center gap-1">
            <XCircle className="w-3 h-3" /> Dibatalkan
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-800">
            {status}
          </span>
        );
    }
  };

  // Quick Status Updater
  const handleUpdateStatus = (orderId: string, newStatus: IGLiveOrderStatus) => {
    const updated = orders.map((o) => {
      if (o.id === orderId || o.no_pesanan === orderId) {
        return {
          ...o,
          status: newStatus,
          updated_at: new Date().toISOString(),
        };
      }
      return o;
    });
    saveAndSetOrders(updated);
    onShowToast(`Status pesanan diperbarui menjadi ${newStatus}`, 'success');

    // Sinkronkan balik ke GSheet Backend
    if (gasUrl) {
      const gsheetStatus =
        newStatus === 'diproses'
          ? 'Diproses'
          : newStatus === 'dikirim'
          ? 'Dikirim'
          : newStatus === 'selesai'
          ? 'Selesai'
          : newStatus === 'batal'
          ? 'Batal'
          : 'Siap Diproses';

      postUpdateStatusToGas(gasUrl, orderId, gsheetStatus).then((res) => {
        if (res.success) {
          console.log('[IGLIVE] Status tersinkron ke GSheet:', orderId, gsheetStatus);
        }
      });
    }
  };

  const handleBulkUpdateResiSuccess = (updates: { id: string; newResi: string }[]) => {
    const updated = orders.map((o) => {
      const update = updates.find((u) => u.id === o.id || u.id === o.no_pesanan);
      if (update) {
        return {
          ...o,
          no_resi: update.newResi,
          status: 'dikirim' as IGLiveOrderStatus,
          updated_at: new Date().toISOString(),
        };
      }
      return o;
    });
    saveAndSetOrders(updated);

    // Sinkronkan seluruh resi baru ke Kolom AQ Google Sheets Backend
    if (gasUrl && updates.length > 0) {
      const bulkPayload = updates.map((u) => {
        const matchedOrd = orders.find((o) => o.id === u.id || o.no_pesanan === u.id);
        return {
          order_id: matchedOrd?.no_pesanan || u.id,
          no_resi: u.newResi,
          status: 'Dikirim',
          ekspedisi: matchedOrd?.ekspedisi,
          layanan: matchedOrd?.layanan,
        };
      });
      postBulkUpdateResiToGas(gasUrl, bulkPayload).then((res) => {
        if (res.success) {
          onShowToast(`${updates.length} no. resi berhasil disinkronkan ke Kolom AQ Google Sheet!`, 'success');
        }
      });
    }
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingOrder(null);
    const newNo = `IGL-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}${String(new Date().getDate()).padStart(2, '0')}-${String(orders.length + 1).padStart(3, '0')}`;
    setFormNoPesanan(newNo);
    setFormUsernameIg('');
    setFormNamaPembeli('');
    setFormNoTelp('');
    setFormAlamat('');
    setFormKota('');
    setFormEkspedisi('JNE');
    setFormLayanan('REG');
    setFormNoResi('');
    setFormStatus('siap_diproses');
    setFormCatatan('');

    // Default item using master product lookup
    const defaultMaster = productCatalog && productCatalog.length > 0
      ? lookupMasterProduct(productCatalog[0].k, productCatalog)
      : { sku: 'DRS-VELVET-M', nama_produk: 'Velvet Evening Dress', size: 'M', lokasi: 'A012', harga: 250000 };

    setFormItems([
      {
        sku: defaultMaster.sku,
        nama_produk: defaultMaster.nama_produk,
        size: defaultMaster.size,
        qty: 1,
        lokasi: defaultMaster.lokasi,
        harga: defaultMaster.harga || 0,
      },
    ]);

    setIsAddEditModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (order: IGLiveOrder) => {
    setEditingOrder(order);
    setFormNoPesanan(order.no_pesanan);
    setFormUsernameIg(order.username_ig);
    setFormNamaPembeli(order.nama_pembeli);
    setFormNoTelp(order.no_telp);
    setFormAlamat(order.alamat_lengkap);
    setFormKota(order.kota_kabupaten || '');
    setFormEkspedisi(order.ekspedisi || 'JNE');
    setFormLayanan(order.layanan || 'REG');
    setFormNoResi(order.no_resi);
    setFormStatus(order.status);
    setFormCatatan(order.catatan || '');
    setFormItems(
      (order.items || []).map((it) => ({
        sku: it.sku,
        nama_produk: it.nama_produk,
        size: it.size,
        qty: it.qty,
        lokasi: it.lokasi || '-',
        harga: it.harga || 0,
      }))
    );
    setIsAddEditModalOpen(true);
  };

  // Handle SKU input change in Add/Edit modal (Strict Master Catalog Lookup)
  const handleItemSkuChange = (idx: number, inputSku: string) => {
    const updated = [...formItems];
    const master = lookupMasterProduct(inputSku, productCatalog);
    updated[idx] = {
      ...updated[idx],
      sku: inputSku,
      nama_produk: master.nama_produk,
      size: master.size,
      lokasi: master.lokasi,
      harga: master.harga || updated[idx].harga || 0,
    };
    setFormItems(updated);
  };

  // Save Add/Edit Order
  const handleSaveOrder = () => {
    if (!formNoPesanan.trim() || !formNamaPembeli.trim()) {
      onShowToast('Nomor pesanan dan nama pembeli wajib diisi', 'error');
      return;
    }

    if (formItems.length === 0) {
      onShowToast('Pesanan harus memiliki minimal 1 produk', 'error');
      return;
    }

    const cleanedItems: IGLiveItem[] = formItems.map((it) => {
      const master = lookupMasterProduct(it.sku, productCatalog);
      return {
        sku: it.sku.trim().toUpperCase(),
        nama_produk: master.nama_produk || it.nama_produk,
        size: master.size !== '-' ? master.size : it.size,
        qty: Number(it.qty) || 1,
        harga: Number(it.harga) || 0,
        lokasi: master.lokasi !== '-' ? master.lokasi : it.lokasi,
        area: master.area,
        priority: master.priority,
        picked: false,
      };
    });

    if (editingOrder) {
      // Update
      const updated = orders.map((o) => {
        if (o.id === editingOrder.id) {
          return {
            ...o,
            no_pesanan: formNoPesanan.trim(),
            username_ig: formUsernameIg.trim(),
            nama_pembeli: formNamaPembeli.trim(),
            no_telp: formNoTelp.trim(),
            alamat_lengkap: formAlamat.trim(),
            kota_kabupaten: formKota.trim(),
            ekspedisi: formEkspedisi,
            layanan: formLayanan,
            no_resi: formNoResi.trim() || '-',
            status: formStatus,
            catatan: formCatatan.trim(),
            items: cleanedItems,
            updated_at: new Date().toISOString(),
          };
        }
        return o;
      });
      saveAndSetOrders(updated);
      onShowToast('Pesanan berhasil diperbarui', 'success');

      if (gasUrl) {
        postEditOrderToGas(gasUrl, {
          order_id: formNoPesanan.trim(),
          nama_pembeli: formNamaPembeli.trim(),
          no_telp: formNoTelp.trim(),
          alamat_lengkap: formAlamat.trim(),
          catatan: formCatatan.trim(),
          no_resi: formNoResi.trim() || '-',
          ekspedisi: formEkspedisi,
          layanan: formLayanan,
        });
        if (formEkspedisi) {
          postUpdateCourierToGas(gasUrl, formNoPesanan.trim(), formEkspedisi, formLayanan);
        }
        if (formNoResi.trim() && formNoResi.trim() !== '-') {
          postUpdateResiToGas(gasUrl, formNoPesanan.trim(), formNoResi.trim(), 'Dikirim');
        }
      }
    } else {
      // Create New
      const newOrder: IGLiveOrder = {
        id: generateUUID(),
        no_pesanan: formNoPesanan.trim(),
        tanggal: new Date().toISOString().substring(0, 19).replace('T', ' '),
        session_live: 'Live Flash Session',
        username_ig: formUsernameIg.trim() || '@customer',
        nama_pembeli: formNamaPembeli.trim(),
        no_telp: formNoTelp.trim(),
        alamat_lengkap: formAlamat.trim(),
        kota_kabupaten: formKota.trim(),
        ekspedisi: formEkspedisi,
        layanan: formLayanan,
        no_resi: formNoResi.trim() || '-',
        status: formStatus,
        catatan: formCatatan.trim(),
        items: cleanedItems,
        created_at: new Date().toISOString(),
      };
      const updated = [newOrder, ...orders];
      saveAndSetOrders(updated);
      onShowToast('Pesanan baru berhasil ditambahkan', 'success');
    }

    setIsAddEditModalOpen(false);
  };

  const handleBatchUpdateResi = (updates: { id: string; newResi: string }[]) => {
    const updated = orders.map((o) => {
      const match = updates.find((u) => u.id === o.id);
      if (match) {
        return { ...o, no_resi: match.newResi };
      }
      return o;
    });
    saveAndSetOrders(updated);
  };

  const handleImportOrders = (newOrders: IGLiveOrder[]) => {
    const combined = [...newOrders, ...orders];
    saveAndSetOrders(combined);
  };

  // Delete Order
  const handleConfirmDelete = () => {
    if (!orderToDelete) return;
    const updated = orders.filter((o) => o.id !== orderToDelete.id);
    saveAndSetOrders(updated);
    setSelectedOrderIds((prev) => prev.filter((id) => id !== orderToDelete.id));
    setIsDeleteModalOpen(false);
    setOrderToDelete(null);
    onShowToast(`Pesanan ${orderToDelete.no_pesanan} berhasil dihapus`, 'success');
  };

  // Cancel Order
  const handleConfirmCancel = () => {
    if (!orderToCancel) return;
    const reasonText = cancelReason.trim() || 'Dibatalkan oleh admin';
    const targetOrderNo = orderToCancel.no_pesanan || orderToCancel.id;
    const updated = orders.map((o) => {
      if (o.id === orderToCancel.id) {
        return {
          ...o,
          status: 'batal' as IGLiveOrderStatus,
          alasan_batal: reasonText,
          updated_at: new Date().toISOString(),
        };
      }
      return o;
    });
    saveAndSetOrders(updated);
    if (gasUrl) {
      postUpdateStatusToGas(gasUrl, targetOrderNo, 'Batal', reasonText);
    }
    setIsCancelModalOpen(false);
    setOrderToCancel(null);
    setCancelReason('');
    onShowToast(`Pesanan ${orderToCancel.no_pesanan} telah dibatalkan`, 'info');
  };

  // Bulk Selection
  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAll = (filteredList: IGLiveOrder[]) => {
    if (selectedOrderIds.length === filteredList.length) {
      setSelectedOrderIds([]);
    } else {
      setSelectedOrderIds(filteredList.map((o) => o.id));
    }
  };

  // Filtered Orders Memo
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      // 1. Workflow Tab Lifecycle Filter
      if (activeWorkflowTab === 'baru') {
        if (o.status !== 'siap_diproses' && o.status !== 'menunggu_pembayaran') return false;
      } else if (activeWorkflowTab === 'diproses') {
        if (o.status !== 'diproses') return false;
      } else if (activeWorkflowTab === 'selesai') {
        if (o.status !== 'dikirim' && o.status !== 'selesai') return false;
      } else if (activeWorkflowTab === 'batal') {
        if (o.status !== 'batal') return false;
      }

      // 2. Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNo = o.no_pesanan.toLowerCase().includes(q);
        const matchName = o.nama_pembeli.toLowerCase().includes(q);
        const matchIg = o.username_ig.toLowerCase().includes(q);
        const matchResi = (o.no_resi || '').toLowerCase().includes(q);
        const matchItem = (o.items || []).some(
          (it) => it.sku.toLowerCase().includes(q) || it.nama_produk.toLowerCase().includes(q)
        );
        if (!matchNo && !matchName && !matchIg && !matchResi && !matchItem) return false;
      }

      // 3. Status Filter Dropdown
      if (statusFilter !== 'ALL' && o.status !== statusFilter) {
        return false;
      }

      // 4. Ekspedisi Filter
      if (ekspedisiFilter !== 'ALL') {
        const curKey = getCourierKey(o.ekspedisi, o.layanan);
        if (ekspedisiFilter === 'JNE') {
          if (!o.ekspedisi.toLowerCase().includes('jne')) return false;
        } else if (ekspedisiFilter === 'JNE_REG') {
          if (curKey !== 'JNE_REG') return false;
        } else if (ekspedisiFilter === 'JNE_YES') {
          if (curKey !== 'JNE_YES') return false;
        } else if (ekspedisiFilter === 'INSTAN') {
          if (curKey !== 'INSTAN') return false;
        } else if (ekspedisiFilter === 'SAMEDAY') {
          if (curKey !== 'SAMEDAY') return false;
        } else if (!o.ekspedisi.toLowerCase().includes(ekspedisiFilter.toLowerCase())) {
          return false;
        }
      }

      return true;
    });
  }, [orders, activeWorkflowTab, searchQuery, statusFilter, ekspedisiFilter]);

  // Statistics Counters
  const stats = useMemo(() => {
    const total = orders.length;
    const siap = orders.filter((o) => o.status === 'siap_diproses').length;
    const diproses = orders.filter((o) => o.status === 'diproses').length;
    const dikirim = orders.filter((o) => o.status === 'dikirim').length;
    const selesai = orders.filter((o) => o.status === 'selesai').length;
    const batal = orders.filter((o) => o.status === 'batal').length;
    const totalQty = orders.reduce(
      (acc, o) => acc + (o.items || []).reduce((q, it) => q + (it.qty || 1), 0),
      0
    );
    return { total, siap, diproses, dikirim, selesai, batal, totalQty };
  }, [orders]);

  // Picking Aggregation Memo based on WMS Blueprint Prioritization
  const pickingItemsGrouped = useMemo(() => {
    // Target orders: if some are selected, pick those; else pick all in ready/processing
    const targetOrders = selectedOrderIds.length > 0
      ? orders.filter((o) => selectedOrderIds.includes(o.id))
      : orders.filter((o) => o.status === 'siap_diproses' || o.status === 'diproses');

    // Aggregate items by SKU & Location
    const map = new Map<string, {
      sku: string;
      nama_produk: string;
      size: string;
      lokasi: string;
      area: string;
      priority: number;
      totalQty: number;
      orders: { no_pesanan: string; pembeli: string; qty: number }[];
      isPicked: boolean;
    }>();

    targetOrders.forEach((o) => {
      (o.items || []).forEach((it) => {
        const master = lookupMasterProduct(it.sku, productCatalog);
        const loc = master.lokasi || it.lokasi || '-';
        const key = `${it.sku}_${loc}`;

        if (!map.has(key)) {
          map.set(key, {
            sku: it.sku,
            nama_produk: master.nama_produk || it.nama_produk,
            size: master.size !== '-' ? master.size : it.size,
            lokasi: loc,
            area: master.area,
            priority: master.priority,
            totalQty: 0,
            orders: [],
            isPicked: false,
          });
        }

        const entry = map.get(key)!;
        entry.totalQty += it.qty || 1;
        entry.orders.push({
          no_pesanan: o.no_pesanan,
          pembeli: o.nama_pembeli,
          qty: it.qty || 1,
        });
      });
    });

    const list = Array.from(map.values());

    // Sort strictly by Picking Priority (Rule 7) then by location alphanumeric
    list.sort((a, b) => {
      if (a.priority !== b.priority) {
        return a.priority - b.priority;
      }
      return a.lokasi.localeCompare(b.lokasi, undefined, { numeric: true, sensitivity: 'base' });
    });

    return { targetOrders, pickingList: list };
  }, [orders, selectedOrderIds, productCatalog]);

  // State to track picked checklist in UI
  const [pickedSkuKeys, setPickedSkuKeys] = useState<Record<string, boolean>>({});

  const togglePickSku = (skuKey: string) => {
    setPickedSkuKeys((prev) => ({
      ...prev,
      [skuKey]: !prev[skuKey],
    }));
  };

  // Mark all target orders as picked
  const handleCompletePicking = () => {
    const targetIds = pickingItemsGrouped.targetOrders.map((o) => o.id);
    const updated = orders.map((o) => {
      if (targetIds.includes(o.id)) {
        return {
          ...o,
          status: 'diproses' as IGLiveOrderStatus, // Move to packing ready
          is_picked: true,
          waktu_picking: new Date().toISOString().substring(0, 19).replace('T', ' '),
          petugas_picking: session?.name || 'Petugas Gudang',
        };
      }
      return o;
    });

    saveAndSetOrders(updated);
    onShowToast(`Berhasil menandai ${targetIds.length} pesanan selesai picking! Status diubah menjadi Sedang Dipacking`, 'success');

    if (gasUrl) {
      pickingItemsGrouped.targetOrders.forEach((o) => {
        postUpdateStatusToGas(gasUrl, o.no_pesanan, 'Diproses');
      });
    }
  };

  // Print Handlers (Pre-generate QR codes before triggering print dialog)
  const prepareAndPrintLabelA6 = async (targetOrders: IGLiveOrder[]) => {
    if (targetOrders.length === 0) {
      onShowToast('Tidak ada pesanan untuk dicetak label', 'warning');
      return;
    }

    const qrMap: Record<string, string> = {};
    await Promise.all(
      targetOrders.map(async (ord) => {
        const key = ord.no_pesanan || ord.id;
        if (!key) return;
        try {
          qrMap[key] = await QRCode.toDataURL(ord.no_pesanan || ord.id, {
            width: 150,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
          });
        } catch (err) {
          console.warn('QR generation error:', err);
        }
      })
    );

    setPrintQrMap(qrMap);
    setPrintOrders(targetOrders);
    setPrintMode('labelA6');
    setPrintTimestamp(Date.now());
    onShowToast(`Menyiapkan cetak Label A6 (${targetOrders.length} paket)...`, 'info');
  };

  const handlePrintSingleLabelA6 = (order: IGLiveOrder) => {
    prepareAndPrintLabelA6([order]);
  };

  const handlePrintBatchLabelA6 = () => {
    const target = selectedOrderIds.length > 0
      ? orders.filter((o) => selectedOrderIds.includes(o.id))
      : filteredOrders;

    prepareAndPrintLabelA6(target);
  };

  const handlePrintMassalPicking = () => {
    const target = pickingItemsGrouped.targetOrders;
    if (target.length === 0) {
      onShowToast('Tidak ada pesanan dalam antrean picking untuk dicetak', 'warning');
      return;
    }

    setPrintOrders(target);
    setPrintMode('pickingMassal');
    setPrintTimestamp(Date.now());
    onShowToast(`Menyiapkan cetak Picking List (${target.length} pesanan)...`, 'info');
  };

  return (
    <div className="space-y-4">
      <div className="space-y-4 print:hidden">
      {/* Stats Summary Cards (Interactive quick filters) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <button
          type="button"
          onClick={() => setActiveWorkflowTab('semua')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            activeWorkflowTab === 'semua'
              ? 'ring-2 ring-slate-800 bg-slate-100 dark:bg-slate-800 border-slate-400'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="text-[11px] font-bold text-slate-500 uppercase">Total Pesanan</div>
          <div className="text-xl font-black text-slate-900 dark:text-white mt-1">{stats.total}</div>
          <div className="text-[10px] text-slate-400 mt-0.5">{stats.totalQty} total pcs</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkflowTab('baru')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            activeWorkflowTab === 'baru'
              ? 'ring-2 ring-blue-600 bg-blue-100/70 dark:bg-blue-900/50 border-blue-400'
              : 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900 hover:border-blue-300'
          }`}
        >
          <div className="text-[11px] font-bold text-blue-700 dark:text-blue-400 uppercase">Pesanan Baru</div>
          <div className="text-xl font-black text-blue-900 dark:text-blue-200 mt-1">{stats.siap}</div>
          <div className="text-[10px] text-blue-600/80 mt-0.5">Siap diproses</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkflowTab('diproses')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            activeWorkflowTab === 'diproses'
              ? 'ring-2 ring-indigo-600 bg-indigo-100/70 dark:bg-indigo-900/50 border-indigo-400'
              : 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-900 hover:border-indigo-300'
          }`}
        >
          <div className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400 uppercase">Sedang Diproses</div>
          <div className="text-xl font-black text-indigo-900 dark:text-indigo-200 mt-1">{stats.diproses}</div>
          <div className="text-[10px] text-indigo-600/80 mt-0.5">Sedang dipacking</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkflowTab('selesai')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            activeWorkflowTab === 'selesai'
              ? 'ring-2 ring-emerald-600 bg-emerald-100/70 dark:bg-emerald-900/50 border-emerald-400'
              : 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 hover:border-emerald-300'
          }`}
        >
          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 uppercase">Selesai / Dikirim</div>
          <div className="text-xl font-black text-emerald-900 dark:text-emerald-200 mt-1">{stats.dikirim + stats.selesai}</div>
          <div className="text-[10px] text-emerald-600/80 mt-0.5">{stats.dikirim} kirim &bull; {stats.selesai} selesai</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkflowTab('picking')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            activeWorkflowTab === 'picking'
              ? 'ring-2 ring-pink-600 bg-pink-100/70 dark:bg-pink-900/50 border-pink-400'
              : 'bg-pink-50/70 dark:bg-pink-950/30 border-pink-200 dark:border-pink-900 hover:border-pink-300'
          }`}
        >
          <div className="text-[11px] font-bold text-pink-700 dark:text-pink-400 uppercase">Picking List</div>
          <div className="text-xl font-black text-pink-900 dark:text-pink-200 mt-1">{pickingItemsGrouped.targetOrders.length}</div>
          <div className="text-[10px] text-pink-600/80 mt-0.5">{pickingItemsGrouped.pickingList.length} SKU master rak</div>
        </button>

        <button
          type="button"
          onClick={() => setActiveWorkflowTab('batal')}
          className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
            activeWorkflowTab === 'batal'
              ? 'ring-2 ring-rose-600 bg-rose-100/70 dark:bg-rose-900/50 border-rose-400'
              : 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 hover:border-rose-300'
          }`}
        >
          <div className="text-[11px] font-bold text-rose-700 dark:text-rose-400 uppercase">Batal / Unpaid</div>
          <div className="text-xl font-black text-rose-900 dark:text-rose-200 mt-1">{stats.batal}</div>
          <div className="text-[10px] text-rose-600/80 mt-0.5">{stats.batal} dibatalkan</div>
        </button>
      </div>

      {/* Main Workflow Lifecycle Sub-Tabs */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex-wrap gap-2">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {/* Tab 1: Pesanan Baru */}
          <button
            type="button"
            onClick={() => setActiveWorkflowTab('baru')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              activeWorkflowTab === 'baru'
                ? 'bg-blue-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Package className="w-4 h-4" />
            <span>Pesanan Baru</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeWorkflowTab === 'baru'
                  ? 'bg-white/20 text-white'
                  : 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200'
              }`}
            >
              {stats.siap}
            </span>
          </button>

          {/* Tab 2: Sedang Diproses */}
          <button
            type="button"
            onClick={() => setActiveWorkflowTab('diproses')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              activeWorkflowTab === 'diproses'
                ? 'bg-indigo-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>Sedang Diproses</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeWorkflowTab === 'diproses'
                  ? 'bg-white/20 text-white'
                  : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200'
              }`}
            >
              {stats.diproses}
            </span>
          </button>

          {/* Tab 3: Selesai / Dikirim */}
          <button
            type="button"
            onClick={() => setActiveWorkflowTab('selesai')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              activeWorkflowTab === 'selesai'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Truck className="w-4 h-4" />
            <span>Pesanan Selesai</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeWorkflowTab === 'selesai'
                  ? 'bg-white/20 text-white'
                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
              }`}
            >
              {stats.dikirim + stats.selesai}
            </span>
          </button>

          {/* Tab 4: Picking List Gudang */}
          <button
            type="button"
            onClick={() => setActiveWorkflowTab('picking')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              activeWorkflowTab === 'picking'
                ? 'bg-pink-600 text-white shadow-md'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ListOrdered className="w-4 h-4" />
            <span>Fitur Picking List</span>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-black ${
                activeWorkflowTab === 'picking'
                  ? 'bg-white/20 text-white'
                  : 'bg-pink-100 text-pink-800 dark:bg-pink-900/60 dark:text-pink-200'
              }`}
            >
              {pickingItemsGrouped.targetOrders.length}
            </span>
          </button>

          {/* Tab 5: Semua Pesanan */}
          <button
            type="button"
            onClick={() => setActiveWorkflowTab('semua')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
              activeWorkflowTab === 'semua'
                ? 'bg-slate-800 text-white shadow-md dark:bg-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Semua ({stats.total})</span>
          </button>

          {/* Tab 6: Batal */}
          {stats.batal > 0 && (
            <button
              type="button"
              onClick={() => setActiveWorkflowTab('batal')}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                activeWorkflowTab === 'batal'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <XCircle className="w-4 h-4" />
              <span>Batal ({stats.batal})</span>
            </button>
          )}
        </div>

        {/* Global Action per Mode */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleSyncGas}
            disabled={isSyncing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 text-pink-700 dark:text-pink-400 border border-pink-200 dark:border-pink-800/80 hover:bg-pink-50 dark:hover:bg-pink-950/40 active:scale-95 text-xs font-bold rounded-xl shadow-2xs transition-all cursor-pointer"
            title="Sinkronkan data dengan Google Sheets (GAS Live)"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Menyinkronkan...' : 'Sinkronkan GAS'}</span>
          </button>

          {activeWorkflowTab !== 'picking' ? (
            <>
              <button
                type="button"
                onClick={handleOpenAddModal}
                className="flex items-center gap-1 px-3 py-1.5 bg-pink-600 hover:bg-pink-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Pesanan</span>
              </button>

              <button
                type="button"
                onClick={() => setIsImportModalOpen(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Import GSheet</span>
              </button>

              {userIsAdmin && (
                <button
                  type="button"
                  onClick={() => setIsBulkUpdateResiModalOpen(true)}
                  className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Update Resi Massal</span>
                </button>
              )}

              <button
                type="button"
                onClick={handlePrintBatchLabelA6}
                className="flex items-center gap-1 px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Label A6 {selectedOrderIds.length > 0 ? `(${selectedOrderIds.length})` : 'Massal'}</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleCompletePicking}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Tandai Selesai Picking</span>
              </button>

              <button
                type="button"
                onClick={handlePrintMassalPicking}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Cetak Picking List Massal</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* VIEW MODE 1: DAFTAR PESANAN BERDASARKAN WORKFLOW STATUS */}
      {activeWorkflowTab !== 'picking' && (
        <div className="space-y-3">
          {/* Filter Toolbar */}
          <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 w-full md:w-auto flex-1">
              <div className="relative w-full max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Cari no pesanan, IG, pembeli, resi, SKU..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-pink-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Status Filter Dropdown */}
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="py-1.5 px-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-bold focus:outline-hidden"
              >
                <option value="ALL">Semua Status</option>
                <option value="siap_diproses">Siap Diproses</option>
                <option value="diproses">Sedang Dipacking</option>
                <option value="dikirim">Telah Dikirim</option>
                <option value="menunggu_pembayaran">Menunggu Pembayaran</option>
                <option value="selesai">Selesai</option>
                <option value="batal">Dibatalkan</option>
              </select>

              {/* Ekspedisi Filter */}
              <select
                value={ekspedisiFilter}
                onChange={(e) => setEkspedisiFilter(e.target.value)}
                className="py-1.5 px-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 font-bold focus:outline-hidden"
              >
                <option value="ALL">Semua Kurir</option>
                <option value="JNE">JNE (Semua Layanan)</option>
                <option value="JNE_REG">JNE - REG (Default)</option>
                <option value="JNE_YES">JNE - YES</option>
                <option value="INSTAN">Instan</option>
                <option value="SAMEDAY">Sameday</option>
                <option value="J&T">J&T Express</option>
                <option value="SiCepat">SiCepat</option>
              </select>
            </div>

            {/* Quick Status Batch Updater if any selected */}
            {selectedOrderIds.length > 0 && (
              <div className="flex items-center gap-2 bg-pink-50 dark:bg-pink-950/40 px-3 py-1.5 rounded-lg border border-pink-200 dark:border-pink-800/60">
                <span className="text-xs font-bold text-pink-700 dark:text-pink-300">
                  {selectedOrderIds.length} Terpilih:
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const updated = orders.map((o) =>
                      selectedOrderIds.includes(o.id) ? { ...o, status: 'diproses' as IGLiveOrderStatus } : o
                    );
                    saveAndSetOrders(updated);
                    if (gasUrl) {
                      orders
                        .filter((o) => selectedOrderIds.includes(o.id))
                        .forEach((o) => postUpdateStatusToGas(gasUrl, o.no_pesanan || o.id, 'Diproses'));
                    }
                    onShowToast(`${selectedOrderIds.length} pesanan diubah ke Sedang Dipacking`, 'success');
                  }}
                  className="px-2 py-1 text-[11px] font-bold bg-white text-indigo-700 rounded border border-indigo-200 shadow-2xs hover:bg-indigo-50"
                >
                  Set Dipacking
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const updated = orders.map((o) =>
                      selectedOrderIds.includes(o.id) ? { ...o, status: 'dikirim' as IGLiveOrderStatus } : o
                    );
                    saveAndSetOrders(updated);
                    if (gasUrl) {
                      orders
                        .filter((o) => selectedOrderIds.includes(o.id))
                        .forEach((o) => postUpdateStatusToGas(gasUrl, o.no_pesanan || o.id, 'Dikirim'));
                    }
                    onShowToast(`${selectedOrderIds.length} pesanan diubah ke Dikirim`, 'success');
                  }}
                  className="px-2 py-1 text-[11px] font-bold bg-white text-emerald-700 rounded border border-emerald-200 shadow-2xs hover:bg-emerald-50"
                >
                  Set Dikirim
                </button>
              </div>
            )}
          </div>

          {/* Orders Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 uppercase tracking-wider font-bold">
                    <th className="p-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={
                          filteredOrders.length > 0 &&
                          selectedOrderIds.length === filteredOrders.length
                        }
                        onChange={() => handleSelectAll(filteredOrders)}
                        className="rounded border-slate-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
                      />
                    </th>
                    <th className="p-3">No. Pesanan & IG</th>
                    <th className="p-3">Penerima & Alamat</th>
                    <th className="p-3">Rincian Item (SKU / Master Lokasi)</th>
                    <th className="p-3">Ekspedisi / Resi</th>
                    <th className="p-3 text-center">Status</th>
                    <th className="p-3 text-center w-36">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        Tidak ada pesanan yang sesuai dengan filter atau kata kunci.
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order) => {
                      const isSelected = selectedOrderIds.includes(order.id);
                      return (
                        <tr
                          key={order.id}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                            isSelected ? 'bg-pink-50/40 dark:bg-pink-950/20' : ''
                          }`}
                        >
                          <td className="p-3 text-center align-top">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSelectOrder(order.id)}
                              className="rounded border-slate-300 text-pink-600 focus:ring-pink-500 cursor-pointer"
                            />
                          </td>
                          <td className="p-3 align-top">
                            <div className="font-mono font-bold text-slate-900 dark:text-white">
                              {order.no_pesanan}
                            </div>
                            <div className="font-bold text-pink-600 dark:text-pink-400 text-[11px] mt-0.5">
                              {order.username_ig}
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              {order.tanggal}
                            </div>
                            {order.catatan && (
                              <div className="mt-1.5 p-1 px-1.5 rounded bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-300 text-[10px] leading-tight">
                                💬 {order.catatan}
                              </div>
                            )}
                          </td>
                          <td className="p-3 align-top">
                            <div className="font-bold text-slate-800 dark:text-slate-100">
                              {order.nama_pembeli}
                            </div>
                            <div className="text-slate-500 font-mono text-[11px]">
                              {order.no_telp || '-'}
                            </div>
                            <div className="text-[11px] text-slate-600 dark:text-slate-400 max-w-xs mt-0.5 line-clamp-2">
                              {order.alamat_lengkap}
                            </div>
                            {order.kota_kabupaten && (
                              <div className="text-[10px] text-slate-400 mt-0.5">
                                📍 {order.kota_kabupaten}
                              </div>
                            )}
                          </td>
                          <td className="p-3 align-top">
                            <div className="space-y-1">
                              {(order.items || []).map((it, itIdx) => (
                                <div
                                  key={itIdx}
                                  className="flex items-center justify-between gap-2 p-1 px-1.5 bg-slate-50 dark:bg-slate-800/80 rounded border border-slate-200/80 dark:border-slate-700/80 text-[11px]"
                                >
                                  <div>
                                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                                      {it.sku}
                                    </span>
                                    <span className="text-slate-400 mx-1">•</span>
                                    <span className="text-slate-700 dark:text-slate-300">
                                      {it.nama_produk}
                                    </span>
                                    <span className="ml-1 text-[10px] bg-slate-200 dark:bg-slate-700 px-1 py-0.2 rounded font-bold">
                                      {it.size}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <span className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1 py-0.2 rounded">
                                      {it.lokasi || '-'}
                                    </span>
                                    <span className="font-extrabold text-slate-900 dark:text-white">
                                      x{it.qty}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                          <td className="p-3 align-top min-w-[210px]">
                            {/* Ekspedisi Selector & Visual Badge */}
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={getCourierKey(order.ekspedisi, order.layanan)}
                                  onChange={(e) => handleUpdateCourier(order.id, e.target.value)}
                                  className="w-full text-xs font-bold py-1 px-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-100 cursor-pointer focus:ring-1 focus:ring-pink-500 shadow-2xs"
                                >
                                  <option value="JNE_REG">📦 JNE - REG (Default)</option>
                                  <option value="JNE_YES">⚡ JNE - YES (Esok Sampai)</option>
                                  <option value="INSTAN">🚀 Instan (GoSend / Grab)</option>
                                  <option value="SAMEDAY">⏱️ Sameday (Anteraja / Grab)</option>
                                  <option value="JT">🚚 J&T Express</option>
                                  <option value="SICEPAT">🐆 SiCepat</option>
                                </select>
                              </div>
                              <div className="flex items-center gap-1">
                                {getCourierKey(order.ekspedisi, order.layanan) === 'JNE_REG' && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                    <Truck className="w-2.5 h-2.5" /> JNE REG (Default)
                                  </span>
                                )}
                                {getCourierKey(order.ekspedisi, order.layanan) === 'JNE_YES' && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                    <Zap className="w-2.5 h-2.5 text-amber-600 fill-amber-500" /> JNE YES (Esok Sampai)
                                  </span>
                                )}
                                {getCourierKey(order.ekspedisi, order.layanan) === 'INSTAN' && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    <Rocket className="w-2.5 h-2.5 text-emerald-600" /> Instan
                                  </span>
                                )}
                                {getCourierKey(order.ekspedisi, order.layanan) === 'SAMEDAY' && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                    <Clock className="w-2.5 h-2.5 text-purple-600" /> Sameday
                                  </span>
                                )}
                                {getCourierKey(order.ekspedisi, order.layanan) === 'JT' && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 dark:bg-red-950/60 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800">
                                    <Truck className="w-2.5 h-2.5" /> J&T Reguler
                                  </span>
                                )}
                                {getCourierKey(order.ekspedisi, order.layanan) === 'SICEPAT' && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-50 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                                    <Truck className="w-2.5 h-2.5" /> SiCepat
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Input Resi Box dengan Sync Otomatis ke Kolom AQ Spreadsheet */}
                            <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1">
                              <div className="flex items-center justify-between">
                                <label className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tight">
                                  Input Resi (Kolom AQ):
                                </label>
                                {resiSavingState[order.id] === 'saving' && (
                                  <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-0.5 animate-pulse">
                                    <RefreshCw className="w-2.5 h-2.5 animate-spin" /> Menulis AQ...
                                  </span>
                                )}
                                {resiSavingState[order.id] === 'saved' && (
                                  <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                    <CheckCircle2 className="w-2.5 h-2.5" /> Tersimpan (AQ)
                                  </span>
                                )}
                                {resiSavingState[order.id] === 'error' && (
                                  <span className="text-[9px] font-bold text-red-600 dark:text-red-400 flex items-center gap-0.5">
                                    <AlertCircle className="w-2.5 h-2.5" /> Gagal Sheet
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <input
                                  type="text"
                                  placeholder="No Resi..."
                                  value={order.no_resi === '-' ? '' : (order.no_resi || '')}
                                  onChange={(e) => handleResiChange(order.id, e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleSaveSingleResi(order.id, order.no_resi || '', true);
                                    }
                                  }}
                                  onBlur={() => {
                                    if (order.no_resi && order.no_resi !== '-') {
                                      handleSaveSingleResi(order.id, order.no_resi, false);
                                    }
                                  }}
                                  className="w-full text-xs py-1 px-2 border border-slate-300 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:ring-1 focus:ring-pink-500 font-mono font-bold"
                                />
                                <button
                                  type="button"
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => handleSaveSingleResi(order.id, order.no_resi || '', true)}
                                  disabled={resiSavingState[order.id] === 'saving' || !order.no_resi || order.no_resi === '-'}
                                  title="Simpan No. Resi ke Google Sheets Spreadsheet & Supabase"
                                  className="p-1.5 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] flex items-center gap-0.5 cursor-pointer shadow-xs disabled:opacity-40 shrink-0 transition-colors"
                                >
                                  {resiSavingState[order.id] === 'saving' ? (
                                    <RefreshCw className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <CheckCircle2 className="w-3 h-3" />
                                  )}
                                  <span>Simpan</span>
                                </button>
                              </div>
                            </div>
                          </td>
                          <td className="p-3 text-center align-top">
                            <div className="flex flex-col items-center gap-1">
                              {getStatusBadge(order.status)}
                              <select
                                value={order.status}
                                onChange={(e) =>
                                  handleUpdateStatus(order.id, e.target.value as IGLiveOrderStatus)
                                }
                                className="mt-1 text-[10px] font-bold py-0.5 px-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded text-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                <option value="siap_diproses">Siap Diproses</option>
                                <option value="diproses">Sedang Dipacking</option>
                                <option value="dikirim">Telah Dikirim</option>
                                <option value="menunggu_pembayaran">Menunggu Pembayaran</option>
                                <option value="selesai">Selesai</option>
                                <option value="batal">Batal</option>
                              </select>
                            </div>
                          </td>
                          <td className="p-3 text-center align-top">
                            <div className="flex items-center justify-center gap-1">
                              {/* Cetak Label A6 */}
                              <button
                                type="button"
                                onClick={() => handlePrintSingleLabelA6(order)}
                                title="Cetak Label Pengiriman A6"
                                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 cursor-pointer"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>

                              {/* Edit */}
                              <button
                                type="button"
                                onClick={() => handleOpenEditModal(order)}
                                title="Edit Pesanan"
                                className="p-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 text-blue-700 dark:text-blue-300 cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* Batal */}
                              <button
                                type="button"
                                onClick={() => {
                                  setOrderToCancel(order);
                                  setCancelReason('');
                                  setIsCancelModalOpen(true);
                                }}
                                title="Batalkan Pesanan"
                                className="p-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 hover:bg-amber-100 text-amber-700 dark:text-amber-300 cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>

                              {/* Hapus */}
                              <button
                                type="button"
                                onClick={() => {
                                  setOrderToDelete(order);
                                  setIsDeleteModalOpen(true);
                                }}
                                title="Hapus Pesanan"
                                className="p-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 text-rose-700 dark:text-rose-300 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW MODE 2: PICKING LIST (Dengan Prioritas Lokasi WMS Rule 7) */}
      {activeWorkflowTab === 'picking' && (
        <div className="space-y-4">
          {/* Info Banner Blueprint Picking */}
          <div className="bg-indigo-50 dark:bg-indigo-950/40 p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-indigo-950 dark:text-indigo-200 flex items-center gap-2">
                <ListOrdered className="w-4 h-4 text-indigo-600" />
                Standar Picking List WMS — Prioritas Lokasi Gudang Chocochips
              </h2>
              <p className="text-xs text-indigo-800/80 dark:text-indigo-300/80 mt-0.5">
                SKU dikelompokkan dan diurutkan berdasarkan hirarki lokasi: <strong>P1 (Warehouse/Aksesoris/Transit)</strong> &rarr; <strong>P2 (Kolian)</strong> &rarr; <strong>P3 (Blok F)</strong>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                {pickingItemsGrouped.targetOrders.length} Pesanan | {pickingItemsGrouped.pickingList.length} SKU Unik
              </span>
            </div>
          </div>

          {/* Interactive Picking Checklist Table */}
          <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50/60 dark:bg-slate-800/40">
              <span className="font-bold text-xs text-slate-800 dark:text-white">
                Daftar Ambil Barang di Rak (Urut Jalur Tercepat Picker)
              </span>
              <span className="text-[11px] text-slate-500">
                Klik checkbox setelah mengambil barang fisik dari rak
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/80 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[11px] text-slate-600 uppercase font-bold">
                    <th className="p-3 text-center w-12">Pick</th>
                    <th className="p-3 text-center w-28">Lokasi Rak</th>
                    <th className="p-3">SKU & Nama Master Produk</th>
                    <th className="p-3 text-center w-16">Size</th>
                    <th className="p-3 text-center w-20">Total Qty</th>
                    <th className="p-3">Alokasi No. Pesanan Customer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {pickingItemsGrouped.pickingList.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400">
                        Tidak ada antrean pesanan yang perlu di-pick saat ini.
                      </td>
                    </tr>
                  ) : (
                    pickingItemsGrouped.pickingList.map((item, idx) => {
                      const skuKey = `${item.sku}_${item.lokasi}`;
                      const isPicked = !!pickedSkuKeys[skuKey];

                      return (
                        <tr
                          key={idx}
                          className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${
                            isPicked ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : ''
                          }`}
                        >
                          <td className="p-3 text-center align-middle">
                            <button
                              type="button"
                              onClick={() => togglePickSku(skuKey)}
                              className="cursor-pointer text-slate-400 hover:text-emerald-600 transition-colors inline-block"
                            >
                              {isPicked ? (
                                <CheckSquare className="w-5 h-5 text-emerald-600" />
                              ) : (
                                <Square className="w-5 h-5" />
                              )}
                            </button>
                          </td>
                          <td className="p-3 text-center font-mono font-black text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/80 text-sm">
                            {item.lokasi}
                          </td>
                          <td className="p-3">
                            <div className="font-mono font-bold text-slate-900 dark:text-white">
                              {item.sku}
                            </div>
                            <div className="text-slate-600 dark:text-slate-300 font-semibold text-[11px]">
                              {item.nama_produk}
                            </div>
                          </td>
                          <td className="p-3 text-center font-bold text-slate-800 dark:text-slate-200">
                            <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                              {item.size}
                            </span>
                          </td>
                          <td className="p-3 text-center font-black text-base text-slate-900 dark:text-white">
                            {item.totalQty}
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-1">
                              {item.orders.map((ord, oIdx) => (
                                <span
                                  key={oIdx}
                                  className="text-[10px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                >
                                  {ord.no_pesanan} ({ord.qty} pcs)
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODALS SECTION */}
      {/* ========================================================================= */}



      {/* 2. Modal Tambah / Edit Pesanan */}
      {isAddEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xl my-6">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-pink-600" />
                {editingOrder ? 'Edit Pesanan IG Live' : 'Tambah Pesanan Baru IG Live'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAddEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
              {/* Row 1: No Pesanan & Username IG */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    No. Pesanan:
                  </label>
                  <input
                    type="text"
                    value={formNoPesanan}
                    onChange={(e) => setFormNoPesanan(e.target.value)}
                    className="w-full p-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Username Instagram:
                  </label>
                  <input
                    type="text"
                    placeholder="@username"
                    value={formUsernameIg}
                    onChange={(e) => setFormUsernameIg(e.target.value)}
                    className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-semibold text-pink-600"
                  />
                </div>
              </div>

              {/* Row 2: Nama Pembeli & No Telp */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Penerima / Pembeli:
                  </label>
                  <input
                    type="text"
                    value={formNamaPembeli}
                    onChange={(e) => setFormNamaPembeli(e.target.value)}
                    className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    No. WhatsApp / Telp:
                  </label>
                  <input
                    type="text"
                    placeholder="08xxxxxxxxxx"
                    value={formNoTelp}
                    onChange={(e) => setFormNoTelp(e.target.value)}
                    className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono"
                  />
                </div>
              </div>

              {/* Row 3: Alamat Lengkap & Kota */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Alamat Lengkap Pengiriman:
                  </label>
                  <textarea
                    rows={2}
                    value={formAlamat}
                    onChange={(e) => setFormAlamat(e.target.value)}
                    className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kota / Kabupaten:
                  </label>
                  <input
                    type="text"
                    placeholder="Kota..."
                    value={formKota}
                    onChange={(e) => setFormKota(e.target.value)}
                    className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Row 4: Ekspedisi & Resi */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ekspedisi:
                  </label>
                  <select
                    value={formEkspedisi}
                    onChange={(e) => setFormEkspedisi(e.target.value)}
                    className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-bold"
                  >
                    <option value="JNE">JNE</option>
                    <option value="Instan">Instan (GoSend / Grab)</option>
                    <option value="Sameday">Sameday</option>
                    <option value="J&T Express">J&T Express</option>
                    <option value="SiCepat">SiCepat</option>
                    <option value="SPX Express">SPX Express</option>
                    <option value="Lainnya">Lainnya</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Layanan:
                  </label>
                  <input
                    type="text"
                    value={formLayanan}
                    onChange={(e) => setFormLayanan(e.target.value)}
                    className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                  <div className="flex gap-1 mt-1">
                    {['REG', 'YES', 'Instant', 'Sameday'].map((lay) => (
                      <button
                        key={lay}
                        type="button"
                        onClick={() => {
                          setFormLayanan(lay);
                          if (lay === 'Instant') setFormEkspedisi('Instan');
                          if (lay === 'Sameday') setFormEkspedisi('Sameday');
                          if (lay === 'YES' || lay === 'REG') setFormEkspedisi('JNE');
                        }}
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors ${
                          formLayanan === lay
                            ? 'bg-pink-600 text-white border-pink-600'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-200'
                        }`}
                      >
                        {lay}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    No. Resi Pengiriman:
                  </label>
                  <input
                    type="text"
                    placeholder="Resi kurir..."
                    value={formNoResi}
                    onChange={(e) => setFormNoResi(e.target.value)}
                    className="w-full p-2 text-xs font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Row 5: Status & Catatan */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Status Pesanan:
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as IGLiveOrderStatus)}
                    className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-bold"
                  >
                    <option value="siap_diproses">Siap Diproses</option>
                    <option value="diproses">Sedang Dipacking</option>
                    <option value="dikirim">Telah Dikirim</option>
                    <option value="menunggu_pembayaran">Menunggu Pembayaran</option>
                    <option value="selesai">Selesai</option>
                    <option value="batal">Dibatalkan</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Catatan Pesanan:
                  </label>
                  <input
                    type="text"
                    placeholder="Catatan dari pembeli / live..."
                    value={formCatatan}
                    onChange={(e) => setFormCatatan(e.target.value)}
                    className="w-full p-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Rincian Produk (Item List) */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider">
                    Daftar Produk Pesanan (Auto Master SKU Lookup)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFormItems([
                        ...formItems,
                        { sku: '', nama_produk: '', size: '-', qty: 1, lokasi: '-', harga: 0 },
                      ]);
                    }}
                    className="text-xs font-bold text-pink-600 hover:text-pink-700 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Item
                  </button>
                </div>

                <div className="space-y-2">
                  {formItems.map((it, idx) => (
                    <div
                      key={idx}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 grid grid-cols-12 gap-2 items-center"
                    >
                      <div className="col-span-4">
                        <label className="text-[10px] text-slate-500 font-bold block mb-0.5">
                          SKU Produk:
                        </label>
                        <input
                          type="text"
                          placeholder="Ketik SKU..."
                          value={it.sku}
                          onChange={(e) => handleItemSkuChange(idx, e.target.value)}
                          className="w-full p-1.5 text-xs font-mono font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                        />
                      </div>
                      <div className="col-span-4">
                        <label className="text-[10px] text-slate-500 font-bold block mb-0.5">
                          Nama Produk Master:
                        </label>
                        <input
                          type="text"
                          value={it.nama_produk}
                          onChange={(e) => {
                            const updated = [...formItems];
                            updated[idx].nama_produk = e.target.value;
                            setFormItems(updated);
                          }}
                          className="w-full p-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="text-[10px] text-slate-500 font-bold block mb-0.5">
                          Size & Lokasi:
                        </label>
                        <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                          {it.size} | {it.lokasi}
                        </div>
                      </div>
                      <div className="col-span-1">
                        <label className="text-[10px] text-slate-500 font-bold block mb-0.5">
                          Qty:
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={it.qty}
                          onChange={(e) => {
                            const updated = [...formItems];
                            updated[idx].qty = Number(e.target.value) || 1;
                            setFormItems(updated);
                          }}
                          className="w-full p-1.5 text-xs text-center font-bold bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded"
                        />
                      </div>
                      <div className="col-span-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setFormItems(formItems.filter((_, i) => i !== idx));
                          }}
                          className="p-1 text-rose-500 hover:text-rose-700 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsAddEditModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveOrder}
                className="px-4 py-2 text-xs font-bold bg-pink-600 hover:bg-pink-700 text-white rounded-xl shadow-xs cursor-pointer"
              >
                {editingOrder ? 'Simpan Perubahan' : 'Buat Pesanan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3. Modal Batal Pesanan */}
      {isCancelModalOpen && orderToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2 mb-2">
              <XCircle className="w-5 h-5" />
              Batalkan Pesanan {orderToCancel.no_pesanan}
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
              Masukkan alasan pembatalan pesanan untuk customer <strong>{orderToCancel.nama_pembeli}</strong> ({orderToCancel.username_ig}).
            </p>
            <textarea
              rows={3}
              placeholder="Contoh: Pembeli ganti pikiran / transfer tidak masuk / salah size..."
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              className="w-full p-2.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsCancelModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs cursor-pointer"
              >
                Konfirmasi Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. Modal Hapus Pesanan */}
      {isDeleteModalOpen && orderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-2xl">
            <h3 className="text-base font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2 mb-2">
              <Trash2 className="w-5 h-5" />
              Hapus Pesanan Permanen
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4 leading-relaxed">
              Apakah Anda yakin ingin menghapus pesanan <strong>{orderToDelete.no_pesanan}</strong> ({orderToDelete.nama_pembeli}) secara permanen dari sistem?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs cursor-pointer"
              >
                Hapus Sekarang
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Modal Bulk Update Resi */}
      <BulkUpdateResiIgLiveModal
        isOpen={isBulkUpdateResiModalOpen}
        onClose={() => setIsBulkUpdateResiModalOpen(false)}
        orders={orders}
        onSaveBatch={handleBulkUpdateResiSuccess}
        onShowToast={onShowToast}
      />

      {/* 6. Modal Import Pesanan dari GSheet */}
      <ImportPesananIgLiveModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSaveBatch={handleImportOrders}
        onShowToast={onShowToast}
      />

      </div>

      {/* Floating Print Bar (Memudahkan pemicu ulang di HP / menutup mode cetak) */}
      {printMode && printOrders.length > 0 && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 bg-slate-900 text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 border border-slate-700 print:hidden">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-pink-600 text-white shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">
                {printMode === 'labelA6'
                  ? `Siap Cetak Label A6 IG Live (${printOrders.length} Paket)`
                  : `Siap Cetak Picking List IG Live (${printOrders.length} Pesanan)`}
              </div>
              <div className="text-[10px] text-slate-300 truncate">
                Tekan Cetak jika dialog belum muncul di layar / HP
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setPrintMode(null);
                setPrintOrders([]);
              }}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl cursor-pointer"
              title="Tutup mode cetak"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PRINT AREA (Hidden in Screen, Visible in @media print) */}
      {/* ========================================================================= */}
      {printMode && printOrders.length > 0 && (
        <style>{`
          @media print {
            html, body {
              background: #ffffff !important;
              margin: 0 !important;
              padding: 0 !important;
              height: auto !important;
              overflow: visible !important;
            }
            body * {
              visibility: hidden;
            }
            #iglive-print-area,
            #iglive-print-area * {
              visibility: visible !important;
            }
            #iglive-print-area {
              display: block !important;
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              z-index: 9999999 !important;
            }
            .fixed, [class*="fixed"], .overflow-y-auto, .overflow-hidden, [class*="overflow-"] {
              position: static !important;
              overflow: visible !important;
              max-height: none !important;
              height: auto !important;
              inset: auto !important;
              transform: none !important;
              box-shadow: none !important;
              border: none !important;
              background: transparent !important;
            }
            header, nav, aside, footer, [role="navigation"], .no-print, .print\\:hidden, [class*="print:hidden"], button {
              display: none !important;
              height: 0 !important;
              margin: 0 !important;
              padding: 0 !important;
              overflow: hidden !important;
            }
            @page {
              size: ${printMode === 'labelA6' ? '100mm 150mm' : 'A4 portrait'};
              margin: ${printMode === 'labelA6' ? '0mm' : '4mm 6mm'};
            }
          }
        `}</style>
      )}

      {/* A. Print Label Pengiriman Thermal A6 (Standar Chocochips 100mm x 150mm) */}
      {printMode === 'labelA6' && (
        <div id="iglive-print-area" className="hidden print:block bg-white w-full text-black p-0 m-0">
          {printOrders.map((order, oIdx) => {
            const storeBrand = getFormalStoreBrandName('Store IG Live');
            const qrKey = order.no_pesanan || order.id;
            const qrDataUrl = printQrMap[qrKey] || '';
            const totalQty = (order.items || []).reduce((acc, it) => acc + (Number(it.qty) || 1), 0);
            const courierLabel = [order.ekspedisi, order.layanan].filter(Boolean).join(' ') || 'JNE REG';

            return (
              <div
                key={order.id || oIdx}
                className="page-break w-full h-[148mm] max-h-[148mm] box-border bg-white relative flex flex-col justify-between overflow-hidden"
                style={{
                  pageBreakAfter: oIdx < printOrders.length - 1 ? 'always' : 'auto',
                  breakAfter: oIdx < printOrders.length - 1 ? 'page' : 'auto',
                  pageBreakInside: 'avoid',
                  breakInside: 'avoid',
                }}
              >
                <div className="w-full h-full border-[2px] border-black flex flex-col bg-white box-border text-black overflow-hidden">
                  {/* TOP FIXED AREA */}
                  <div className="flex flex-col shrink-0">
                    {/* 1. Header Label (Standar Chocochips) */}
                    <div className="border-b-[2px] border-black px-3 py-2 bg-gray-50 flex justify-between items-center break-inside-avoid">
                      <div className="text-xl font-black tracking-widest uppercase leading-none text-black flex items-center">
                        <img
                          src="/logo.svg"
                          alt="CHOCOCHIPS"
                          referrerPolicy="no-referrer"
                          className="h-7 object-contain block"
                          onError={(e) => (e.currentTarget.style.display = 'none')}
                        />
                      </div>
                      <div className="text-lg font-black tracking-wider uppercase leading-none text-black">
                        {courierLabel}
                      </div>
                    </div>

                    {/* 2. Sender / Receiver + QR Code block */}
                    <div className="flex border-b-[2px] border-black bg-white break-inside-avoid">
                      {/* Main Left Column (Penerima & Pengirim Stacked) */}
                      <div className="flex-1 flex flex-col border-r-[2px] border-black min-w-0">
                        {/* PENERIMA (Top, Gets Maximum Space) */}
                        <div className="p-3 border-b-[2px] border-black flex-1">
                          <div className="text-[11px] font-black uppercase text-gray-600 mb-1">
                            Kepada / Penerima:
                          </div>
                          <div className="text-[18px] font-black uppercase mb-1 leading-tight text-black">
                            {order.nama_pembeli || '-'}
                          </div>
                          {order.no_telp && (
                            <div className="text-[14px] font-black font-mono text-black mb-1.5 leading-none">
                              {order.no_telp}
                            </div>
                          )}
                          <div className="text-[13px] font-bold leading-snug whitespace-pre-wrap text-black">
                            {order.alamat_lengkap || '-'}
                            {order.kota_kabupaten
                              ? `\n${order.kota_kabupaten}${order.kode_pos ? ` (${order.kode_pos})` : ''}`
                              : ''}
                          </div>
                          {order.catatan && (
                            <div className="mt-2 pt-1.5 border-t border-dashed border-gray-300">
                              <span className="text-[10px] font-black uppercase text-gray-500 mr-1">
                                NOTE:
                              </span>
                              <span className="text-[12px] font-bold text-black whitespace-pre-wrap">
                                {order.catatan}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* PENGIRIM (Bottom) */}
                        <div className="p-2.5 flex items-center justify-between gap-2 shrink-0 bg-white">
                          <div className="flex-1">
                            <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">
                              Dari / Pengirim:
                            </div>
                            <div className="text-[12px] font-black uppercase text-black leading-tight">
                              {storeBrand || 'CHOCOCHIPS — STORE IG LIVE'}
                            </div>
                          </div>
                          {order.username_ig && (
                            <div className="px-2 border-l border-gray-300">
                              <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">
                                Akun IG:
                              </div>
                              <div className="text-[11px] font-bold text-gray-800 leading-tight">
                                {order.username_ig}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* QR Code and ID */}
                      <div className="w-[110px] p-2 flex flex-col items-center justify-center shrink-0">
                        {qrDataUrl ? (
                          <img
                            src={qrDataUrl}
                            alt="QR Code"
                            className="w-[75px] h-[75px] block object-contain mb-1.5"
                          />
                        ) : (
                          <div className="mb-1.5">
                            <QRCodeDisplay text={order.no_pesanan} />
                          </div>
                        )}
                        <div className="text-[10px] font-black text-center break-all mb-0.5 text-black leading-tight">
                          ID: {order.no_pesanan}
                        </div>
                        {order.no_resi && order.no_resi !== '-' && (
                          <div className="text-[9px] font-bold text-center break-all text-neutral-600 leading-tight mt-0.5">
                            Resi: {order.no_resi}
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

                  {/* BOTTOM DYNAMIC AREA: Table for IG Live Items */}
                  <div className="p-3 bg-white flex-1 flex flex-col">
                    <div className="text-[12px] font-black uppercase text-gray-600 border-b border-black pb-1 mb-1.5">
                      ISI PRODUK PESANAN
                    </div>
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
                          {(order.items || []).length > 0 ? (
                            (order.items || []).map((it, itIdx) => {
                              let cleanName = it.nama_produk || '-';
                              let size = it.size || '';
                              if (!size && it.nama_produk) {
                                const parts = it.nama_produk.split('-');
                                if (parts.length > 1) {
                                  size = parts[parts.length - 1].trim();
                                  cleanName = parts.slice(0, parts.length - 1).join('-').trim();
                                }
                              }
                              return (
                                <tr key={itIdx} className="border-b border-dashed border-black">
                                  <td className="py-1 align-top">{itIdx + 1}.</td>
                                  <td className="py-1 align-top leading-snug line-clamp-2 pr-1">
                                    {cleanName}
                                  </td>
                                  <td className="py-1 align-top">{size}</td>
                                  <td className="py-1 align-top">{it.sku || ''}</td>
                                  <td className="py-1 align-top text-center font-bold">
                                    {it.qty || 1}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td
                                colSpan={5}
                                className="py-2 text-center border-b border-dashed border-black text-gray-500"
                              >
                                Tidak ada detail produk
                              </td>
                            </tr>
                          )}
                          <tr>
                            <td colSpan={4} className="text-right py-1 pr-2 font-bold uppercase">
                              Total Item
                            </td>
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
      )}

      {/* B. Print Picking List Massal (Shopee Tabular Style) */}
      {printMode === 'pickingMassal' && (
        <div id="iglive-print-area" className="hidden print:block bg-white w-full text-black p-4 max-w-[850px] mx-auto text-[9.5px]">
          {/* Print Header */}
          <div className="border-b-2 border-black pb-2 mb-3">
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-base font-black tracking-tight uppercase">
                  SURAT JALAN & PICKING LIST IG LIVE
                </h1>
                <div className="text-[10px] text-gray-700 mt-0.5">
                  WMS Warehouse Management System • Format A4 Portrait
                </div>
              </div>
              <div className="text-right text-[10px] font-mono">
                <div><b>Tgl Cetak:</b> {new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                <div><b>Picker/Admin:</b> {session?.name || 'Petugas Gudang'}</div>
              </div>
            </div>
          </div>

          {/* Summary Info */}
          <div className="flex justify-between items-center text-[10px] mb-3 bg-gray-100 p-2 border border-gray-300 rounded">
            <div><b>Total Pesanan:</b> {pickingItemsGrouped.targetOrders.length} Pesanan</div>
            <div><b>Total Barang:</b> {pickingItemsGrouped.targetOrders.reduce((sum, o) => sum + (o.items || []).reduce((s, it) => s + (Number(it.qty) || 0), 0), 0)} Pcs</div>
            <div><b>Petugas Picking:</b> ____________________</div>
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
              {pickingItemsGrouped.targetOrders.map((order, orderIdx) => {
                const rowCount = order.items?.length || 1;
                
                return (order.items || []).map((item, itemIdx) => (
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
                          {order.ekspedisi || '-'}
                          {order.layanan && (
                            <div className="text-[8px] text-gray-600 mt-0.5">
                              {order.layanan}
                            </div>
                          )}
                        </td>
                        <td rowSpan={rowCount} className="border border-black p-1 align-middle">
                          <div className="font-bold">{order.nama_pembeli}</div>
                          {order.no_telp && <div className="font-mono text-[8.5px] text-gray-700">{order.no_telp}</div>}
                        </td>
                      </>
                    )}

                    {/* Item-level Lokasi Rak */}
                    <td className="border border-black p-1 text-center align-middle font-black text-[10px] bg-gray-50">
                      {item.lokasi || '-'}
                    </td>

                    {/* Item SKU & Nama */}
                    <td className="border border-black p-1 align-middle">
                      <div className="font-black text-[9.5px]">{item.sku}</div>
                      <div className="text-gray-800 text-[8.5px]">{item.nama_produk}</div>
                      {item.size && (
                        <div className="text-gray-600 italic text-[8px]">Var: {item.size}</div>
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
                      {itemIdx === 0 && order.catatan ? order.catatan : ''}
                    </td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
