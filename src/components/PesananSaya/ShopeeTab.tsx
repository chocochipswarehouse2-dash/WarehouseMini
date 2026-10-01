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
  ShoppingBag,
  ArrowRight,
  Scan,
  Camera,
  Clock,
  Video,
  CheckSquare,
  Square,
  RotateCcw,
  Share2,
  SlidersHorizontal,
  AlertTriangle,
  MapPin,
  User,
  Phone,
  Truck,
  Calendar,
  ChevronDown,
  ChevronRight,
  Play,
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
import { getShopeeOrders, saveShopeeOrders, getAllProductsFromLocalDb } from '../../services/localDb';
import { playSuccessBeep, playErrorBeep, playCategoryBeep, playNewTaskChime, vibrateDevice } from '../../services/audio';

export type ShopeeSystemStatus =
  | 'sedang_proses'
  | 'proses_picking'
  | 'proses_packing'
  | 'paket_ready'
  | 'paket_terkirim';

export type CustomSortOption =
  | 'opsi_pengiriman_no_pesanan'
  | 'waktu_pembayaran_asc'
  | 'waktu_pembayaran_desc'
  | 'no_pesanan_asc';

export type TipePesananFilter = 'ALL' | 'Reguler' | 'Instant' | 'Same Day' | 'Hemat' | 'Cargo';
export type BatasWaktuFilter = 'ALL' | 'TERLAMBAT' | 'KURANG_24_JAM' | 'LEBIH_24_JAM';

export interface ShopeeItem {
  namaProduk: string;
  namaVariasi: string;
  sku: string;
  qty: number;
  lokasi?: string;
  isMasterProduct?: boolean; // Flag to indicate if product is mapped to master catalog
  scannedQty?: number;
}

export interface ShopeeOrder {
  noPesanan: string;
  statusPesanan: string;
  noResi: string;
  opsiPengiriman: string; // Normalized Courier Name, e.g. "JNE Reguler", "SPX Standard"
  opsiPengirimanRaw?: string; // Original raw string from Excel
  tipePengiriman: 'Reguler' | 'Instant' | 'Same Day' | 'Hemat' | 'Cargo' | 'Lainnya';
  waktuPesananDibuat: string;
  waktuPembayaran?: string;
  batasWaktuPengiriman: string;
  catatanPembeli: string;
  catatan: string;
  usernamePembeli: string;
  namaPenerima: string;
  noTelepon: string;
  alamatPengiriman: string;
  kotaKabupaten: string;
  provinsi: string;
  items: ShopeeItem[];

  status_sistem: ShopeeSystemStatus;
  tanggal_proses: string; // Tanggal auto import data (tidak ikut tercetak di SJ)
  tanggal_upload?: string;

  // Tracking timestamps
  waktu_picking?: string;
  waktu_packing?: string; // Timestamp packing di bawah CCTV (e.g. "01/10/2026 14:15:30 WIB")
  cctv_timestamp_tag?: string; // Format pencarian CCTV (e.g. "[CCTV: 2026-10-01 14:15:30]")
  operator_packing?: string;
  waktu_terkirim?: string;
  operator_kirim?: string;
}

