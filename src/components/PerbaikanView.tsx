import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import {
  Wrench,
  Scissors,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Search,
  Plus,
  Trash2,
  Download,
  Printer,
  Eye,
  X,
  Camera,
  UploadCloud,
  ShieldCheck,
  Check,
  Tag,
  ArrowRight,
  RefreshCw,
  FileText,
  DollarSign,
  User,
  Calendar,
  Layers,
  Archive,
  Info,
  ExternalLink,
  Edit3,
  Database,
  History,
} from 'lucide-react';
import {
  PerbaikanTicket,
  PerbaikanTahap,
  PerbaikanStatusPengerjaan,
  ProductItem,
  UserSession,
} from '../types';
import { compressImage, formatBytes } from '../utils/imageCompressor';
import { isSuperadmin, hasPermission } from '../services/permissions';
import { playSuccessBeep, playErrorBeep, vibrateDevice } from '../services/audio';
import {
  fetchPerbaikanTicketsFromSupabase,
  savePerbaikanTicketToSupabase,
  updatePerbaikanTicketInSupabase,
  deletePerbaikanTicketFromSupabase,
  recordPerbaikanStockMutation,
  getSupabaseClient,
} from '../services/supabase';

interface PerbaikanViewProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

// Initial Sample Mock Data (Disiapkan agar preview langsung bisa dicoba & dieksplorasi)
const INITIAL_DEMO_TICKETS: PerbaikanTicket[] = [
  {
    id: 1,
    ticket_no: 'RJC-20260904-001',
    tanggal: '2026-09-04 09:15',
    sku: 'TSH-OVR-BLK-M',
    nama_produk: 'Oversized Tee Black - Size M',
    size: 'M',
    qty: 1,
    lokasi_asal: 'A-02',
    lokasi_sekarang: 'PERBAIKAN-01',
    is_already_in_repair: false,
    sumber_barang: 'Retur Marketplace',
    kategori_rusak: 'Noda / Kotor',
    detail_kerusakan: 'Noda debu & noda minyak tipis di bagian dada kanan dekat kerah',
    foto_urls: [
      'https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=500&auto=format&fit=crop&q=60',
    ],
    tahap: 'REJECT',
    status_pengerjaan: 'PENDING',
    operator_input: 'Budi (Picker)',
    created_at: '2026-09-04T09:15:00.000Z',
  },
  {
    id: 2,
    ticket_no: 'RJC-20260904-002',
    tanggal: '2026-09-04 08:30',
    sku: 'DRS-FLR-WHT-S',
    nama_produk: 'Floral Summer Dress White - Size S',
    size: 'S',
    qty: 1,
    lokasi_asal: 'B-11',
    lokasi_sekarang: 'CC-01',
    is_already_in_repair: false,
    sumber_barang: 'Gudang Fisik',
    kategori_rusak: 'Noda / Kotor',
    detail_kerusakan: 'Noda cipratan kopi samar saat display studio',
    foto_urls: [
      'https://images.unsplash.com/photo-1572804013309-59a88b7e92f1?w=500&auto=format&fit=crop&q=60',
    ],
    tahap: 'CUCI',
    status_pengerjaan: 'SEDANG_PROSES',
    qc_pic: 'Siti Rahma (Kepala QC)',
    qc_tanggal: '2026-09-04 09:00',
    qc_catatan: 'Gunakan cairan vanish pembersih noda pakaian putih, jangan disikat kasar',
    petugas_reparasi: 'Laundry Berkah (Vendor Cuci)',
    reparasi_mulai: '2026-09-04 09:30',
    operator_input: 'Andi (Operator)',
    created_at: '2026-09-04T08:30:00.000Z',
  },
  {
    id: 3,
    ticket_no: 'RJC-20260903-014',
    tanggal: '2026-09-03 14:20',
    sku: 'KMG-LIN-BEI-L',
    nama_produk: 'Kemeja Linen Beige - Size L',
    size: 'L',
    qty: 1,
    lokasi_asal: 'C-05',
    lokasi_sekarang: 'PMK-01',
    is_already_in_repair: true,
    sumber_barang: 'Penerimaan CMT',
    kategori_rusak: 'Jahitan Rusak',
    detail_kerusakan: 'Jahitan keliman bawah lepas sepanjang 10cm, kancing lengan lepas 1pcs',
    foto_urls: [
      'https://images.unsplash.com/photo-1596755094514-f87e34085b2c?w=500&auto=format&fit=crop&q=60',
    ],
    tahap: 'PERMAK',
    status_pengerjaan: 'SEDANG_PROSES',
    qc_pic: 'Siti Rahma (Kepala QC)',
    qc_tanggal: '2026-09-03 15:00',
    qc_catatan: 'Jahit ulang kelim bawah dengan benang senada, pasang kancing cadangan',
    petugas_reparasi: 'Pak Joko (Penjahit)',
    reparasi_mulai: '2026-09-03 15:30',
    biaya_reparasi: 15000,
    operator_input: 'Budi (Picker)',
    created_at: '2026-09-03T14:20:00.000Z',
  },
  {
    id: 4,
    ticket_no: 'RJC-20260902-008',
    tanggal: '2026-09-02 11:10',
    sku: 'JCK-DNM-BLU-XL',
    nama_produk: 'Vintage Denim Jacket - Size XL',
    size: 'XL',
    qty: 1,
    lokasi_asal: 'D-03',
    lokasi_sekarang: 'DF-01',
    is_already_in_repair: false,
    sumber_barang: 'Retur Marketplace',
    kategori_rusak: 'Kain Sobek / Bolong',
    detail_kerusakan: 'Kain robek tembus di bagian punggung belakang kena cutter saat unboxing',
    foto_urls: [
      'https://images.unsplash.com/photo-1576995853123-5a10305d93c0?w=500&auto=format&fit=crop&q=60',
    ],
    tahap: 'DEFECT',
    status_pengerjaan: 'GAGAL',
    qc_pic: 'Siti Rahma (Kepala QC)',
    qc_tanggal: '2026-09-02 11:45',
    qc_catatan: 'Robek terlalu lebar tidak bisa dijahit tanpa merusak motif. Masuk defect.',
    acc_harga_defect: 85000,
    acc_harga_by: 'Pak Hendra (Manager)',
    acc_harga_tanggal: '2026-09-03 10:00',
    acc_harga_catatan: 'ACC Defect Sale diskon 60% untuk event Bazzar / Live Defect',
    operator_input: 'Sari (QC)',
    created_at: '2026-09-02T11:10:00.000Z',
  },
  {
    id: 5,
    ticket_no: 'RJC-20260901-003',
    tanggal: '2026-09-01 10:00',
    sku: 'BLZ-SLM-NVY-M',
    nama_produk: 'Slim Blazer Navy - Size M',
    size: 'M',
    qty: 1,
    lokasi_asal: 'A-04',
    lokasi_sekarang: 'A-04',
    is_already_in_repair: false,
    sumber_barang: 'Gudang Fisik',
    kategori_rusak: 'Jahitan Rusak',
    detail_kerusakan: 'Kancing depan kendur & benang sisa obras keluar',
    foto_urls: [
      'https://images.unsplash.com/photo-1594938298603-c8148c4dae35?w=500&auto=format&fit=crop&q=60',
    ],
    tahap: 'SELESAI_GRADE_A',
    status_pengerjaan: 'SELESAI_PERMAK',
    qc_pic: 'Siti Rahma (Kepala QC)',
    qc_tanggal: '2026-09-01 10:30',
    petugas_reparasi: 'Pak Joko (Penjahit)',
    reparasi_mulai: '2026-09-01 11:00',
    reparasi_selesai: '2026-09-01 14:00',
    reparasi_catatan: 'Kancing sudah dikuatkan, jahitan obras sudah dirapikan. Kondisi Grade A.',
    biaya_reparasi: 10000,
    operator_input: 'Sari (QC)',
    created_at: '2026-09-01T10:00:00.000Z',
  },
];

