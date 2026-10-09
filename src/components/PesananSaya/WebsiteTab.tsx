import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  Upload,
  Printer,
  Package,
  Search,
  Trash2,
  CheckCircle2,
  FileSpreadsheet,
  X,
  Globe,
  ArrowRight,
  Scan,
  Camera,
  Clock,
  Video,
  CheckSquare,
  Square,
  RotateCcw,
  AlertTriangle,
  MapPin,
  User,
  Phone,
  Truck,
  Calendar,
  ChevronDown,
  ChevronRight,
  CheckCheck,
  Copy,
  Sparkles,
  ExternalLink,
  ArrowUpDown,
  Filter,
  Check,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  getWebsiteOrders,
  saveWebsiteOrders,
  deleteWebsiteOrders,
  getAllProductsFromLocalDb
} from '../../services/localDb';
import {
  playSuccessBeep,
  playErrorBeep,
  playCategoryBeep,
  playNewTaskChime,
  vibrateDevice
} from '../../services/audio';

export type WebsiteSystemStatus =
  | 'sedang_proses'
  | 'proses_picking'
  | 'proses_packing'
  | 'paket_ready'
  | 'paket_terkirim';

export type CustomSortOption =
  | 'waktu_pesanan_desc'
  | 'waktu_pesanan_asc'
  | 'order_id_asc'
  | 'ekspedisi_order_id';

export interface WebsiteItem {
  namaProduk: string;
  sku: string;
  qty: number;
  price: number;
  lokasi?: string;
  isMasterProduct?: boolean;
  scannedQty?: number;
}

export interface WebsiteOrder {
  orderId: string;
  noPesanan: string; // Alias for consistency with picking workflows
  orderDate: string;
  shippingMethod: string;
  resi: string;
  customer: string;
  phone: string;
  city: string;
  total: number;
  discount?: number;
  shippingCharge?: number;
  freeShipping?: number;
  items: WebsiteItem[];
  status_sistem: WebsiteSystemStatus;
  tanggal_proses: string;
  tanggal_upload?: string;
  waktu_picking?: string;
  waktu_packing?: string;
  cctv_timestamp_tag?: string;
  operator_packing?: string;
  waktu_terkirim?: string;
  operator_kirim?: string;
}

interface WebsiteTabProps {
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const WebsiteTab: React.FC<WebsiteTabProps> = ({ onShowToast }) => {
  const [orders, setOrders] = useState<WebsiteOrder[]>([]);
  const [activeTab, setActiveTab] = useState<WebsiteSystemStatus>('sedang_proses');
  const [loading, setLoading] = useState<boolean>(false);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedEkspedisi, setSelectedEkspedisi] = useState<string>('ALL');
  const [selectedResiFilter, setSelectedResiFilter] = useState<'ALL' | 'ADA_RESI' | 'BELUM_RESI'>('ALL');
  const [customSort, setCustomSort] = useState<CustomSortOption>('waktu_pesanan_desc');
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Packing Modal State
  const [packingModalOrder, setPackingModalOrder] = useState<WebsiteOrder | null>(null);
  const [packingBarcodeScan, setPackingBarcodeScan] = useState<string>('');
  const [packingScans, setPackingScans] = useState<Record<string, number>>({});
  const packingInputRef = useRef<HTMLInputElement>(null);

  // Quick Handover / Dispatch scan input
  const [handoverBarcodeScan, setHandoverBarcodeScan] = useState<string>('');
  const handoverInputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load orders on mount
  useEffect(() => {
    loadOrders();
  }, []);