interface ShopeeTabProps {
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

/**
 * Normalisasi Cerdas Opsi Pengiriman Shopee
 * Menggabungkan berbagai variasi penulisan seperti:
 * - "Reguler (Cashless)-JNE Reguler" & "JNE Reguler" -> "JNE Reguler"
 * - "Reguler (Cashless) - SPX Standard" & "SPX Standard" -> "SPX Standard"
 * - "Instant - GrabExpress Instant" & "GrabExpress Instant" -> "GrabExpress Instant"
 * - "Same Day - GoSend Same Day" & "GoSend Same Day" -> "GoSend Same Day"
 */
export function normalizeCourier(raw: string): {
  courierName: string;
  tipe: 'Reguler' | 'Instant' | 'Same Day' | 'Hemat' | 'Cargo' | 'Lainnya';
} {
  const s = (raw || '').trim();
  const lower = s.toLowerCase();

  // 1. Tipe Pesanan
  let tipe: 'Reguler' | 'Instant' | 'Same Day' | 'Hemat' | 'Cargo' | 'Lainnya' = 'Reguler';
  if (lower.includes('instant')) tipe = 'Instant';
  else if (lower.includes('same day') || lower.includes('sameday')) tipe = 'Same Day';
  else if (lower.includes('hemat') || lower.includes('economy')) tipe = 'Hemat';
  else if (lower.includes('cargo') || lower.includes('kargo')) tipe = 'Cargo';
  else if (lower.includes('reguler') || lower.includes('standard') || lower.includes('standar')) tipe = 'Reguler';

  // 2. Normalisasi Nama Jasa Kirim
  let courierName = s;

  if (lower.includes('jne reguler') || lower.includes('jne cashless') || lower.includes('jne reg')) {
    courierName = 'JNE Reguler';
  } else if (lower.includes('jne yes')) {
    courierName = 'JNE YES';
  } else if (lower.includes('spx standard') || lower.includes('spx standar') || lower.includes('shopee xpress standard')) {
    courierName = 'SPX Standard';
  } else if (lower.includes('spx hemat') || lower.includes('shopee xpress hemat')) {
    courierName = 'SPX Hemat';
  } else if (lower.includes('spx instant') || lower.includes('shopee xpress instant')) {
    courierName = 'SPX Instant';
  } else if (lower.includes('spx sameday') || lower.includes('spx same day')) {
    courierName = 'SPX Sameday';
  } else if (lower.includes('gosend instant') || lower.includes('go-send instant')) {
    courierName = 'GoSend Instant';
  } else if (lower.includes('gosend same day') || lower.includes('go-send same day') || lower.includes('gosend sameday')) {
    courierName = 'GoSend Same Day';
  } else if (lower.includes('grabexpress instant') || lower.includes('grab instant')) {
    courierName = 'GrabExpress Instant';
  } else if (lower.includes('grabexpress sameday') || lower.includes('grab same day')) {
    courierName = 'GrabExpress Sameday';
  } else if (lower.includes('sicepat reg') || lower.includes('sicepat reguler') || lower.includes('sicepat gokil')) {
    courierName = 'SiCepat REG';
  } else if (lower.includes('j&t express') || lower.includes('jnt express')) {
    courierName = 'J&T Express';
  } else if (lower.includes('j&t cargo') || lower.includes('jnt cargo')) {
    courierName = 'J&T Cargo';
  } else {
    // Strip common prefixes
    courierName = s.replace(/^(Reguler\s*\(Cashless\)\s*[-:]?\s*|Hemat\s*[-:]?\s*|Instant\s*[-:]?\s*|Same\s*Day\s*[-:]?\s*)/i, '').trim() || s;
  }

  return { courierName, tipe };
}

/**
 * Pembersih Judul Produk Marketplace jika belum ada di master produk
 * Menghilangkan kata kunci SEO panjang e.g. "Chocochips - Unai Set / Setelan Wanita..." -> "Unai Set"
 */
function cleanMarketplaceTitle(title: string): string {
  if (!title) return '';
  let cleaned = title.trim();
  // Remove "Chocochips - " prefix
  cleaned = cleaned.replace(/^chocochips\s*[-–—:]\s*/i, '');
  // Take part before first slash or dash if it's long SEO keywords
  const parts = cleaned.split(/[\/|]/);
  if (parts.length > 1 && parts[0].trim().length > 3) {
    return parts[0].trim();
  }
  return cleaned;
}

export const ShopeeTab: React.FC<ShopeeTabProps> = ({ onShowToast }) => {
  const [orders, setOrders] = useState<ShopeeOrder[]>([]);
  const [activeTab, setActiveTab] = useState<ShopeeSystemStatus>('sedang_proses');
  const [searchTerm, setSearchTerm] = useState('');

  // 3-Level Filters (Sesuai Seller Center Shopee)
  const [filterTipePesanan, setFilterTipePesanan] = useState<TipePesananFilter>('ALL');
  const [filterBatasWaktu, setFilterBatasWaktu] = useState<BatasWaktuFilter>('ALL');
  const [selectedOpsiPengiriman, setSelectedOpsiPengiriman] = useState<string>('ALL');

  const [customSort, setCustomSort] = useState<CustomSortOption>('opsi_pengiriman_no_pesanan');
  const [loading, setLoading] = useState(false);
  const [isSyncingMaster, setIsSyncingMaster] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  // Packing Modal State
  const [packingModalOrder, setPackingModalOrder] = useState<ShopeeOrder | null>(null);
  const [packingScans, setPackingScans] = useState<Record<string, number>>({});
  const [packingBarcodeScan, setPackingBarcodeScan] = useState('');

  // Ready Tab Fast Dispatch Scan Input
  const [readyDispatchScan, setReadyDispatchScan] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const packingInputRef = useRef<HTMLInputElement>(null);
  const readyScanInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadOrders();
  }, []);

  // Focus packing barcode input when modal opens
  useEffect(() => {
    if (packingModalOrder && packingInputRef.current) {
      setTimeout(() => packingInputRef.current?.focus(), 150);
    }
  }, [packingModalOrder]);

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await getShopeeOrders();
      // Normalize existing orders
      const normalized: ShopeeOrder[] = (data || []).map((o: any) => {
        let status_sistem: ShopeeSystemStatus = o.status_sistem || 'sedang_proses';
        if (status_sistem === ('uploaded' as any) || status_sistem === ('diproses' as any)) {
          status_sistem = 'sedang_proses';
        } else if (status_sistem === ('on_progress' as any)) {
          status_sistem = 'proses_picking';
        }

        const normCourier = normalizeCourier(o.opsiPengiriman || o.opsiPengirimanRaw || '');

        return {
          ...o,
          opsiPengiriman: normCourier.courierName,
          opsiPengirimanRaw: o.opsiPengirimanRaw || o.opsiPengiriman,
          tipePengiriman: o.tipePengiriman || normCourier.tipe,
          status_sistem,
          tanggal_proses: o.tanggal_proses || o.tanggal_upload || new Date().toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' }),
        };
      });
      setOrders(normalized);
    } catch (e) {
      console.error(e);
      onShowToast('Gagal memuat data pesanan Shopee', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Sinkronkan Ulang Semua Data Shopee ke Master Database Produk Lokal
  const handleSyncMasterProducts = async () => {
    setIsSyncingMaster(true);
    try {
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

      let updatedCount = 0;
      let missingMasterCount = 0;

      const updatedOrders = orders.map((order) => {
        let orderChanged = false;
        const nextItems = order.items.map((it) => {
          const rawSku = String(it.sku || '').trim().toUpperCase();
          const cleanSku = rawSku.replace(/[\s\-_]/g, '');
          const masterMatch = productMap.get(rawSku) || productMap.get(cleanSku);

          if (masterMatch) {
            orderChanged = true;
            updatedCount++;
            return {
              ...it,
              namaProduk: masterMatch.nama,
              lokasi: masterMatch.lokasi || it.lokasi || '-',
              isMasterProduct: true,
            };
          } else {
            missingMasterCount++;
            return {
              ...it,
              isMasterProduct: false,
            };
          }
        });

        return orderChanged ? { ...order, items: nextItems } : order;
      });

      await saveShopeeOrders(updatedOrders);
      setOrders(updatedOrders);

      if (updatedCount > 0) {
        onShowToast(`Sinkronisasi sukses! ${updatedCount} SKU berhasil dicocokkan ke master produk.`, 'success');
        playSuccessBeep();
      } else {
        onShowToast(`Sinkronisasi selesai. Terdapat ${missingMasterCount} item yang belum terdaftar di Master Database.`, 'info');
      }
    } catch (err) {
      console.error(err);
      onShowToast('Gagal melakukan sinkronisasi master produk', 'error');
    } finally {
      setIsSyncingMaster(false);
    }
  };

  // Helper Custom Sort Function
  const sortOrderList = (list: ShopeeOrder[], sortType: CustomSortOption): ShopeeOrder[] => {
    return [...list].sort((a, b) => {
      if (sortType === 'opsi_pengiriman_no_pesanan') {
        const opsiA = (a.opsiPengiriman || '').toLowerCase();
        const opsiB = (b.opsiPengiriman || '').toLowerCase();
        if (opsiA !== opsiB) return opsiA.localeCompare(opsiB);
        return (a.noPesanan || '').localeCompare(b.noPesanan || '');
      }

      if (sortType === 'waktu_pembayaran_asc') {
        const tglA = a.waktuPembayaran || a.waktuPesananDibuat || '';
        const tglB = b.waktuPembayaran || b.waktuPesananDibuat || '';
        if (tglA !== tglB) return tglA.localeCompare(tglB);
        return (a.noPesanan || '').localeCompare(b.noPesanan || '');
      }

      if (sortType === 'waktu_pembayaran_desc') {
        const tglA = a.waktuPembayaran || a.waktuPesananDibuat || '';
        const tglB = b.waktuPembayaran || b.waktuPesananDibuat || '';
        if (tglA !== tglB) return tglB.localeCompare(tglA);
        return (a.noPesanan || '').localeCompare(b.noPesanan || '');
      }

      if (sortType === 'no_pesanan_asc') {
        return (a.noPesanan || '').localeCompare(b.noPesanan || '');
      }

      return 0;
    });
  };

  // Helper Batas Waktu Calculator
  const getBatasWaktuStatus = (batasWaktuStr: string): 'TERLAMBAT' | 'KURANG_24_JAM' | 'LEBIH_24_JAM' | 'UNKNOWN' => {
    if (!batasWaktuStr) return 'UNKNOWN';
    try {
      const deadline = new Date(batasWaktuStr.replace(' ', 'T'));
      if (isNaN(deadline.getTime())) return 'UNKNOWN';
      const now = new Date();
      const diffMs = deadline.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours < 0) return 'TERLAMBAT';
      if (diffHours <= 24) return 'KURANG_24_JAM';
      return 'LEBIH_24_JAM';
    } catch {
      return 'UNKNOWN';
    }
  };

  // Unique Normalized Opsi Pengiriman list for active tab
  const uniqueOpsiPengiriman = useMemo(() => {
    const tabOrders = orders.filter((o) => o.status_sistem === activeTab);
    const set = new Set<string>();
    tabOrders.forEach((o) => {
      if (o.opsiPengiriman) set.add(o.opsiPengiriman.trim());
    });
    return Array.from(set).sort();
  }, [orders, activeTab]);

  // Filtered & Sorted orders for the active tab
  const displayOrders = useMemo(() => {
    let list = orders.filter((o) => o.status_sistem === activeTab);

    // 1. Filter Tipe Pesanan
    if (filterTipePesanan !== 'ALL') {
      list = list.filter((o) => o.tipePengiriman === filterTipePesanan);
    }

    // 2. Filter Batas Pengiriman
    if (filterBatasWaktu !== 'ALL') {
      list = list.filter((o) => {
        const st = getBatasWaktuStatus(o.batasWaktuPengiriman);
        return st === filterBatasWaktu;
      });
    }

    // 3. Filter Jasa Kirim / Opsi Pengiriman
    if (selectedOpsiPengiriman !== 'ALL') {
      list = list.filter((o) => (o.opsiPengiriman || '').trim() === selectedOpsiPengiriman);
    }

    // 4. Filter by search term
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      list = list.filter(
        (o) =>
          (o.noPesanan || '').toLowerCase().includes(q) ||
          (o.noResi || '').toLowerCase().includes(q) ||
          (o.namaPenerima || '').toLowerCase().includes(q) ||
          (o.opsiPengiriman || '').toLowerCase().includes(q) ||
          (o.cctv_timestamp_tag || '').toLowerCase().includes(q) ||
          o.items.some(
            (it) =>
              (it.sku || '').toLowerCase().includes(q) ||
              (it.namaProduk || '').toLowerCase().includes(q) ||
              (it.lokasi || '').toLowerCase().includes(q)
          )
      );
    }

    // Custom Sort
    return sortOrderList(list, customSort);
  }, [orders, activeTab, filterTipePesanan, filterBatasWaktu, selectedOpsiPengiriman, searchTerm, customSort]);

  // Handle Excel Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json<any>(ws, { header: 1 });

        if (data.length < 2) {
          onShowToast('File Excel kosong atau format tidak sesuai', 'error');
          setLoading(false);
          return;
        }

        const headers = (data[0] || []) as string[];
        const rows = data.slice(1);

        const getColIndex = (name: string) =>
          headers.findIndex((h) => h && h.toString().toLowerCase().includes(name.toLowerCase()));

        const idxNoPesanan = getColIndex('No. Pesanan');
        const idxStatus = getColIndex('Status Pesanan');
        const idxResi = getColIndex('No. Resi');
        const idxOpsiPengiriman = getColIndex('Opsi Pengiriman');
        const idxWaktuBuat = getColIndex('Waktu Pesanan Dibuat');
        const idxWaktuBayar = getColIndex('Waktu Pembayaran Dilakukan');
        const idxBatasWaktu = getColIndex('Batas Waktu Pengiriman');
        const idxCatatanPembeli = getColIndex('Catatan dari Pembeli');
        const idxCatatan = getColIndex('Catatan');
        const idxUsername = getColIndex('Username (Pembeli)');
        const idxNamaPenerima = getColIndex('Nama Penerima');
        const idxNoTelp = getColIndex('No. Telepon');
        const idxAlamat = getColIndex('Alamat Pengiriman');
        const idxKota = getColIndex('Kota/Kabupaten');
        const idxProvinsi = getColIndex('Provinsi');

        const idxNamaProduk = getColIndex('Nama Produk');
        const idxNamaVariasi = getColIndex('Nama Variasi');
        const idxSku = getColIndex('Nomor Referensi SKU');
        const idxQty = getColIndex('Jumlah');

        if (idxNoPesanan === -1) {
          onShowToast('Kolom No. Pesanan tidak ditemukan. Pastikan format export Shopee asli.', 'error');
          setLoading(false);
          return;
        }

        // Fetch master products for Name and Location lookup
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

        // Load existing orders to check duplicates
        const existingOrders = await getShopeeOrders();
        const existingIds = new Set(existingOrders.map((o) => o.noPesanan));

        const nowImportDate = new Date().toLocaleString('id-ID', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        const orderMap = new Map<string, ShopeeOrder>();
        let duplicateCount = 0;
        let matchedMasterCount = 0;
        let unmatchedMasterCount = 0;

        for (const row of rows) {
          if (!row[idxNoPesanan]) continue;

          const noPesanan = String(row[idxNoPesanan] || '').trim();
          if (!noPesanan) continue;

          if (existingIds.has(noPesanan)) {
            duplicateCount++;
            continue;
          }

          const rawSku = String(row[idxSku] || '').trim().toUpperCase();
          const cleanSku = rawSku.replace(/[\s\-_]/g, '');
          const masterMatch = productMap.get(rawSku) || productMap.get(cleanSku);

          let finalNamaProduk = '';
          let finalLokasi = '-';
          let isMasterProduct = false;

          if (masterMatch) {
            finalNamaProduk = masterMatch.nama;
            finalLokasi = masterMatch.lokasi || '-';
            isMasterProduct = true;
            matchedMasterCount++;
          } else {
            // Clean marketplace long title
            const rawMarketTitle = String(row[idxNamaProduk] || '').trim();
            finalNamaProduk = cleanMarketplaceTitle(rawMarketTitle) || rawMarketTitle || rawSku;
            isMasterProduct = false;
            unmatchedMasterCount++;
          }

          const item: ShopeeItem = {
            namaProduk: finalNamaProduk,
            namaVariasi: String(row[idxNamaVariasi] || '').trim(),
            sku: rawSku,
            qty: parseInt(row[idxQty] || '1', 10) || 1,
            lokasi: finalLokasi,
            isMasterProduct,
          };

          const rawCourier = String(row[idxOpsiPengiriman] || '').trim();
          const normCourier = normalizeCourier(rawCourier);

          if (orderMap.has(noPesanan)) {
            const existingOrder = orderMap.get(noPesanan)!;
            existingOrder.items.push(item);
          } else {
            const waktuPesananDibuat = String(row[idxWaktuBuat] || '').trim();
            const waktuPembayaran = idxWaktuBayar !== -1 ? String(row[idxWaktuBayar] || '').trim() : waktuPesananDibuat;

            orderMap.set(noPesanan, {
              noPesanan,
              statusPesanan: String(row[idxStatus] || '').trim(),
              noResi: String(row[idxResi] || '').trim(),
              opsiPengiriman: normCourier.courierName, // NORMALISASI NAMA KURIR
              opsiPengirimanRaw: rawCourier,
              tipePengiriman: normCourier.tipe,
              waktuPesananDibuat,
              waktuPembayaran: waktuPembayaran || waktuPesananDibuat,
              batasWaktuPengiriman: idxBatasWaktu !== -1 ? String(row[idxBatasWaktu] || '').trim() : '',
              catatanPembeli: String(row[idxCatatanPembeli] || '').trim(),
              catatan: String(row[idxCatatan] || '').trim(),
              usernamePembeli: String(row[idxUsername] || '').trim(),
              namaPenerima: String(row[idxNamaPenerima] || '').trim(),
              noTelepon: String(row[idxNoTelp] || '').trim(),
              alamatPengiriman: String(row[idxAlamat] || '').trim(),
              kotaKabupaten: String(row[idxKota] || '').trim(),
              provinsi: String(row[idxProvinsi] || '').trim(),
              items: [item],
              status_sistem: 'sedang_proses', // LANGSUNG MASUK KE STATUS SEDANG PROSES
              tanggal_proses: nowImportDate, // AUTO TANGGAL IMPORT DATA
            });
          }
        }

        const newOrdersList = Array.from(orderMap.values());
        if (newOrdersList.length > 0) {
          const sortedNewOrders = sortOrderList(newOrdersList, customSort);
          await saveShopeeOrders(sortedNewOrders);
          onShowToast(`Berhasil mengimpor ${sortedNewOrders.length} pesanan baru ke "Sedang Proses"`, 'success');
          playSuccessBeep();
        }

        if (duplicateCount > 0) {
          onShowToast(`${duplicateCount} baris diabaikan karena nomor pesanan sudah pernah diimport`, 'info');
        }

        if (unmatchedMasterCount > 0) {
          onShowToast(`${unmatchedMasterCount} item belum ada di Master Katalog (menggunakan nama ringkas)`, 'warning');
        }

        if (newOrdersList.length === 0 && duplicateCount === 0) {
          onShowToast('Tidak ada data pesanan baru yang valid', 'warning');
        }

        await loadOrders();
        setActiveTab('sedang_proses');
      } catch (err) {
        console.error(err);
        onShowToast('Gagal memproses file Excel Shopee', 'error');
        playErrorBeep();
      } finally {
        setLoading(false);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsBinaryString(file);
  };

  // Cetak Surat Jalan Picking List A4 Portrait
  const handlePrintPickingList = () => {
    const ordersToPrint = displayOrders;
    if (ordersToPrint.length === 0) {
      onShowToast('Tidak ada data pesanan untuk dicetak', 'warning');
      return;
    }

    setTimeout(() => {
      window.print();
    }, 300);
  };

  // Pindahkan Status Pesanan (Single or Selected or All Filtered)
  const handleUpdateOrderStatus = async (
    targetNoPesanans: string[],
    newStatus: ShopeeSystemStatus,
    customMsg?: string
  ) => {
    if (targetNoPesanans.length === 0) return;

    const nowStr = new Date().toLocaleString('id-ID', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    const updated = orders.map((o) => {
      if (targetNoPesanans.includes(o.noPesanan)) {
        const up: ShopeeOrder = { ...o, status_sistem: newStatus };
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

    await saveShopeeOrders(updated);
    await loadOrders();
    setSelectedOrders(new Set());

    onShowToast(customMsg || `${targetNoPesanans.length} pesanan dialihkan ke ${newStatus.replace('_', ' ').toUpperCase()}`, 'success');
    playSuccessBeep();
  };

  // Hapus Pesanan
  const handleDeleteOrders = async (targetNoPesanans: string[]) => {
    if (targetNoPesanans.length === 0) return;
    if (!window.confirm(`Yakin ingin menghapus ${targetNoPesanans.length} pesanan dari sistem?`)) return;

    const remaining = orders.filter((o) => !targetNoPesanans.includes(o.noPesanan));
    await saveShopeeOrders(remaining);
    await loadOrders();
    setSelectedOrders(new Set());
    onShowToast(`${targetNoPesanans.length} pesanan berhasil dihapus`, 'info');
  };

  // Open Packing Modal for a specific order
  const handleOpenPackingModal = (order: ShopeeOrder) => {
    setPackingModalOrder(order);
    // Initialize scan counts
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
          [matchedItem.sku]: (prev[matchedItem.sku] || 0) + 1,
        }));
        playSuccessBeep();
        vibrateDevice(50);
        onShowToast(`Scanned: ${matchedItem.sku} (${currentQty + 1}/${matchedItem.qty})`, 'success');
      }
    } else {
      playErrorBeep();
      vibrateDevice([150, 50, 150]);
      onShowToast(`SKU Barcode "${query}" TIDAK ADA di pesanan ini!`, 'error');
    }
    setPackingBarcodeScan('');
  };

  // Check if packing modal items are 100% matched
  const isPackingComplete = useMemo(() => {
    if (!packingModalOrder) return false;
    return packingModalOrder.items.every((it) => (packingScans[it.sku] || 0) >= it.qty);
  }, [packingModalOrder, packingScans]);

  // Complete Packing with Precision CCTV Timestamp
  const handleCompletePackingWithCctv = async () => {
    if (!packingModalOrder) return;

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const cctvDateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const formattedCctvTimestamp = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} WIB`;
    const cctvTag = `[CCTV: ${cctvDateStr}]`;

    const updated = orders.map((o) => {
      if (o.noPesanan === packingModalOrder.noPesanan) {
        return {
          ...o,
          status_sistem: 'paket_ready' as ShopeeSystemStatus,
          waktu_packing: formattedCctvTimestamp,
          cctv_timestamp_tag: cctvTag,
        };
      }
      return o;
    });

    await saveShopeeOrders(updated);
    await loadOrders();
    setPackingModalOrder(null);
    playNewTaskChime();
    onShowToast(`Pesanan ${packingModalOrder.noPesanan} SELESAI PACKING! Timestamp CCTV: ${cctvTag}`, 'success');
  };

  // Fast Dispatch Barcode Scan in "Paket Ready" tab
  const handleReadyDispatchScanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = readyDispatchScan.trim().toLowerCase();
    if (!query) return;

    const target = orders.find(
      (o) =>
        o.status_sistem === 'paket_ready' &&
        (o.noPesanan.toLowerCase() === query || (o.noResi && o.noResi.toLowerCase() === query))
    );

    if (target) {
      await handleUpdateOrderStatus(
        [target.noPesanan],
        'paket_terkirim',
        `Paket ${target.noPesanan} (${target.noResi || target.opsiPengiriman}) BERHASIL DISERAHKAN KE KURIR / TERKIRIM!`
      );
      setReadyDispatchScan('');
    } else {
      playErrorBeep();
      onShowToast(`Paket dengan Resi / No. Pesanan "${readyDispatchScan}" tidak ditemukan di tab "Paket Ready"`, 'error');
      setReadyDispatchScan('');
    }
  };

  // Copy CCTV tag to clipboard
  const handleCopyCctv = (tag?: string) => {
    if (!tag) return;
    navigator.clipboard.writeText(tag);
    onShowToast(`Tag CCTV "${tag}" disalin ke clipboard`, 'info');
  };

  // Checkbox Selection Toggle
  const toggleSelectOrder = (noPesanan: string) => {
    const next = new Set(selectedOrders);
    if (next.has(noPesanan)) next.delete(noPesanan);
    else next.add(noPesanan);
    setSelectedOrders(next);
  };

  const toggleSelectAll = () => {
    if (selectedOrders.size === displayOrders.length) {
      setSelectedOrders(new Set());
    } else {
      setSelectedOrders(new Set(displayOrders.map((o) => o.noPesanan)));
    }
  };

  // Tab Badge Counters
  const tabOrdersOnly = orders.filter((o) => o.status_sistem === activeTab);
  const countSedangProses = orders.filter((o) => o.status_sistem === 'sedang_proses').length;
  const countPicking = orders.filter((o) => o.status_sistem === 'proses_picking').length;
  const countPacking = orders.filter((o) => o.status_sistem === 'proses_packing').length;
  const countReady = orders.filter((o) => o.status_sistem === 'paket_ready').length;
  const countTerkirim = orders.filter((o) => o.status_sistem === 'paket_terkirim').length;

  // Filter 1: Tipe Pesanan Counters
  const countTipeReguler = tabOrdersOnly.filter((o) => o.tipePengiriman === 'Reguler').length;
  const countTipeInstant = tabOrdersOnly.filter((o) => o.tipePengiriman === 'Instant').length;
  const countTipeSameDay = tabOrdersOnly.filter((o) => o.tipePengiriman === 'Same Day').length;
  const countTipeHemat = tabOrdersOnly.filter((o) => o.tipePengiriman === 'Hemat').length;
  const countTipeCargo = tabOrdersOnly.filter((o) => o.tipePengiriman === 'Cargo').length;

  // Filter 2: Batas Waktu Counters
  const countBatasTerlambat = tabOrdersOnly.filter((o) => getBatasWaktuStatus(o.batasWaktuPengiriman) === 'TERLAMBAT').length;
  const countBatasKurang24 = tabOrdersOnly.filter((o) => getBatasWaktuStatus(o.batasWaktuPengiriman) === 'KURANG_24_JAM').length;
  const countBatasLebih24 = tabOrdersOnly.filter((o) => getBatasWaktuStatus(o.batasWaktuPengiriman) === 'LEBIH_24_JAM').length;

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/50">
      {/* ========================================================================= */}
      {/* CSS PRINT A4 PORTRAIT PICKING LIST */}
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
          #shopee-print-area, #shopee-print-area * {
            visibility: visible !important;
          }
          #shopee-print-area {
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
          className={`py-3.5 px-2.5 sm:px-4 text-xs sm:text-sm font-extrabold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'sedang_proses'
              ? 'border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50/50 dark:bg-orange-950/20'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-orange-500" />
          <span>Sedang Proses</span>
          <span className="bg-orange-100 dark:bg-orange-950/80 text-orange-700 dark:text-orange-300 font-black py-0.5 px-2 rounded-full text-[11px]">
            {countSedangProses}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('proses_picking');
            setSelectedOrders(new Set());
          }}
          className={`py-3.5 px-2.5 sm:px-4 text-xs sm:text-sm font-extrabold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'proses_picking'
              ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <ShoppingBag className="w-4 h-4 text-blue-500" />
          <span>Proses Picking</span>
          <span className="bg-blue-100 dark:bg-blue-950/80 text-blue-700 dark:text-blue-300 font-black py-0.5 px-2 rounded-full text-[11px]">
            {countPicking}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('proses_packing');
            setSelectedOrders(new Set());
          }}
          className={`py-3.5 px-2.5 sm:px-4 text-xs sm:text-sm font-extrabold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'proses_packing'
              ? 'border-purple-500 text-purple-600 dark:text-purple-400 bg-purple-50/50 dark:bg-purple-950/20'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Video className="w-4 h-4 text-purple-500" />
          <span>Proses Packing (CCTV)</span>
          <span className="bg-purple-100 dark:bg-purple-950/80 text-purple-700 dark:text-purple-300 font-black py-0.5 px-2 rounded-full text-[11px]">
            {countPacking}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('paket_ready');
            setSelectedOrders(new Set());
          }}
          className={`py-3.5 px-2.5 sm:px-4 text-xs sm:text-sm font-extrabold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'paket_ready'
              ? 'border-emerald-500 text-emerald-600 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Package className="w-4 h-4 text-emerald-500" />
          <span>Paket Ready</span>
          <span className="bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-black py-0.5 px-2 rounded-full text-[11px]">
            {countReady}
          </span>
        </button>

        <button
          onClick={() => {
            setActiveTab('paket_terkirim');
            setSelectedOrders(new Set());
          }}
          className={`py-3.5 px-2.5 sm:px-4 text-xs sm:text-sm font-extrabold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 cursor-pointer ${
            activeTab === 'paket_terkirim'
              ? 'border-slate-700 text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <Truck className="w-4 h-4 text-slate-500" />
          <span>Paket Terkirim</span>
          <span className="bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-black py-0.5 px-2 rounded-full text-[11px]">
            {countTerkirim}
          </span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* MAIN CONTENT AREA */}
      {/* ========================================================================= */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-5 print:hidden space-y-4">
        {/* ACTION HEADER TOOLBAR */}
        <div className="bg-white dark:bg-[#131d31] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-500">
                <ShoppingBag className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                  Pesanan Shopee
                  <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 rounded-md font-bold uppercase">
                    {activeTab.replace('_', ' ')}
                  </span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {activeTab === 'sedang_proses' && 'Data pesanan baru hasil import Excel langsung siap disortir dan dicetak Surat Jalan Picking.'}
                  {activeTab === 'proses_picking' && 'Daftar pesanan yang sedang diambil barangnya di rak gudang oleh tim picking.'}
                  {activeTab === 'proses_packing' && 'Validasi scan barang per paket dengan pencatatan timestamp rekaman CCTV gudang.'}
                  {activeTab === 'paket_ready' && 'Paket tersegel siap diserahkan ke kurir ekspedisi. Scan resi untuk serah terima instan.'}
                  {activeTab === 'paket_terkirim' && 'Riwayat paket yang telah berhasil dipickup dan dikirim oleh kurir ekspedisi.'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
            {/* Hidden File Input for Excel Import */}
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls"
              className="hidden"
              onChange={handleFileUpload}
            />

            {/* TAB: SEDANG PROSES ACTIONS */}
            {activeTab === 'sedang_proses' && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  <Upload className="w-4 h-4" />
                  <span>Import Excel Shopee</span>
                </button>

                <button
                  type="button"
                  onClick={handleSyncMasterProducts}
                  disabled={isSyncingMaster || orders.length === 0}
                  className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
                  title="Cocokkan ulang seluruh nama produk & lokasi rak dengan Master Katalog Database"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${isSyncingMaster ? 'animate-spin' : ''}`} />
                  <span>Sinkron Master</span>
                </button>

                <button
                  type="button"
                  onClick={handlePrintPickingList}
                  disabled={displayOrders.length === 0}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
                  title="Cetak Surat Jalan Picking List format A4 Portrait sesuai urutan custom sort"
                >
                  <Printer className="w-4 h-4 text-orange-400" />
                  <span>
                    Cetak SJ Picking {selectedOpsiPengiriman !== 'ALL' ? `(${selectedOpsiPengiriman})` : '(Semua)'}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const targetIds = selectedOrders.size > 0 ? Array.from(selectedOrders) : displayOrders.map((o) => o.noPesanan);
                    handleUpdateOrderStatus(targetIds, 'proses_picking', `${targetIds.length} pesanan dipindahkan ke PROSES PICKING!`);
                  }}
                  disabled={displayOrders.length === 0}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  <Play className="w-4 h-4" />
                  <span>Kirim Tugas Picking {selectedOrders.size > 0 ? `(${selectedOrders.size})` : ''}</span>
                </button>
              </>
            )}

            {/* TAB: PROSES PICKING ACTIONS */}
            {activeTab === 'proses_picking' && (
              <>
                <button
                  type="button"
                  onClick={handlePrintPickingList}
                  disabled={displayOrders.length === 0}
                  className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
                >
                  <Printer className="w-4 h-4 text-blue-500" />
                  <span>Cetak Ulang SJ</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const targetIds = selectedOrders.size > 0 ? Array.from(selectedOrders) : displayOrders.map((o) => o.noPesanan);
                    handleUpdateOrderStatus(targetIds, 'proses_packing', `${targetIds.length} pesanan dialihkan ke PROSES PACKING!`);
                  }}
                  disabled={displayOrders.length === 0}
                  className="px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>Selesai Picking → Kirim ke Packing {selectedOrders.size > 0 ? `(${selectedOrders.size})` : ''}</span>
                </button>
              </>
            )}

            {/* TAB: PAKET READY ACTIONS */}
            {activeTab === 'paket_ready' && (
              <button
                type="button"
                onClick={() => {
                  const targetIds = selectedOrders.size > 0 ? Array.from(selectedOrders) : displayOrders.map((o) => o.noPesanan);
                  handleUpdateOrderStatus(targetIds, 'paket_terkirim', `${targetIds.length} paket ditandai TERKIRIM!`);
                }}
                disabled={displayOrders.length === 0}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-50 active:scale-95"
              >
                <Truck className="w-4 h-4" />
                <span>Tandai Terkirim {selectedOrders.size > 0 ? `(${selectedOrders.size})` : ''}</span>
              </button>
            )}

            {/* DELETE BULK BUTTON */}
            {selectedOrders.size > 0 && (
              <button
                type="button"
                onClick={() => handleDeleteOrders(Array.from(selectedOrders))}
                className="px-3 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:hover:bg-rose-900/60 dark:text-rose-400 font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                title="Hapus pesanan terpilih"
              >
                <Trash2 className="w-4 h-4" />
                <span>Hapus ({selectedOrders.size})</span>
              </button>
            )}
          </div>
        </div>

        {/* ========================================================================= */}
        {/* FAST SCAN BARCODE PANEL FOR PACKING & DISPATCH */}
        {/* ========================================================================= */}
        {activeTab === 'proses_packing' && (
          <div className="bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-transparent border border-purple-300 dark:border-purple-800/60 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="p-2.5 rounded-xl bg-purple-500 text-white shadow-xs shrink-0">
                <Scan className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-purple-900 dark:text-purple-300 uppercase tracking-wider">
                  Scan Barcode Pengecekan Packing (Di Bawah CCTV)
                </h4>
                <p className="text-[11px] text-purple-700 dark:text-purple-400">
                  Scan No. Pesanan atau Resi untuk memulai validasi kecocokan barang & simpan rekaman CCTV.
                </p>
              </div>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const q = searchTerm.trim().toLowerCase();
                const matched = orders.find(
                  (o) =>
                    o.status_sistem === 'proses_packing' &&
                    (o.noPesanan.toLowerCase() === q || (o.noResi && o.noResi.toLowerCase() === q))
                );
                if (matched) {
                  handleOpenPackingModal(matched);
                  setSearchTerm('');
                } else {
                  onShowToast(`Pesanan/Resi "${searchTerm}" tidak ditemukan di tab Proses Packing`, 'warning');
                }
              }}
              className="flex items-center gap-2 w-full sm:w-80"
            >
              <input
                type="text"
                placeholder="SCAN RESI / NO. PESANAN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1 px-3 py-2 bg-white dark:bg-[#131d31] border-2 border-purple-400 dark:border-purple-600 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 text-purple-950 dark:text-purple-200"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-xs cursor-pointer"
              >
                Buka
              </button>
            </form>
          </div>
        )}

        {activeTab === 'paket_ready' && (
          <div className="bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent border border-emerald-300 dark:border-emerald-800/60 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="flex items-center gap-3 w-full sm:w-auto">
              <div className="p-2.5 rounded-xl bg-emerald-500 text-white shadow-xs shrink-0">
                <Truck className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-xs font-black text-emerald-900 dark:text-emerald-300 uppercase tracking-wider">
                  Scan Serah Terima Kurir (Instant Terkirim)
                </h4>
                <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                  Scan barcode resi paket saat kurir pickup untuk mengubah status menjadi Terkirim secara otomatis.
                </p>
              </div>
            </div>
            <form onSubmit={handleReadyDispatchScanSubmit} className="flex items-center gap-2 w-full sm:w-80">
              <input
                ref={readyScanInputRef}
                type="text"
                placeholder="SCAN RESI / NO. PESANAN KURIR..."
                value={readyDispatchScan}
                onChange={(e) => setReadyDispatchScan(e.target.value)}
                className="flex-1 px-3 py-2 bg-white dark:bg-[#131d31] border-2 border-emerald-400 dark:border-emerald-600 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500 text-emerald-950 dark:text-emerald-200"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl text-xs cursor-pointer"
              >
                Scan
              </button>
            </form>
          </div>
        )}

        {/* ========================================================================= */}
        {/* 3-LEVEL SELLER CENTER FILTERS & CUSTOM SORT (LEGA & TIDAK KETUTUP SCROLLBAR) */}
        {/* ========================================================================= */}
        <div className="bg-white dark:bg-[#131d31] p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          {/* Top Search & Custom Sort Row */}
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative w-full md:w-80">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Cari no pesanan, resi, penerima, SKU, CCTV..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-orange-500 text-slate-800 dark:text-white"
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

            {/* Custom Sort Selector */}
            <div className="flex items-center gap-2 w-full md:w-auto">
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-400 shrink-0">
                <ArrowUpDown className="w-3.5 h-3.5 text-orange-500" />
                <span>Custom Sort:</span>
              </div>
              <select
                value={customSort}
                onChange={(e) => setCustomSort(e.target.value as CustomSortOption)}
                className="flex-1 md:flex-none px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-extrabold text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-orange-500 cursor-pointer"
              >
                <option value="opsi_pengiriman_no_pesanan">1. Opsi Pengiriman + No. Pesanan</option>
                <option value="waktu_pembayaran_asc">2. Waktu Pembayaran (Terlama ke Terbaru)</option>
                <option value="waktu_pembayaran_desc">3. Waktu Pembayaran (Terbaru ke Terlama)</option>
                <option value="no_pesanan_asc">4. No. Pesanan (A-Z)</option>
              </select>
            </div>
          </div>

          {/* LEVEL 1: TIPE PESANAN FILTER */}
          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 w-28 shrink-0">
              Tipe Pesanan
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'ALL', label: 'Semua', count: tabOrdersOnly.length },
                { id: 'Reguler', label: 'Pesanan Reguler', count: countTipeReguler },
                { id: 'Instant', label: 'Instant', count: countTipeInstant },
                { id: 'Same Day', label: 'Same Day', count: countTipeSameDay },
                { id: 'Hemat', label: 'Hemat', count: countTipeHemat },
                { id: 'Cargo', label: 'Cargo', count: countTipeCargo },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setFilterTipePesanan(t.id as TipePesananFilter)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    filterTipePesanan === t.id
                      ? 'border-2 border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400 bg-white dark:bg-slate-800'
                  }`}
                >
                  <span>{t.label}</span>
                  <span className="opacity-75">({t.count})</span>
                </button>
              ))}
            </div>
          </div>

          {/* LEVEL 2: BATAS PENGIRIMAN FILTER */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 w-28 shrink-0">
              Batas Pengiriman
            </span>
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { id: 'ALL', label: 'Semua', count: tabOrdersOnly.length },
                { id: 'TERLAMBAT', label: 'Terlambat', count: countBatasTerlambat, alert: countBatasTerlambat > 0 },
                { id: 'KURANG_24_JAM', label: 'Kurang dari 24 jam', count: countBatasKurang24 },
                { id: 'LEBIH_24_JAM', label: 'Lebih dari 24 jam', count: countBatasLebih24 },
              ].map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => setFilterBatasWaktu(b.id as BatasWaktuFilter)}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    filterBatasWaktu === b.id
                      ? 'border-2 border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40'
                      : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400 bg-white dark:bg-slate-800'
                  } ${b.alert ? 'text-rose-600 border-rose-300' : ''}`}
                >
                  <span>{b.label}</span>
                  <span className="opacity-75">({b.count})</span>
                </button>
              ))}
            </div>
          </div>

          {/* LEVEL 3: JASA KIRIM (OPSI PENGIRIMAN NORMALISASI) */}
          <div className="flex flex-wrap items-start gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <span className="text-xs font-extrabold text-slate-500 dark:text-slate-400 w-28 shrink-0 pt-1">
              Jasa Kirim
            </span>
            <div className="flex flex-wrap items-center gap-1.5 flex-1">
              <button
                type="button"
                onClick={() => setSelectedOpsiPengiriman('ALL')}
                className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer ${
                  selectedOpsiPengiriman === 'ALL'
                    ? 'border-2 border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40'
                    : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400 bg-white dark:bg-slate-800'
                }`}
              >
                Semua Jasa Kirim ({tabOrdersOnly.length})
              </button>

              {uniqueOpsiPengiriman.map((courier) => {
                const count = tabOrdersOnly.filter((o) => (o.opsiPengiriman || '').trim() === courier).length;
                return (
                  <button
                    key={courier}
                    type="button"
                    onClick={() => setSelectedOpsiPengiriman(courier)}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                      selectedOpsiPengiriman === courier
                        ? 'border-2 border-orange-500 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 font-black'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400 bg-white dark:bg-slate-800'
                    }`}
                  >
                    <span>{courier}</span>
                    <span className="opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* ORDERS DATA TABLE */}
        {/* ========================================================================= */}
        <div className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-3.5 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70 dark:bg-slate-800/40">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleSelectAll}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 flex items-center gap-1.5 text-xs font-extrabold cursor-pointer"
              >
                {selectedOrders.size === displayOrders.length && displayOrders.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-orange-500" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400" />
                )}
                <span>Pilih Semua ({displayOrders.length} Pesanan)</span>
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs font-extrabold text-slate-500">
              {selectedOpsiPengiriman !== 'ALL' && (
                <span className="px-2 py-0.5 bg-orange-100 dark:bg-orange-950 text-orange-700 dark:text-orange-300 rounded font-black">
                  Filter: {selectedOpsiPengiriman}
                </span>
              )}
              <span>
                Total Qty: <b className="text-orange-600 dark:text-orange-400">{displayOrders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.qty, 0), 0)} pcs</b>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 text-slate-500 dark:text-slate-400 uppercase tracking-wider text-[10px] font-extrabold border-b border-slate-200 dark:border-slate-800">
                  <th className="p-3 text-center w-10">#</th>
                  <th className="p-3 w-12 text-center">No</th>
                  <th className="p-3 min-w-[150px]">No. Pesanan & Resi</th>
                  <th className="p-3 min-w-[130px]">Opsi Pengiriman</th>
                  <th className="p-3 min-w-[140px]">Tgl Proses (Auto Import)</th>
                  <th className="p-3 min-w-[140px]">Waktu Pembayaran / Buat</th>
                  <th className="p-3 min-w-[150px]">Penerima & Alamat</th>
                  <th className="p-3 min-w-[280px]">Item Pesanan & Lokasi Rak</th>
                  <th className="p-3 text-center w-16">Total Qty</th>
                  {activeTab === 'proses_packing' && <th className="p-3 text-center min-w-[120px]">Validasi Scan</th>}
                  {(activeTab === 'paket_ready' || activeTab === 'paket_terkirim') && (
                    <th className="p-3 min-w-[150px]">Timestamp CCTV</th>
                  )}
                  <th className="p-3 text-center min-w-[110px]">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {displayOrders.map((order, idx) => {
                  const isSelected = selectedOrders.has(order.noPesanan);
                  const totalQty = order.items.reduce((s, it) => s + it.qty, 0);

                  return (
                    <tr
                      key={order.noPesanan}
                      className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors ${
                        isSelected ? 'bg-orange-50/40 dark:bg-orange-950/20' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="p-3 text-center align-middle">
                        <button
                          type="button"
                          onClick={() => toggleSelectOrder(order.noPesanan)}
                          className="cursor-pointer text-slate-400 hover:text-orange-500"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-orange-500" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-300 dark:text-slate-600" />
                          )}
                        </button>
                      </td>

                      {/* Number */}
                      <td className="p-3 text-center font-bold text-slate-400 align-middle">
                        {idx + 1}
                      </td>

                      {/* No Pesanan & Resi */}
                      <td className="p-3 align-middle font-mono">
                        <div className="font-black text-slate-900 dark:text-white text-xs">
                          {order.noPesanan}
                        </div>
                        {order.noResi ? (
                          <div className="text-[11px] font-bold text-blue-600 dark:text-blue-400 mt-0.5 flex items-center gap-1">
                            <span>Resi: {order.noResi}</span>
                          </div>
                        ) : (
                          <div className="text-[10px] text-slate-400 italic mt-0.5">Belum ada resi</div>
                        )}
                      </td>

                      {/* Opsi Pengiriman Normalisasi */}
                      <td className="p-3 align-middle">
                        <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 font-extrabold text-[11px] border border-slate-200 dark:border-slate-700 block text-center truncate shadow-2xs">
                          {order.opsiPengiriman}
                        </span>
                      </td>

                      {/* TANGGAL PROSES (AUTO IMPORT) - Tidak tercetak di SJ */}
                      <td className="p-3 align-middle">
                        <div className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-bold">
                          <Calendar className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                          <span>{order.tanggal_proses || '-'}</span>
                        </div>
                        <span className="text-[9px] text-slate-400 block mt-0.5">Auto Import</span>
                      </td>

                      {/* Waktu Pembayaran / Waktu Buat */}
                      <td className="p-3 align-middle text-[11px] text-slate-600 dark:text-slate-300">
                        <div>
                          <span className="text-slate-400 font-bold">Bayar: </span>
                          <span className="font-mono font-bold">{order.waktuPembayaran || order.waktuPesananDibuat || '-'}</span>
                        </div>
                        {order.batasWaktuPengiriman && (
                          <div className="text-rose-500 font-bold text-[10px] mt-0.5">
                            Batas: {order.batasWaktuPengiriman}
                          </div>
                        )}
                      </td>

                      {/* Penerima & Alamat */}
                      <td className="p-3 align-middle">
                        <div className="font-extrabold text-slate-900 dark:text-white flex items-center gap-1">
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{order.namaPenerima}</span>
                        </div>
                        {order.noTelepon && (
                          <div className="text-[10px] font-mono text-slate-500 flex items-center gap-1 mt-0.5">
                            <Phone className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                            <span>{order.noTelepon}</span>
                          </div>
                        )}
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5" title={order.alamatPengiriman}>
                          {order.kotaKabupaten ? `${order.kotaKabupaten}, ${order.provinsi}` : order.alamatPengiriman}
                        </div>
                      </td>

                      {/* Items & Lokasi Rak */}
                      <td className="p-3 align-middle">
                        <div className="space-y-1.5 max-h-36 overflow-y-auto">
                          {order.items.map((it, itemIdx) => (
                            <div
                              key={itemIdx}
                              className="bg-slate-50 dark:bg-slate-800/70 p-1.5 rounded-lg border border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-2 text-[11px]"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-slate-800 dark:text-slate-200 truncate flex items-center gap-1.5">
                                  <span>{it.namaProduk}</span>
                                  {it.isMasterProduct === false && (
                                    <span
                                      className="px-1 py-0.2 bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-400 rounded text-[9px] font-extrabold border border-amber-300 dark:border-amber-800 shrink-0"
                                      title="SKU belum terdaftar di Master Database Produk"
                                    >
                                      ⚠️ Belum di Master
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                                  <span>SKU: <b className="text-slate-800 dark:text-slate-200">{it.sku}</b></span>
                                  {it.namaVariasi && it.namaVariasi !== 'Default' && (
                                    <span className="text-orange-600 dark:text-orange-400 font-semibold">[{it.namaVariasi}]</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {/* LOKASI RAK UNTUK PICKING */}
                                <span className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded font-black text-[10px] border border-blue-200 dark:border-blue-800 flex items-center gap-0.5">
                                  <MapPin className="w-2.5 h-2.5" />
                                  <span>{it.lokasi || '-'}</span>
                                </span>
                                <span className="font-black text-slate-900 dark:text-white px-1.5 py-0.5 bg-slate-200 dark:bg-slate-700 rounded text-[11px]">
                                  x{it.qty}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                        {order.catatanPembeli && (
                          <div className="text-[10px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-1 rounded-md mt-1 border border-amber-200 dark:border-amber-800">
                            <b>Catatan:</b> {order.catatanPembeli}
                          </div>
                        )}
                      </td>

                      {/* Total Qty */}
                      <td className="p-3 text-center align-middle font-black text-sm text-slate-900 dark:text-white">
                        {totalQty}
                      </td>

                      {/* Tab Proses Packing Scan Button */}
                      {activeTab === 'proses_packing' && (
                        <td className="p-3 text-center align-middle">
                          <button
                            type="button"
                            onClick={() => handleOpenPackingModal(order)}
                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 mx-auto cursor-pointer shadow-xs active:scale-95"
                          >
                            <Scan className="w-3.5 h-3.5" />
                            <span>Scan Packing</span>
                          </button>
                        </td>
                      )}

                      {/* CCTV Timestamp Info (Paket Ready & Terkirim) */}
                      {(activeTab === 'paket_ready' || activeTab === 'paket_terkirim') && (
                        <td className="p-3 align-middle text-xs">
                          {order.waktu_packing ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 font-bold text-purple-700 dark:text-purple-300">
                                <Video className="w-3.5 h-3.5 shrink-0" />
                                <span className="text-[11px]">{order.waktu_packing}</span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleCopyCctv(order.cctv_timestamp_tag)}
                                className="text-[10px] font-mono text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1 cursor-pointer"
                                title="Klik untuk salin tag pencarian CCTV"
                              >
                                <span>{order.cctv_timestamp_tag}</span>
                                <Copy className="w-2.5 h-2.5" />
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic text-[11px]">-</span>
                          )}
                          {order.waktu_terkirim && (
                            <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                              Kirim: {order.waktu_terkirim}
                            </div>
                          )}
                        </td>
                      )}

                      {/* Actions */}
                      <td className="p-3 text-center align-middle">
                        <div className="flex items-center justify-center gap-1">
                          {activeTab === 'sedang_proses' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus([order.noPesanan], 'proses_picking')}
                              className="p-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:bg-blue-950/50 dark:text-blue-400 rounded-lg cursor-pointer transition-colors"
                              title="Pindahkan ke Proses Picking"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {activeTab === 'proses_picking' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus([order.noPesanan], 'proses_packing')}
                              className="p-1.5 bg-purple-50 text-purple-600 hover:bg-purple-100 dark:bg-purple-950/50 dark:text-purple-400 rounded-lg cursor-pointer transition-colors"
                              title="Pindahkan ke Proses Packing"
                            >
                              <ArrowRight className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {activeTab === 'paket_ready' && (
                            <button
                              type="button"
                              onClick={() => handleUpdateOrderStatus([order.noPesanan], 'paket_terkirim')}
                              className="p-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:text-emerald-400 rounded-lg cursor-pointer transition-colors"
                              title="Tandai Paket Terkirim"
                            >
                              <Truck className="w-3.5 h-3.5" />
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => handleDeleteOrders([order.noPesanan])}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer transition-colors"
                            title="Hapus Pesanan"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {displayOrders.length === 0 && (
                  <tr>
                    <td
                      colSpan={activeTab === 'proses_packing' || activeTab === 'paket_ready' || activeTab === 'paket_terkirim' ? 12 : 10}
                      className="p-10 text-center text-slate-500"
                    >
                      <div className="max-w-sm mx-auto space-y-3">
                        <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-950/50 text-orange-500 flex items-center justify-center mx-auto">
                          <ShoppingBag className="w-6 h-6" />
                        </div>
                        <h4 className="font-extrabold text-slate-800 dark:text-white text-sm">
                          Tidak ada pesanan yang sesuai filter
                        </h4>
                        <p className="text-xs text-slate-400">
                          {activeTab === 'sedang_proses'
                            ? 'Silakan klik tombol "Import Excel Shopee" untuk mengunggah pesanan baru atau sesuaikan filter di atas.'
                            : 'Pesanan akan berpindah ke tab ini sesuai alur proses pengerjaan di gudang.'}
                        </p>
                        {activeTab === 'sedang_proses' && (
                          <button
                            type="button"
                            onClick={() => fileInputRef.current?.click()}
                            className="px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl text-xs inline-flex items-center gap-2 cursor-pointer shadow-sm"
                          >
                            <Upload className="w-4 h-4" />
                            <span>Import Excel Sekarang</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PACKING VALIDATION & CCTV TIMESTAMP RECORDING MODAL */}
      {/* ========================================================================= */}
      {packingModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-3 sm:p-5 overflow-y-auto">
          <div className="bg-white dark:bg-[#131d31] rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-purple-500 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-white/20">
                  <Video className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="font-black text-sm sm:text-base flex items-center gap-2">
                    Validasi Packing & Rekam CCTV
                    <span className="text-[10px] px-2 py-0.5 bg-black/30 rounded-full uppercase">
                      Di Bawah Kamera
                    </span>
                  </h3>
                  <p className="text-xs text-purple-100 mt-0.5">
                    No. Pesanan: <b className="font-mono">{packingModalOrder.noPesanan}</b>
                    {packingModalOrder.noResi && ` | Resi: ${packingModalOrder.noResi}`}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPackingModalOrder(null)}
                className="p-1.5 text-white/70 hover:text-white bg-white/10 hover:bg-white/20 rounded-xl transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
              {/* Recipient & Courier Card */}
              <div className="bg-slate-50 dark:bg-slate-900/60 p-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs grid grid-cols-2 gap-3">
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Penerima</span>
                  <span className="font-bold text-slate-800 dark:text-white text-sm">{packingModalOrder.namaPenerima}</span>
                  <div className="text-slate-500 line-clamp-1">{packingModalOrder.alamatPengiriman}</div>
                </div>
                <div>
                  <span className="text-slate-400 font-bold block text-[10px] uppercase">Opsi Pengiriman</span>
                  <span className="font-black text-orange-600 dark:text-orange-400 text-sm">{packingModalOrder.opsiPengiriman}</span>
                  {packingModalOrder.catatanPembeli && (
                    <div className="text-amber-600 dark:text-amber-400 line-clamp-1 font-semibold">
                      Catatan: {packingModalOrder.catatanPembeli}
                    </div>
                  )}
                </div>
              </div>

              {/* Barcode Scan Input */}
              <form onSubmit={handlePackingScanSubmit} className="space-y-2">
                <label className="text-xs font-black text-purple-900 dark:text-purple-300 uppercase tracking-wider block">
                  Scan Barcode SKU Produk
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Scan className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-purple-500" />
                    <input
                      ref={packingInputRef}
                      type="text"
                      placeholder="SCAN BARCODE / KETIK SKU LALU ENTER..."
                      value={packingBarcodeScan}
                      onChange={(e) => setPackingBarcodeScan(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-slate-50 dark:bg-slate-900 border-2 border-purple-400 dark:border-purple-600 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-purple-500 text-slate-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-xs cursor-pointer shadow-sm"
                  >
                    Scan
                  </button>
                </div>
              </form>

              {/* Item Checklist Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-extrabold text-[10px] uppercase border-b border-slate-200 dark:border-slate-700">
                      <th className="p-3 text-left">Nama Produk & SKU</th>
                      <th className="p-3 text-center w-24">Lokasi Rak</th>
                      <th className="p-3 text-center w-20">Req</th>
                      <th className="p-3 text-center w-20">Scan</th>
                      <th className="p-3 text-center w-24">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {packingModalOrder.items.map((it, idx) => {
                      const scanned = packingScans[it.sku] || 0;
                      const isComplete = scanned >= it.qty;

                      return (
                        <tr
                          key={idx}
                          className={`transition-colors ${
                            isComplete ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''
                          }`}
                        >
                          <td className="p-3">
                            <div className="font-extrabold text-slate-900 dark:text-white">{it.namaProduk}</div>
                            <div className="text-slate-500 font-mono text-[10px] mt-0.5">
                              SKU: <b className="text-purple-600 dark:text-purple-400">{it.sku}</b>
                              {it.namaVariasi && it.namaVariasi !== 'Default' && ` (${it.namaVariasi})`}
                            </div>
                          </td>
                          <td className="p-3 text-center">
                            <span className="px-2 py-1 bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 rounded-md font-extrabold text-[10px] border border-blue-200 dark:border-blue-800">
                              {it.lokasi || '-'}
                            </span>
                          </td>
                          <td className="p-3 text-center font-bold text-slate-800 dark:text-white text-sm">
                            {it.qty}
                          </td>
                          <td className="p-3 text-center font-black text-sm">
                            <span className={isComplete ? 'text-emerald-600' : 'text-purple-600'}>
                              {scanned}
                            </span>
                          </td>
                          <td className="p-3 text-center">
                            {isComplete ? (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 rounded-md font-bold text-[10px] flex items-center justify-center gap-1">
                                <Check className="w-3 h-3" />
                                <span>COCOK</span>
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300 rounded-md font-bold text-[10px]">
                                Kurang {it.qty - scanned}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/70 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500 text-center sm:text-left">
                {isPackingComplete ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-extrabold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    Semua barang telah diverifikasi cocok 100%!
                  </span>
                ) : (
                  <span>Lakukan scan seluruh SKU produk di atas hingga kuantitas terpenuhi.</span>
                )}
              </div>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => setPackingModalOrder(null)}
                  className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold rounded-xl text-xs cursor-pointer"
                >
                  Tutup
                </button>
                <button
                  type="button"
                  onClick={handleCompletePackingWithCctv}
                  disabled={!isPackingComplete}
                  className="flex-1 sm:flex-none px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
                >
                  <Video className="w-4 h-4" />
                  <span>Konfirmasi Selesai (Rekam CCTV)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* A4 PORTRAIT PRINT LAYOUT FOR SURAT JALAN / PICKING LIST */}
      {/* ========================================================================= */}
      <div id="shopee-print-area" className="hidden print:block bg-white w-full text-black">
        {/* Print Header */}
        <div className="border-b-2 border-black pb-2 mb-3">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-base font-black tracking-tight uppercase">
                SURAT JALAN & PICKING LIST SHOPEE
              </h1>
              <div className="text-[10px] text-gray-700 mt-0.5">
                WMS Warehouse Management System • Format A4 Portrait
              </div>
            </div>
            <div className="text-right text-[10px] font-mono">
              <div>
                <b>Tgl Cetak:</b> {new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
              </div>
              <div>
                <b>Filter Jasa Kirim:</b> {selectedOpsiPengiriman === 'ALL' ? 'Semua Jasa Kirim' : selectedOpsiPengiriman}
              </div>
              <div>
                <b>Urutan:</b> {customSort === 'opsi_pengiriman_no_pesanan' ? 'Opsi Pengiriman + No. Pesanan' : 'Waktu Pembayaran'}
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
            <b>Total Barang:</b> {displayOrders.reduce((sum, o) => sum + o.items.reduce((s, it) => s + it.qty, 0), 0)} Pcs
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
            <tr className="bg-gray-200">
              <th className="border border-black p-1 text-center font-black w-[4%]">No</th>
              <th className="border border-black p-1 text-center font-black w-[15%]">No. Pesanan & Resi</th>
              <th className="border border-black p-1 text-center font-black w-[12%]">Opsi Pengiriman</th>
              <th className="border border-black p-1 text-center font-black w-[15%]">Nama Penerima & HP</th>
              <th className="border border-black p-1 text-center font-black w-[9%]">Lokasi Rak</th>
              <th className="border border-black p-1 text-left font-black w-[28%]">SKU & Nama Barang</th>
              <th className="border border-black p-1 text-center font-black w-[5%]">Qty</th>
              <th className="border border-black p-1 text-center font-black w-[4%]">Pick</th>
              <th className="border border-black p-1 text-center font-black w-[4%]">Cek</th>
              <th className="border border-black p-1 text-left font-black w-[14%]">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {displayOrders.map((order, orderIdx) => {
              const rowCount = order.items.length || 1;

              return order.items.map((item, itemIdx) => (
                <tr key={`${order.noPesanan}-${itemIdx}`}>
                  {/* Order-level merged columns */}
                  {itemIdx === 0 && (
                    <>
                      <td rowSpan={rowCount} className="border border-black p-1 text-center align-middle font-bold">
                        {orderIdx + 1}
                      </td>
                      <td rowSpan={rowCount} className="border border-black p-1 text-center align-middle font-mono">
                        <div className="font-black text-[10px]">{order.noPesanan}</div>
                        {order.noResi && <div className="text-[8.5px] text-gray-700 mt-0.5">{order.noResi}</div>}
                      </td>
                      <td rowSpan={rowCount} className="border border-black p-1 text-center align-middle font-bold text-[9px]">
                        {order.opsiPengiriman}
                        {order.batasWaktuPengiriman && (
                          <div className="text-[8px] text-red-600 font-normal mt-0.5">
                            Batas: {order.batasWaktuPengiriman}
                          </div>
                        )}
                      </td>
                      <td rowSpan={rowCount} className="border border-black p-1 align-middle">
                        <div className="font-bold">{order.namaPenerima}</div>
                        {order.noTelepon && <div className="font-mono text-[8.5px] text-gray-700">{order.noTelepon}</div>}
                      </td>
                    </>
                  )}

                  {/* Item-level Lokasi Rak (Untuk Memudahkan Picking) */}
                  <td className="border border-black p-1 text-center align-middle font-black text-[10px] bg-gray-50">
                    {item.lokasi || '-'}
                  </td>

                  {/* Item SKU & Nama */}
                  <td className="border border-black p-1 align-middle">
                    <div className="font-black text-[9.5px]">{item.sku}</div>
                    <div className="text-gray-800 text-[8.5px]">{item.namaProduk}</div>
                    {item.namaVariasi && item.namaVariasi !== 'Default' && (
                      <div className="text-gray-600 italic text-[8px]">Var: {item.namaVariasi}</div>
                    )}
                  </td>

                  {/* Qty */}
                  <td className="border border-black p-1 text-center align-middle font-black text-[11px]">
                    {item.qty}
                  </td>

                  {/* Pick Checkbox */}
                  <td className="border border-black p-1 align-middle text-center">
                    <div className="w-3.5 h-3.5 border border-black mx-auto"></div>
                  </td>

                  {/* Ceklis Checkbox */}
                  <td className="border border-black p-1 align-middle text-center">
                    <div className="w-3.5 h-3.5 border border-black mx-auto"></div>
                  </td>

                  {/* Catatan Pembeli */}
                  {itemIdx === 0 && (
                    <td rowSpan={rowCount} className="border border-black p-1 align-middle text-[8.5px] whitespace-pre-wrap">
                      {order.catatanPembeli || '-'}
                    </td>
                  )}
                </tr>
              ));
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