export const PerbaikanView: React.FC<PerbaikanViewProps> = React.memo(({
  session,
  productCatalog = [],
  onShowToast,
}) => {
  // Role & Permission Checks
  const userIsAdmin = isSuperadmin(session);
  const canEditData = userIsAdmin || hasPermission(session, 'can_edit_data');
  const canDeleteData = userIsAdmin || hasPermission(session, 'can_delete_data');
  const canExport = userIsAdmin || hasPermission(session, 'can_export_data');
  const canAccHarga = userIsAdmin || session?.role === 'Superadmin' || session?.role === 'All' || hasPermission(session, 'can_edit_data');

  // State: Tickets with Supabase Realtime Sync
  const [tickets, setTickets] = useState<PerbaikanTicket[]>(() => {
    try {
      const saved = localStorage.getItem('wms_local_perbaikan_tickets');
      if (saved) return JSON.parse(saved);
    } catch {}
    return INITIAL_DEMO_TICKETS;
  });
  const [isLoadingDb, setIsLoadingDb] = useState(false);

  // Sync from Supabase on mount + listen to Supabase Realtime changes
  useEffect(() => {
    let isMounted = true;
    const loadFromSupabase = async () => {
      setIsLoadingDb(true);
      try {
        const data = await fetchPerbaikanTicketsFromSupabase();
        if (isMounted && data && data.length > 0) {
          setTickets(data);
        }
      } catch (e) {
        console.warn('Initial load perbaikan tickets error:', e);
      } finally {
        if (isMounted) setIsLoadingDb(false);
      }
    };
    loadFromSupabase();

    const sb = getSupabaseClient();
    const channel = sb
      .channel('realtime_perbaikan_tickets')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'perbaikan_tickets' },
        async () => {
          const fresh = await fetchPerbaikanTicketsFromSupabase();
          if (isMounted && fresh && fresh.length > 0) {
            setTickets(fresh);
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      sb.removeChannel(channel);
    };
  }, []);

  // Save to localStorage as secondary backup cache (debounced to avoid thread freeze)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('wms_local_perbaikan_tickets', JSON.stringify(tickets));
      } catch (e) {
        console.warn('Gagal menyimpan tiket perbaikan ke local storage:', e);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [tickets]);

  // Tab State: 'input' | 'reject' | 'cuci' | 'permak' | 'defect' | 'rekap'
  const [activeTab, setActiveTab] = useState<
    'input' | 'reject' | 'cuci' | 'permak' | 'defect' | 'rekap'
  >('reject');

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const deferredSearch = useDeferredValue(searchQuery);
  const [filterKategori, setFilterKategori] = useState<string>('ALL');

  // Display Limit for Ticket Cards (24 items per batch for silky-smooth 60fps rendering)
  const [ticketDisplayLimit, setTicketDisplayLimit] = useState<number>(24);
  const TICKET_RENDER_STEP = 24;

  // Reset ticket display limit when tab or filters change
  useEffect(() => {
    setTicketDisplayLimit(24);
  }, [activeTab, filterKategori, deferredSearch]);

  // Form Input Reject State (Pendataan & Sortir Sekaligus)
  const [formSku, setFormSku] = useState('');
  const deferredFormSku = useDeferredValue(formSku);
  const [formNama, setFormNama] = useState('');
  const [formSize, setFormSize] = useState('Default');
  const [formQty, setFormQty] = useState(1);
  const [formLokasiAsal, setFormLokasiAsal] = useState('A-01');
  const [formIsAlreadyInRepair, setFormIsAlreadyInRepair] = useState(false);
  const [formSumber, setFormSumber] = useState<PerbaikanTicket['sumber_barang']>('Gudang Fisik');
  const [formKategoriRusak, setFormKategoriRusak] = useState<PerbaikanTicket['kategori_rusak']>('Noda / Kotor');
  const [formDetailKerusakan, setFormDetailKerusakan] = useState('');
  const [formPhotos, setFormPhotos] = useState<Array<{ dataUrl: string; sizeText: string; savedPercent: number }>>([]);
  const [isCompressing, setIsCompressing] = useState(false);
  // Pilihan Sortir Langsung saat Pendataan
  const [formTindakanSortir, setFormTindakanSortir] = useState<'SORTIR_NANTI' | 'CUCI' | 'PERMAK' | 'DEFECT'>('CUCI');
  const [formInstruksiSortir, setFormInstruksiSortir] = useState('');
  const [formPetugasPelaksana, setFormPetugasPelaksana] = useState('');
  const [formLokasiTujuan, setFormLokasiTujuan] = useState('CC-01');

  // Modal Edit Tiket & Foto (Untuk semua antrean pengerjaan)
  const [editModalTicket, setEditModalTicket] = useState<PerbaikanTicket | null>(null);
  const [editDetailKerusakan, setEditDetailKerusakan] = useState('');
  const [editKategoriRusak, setEditKategoriRusak] = useState<PerbaikanTicket['kategori_rusak']>('Noda / Kotor');
  const [editLokasiSekarang, setEditLokasiSekarang] = useState('');
  const [editQty, setEditQty] = useState(1);
  const [editPetugasReparasi, setEditPetugasReparasi] = useState('');
  const [editReparasiCatatan, setEditReparasiCatatan] = useState('');
  const [editBiayaReparasi, setEditBiayaReparasi] = useState<number>(0);
  const [editPhotos, setEditPhotos] = useState<Array<{ dataUrl: string; sizeText: string; savedPercent: number }>>([]);
  const [editIsCompressing, setEditIsCompressing] = useState(false);

  // Filter khusus Arsip & Histori Pengecekan
  const [filterArsipStatus, setFilterArsipStatus] = useState<'ALL' | 'SELESAI_GRADE_A' | 'SELESAI_DEFECT_SALE' | 'SELESAI_SCRAP'>('ALL');
  const [searchSkuArsip, setSearchSkuArsip] = useState('');

  // Modal Sortir Kepala QC
  const [sortirModalTicket, setSortirModalTicket] = useState<PerbaikanTicket | null>(null);
  const [sortirTargetTahap, setSortirTargetTahap] = useState<'CUCI' | 'PERMAK' | 'DEFECT'>('CUCI');
  const [sortirPic, setSortirPic] = useState(session?.name || session?.username || 'Kepala QC');
  const [sortirCatatan, setSortirCatatan] = useState('');
  const [sortirPetugas, setSortirPetugas] = useState('');

  // Modal Update Pengerjaan (Cuci / Permak)
  const [progressModalTicket, setProgressModalTicket] = useState<PerbaikanTicket | null>(null);
  const [progressResult, setProgressResult] = useState<'SUCCESS_GRADE_A' | 'FAILED_DEFECT'>('SUCCESS_GRADE_A');
  const [progressLokasiKembali, setProgressLokasiKembali] = useState('A-01');
  const [progressBiaya, setProgressBiaya] = useState<number>(0);
  const [progressCatatan, setProgressCatatan] = useState('');

  // Modal ACC Harga Defect
  const [accModalTicket, setAccModalTicket] = useState<PerbaikanTicket | null>(null);
  const [accDecision, setAccDecision] = useState<'DEFECT_SALE' | 'SCRAP'>('DEFECT_SALE');
  const [accHargaValue, setAccHargaValue] = useState<number>(50000);
  const [accCatatan, setAccCatatan] = useState('');

  // Modal Lightbox Foto & Print Tag
  const [lightboxImages, setLightboxImages] = useState<string[] | null>(null);
  const [printModalTicket, setPrintModalTicket] = useState<PerbaikanTicket | null>(null);

  // Fast indexed catalog map for O(1) SKU lookup
  const catalogSkuMap = useMemo(() => {
    const map = new Map<string, ProductItem>();
    if (!Array.isArray(productCatalog)) return map;
    for (let i = 0; i < productCatalog.length; i++) {
      const p = productCatalog[i];
      if (p && p.k) {
        map.set(p.k.toUpperCase().trim(), p);
      }
    }
    return map;
  }, [productCatalog]);

  // Autocomplete SKU dari catalog dengan fast search & early break
  const skuSuggestions = useMemo(() => {
    const q = deferredFormSku.trim().toUpperCase();
    if (!q || q.length < 2 || !Array.isArray(productCatalog)) return [];

    // Jika sudah cocok sempurna dengan yang dipilih, sembunyikan dropdown
    if (catalogSkuMap.has(q) && formNama) return [];

    const result: ProductItem[] = [];
    for (let i = 0; i < productCatalog.length; i++) {
      const p = productCatalog[i];
      if (!p) continue;
      const kUpper = p.k.toUpperCase();
      const pUpper = (p.p || p.n || '').toUpperCase();
      if (kUpper.includes(q) || pUpper.includes(q)) {
        result.push(p);
        if (result.length >= 5) break; // Berhenti langsung begitu 5 item ditemukan
      }
    }
    return result;
  }, [deferredFormSku, productCatalog, catalogSkuMap, formNama]);

  // Deteksi Stok Fisik Area Perbaikan (CC = Cuci, PMK = Permak, DF = Defect) dengan fast pre-filtering
  const physicalRepairItems = useMemo(() => {
    const result: Array<{
      sku: string;
      nama: string;
      size?: string;
      lokasi: string;
      qty: number;
      tahap: 'CUCI' | 'PERMAK' | 'DEFECT';
    }> = [];

    if (!Array.isArray(productCatalog)) return result;

    for (let i = 0; i < productCatalog.length; i++) {
      const p = productCatalog[i];
      if (!p) continue;

      if (Array.isArray(p.locList) && p.locList.length > 0) {
        p.locList.forEach((l) => {
          const locStr = typeof l === 'string' ? l.trim().toUpperCase() : String(l.lokasi || '').trim().toUpperCase();
          const q = typeof l === 'object' && l.qty !== undefined ? Number(l.qty) : (p.q || 1);
          if (locStr.startsWith('CC') || locStr.includes('CUCI')) {
            result.push({ sku: p.k, nama: p.p || p.n || p.k, size: p.s, lokasi: locStr, qty: q > 0 ? q : 1, tahap: 'CUCI' });
          } else if (locStr.startsWith('PMK') || locStr.includes('PERMAK')) {
            result.push({ sku: p.k, nama: p.p || p.n || p.k, size: p.s, lokasi: locStr, qty: q > 0 ? q : 1, tahap: 'PERMAK' });
          } else if (locStr.startsWith('DF') || locStr.includes('DEFECT')) {
            result.push({ sku: p.k, nama: p.p || p.n || p.k, size: p.s, lokasi: locStr, qty: q > 0 ? q : 1, tahap: 'DEFECT' });
          }
        });
      } else if (p.lokasi) {
        const locUpper = String(p.lokasi).toUpperCase();
        // Fast skip 99% of items that do not contain CC, CUCI, PMK, PERMAK, DF, DEFECT
        if (
          !locUpper.includes('CC') &&
          !locUpper.includes('CUCI') &&
          !locUpper.includes('PMK') &&
          !locUpper.includes('PERMAK') &&
          !locUpper.includes('DF') &&
          !locUpper.includes('DEFECT')
        ) {
          continue;
        }

        const locs = locUpper.split(/[,/;\n|]+/);
        locs.forEach((locRaw) => {
          const locStr = locRaw.trim();
          if (locStr.startsWith('CC') || locStr.includes('CUCI')) {
            result.push({ sku: p.k, nama: p.p || p.n || p.k, size: p.s, lokasi: locStr, qty: p.q && p.q > 0 ? p.q : 1, tahap: 'CUCI' });
          } else if (locStr.startsWith('PMK') || locStr.includes('PERMAK')) {
            result.push({ sku: p.k, nama: p.p || p.n || p.k, size: p.s, lokasi: locStr, qty: p.q && p.q > 0 ? p.q : 1, tahap: 'PERMAK' });
          } else if (locStr.startsWith('DF') || locStr.includes('DEFECT')) {
            result.push({ sku: p.k, nama: p.p || p.n || p.k, size: p.s, lokasi: locStr, qty: p.q && p.q > 0 ? p.q : 1, tahap: 'DEFECT' });
          }
        });
      }
    }

    return result;
  }, [productCatalog]);

  // Statistics KPI
  const stats = useMemo(() => {
    const totalReject = tickets.filter((t) => t.tahap === 'REJECT').length;
    const totalCuci = tickets.filter((t) => t.tahap === 'CUCI').length;
    const totalPermak = tickets.filter((t) => t.tahap === 'PERMAK').length;
    const totalDefect = tickets.filter((t) => t.tahap === 'DEFECT').length;
    const totalGradeA = tickets.filter((t) => t.tahap === 'SELESAI_GRADE_A').length;
    const totalDefectSale = tickets.filter((t) => t.tahap === 'SELESAI_DEFECT_SALE').length;
    const totalScrap = tickets.filter((t) => t.tahap === 'SELESAI_SCRAP').length;
    const totalArsip = totalGradeA + totalDefectSale + totalScrap;
    const totalAll = tickets.length;
    return {
      totalReject,
      totalCuci,
      totalPermak,
      totalDefect,
      totalGradeA,
      totalDefectSale,
      totalScrap,
      totalArsip,
      totalAll,
    };
  }, [tickets]);

  // Filtered List berdasarkan Tab Aktif
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      // Tab filter
      if (activeTab === 'reject' && t.tahap !== 'REJECT') return false;
      if (activeTab === 'cuci' && t.tahap !== 'CUCI') return false;
      if (activeTab === 'permak' && t.tahap !== 'PERMAK') return false;
      if (activeTab === 'defect' && t.tahap !== 'DEFECT') return false;

      // Tab Arsip (rekap)
      if (activeTab === 'rekap') {
        const isFinished =
          t.tahap === 'SELESAI_GRADE_A' ||
          t.tahap === 'SELESAI_DEFECT_SALE' ||
          t.tahap === 'SELESAI_SCRAP';
        if (!isFinished) return false;
        if (filterArsipStatus !== 'ALL' && t.tahap !== filterArsipStatus) return false;
        if (searchSkuArsip.trim() && !t.sku.toUpperCase().includes(searchSkuArsip.trim().toUpperCase())) return false;
      }

      // Kategori filter
      if (filterKategori !== 'ALL' && t.kategori_rusak !== filterKategori) return false;

      // Search query
      if (deferredSearch.trim()) {
        const q = deferredSearch.toUpperCase();
        const matchNo = t.ticket_no.toUpperCase().includes(q);
        const matchSku = t.sku.toUpperCase().includes(q);
        const matchNama = t.nama_produk.toUpperCase().includes(q);
        const matchLokasi = t.lokasi_sekarang.toUpperCase().includes(q);
        const matchDetail = t.detail_kerusakan.toUpperCase().includes(q);
        const matchPetugas = t.petugas_reparasi?.toUpperCase().includes(q);
        const matchQc = t.qc_pic?.toUpperCase().includes(q);
        if (!matchNo && !matchSku && !matchNama && !matchLokasi && !matchDetail && !matchPetugas && !matchQc) return false;
      }

      return true;
    });
  }, [tickets, activeTab, filterKategori, deferredSearch, filterArsipStatus, searchSkuArsip]);

  // Handle Tarik Stok Fisik Area Perbaikan (CC, PMK, DF)
  const handleSyncPhysicalStock = () => {
    if (physicalRepairItems.length === 0) {
      onShowToast(
        'Tidak ditemukan produk di rak CC, PMK, atau DF pada data katalog saat ini.',
        'info'
      );
      return;
    }

    let addedCount = 0;
    const updatedTickets = [...tickets];

    physicalRepairItems.forEach((item, idx) => {
      const exists = updatedTickets.some(
        (t) =>
          t.sku.toUpperCase() === item.sku.toUpperCase() &&
          t.lokasi_sekarang.toUpperCase() === item.lokasi.toUpperCase() &&
          t.tahap === item.tahap
      );

      if (!exists) {
        addedCount++;
        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const prefix = item.tahap === 'CUCI' ? 'CC' : item.tahap === 'PERMAK' ? 'PMK' : 'DF';
        const ticketNo = `${prefix}-${todayStr}-${Math.floor(100 + Math.random() * 900)}`;

        const newSyncedTicket: PerbaikanTicket = {
          id: Date.now() + idx,
          ticket_no: ticketNo,
          tanggal: new Date().toLocaleString('id-ID', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          }),
          sku: item.sku,
          nama_produk: item.nama,
          size: item.size || 'Default',
          qty: item.qty,
          lokasi_asal: item.lokasi,
          lokasi_sekarang: item.lokasi,
          is_already_in_repair: true,
          sumber_barang: 'Gudang Fisik',
          kategori_rusak:
            item.tahap === 'CUCI'
              ? 'Noda / Kotor'
              : item.tahap === 'PERMAK'
              ? 'Jahitan Rusak'
              : 'Cacat Kain / Warna',
          detail_kerusakan: `Stok fisik terdeteksi di rak ${item.lokasi}. Silakan lengkapi foto dan keterangan via tombol Edit Data & Foto.`,
          foto_urls: [],
          tahap: item.tahap,
          status_pengerjaan: item.tahap === 'DEFECT' ? 'GAGAL' : 'SEDANG_PROSES',
          qc_pic: 'Stok Fisik Gudang',
          qc_tanggal: new Date().toLocaleDateString('id-ID'),
          qc_catatan: `Sinkronisasi otomatis dari data rak ${item.lokasi}`,
          petugas_reparasi:
            item.tahap === 'CUCI'
              ? 'Laundry / Vendor Cuci'
              : item.tahap === 'PERMAK'
              ? 'Penjahit Gudang'
              : undefined,
          operator_input: session?.username || 'System',
          created_at: new Date().toISOString(),
        };

        updatedTickets.unshift(newSyncedTicket);
        // Sync to Supabase in background
        savePerbaikanTicketToSupabase(newSyncedTicket).catch(console.warn);
      }
    });

    if (addedCount > 0) {
      setTickets(updatedTickets);
      playSuccessBeep();
      onShowToast(
        `Berhasil menarik ${addedCount} pakaian dari stok fisik rak CC, PMK, & DF ke antrean pekerjaan!`,
        'success'
      );
    } else {
      onShowToast('Semua stok fisik rak CC, PMK, dan DF sudah tercatat di antrean pekerjaan.', 'info');
    }
  };

  // Handle Buka Modal Edit Tiket
  const handleOpenEditModal = (t: PerbaikanTicket) => {
    if (!canEditData) {
      playErrorBeep();
      onShowToast('Akses dibatasi: Anda tidak memiliki hak akses edit data!', 'warning');
      return;
    }
    setEditModalTicket(t);
    setEditDetailKerusakan(t.detail_kerusakan || '');
    setEditKategoriRusak(t.kategori_rusak || 'Noda / Kotor');
    setEditLokasiSekarang(t.lokasi_sekarang || '');
    setEditQty(t.qty || 1);
    setEditPetugasReparasi(t.petugas_reparasi || '');
    setEditReparasiCatatan(t.reparasi_catatan || '');
    setEditBiayaReparasi(t.biaya_reparasi || 0);
    setEditPhotos(
      (t.foto_urls || []).map((url) => ({
        dataUrl: url,
        sizeText: 'WebP Terkompresi',
        savedPercent: 98,
      }))
    );
  };

  // Upload & Kompresi Foto di Modal Edit
  const handleEditPhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (editPhotos.length + files.length > 4) {
      onShowToast('Maksimal 4 foto dokumentasi per pakaian', 'warning');
      return;
    }

    setEditIsCompressing(true);
    try {
      const newItems: Array<{ dataUrl: string; sizeText: string; savedPercent: number }> = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await compressImage(file, 1024, 0.65);
        newItems.push({
          dataUrl: res.dataUrl,
          sizeText: `${formatBytes(res.originalSize)} ➔ ${formatBytes(res.compressedSize)}`,
          savedPercent: res.savedPercentage,
        });
      }
      setEditPhotos((prev) => [...prev, ...newItems]);
      playSuccessBeep();
      onShowToast(`Berhasil menambahkan & mengompresi ${newItems.length} foto!`, 'success');
    } catch (err) {
      playErrorBeep();
      onShowToast('Gagal memproses foto', 'error');
    } finally {
      setEditIsCompressing(false);
      if (e.target) e.target.value = '';
    }
  };

  // Simpan Perubahan Edit Tiket (Live Supabase & Log Perpindahan Rak)
  const handleSaveEditTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editModalTicket) return;

    if (!canEditData) {
      playErrorBeep();
      onShowToast('Akses ditolak: Anda tidak memiliki izin edit data!', 'error');
      return;
    }

    const newTargetLokasi = editLokasiSekarang.trim().toUpperCase() || editModalTicket.lokasi_sekarang;
    const updated: PerbaikanTicket = {
      ...editModalTicket,
      detail_kerusakan: editDetailKerusakan.trim() || 'Tidak ada catatan',
      kategori_rusak: editKategoriRusak,
      lokasi_sekarang: newTargetLokasi,
      qty: Number(editQty) || 1,
      petugas_reparasi: editPetugasReparasi.trim() || undefined,
      reparasi_catatan: editReparasiCatatan.trim() || undefined,
      biaya_reparasi: Number(editBiayaReparasi) || 0,
      foto_urls: editPhotos.map((p) => p.dataUrl),
      updated_at: new Date().toISOString(),
    };

    setTickets((prev) =>
      prev.map((t) => (t.id === editModalTicket.id || t.ticket_no === editModalTicket.ticket_no ? updated : t))
    );

    // Sync Update to Supabase
    updatePerbaikanTicketInSupabase(editModalTicket.id || editModalTicket.ticket_no, updated).catch(console.warn);

    // Jika lokasi fisik rak diedit berpindah, catat mutasi di log_produk
    if (editModalTicket.lokasi_sekarang.toUpperCase() !== newTargetLokasi) {
      const operatorName = session?.name || session?.username || 'Operator';
      recordPerbaikanStockMutation({
        type: 'OUT',
        invoice: `EDIT-${editModalTicket.ticket_no}`,
        sku: editModalTicket.sku,
        nama_produk: editModalTicket.nama_produk,
        size: editModalTicket.size,
        lokasi: editModalTicket.lokasi_sekarang,
        qty: editModalTicket.qty,
        operator: operatorName,
        keterangan: `Pindah rak fisik via Edit Tiket ke ${newTargetLokasi}`,
      }).catch(console.warn);

      recordPerbaikanStockMutation({
        type: 'IN',
        invoice: `EDIT-${editModalTicket.ticket_no}`,
        sku: editModalTicket.sku,
        nama_produk: editModalTicket.nama_produk,
        size: editModalTicket.size,
        lokasi: newTargetLokasi,
        qty: editModalTicket.qty,
        operator: operatorName,
        keterangan: `Pindah rak fisik via Edit Tiket dari ${editModalTicket.lokasi_sekarang}`,
      }).catch(console.warn);
    }

    playSuccessBeep();
    onShowToast(`Data & foto tiket #${editModalTicket.ticket_no} berhasil diperbarui!`, 'success');
    setEditModalTicket(null);
  };

  // Handle Photo Selection & Canvas WebP Compression pada Form Input
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    if (formPhotos.length + files.length > 3) {
      onShowToast('Maksimal 3 foto dokumentasi kerusakan per pakaian', 'warning');
      return;
    }

    setIsCompressing(true);
    try {
      const newItems: Array<{ dataUrl: string; sizeText: string; savedPercent: number }> = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const res = await compressImage(file, 1024, 0.65);
        newItems.push({
          dataUrl: res.dataUrl,
          sizeText: `${formatBytes(res.originalSize)} ➔ ${formatBytes(res.compressedSize)}`,
          savedPercent: res.savedPercentage,
        });
      }

      setFormPhotos((prev) => [...prev, ...newItems]);
      playSuccessBeep();
      onShowToast(
        `Berhasil mengompresi ${newItems.length} foto! Rata-rata hemat space ~${newItems[0]?.savedPercent || 98}%`,
        'success'
      );
    } catch (err: any) {
      console.error('Error compress photo:', err);
      playErrorBeep();
      onShowToast('Gagal memproses dan mengompres foto', 'error');
    } finally {
      setIsCompressing(false);
      if (e.target) e.target.value = '';
    }
  };

  // Submit Form Input Reject Baru (Pendataan & Sortir Sekaligus)
  const handleCreateTicket = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formSku.trim()) {
      playErrorBeep();
      onShowToast('Mohon masukkan atau scan barcode SKU produk!', 'warning');
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randomSuffix = Math.floor(100 + Math.random() * 900);
    const prefix =
      formTindakanSortir === 'CUCI'
        ? 'CC'
        : formTindakanSortir === 'PERMAK'
        ? 'PMK'
        : formTindakanSortir === 'DEFECT'
        ? 'DF'
        : 'RJC';
    const newTicketNo = `${prefix}-${todayStr}-${randomSuffix}`;

    const targetTahap: PerbaikanTahap =
      formTindakanSortir === 'CUCI'
        ? 'CUCI'
        : formTindakanSortir === 'PERMAK'
        ? 'PERMAK'
        : formTindakanSortir === 'DEFECT'
        ? 'DEFECT'
        : 'REJECT';

    const targetStatus: PerbaikanStatusPengerjaan =
      formTindakanSortir === 'DEFECT'
        ? 'GAGAL'
        : formTindakanSortir === 'CUCI' || formTindakanSortir === 'PERMAK'
        ? 'SEDANG_PROSES'
        : 'PENDING';

    const targetLokasi =
      formLokasiTujuan.trim().toUpperCase() ||
      (formTindakanSortir === 'CUCI'
        ? 'CC-01'
        : formTindakanSortir === 'PERMAK'
        ? 'PMK-01'
        : formTindakanSortir === 'DEFECT'
        ? 'DF-01'
        : 'PERBAIKAN-01');

    const newTicket: PerbaikanTicket = {
      id: Date.now(),
      ticket_no: newTicketNo,
      tanggal: new Date().toLocaleString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      sku: formSku.trim().toUpperCase(),
      nama_produk: formNama.trim() || `Produk ${formSku.toUpperCase()}`,
      size: formSize || 'Default',
      qty: formQty || 1,
      lokasi_asal: formLokasiAsal.trim().toUpperCase() || 'Warehouse',
      lokasi_sekarang: targetLokasi,
      is_already_in_repair: formIsAlreadyInRepair,
      sumber_barang: formSumber,
      kategori_rusak: formKategoriRusak,
      detail_kerusakan: formDetailKerusakan.trim() || 'Produk reject baru didata',
      foto_urls: formPhotos.map((p) => p.dataUrl),
      tahap: targetTahap,
      status_pengerjaan: targetStatus,
      qc_pic: session?.name || session?.username || 'Kepala QC',
      qc_tanggal: new Date().toLocaleString('id-ID'),
      qc_catatan:
        formInstruksiSortir.trim() ||
        (formTindakanSortir !== 'SORTIR_NANTI'
          ? `Sortir langsung saat pendataan reject (${targetTahap})`
          : undefined),
      petugas_reparasi: formPetugasPelaksana.trim() || undefined,
      reparasi_mulai:
        targetTahap === 'CUCI' || targetTahap === 'PERMAK'
          ? new Date().toLocaleString('id-ID')
          : undefined,
      operator_input: session?.name || session?.username || 'Operator',
      created_at: new Date().toISOString(),
    };

    setTickets((prev) => [newTicket, ...prev]);
    playSuccessBeep();
    vibrateDevice([80, 50, 80]);

    // 1. Simpan ke database Supabase
    savePerbaikanTicketToSupabase(newTicket).catch((err) =>
      console.warn('Gagal menyimpan tiket baru ke Supabase:', err)
    );

    // 2. Jika bukan barang yang memang sudah di perbaikan fisik (baru ditarik dari rak reguler), catat mutasi IN/OUT
    if (!formIsAlreadyInRepair) {
      const operatorName = session?.name || session?.username || 'Operator';
      // OUT dari lokasi asal
      recordPerbaikanStockMutation({
        type: 'OUT',
        invoice: newTicketNo,
        sku: newTicket.sku,
        nama_produk: newTicket.nama_produk,
        size: newTicket.size,
        lokasi: newTicket.lokasi_asal,
        qty: newTicket.qty,
        operator: operatorName,
        keterangan: `Ditarik ke Perbaikan: ${newTicket.kategori_rusak}`,
      }).catch(console.warn);

      // IN ke lokasi perbaikan tujuan
      recordPerbaikanStockMutation({
        type: 'IN',
        invoice: newTicketNo,
        sku: newTicket.sku,
        nama_produk: newTicket.nama_produk,
        size: newTicket.size,
        lokasi: targetLokasi,
        qty: newTicket.qty,
        operator: operatorName,
        keterangan: `Masuk Perbaikan (${targetTahap}): ${newTicket.detail_kerusakan}`,
      }).catch(console.warn);
    }

    if (formTindakanSortir === 'CUCI') {
      onShowToast(
        `Produk #${newTicketNo} berhasil didata & langsung dialokasikan ke Antrean Cuci (${targetLokasi})!`,
        'success'
      );
      setActiveTab('cuci');
    } else if (formTindakanSortir === 'PERMAK') {
      onShowToast(
        `Produk #${newTicketNo} berhasil didata & langsung dialokasikan ke Antrean Permak (${targetLokasi})!`,
        'success'
      );
      setActiveTab('permak');
    } else if (formTindakanSortir === 'DEFECT') {
      onShowToast(
        `Produk #${newTicketNo} berhasil didata & langsung dialokasikan ke Ruang Defect (${targetLokasi})!`,
        'warning'
      );
      setActiveTab('defect');
    } else {
      onShowToast(
        `Tiket Reject #${newTicketNo} berhasil dibuat! Menunggu arahan sortir Kepala QC.`,
        'success'
      );
      setActiveTab('reject');
    }

    // Reset Form
    setFormSku('');
    setFormNama('');
    setFormDetailKerusakan('');
    setFormInstruksiSortir('');
    setFormPetugasPelaksana('');
    setFormPhotos([]);
  };

  // Eksekusi Sortir Kepala QC (Live Supabase & Log Pindah Rak)
  const handleExecuteSortir = () => {
    if (!sortirModalTicket) return;

    let targetLokasi = 'PERBAIKAN-01';
    if (sortirTargetTahap === 'CUCI') targetLokasi = 'CC-01';
    else if (sortirTargetTahap === 'PERMAK') targetLokasi = 'PMK-01';
    else if (sortirTargetTahap === 'DEFECT') targetLokasi = 'DF-01';

    const updated: PerbaikanTicket = {
      ...sortirModalTicket,
      tahap: sortirTargetTahap,
      lokasi_sekarang: targetLokasi,
      status_pengerjaan: sortirTargetTahap === 'DEFECT' ? 'GAGAL' : 'SEDANG_PROSES',
      qc_pic: sortirPic.trim() || 'Kepala QC',
      qc_tanggal: new Date().toLocaleString('id-ID'),
      qc_catatan: sortirCatatan.trim(),
      petugas_reparasi: sortirPetugas.trim() || undefined,
      reparasi_mulai: sortirTargetTahap !== 'DEFECT' ? new Date().toLocaleString('id-ID') : undefined,
      updated_at: new Date().toISOString(),
    };

    setTickets((prev) => prev.map((t) => (t.id === sortirModalTicket.id ? updated : t)));
    playSuccessBeep();
    vibrateDevice(60);

    // Update ke Supabase
    updatePerbaikanTicketInSupabase(sortirModalTicket.id || sortirModalTicket.ticket_no, updated).catch(console.warn);

    // Jika lokasi fisik rak berubah saat sortir, catat mutasi perpindahan stok
    if (sortirModalTicket.lokasi_sekarang.toUpperCase() !== targetLokasi.toUpperCase()) {
      const operatorName = session?.name || session?.username || 'Kepala QC';
      recordPerbaikanStockMutation({
        type: 'OUT',
        invoice: `SORTIR-${sortirModalTicket.ticket_no}`,
        sku: sortirModalTicket.sku,
        nama_produk: sortirModalTicket.nama_produk,
        size: sortirModalTicket.size,
        lokasi: sortirModalTicket.lokasi_sekarang,
        qty: sortirModalTicket.qty,
        operator: operatorName,
        keterangan: `Sortir QC keluar dari ${sortirModalTicket.lokasi_sekarang}`,
      }).catch(console.warn);

      recordPerbaikanStockMutation({
        type: 'IN',
        invoice: `SORTIR-${sortirModalTicket.ticket_no}`,
        sku: sortirModalTicket.sku,
        nama_produk: sortirModalTicket.nama_produk,
        size: sortirModalTicket.size,
        lokasi: targetLokasi,
        qty: sortirModalTicket.qty,
        operator: operatorName,
        keterangan: `Sortir QC masuk jalur ${sortirTargetTahap} (${targetLokasi})`,
      }).catch(console.warn);
    }

    onShowToast(
      `Tiket #${sortirModalTicket.ticket_no} dialokasikan ke jalur ${sortirTargetTahap} (${targetLokasi})`,
      'info'
    );

    setSortirModalTicket(null);
  };

  // Eksekusi Update Hasil Pengerjaan (Cuci / Permak) & Kembalikan ke Stok Normal jika Grade A
  const handleExecuteProgress = () => {
    if (!progressModalTicket) return;

    if (progressResult === 'SUCCESS_GRADE_A') {
      const targetKembali = progressLokasiKembali.trim().toUpperCase() || 'Warehouse';
      const updated: PerbaikanTicket = {
        ...progressModalTicket,
        tahap: 'SELESAI_GRADE_A',
        status_pengerjaan:
          progressModalTicket.tahap === 'CUCI' ? 'SELESAI_CUCI' : 'SELESAI_PERMAK',
        lokasi_sekarang: targetKembali,
        reparasi_selesai: new Date().toLocaleString('id-ID'),
        reparasi_catatan: progressCatatan.trim() || 'Perbaikan tuntas, kualitas lolos Grade A',
        biaya_reparasi: Number(progressBiaya) || 0,
        updated_at: new Date().toISOString(),
      };
      setTickets((prev) => prev.map((t) => (t.id === progressModalTicket.id ? updated : t)));

      // Update ke Supabase
      updatePerbaikanTicketInSupabase(progressModalTicket.id || progressModalTicket.ticket_no, updated).catch(console.warn);

      // Mutasi Kembalikan ke Stok Reguler Layak Jual (Grade A)
      const operatorName = session?.name || session?.username || 'Operator';
      recordPerbaikanStockMutation({
        type: 'OUT',
        invoice: `PASS-${progressModalTicket.ticket_no}`,
        sku: progressModalTicket.sku,
        nama_produk: progressModalTicket.nama_produk,
        size: progressModalTicket.size,
        lokasi: progressModalTicket.lokasi_sekarang,
        qty: progressModalTicket.qty,
        operator: operatorName,
        keterangan: `Lolos Perbaikan Grade A keluar dari ${progressModalTicket.lokasi_sekarang}`,
      }).catch(console.warn);

      recordPerbaikanStockMutation({
        type: 'IN',
        invoice: `PASS-${progressModalTicket.ticket_no}`,
        sku: progressModalTicket.sku,
        nama_produk: progressModalTicket.nama_produk,
        size: progressModalTicket.size,
        lokasi: targetKembali,
        qty: progressModalTicket.qty,
        operator: operatorName,
        keterangan: `Stok Lolos Grade A kembali ke rak ${targetKembali}`,
      }).catch(console.warn);

      playSuccessBeep();
      vibrateDevice([100, 50, 100]);
      onShowToast(
        `Selamat! Pakaian #${progressModalTicket.ticket_no} lolos Grade A dan siap kembali ke rak ${targetKembali}`,
        'success'
      );
    } else {
      // Gagal diselamatkan -> Vonis Defect
      const updated: PerbaikanTicket = {
        ...progressModalTicket,
        tahap: 'DEFECT',
        status_pengerjaan: 'GAGAL',
        lokasi_sekarang: 'DF-01',
        reparasi_selesai: new Date().toLocaleString('id-ID'),
        reparasi_catatan: progressCatatan.trim() || 'Gagal diselamatkan, masuk antrean defect',
        biaya_reparasi: Number(progressBiaya) || 0,
        updated_at: new Date().toISOString(),
      };
      setTickets((prev) => prev.map((t) => (t.id === progressModalTicket.id ? updated : t)));

      // Update ke Supabase
      updatePerbaikanTicketInSupabase(progressModalTicket.id || progressModalTicket.ticket_no, updated).catch(console.warn);

      // Mutasi Pindah ke Rak Defect DF-01
      const operatorName = session?.name || session?.username || 'Operator';
      recordPerbaikanStockMutation({
        type: 'OUT',
        invoice: `FAIL-${progressModalTicket.ticket_no}`,
        sku: progressModalTicket.sku,
        nama_produk: progressModalTicket.nama_produk,
        size: progressModalTicket.size,
        lokasi: progressModalTicket.lokasi_sekarang,
        qty: progressModalTicket.qty,
        operator: operatorName,
        keterangan: `Gagal perbaikan keluar dari ${progressModalTicket.lokasi_sekarang}`,
      }).catch(console.warn);

      recordPerbaikanStockMutation({
        type: 'IN',
        invoice: `FAIL-${progressModalTicket.ticket_no}`,
        sku: progressModalTicket.sku,
        nama_produk: progressModalTicket.nama_produk,
        size: progressModalTicket.size,
        lokasi: 'DF-01',
        qty: progressModalTicket.qty,
        operator: operatorName,
        keterangan: `Masuk rak Defect DF-01 menunggu ACC Harga`,
      }).catch(console.warn);

      playErrorBeep();
      vibrateDevice([150, 80, 150]);
      onShowToast(
        `Pakaian #${progressModalTicket.ticket_no} divonis Defect (dipindah ke rak DF-01). Menunggu ACC Harga.`,
        'warning'
      );
    }

    setProgressModalTicket(null);
  };

  // Eksekusi ACC Harga Defect (Dibatasi Role Superadmin / Manager)
  const handleExecuteAccDefect = () => {
    if (!accModalTicket) return;

    if (!canAccHarga) {
      playErrorBeep();
      onShowToast('Akses ditolak: Hanya Superadmin atau Manager yang berhak melakukan ACC harga defect!', 'error');
      return;
    }

    if (accDecision === 'DEFECT_SALE') {
      const updated: PerbaikanTicket = {
        ...accModalTicket,
        tahap: 'SELESAI_DEFECT_SALE',
        acc_harga_defect: Number(accHargaValue) || 0,
        acc_harga_by: session?.name || session?.username || 'Manager Gudang',
        acc_harga_tanggal: new Date().toLocaleString('id-ID'),
        acc_harga_catatan: accCatatan.trim() || 'ACC Defect Sale disetujui',
        updated_at: new Date().toISOString(),
      };
      setTickets((prev) => prev.map((t) => (t.id === accModalTicket.id ? updated : t)));

      // Update Supabase
      updatePerbaikanTicketInSupabase(accModalTicket.id || accModalTicket.ticket_no, updated).catch(console.warn);

      playSuccessBeep();
      onShowToast(
        `ACC Berhasil: Tiket #${accModalTicket.ticket_no} disetujui untuk Defect Sale (Rp ${Number(accHargaValue).toLocaleString('id-ID')})`,
        'success'
      );
    } else {
      const updated: PerbaikanTicket = {
        ...accModalTicket,
        tahap: 'SELESAI_SCRAP',
        acc_harga_by: session?.name || session?.username || 'Manager Gudang',
        acc_harga_tanggal: new Date().toLocaleString('id-ID'),
        acc_harga_catatan: accCatatan.trim() || 'Barang dimusnahkan (write-off scrap)',
        updated_at: new Date().toISOString(),
      };
      setTickets((prev) => prev.map((t) => (t.id === accModalTicket.id ? updated : t)));

      // Update Supabase
      updatePerbaikanTicketInSupabase(accModalTicket.id || accModalTicket.ticket_no, updated).catch(console.warn);

      // Mutasi Pemusnahan (Scrap) keluar dari inventori aktif
      const operatorName = session?.name || session?.username || 'Manager Gudang';
      recordPerbaikanStockMutation({
        type: 'ADJ_OUT',
        invoice: `SCRAP-${accModalTicket.ticket_no}`,
        sku: accModalTicket.sku,
        nama_produk: accModalTicket.nama_produk,
        size: accModalTicket.size,
        lokasi: accModalTicket.lokasi_sekarang,
        qty: accModalTicket.qty,
        operator: operatorName,
        keterangan: `Pemusnahan Defect Scrap: ${accCatatan.trim() || 'Write-off limbah'}`,
      }).catch(console.warn);

      playSuccessBeep();
      onShowToast(
        `Pemusnahan Berhasil: Tiket #${accModalTicket.ticket_no} dihapus dari neraca stok sebagai Scrap`,
        'info'
      );
    }

    setAccModalTicket(null);
  };

  // Export Rekap ke CSV (Dibatasi Hak Akses can_export_data)
  const handleExportCSV = () => {
    if (!canExport) {
      playErrorBeep();
      onShowToast('Akses ditolak: Anda tidak memiliki hak akses ekspor data laporan!', 'error');
      return;
    }

    if (tickets.length === 0) {
      onShowToast('Tidak ada data tiket untuk diekspor', 'warning');
      return;
    }

    const headers = [
      'No Tiket',
      'Tanggal',
      'SKU',
      'Nama Produk',
      'Size',
      'Qty',
      'Tahap',
      'Status Pengerjaan',
      'Lokasi Sekarang',
      'Kategori Rusak',
      'Detail Kerusakan',
      'QC PIC',
      'Petugas Reparasi',
      'Biaya Reparasi',
      'ACC Harga Defect',
      'ACC Oleh',
    ];

    const rows = tickets.map((t) => [
      `"${t.ticket_no}"`,
      `"${t.tanggal}"`,
      `"${t.sku}"`,
      `"${t.nama_produk.replace(/"/g, '""')}"`,
      `"${t.size || '-'}"`,
      t.qty,
      `"${t.tahap}"`,
      `"${t.status_pengerjaan}"`,
      `"${t.lokasi_sekarang}"`,
      `"${t.kategori_rusak}"`,
      `"${(t.detail_kerusakan || '').replace(/"/g, '""')}"`,
      `"${t.qc_pic || '-'}"`,
      `"${t.petugas_reparasi || '-'}"`,
      t.biaya_reparasi || 0,
      t.acc_harga_defect || 0,
      `"${t.acc_harga_by || '-'}"`,
    ]);

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' +
      [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute(
      'download',
      `Rekap_Perbaikan_Defect_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onShowToast('File CSV Rekap Perbaikan & Defect berhasil diunduh!', 'success');
  };

  // Reset Demo Data (Khusus Superadmin)
  const handleResetDemoData = () => {
    if (!userIsAdmin) {
      playErrorBeep();
      onShowToast('Akses ditolak: Hanya Superadmin yang berhak mereset data!', 'error');
      return;
    }
    if (window.confirm('Reset data modul perbaikan kembali ke data contoh bawaan?')) {
      setTickets(INITIAL_DEMO_TICKETS);
      localStorage.setItem('wms_local_perbaikan_tickets', JSON.stringify(INITIAL_DEMO_TICKETS));
      onShowToast('Data perbaikan berhasil direset ke data demo!', 'info');
    }
  };

  return (
    <div className="space-y-4 max-w-7xl mx-auto pb-16">
      {/* 1. Header Banner & Modul Indicator */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-lg border border-indigo-800/40 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-80 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-full text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Sistem Terpadu WMS • Pengelolaan Perbaikan & Defect</span>
              {isLoadingDb && (
                <span className="flex items-center gap-1 text-[10px] text-amber-300 font-mono animate-pulse">
                  <RefreshCw className="w-3 h-3 animate-spin" /> Sinkronisasi...
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2.5">
              <span>Pengelolaan Reject, Cuci, Permak & Defect</span>
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed font-medium">
              Siklus terpadu pendataan pakaian rusak, sortir Kepala QC, pemantauan laundry & jahit,
              hingga otorisasi ACC harga defect obral dengan integrasi stok inventori.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleSyncPhysicalStock}
              className="px-3.5 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-md shadow-blue-500/20 transition-all cursor-pointer active:scale-95"
              title="Tarik stok fisik yang berada di rak CC, PMK, & DF ke antrean pekerjaan"
            >
              <Database className="w-4 h-4" />
              <span>Tarik Stok Fisik (CC, PMK, DF)</span>
              {physicalRepairItems.length > 0 && (
                <span className="px-1.5 py-0.5 bg-white/20 text-white rounded-md text-[10px] font-mono font-bold">
                  {physicalRepairItems.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('input')}
              className="px-3.5 py-2 bg-[#ff7a00] hover:bg-[#e06b00] text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-md shadow-[#ff7a00]/30 transition-all cursor-pointer active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span>+ Pendataan & Sortir Reject</span>
            </button>

            <button
              type="button"
              onClick={handleExportCSV}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold flex items-center gap-2 transition-all cursor-pointer"
              title="Unduh Rekap Spreadsheet"
            >
              <Download className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Ekspor CSV</span>
            </button>

            <button
              type="button"
              onClick={handleResetDemoData}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/80 transition-colors"
              title="Reset Demo Data"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 2. KPI Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3.5">
        {/* Card 1: Reject Baru */}
        <div
          onClick={() => setActiveTab('reject')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'reject'
              ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-400 dark:border-rose-700 shadow-md'
              : 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 hover:border-rose-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">
            <span>Reject Baru</span>
            <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 font-mono">
            {stats.totalReject}{' '}
            <span className="text-xs font-normal text-slate-400">pcs</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            Belum terdata / disortir
          </div>
        </div>

        {/* Card 2: Cuci (CC) */}
        <div
          onClick={() => setActiveTab('cuci')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'cuci'
              ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-400 dark:border-blue-700 shadow-md'
              : 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 hover:border-blue-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">
            <span>Antrean Cuci [CC]</span>
            <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950/60 text-blue-600 flex items-center justify-center">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 font-mono">
            {stats.totalCuci}{' '}
            <span className="text-xs font-normal text-slate-400">pcs</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            Sedang cuci di rak CC
          </div>
        </div>

        {/* Card 3: Permak (PMK) */}
        <div
          onClick={() => setActiveTab('permak')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'permak'
              ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-400 dark:border-amber-700 shadow-md'
              : 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 hover:border-amber-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">
            <span>Antrean Permak [PMK]</span>
            <div className="w-7 h-7 rounded-lg bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center">
              <Scissors className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 font-mono">
            {stats.totalPermak}{' '}
            <span className="text-xs font-normal text-slate-400">pcs</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            Sedang jahit di rak PMK
          </div>
        </div>

        {/* Card 4: Defect (DF) */}
        <div
          onClick={() => setActiveTab('defect')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
            activeTab === 'defect'
              ? 'bg-purple-50 dark:bg-purple-950/40 border-purple-400 dark:border-purple-700 shadow-md'
              : 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 hover:border-purple-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">
            <span>Ruang Defect [DF]</span>
            <div className="w-7 h-7 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center">
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-600 dark:text-purple-400 font-mono">
            {stats.totalDefect}{' '}
            <span className="text-xs font-normal text-slate-400">pcs</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1 truncate">
            Rak DF • Menunggu ACC
          </div>
        </div>

        {/* Card 5: Arsip Histori Pengecekan */}
        <div
          onClick={() => setActiveTab('rekap')}
          className={`p-3.5 rounded-2xl border transition-all cursor-pointer col-span-2 sm:col-span-1 ${
            activeTab === 'rekap'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400 dark:border-emerald-700 shadow-md'
              : 'bg-white dark:bg-[#131d31] border-slate-200 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-bold mb-1">
            <span>Arsip Histori Selesai</span>
            <div className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center">
              <Archive className="w-4 h-4" />
            </div>
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            {stats.totalArsip}{' '}
            <span className="text-xs font-normal text-slate-400">pcs</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1 truncate flex items-center gap-1">
            <span className="text-emerald-600 font-bold">{stats.totalGradeA} Grade A</span> •{' '}
            <span className="text-purple-600 font-bold">{stats.totalDefectSale} Obral</span>
          </div>
        </div>
      </div>

      {/* 3. Tab Bar Navigation */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-slate-200 dark:border-slate-800 scrollbar-none">
        <button
          type="button"
          onClick={() => setActiveTab('reject')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'reject'
              ? 'bg-rose-600 text-white shadow-md shadow-rose-600/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>1. Antrean Reject ({stats.totalReject})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cuci')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'cuci'
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>2. Pengerjaan Cuci [CC] ({stats.totalCuci})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('permak')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'permak'
              ? 'bg-amber-600 text-white shadow-md shadow-amber-600/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Scissors className="w-4 h-4" />
          <span>3. Pengerjaan Permak [PMK] ({stats.totalPermak})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('defect')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'defect'
              ? 'bg-purple-600 text-white shadow-md shadow-purple-600/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Tag className="w-4 h-4" />
          <span>4. Ruang Defect [DF] ({stats.totalDefect})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('rekap')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ${
            activeTab === 'rekap'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/25'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Archive className="w-4 h-4" />
          <span>5. Arsip & Histori Pengecekan ({stats.totalArsip})</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('input')}
          className={`px-4 py-2.5 rounded-xl text-xs font-extrabold flex items-center gap-2 whitespace-nowrap transition-all cursor-pointer ml-auto ${
            activeTab === 'input'
              ? 'bg-[#ff7a00] text-white shadow-md shadow-[#ff7a00]/25'
              : 'text-[#ff7a00] bg-[#ff7a00]/10 hover:bg-[#ff7a00]/20'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>+ Pendataan & Sortir Reject</span>
        </button>
      </div>

      {/* 4. Tab 1: Form Input Reject Baru */}
      {activeTab === 'input' && (
        <div className="bg-white dark:bg-[#131d31] p-4 sm:p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#ff7a00]" />
                <span>Form Pendataan Produk Rusak (Reject) & Sortir Sekaligus</span>
              </h2>
              <p className="text-xs text-slate-500">
                Produk reject adalah barang rusak yang belum terdata saat ini. Pendataan ini dilakukan sekaligus dengan sortir arah penanganan (Cuci [CC], Permak [PMK], atau Defect [DF]).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('reject')}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 font-bold"
            >
              Batal / Kembali
            </button>
          </div>

          <form onSubmit={handleCreateTicket} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Field SKU */}
              <div className="space-y-1 relative">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Barcode SKU Pakaian *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={formSku}
                    onChange={(e) => {
                      const val = e.target.value;
                      setFormSku(val);
                      // Auto-fill nama if found exact match in O(1)
                      const exact = catalogSkuMap.get(val.trim().toUpperCase());
                      if (exact) {
                        setFormNama(exact.p || exact.n || '');
                        setFormSize(exact.s || 'Default');
                      }
                    }}
                    placeholder="Scan atau ketik SKU (cth: TSH-OVR-BLK-M)"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white uppercase focus:ring-2 focus:ring-[#ff7a00] outline-none"
                  />
                </div>

                {/* SKU Suggestions Dropdown */}
                {skuSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-20 overflow-hidden">
                    {skuSuggestions.map((prod) => (
                      <div
                        key={prod.k}
                        onClick={() => {
                          setFormSku(prod.k);
                          setFormNama(prod.p);
                          setFormSize(prod.s || 'Default');
                        }}
                        className="px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer text-xs border-b border-slate-100 dark:border-slate-800 last:border-b-0"
                      >
                        <div className="font-bold text-[#ff7a00] font-mono">{prod.k}</div>
                        <div className="text-[11px] text-slate-600 dark:text-slate-300 truncate">
                          {prod.p} {prod.s ? `(Size: ${prod.s})` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Field Nama Produk */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Nama Produk
                </label>
                <input
                  type="text"
                  value={formNama}
                  onChange={(e) => setFormNama(e.target.value)}
                  placeholder="Nama produk (otomatis terisi dari katalog)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white outline-none"
                />
              </div>

              {/* Field Size & Qty */}
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Size
                  </label>
                  <input
                    type="text"
                    value={formSize}
                    onChange={(e) => setFormSize(e.target.value)}
                    placeholder="S/M/L/XL"
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-center uppercase text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Qty (Pcs)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formQty}
                    onChange={(e) => setFormQty(Number(e.target.value) || 1)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-black text-center text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              {/* Field Lokasi Asal */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Lokasi Rak Asal *
                </label>
                <input
                  type="text"
                  required
                  value={formLokasiAsal}
                  onChange={(e) => setFormLokasiAsal(e.target.value)}
                  placeholder="Rak saat ditemukan (cth: A-01 / RETUR)"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold uppercase text-slate-900 dark:text-white outline-none"
                />
              </div>

              {/* Field Sumber Barang */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Asal / Sumber Barang
                </label>
                <select
                  value={formSumber}
                  onChange={(e) => setFormSumber(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white outline-none cursor-pointer"
                >
                  <option value="Gudang Fisik">Gudang Fisik (Temuan Rak/SO)</option>
                  <option value="Retur Marketplace">Retur Pelanggan Marketplace</option>
                  <option value="Penerimaan CMT">Penerimaan Produksi / CMT</option>
                  <option value="Live/Studio">Sample Live / Foto Studio</option>
                  <option value="Toko">Toko Offline / Store</option>
                </select>
              </div>

              {/* Field Kategori Kerusakan */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Kategori Kerusakan *
                </label>
                <select
                  value={formKategoriRusak}
                  onChange={(e) => setFormKategoriRusak(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-xl text-xs font-black text-rose-700 dark:text-rose-300 outline-none cursor-pointer"
                >
                  <option value="Noda / Kotor">🧺 Noda / Kotor (Potensi Cuci)</option>
                  <option value="Jahitan Rusak">🪡 Jahitan Rusak / Lepas (Potensi Permak)</option>
                  <option value="Kain Sobek / Bolong">⚠️ Kain Sobek / Bolong (Potensi Defect)</option>
                  <option value="Kancing / Resleting">🔘 Kancing / Resleting Rusak</option>
                  <option value="Cacat Kain / Warna">🎨 Cacat Kain / Warna Pudar</option>
                  <option value="Aksesoris Kurang">🏷️ Aksesoris / Label Kurang</option>
                  <option value="Lainnya">📝 Kerusakan Lainnya</option>
                </select>
              </div>
            </div>

            {/* Toggle Status Fisik: Sudah di Perbaikan vs Perlu Mutasi Tarik */}
            <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl flex items-center justify-between gap-3">
              <div className="space-y-0.5">
                <div className="text-xs font-extrabold text-amber-900 dark:text-amber-300">
                  Status Lokasi Fisik Barang
                </div>
                <div className="text-[11px] text-amber-700 dark:text-amber-400">
                  {formIsAlreadyInRepair
                    ? 'Barang sudah berada di area perbaikan fisik (tidak membuat mutasi log baru).'
                    : 'Barang ditarik dari rak reguler (otomatis OUT dari rak asal dan IN ke PERBAIKAN-01).'}
                </div>
              </div>

              <label className="relative inline-flex items-center cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={formIsAlreadyInRepair}
                  onChange={(e) => setFormIsAlreadyInRepair(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#ff7a00]"></div>
                <span className="ml-2 text-xs font-bold text-slate-700 dark:text-slate-300 hidden sm:inline">
                  {formIsAlreadyInRepair ? 'Sudah di Perbaikan' : 'Tarik dari Rak'}
                </span>
              </label>
            </div>

            {/* Deskripsi Detail Kerusakan */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Detail Kerusakan Pakaian
              </label>
              <textarea
                rows={2}
                value={formDetailKerusakan}
                onChange={(e) => setFormDetailKerusakan(e.target.value)}
                placeholder="Jelaskan letak noda, bagian jahitan yang lepas, atau kendala spesifik pakaian..."
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#ff7a00]"
              />
            </div>

            {/* Upload Foto Kerusakan dengan Canvas WebP Compression */}
            <div className="space-y-2 p-4 bg-slate-50 dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-[#ff7a00]" />
                    <span>Dokumentasi Foto Kerusakan (Maks 3 Foto)</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Otomatis dikompresi ke format WebP super ringan (~40 KB) agar hemat ruang penyimpanan.
                  </div>
                </div>

                <label className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-[#ff7a00] rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5 cursor-pointer shadow-xs transition-all">
                  <UploadCloud className="w-3.5 h-3.5 text-[#ff7a00]" />
                  <span>Ambil / Upload Foto</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    disabled={isCompressing || formPhotos.length >= 3}
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* Progress Kompresi */}
              {isCompressing && (
                <div className="flex items-center gap-2 p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 rounded-xl text-xs font-bold animate-pulse">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                  <span>Sedang mengompresi foto ke WebP ultra-ringan...</span>
                </div>
              )}

              {/* Thumbnail Gallery Preview */}
              {formPhotos.length > 0 ? (
                <div className="grid grid-cols-3 gap-3 pt-2">
                  {formPhotos.map((photo, idx) => (
                    <div
                      key={idx}
                      className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-video flex items-center justify-center"
                    >
                      <img
                        src={photo.dataUrl}
                        alt={`Kerusakan ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-1 text-center">
                        <span className="text-[10px] text-white font-mono font-bold">
                          {photo.sizeText}
                        </span>
                        <span className="text-[9px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full font-black">
                          Hemat {photo.savedPercent}%
                        </span>
                        <button
                          type="button"
                          onClick={() => setFormPhotos((prev) => prev.filter((_, i) => i !== idx))}
                          className="p-1 bg-rose-600 text-white rounded-lg hover:bg-rose-700 mt-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-4 text-xs text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 rounded-xl">
                  Belum ada foto yang dipilih. Foto opsional namun sangat direkomendasikan untuk bukti QC.
                </div>
              )}
            </div>

            {/* Pilihan Jalur Sortir Langsung (Pendataan & Sortir Sekaligus) */}
            <div className="space-y-3 p-4 bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-900/50 rounded-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-black text-indigo-950 dark:text-indigo-200 flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>Vonis Sortir Langsung (Tentukan Jalur Penanganan) *</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Pendataan berlangsung sekalian sortir agar pakaian langsung masuk ke antrean pengerjaan yang dituju.
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setFormTindakanSortir('CUCI');
                    setFormLokasiTujuan('CC-01');
                    setFormKategoriRusak('Noda / Kotor');
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    formTindakanSortir === 'CUCI'
                      ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-900 dark:text-blue-100 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-xs text-blue-600 dark:text-blue-400">
                    <Sparkles className="w-4 h-4" />
                    <span>1. Jalur CUCI [CC]</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Noda / kotor ➔ Masuk Rak <b>CC-01</b>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFormTindakanSortir('PERMAK');
                    setFormLokasiTujuan('PMK-01');
                    setFormKategoriRusak('Jahitan Rusak');
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    formTindakanSortir === 'PERMAK'
                      ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-900 dark:text-amber-100 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-xs text-amber-600 dark:text-amber-400">
                    <Scissors className="w-4 h-4" />
                    <span>2. Jalur PERMAK [PMK]</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Jahit / kancing ➔ Masuk Rak <b>PMK-01</b>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFormTindakanSortir('DEFECT');
                    setFormLokasiTujuan('DF-01');
                    setFormKategoriRusak('Kain Sobek / Bolong');
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    formTindakanSortir === 'DEFECT'
                      ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-500 text-purple-900 dark:text-purple-100 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-xs text-purple-600 dark:text-purple-400">
                    <Tag className="w-4 h-4" />
                    <span>3. Ruang DEFECT [DF]</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Cacat berat ➔ Masuk Rak <b>DF-01</b>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setFormTindakanSortir('SORTIR_NANTI');
                    setFormLokasiTujuan('PERBAIKAN-01');
                  }}
                  className={`p-3 rounded-xl border text-left cursor-pointer transition-all ${
                    formTindakanSortir === 'SORTIR_NANTI'
                      ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-900 dark:text-rose-100 shadow-sm'
                      : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  <div className="flex items-center gap-1.5 font-black text-xs text-rose-600 dark:text-rose-400">
                    <AlertTriangle className="w-4 h-4" />
                    <span>4. Sortir Nanti</span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    Tampung di antrean reject
                  </div>
                </button>
              </div>

              {/* Sub-inputs jika memilih jalur langsung */}
              {formTindakanSortir !== 'SORTIR_NANTI' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-indigo-200/50 dark:border-indigo-900/40">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Penempatan Rak Tujuan *
                    </label>
                    <input
                      type="text"
                      value={formLokasiTujuan}
                      onChange={(e) => setFormLokasiTujuan(e.target.value)}
                      placeholder="cth: CC-01 / PMK-01 / DF-01"
                      className="w-full px-3 py-2 bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold uppercase"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Petugas / Vendor Pelaksana
                    </label>
                    <input
                      type="text"
                      value={formPetugasPelaksana}
                      onChange={(e) => setFormPetugasPelaksana(e.target.value)}
                      placeholder={
                        formTindakanSortir === 'CUCI'
                          ? 'Laundry Berkah / Vendor Cuci'
                          : formTindakanSortir === 'PERMAK'
                          ? 'Pak Joko (Penjahit)'
                          : '-'
                      }
                      className="w-full px-3 py-2 bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Instruksi Penanganan Khusus
                    </label>
                    <input
                      type="text"
                      value={formInstruksiSortir}
                      onChange={(e) => setFormInstruksiSortir(e.target.value)}
                      placeholder="cth: Cuci noda kopi di kerah / Jahit obras samping"
                      className="w-full px-3 py-2 bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Tombol Simpan Tiket */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setActiveTab('reject')}
                className="px-4 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                className={`px-6 py-2.5 text-white rounded-xl text-xs font-black shadow-md transition-all cursor-pointer active:scale-95 flex items-center gap-2 ${
                  formTindakanSortir === 'CUCI'
                    ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/25'
                    : formTindakanSortir === 'PERMAK'
                    ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-500/25'
                    : formTindakanSortir === 'DEFECT'
                    ? 'bg-purple-600 hover:bg-purple-700 shadow-purple-500/25'
                    : 'bg-[#ff7a00] hover:bg-[#e06b00] shadow-[#ff7a00]/30'
                }`}
              >
                <Check className="w-4 h-4" />
                <span>
                  {formTindakanSortir === 'CUCI'
                    ? 'Simpan & Alokasikan ke Antrean Cuci (CC)'
                    : formTindakanSortir === 'PERMAK'
                    ? 'Simpan & Alokasikan ke Antrean Permak (PMK)'
                    : formTindakanSortir === 'DEFECT'
                    ? 'Simpan & Alokasikan ke Ruang Defect (DF)'
                    : 'Simpan ke Antrean Reject (Sortir Nanti)'}
                </span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* 5. Filter & Search Toolbar (Untuk Tab List) */}
      {activeTab !== 'input' && (
        <div className="p-3 bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari No Tiket / SKU / Nama / Kerusakan..."
              className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-[#ff7a00]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <select
              value={filterKategori}
              onChange={(e) => setFilterKategori(e.target.value)}
              className="px-3 py-2 bg-slate-50 dark:bg-[#0f172a] border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 outline-none cursor-pointer"
            >
              <option value="ALL">Semua Kategori Kerusakan</option>
              <option value="Noda / Kotor">Noda / Kotor</option>
              <option value="Jahitan Rusak">Jahitan Rusak</option>
              <option value="Kain Sobek / Bolong">Kain Sobek / Bolong</option>
              <option value="Kancing / Resleting">Kancing / Resleting</option>
              <option value="Cacat Kain / Warna">Cacat Kain / Warna</option>
              <option value="Lainnya">Lainnya</option>
            </select>
          </div>
        </div>
      )}

      {/* Panel Khusus Tab 5: Arsip & Histori Pengecekan */}
      {activeTab === 'rekap' && (
        <div className="p-4 bg-gradient-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border border-emerald-500/30 rounded-2xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-white">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                <Archive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <span>Arsip & Histori Pengecekan Produk</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-mono font-bold">
                    {stats.totalArsip} Selesai
                  </span>
                </h3>
                <p className="text-[11px] text-slate-300">
                  Rekam jejak audit pemeriksaan fisik pakaian (Lolos Grade A, Obral Defect, atau Scrap/Limbah).
                </p>
              </div>
            </div>

            {/* Filter Status Hasil Akhir Arsip */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <button
                type="button"
                onClick={() => setFilterArsipStatus('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filterArsipStatus === 'ALL'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                Semua Arsip ({stats.totalArsip})
              </button>
              <button
                type="button"
                onClick={() => setFilterArsipStatus('SELESAI_GRADE_A')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filterArsipStatus === 'SELESAI_GRADE_A'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                ✨ Grade A ({stats.totalGradeA})
              </button>
              <button
                type="button"
                onClick={() => setFilterArsipStatus('SELESAI_DEFECT_SALE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filterArsipStatus === 'SELESAI_DEFECT_SALE'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                🏷️ Defect Sale ({stats.totalDefectSale})
              </button>
              <button
                type="button"
                onClick={() => setFilterArsipStatus('SELESAI_SCRAP')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filterArsipStatus === 'SELESAI_SCRAP'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                🗑️ Scrap ({stats.totalScrap})
              </button>
            </div>
          </div>

          {/* Lacak Riwayat Berdasarkan SKU */}
          <div className="pt-2 border-t border-slate-700/50 flex flex-col sm:flex-row items-center gap-2">
            <div className="relative flex-1 w-full">
              <History className="w-4 h-4 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchSkuArsip}
                onChange={(e) => setSearchSkuArsip(e.target.value)}
                placeholder="Lacak riwayat pengecekan SKU masa lalu (cth: ketik TSH-OVR-BLK-M)..."
                className="w-full pl-9 pr-8 py-2 bg-slate-900/90 border border-emerald-500/40 rounded-xl text-xs text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
              />
              {searchSkuArsip && (
                <button
                  type="button"
                  onClick={() => setSearchSkuArsip('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {searchSkuArsip && (
              <span className="text-[11px] text-emerald-400 font-bold shrink-0">
                Filter Histori SKU: <b className="font-mono text-white">{searchSkuArsip.toUpperCase()}</b>
              </span>
            )}
          </div>
        </div>
      )}

      {/* 6. Content List Per Tab */}
      {activeTab !== 'input' && (
        <div className="space-y-3">
          {filteredTickets.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {filteredTickets.slice(0, ticketDisplayLimit).map((item) => (
                <div
                  key={item.id}
                  className="bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-4 space-y-3 hover:shadow-md transition-shadow relative overflow-hidden"
                >
                  {/* Badge Tahap Warna */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-black text-indigo-600 dark:text-indigo-400">
                        #{item.ticket_no}
                      </span>
                      <span className="text-[10px] text-slate-400">• {item.tanggal}</span>
                    </div>

                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        item.tahap === 'REJECT'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300'
                          : item.tahap === 'CUCI'
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300'
                          : item.tahap === 'PERMAK'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300'
                          : item.tahap === 'DEFECT'
                          ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300'
                          : item.tahap === 'SELESAI_GRADE_A'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {item.tahap.replace(/_/g, ' ')}
                    </span>
                  </div>

                  {/* Info SKU & Produk */}
                  <div>
                    <div className="text-xs font-black font-mono text-[#ff7a00] truncate">
                      {item.sku}
                    </div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {item.nama_produk}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                      <span>Size: <b className="text-slate-700 dark:text-slate-300">{item.size || '-'}</b></span>
                      <span>Lokasi Rak: <b className="text-indigo-600 font-mono font-bold">{item.lokasi_sekarang}</b></span>
                      <span>Qty: <b>{item.qty} pcs</b></span>
                    </div>
                  </div>

                  {/* Kategori & Deskripsi Kerusakan */}
                  <div className="p-2.5 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-rose-600 dark:text-rose-400">
                        {item.kategori_rusak}
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        Sumber: {item.sumber_barang}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-snug line-clamp-2">
                      {item.detail_kerusakan}
                    </p>
                  </div>

                  {/* Catatan QC / Petugas jika ada */}
                  {item.qc_catatan && (
                    <div className="p-2 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-lg text-[11px] text-indigo-900 dark:text-indigo-300">
                      <b className="text-indigo-700 dark:text-indigo-200">Catatan QC ({item.qc_pic}):</b> {item.qc_catatan}
                    </div>
                  )}

                  {/* Preview Foto Thumbnail jika ada */}
                  {item.foto_urls && item.foto_urls.length > 0 && (
                    <div className="flex items-center gap-2 pt-1">
                      <div className="flex items-center gap-1.5 overflow-hidden">
                        {item.foto_urls.map((imgUrl, i) => (
                          <div
                            key={i}
                            onClick={() => setLightboxImages(item.foto_urls)}
                            className="w-12 h-12 rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 shrink-0 cursor-pointer hover:opacity-80 transition-opacity"
                          >
                            <img src={imgUrl} alt="Foto" className="w-full h-full object-cover" />
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setLightboxImages(item.foto_urls)}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                      >
                        Lihat ({item.foto_urls.length})
                      </button>
                    </div>
                  )}

                  {/* Tombol Aksi Berdasarkan Tahap */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => setPrintModalTicket(item)}
                      className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
                      title="Cetak Label Tag Pakaian"
                    >
                      <Printer className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(item)}
                      className="p-2 text-slate-500 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/40 rounded-xl transition-colors cursor-pointer"
                      title="Edit Keterangan, Foto & Data Pengerjaan"
                    >
                      <Edit3 className="w-4 h-4 text-amber-500" />
                    </button>

                    {/* Aksi Tahap 1: Sortir Kepala QC */}
                    {item.tahap === 'REJECT' && (
                      <button
                        type="button"
                        onClick={() => {
                          setSortirModalTicket(item);
                          setSortirTargetTahap('CUCI');
                          setSortirCatatan('');
                          setSortirPetugas('');
                        }}
                        className="flex-1 py-1.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>Sortir Kepala QC</span>
                      </button>
                    )}

                    {/* Aksi Tahap 2: Update Cuci / Permak */}
                    {(item.tahap === 'CUCI' || item.tahap === 'PERMAK') && (
                      <button
                        type="button"
                        onClick={() => {
                          setProgressModalTicket(item);
                          setProgressResult('SUCCESS_GRADE_A');
                          setProgressCatatan('');
                          setProgressBiaya(item.biaya_reparasi || 0);
                        }}
                        className="flex-1 py-1.5 px-3 bg-[#ff7a00] hover:bg-[#e06b00] text-white rounded-xl text-xs font-black shadow-xs cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <Wrench className="w-3.5 h-3.5" />
                        <span>Update Hasil Pengerjaan</span>
                      </button>
                    )}

                    {/* Aksi Tahap 3: ACC Harga Defect */}
                    {item.tahap === 'DEFECT' && (
                      <button
                        type="button"
                        onClick={() => {
                          if (!canAccHarga) {
                            onShowToast('Akses dibatasi: Otorisasi ACC harga defect hanya untuk Superadmin / Manager!', 'warning');
                            return;
                          }
                          setAccModalTicket(item);
                          setAccDecision('DEFECT_SALE');
                          setAccHargaValue(50000);
                          setAccCatatan('');
                        }}
                        className={`flex-1 py-1.5 px-3 ${
                          canAccHarga
                            ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs'
                            : 'bg-purple-950/40 text-purple-300 border border-purple-800'
                        } rounded-xl text-xs font-black cursor-pointer flex items-center justify-center gap-1.5`}
                        title={canAccHarga ? 'Otorisasi ACC Harga Defect' : 'Akses khusus Superadmin / Manager'}
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>ACC Harga Defect</span>
                        {!canAccHarga && <span className="text-[10px] ml-0.5">🔒</span>}
                      </button>
                    )}

                    {/* Tahap Selesai */}
                    {(item.tahap === 'SELESAI_GRADE_A' ||
                      item.tahap === 'SELESAI_DEFECT_SALE' ||
                      item.tahap === 'SELESAI_SCRAP') && (
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Selesai</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {filteredTickets.length > ticketDisplayLimit && (
              <div className="flex justify-center pt-2 pb-1">
                <button
                  type="button"
                  onClick={() => setTicketDisplayLimit((prev) => prev + TICKET_RENDER_STEP)}
                  className="px-6 py-2.5 bg-white dark:bg-[#131d31] hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>⬇️ Tampilkan Lebih Banyak (+{TICKET_RENDER_STEP} Tiket)</span>
                  <span className="text-[11px] text-slate-400 font-mono">
                    (Sisa {filteredTickets.length - ticketDisplayLimit} dari {filteredTickets.length})
                  </span>
                </button>
              </div>
            )}
            </>
          ) : (
            <div className="p-8 text-center bg-white dark:bg-[#131d31] rounded-2xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto text-slate-400">
                <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              </div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                Tidak ada pakaian pada tahapan ini
              </h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Semua pakaian sudah selesai diproses atau belum ada tiket yang didaftarkan.
              </p>
            </div>
          )}
        </div>
      )}

      {/* 7. Modal Sortir Kepala QC */}
      {sortirModalTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#101726] max-w-lg w-full rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5" />
                <h3 className="text-sm font-black">Sortir Kepala QC (Inspeksi)</h3>
              </div>
              <button
                type="button"
                onClick={() => setSortirModalTicket(null)}
                className="p-1 hover:bg-white/20 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl space-y-1">
                <div className="font-mono font-bold text-[#ff7a00]">
                  #{sortirModalTicket.ticket_no} • {sortirModalTicket.sku}
                </div>
                <div className="font-bold text-slate-800 dark:text-white">
                  {sortirModalTicket.nama_produk}
                </div>
                <div className="text-rose-600 font-medium">
                  Kendala: {sortirModalTicket.kategori_rusak} — {sortirModalTicket.detail_kerusakan}
                </div>
              </div>

              {/* Pilihan Jalur Penanganan */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Arahkan Penanganan Ke Jalur: *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSortirTargetTahap('CUCI')}
                    className={`p-3 rounded-xl border text-center font-extrabold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      sortirTargetTahap === 'CUCI'
                        ? 'bg-blue-50 dark:bg-blue-950/60 border-blue-500 text-blue-700 dark:text-blue-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Sparkles className="w-5 h-5 text-blue-500" />
                    <span>Jalur CUCI</span>
                    <span className="text-[10px] font-normal text-slate-400">Rak CC-01</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSortirTargetTahap('PERMAK')}
                    className={`p-3 rounded-xl border text-center font-extrabold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      sortirTargetTahap === 'PERMAK'
                        ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-700 dark:text-amber-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Scissors className="w-5 h-5 text-amber-500" />
                    <span>Jalur PERMAK</span>
                    <span className="text-[10px] font-normal text-slate-400">Rak PMK-01</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSortirTargetTahap('DEFECT')}
                    className={`p-3 rounded-xl border text-center font-extrabold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      sortirTargetTahap === 'DEFECT'
                        ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-500 text-purple-700 dark:text-purple-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Tag className="w-5 h-5 text-purple-500" />
                    <span>Vonis DEFECT</span>
                    <span className="text-[10px] font-normal text-slate-400">Rak DF-01</span>
                  </button>
                </div>
              </div>

              {/* Nama Kepala QC & Petugas */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Nama Kepala QC (PIC)
                  </label>
                  <input
                    type="text"
                    value={sortirPic}
                    onChange={(e) => setSortirPic(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Petugas / Vendor Pelaksana
                  </label>
                  <input
                    type="text"
                    value={sortirPetugas}
                    onChange={(e) => setSortirPetugas(e.target.value)}
                    placeholder="cth: Pak Joko / Laundry Berkah"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>

              {/* Catatan Instruksi QC */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Instruksi Khusus untuk Penjahit / Pencuci:
                </label>
                <textarea
                  rows={2}
                  value={sortirCatatan}
                  onChange={(e) => setSortirCatatan(e.target.value)}
                  placeholder="cth: Gunakan obat noda darah, jangan disikat bagian sablon..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSortirModalTicket(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteSortir}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md cursor-pointer"
              >
                Simpan & Alokasikan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Modal Update Hasil Pengerjaan (Cuci / Permak) */}
      {progressModalTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#101726] max-w-lg w-full rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 bg-[#ff7a00] text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5" />
                <h3 className="text-sm font-black">
                  Update Pengerjaan ({progressModalTicket.tahap})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setProgressModalTicket(null)}
                className="p-1 hover:bg-white/20 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-slate-50 dark:bg-slate-850 rounded-xl space-y-1">
                <div className="font-mono font-bold text-[#ff7a00]">
                  #{progressModalTicket.ticket_no} • {progressModalTicket.sku}
                </div>
                <div className="font-bold text-slate-800 dark:text-white">
                  {progressModalTicket.nama_produk}
                </div>
                <div className="text-slate-500">
                  Petugas Pelaksana: <b>{progressModalTicket.petugas_reparasi || 'Belum diisi'}</b>
                </div>
              </div>

              {/* Hasil Akhir */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Hasil Inspeksi Pengerjaan: *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setProgressResult('SUCCESS_GRADE_A')}
                    className={`p-3 rounded-xl border font-extrabold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      progressResult === 'SUCCESS_GRADE_A'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-500 text-emerald-700 dark:text-emerald-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    <span>Lolos Grade A (Bagus)</span>
                    <span className="text-[10px] font-normal text-slate-400">
                      Kembali ke rak siap jual
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setProgressResult('FAILED_DEFECT')}
                    className={`p-3 rounded-xl border font-extrabold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      progressResult === 'FAILED_DEFECT'
                        ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-700 dark:text-rose-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <AlertTriangle className="w-5 h-5 text-rose-500" />
                    <span>Gagal (Tetap Rusak)</span>
                    <span className="text-[10px] font-normal text-slate-400">
                      Vonis jadi Defect (Rak DF-01)
                    </span>
                  </button>
                </div>
              </div>

              {/* Input Rak Pengembalian (Jika Lolos Grade A) */}
              {progressResult === 'SUCCESS_GRADE_A' && (
                <div className="space-y-1 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800/40">
                  <label className="font-bold text-emerald-900 dark:text-emerald-300">
                    Pilih Rak Penempatan Siap Jual: *
                  </label>
                  <input
                    type="text"
                    required
                    value={progressLokasiKembali}
                    onChange={(e) => setProgressLokasiKembali(e.target.value)}
                    placeholder="cth: A-01 / B-04 / READY-STOCK"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-xl font-bold uppercase"
                  />
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400">
                    Sistem akan otomatis membuat mutasi IN ke rak ini agar saldo fisik bertambah.
                  </span>
                </div>
              )}

              {/* Biaya & Catatan */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Biaya Reparasi (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={progressBiaya}
                    onChange={(e) => setProgressBiaya(Number(e.target.value) || 0)}
                    placeholder="Ongkos jahit / cuci"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Catatan Hasil
                  </label>
                  <input
                    type="text"
                    value={progressCatatan}
                    onChange={(e) => setProgressCatatan(e.target.value)}
                    placeholder="Kondisi kain saat ini..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setProgressModalTicket(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleExecuteProgress}
                className="px-5 py-2 bg-[#ff7a00] hover:bg-[#e06b00] text-white rounded-xl text-xs font-black shadow-md cursor-pointer"
              >
                Simpan Hasil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Modal ACC Harga Defect */}
      {accModalTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-[#101726] max-w-lg w-full rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 bg-purple-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5" />
                <h3 className="text-sm font-black">Otorisasi & ACC Harga Defect</h3>
              </div>
              <button
                type="button"
                onClick={() => setAccModalTicket(null)}
                className="p-1 hover:bg-white/20 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800/50 space-y-1">
                <div className="font-mono font-bold text-purple-700 dark:text-purple-300">
                  #{accModalTicket.ticket_no} • {accModalTicket.sku}
                </div>
                <div className="font-bold text-slate-800 dark:text-white">
                  {accModalTicket.nama_produk}
                </div>
                <div className="text-slate-600 dark:text-slate-400">
                  Kendala: <b>{accModalTicket.kategori_rusak}</b> — {accModalTicket.detail_kerusakan}
                </div>
              </div>

              {/* Pilihan Keputusan Manager */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Keputusan Tindakan Defect: *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAccDecision('DEFECT_SALE')}
                    className={`p-3 rounded-xl border font-extrabold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      accDecision === 'DEFECT_SALE'
                        ? 'bg-purple-50 dark:bg-purple-950/60 border-purple-500 text-purple-700 dark:text-purple-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Tag className="w-5 h-5 text-purple-500" />
                    <span>Dijual Defect Sale</span>
                    <span className="text-[10px] font-normal text-slate-400">
                      Obral khusus / Live Defect
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAccDecision('SCRAP')}
                    className={`p-3 rounded-xl border font-extrabold flex flex-col items-center gap-1 cursor-pointer transition-all ${
                      accDecision === 'SCRAP'
                        ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-700 dark:text-rose-300 shadow-xs'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Archive className="w-5 h-5 text-rose-500" />
                    <span>Dimusnahkan (Scrap)</span>
                    <span className="text-[10px] font-normal text-slate-400">
                      Hapus stok / write-off limbah
                    </span>
                  </button>
                </div>
              </div>

              {/* Form Input Harga jika Defect Sale */}
              {accDecision === 'DEFECT_SALE' && (
                <div className="space-y-1 p-3 bg-purple-50/60 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800">
                  <label className="font-bold text-purple-900 dark:text-purple-300">
                    Nilai Harga Jual Defect Disetujui (Rp): *
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    value={accHargaValue}
                    onChange={(e) => setAccHargaValue(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-purple-300 dark:border-purple-700 rounded-xl font-mono text-base font-black text-purple-700 dark:text-purple-300"
                  />
                  <span className="text-[10px] text-purple-700 dark:text-purple-400">
                    Harga ini yang akan digunakan saat proses kasir / invoice obral defect.
                  </span>
                </div>
              )}

              {/* Catatan Otorisasi */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Catatan Otorisasi Manager / Owner:
                </label>
                <textarea
                  rows={2}
                  value={accCatatan}
                  onChange={(e) => setAccCatatan(e.target.value)}
                  placeholder="cth: ACC defect sale harga Rp 50.000 untuk clearance bazzar..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAccModalTicket(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={!canAccHarga}
                onClick={handleExecuteAccDefect}
                className={`px-5 py-2 ${
                  canAccHarga
                    ? 'bg-purple-600 hover:bg-purple-700 text-white shadow-md cursor-pointer'
                    : 'bg-purple-950/40 text-purple-400 cursor-not-allowed border border-purple-800'
                } rounded-xl text-xs font-black`}
              >
                {canAccHarga ? 'Simpan Otorisasi ACC' : '🔒 Khusus Superadmin / Manager'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Edit Keterangan & Foto Tiket Pengerjaan */}
      {editModalTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in overflow-y-auto">
          <div className="bg-white dark:bg-[#101726] max-w-xl w-full rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
            <div className="p-4 bg-amber-500 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5" />
                <h3 className="text-sm font-black">
                  Edit Data, Foto & Pengerjaan #{editModalTicket.ticket_no}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditModalTicket(null)}
                className="p-1 hover:bg-white/20 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditTicket} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-amber-50/60 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900/50 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-amber-700 dark:text-amber-300">
                    SKU: {editModalTicket.sku}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-900/60 text-amber-800 dark:text-amber-200">
                    Tahap: {editModalTicket.tahap}
                  </span>
                </div>
                <div className="font-bold text-slate-800 dark:text-white">
                  {editModalTicket.nama_produk} {editModalTicket.size ? `(Size: ${editModalTicket.size})` : ''}
                </div>
              </div>

              {/* Edit Foto Kerusakan */}
              <div className="space-y-2 p-3 bg-slate-50 dark:bg-[#0f172a] rounded-xl border border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="font-bold text-slate-800 dark:text-white flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-amber-500" />
                      <span>Dokumentasi Foto Kerusakan / Bukti ({editPhotos.length}/4)</span>
                    </label>
                    <span className="text-[10px] text-slate-400">
                      Foto otomatis dikompresi WebP Canvas (hemat storage).
                    </span>
                  </div>

                  <label className="px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:border-amber-500 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 cursor-pointer transition-all">
                    <UploadCloud className="w-3 h-3 text-amber-500" />
                    <span>+ Tambah Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      disabled={editIsCompressing || editPhotos.length >= 4}
                      onChange={handleEditPhotoUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {editIsCompressing && (
                  <div className="p-2 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 rounded-lg text-[11px] font-bold flex items-center gap-2 animate-pulse">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Sedang memproses & mengompresi foto...</span>
                  </div>
                )}

                {editPhotos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {editPhotos.map((p, idx) => (
                      <div
                        key={idx}
                        className="relative group rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-black aspect-video flex items-center justify-center"
                      >
                        <img src={p.dataUrl} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1 p-1">
                          <button
                            type="button"
                            onClick={() => setEditPhotos((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1 bg-rose-600 hover:bg-rose-700 text-white rounded-md cursor-pointer"
                            title="Hapus Foto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-3 text-slate-400 text-[11px] border border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                    Belum ada foto kerusakan. Klik tombol "+ Tambah Foto" untuk mengunggah.
                  </div>
                )}
              </div>

              {/* Kategori & Lokasi Rak */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Kategori Kerusakan *
                  </label>
                  <select
                    value={editKategoriRusak}
                    onChange={(e) => setEditKategoriRusak(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-bold outline-none"
                  >
                    <option value="Noda / Kotor">🧺 Noda / Kotor</option>
                    <option value="Jahitan Rusak">🪡 Jahitan Rusak</option>
                    <option value="Kain Sobek / Bolong">⚠️ Kain Sobek / Bolong</option>
                    <option value="Kancing / Resleting">🔘 Kancing / Resleting</option>
                    <option value="Cacat Kain / Warna">🎨 Cacat Kain / Warna</option>
                    <option value="Aksesoris Kurang">🏷️ Aksesoris Kurang</option>
                    <option value="Lainnya">📝 Lainnya</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Lokasi Rak Fisik Saat Ini *
                  </label>
                  <input
                    type="text"
                    required
                    value={editLokasiSekarang}
                    onChange={(e) => setEditLokasiSekarang(e.target.value)}
                    placeholder="cth: CC-01, PMK-01, DF-01"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold uppercase outline-none"
                  />
                </div>
              </div>

              {/* Detail Keterangan Kerusakan */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700 dark:text-slate-300">
                  Detail / Keterangan Kerusakan
                </label>
                <textarea
                  rows={2}
                  value={editDetailKerusakan}
                  onChange={(e) => setEditDetailKerusakan(e.target.value)}
                  placeholder="Deskripsikan bagian yang rusak, noda, atau kendala pakaian..."
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>

              {/* Petugas & Catatan Reparasi */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Petugas / Vendor Pelaksana
                  </label>
                  <input
                    type="text"
                    value={editPetugasReparasi}
                    onChange={(e) => setEditPetugasReparasi(e.target.value)}
                    placeholder="Nama penjahit / vendor laundry"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Jumlah (Qty Pcs)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={editQty}
                    onChange={(e) => setEditQty(Number(e.target.value) || 1)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-bold outline-none"
                  />
                </div>
              </div>

              {/* Catatan Pengerjaan & Biaya */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Catatan Pengerjaan Reparasi
                  </label>
                  <input
                    type="text"
                    value={editReparasiCatatan}
                    onChange={(e) => setEditReparasiCatatan(e.target.value)}
                    placeholder="Progress / catatan teknis..."
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Biaya Reparasi (Rp)
                  </label>
                  <input
                    type="number"
                    min={0}
                    value={editBiayaReparasi}
                    onChange={(e) => setEditBiayaReparasi(Number(e.target.value) || 0)}
                    placeholder="Ongkos reparasi"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl font-bold outline-none"
                  />
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 -mx-5 -mb-5 flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setEditModalTicket(null)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-black shadow-md shadow-amber-500/25 cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Simpan Perubahan</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 10. Modal Lightbox Foto Kerusakan */}
      {lightboxImages && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in">
          <div className="relative max-w-3xl w-full max-h-[90vh] flex flex-col items-center justify-center">
            <button
              type="button"
              onClick={() => setLightboxImages(null)}
              className="absolute -top-10 right-0 text-white hover:text-rose-400 p-2 text-sm font-bold flex items-center gap-1"
            >
              <X className="w-5 h-5" />
              <span>Tutup</span>
            </button>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full overflow-y-auto max-h-[80vh] p-2">
              {lightboxImages.map((src, i) => (
                <div key={i} className="rounded-xl overflow-hidden border border-white/20 bg-black">
                  <img src={src} alt="Foto Kerusakan" className="w-full h-auto object-contain" />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 11. Modal Cetak Barcode Label Tag Pakaian */}
      {printModalTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white text-black max-w-sm w-full rounded-2xl p-6 space-y-4 shadow-2xl border">
            <div className="flex items-center justify-between border-b pb-2">
              <span className="font-extrabold text-xs tracking-wider uppercase text-slate-600">
                LABEL TIKET PERBAIKAN WMS
              </span>
              <button
                type="button"
                onClick={() => setPrintModalTicket(null)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-center space-y-1 p-3 border-2 border-dashed border-slate-300 rounded-xl">
              <div className="text-lg font-black font-mono tracking-wider">
                {printModalTicket.ticket_no}
              </div>
              <div className="text-xs font-bold text-slate-800">{printModalTicket.sku}</div>
              <div className="text-[11px] text-slate-600 truncate">
                {printModalTicket.nama_produk}
              </div>
              <div className="text-xs font-black text-rose-600 uppercase pt-1">
                [{printModalTicket.tahap}] • {printModalTicket.kategori_rusak}
              </div>
              <div className="text-[10px] text-slate-500 pt-1">
                Lokasi Rak: <b>{printModalTicket.lokasi_sekarang}</b> • Tgl: {printModalTicket.tanggal}
              </div>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 py-2 bg-slate-900 text-white rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Thermal</span>
              </button>
              <button
                type="button"
                onClick={() => setPrintModalTicket(null)}
                className="px-4 py-2 border rounded-xl text-xs font-bold text-slate-600"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