  // Autofocus on packing modal open
  useEffect(() => {
    if (packingModalOrder && packingInputRef.current) {
      setTimeout(() => packingInputRef.current?.focus(), 150);
    }
  }, [packingModalOrder]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const data = await getWebsiteOrders();
      setOrders(data);
    } catch (err) {
      console.error('Error loading website orders:', err);
      onShowToast('Gagal memuat data pesanan website', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Helper to extract list of unique shipping methods
  const ekspedisiOptions = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      if (o.shippingMethod && o.shippingMethod.trim()) {
        set.add(o.shippingMethod.trim());
      }
    });
    return Array.from(set).sort();
  }, [orders]);

  // Sort orders helper
  const sortOrderList = (list: WebsiteOrder[], sort: CustomSortOption): WebsiteOrder[] => {
    const sorted = [...list];
    switch (sort) {
      case 'waktu_pesanan_desc':
        return sorted.sort((a, b) => (b.orderDate || '').localeCompare(a.orderDate || ''));
      case 'waktu_pesanan_asc':
        return sorted.sort((a, b) => (a.orderDate || '').localeCompare(b.orderDate || ''));
      case 'order_id_asc':
        return sorted.sort((a, b) => a.orderId.localeCompare(b.orderId));
      case 'ekspedisi_order_id':
        return sorted.sort((a, b) => {
          const c = (a.shippingMethod || '').localeCompare(b.shippingMethod || '');
          if (c !== 0) return c;
          return a.orderId.localeCompare(b.orderId);
        });
      default:
        return sorted;
    }
  };

  // Filtered & Sorted orders for the active tab
  const displayOrders = useMemo(() => {
    let list = orders.filter((o) => o.status_sistem === activeTab);

    // Filter by shipping method
    if (selectedEkspedisi !== 'ALL') {
      list = list.filter((o) => (o.shippingMethod || '').trim() === selectedEkspedisi);
    }

    // Filter by Resi availability
    if (selectedResiFilter === 'ADA_RESI') {
      list = list.filter((o) => Boolean(o.resi && o.resi.trim()));
    } else if (selectedResiFilter === 'BELUM_RESI') {
      list = list.filter((o) => !o.resi || !o.resi.trim());
    }

    // Search term filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      list = list.filter(
        (o) =>
          o.orderId.toLowerCase().includes(q) ||
          o.customer.toLowerCase().includes(q) ||
          o.phone.toLowerCase().includes(q) ||
          (o.resi && o.resi.toLowerCase().includes(q)) ||
          (o.city && o.city.toLowerCase().includes(q)) ||
          (o.cctv_timestamp_tag && o.cctv_timestamp_tag.toLowerCase().includes(q)) ||
          o.items.some(
            (it) =>
              it.sku.toLowerCase().includes(q) ||
              it.namaProduk.toLowerCase().includes(q) ||
              (it.lokasi && it.lokasi.toLowerCase().includes(q))
          )
      );
    }

    return sortOrderList(list, customSort);
  }, [orders, activeTab, selectedEkspedisi, selectedResiFilter, searchTerm, customSort]);

  // Handle File Upload (supports .xls HTML table and .xlsx/.csv)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);

    try {
      // Fetch master products for SKU & warehouse rack (lokasi) lookup
      const masterProducts = await getAllProductsFromLocalDb();
      const productMap = new Map<string, { nama: string; lokasi: string }>();
      for (const p of masterProducts) {
        if (p.k) {
          const rawKey = String(p.k).trim().toUpperCase();
          const cleanKey = rawKey.replace(/[\s\-_]/g, '');
          const info = {
            nama: p.p || p.n || (p as any).nama_produk || (p as any).nama || rawKey,
            lokasi: p.lokasi || (p as any).lokasi_rak || '-',
          };
          productMap.set(rawKey, info);
          productMap.set(cleanKey, info);
        }
      }

      // Existing orders to detect duplicates
      const existingOrders = await getWebsiteOrders();
      const existingIds = new Set(existingOrders.map((o) => o.orderId));

      const nowImportDate = new Date().toLocaleString('id-ID', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });

      // Try reading as text first to check if it's an HTML table .xls export
      const fileText = await file.text();
      const isHtmlTable = fileText.includes('<table') || fileText.includes('<tr') || fileText.includes('<style');

      let parsedOrders: WebsiteOrder[] = [];
      let duplicateCount = 0;
      let matchedMasterCount = 0;

      if (isHtmlTable) {
        // Parse HTML table rows directly (ensures 100% preservation of raw phone, resi with leading 0, etc.)
        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        const tdRegex = /<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi;

        const rows: string[][] = [];
        let m: RegExpExecArray | null;
        while ((m = trRegex.exec(fileText)) !== null) {
          const rowHtml = m[1];
          const cells: string[] = [];
          let cm: RegExpExecArray | null;
          while ((cm = tdRegex.exec(rowHtml)) !== null) {
            cells.push(cm[1].replace(/<[^>]+>/g, '').trim());
          }
          rows.push(cells);
        }

        const headerIdx = rows.findIndex((r) =>
          r.some((c) => c.toLowerCase().includes('order id') || c.toLowerCase().includes('no. pesanan'))
        );

        if (headerIdx === -1) {
          onShowToast('Header "Order ID" tidak ditemukan dalam file', 'error');
          setLoading(false);
          return;
        }

        const headers = rows[headerIdx];
        const col = (name: string) => headers.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));

        const idxOrderDate = col('order date');
        const idxOrderId = col('order id');
        const idxShippingMethod = col('shipping method');
        const idxResi = col('resi');
        const idxCustomer = col('customer');
        const idxPhone = col('phone');
        const idxItem = col('item');
        const idxSku = col('sku');
        const idxQty = col('quantity');
        const idxPrice = col('price');
        const idxDiscount = col('discount');
        const idxTotal = col('total');
        const idxCity = col('city');

        const orderMap = new Map<string, WebsiteOrder>();

        let currentOrderId = '';

        for (let i = headerIdx + 1; i < rows.length; i++) {
          const r = rows[i];
          if (!r || r.length === 0 || r.every((c) => !c)) continue;

          const rowOrderId = r[idxOrderId];
          if (rowOrderId) {
            currentOrderId = rowOrderId.trim();
          }

          if (!currentOrderId) continue;

          if (existingIds.has(currentOrderId)) {
            duplicateCount++;
            continue;
          }

          const rawSku = (r[idxSku] || '').trim().toUpperCase();
          const cleanSku = rawSku.replace(/[\s\-_]/g, '');
          const masterMatch = productMap.get(rawSku) || productMap.get(cleanSku);

          let finalNamaProduk = r[idxItem] || rawSku;
          let finalLokasi = '-';
          let isMaster = false;

          if (masterMatch) {
            finalNamaProduk = masterMatch.nama;
            finalLokasi = masterMatch.lokasi || '-';
            isMaster = true;
            matchedMasterCount++;
          }

          const rawPrice = (r[idxPrice] || '0').replace(/[^0-9]/g, '');
          const item: WebsiteItem = {
            sku: rawSku,
            namaProduk: finalNamaProduk,
            qty: parseInt(r[idxQty] || '1', 10) || 1,
            price: parseInt(rawPrice, 10) || 0,
            lokasi: finalLokasi,
            isMasterProduct: isMaster,
          };

          if (orderMap.has(currentOrderId)) {
            const existing = orderMap.get(currentOrderId)!;
            if (rawSku || r[idxItem]) {
              existing.items.push(item);
            }
            // Update summary fields if on later row
            if (r[idxTotal]) {
              const rawTot = (r[idxTotal] || '0').replace(/[^0-9]/g, '');
              existing.total = parseInt(rawTot, 10) || existing.total;
            }
            if (r[idxCity]) existing.city = r[idxCity];
            if (r[idxResi] && !existing.resi) existing.resi = r[idxResi];
          } else {
            const rawTot = (r[idxTotal] || '0').replace(/[^0-9]/g, '');
            const rawDisc = (r[idxDiscount] || '0').replace(/[^0-9]/g, '');
            orderMap.set(currentOrderId, {
              orderId: currentOrderId,
              noPesanan: currentOrderId,
              orderDate: r[idxOrderDate] || '',
              shippingMethod: r[idxShippingMethod] || '',
              resi: r[idxResi] || '',
              customer: r[idxCustomer] || '',
              phone: r[idxPhone] || '',
              city: r[idxCity] || '',
              total: parseInt(rawTot, 10) || 0,
              discount: parseInt(rawDisc, 10) || 0,
              items: rawSku || r[idxItem] ? [item] : [],
              status_sistem: 'sedang_proses',
              tanggal_proses: nowImportDate,
              tanggal_upload: nowImportDate,
            });
          }
        }

        parsedOrders = Array.from(orderMap.values());
      } else {
        // Parse via XLSX library (binary excel)
        const arrayBuffer = await file.arrayBuffer();
        const wb = XLSX.read(arrayBuffer, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws, { header: 1, raw: false });

        if (data.length < 2) {
          onShowToast('File Excel kosong atau format tidak sesuai', 'error');
          setLoading(false);
          return;
        }

        const headerIdx = data.findIndex((r: any[]) =>
          (r || []).some((c: any) =>
            String(c).toLowerCase().includes('order id') || String(c).toLowerCase().includes('no. pesanan')
          )
        );

        if (headerIdx === -1) {
          onShowToast('Header "Order ID" tidak ditemukan dalam file Excel', 'error');
          setLoading(false);
          return;
        }

        const headers = (data[headerIdx] || []) as string[];
        const col = (name: string) =>
          headers.findIndex((h) => h && h.toString().toLowerCase().includes(name.toLowerCase()));

        const idxOrderDate = col('order date');
        const idxOrderId = col('order id');
        const idxShippingMethod = col('shipping method');
        const idxResi = col('resi');
        const idxCustomer = col('customer');
        const idxPhone = col('phone');
        const idxItem = col('item');
        const idxSku = col('sku');
        const idxQty = col('quantity');
        const idxPrice = col('price');
        const idxTotal = col('total');
        const idxCity = col('city');

        const orderMap = new Map<string, WebsiteOrder>();
        let currentOrderId = '';

        for (let i = headerIdx + 1; i < data.length; i++) {
          const r = data[i] || [];
          if (!r || r.length === 0 || r.every((c: any) => !c)) continue;

          const rowOrderId = r[idxOrderId] ? String(r[idxOrderId]).trim() : '';
          if (rowOrderId) {
            currentOrderId = rowOrderId;
          }

          if (!currentOrderId) continue;

          if (existingIds.has(currentOrderId)) {
            duplicateCount++;
            continue;
          }

          const rawSku = String(r[idxSku] || '').trim().toUpperCase();
          const cleanSku = rawSku.replace(/[\s\-_]/g, '');
          const masterMatch = productMap.get(rawSku) || productMap.get(cleanSku);

          let finalNamaProduk = String(r[idxItem] || rawSku).trim();
          let finalLokasi = '-';
          let isMaster = false;

          if (masterMatch) {
            finalNamaProduk = masterMatch.nama;
            finalLokasi = masterMatch.lokasi || '-';
            isMaster = true;
            matchedMasterCount++;
          }

          const rawPrice = String(r[idxPrice] || '0').replace(/[^0-9]/g, '');
          const item: WebsiteItem = {
            sku: rawSku,
            namaProduk: finalNamaProduk,
            qty: parseInt(String(r[idxQty] || '1'), 10) || 1,
            price: parseInt(rawPrice, 10) || 0,
            lokasi: finalLokasi,
            isMasterProduct: isMaster,
          };

          if (orderMap.has(currentOrderId)) {
            const existing = orderMap.get(currentOrderId)!;
            if (rawSku || r[idxItem]) {
              existing.items.push(item);
            }
            if (r[idxTotal]) {
              const rawTot = String(r[idxTotal] || '0').replace(/[^0-9]/g, '');
              existing.total = parseInt(rawTot, 10) || existing.total;
            }
            if (r[idxCity]) existing.city = String(r[idxCity]).trim();
            if (r[idxResi] && !existing.resi) existing.resi = String(r[idxResi]).trim();
          } else {
            const rawTot = String(r[idxTotal] || '0').replace(/[^0-9]/g, '');
            orderMap.set(currentOrderId, {
              orderId: currentOrderId,
              noPesanan: currentOrderId,
              orderDate: String(r[idxOrderDate] || '').trim(),
              shippingMethod: String(r[idxShippingMethod] || '').trim(),
              resi: String(r[idxResi] || '').trim(),
              customer: String(r[idxCustomer] || '').trim(),
              phone: String(r[idxPhone] || '').trim(),
              city: String(r[idxCity] || '').trim(),
              total: parseInt(rawTot, 10) || 0,
              items: rawSku || r[idxItem] ? [item] : [],
              status_sistem: 'sedang_proses',
              tanggal_proses: nowImportDate,
              tanggal_upload: nowImportDate,
            });
          }
        }

        parsedOrders = Array.from(orderMap.values());
      }

      if (parsedOrders.length > 0) {
        await saveWebsiteOrders(parsedOrders);
        onShowToast(
          `Berhasil mengimpor ${parsedOrders.length} pesanan baru Website ke "Sedang Proses"`,
          'success'
        );
        playSuccessBeep();
      }

      if (duplicateCount > 0) {
        onShowToast(`${duplicateCount} baris diabaikan karena Order ID sudah ada di sistem`, 'info');
      }

      if (parsedOrders.length === 0 && duplicateCount === 0) {
        onShowToast('Tidak ditemukan data pesanan baru yang valid dalam file', 'warning');
      }

      await loadOrders();
      setActiveTab('sedang_proses');
    } catch (err) {
      console.error('Error parsing website order file:', err);
      onShowToast('Gagal memproses file data pesanan Website', 'error');
      playErrorBeep();
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Status transitions
  const handleUpdateOrderStatus = async (
    targetOrderIds: string[],
    newStatus: WebsiteSystemStatus,
    customMsg?: string
  ) => {
    if (targetOrderIds.length === 0) return;

    const nowStr = new Date().toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const updated = orders.map((o) => {
      if (targetOrderIds.includes(o.orderId)) {
        const up: WebsiteOrder = { ...o, status_sistem: newStatus };
        if (newStatus === 'proses_picking') {
          up.waktu_picking = up.waktu_picking || nowStr;
        }
        if (newStatus === 'paket_terkirim') {
          up.waktu_terkirim = up.waktu_terkirim || nowStr;
        }
        return up;
      }
      return o;
    });

    await saveWebsiteOrders(updated);
    await loadOrders();
    setSelectedOrders(new Set());
    onShowToast(
      customMsg || `${targetOrderIds.length} pesanan dialihkan ke ${newStatus.replace('_', ' ').toUpperCase()}`,
      'success'
    );
    playSuccessBeep();
  };

  // Delete orders
  const handleDeleteOrders = async (targetOrderIds: string[]) => {
    if (targetOrderIds.length === 0) return;
    if (!window.confirm(`Yakin ingin menghapus ${targetOrderIds.length} pesanan website dari sistem?`)) return;

    await deleteWebsiteOrders(targetOrderIds);
    await loadOrders();
    setSelectedOrders(new Set());
    onShowToast(`${targetOrderIds.length} pesanan berhasil dihapus`, 'info');
  };

  // Open Packing Modal for a specific order
  const handleOpenPackingModal = (order: WebsiteOrder) => {
    setPackingModalOrder(order);
    const initialScans: Record<string, number> = {};
    order.items.forEach((it) => {
      initialScans[it.sku] = 0;
    });
    setPackingScans(initialScans);
    setPackingBarcodeScan('');
  };

  // Handle Scanning inside Packing Modal
  const handlePackingScanSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!packingModalOrder || !packingBarcodeScan.trim()) return;

    const query = packingBarcodeScan.trim().toUpperCase();
    const matchedItem = packingModalOrder.items.find(
      (it) => it.sku.toUpperCase() === query || it.sku.toUpperCase().includes(query)
    );

    if (matchedItem) {
      const currentQty = packingScans[matchedItem.sku] || 0;
      if (currentQty >= matchedItem.qty) {
        onShowToast(`Item ${matchedItem.sku} sudah lengkap (${matchedItem.qty} pcs)`, 'warning');
        playErrorBeep();
        vibrateDevice([100, 50, 100]);
      } else {
        setPackingScans((prev) => ({
          ...prev,
          [matchedItem.sku]: currentQty + 1,
        }));
        playSuccessBeep();
        vibrateDevice(50);
      }
    } else {
      onShowToast(`SKU "${query}" tidak sesuai dengan pesanan ${packingModalOrder.orderId}`, 'error');
      playErrorBeep();
      vibrateDevice([200, 100, 200]);
    }

    setPackingBarcodeScan('');
  };

  // Check if all items in packing modal are scanned
  const isPackingComplete = useMemo(() => {
    if (!packingModalOrder) return false;
    return packingModalOrder.items.every((it) => (packingScans[it.sku] || 0) >= it.qty);
  }, [packingModalOrder, packingScans]);

  // Complete Packing with CCTV Timestamp
  const handleCompletePackingWithCctv = async () => {
    if (!packingModalOrder) return;

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const cctvDateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const cctvTag = `[CCTV: ${cctvDateStr}]`;

    const updated = orders.map((o) => {
      if (o.orderId === packingModalOrder.orderId) {
        return {
          ...o,
          status_sistem: 'paket_ready' as WebsiteSystemStatus,
          waktu_packing: cctvDateStr,
          cctv_timestamp_tag: cctvTag,
        };
      }
      return o;
    });

    await saveWebsiteOrders(updated);
    await loadOrders();
    setPackingModalOrder(null);
    onShowToast(`Pesanan ${packingModalOrder.orderId} SELESAI PACKING! CCTV: ${cctvTag}`, 'success');
    playNewTaskChime();
  };

  // Quick Handover Scan to mark ready order as terkirim
  const handleHandoverScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!handoverBarcodeScan.trim()) return;

    const query = handoverBarcodeScan.trim().toUpperCase();
    const matched = orders.find(
      (o) =>
        o.status_sistem === 'paket_ready' &&
        (o.orderId.toUpperCase() === query ||
          (o.resi && o.resi.toUpperCase() === query) ||
          o.phone.includes(query))
    );

    if (matched) {
      await handleUpdateOrderStatus(
        [matched.orderId],
        'paket_terkirim',
        `Paket ${matched.orderId} (${matched.shippingMethod}) BERHASIL DISERAHKAN KE KURIR!`
      );
      setHandoverBarcodeScan('');
      playNewTaskChime();
    } else {
      onShowToast(`Paket dengan Resi/Order ID "${query}" tidak ditemukan di antrean Paket Ready`, 'error');
      playErrorBeep();
    }
  };

  // Print Picking List
  const handlePrintPickingList = () => {
    if (displayOrders.length === 0) {
      onShowToast('Tidak ada data pesanan untuk dicetak', 'warning');
      return;
    }
    setTimeout(() => {
      window.print();
    }, 300);
  };

  // Copy CCTV tag
  const handleCopyCctv = (tag?: string) => {
    if (!tag) return;
    navigator.clipboard.writeText(tag);
    onShowToast(`Disalin: ${tag}`, 'info');
  };

  // Counts for tabs
  const countSedangProses = orders.filter((o) => o.status_sistem === 'sedang_proses').length;
  const countPicking = orders.filter((o) => o.status_sistem === 'proses_picking').length;
  const countPacking = orders.filter((o) => o.status_sistem === 'proses_packing').length;
  const countReady = orders.filter((o) => o.status_sistem === 'paket_ready').length;
  const countTerkirim = orders.filter((o) => o.status_sistem === 'paket_terkirim').length;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0c1322] min-h-[calc(100vh-140px)] rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
      {/* ========================================================================= */}
      {/* PRINT CSS OVERRIDES (ISOLATED TO WEBSITE PRINT AREA) */}
      {/* ========================================================================= */}
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 8mm 8mm 8mm 8mm;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 100% !important;
            color: #000000 !important;
            font-size: 9.5px !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body * {
            visibility: hidden !important;
          }
          #website-print-area, #website-print-area * {
            visibility: visible !important;
          }
          #website-print-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            display: block !important;
          }
          .page-break {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>

      {/* ========================================================================= */}
      {/* TOP TAB LIFECYCLE BAR */}
      {/* ========================================================================= */}
      <div className="bg-white dark:bg-[#131d31] border-b border-slate-200 dark:border-slate-800 flex px-3 sm:px-6 gap-1 sm:gap-4 shrink-0 print:hidden overflow-x-auto shadow-xs">
        <button
          onClick={() => {
            setActiveTab('sedang_proses');
            setSelectedOrders(new Set());
          }}
          className={`py-3 sm:py-3.5 px-2.5 sm:px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'sedang_proses'
              ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Sedang Proses</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'sedang_proses'
                ? 'bg-cyan-100 dark:bg-cyan-950 text-cyan-700 dark:text-cyan-300'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {countSedangProses}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('proses_picking');
            setSelectedOrders(new Set());
          }}
          className={`py-3 sm:py-3.5 px-2.5 sm:px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'proses_picking'
              ? 'border-amber-500 text-amber-600 dark:text-amber-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Package className="w-4 h-4" />
          <span>Proses Picking</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'proses_picking'
                ? 'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {countPicking}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('proses_packing');
            setSelectedOrders(new Set());
          }}
          className={`py-3 sm:py-3.5 px-2.5 sm:px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'proses_packing'
              ? 'border-purple-500 text-purple-600 dark:text-purple-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Video className="w-4 h-4" />
          <span>Proses Packing</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'proses_packing'
                ? 'bg-purple-100 dark:bg-purple-950 text-purple-700 dark:text-purple-300'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {countPacking}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('paket_ready');
            setSelectedOrders(new Set());
          }}
          className={`py-3 sm:py-3.5 px-2.5 sm:px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'paket_ready'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <CheckSquare className="w-4 h-4" />
          <span>Paket Ready</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'paket_ready'
                ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {countReady}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('paket_terkirim');
            setSelectedOrders(new Set());
          }}
          className={`py-3 sm:py-3.5 px-2.5 sm:px-3 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 sm:gap-2 whitespace-nowrap transition-colors cursor-pointer ${
            activeTab === 'paket_terkirim'
              ? 'border-slate-500 text-slate-700 dark:text-slate-200'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>Paket Terkirim</span>
          <span
            className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
              activeTab === 'paket_terkirim'
                ? 'bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100'
                : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {countTerkirim}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* MAIN CONTENT AREA */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 print:hidden space-y-4">
        {/* ACTION HEADER TOOLBAR */}
        <div className="bg-white dark:bg-[#131d31] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-600 dark:text-cyan-400">
                <Globe className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                  <span>Pesanan Website (Chocochips Web)</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 font-bold uppercase tracking-wide">
                    Live WMS Flow
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {activeTab === 'sedang_proses' &&
                    'Data pesanan baru hasil import Excel/XLS Website siap disortir dan dicetak Surat Jalan Picking.'}
                  {activeTab === 'proses_picking' &&
                    'Daftar pesanan yang sedang diambil barangnya di rak gudang oleh tim picking.'}
                  {activeTab === 'proses_packing' &&
                    'Validasi scan barang per paket dengan pencatatan timestamp rekaman CCTV gudang.'}
                  {activeTab === 'paket_ready' &&
                    'Paket tersegel siap diserahkan ke kurir ekspedisi. Scan resi untuk serah terima instan.'}
                  {activeTab === 'paket_terkirim' &&
                    'Riwayat paket yang telah berhasil dipickup dan dikirim oleh kurir ekspedisi.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 w-full lg:w-auto">
            {/* Action buttons depending on tab */}
            {activeTab === 'sedang_proses' && (
              <>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xls,.xlsx,.csv"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Upload Excel Website (.xls / .xlsx)</span>
                </button>

                {displayOrders.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrintPickingList}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Cetak Surat Jalan Picking</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const target =
                          selectedOrders.size > 0
                            ? Array.from(selectedOrders)
                            : displayOrders.map((o) => o.orderId);
                        handleUpdateOrderStatus(target, 'proses_picking');
                      }}
                      className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      <ArrowRight className="w-4 h-4" />
                      <span>
                        Kirim ke Picking ({selectedOrders.size > 0 ? selectedOrders.size : displayOrders.length})
                      </span>
                    </button>
                  </>
                )}
              </>
            )}

            {activeTab === 'proses_picking' && (
              <>
                <button
                  type="button"
                  onClick={handlePrintPickingList}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 dark:bg-slate-700 dark:hover:bg-slate-600 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak Ulang Picking List</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const target =
                      selectedOrders.size > 0
                        ? Array.from(selectedOrders)
                        : displayOrders.map((o) => o.orderId);
                    handleUpdateOrderStatus(target, 'proses_packing');
                  }}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                >
                  <Video className="w-4 h-4" />
                  <span>
                    Mulai Packing ({selectedOrders.size > 0 ? selectedOrders.size : displayOrders.length})
                  </span>
                </button>
              </>
            )}

            {activeTab === 'paket_ready' && (
              <button
                type="button"
                onClick={() => {
                  const target =
                    selectedOrders.size > 0
                      ? Array.from(selectedOrders)
                      : displayOrders.map((o) => o.orderId);
                  handleUpdateOrderStatus(target, 'paket_terkirim');
                }}
                disabled={displayOrders.length === 0}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                <CheckCheck className="w-4 h-4" />
                <span>
                  Tandai Terkirim ({selectedOrders.size > 0 ? selectedOrders.size : displayOrders.length})
                </span>
              </button>
            )}

            {selectedOrders.size > 0 && (
              <button
                type="button"
                onClick={() => handleDeleteOrders(Array.from(selectedOrders))}
                className="px-3 py-2 bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/60 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 font-bold rounded-xl text-xs flex items-center gap-1.5 transition-all cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Hapus ({selectedOrders.size})</span>
              </button>
            )}
          </div>
        </div>

        {/* QUICK SCAN BAR ON PROSES PACKING */}
        {activeTab === 'proses_packing' && (
          <div className="bg-gradient-to-r from-purple-500/10 via-indigo-500/10 to-blue-500/10 border border-purple-500/20 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-center gap-3">
            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-bold text-xs shrink-0">
              <Scan className="w-5 h-5 animate-pulse" />
              <span>Scan Barcode SKU / Order ID untuk Buka Mode Packing:</span>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const q = packingBarcodeScan.trim().toUpperCase();
                if (!q) return;
                const matched = orders.find(
                  (o) =>
                    o.status_sistem === 'proses_packing' &&
                    (o.orderId.toUpperCase() === q ||
                      (o.resi && o.resi.toUpperCase() === q) ||
                      o.items.some((it) => it.sku.toUpperCase() === q))
                );
                if (matched) {
                  handleOpenPackingModal(matched);
                  setPackingBarcodeScan('');
                } else {
                  onShowToast(`Pesanan dengan SKU/Order ID "${q}" tidak ditemukan di antrean packing`, 'warning');
                  playErrorBeep();
                }
              }}
              className="flex-1 flex gap-2 w-full"
            >
              <input
                type="text"
                value={packingBarcodeScan}
                onChange={(e) => setPackingBarcodeScan(e.target.value)}
                placeholder="Scan barcode SKU barang atau Order ID..."
                className="flex-1 px-3.5 py-2 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-800 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-purple-500 outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Cari & Pack
              </button>
            </form>
          </div>
        )}

        {/* QUICK SCAN BAR ON PAKET READY (SERAH TERIMA EKSPEDISI) */}
        {activeTab === 'paket_ready' && (
          <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-cyan-500/10 border border-emerald-500/20 p-3 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-center gap-3">
            <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 font-bold text-xs shrink-0">
              <Truck className="w-5 h-5 animate-bounce" />
              <span>Scan Resi / Order ID Serah Terima Kurir:</span>
            </div>
            <form onSubmit={handleHandoverScanSubmit} className="flex-1 flex gap-2 w-full">
              <input
                ref={handoverInputRef}
                type="text"
                value={handoverBarcodeScan}
                onChange={(e) => setHandoverBarcodeScan(e.target.value)}
                placeholder="Scan no. resi atau Order ID paket untuk langsung tandai terkirim..."
                className="flex-1 px-3.5 py-2 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 rounded-xl text-xs font-mono font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Serahkan ke Kurir
              </button>
            </form>
          </div>
        )}

        {/* SEARCH & FILTERS BAR */}
        <div className="bg-white dark:bg-[#131d31] p-3 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          <div className="flex-1 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari Order ID, Resi, Pelanggan, No Telp, Kota, SKU, atau CCTV..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-700/80 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:ring-2 focus:ring-cyan-500 outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center flex-wrap gap-2 text-xs">
            {/* Filter Ekspedisi */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/80">
              <Truck className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedEkspedisi}
                onChange={(e) => setSelectedEkspedisi(e.target.value)}
                className="bg-transparent text-slate-700 dark:text-slate-200 font-bold outline-none cursor-pointer"
              >
                <option value="ALL">Semua Ekspedisi</option>
                {ekspedisiOptions.map((exp) => (
                  <option key={exp} value={exp}>
                    {exp}
                  </option>
                ))}
              </select>
            </div>

            {/* Filter Resi */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/80">
              <Filter className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={selectedResiFilter}
                onChange={(e) => setSelectedResiFilter(e.target.value as any)}
                className="bg-transparent text-slate-700 dark:text-slate-200 font-bold outline-none cursor-pointer"
              >
                <option value="ALL">Semua Status Resi</option>
                <option value="ADA_RESI">Sudah Ada Resi</option>
                <option value="BELUM_RESI">Belum Ada Resi</option>
              </select>
            </div>

            {/* Urutan Sort */}
            <div className="flex items-center gap-1.5 bg-slate-50 dark:bg-slate-900/80 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700/80">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={customSort}
                onChange={(e) => setCustomSort(e.target.value as CustomSortOption)}
                className="bg-transparent text-slate-700 dark:text-slate-200 font-bold outline-none cursor-pointer"
              >
                <option value="waktu_pesanan_desc">Waktu Terbaru</option>
                <option value="waktu_pesanan_asc">Waktu Terlama</option>
                <option value="order_id_asc">Order ID (A-Z)</option>
                <option value="ekspedisi_order_id">Ekspedisi + Order ID</option>
              </select>
            </div>

            {/* Refresh */}
            <button
              onClick={loadOrders}
              className="p-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 rounded-xl cursor-pointer"
              title="Muat Ulang Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* ORDERS LIST TABLE / CARDS */}
        <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          {/* Table Header Controls */}
          <div className="p-3 sm:p-4 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (selectedOrders.size === displayOrders.length) {
                    setSelectedOrders(new Set());
                  } else {
                    setSelectedOrders(new Set(displayOrders.map((o) => o.orderId)));
                  }
                }}
                className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                {selectedOrders.size > 0 && selectedOrders.size === displayOrders.length ? (
                  <CheckSquare className="w-4 h-4 text-cyan-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>Pilih Semua ({displayOrders.length} Pesanan)</span>
              </button>

              {selectedOrders.size > 0 && (
                <span className="text-xs text-cyan-600 dark:text-cyan-400 font-bold ml-2">
                  ({selectedOrders.size} terpilih)
                </span>
              )}
            </div>

            <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
              Total Barang:{' '}
              <b className="text-slate-800 dark:text-white">
                {displayOrders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.qty, 0), 0)} Pcs
              </b>
            </div>
          </div>

          {/* Table Content */}
          {displayOrders.length === 0 ? (
            <div className="py-16 px-4 text-center">
              <Package className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Tidak ada pesanan di status ini
              </h4>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-sm mx-auto">
                {activeTab === 'sedang_proses'
                  ? 'Klik tombol "Upload Excel Website" di atas untuk memasukkan data file pesanan website.'
                  : 'Pesanan akan muncul di sini setelah dialihkan dari tahap sebelumnya.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {displayOrders.map((order) => {
                const isSelected = selectedOrders.has(order.orderId);
                const totalItemQty = order.items.reduce((s, it) => s + it.qty, 0);

                return (
                  <div
                    key={order.orderId}
                    className={`p-3.5 sm:p-5 transition-colors ${
                      isSelected
                        ? 'bg-cyan-50/50 dark:bg-cyan-950/20'
                        : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                      {/* Left: Checkbox + Order Info */}
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            const next = new Set(selectedOrders);
                            if (next.has(order.orderId)) next.delete(order.orderId);
                            else next.add(order.orderId);
                            setSelectedOrders(next);
                          }}
                          className="mt-1 cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-cyan-600" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-400" />
                          )}
                        </button>

                        <div className="space-y-1">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="font-mono font-black text-sm text-cyan-600 dark:text-cyan-400">
                              #{order.orderId}
                            </span>
                            {order.resi ? (
                              <span className="px-2 py-0.5 rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono font-bold">
                                Resi: {order.resi}
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 text-[10px] font-bold">
                                Belum Ada Resi
                              </span>
                            )}
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold flex items-center gap-1">
                              <Truck className="w-3 h-3 text-cyan-500" />
                              {order.shippingMethod || 'Kurir Standar'}
                            </span>
                          </div>

                          <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              <b className="text-slate-700 dark:text-slate-200">{order.customer}</b>
                              {order.phone && <span>({order.phone})</span>}
                            </span>
                            {order.city && (
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-slate-400" />
                                <span>{order.city}</span>
                              </span>
                            )}
                            {order.orderDate && (
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3 text-slate-400" />
                                <span>{order.orderDate}</span>
                              </span>
                            )}
                          </div>

                          {/* CCTV tag if recorded */}
                          {order.cctv_timestamp_tag && (
                            <div className="flex items-center gap-2 pt-0.5">
                              <button
                                type="button"
                                onClick={() => handleCopyCctv(order.cctv_timestamp_tag)}
                                className="px-2 py-0.5 rounded bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 font-mono text-[10px] font-bold flex items-center gap-1 hover:bg-purple-200 transition-colors cursor-pointer"
                                title="Klik untuk salin tag CCTV"
                              >
                                <Video className="w-3 h-3" />
                                <span>{order.cctv_timestamp_tag}</span>
                                <Copy className="w-2.5 h-2.5 ml-0.5" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 self-end lg:self-center">
                        {activeTab === 'sedang_proses' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateOrderStatus([order.orderId], 'proses_picking')}
                            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>Kirim ke Picking</span>
                          </button>
                        )}

                        {activeTab === 'proses_picking' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateOrderStatus([order.orderId], 'proses_packing')}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                          >
                            <Video className="w-3.5 h-3.5" />
                            <span>Mulai Packing</span>
                          </button>
                        )}

                        {activeTab === 'proses_packing' && (
                          <button
                            type="button"
                            onClick={() => handleOpenPackingModal(order)}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                          >
                            <Scan className="w-3.5 h-3.5" />
                            <span>Validasi & Pack</span>
                          </button>
                        )}

                        {activeTab === 'paket_ready' && (
                          <button
                            type="button"
                            onClick={() => handleUpdateOrderStatus([order.orderId], 'paket_terkirim')}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1 cursor-pointer shadow-xs active:scale-95"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            <span>Tandai Terkirim</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDeleteOrders([order.orderId])}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg cursor-pointer"
                          title="Hapus Pesanan"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Order Items Detail Sub-List */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/30 p-2.5 rounded-xl">
                      <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1.5 flex items-center justify-between">
                        <span>
                          Daftar Barang ({order.items.length} Model • {totalItemQty} Pcs):
                        </span>
                        {order.total > 0 && (
                          <span className="font-mono text-cyan-600 dark:text-cyan-400 font-black">
                            Total: Rp {order.total.toLocaleString('id-ID')}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                        {order.items.map((it, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between bg-white dark:bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-700/60 text-xs"
                          >
                            <div className="min-w-0 pr-2">
                              <div className="font-bold text-slate-800 dark:text-white truncate">
                                {it.namaProduk}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                                <span className="font-bold text-slate-700 dark:text-slate-300">{it.sku}</span>
                                {it.lokasi && it.lokasi !== '-' && (
                                  <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 font-bold">
                                    Rak {it.lokasi}
                                  </span>
                                )}
                              </div>
                            </div>
                            <span className="shrink-0 px-2 py-0.5 rounded-md bg-cyan-100 dark:bg-cyan-950 text-cyan-800 dark:text-cyan-200 font-black text-xs">
                              {it.qty}x
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom Spacing */}
        <div className="h-10 print:hidden" />
      </div>

      {/* ========================================================================= */}
      {/* PACKING VALIDATION & CCTV RECORDING MODAL */}
      {/* ========================================================================= */}
      {packingModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white dark:bg-[#131d31] w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
            {/* Modal Header */}
            <div className="p-4 bg-purple-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Video className="w-5 h-5" />
                <div>
                  <h3 className="font-black text-sm">Mode Validasi Packing & Rekam CCTV</h3>
                  <div className="text-[11px] text-purple-100 font-mono">
                    Order ID: <b>#{packingModalOrder.orderId}</b>
                    {packingModalOrder.resi && ` | Resi: ${packingModalOrder.resi}`}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPackingModalOrder(null)}
                className="p-1 rounded-lg hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 overflow-y-auto space-y-4 flex-1">
              {/* Customer info preview */}
              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Penerima:</span>
                  <span className="font-bold text-slate-800 dark:text-white">
                    {packingModalOrder.customer} ({packingModalOrder.phone})
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Alamat / Kota:</span>
                  <span className="font-bold text-slate-800 dark:text-white">{packingModalOrder.city || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Ekspedisi:</span>
                  <span className="font-bold text-cyan-600 dark:text-cyan-400">
                    {packingModalOrder.shippingMethod}
                  </span>
                </div>
              </div>

              {/* Barcode scanner input */}
              <form onSubmit={handlePackingScanSubmit} className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Scan className="w-4 h-4 text-purple-600" />
                  <span>Scan Barcode SKU Item:</span>
                </label>
                <div className="flex gap-2">
                  <input
                    ref={packingInputRef}
                    type="text"
                    value={packingBarcodeScan}
                    onChange={(e) => setPackingBarcodeScan(e.target.value)}
                    placeholder="Arahkan barcode scanner ke SKU pakaian..."
                    className="flex-1 px-3.5 py-2.5 bg-slate-50 dark:bg-slate-900 border-2 border-purple-400 dark:border-purple-600 rounded-xl text-xs font-mono font-bold outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Scan
                  </button>
                </div>
              </form>

              {/* Items checklist */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Daftar Barang Wajib Scan:
                </div>
                {packingModalOrder.items.map((it, idx) => {
                  const scanned = packingScans[it.sku] || 0;
                  const isDone = scanned >= it.qty;

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                        isDone
                          ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="min-w-0 pr-3">
                        <div className="font-bold text-xs text-slate-800 dark:text-white truncate">
                          {it.namaProduk}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                          <span>SKU: {it.sku}</span>
                          {it.lokasi && (
                            <span className="px-1.5 py-0.2 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 rounded font-bold">
                              Rak {it.lokasi}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span
                          className={`px-2.5 py-1 rounded-lg font-mono font-black text-xs ${
                            isDone
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {scanned} / {it.qty}
                        </span>
                        {isDone && <CheckCircle2 className="w-5 h-5 text-emerald-600" />}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 dark:bg-slate-900/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setPackingModalOrder(null)}
                className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                Batal
              </button>

              <button
                type="button"
                onClick={handleCompletePackingWithCctv}
                disabled={!isPackingComplete}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer active:scale-95"
              >
                <Video className="w-4 h-4" />
                <span>Selesaikan Packing & Catat CCTV</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* A4 PORTRAIT PRINT LAYOUT FOR SURAT JALAN & PICKING LIST */}
      {/* ========================================================================= */}
      <div id="website-print-area" className="hidden print:block bg-white w-full text-black">
        {/* Print Header */}
        <div className="border-b-2 border-black pb-2 mb-3">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-base font-black tracking-tight uppercase">
                SURAT JALAN & PICKING LIST WEBSITE (CHOCOCHIPS)
              </h1>
              <div className="text-[10px] text-gray-700 mt-0.5">
                WMS Warehouse Management System • Format A4 Portrait
              </div>
            </div>
            <div className="text-right text-[10px] font-mono">
              <div>
                <b>Tgl Cetak:</b>{' '}
                {new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
              <div>
                <b>Ekspedisi:</b> {selectedEkspedisi === 'ALL' ? 'Semua Ekspedisi' : selectedEkspedisi}
              </div>
            </div>
          </div>
        </div>

        {/* Summary Info */}
        <div className="flex justify-between items-center text-[10px] mb-3 bg-gray-100 p-2 border border-gray-300 rounded">
          <div>
            <b>Total Pesanan:</b> {displayOrders.length} Pesanan
          </div>
          <div>
            <b>Total Barang:</b>{' '}
            {displayOrders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.qty, 0), 0)} Pcs
          </div>
          <div>
            <b>Petugas Picking:</b> ____________________
          </div>
          <div>
            <b>Petugas QC / Packing:</b> ____________________
          </div>
        </div>

        {/* Orders Table */}
        <table className="w-full border-collapse text-[9.5px]">
          <thead>
            <tr className="bg-gray-200 border-y border-black font-bold">
              <th className="p-1.5 text-left w-6 border-r border-black">No</th>
              <th className="p-1.5 text-left w-24 border-r border-black">Order ID / Resi</th>
              <th className="p-1.5 text-left w-36 border-r border-black">Pelanggan & Tujuan</th>
              <th className="p-1.5 text-left w-24 border-r border-black">Ekspedisi</th>
              <th className="p-1.5 text-left border-r border-black">Daftar Item (SKU - Nama - Lokasi)</th>
              <th className="p-1.5 text-center w-12 border-r border-black">Qty</th>
              <th className="p-1.5 text-center w-12">Cek</th>
            </tr>
          </thead>
          <tbody>
            {displayOrders.map((order, orderIdx) => (
              <tr key={order.orderId} className="border-b border-black">
                <td className="p-1.5 align-top text-center border-r border-black font-mono font-bold">
                  {orderIdx + 1}
                </td>
                <td className="p-1.5 align-top border-r border-black font-mono">
                  <div className="font-bold">#{order.orderId}</div>
                  {order.resi && <div className="text-[8.5px] text-gray-700">{order.resi}</div>}
                  <div className="text-[8px] text-gray-500">{order.orderDate}</div>
                </td>
                <td className="p-1.5 align-top border-r border-black">
                  <div className="font-bold">{order.customer}</div>
                  <div className="text-[8.5px] text-gray-600">{order.phone}</div>
                  <div className="text-[8.5px] text-gray-700">{order.city}</div>
                </td>
                <td className="p-1.5 align-top border-r border-black font-bold">
                  {order.shippingMethod}
                </td>
                <td className="p-1.5 align-top border-r border-black">
                  <div className="space-y-1">
                    {order.items.map((it, itemIdx) => (
                      <div key={itemIdx} className="flex justify-between items-baseline gap-2">
                        <div>
                          <b className="font-mono">{it.sku}</b> - {it.namaProduk}
                          {it.lokasi && it.lokasi !== '-' && (
                            <span className="ml-1 font-bold">[Rak: {it.lokasi}]</span>
                          )}
                        </div>
                        <span className="font-mono font-bold shrink-0">{it.qty}x</span>
                      </div>
                    ))}
                  </div>
                </td>
                <td className="p-1.5 align-top text-center border-r border-black font-mono font-bold">
                  {order.items.reduce((s, it) => s + it.qty, 0)}
                </td>
                <td className="p-1.5 align-top text-center">
                  <div className="w-4 h-4 border border-black mx-auto mt-1" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
