import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  RefreshCcw,
  Plus,
  Trash2,
  Send,
  Search,
  Printer,
  FileText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Edit,
  XCircle,
  Settings,
  Mail,
  Upload,
  ExternalLink,
  Copy,
  Check,
  Package,
  Truck,
  ArrowRightLeft,
  ChevronDown,
  MessageSquare,
  Eye,
  X,
  CheckSquare,
  Square,
  Sparkles,
  ShieldCheck,
  Banknote,
  Image as ImageIcon,
} from 'lucide-react';
import QRCode from 'qrcode';
import { UserSession, ProductItem } from '../../types';
import { isSuperadmin } from '../../services/permissions';
import { compressImage } from '../../utils/imageCompressor';
import { uploadImageToGdrive } from '../../services/gdriveUpload';
import { getFonnteConfig, sendFonnteMessage } from '../../services/whatsapp';
import {
  fetchOutlets,
  OutletItem,
  DEFAULT_OUTLETS,
} from '../../services/gasManualShipment';
import {
  fetchStockForSkus,
  StockRealtimeItem,
  searchActiveProductsLive,
} from '../../services/supabase';
import { lookupProductBySku } from '../../utils/productLookup';
import {
  ReturBarangOrder,
  ReturOriginalItem,
  ReturReplacementItem,
  PusatResolusiSettings,
  fetchReturOrders,
  submitReturOrder,
  updateReturOrder,
  deleteReturOrder,
  generateReturOrderId,
  computeReturEffectiveStatus,
  fetchPusatResolusiSettings,
  savePusatResolusiSettings,
  sendReturNotificationEmail,
  DEFAULT_OUTLET_ORDER_OPTIONS,
  DEFAULT_SHIPPING_OPTIONS,
} from '../../services/returBarangService';

interface ReturBarangTabProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  onNotify: (message: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

/**
 * Komponen Dropsearch Reusable (searchable select + bisa input custom)
 */
const DropsearchSelect: React.FC<{
  label: string;
  required?: boolean;
  value: string;
  onChange: (val: string) => void;
  options: string[];
  placeholder?: string;
  badgeColor?: string;
}> = ({ label, required, value, onChange, options, placeholder = 'Cari atau pilih...', badgeColor }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter(opt => opt.toLowerCase().includes(q));
  }, [options, query]);

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
        {label} {required && <span className="text-rose-500">*</span>}
      </label>
      <div
        onClick={() => setIsOpen(prev => !prev)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white cursor-pointer hover:border-rose-400 focus-within:ring-2 focus-within:ring-rose-500/30 transition-all"
      >
        <span className={value ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-400 dark:text-slate-500 font-normal'}>
          {value || placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>

      {isOpen && (
        <div className="absolute z-40 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in duration-150">
          <div className="p-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Ketik untuk mencari atau isi manual..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                autoFocus
              />
            </div>
          </div>
          <div className="max-h-52 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
            {filtered.map((opt, idx) => {
              const selected = opt.toLowerCase() === (value || '').toLowerCase();
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setIsOpen(false);
                    setQuery('');
                  }}
                  className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer ${
                    selected ? 'bg-rose-50/80 dark:bg-rose-950/60 font-bold text-rose-700 dark:text-rose-300' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span>{opt}</span>
                  {selected && <Check className="w-3.5 h-3.5 text-rose-600" />}
                </button>
              );
            })}
            {query.trim() && !options.some(o => o.toLowerCase() === query.trim().toLowerCase()) && (
              <button
                type="button"
                onClick={() => {
                  onChange(query.trim());
                  setIsOpen(false);
                  setQuery('');
                }}
                className="w-full text-left px-3 py-2 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/40 hover:bg-indigo-100/70 flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Gunakan &quot;{query.trim()}&quot;</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default function ReturBarangTab({
  session,
  productCatalog = [],
  onNotify,
}: ReturBarangTabProps) {
  const userIsAdmin = useMemo(() => isSuperadmin(session), [session]);
  const actorName = useMemo(
    () => session?.name || session?.username || 'Tim CS',
    [session]
  );

  // Sub-tab: 'form' | 'rekap'
  const [subTab, setSubTab] = useState<'form' | 'rekap'>('rekap');
  // 3 Tahap Utama Rekap Retur: 'baru' | 'diproses' | 'selesai' | 'semua'
  const [stageTab, setStageTab] = useState<'baru' | 'diproses' | 'selesai' | 'semua'>('baru');

  const [orders, setOrders] = useState<ReturBarangOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState<OutletItem[]>(DEFAULT_OUTLETS);
  const [settings, setSettings] = useState<PusatResolusiSettings | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // State Pengaturan Modal
  const [emailInputText, setEmailInputText] = useState('');
  const [ccEmailInputText, setCcEmailInputText] = useState('');
  const [fromNameInput, setFromNameInput] = useState('Chocochips - Pusat Resolusi');
  const [autoEmailSubmit, setAutoEmailSubmit] = useState(true);
  const [autoEmailComplete, setAutoEmailComplete] = useState(true);
  const [waGroupPickingInput, setWaGroupPickingInput] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  // State Form Input / Edit Retur
  const [editingOrder, setEditingOrder] = useState<ReturBarangOrder | null>(null);
  const [noRetur, setNoRetur] = useState(() => generateReturOrderId('SHO'));
  const [noPesananAsal, setNoPesananAsal] = useState('');
  const [outletOrder, setOutletOrder] = useState('');
  const [kategoriAlasan, setKategoriAlasan] = useState<'tukar_size_model' | 'defect_reject' | 'salah_kirim' | 'lainnya'>('tukar_size_model');
  const [alasanRetur, setAlasanRetur] = useState('');
  const [opsiPengiriman, setOpsiPengiriman] = useState('');
  const [namaCustomer, setNamaCustomer] = useState('');
  const [noHp, setNoHp] = useState('');
  const [alamatLengkap, setAlamatLengkap] = useState('');

  // Produk Pesanan (Diretur) & Produk Pengganti
  const [produkPesanan, setProdukPesanan] = useState<ReturOriginalItem[]>([
    { id: `orig-${Date.now()}`, sku: '', nama_produk: '', size: '', qty: 1 },
  ]);
  const [produkPengganti, setProdukPengganti] = useState<ReturReplacementItem[]>([
    { id: `rep-${Date.now() + 1}`, sku: '', nama_produk: '', size: '', qty: 1, fulfillment: 'Marketplace' },
  ]);

  // Pencarian Katalog Cepat
  const [searchOrigQuery, setSearchOrigQuery] = useState('');
  const [searchOrigResults, setSearchOrigResults] = useState<ProductItem[]>([]);
  const [searchRepQuery, setSearchRepQuery] = useState('');
  const [searchRepResults, setSearchRepResults] = useState<ProductItem[]>([]);

  // Biaya & Lampiran (Opsional di awal)
  const [penanggungBiaya, setPenanggungBiaya] = useState<'customer' | 'toko_free'>('customer');
  const [selisihHarga, setSelisihHarga] = useState<string>('');
  const [ongkirDibayar, setOngkirDibayar] = useState<string>('');
  const [buktiPembayaranUrls, setBuktiPembayaranUrls] = useState<string[]>([]);
  const [fotoKomplainUrls, setFotoKomplainUrls] = useState<string[]>([]);
  const [uploadingBukti, setUploadingBukti] = useState(false);
  const [uploadingKomplain, setUploadingKomplain] = useState(false);

  // Pelacakan Barang Retur Customer
  const [noResiCustomer, setNoResiCustomer] = useState('');
  const [statusBarangRetur, setStatusBarangRetur] = useState<'belum_dikirim' | 'dikirim_customer' | 'diterima_gudang_qc'>('belum_dikirim');

  // Filter & Search di Rekap
  const [searchTerm, setSearchTerm] = useState('');
  const [filterOutlet, setFilterOutlet] = useState('all');
  const [filterPrintStatus, setFilterPrintStatus] = useState<'all' | 'unprinted_label' | 'unprinted_picking' | 'printed_all'>('all');
  const [filterDealposDoc, setFilterDealposDoc] = useState<'all' | 'need_sj_retur' | 'need_invoice_return' | 'complete_doc'>('all');
  const [selectedReturIds, setSelectedReturIds] = useState<Set<string>>(new Set());

  // Modals Aksi Cepat Admin di Rekap
  const [detailModalOrder, setDetailModalOrder] = useState<ReturBarangOrder | null>(null);
  const [sjReturModal, setSjReturModal] = useState<{ order: ReturBarangOrder; value: string } | null>(null);
  const [invoiceReturnModal, setInvoiceReturnModal] = useState<{ order: ReturBarangOrder; value: string } | null>(null);
  const [resiPengirimanModal, setResiPengirimanModal] = useState<{ order: ReturBarangOrder; resi: string; invoiceReturn: string } | null>(null);
  const [paymentModal, setPaymentModal] = useState<{
    order: ReturBarangOrder;
    penanggung: 'customer' | 'toko_free';
    selisih: string;
    ongkir: string;
    urls: string[];
  } | null>(null);
  const [cancelModal, setCancelModal] = useState<{ order: ReturBarangOrder; reason: string } | null>(null);

  // Print State (Label A6 & Picking List)
  const [printPayload, setPrintPayload] = useState<{
    mode: 'LABEL' | 'PICKING_LIST';
    orders: ReturBarangOrder[];
    qrMap: Record<string, string>;
    timestamp: number;
  } | null>(null);

  // Trigger window.print() otomatis saat printPayload disetel
  useEffect(() => {
    if (!printPayload) return;
    const timer = setTimeout(() => {
      try {
        window.print();
      } catch (e) {
        console.warn('Auto print error:', e);
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [printPayload?.timestamp]);

  // Load initial data
  const loadAllData = async () => {
    setLoading(true);
    try {
      const [returData, outletData, cfg] = await Promise.all([
        fetchReturOrders(),
        fetchOutlets(),
        fetchPusatResolusiSettings(),
      ]);
      setOrders(returData);
      if (outletData && outletData.length > 0) setOutlets(outletData);
      setSettings(cfg);
      setEmailInputText((cfg.recipient_emails || []).join(', '));
      setCcEmailInputText((cfg.cc_emails || []).join(', '));
      setFromNameInput(cfg.from_name || 'Chocochips - Pusat Resolusi');
      setAutoEmailSubmit(cfg.auto_email_on_submit ?? true);
      setAutoEmailComplete(cfg.auto_email_on_complete ?? true);
      setWaGroupPickingInput(cfg.wa_group_picking || '');
    } catch (e) {
      console.warn('Load Retur Barang error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAllData();
  }, []);

  // Pilihan Outlet Order (Marketplace + Store Outlets)
  const outletOrderOptions = useMemo(() => {
    const base = settings?.outlet_options || DEFAULT_OUTLET_ORDER_OPTIONS;
    const storeNames = outlets.map(o => o.nama).filter(Boolean);
    return Array.from(new Set([...base, ...storeNames]));
  }, [settings, outlets]);

  const shippingOptions = useMemo(() => {
    return settings?.shipping_options || DEFAULT_SHIPPING_OPTIONS;
  }, [settings]);

  const fulfillmentOptions = useMemo(() => {
    const storeNames = outlets.map(o => o.nama).filter(Boolean);
    return ['Marketplace', ...storeNames];
  }, [outlets]);

  // Pencarian Katalog Produk untuk Produk Pesanan (Diretur)
  useEffect(() => {
    const q = searchOrigQuery.trim().toLowerCase();
    if (!q || q.length < 2) {
      setSearchOrigResults([]);
      return;
    }
    const localMatches = (productCatalog || [])
      .filter(p => {
        const sku = (p.k || (p as any).sku || '').toLowerCase();
        const name = (p.p || (p as any).nama_produk || p.n || '').toLowerCase();
        return sku.includes(q) || name.includes(q);
      })
      .slice(0, 12);
    setSearchOrigResults(localMatches);

    if (localMatches.length < 5) {
      const t = setTimeout(() => {
        searchActiveProductsLive(q).then(live => {
          if (live && live.length > 0) {
            setSearchOrigResults(prev => {
              const map = new Map<string, ProductItem>();
              [...prev, ...live].forEach(it => map.set(it.k || (it as any).sku, it));
              return Array.from(map.values()).slice(0, 15);
            });
          }
        }).catch(() => {});
      }, 280);
      return () => clearTimeout(t);
    }
  }, [searchOrigQuery, productCatalog]);

  // Pencarian Katalog Produk untuk Produk Pengganti
  useEffect(() => {
    const q = searchRepQuery.trim().toLowerCase();
    if (!q || q.length < 2) {
      setSearchRepResults([]);
      return;
    }
    const localMatches = (productCatalog || [])
      .filter(p => {
        const sku = (p.k || (p as any).sku || '').toLowerCase();
        const name = (p.p || (p as any).nama_produk || p.n || '').toLowerCase();
        return sku.includes(q) || name.includes(q);
      })
      .slice(0, 12);
    setSearchRepResults(localMatches);

    if (localMatches.length < 5) {
      const t = setTimeout(() => {
        searchActiveProductsLive(q).then(live => {
          if (live && live.length > 0) {
            setSearchRepResults(prev => {
              const map = new Map<string, ProductItem>();
              [...prev, ...live].forEach(it => map.set(it.k || (it as any).sku, it));
              return Array.from(map.values()).slice(0, 15);
            });
          }
        }).catch(() => {});
      }, 280);
      return () => clearTimeout(t);
    }
  }, [searchRepQuery, productCatalog]);

  const handleSelectProductForOrig = (prod: ProductItem) => {
    const sku = prod.k || (prod as any).sku || '';
    const baseName = prod.p || (prod as any).nama_produk || prod.n || '';
    const size = prod.s && prod.s !== 'ALL' && prod.s !== 'Default' ? prod.s : '-';
    const fullName = size && size !== '-' && !baseName.endsWith(`- ${size}`) ? `${baseName} - ${size}` : baseName;

    setProdukPesanan(prev => {
      // Jika baris pertama masih kosong, isi baris pertama
      if (prev.length === 1 && !prev[0].sku && !prev[0].nama_produk) {
        return [{ id: prev[0].id, sku, nama_produk: fullName, size, qty: 1 }];
      }
      const existing = prev.find(i => i.sku.toUpperCase() === sku.toUpperCase());
      if (existing) {
        return prev.map(i => (i.id === existing.id ? { ...i, qty: (Number(i.qty) || 1) + 1 } : i));
      }
      return [...prev, { id: `orig-${Date.now()}`, sku, nama_produk: fullName, size, qty: 1 }];
    });
    setSearchOrigQuery('');
    setSearchOrigResults([]);
  };

  const handleSelectProductForRep = (prod: ProductItem) => {
    const sku = prod.k || (prod as any).sku || '';
    const baseName = prod.p || (prod as any).nama_produk || prod.n || '';
    const size = prod.s && prod.s !== 'ALL' && prod.s !== 'Default' ? prod.s : '-';
    const fullName = size && size !== '-' && !baseName.endsWith(`- ${size}`) ? `${baseName} - ${size}` : baseName;

    setProdukPengganti(prev => {
      if (prev.length === 1 && !prev[0].sku && !prev[0].nama_produk) {
        return [{ id: prev[0].id, sku, nama_produk: fullName, size, qty: 1, fulfillment: prev[0].fulfillment || 'Marketplace' }];
      }
      const existing = prev.find(i => i.sku.toUpperCase() === sku.toUpperCase());
      if (existing) {
        return prev.map(i => (i.id === existing.id ? { ...i, qty: (Number(i.qty) || 1) + 1 } : i));
      }
      return [...prev, { id: `rep-${Date.now()}`, sku, nama_produk: fullName, size, qty: 1, fulfillment: 'Marketplace' }];
    });
    setSearchRepQuery('');
    setSearchRepResults([]);
  };

  const handleCopyOrigToReplacement = () => {
    const validOrig = produkPesanan.filter(it => it.nama_produk.trim() || it.sku.trim());
    if (validOrig.length === 0) {
      onNotify('Isi Produk Pesanan terlebih dahulu sebelum menyalin ke Produk Pengganti', 'warning');
      return;
    }
    setProdukPengganti(
      validOrig.map((it, idx) => ({
        id: `rep-${Date.now()}-${idx}`,
        sku: it.sku,
        nama_produk: it.nama_produk,
        size: it.size,
        qty: it.qty,
        fulfillment: 'Marketplace',
      }))
    );
    onNotify('Produk Pesanan disalin ke Produk Pengganti. Silakan sesuaikan Size/SKU & Opsi Fulfillment!', 'info');
  };

  const handleUploadFiles = async (
    files: FileList | null,
    target: 'bukti_bayar' | 'foto_komplain'
  ) => {
    if (!files || files.length === 0) return;
    if (target === 'bukti_bayar') setUploadingBukti(true);
    else setUploadingKomplain(true);

    try {
      const uploadedUrls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const prefix = target === 'bukti_bayar' ? 'BuktiBayarRetur' : 'KomplainRetur';
        const base64 = await compressImage(file);
        const res = await uploadImageToGdrive(base64, `${prefix}_${noPesananAsal || noRetur}_${Date.now()}_${i + 1}.jpg`);
        if (res.success && res.url) {
          uploadedUrls.push(res.url);
        } else {
          onNotify(res.error || 'Gagal mengunggah gambar ke Google Drive', 'error');
        }
      }
      if (uploadedUrls.length > 0) {
        if (target === 'bukti_bayar') {
          setBuktiPembayaranUrls(prev => [...prev, ...uploadedUrls]);
          if (paymentModal) {
            setPaymentModal(prev => (prev ? { ...prev, urls: [...prev.urls, ...uploadedUrls] } : null));
          }
        } else {
          setFotoKomplainUrls(prev => [...prev, ...uploadedUrls]);
        }
        onNotify(`${uploadedUrls.length} lampiran berhasil diunggah ke Google Drive!`, 'success');
      }
    } catch (e: any) {
      onNotify(e?.message || 'Gagal mengunggah file', 'error');
    } finally {
      if (target === 'bukti_bayar') setUploadingBukti(false);
      else setUploadingKomplain(false);
    }
  };

  const resetForm = () => {
    setEditingOrder(null);
    setNoRetur(generateReturOrderId(outletOrder || 'SHO'));
    setNoPesananAsal('');
    setOutletOrder('');
    setKategoriAlasan('tukar_size_model');
    setAlasanRetur('');
    setOpsiPengiriman('');
    setNamaCustomer('');
    setNoHp('');
    setAlamatLengkap('');
    setProdukPesanan([{ id: `orig-${Date.now()}`, sku: '', nama_produk: '', size: '', qty: 1 }]);
    setProdukPengganti([{ id: `rep-${Date.now() + 1}`, sku: '', nama_produk: '', size: '', qty: 1, fulfillment: 'Marketplace' }]);
    setPenanggungBiaya('customer');
    setSelisihHarga('');
    setOngkirDibayar('');
    setBuktiPembayaranUrls([]);
    setFotoKomplainUrls([]);
    setNoResiCustomer('');
    setStatusBarangRetur('belum_dikirim');
  };

  const handleEditOrder = (order: ReturBarangOrder) => {
    setEditingOrder(order);
    setNoRetur(order.no_retur);
    setNoPesananAsal(order.no_pesanan_asal);
    setOutletOrder(order.outlet_order);
    setKategoriAlasan(order.kategori_alasan || 'tukar_size_model');
    setAlasanRetur(order.alasan_retur);
    setOpsiPengiriman(order.opsi_pengiriman);
    setNamaCustomer(order.nama_customer);
    setNoHp(order.no_hp);
    setAlamatLengkap(order.alamat_lengkap);
    setProdukPesanan(
      order.produk_pesanan && order.produk_pesanan.length > 0
        ? order.produk_pesanan
        : [{ id: `orig-${Date.now()}`, sku: '', nama_produk: '', size: '', qty: 1 }]
    );
    setProdukPengganti(
      order.produk_pengganti && order.produk_pengganti.length > 0
        ? order.produk_pengganti
        : [{ id: `rep-${Date.now() + 1}`, sku: '', nama_produk: '', size: '', qty: 1, fulfillment: 'Marketplace' }]
    );
    setPenanggungBiaya(order.penanggung_biaya || 'customer');
    setSelisihHarga(order.selisih_harga !== null && order.selisih_harga !== undefined ? String(order.selisih_harga) : '');
    setOngkirDibayar(order.ongkir_dibayar !== null && order.ongkir_dibayar !== undefined ? String(order.ongkir_dibayar) : '');
    setBuktiPembayaranUrls(order.bukti_pembayaran_urls || []);
    setFotoKomplainUrls(order.foto_komplain_urls || []);
    setNoResiCustomer(order.no_resi_customer || '');
    setStatusBarangRetur(order.status_barang_retur || 'belum_dikirim');
    setSubTab('form');
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!noPesananAsal.trim()) {
      onNotify('No. Pesanan wajib diisi!', 'error');
      return;
    }
    if (!outletOrder.trim()) {
      onNotify('Outlet Order wajib dipilih!', 'error');
      return;
    }
    if (!alasanRetur.trim()) {
      onNotify('Alasan / Deskripsi Retur wajib diisi!', 'error');
      return;
    }
    if (!opsiPengiriman.trim()) {
      onNotify('Opsi Pengiriman wajib dipilih!', 'error');
      return;
    }
    if (!namaCustomer.trim() || !noHp.trim() || !alamatLengkap.trim()) {
      onNotify('Nama Customer, No. HP, dan Alamat Lengkap wajib diisi!', 'error');
      return;
    }

    const validOrig = produkPesanan.filter(it => it.nama_produk.trim() || it.sku.trim());
    if (validOrig.length === 0) {
      onNotify('Minimal 1 Produk Pesanan (barang yang diretur) wajib diisi!', 'error');
      return;
    }

    const validRep = produkPengganti.filter(it => it.nama_produk.trim() || it.sku.trim());
    if (validRep.length === 0) {
      onNotify('Minimal 1 Produk Pengganti wajib diisi!', 'error');
      return;
    }

    const missingFulfillment = validRep.some(it => !it.fulfillment || !it.fulfillment.trim());
    if (missingFulfillment) {
      onNotify('Opsi Fulfillment pada setiap Produk Pengganti wajib dipilih!', 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    const newLog = {
      id: `log-${Date.now()}`,
      timestamp: nowIso,
      actor: actorName,
      action: editingOrder ? 'UPDATE_RETUR' : 'SUBMIT_RETUR',
      details: editingOrder
        ? `Data retur diperbarui oleh ${actorName}`
        : `Tiket retur baru dibuat oleh ${actorName} untuk pesanan #${noPesananAsal.trim()}`,
    };

    const payload: ReturBarangOrder = {
      id: editingOrder?.id,
      no_retur: editingOrder ? editingOrder.no_retur : generateReturOrderId(outletOrder),
      no_pesanan_asal: noPesananAsal.trim(),
      outlet_order: outletOrder.trim(),
      kategori_alasan: kategoriAlasan,
      alasan_retur: alasanRetur.trim(),
      opsi_pengiriman: opsiPengiriman.trim(),
      nama_customer: namaCustomer.trim(),
      no_hp: noHp.trim(),
      alamat_lengkap: alamatLengkap.trim(),
      produk_pesanan: validOrig.map(it => ({
        ...it,
        qty: Math.max(1, Number(it.qty) || 1),
      })),
      produk_pengganti: validRep.map(it => ({
        ...it,
        qty: Math.max(1, Number(it.qty) || 1),
      })),
      penanggung_biaya: penanggungBiaya,
      selisih_harga: selisihHarga.trim() !== '' ? Number(selisihHarga.replace(/[^0-9.-]/g, '')) : null,
      ongkir_dibayar: ongkirDibayar.trim() !== '' ? Number(ongkirDibayar.replace(/[^0-9.-]/g, '')) : null,
      bukti_pembayaran_urls: buktiPembayaranUrls,
      foto_komplain_urls: fotoKomplainUrls,
      no_resi_customer: noResiCustomer.trim(),
      status_barang_retur: statusBarangRetur,
      tgl_terima_gudang: editingOrder?.tgl_terima_gudang || '',
      qc_penerima_gudang: editingOrder?.qc_penerima_gudang || '',
      no_sj_gudang_retur: editingOrder?.no_sj_gudang_retur || '',
      sj_gudang_updated_by: editingOrder?.sj_gudang_updated_by || '',
      sj_gudang_updated_at: editingOrder?.sj_gudang_updated_at || '',
      no_invoice_return: editingOrder?.no_invoice_return || '',
      invoice_return_updated_by: editingOrder?.invoice_return_updated_by || '',
      invoice_return_updated_at: editingOrder?.invoice_return_updated_at || '',
      no_resi: editingOrder?.no_resi || '',
      tanggal_kirim_resi: editingOrder?.tanggal_kirim_resi || '',
      is_label_printed: editingOrder?.is_label_printed || false,
      tgl_cetak_label: editingOrder?.tgl_cetak_label || '',
      is_picking_printed: editingOrder?.is_picking_printed || false,
      tgl_cetak_picking: editingOrder?.tgl_cetak_picking || '',
      is_wa_picking_sent: editingOrder?.is_wa_picking_sent || false,
      tgl_wa_picking: editingOrder?.tgl_wa_picking || '',
      status: editingOrder ? computeReturEffectiveStatus(editingOrder) : 'diterima',
      submitted_by: editingOrder ? editingOrder.submitted_by : actorName,
      history_logs: [...(editingOrder?.history_logs || []), newLog],
      created_at: editingOrder ? editingOrder.created_at : nowIso,
      updated_at: nowIso,
    };

    setLoading(true);
    try {
      const res = editingOrder
        ? await updateReturOrder(payload)
        : await submitReturOrder(payload);

      if (res.success) {
        onNotify(
          editingOrder
            ? `Data Retur #${payload.no_pesanan_asal} berhasil diperbarui!`
            : `Retur Barang #${payload.no_pesanan_asal} berhasil disubmit ke Rekap Retur!`,
          'success'
        );

        if (!editingOrder) {
          sendReturNotificationEmail(payload, 'submit').then(emailRes => {
            if (emailRes.sent) {
              onNotify(`✉️ Email notifikasi retur terkirim ke tim (${emailRes.message})`, 'success');
            }
          });
        }

        resetForm();
        await loadAllData();
        setSubTab('rekap');
        if (!editingOrder) setStageTab('baru');
      } else {
        onNotify(res.message || 'Gagal menyimpan data retur', 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Klasifikasi 3 Tahap Utama Rekap Retur
  const isReturPesananBaru = (o: ReturBarangOrder): boolean => {
    if (o.status === 'batal' || o.status === 'DELETED') return false;
    const eff = computeReturEffectiveStatus(o);
    return eff === 'diterima';
  };

  const isReturDiproses = (o: ReturBarangOrder): boolean => {
    if (o.status === 'batal' || o.status === 'DELETED') return false;
    const eff = computeReturEffectiveStatus(o);
    return eff === 'diproses';
  };

  const isReturSelesai = (o: ReturBarangOrder): boolean => {
    if (o.status === 'batal' || o.status === 'DELETED') return false;
    const eff = computeReturEffectiveStatus(o);
    return eff === 'dikirim';
  };

  const stageCounts = useMemo(() => {
    const active = orders.filter(o => o.status !== 'DELETED');
    return {
      baru: active.filter(isReturPesananBaru).length,
      diproses: active.filter(isReturDiproses).length,
      selesai: active.filter(isReturSelesai).length,
      semua: active.length,
    };
  }, [orders]);

  const stageScopedOrders = useMemo(() => {
    const active = orders.filter(o => o.status !== 'DELETED');
    if (stageTab === 'baru') return active.filter(isReturPesananBaru);
    if (stageTab === 'diproses') return active.filter(isReturDiproses);
    if (stageTab === 'selesai') return active.filter(isReturSelesai);
    return active;
  }, [orders, stageTab]);

  const filteredOrders = useMemo(() => {
    let list = [...stageScopedOrders];

    if (filterOutlet !== 'all') {
      list = list.filter(o => (o.outlet_order || '').toLowerCase() === filterOutlet.toLowerCase());
    }

    if (filterPrintStatus === 'unprinted_label') {
      list = list.filter(o => o.status !== 'batal' && !o.is_label_printed);
    } else if (filterPrintStatus === 'unprinted_picking') {
      list = list.filter(o => o.status !== 'batal' && !o.is_picking_printed);
    } else if (filterPrintStatus === 'printed_all') {
      list = list.filter(o => o.is_label_printed && o.is_picking_printed);
    }

    if (filterDealposDoc === 'need_sj_retur') {
      list = list.filter(o => !o.no_sj_gudang_retur || !o.no_sj_gudang_retur.trim());
    } else if (filterDealposDoc === 'need_invoice_return') {
      list = list.filter(o => !o.no_invoice_return || !o.no_invoice_return.trim());
    } else if (filterDealposDoc === 'complete_doc') {
      list = list.filter(o => Boolean(o.no_sj_gudang_retur?.trim() && o.no_invoice_return?.trim()));
    }

    if (searchTerm.trim()) {
      const q = searchTerm.trim().toLowerCase();
      list = list.filter(
        o =>
          o.no_retur?.toLowerCase().includes(q) ||
          o.no_pesanan_asal?.toLowerCase().includes(q) ||
          o.outlet_order?.toLowerCase().includes(q) ||
          o.nama_customer?.toLowerCase().includes(q) ||
          o.no_hp?.toLowerCase().includes(q) ||
          o.no_resi?.toLowerCase().includes(q) ||
          o.no_sj_gudang_retur?.toLowerCase().includes(q) ||
          o.no_invoice_return?.toLowerCase().includes(q) ||
          (o.produk_pesanan || []).some(it => it.sku?.toLowerCase().includes(q) || it.nama_produk?.toLowerCase().includes(q)) ||
          (o.produk_pengganti || []).some(it => it.sku?.toLowerCase().includes(q) || it.nama_produk?.toLowerCase().includes(q))
      );
    }

    return list;
  }, [stageScopedOrders, filterOutlet, filterPrintStatus, filterDealposDoc, searchTerm]);

  // Enrich lokasi rak gudang untuk Produk Pengganti saat Cetak Picking List / WA Grup
  const enrichReplacementItemsWithLocations = async (
    targetOrders: ReturBarangOrder[]
  ): Promise<ReturBarangOrder[]> => {
    const allSkus: string[] = [];
    targetOrders.forEach(o => {
      (o.produk_pengganti || []).forEach(it => {
        if (it.sku && it.sku.trim()) {
          allSkus.push(it.sku.trim().toUpperCase());
        }
      });
    });

    if (allSkus.length === 0) return targetOrders;

    try {
      const stockItems = await fetchStockForSkus(Array.from(new Set(allSkus)));
      const skuLocMap = new Map<string, string>();
      const grouped = new Map<string, StockRealtimeItem[]>();

      stockItems.forEach(stk => {
        const s = (stk.sku || '').trim().toUpperCase();
        if (!s) return;
        if (!grouped.has(s)) grouped.set(s, []);
        grouped.get(s)!.push(stk);
      });

      grouped.forEach((stocks, sku) => {
        const valid = stocks.filter(x => x.lokasi && x.lokasi !== '-' && x.lokasi !== 'KOSONG' && (x.sisa_stok ?? 0) > 0);
        if (valid.length > 0) {
          valid.sort((a, b) => (b.sisa_stok ?? 0) - (a.sisa_stok ?? 0));
          skuLocMap.set(sku, Array.from(new Set(valid.map(v => v.lokasi))).join(', '));
        }
      });

      allSkus.forEach(sku => {
        if (!skuLocMap.has(sku)) {
          const lookup = lookupProductBySku(sku, productCatalog || []);
          if (lookup.found && lookup.masterItem?.lokasi) {
            skuLocMap.set(sku, lookup.masterItem.lokasi);
          }
        }
      });

      return targetOrders.map(o => ({
        ...o,
        produk_pengganti: (o.produk_pengganti || []).map(it => {
          const ful = (it.fulfillment || '').trim();
          const isMkt = !ful || ful.toLowerCase().includes('marketplace') || ful.toLowerCase().includes('gudang');
          if (!isMkt) {
            return { ...it, lokasi: ful };
          }
          const cleanSku = (it.sku || '').trim().toUpperCase();
          return {
            ...it,
            lokasi: skuLocMap.get(cleanSku) || it.lokasi || '-',
          };
        }),
      }));
    } catch {
      return targetOrders;
    }
  };

  // Cetak Label A6 (Format Label A6 Manual Shipment, Produk Terlampir = Produk Pengganti)
  const handlePrintLabelA6 = async (target?: ReturBarangOrder | ReturBarangOrder[]) => {
    const list = Array.isArray(target)
      ? target
      : target
      ? [target]
      : filteredOrders.filter(o => selectedReturIds.has(o.no_retur));

    if (list.length === 0) {
      onNotify('Pilih setidaknya 1 pesanan retur untuk mencetak Label A6', 'warning');
      return;
    }

    setLoading(true);
    try {
      const qrMap: Record<string, string> = {};
      for (const ord of list) {
        try {
          qrMap[ord.no_retur] = await QRCode.toDataURL(ord.no_pesanan_asal || ord.no_retur, {
            width: 140,
            margin: 1,
          });
        } catch {}
      }

      const nowIso = new Date().toISOString();
      const updatedList: ReturBarangOrder[] = [];

      for (const ord of list) {
        const updated: ReturBarangOrder = {
          ...ord,
          is_label_printed: true,
          tgl_cetak_label: nowIso,
          status: ord.status === 'diterima' ? 'diproses' : ord.status,
          history_logs: [
            ...(ord.history_logs || []),
            {
              id: `log-${Date.now()}-${Math.random()}`,
              timestamp: nowIso,
              actor: actorName,
              action: 'PRINT_LABEL_A6',
              details: `Label A6 Retur dicetak oleh ${actorName}`,
            },
          ],
        };
        updated.status = computeReturEffectiveStatus(updated);
        updatedList.push(updated);
        updateReturOrder(updated).catch(() => {});
      }

      const updatedMap = new Map(updatedList.map(u => [u.no_retur, u]));
      setOrders(prev => prev.map(o => updatedMap.get(o.no_retur) || o));

      setPrintPayload({
        mode: 'LABEL',
        orders: updatedList,
        qrMap,
        timestamp: Date.now(),
      });
      onNotify(`Menyiapkan Cetak Label A6 untuk ${updatedList.length} paket retur (Status -> Diproses)`, 'success');
    } finally {
      setLoading(false);
    }
  };

  // Cetak Picking List (Format Picking List Manual Shipment, Produk = Produk Pengganti)
  const handlePrintPickingList = async (target?: ReturBarangOrder | ReturBarangOrder[]) => {
    const list = Array.isArray(target)
      ? target
      : target
      ? [target]
      : filteredOrders.filter(o => selectedReturIds.has(o.no_retur));

    if (list.length === 0) {
      onNotify('Pilih setidaknya 1 pesanan retur untuk mencetak Picking List', 'warning');
      return;
    }

    setLoading(true);
    try {
      const enriched = await enrichReplacementItemsWithLocations(list);
      const nowIso = new Date().toISOString();
      const updatedList: ReturBarangOrder[] = [];

      for (const ord of enriched) {
        const updated: ReturBarangOrder = {
          ...ord,
          is_picking_printed: true,
          tgl_cetak_picking: nowIso,
          status: ord.status === 'diterima' ? 'diproses' : ord.status,
          history_logs: [
            ...(ord.history_logs || []),
            {
              id: `log-${Date.now()}-${Math.random()}`,
              timestamp: nowIso,
              actor: actorName,
              action: 'PRINT_PICKING_LIST',
              details: `Picking List Produk Pengganti dicetak oleh ${actorName}`,
            },
          ],
        };
        updated.status = computeReturEffectiveStatus(updated);
        updatedList.push(updated);
        updateReturOrder(updated).catch(() => {});
      }

      const updatedMap = new Map(updatedList.map(u => [u.no_retur, u]));
      setOrders(prev => prev.map(o => updatedMap.get(o.no_retur) || o));

      setPrintPayload({
        mode: 'PICKING_LIST',
        orders: updatedList,
        qrMap: {},
        timestamp: Date.now(),
      });
      onNotify(`Menyiapkan Cetak Picking List untuk ${updatedList.length} pesanan retur (Status -> Diproses)`, 'success');
    } finally {
      setLoading(false);
    }
  };

  // Kirim Request Picking via WA Grup (Fonnte) khusus Produk Pengganti Fulfillment Marketplace
  const handleRequestPickingWaGroup = async (order: ReturBarangOrder) => {
    const fonnteCfg = getFonnteConfig();
    const targetGroup = (settings?.wa_group_picking || fonnteCfg.groupTarget || '').trim();

    if (!fonnteCfg.token || !targetGroup) {
      onNotify(
        'Token Fonnte atau ID Grup WA belum diatur di Pengaturan Pusat Resolusi / WhatsApp.',
        'warning'
      );
      return;
    }

    setLoading(true);
    try {
      const [enriched] = await enrichReplacementItemsWithLocations([order]);
      const mktItems = (enriched.produk_pengganti || []).filter(it => {
        const ful = (it.fulfillment || '').toLowerCase();
        return !ful || ful.includes('marketplace') || ful.includes('gudang');
      });

      if (mktItems.length === 0) {
        onNotify('Tidak ada Produk Pengganti dengan fulfillment Marketplace pada pesanan ini.', 'info');
        setLoading(false);
        return;
      }

      const itemsLines = mktItems
        .map(
          (it, idx) =>
            `${idx + 1}. *${it.sku || '-'}* — ${it.nama_produk}\n   • Size: *${it.size || '-'}* | Qty: *${it.qty} pcs*\n   • Lokasi Rak: *${it.lokasi || '-'}*`
        )
        .join('\n\n');

      const waMsg = `🔄 *REQUEST PICKING PRODUK PENGGANTI (RETUR BARANG)*
--------------------------------------------------
Halo Tim Gudang / Marketplace, mohon disiapkan produk pengganti untuk pesanan retur berikut:

📋 *Info Tiket Retur:*
• *No. Tiket Retur:* ${order.no_retur}
• *No. Pesanan Asal:* ${order.no_pesanan_asal}
• *Outlet Order:* ${order.outlet_order}
• *Opsi Pengiriman:* ${order.opsi_pengiriman}
• *Customer:* ${order.nama_customer}
• *Diminta Oleh:* ${actorName}

📦 *Daftar Produk Pengganti (Fulfillment Marketplace):*
${itemsLines}

📝 *Alasan Retur:* ${order.alasan_retur}

Terima kasih!
_Pusat Resolusi WMS Chocochips_`;

      const res = await sendFonnteMessage(targetGroup, waMsg, fonnteCfg.token);
      if (res.success) {
        const nowIso = new Date().toISOString();
        const updated: ReturBarangOrder = {
          ...enriched,
          is_wa_picking_sent: true,
          tgl_wa_picking: nowIso,
          status: enriched.status === 'diterima' ? 'diproses' : enriched.status,
          history_logs: [
            ...(enriched.history_logs || []),
            {
              id: `log-${Date.now()}`,
              timestamp: nowIso,
              actor: actorName,
              action: 'WA_PICKING_REQUEST',
              details: `Request Picking WA Grup dikirim oleh ${actorName}`,
            },
          ],
        };
        updated.status = computeReturEffectiveStatus(updated);
        await updateReturOrder(updated);
        setOrders(prev => prev.map(o => (o.no_retur === updated.no_retur ? updated : o)));
        onNotify('✅ Request Picking Produk Pengganti berhasil dikirim ke Grup WA!', 'success');
      } else {
        onNotify(`Gagal mengirim WA Grup: ${res.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Simpan SJ DealPOS to Gudang Retur (Admin)
  const handleSaveSjGudangRetur = async () => {
    if (!sjReturModal) return;
    const { order, value } = sjReturModal;
    const cleanVal = value.trim();
    const nowIso = new Date().toISOString();

    const updated: ReturBarangOrder = {
      ...order,
      no_sj_gudang_retur: cleanVal,
      sj_gudang_updated_by: actorName,
      sj_gudang_updated_at: nowIso,
      history_logs: [
        ...(order.history_logs || []),
        {
          id: `log-${Date.now()}`,
          timestamp: nowIso,
          actor: actorName,
          action: 'UPDATE_SJ_GUDANG_RETUR',
          details: `No. SJ DealPOS to Gudang Retur diisi: ${cleanVal || '(Dihapus)'}`,
        },
      ],
    };
    updated.status = computeReturEffectiveStatus(updated);

    setLoading(true);
    try {
      const res = await updateReturOrder(updated);
      if (res.success) {
        setOrders(prev => prev.map(o => (o.no_retur === updated.no_retur ? updated : o)));
        setSjReturModal(null);
        onNotify('No. SJ DealPOS (to Gudang Retur) berhasil disimpan!', 'success');
      } else {
        onNotify(res.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Simpan Invoice Return DealPOS (Admin)
  const handleSaveInvoiceReturn = async () => {
    if (!invoiceReturnModal) return;
    const { order, value } = invoiceReturnModal;
    const cleanVal = value.trim();
    const nowIso = new Date().toISOString();

    const updated: ReturBarangOrder = {
      ...order,
      no_invoice_return: cleanVal,
      invoice_return_updated_by: actorName,
      invoice_return_updated_at: nowIso,
      history_logs: [
        ...(order.history_logs || []),
        {
          id: `log-${Date.now()}`,
          timestamp: nowIso,
          actor: actorName,
          action: 'UPDATE_INVOICE_RETURN',
          details: `No. Invoice Return DealPOS diisi: ${cleanVal || '(Dihapus)'}`,
        },
      ],
    };
    updated.status = computeReturEffectiveStatus(updated);

    setLoading(true);
    try {
      const res = await updateReturOrder(updated);
      if (res.success) {
        setOrders(prev => prev.map(o => (o.no_retur === updated.no_retur ? updated : o)));
        setInvoiceReturnModal(null);
        onNotify('No. Invoice Return DealPOS berhasil disimpan!', 'success');
      } else {
        onNotify(res.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Simpan No. Resi Pengiriman -> Proses Retur Selesai ('dikirim')
  const handleSaveResiPengiriman = async () => {
    if (!resiPengirimanModal) return;
    const { order, resi, invoiceReturn } = resiPengirimanModal;
    const cleanResi = resi.trim();
    if (!cleanResi) {
      onNotify('Nomor Resi Pengiriman wajib diisi untuk menyelesaikan retur!', 'error');
      return;
    }

    const nowIso = new Date().toISOString();
    const cleanInv = invoiceReturn.trim() || order.no_invoice_return || '';

    const updated: ReturBarangOrder = {
      ...order,
      no_resi: cleanResi,
      tanggal_kirim_resi: nowIso,
      no_invoice_return: cleanInv,
      invoice_return_updated_by: cleanInv ? (order.invoice_return_updated_by || actorName) : order.invoice_return_updated_by,
      invoice_return_updated_at: cleanInv ? (order.invoice_return_updated_at || nowIso) : order.invoice_return_updated_at,
      status: 'dikirim',
      history_logs: [
        ...(order.history_logs || []),
        {
          id: `log-${Date.now()}`,
          timestamp: nowIso,
          actor: actorName,
          action: 'INPUT_RESI_SELESAI',
          details: `No. Resi Pengiriman diinput: ${cleanResi}${cleanInv ? ` (Invoice Return: ${cleanInv})` : ''} -> Retur Selesai`,
        },
      ],
    };

    setLoading(true);
    try {
      const res = await updateReturOrder(updated);
      if (res.success) {
        setOrders(prev => prev.map(o => (o.no_retur === updated.no_retur ? updated : o)));
        setResiPengirimanModal(null);
        onNotify(`✅ No. Resi ${cleanResi} tersimpan! Pesanan Retur kini berstatus Selesai.`, 'success');

        sendReturNotificationEmail(updated, 'complete').then(emailRes => {
          if (emailRes.sent) {
            onNotify('✉️ Email penyelesaian retur terkirim ke tim', 'info');
          }
        });
      } else {
        onNotify(res.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Simpan Update Pembayaran (Selisih Harga, Ongkir, Bukti Bayar)
  const handleSavePaymentModal = async () => {
    if (!paymentModal) return;
    const { order, penanggung, selisih, ongkir, urls } = paymentModal;
    const nowIso = new Date().toISOString();

    const updated: ReturBarangOrder = {
      ...order,
      penanggung_biaya: penanggung,
      selisih_harga: selisih.trim() !== '' ? Number(selisih.replace(/[^0-9.-]/g, '')) : null,
      ongkir_dibayar: ongkir.trim() !== '' ? Number(ongkir.replace(/[^0-9.-]/g, '')) : null,
      bukti_pembayaran_urls: urls,
      history_logs: [
        ...(order.history_logs || []),
        {
          id: `log-${Date.now()}`,
          timestamp: nowIso,
          actor: actorName,
          action: 'UPDATE_BIAYA_PEMBAYARAN',
          details: `Data selisih harga / ongkir / bukti bayar diperbarui oleh ${actorName}`,
        },
      ],
    };

    setLoading(true);
    try {
      const res = await updateReturOrder(updated);
      if (res.success) {
        setOrders(prev => prev.map(o => (o.no_retur === updated.no_retur ? updated : o)));
        setPaymentModal(null);
        onNotify('Data selisih harga, ongkir & bukti pembayaran berhasil diperbarui!', 'success');
      } else {
        onNotify(res.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Toggle Status Barang Retur Customer (QC Gudang)
  const handleCycleInboundStatus = async (order: ReturBarangOrder) => {
    const nextStatus: Record<ReturBarangOrder['status_barang_retur'], ReturBarangOrder['status_barang_retur']> = {
      belum_dikirim: 'dikirim_customer',
      dikirim_customer: 'diterima_gudang_qc',
      diterima_gudang_qc: 'belum_dikirim',
    };
    const next = nextStatus[order.status_barang_retur || 'belum_dikirim'];
    const nowIso = new Date().toISOString();
    const updated: ReturBarangOrder = {
      ...order,
      status_barang_retur: next,
      tgl_terima_gudang: next === 'diterima_gudang_qc' ? nowIso : order.tgl_terima_gudang,
      qc_penerima_gudang: next === 'diterima_gudang_qc' ? actorName : order.qc_penerima_gudang,
    };
    const res = await updateReturOrder(updated);
    if (res.success) {
      setOrders(prev => prev.map(o => (o.no_retur === updated.no_retur ? updated : o)));
      onNotify(
        next === 'diterima_gudang_qc'
          ? 'Barang retur customer ditandai: Sudah Diterima & Lolos QC Gudang'
          : next === 'dikirim_customer'
          ? 'Barang retur customer ditandai: Dalam Perjalanan ke Gudang'
          : 'Status barang retur direset ke: Belum Dikirim Customer',
        'info'
      );
    }
  };

  // Batalkan Pesanan Retur
  const handleConfirmCancel = async () => {
    if (!cancelModal) return;
    const { order, reason } = cancelModal;
    if (!reason.trim()) {
      onNotify('Alasan pembatalan wajib diisi!', 'error');
      return;
    }
    const nowIso = new Date().toISOString();
    const updated: ReturBarangOrder = {
      ...order,
      status: 'batal',
      alasan_batal: reason.trim(),
      dibatalkan_oleh: actorName,
      tgl_batal: nowIso,
      history_logs: [
        ...(order.history_logs || []),
        {
          id: `log-${Date.now()}`,
          timestamp: nowIso,
          actor: actorName,
          action: 'CANCEL_RETUR',
          details: `Pesanan retur dibatalkan oleh ${actorName}: ${reason.trim()}`,
        },
      ],
    };
    setLoading(true);
    try {
      const res = await updateReturOrder(updated);
      if (res.success) {
        setOrders(prev => prev.map(o => (o.no_retur === updated.no_retur ? updated : o)));
        setCancelModal(null);
        onNotify('Pesanan retur telah dibatalkan.', 'info');
      } else {
        onNotify(res.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Hapus Pesanan Retur
  const handleDeleteOrder = async (order: ReturBarangOrder) => {
    setLoading(true);
    try {
      const res = await deleteReturOrder(order);
      if (res.success) {
        setOrders(prev => prev.filter(o => o.no_retur !== order.no_retur));
        onNotify(`Tiket Retur ${order.no_retur} berhasil dihapus`, 'info');
      } else {
        onNotify(res.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // Simpan Pengaturan Pusat Resolusi
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    const recipients = emailInputText
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(s => s.includes('@'));
    const ccs = ccEmailInputText
      .split(/[,;\n]+/)
      .map(s => s.trim())
      .filter(s => s.includes('@'));

    const newSettings: PusatResolusiSettings = {
      ...(settings || {
        outlet_options: DEFAULT_OUTLET_ORDER_OPTIONS,
        shipping_options: DEFAULT_SHIPPING_OPTIONS,
      }),
      recipient_emails: recipients,
      cc_emails: ccs,
      from_name: fromNameInput.trim() || 'Chocochips - Pusat Resolusi',
      auto_email_on_submit: autoEmailSubmit,
      auto_email_on_complete: autoEmailComplete,
      wa_group_picking: waGroupPickingInput.trim(),
    };

    setSavingSettings(true);
    try {
      const res = await savePusatResolusiSettings(newSettings, actorName);
      setSettings(newSettings);
      setIsSettingsModalOpen(false);
      onNotify(res.message, 'success');
    } finally {
      setSavingSettings(false);
    }
  };

  const getBadgeForRetur = (order: ReturBarangOrder) => {
    if (order.status === 'batal') {
      return {
        label: 'Dibatalkan',
        cls: 'bg-red-100 text-red-800 dark:bg-red-950/70 dark:text-red-300 border-red-300 dark:border-red-800',
      };
    }
    const eff = computeReturEffectiveStatus(order);
    if (eff === 'dikirim') {
      return {
        label: 'Selesai (Dikirim)',
        cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800',
      };
    }
    if (eff === 'diproses') {
      return {
        label: 'Pesanan Diproses',
        cls: 'bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300 border-amber-300 dark:border-amber-800',
      };
    }
    return {
      label: 'Pesanan Baru',
      cls: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200 border-slate-300 dark:border-slate-700',
    };
  };

  return (
    <div className="space-y-4">
      {/* Top Action & Sub-Navigation Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-2xs">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setSubTab('rekap')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              subTab === 'rekap'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Rekap Retur Barang</span>
            <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-white/20 text-current font-extrabold">
              {stageCounts.semua}
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              if (subTab !== 'form') {
                setSubTab('form');
              }
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              subTab === 'form'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
            }`}
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{editingOrder ? 'Edit Data Retur' : 'Input Retur Baru (CS)'}</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsSettingsModalOpen(true)}
            className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            <Settings className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
            <span>Pengaturan Email & Resolusi</span>
          </button>

          <button
            type="button"
            onClick={loadAllData}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 cursor-pointer"
            title="Segarkan Data Retur"
          >
            <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin text-rose-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* =====================================================================
          SUB-TAB 1: FORM INPUT / EDIT RETUR BARANG (TIM CS / ADMIN)
         ===================================================================== */}
      {subTab === 'form' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs overflow-hidden">
          <div className="p-4 sm:p-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 mb-5">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200/60 dark:border-rose-800/60">
                  <ArrowRightLeft className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white">
                    {editingOrder ? `Edit Tiket Retur — ${editingOrder.no_retur}` : 'Form Registrasi Retur Barang (Pusat Resolusi)'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Tim CS menginput data retur customer beserta produk pengganti & opsi fulfillment
                  </p>
                </div>
              </div>
              {editingOrder && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
                >
                  Batal Edit
                </button>
              )}
            </div>

            <form onSubmit={handleSubmitForm} className="space-y-6">
              {/* Baris 1: No Pesanan, Outlet Order, Opsi Pengiriman */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50/70 dark:bg-slate-800/30 p-4 rounded-xl border border-slate-200/80 dark:border-slate-800">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    No. Pesanan (Order ID Asal) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={noPesananAsal}
                    onChange={e => setNoPesananAsal(e.target.value)}
                    placeholder="Cth: 261022ABCDEF / Order ID Shopee/Tiktok"
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                    required
                  />
                  <div className="mt-1 text-[10px] text-slate-400 font-mono">
                    ID Tiket Sistem: <strong className="text-rose-600 dark:text-rose-400">{noRetur}</strong>
                  </div>
                </div>

                <DropsearchSelect
                  label="Outlet Order (Channel / Marketplace)"
                  required
                  value={outletOrder}
                  onChange={val => {
                    setOutletOrder(val);
                    if (!editingOrder) setNoRetur(generateReturOrderId(val));
                  }}
                  options={outletOrderOptions}
                  placeholder="Pilih Shopee, Tiktok, Tokped, Website..."
                />

                <DropsearchSelect
                  label="Opsi Pengiriman (Ekspedisi Pengganti)"
                  required
                  value={opsiPengiriman}
                  onChange={setOpsiPengiriman}
                  options={shippingOptions}
                  placeholder="Pilih JNE, J&T, SiCepat, GoSend..."
                />
              </div>

              {/* Baris 2: Kategori & Alasan / Deskripsi Retur */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-rose-50/40 dark:bg-rose-950/20 p-4 rounded-xl border border-rose-200/70 dark:border-rose-900/50">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Kategori Alasan Retur <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={kategoriAlasan}
                    onChange={e => {
                      const val = e.target.value as any;
                      setKategoriAlasan(val);
                      if (val === 'defect_reject' || val === 'salah_kirim') {
                        setPenanggungBiaya('toko_free');
                      } else {
                        setPenanggungBiaya('customer');
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                  >
                    <option value="tukar_size_model">Tukar Size / Model (Keinginan Customer)</option>
                    <option value="defect_reject">Barang Defect / Reject Produksi</option>
                    <option value="salah_kirim">Salah Kirim Barang / Size oleh Gudang/Store</option>
                    <option value="lainnya">Lainnya</option>
                  </select>
                  <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">
                    Menentukan default penanggung ongkir & selisih biaya
                  </p>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Alasan / Deskripsi Retur Lengkap <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={alasanRetur}
                    onChange={e => setAlasanRetur(e.target.value)}
                    placeholder="Jelaskan alasan retur secara detail (Cth: Customer minta tukar size dari S ke M karena kekecilan / Resleting macet)..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30"
                    required
                  />
                </div>
              </div>

              {/* Baris 3: Data Penerima / Customer */}
              <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <Package className="w-4 h-4 text-rose-600" />
                  <span>Data Customer (Tujuan Pengiriman Barang Pengganti)</span>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Nama Customer <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={namaCustomer}
                      onChange={e => setNamaCustomer(e.target.value)}
                      placeholder="Nama lengkap penerima..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-900 dark:text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      No. HP / WhatsApp Customer <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={noHp}
                      onChange={e => setNoHp(e.target.value)}
                      placeholder="Cth: 081234567890"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-semibold text-slate-900 dark:text-white"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Alamat Lengkap Pengiriman <span className="text-rose-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    value={alamatLengkap}
                    onChange={e => setAlamatLengkap(e.target.value)}
                    placeholder="Jalan, Nomor Rumah, RT/RW, Kelurahan, Kecamatan, Kota/Kabupaten, Kode Pos..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                    required
                  />
                </div>
              </div>

              {/* Baris 4: 2 Blok Produk (1. Produk Pesanan yang Diretur, 2. Produk Pengganti + Fulfillment) */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                {/* BLOK KIRI: PRODUK PESANAN AWAL (YANG DIRETUR CUSTOMER) */}
                <div className="p-4 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/20 dark:bg-rose-950/10 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-rose-800 dark:text-rose-300">
                        1. Produk Pesanan (Barang Diretur) <span className="text-rose-500">*</span>
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Produk awal dari customer yang dikembalikan ke gudang
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setProdukPesanan(prev => [
                          ...prev,
                          { id: `orig-${Date.now()}`, sku: '', nama_produk: '', size: '', qty: 1 },
                        ])
                      }
                      className="px-2.5 py-1 rounded-lg bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/80 text-rose-700 dark:text-rose-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>+ Baris</span>
                    </button>
                  </div>

                  {/* Pencarian Katalog Produk Pesanan */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchOrigQuery}
                      onChange={e => setSearchOrigQuery(e.target.value)}
                      placeholder="Ketik SKU atau Nama Produk untuk mengisi cepat..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-800/80 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                    />
                    {searchOrigResults.length > 0 && (
                      <div className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                        {searchOrigResults.map((p, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectProductForOrig(p)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-between cursor-pointer"
                          >
                            <div>
                              <span className="font-mono font-bold text-rose-600 dark:text-rose-400 mr-2">{p.k}</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-100">{p.p || p.n}</span>
                            </div>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              Size: {p.s || '-'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {produkPesanan.map((item, idx) => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 grid grid-cols-12 gap-2 items-end"
                      >
                        <div className="col-span-4">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase">SKU</label>
                          <input
                            type="text"
                            value={item.sku}
                            onChange={e =>
                              setProdukPesanan(prev =>
                                prev.map(i => (i.id === item.id ? { ...i, sku: e.target.value.toUpperCase() } : i))
                              )
                            }
                            placeholder="SKU..."
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white"
                            required
                          />
                        </div>
                        <div className="col-span-4">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase">Nama Produk</label>
                          <input
                            type="text"
                            value={item.nama_produk}
                            onChange={e =>
                              setProdukPesanan(prev =>
                                prev.map(i => (i.id === item.id ? { ...i, nama_produk: e.target.value } : i))
                              )
                            }
                            placeholder="Nama produk..."
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                            required
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase">Size</label>
                          <input
                            type="text"
                            value={item.size}
                            onChange={e =>
                              setProdukPesanan(prev =>
                                prev.map(i => (i.id === item.id ? { ...i, size: e.target.value.toUpperCase() } : i))
                              )
                            }
                            placeholder="S/M/L"
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-center font-bold text-slate-900 dark:text-white"
                          />
                        </div>
                        <div className="col-span-1">
                          <label className="block text-[10px] font-bold text-slate-400 uppercase">Qty</label>
                          <input
                            type="number"
                            min={1}
                            value={item.qty}
                            onChange={e =>
                              setProdukPesanan(prev =>
                                prev.map(i => (i.id === item.id ? { ...i, qty: Math.max(1, Number(e.target.value) || 1) } : i))
                              )
                            }
                            className="w-full px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-center font-bold text-slate-900 dark:text-white"
                            required
                          />
                        </div>
                        <div className="col-span-1 flex justify-end">
                          {produkPesanan.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setProdukPesanan(prev => prev.filter(i => i.id !== item.id))}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                              title="Hapus baris"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* BLOK KANAN: PRODUK PENGGANTI (+ OPSI FULFILLMENT WAJIB) */}
                <div className="p-4 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/20 dark:bg-emerald-950/10 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-extrabold uppercase tracking-wider text-emerald-800 dark:text-emerald-300">
                        2. Produk Pengganti & Opsi Fulfillment <span className="text-rose-500">*</span>
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Produk yang akan dicetak di <strong>Label A6</strong> & <strong>Picking List</strong>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={handleCopyOrigToReplacement}
                        className="px-2 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 text-[10px] font-bold border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                        title="Salin dari Produk Pesanan jika hanya tukar size"
                      >
                        Salin dari Produk Pesanan
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setProdukPengganti(prev => [
                            ...prev,
                            { id: `rep-${Date.now()}`, sku: '', nama_produk: '', size: '', qty: 1, fulfillment: 'Marketplace' },
                          ])
                        }
                        className="px-2.5 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>+ Baris</span>
                      </button>
                    </div>
                  </div>

                  {/* Pencarian Katalog Produk Pengganti */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchRepQuery}
                      onChange={e => setSearchRepQuery(e.target.value)}
                      placeholder="Ketik SKU atau Nama Produk Pengganti..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl border border-emerald-200 dark:border-emerald-800/80 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                    />
                    {searchRepResults.length > 0 && (
                      <div className="absolute z-30 mt-1 w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-48 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                        {searchRepResults.map((p, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectProductForRep(p)}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-emerald-50 dark:hover:bg-emerald-950/40 flex items-center justify-between cursor-pointer"
                          >
                            <div>
                              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 mr-2">{p.k}</span>
                              <span className="font-semibold text-slate-800 dark:text-slate-100">{p.p || p.n}</span>
                            </div>
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              Size: {p.s || '-'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-2.5">
                    {produkPengganti.map(item => (
                      <div
                        key={item.id}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                      >
                        <div className="grid grid-cols-12 gap-2 items-end">
                          <div className="col-span-4">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">SKU Pengganti *</label>
                            <input
                              type="text"
                              value={item.sku}
                              onChange={e =>
                                setProdukPengganti(prev =>
                                  prev.map(i => (i.id === item.id ? { ...i, sku: e.target.value.toUpperCase() } : i))
                                )
                              }
                              placeholder="SKU..."
                              className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-white"
                              required
                            />
                          </div>
                          <div className="col-span-4">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Nama Produk *</label>
                            <input
                              type="text"
                              value={item.nama_produk}
                              onChange={e =>
                                setProdukPengganti(prev =>
                                  prev.map(i => (i.id === item.id ? { ...i, nama_produk: e.target.value } : i))
                                )
                              }
                              placeholder="Nama produk..."
                              className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                              required
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Size</label>
                            <input
                              type="text"
                              value={item.size}
                              onChange={e =>
                                setProdukPengganti(prev =>
                                  prev.map(i => (i.id === item.id ? { ...i, size: e.target.value.toUpperCase() } : i))
                                )
                              }
                              placeholder="S/M/L"
                              className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-center font-bold text-slate-900 dark:text-white"
                            />
                          </div>
                          <div className="col-span-2">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Qty *</label>
                            <input
                              type="number"
                              min={1}
                              value={item.qty}
                              onChange={e =>
                                setProdukPengganti(prev =>
                                  prev.map(i => (i.id === item.id ? { ...i, qty: Math.max(1, Number(e.target.value) || 1) } : i))
                                )
                              }
                              className="w-full px-1.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-center font-bold text-slate-900 dark:text-white"
                              required
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
                          <div className="flex-1 flex items-center gap-2">
                            <span className="text-[10px] font-extrabold uppercase text-emerald-700 dark:text-emerald-400 shrink-0">
                              Opsi Fulfillment *:
                            </span>
                            <select
                              value={item.fulfillment}
                              onChange={e =>
                                setProdukPengganti(prev =>
                                  prev.map(i => (i.id === item.id ? { ...i, fulfillment: e.target.value } : i))
                                )
                              }
                              className="w-full rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-950/40 text-xs font-bold py-1 px-2 text-slate-900 dark:text-white"
                              required
                            >
                              {fulfillmentOptions.map((f, fIdx) => (
                                <option key={fIdx} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                          </div>
                          {produkPengganti.length > 1 && (
                            <button
                              type="button"
                              onClick={() => setProdukPengganti(prev => prev.filter(i => i.id !== item.id))}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg cursor-pointer"
                              title="Hapus baris"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Baris 5: Selisih Harga, Ongkir & Lampiran Bukti Pembayaran (Bisa Dikosongkan di Awal Input) */}
              <div className="p-4 rounded-2xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/20 dark:bg-amber-950/10 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-extrabold uppercase tracking-wider text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <Banknote className="w-4 h-4 text-amber-600" />
                      <span>Biaya Retur, Selisih Harga & Bukti Pembayaran (Opsional di Awal Input)</span>
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Bisa dikosongkan saat registrasi awal dan dilengkapi kemudian setelah customer mentransfer biaya
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => setPenanggungBiaya('customer')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                        penanggungBiaya === 'customer'
                          ? 'bg-amber-600 text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Ditanggung Customer
                    </button>
                    <button
                      type="button"
                      onClick={() => setPenanggungBiaya('toko_free')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer transition-colors ${
                        penanggungBiaya === 'toko_free'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Free Ongkir / Ditanggung Toko
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Selisih Harga yang Harus Dibayar (Rp) <span className="text-[10px] font-normal text-slate-400">(Opsional)</span>
                    </label>
                    <input
                      type="number"
                      value={selisihHarga}
                      onChange={e => setSelisihHarga(e.target.value)}
                      placeholder="Bisa dikosongkan di awal (Cth: 50000)"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Ongkir yang Perlu Dibayar (Rp) <span className="text-[10px] font-normal text-slate-400">(Opsional)</span>
                    </label>
                    <input
                      type="number"
                      value={ongkirDibayar}
                      onChange={e => setOngkirDibayar(e.target.value)}
                      placeholder="Bisa dikosongkan di awal (Cth: 18000)"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Resi Balik dari Customer <span className="text-[10px] font-normal text-slate-400">(Opsional)</span>
                    </label>
                    <input
                      type="text"
                      value={noResiCustomer}
                      onChange={e => setNoResiCustomer(e.target.value)}
                      placeholder="Resi paket retur dari customer (jika sudah ada)"
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Upload Lampiran Bukti Pembayaran & Foto Barang */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Lampiran Bukti Pembayaran <span className="text-[10px] font-normal text-slate-400">(Bisa menyusul)</span>
                      </span>
                      <label className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer">
                        <Upload className="w-3 h-3" />
                        <span>{uploadingBukti ? 'Mengunggah...' : 'Upload Bukti Bayar'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={uploadingBukti}
                          onChange={e => handleUploadFiles(e.target.files, 'bukti_bayar')}
                        />
                      </label>
                    </div>
                    {buktiPembayaranUrls.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {buktiPembayaranUrls.map((url, idx) => (
                          <div
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300"
                          >
                            <a href={url} target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" />
                              <span>Bukti Bayar #{idx + 1}</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => setBuktiPembayaranUrls(prev => prev.filter((_, i) => i !== idx))}
                              className="text-rose-500 hover:text-rose-700 ml-1 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400">Belum ada lampiran bukti transfer (bisa dikosongkan di awal).</p>
                    )}
                  </div>

                  <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Foto Barang Retur / Komplain <span className="text-[10px] font-normal text-slate-400">(Opsional)</span>
                      </span>
                      <label className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer">
                        <ImageIcon className="w-3 h-3" />
                        <span>{uploadingKomplain ? 'Mengunggah...' : 'Upload Foto Barang'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          disabled={uploadingKomplain}
                          onChange={e => handleUploadFiles(e.target.files, 'foto_komplain')}
                        />
                      </label>
                    </div>
                    {fotoKomplainUrls.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {fotoKomplainUrls.map((url, idx) => (
                          <div
                            key={idx}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300"
                          >
                            <a href={url} target="_blank" rel="noreferrer" className="hover:underline flex items-center gap-1">
                              <ExternalLink className="w-3 h-3" />
                              <span>Foto Komplain #{idx + 1}</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => setFotoKomplainUrls(prev => prev.filter((_, i) => i !== idx))}
                              className="text-rose-500 hover:text-rose-700 ml-1 cursor-pointer"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400">Opsional: lampirkan foto kondisi produk yang diretur.</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                {editingOrder && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 cursor-pointer"
                  >
                    Batal
                  </button>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-extrabold flex items-center gap-2 shadow-md shadow-rose-600/20 cursor-pointer transition-all"
                >
                  <Send className="w-4 h-4" />
                  <span>{loading ? 'Menyimpan...' : editingOrder ? 'Simpan Perubahan Retur' : 'Submit Pesanan Retur'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          SUB-TAB 2: REKAP RETUR BARANG (3 TAHAP ALUR + CETAK A6/PICKING + DEALPOS)
         ===================================================================== */}
      {subTab === 'rekap' && (
        <div className="space-y-4">
          {/* 3 Tahap Utama Rekap Retur */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setStageTab('baru');
                setFilterPrintStatus('all');
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                stageTab === 'baru'
                  ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900 shadow-md'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-slate-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-80">1. Pesanan Baru</span>
                <Clock className="w-4 h-4 opacity-75" />
              </div>
              <div className="text-2xl font-black mt-1">{stageCounts.baru}</div>
              <div className="text-[10px] opacity-75 mt-0.5">Baru disubmit CS • Menunggu Cetak</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setStageTab('diproses');
                setFilterPrintStatus('all');
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                stageTab === 'diproses'
                  ? 'bg-amber-500 text-white border-amber-500 shadow-md shadow-amber-500/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-amber-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-90">2. Pesanan Diproses</span>
                <Printer className="w-4 h-4 opacity-85" />
              </div>
              <div className="text-2xl font-black mt-1">{stageCounts.diproses}</div>
              <div className="text-[10px] opacity-85 mt-0.5">Sudah Cetak Label/Picking • Proses SJ/Retur</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setStageTab('selesai');
                setFilterPrintStatus('all');
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                stageTab === 'selesai'
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-600/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-emerald-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-90">3. Pesanan Selesai</span>
                <CheckCircle2 className="w-4 h-4 opacity-85" />
              </div>
              <div className="text-2xl font-black mt-1">{stageCounts.selesai}</div>
              <div className="text-[10px] opacity-85 mt-0.5">Resi Pengiriman & Return Selesai</div>
            </button>

            <button
              type="button"
              onClick={() => {
                setStageTab('semua');
                setFilterPrintStatus('all');
              }}
              className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                stageTab === 'semua'
                  ? 'bg-rose-600 text-white border-rose-600 shadow-md shadow-rose-600/20'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:border-rose-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider opacity-90">Semua Tiket Retur</span>
                <FileText className="w-4 h-4 opacity-85" />
              </div>
              <div className="text-2xl font-black mt-1">{stageCounts.semua}</div>
              <div className="text-[10px] opacity-85 mt-0.5">Total riwayat retur barang</div>
            </button>
          </div>

          {/* Filter Bar & Batch Print Buttons */}
          <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="Cari No. Pesanan, Tiket Retur, Customer, SKU, SJ DealPOS, Invoice Return, Resi..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={filterOutlet}
                  onChange={e => setFilterOutlet(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  <option value="all">Semua Outlet Order</option>
                  {outletOrderOptions.map((o, i) => (
                    <option key={i} value={o}>
                      {o}
                    </option>
                  ))}
                </select>

                <select
                  value={filterDealposDoc}
                  onChange={e => setFilterDealposDoc(e.target.value as any)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  <option value="all">Semua Status DealPOS</option>
                  <option value="need_sj_retur">Belum Isi SJ Gudang Retur</option>
                  <option value="need_invoice_return">Belum Isi Invoice Return</option>
                  <option value="complete_doc">Dokumen DealPOS Lengkap</option>
                </select>

                <select
                  value={filterPrintStatus}
                  onChange={e => setFilterPrintStatus(e.target.value as any)}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200"
                >
                  <option value="all">Semua Status Cetak</option>
                  <option value="unprinted_label">Belum Cetak Label A6</option>
                  <option value="unprinted_picking">Belum Cetak Picking List</option>
                  <option value="printed_all">Sudah Cetak Label & Picking</option>
                </select>
              </div>
            </div>

            {/* Batch Action Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (selectedReturIds.size === filteredOrders.length && filteredOrders.length > 0) {
                      setSelectedReturIds(new Set());
                    } else {
                      setSelectedReturIds(new Set(filteredOrders.map(o => o.no_retur)));
                    }
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 cursor-pointer"
                >
                  {selectedReturIds.size === filteredOrders.length && filteredOrders.length > 0 ? (
                    <CheckSquare className="w-3.5 h-3.5 text-rose-600" />
                  ) : (
                    <Square className="w-3.5 h-3.5" />
                  )}
                  <span>Pilih Semua ({selectedReturIds.size} terpilih)</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    handlePrintPickingList(
                      selectedReturIds.size > 0
                        ? filteredOrders.filter(o => selectedReturIds.has(o.no_retur))
                        : filteredOrders
                    )
                  }
                  className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>
                    Cetak Picking List ({selectedReturIds.size > 0 ? selectedReturIds.size : filteredOrders.length})
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handlePrintLabelA6(
                      selectedReturIds.size > 0
                        ? filteredOrders.filter(o => selectedReturIds.has(o.no_retur))
                        : filteredOrders
                    )
                  }
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xs cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>
                    Cetak Label A6 ({selectedReturIds.size > 0 ? selectedReturIds.size : filteredOrders.length})
                  </span>
                </button>
              </div>
            </div>
          </div>

          {/* Tabel Rekap Retur Barang */}
          {filteredOrders.length === 0 ? (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center">
              <RefreshCcw className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
              <div className="text-sm font-bold text-slate-700 dark:text-slate-300">
                Belum ada data Retur Barang pada tab ini
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Klik tombol &quot;Input Retur Baru (CS)&quot; di atas untuk menambahkan pengajuan retur barang.
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 text-[10px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="p-3 w-8 text-center">#</th>
                      <th className="p-3 min-w-[175px]">No. Pesanan & Outlet</th>
                      <th className="p-3 min-w-[180px]">Customer & Pengiriman</th>
                      <th className="p-3 min-w-[230px]">Produk Diretur ➔ Pengganti</th>
                      <th className="p-3 min-w-[165px]">Selisih, Ongkir & Bukti</th>
                      <th className="p-3 min-w-[210px]">DealPOS Admin (SJ & Invoice Return)</th>
                      <th className="p-3 min-w-[165px]">Resi & Cetak</th>
                      <th className="p-3 text-right min-w-[140px]">Aksi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800 text-xs">
                    {filteredOrders.map(order => {
                      const isSelected = selectedReturIds.has(order.no_retur);
                      const statusBadge = getBadgeForRetur(order);
                      const hasMktFulfillment = (order.produk_pengganti || []).some(it => {
                        const f = (it.fulfillment || '').toLowerCase();
                        return !f || f.includes('marketplace') || f.includes('gudang');
                      });

                      return (
                        <tr
                          key={order.no_retur}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors align-top ${
                            order.status === 'batal' ? 'opacity-60 bg-red-50/20 dark:bg-red-950/10' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                const next = new Set(selectedReturIds);
                                if (next.has(order.no_retur)) next.delete(order.no_retur);
                                else next.add(order.no_retur);
                                setSelectedReturIds(next);
                              }}
                              className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                            />
                          </td>

                          {/* Kolom 1: No Pesanan & Outlet */}
                          <td className="p-3 space-y-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${statusBadge.cls}`}>
                                {statusBadge.label}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 text-[10px] font-bold">
                                {order.outlet_order}
                              </span>
                            </div>
                            <div className="font-mono font-black text-slate-900 dark:text-white text-xs">
                              #{order.no_pesanan_asal}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400">
                              Tiket: {order.no_retur}
                            </div>
                            <div className="text-[10px] text-slate-500 dark:text-slate-400">
                              CS: <strong>{order.submitted_by}</strong> •{' '}
                              {new Date(order.created_at).toLocaleDateString('id-ID', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                            {/* Status Barang Retur dari Customer */}
                            <button
                              type="button"
                              onClick={() => handleCycleInboundStatus(order)}
                              className={`mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border cursor-pointer ${
                                order.status_barang_retur === 'diterima_gudang_qc'
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/50 dark:text-emerald-300'
                                  : order.status_barang_retur === 'dikirim_customer'
                                  ? 'bg-blue-50 text-blue-700 border-blue-300 dark:bg-blue-950/50 dark:text-blue-300'
                                  : 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400'
                              }`}
                              title="Klik untuk mengubah status penerimaan fisik barang retur dari customer"
                            >
                              <Package className="w-2.5 h-2.5" />
                              <span>
                                {order.status_barang_retur === 'diterima_gudang_qc'
                                  ? 'Fisik Retur: Diterima QC'
                                  : order.status_barang_retur === 'dikirim_customer'
                                  ? 'Fisik Retur: Dikirim Cust'
                                  : 'Fisik Retur: Belum Diterima'}
                              </span>
                            </button>
                          </td>

                          {/* Kolom 2: Customer & Opsi Pengiriman */}
                          <td className="p-3 space-y-1">
                            <div className="font-bold text-slate-900 dark:text-white">{order.nama_customer}</div>
                            <div className="font-mono text-[11px] text-slate-600 dark:text-slate-300">{order.no_hp}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-2" title={order.alamat_lengkap}>
                              {order.alamat_lengkap}
                            </div>
                            <div className="pt-1">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[10px] font-bold">
                                <Truck className="w-2.5 h-2.5" />
                                <span>{order.opsi_pengiriman}</span>
                              </span>
                            </div>
                          </td>

                          {/* Kolom 3: Produk Pesanan (Diretur) -> Produk Pengganti */}
                          <td className="p-3 space-y-2">
                            <div className="p-1.5 rounded-lg bg-rose-50/60 dark:bg-rose-950/30 border border-rose-200/70 dark:border-rose-900/50">
                              <div className="text-[9.5px] font-extrabold uppercase text-rose-700 dark:text-rose-300 mb-0.5">
                                Diretur Customer:
                              </div>
                              {(order.produk_pesanan || []).map((it, i) => (
                                <div key={i} className="text-[11px] leading-tight text-slate-800 dark:text-slate-200">
                                  <span className="font-mono font-bold text-rose-600 dark:text-rose-400">{it.sku}</span> — {it.nama_produk}{' '}
                                  <span className="font-bold">
                                    ({it.size || '-'} • x{it.qty})
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="p-1.5 rounded-lg bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-900/50">
                              <div className="text-[9.5px] font-extrabold uppercase text-emerald-700 dark:text-emerald-300 mb-0.5">
                                Produk Pengganti (Label A6):
                              </div>
                              {(order.produk_pengganti || []).map((it, i) => (
                                <div key={i} className="text-[11px] leading-tight text-slate-800 dark:text-slate-200 flex items-center justify-between gap-1 flex-wrap">
                                  <div>
                                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">{it.sku}</span> — {it.nama_produk}{' '}
                                    <span className="font-bold">
                                      ({it.size || '-'} • x{it.qty})
                                    </span>
                                  </div>
                                  <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 text-[9.5px] font-bold border border-amber-300 dark:border-amber-800">
                                    {it.fulfillment || 'Marketplace'}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div className="text-[10.5px] text-slate-600 dark:text-slate-400 italic">
                              &ldquo;{order.alasan_retur}&rdquo;
                            </div>
                          </td>

                          {/* Kolom 4: Selisih Harga, Ongkir & Bukti Bayar */}
                          <td className="p-3 space-y-1.5">
                            {order.penanggung_biaya === 'toko_free' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold">
                                Free Ongkir (Tanggungan Toko)
                              </span>
                            ) : (
                              <div className="space-y-0.5 text-[11px]">
                                <div>
                                  <span className="text-slate-400">Selisih:</span>{' '}
                                  <strong className="font-mono text-slate-800 dark:text-slate-200">
                                    {order.selisih_harga !== null && order.selisih_harga !== undefined
                                      ? `Rp ${Number(order.selisih_harga).toLocaleString('id-ID')}`
                                      : 'Belum diisi'}
                                  </strong>
                                </div>
                                <div>
                                  <span className="text-slate-400">Ongkir:</span>{' '}
                                  <strong className="font-mono text-slate-800 dark:text-slate-200">
                                    {order.ongkir_dibayar !== null && order.ongkir_dibayar !== undefined
                                      ? `Rp ${Number(order.ongkir_dibayar).toLocaleString('id-ID')}`
                                      : 'Belum diisi'}
                                  </strong>
                                </div>
                              </div>
                            )}

                            {order.bukti_pembayaran_urls && order.bukti_pembayaran_urls.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {order.bukti_pembayaran_urls.map((u, idx) => (
                                  <a
                                    key={idx}
                                    href={u}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 text-[10px] font-bold hover:underline"
                                  >
                                    <ExternalLink className="w-2.5 h-2.5" />
                                    <span>Bukti #{idx + 1}</span>
                                  </a>
                                ))}
                              </div>
                            ) : (
                              <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                                Bukti bayar belum dilampirkan
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() =>
                                setPaymentModal({
                                  order,
                                  penanggung: order.penanggung_biaya || 'customer',
                                  selisih:
                                    order.selisih_harga !== null && order.selisih_harga !== undefined
                                      ? String(order.selisih_harga)
                                      : '',
                                  ongkir:
                                    order.ongkir_dibayar !== null && order.ongkir_dibayar !== undefined
                                      ? String(order.ongkir_dibayar)
                                      : '',
                                  urls: order.bukti_pembayaran_urls || [],
                                })
                              }
                              className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                            >
                              + Update Biaya / Bukti Bayar
                            </button>
                          </td>

                          {/* Kolom 5: 2 Dokumen DealPOS Admin (SJ DealPOS to Gudang Retur & Invoice Return) */}
                          <td className="p-3 space-y-2">
                            {/* 1. SJ DealPOS to Gudang Retur */}
                            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                                  1. SJ to Gudang Retur:
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setSjReturModal({ order, value: order.no_sj_gudang_retur || '' })}
                                  className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                >
                                  {order.no_sj_gudang_retur ? 'Edit' : '+ Isi SJ'}
                                </button>
                              </div>
                              {order.no_sj_gudang_retur ? (
                                <div className="font-mono font-bold text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                                  <span>{order.no_sj_gudang_retur}</span>
                                </div>
                              ) : (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                                  <Clock className="w-3 h-3 shrink-0" />
                                  <span>Menunggu Admin isi SJ</span>
                                </div>
                              )}
                            </div>

                            {/* 2. Invoice Return DealPOS */}
                            <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/80 space-y-1">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">
                                  2. Invoice Return:
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setInvoiceReturnModal({ order, value: order.no_invoice_return || '' })}
                                  className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                >
                                  {order.no_invoice_return ? 'Edit' : '+ Isi Invoice'}
                                </button>
                              </div>
                              {order.no_invoice_return ? (
                                <div className="font-mono font-bold text-[11px] text-emerald-700 dark:text-emerald-300 flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3 shrink-0" />
                                  <span>{order.no_invoice_return}</span>
                                </div>
                              ) : (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                                  <Clock className="w-3 h-3 shrink-0" />
                                  <span>Diisi saat retur selesai</span>
                                </div>
                              )}
                            </div>
                          </td>

                          {/* Kolom 6: No. Resi Pengiriman & Penanda Cetak */}
                          <td className="p-3 space-y-2">
                            {order.no_resi ? (
                              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 space-y-1">
                                <div className="text-[9.5px] font-extrabold uppercase text-emerald-700 dark:text-emerald-300">
                                  Resi Pengiriman Pengganti:
                                </div>
                                <div className="font-mono font-black text-xs text-emerald-900 dark:text-emerald-200">
                                  {order.no_resi}
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setResiPengirimanModal({
                                      order,
                                      resi: order.no_resi || '',
                                      invoiceReturn: order.no_invoice_return || '',
                                    })
                                  }
                                  className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 underline cursor-pointer"
                                >
                                  Ubah Resi
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setResiPengirimanModal({
                                    order,
                                    resi: '',
                                    invoiceReturn: order.no_invoice_return || '',
                                  })
                                }
                                className="w-full px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold flex items-center justify-center gap-1 shadow-2xs cursor-pointer"
                              >
                                <Truck className="w-3.5 h-3.5" />
                                <span>+ Input Resi (Selesai)</span>
                              </button>
                            )}

                            {/* Penanda Sudah Cetak Label A6 & Picking List */}
                            <div className="flex flex-col gap-1">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  order.is_label_printed
                                    ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                                    : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                }`}
                              >
                                {order.is_label_printed ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                <span>{order.is_label_printed ? 'Sudah Cetak Label A6' : 'Belum Cetak Label A6'}</span>
                              </span>

                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${
                                  order.is_picking_printed
                                    ? 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
                                    : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
                                }`}
                              >
                                {order.is_picking_printed ? <Check className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                                <span>{order.is_picking_printed ? 'Sudah Cetak Picking' : 'Belum Cetak Picking'}</span>
                              </span>
                            </div>
                          </td>

                          {/* Kolom 7: Aksi Cetak, WA Grup, Edit, Batal, Delete */}
                          <td className="p-3 text-right space-y-1.5">
                            <div className="flex flex-col items-end gap-1">
                              <button
                                type="button"
                                onClick={() => handlePrintLabelA6(order)}
                                className="w-full px-2.5 py-1 rounded-lg bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Printer className="w-3 h-3" />
                                <span>Cetak Label A6</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handlePrintPickingList(order)}
                                className="w-full px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <FileText className="w-3 h-3" />
                                <span>Picking List</span>
                              </button>

                              {hasMktFulfillment && (
                                <button
                                  type="button"
                                  onClick={() => handleRequestPickingWaGroup(order)}
                                  className="w-full px-2.5 py-1 rounded-lg bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer"
                                  title="Kirim Request Picking Produk Pengganti ke WA Grup Gudang"
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  <span>WA Grup Picking</span>
                                </button>
                              )}

                              <div className="flex items-center justify-end gap-1 pt-1 w-full">
                                <button
                                  type="button"
                                  onClick={() => setDetailModalOrder(order)}
                                  className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                                  title="Detail & Riwayat"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleEditOrder(order)}
                                  className="p-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 cursor-pointer"
                                  title="Edit Data Retur"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                {order.status !== 'batal' && (
                                  <button
                                    type="button"
                                    onClick={() => setCancelModal({ order, reason: '' })}
                                    className="p-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 cursor-pointer"
                                    title="Batalkan Retur"
                                  >
                                    <XCircle className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDeleteOrder(order)}
                                  className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 cursor-pointer"
                                  title="Hapus Tiket Retur"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          MODAL 1: QUICK INPUT SJ DEALPOS TO GUDANG RETUR (ADMIN)
         ===================================================================== */}
      {sjReturModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Input No. SJ DealPOS (to Gudang Retur)
              </h3>
              <button type="button" onClick={() => setSjReturModal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Pesanan: <strong className="text-slate-800 dark:text-slate-200">#{sjReturModal.order.no_pesanan_asal}</strong> ({sjReturModal.order.nama_customer})
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                No. SJ DealPOS ke Gudang Retur
              </label>
              <input
                type="text"
                value={sjReturModal.value}
                onChange={e => setSjReturModal(prev => (prev ? { ...prev, value: e.target.value } : null))}
                placeholder="Cth: Transfer Order #26.10.00210"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSjReturModal(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveSjGudangRetur}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
              >
                Simpan SJ Gudang Retur
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 2: QUICK INPUT INVOICE RETURN DEALPOS (ADMIN)
         ===================================================================== */}
      {invoiceReturnModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Input No. Invoice Return DealPOS
              </h3>
              <button type="button" onClick={() => setInvoiceReturnModal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Diisi Admin saat proses retur di DealPOS sudah selesai (order retur siap/sudah dikirim).
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Nomor Invoice Return DealPOS
              </label>
              <input
                type="text"
                value={invoiceReturnModal.value}
                onChange={e => setInvoiceReturnModal(prev => (prev ? { ...prev, value: e.target.value } : null))}
                placeholder="Cth: RET-26.10.00045"
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInvoiceReturnModal(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveInvoiceReturn}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
              >
                Simpan Invoice Return
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 3: INPUT NO. RESI PENGIRIMAN -> PROSES RETUR SELESAI
         ===================================================================== */}
      {resiPengirimanModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Input No. Resi Pengiriman (Selesaikan Retur)
              </h3>
              <button type="button" onClick={() => setResiPengirimanModal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Menginput nomor resi pengiriman produk pengganti akan otomatis memindahkan pesanan retur{' '}
              <strong className="text-slate-800 dark:text-slate-200">#{resiPengirimanModal.order.no_pesanan_asal}</strong> ke tahap{' '}
              <strong className="text-emerald-600">Pesanan Selesai</strong>.
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nomor Resi Pengiriman ({resiPengirimanModal.order.opsi_pengiriman}) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={resiPengirimanModal.resi}
                  onChange={e => setResiPengirimanModal(prev => (prev ? { ...prev, resi: e.target.value } : null))}
                  placeholder="Masukkan nomor resi ekspedisi..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  No. Invoice Return DealPOS <span className="text-[10px] font-normal text-slate-400">(Sekalian lengkapi jika belum)</span>
                </label>
                <input
                  type="text"
                  value={resiPengirimanModal.invoiceReturn}
                  onChange={e => setResiPengirimanModal(prev => (prev ? { ...prev, invoiceReturn: e.target.value } : null))}
                  placeholder="Cth: RET-26.10.00045"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResiPengirimanModal(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveResiPengiriman}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
              >
                Simpan Resi & Tandai Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 4: QUICK UPDATE BIAYA, SELISIH HARGA, ONGKIR & BUKTI PEMBAYARAN
         ===================================================================== */}
      {paymentModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                Update Selisih Harga, Ongkir & Bukti Bayar
              </h3>
              <button type="button" onClick={() => setPaymentModal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Penanggung Biaya</label>
                <select
                  value={paymentModal.penanggung}
                  onChange={e => setPaymentModal(prev => (prev ? { ...prev, penanggung: e.target.value as any } : null))}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold text-slate-900 dark:text-white"
                >
                  <option value="customer">Ditanggung Customer</option>
                  <option value="toko_free">Free Ongkir / Ditanggung Toko</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Selisih Harga yang Harus Dibayar (Rp)
                </label>
                <input
                  type="number"
                  value={paymentModal.selisih}
                  onChange={e => setPaymentModal(prev => (prev ? { ...prev, selisih: e.target.value } : null))}
                  placeholder="Cth: 50000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Ongkir yang Perlu Dibayar (Rp)
                </label>
                <input
                  type="number"
                  value={paymentModal.ongkir}
                  onChange={e => setPaymentModal(prev => (prev ? { ...prev, ongkir: e.target.value } : null))}
                  placeholder="Cth: 18000"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono font-bold text-slate-900 dark:text-white"
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Lampiran Bukti Pembayaran</span>
                  <label className="px-2.5 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer">
                    <Upload className="w-3 h-3" />
                    <span>{uploadingBukti ? 'Mengunggah...' : '+ Upload Bukti'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      disabled={uploadingBukti}
                      onChange={e => handleUploadFiles(e.target.files, 'bukti_bayar')}
                    />
                  </label>
                </div>
                {paymentModal.urls.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {paymentModal.urls.map((u, idx) => (
                      <div key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-[10px] font-bold text-emerald-700">
                        <a href={u} target="_blank" rel="noreferrer" className="hover:underline">
                          Bukti #{idx + 1}
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            setPaymentModal(prev =>
                              prev ? { ...prev, urls: prev.urls.filter((_, i) => i !== idx) } : null
                            )
                          }
                          className="text-rose-500 ml-1 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPaymentModal(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSavePaymentModal}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                Simpan Pembayaran
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 5: BATALKAN PESANAN RETUR
         ===================================================================== */}
      {cancelModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-rose-600">Batalkan Tiket Retur #{cancelModal.order.no_pesanan_asal}</h3>
              <button type="button" onClick={() => setCancelModal(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Alasan Pembatalan <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={cancelModal.reason}
                onChange={e => setCancelModal(prev => (prev ? { ...prev, reason: e.target.value } : null))}
                placeholder="Masukkan alasan pembatalan retur..."
                className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelModal(null)}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Kembali
              </button>
              <button
                type="button"
                onClick={handleConfirmCancel}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
              >
                Konfirmasi Batal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 6: DETAIL & RIWAYAT LOG TIKET RETUR
         ===================================================================== */}
      {detailModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[85vh] overflow-y-auto p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                  Detail Retur #{detailModalOrder.no_pesanan_asal} ({detailModalOrder.outlet_order})
                </h3>
                <p className="text-xs font-mono text-slate-400">Tiket: {detailModalOrder.no_retur}</p>
              </div>
              <button type="button" onClick={() => setDetailModalOrder(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1">
                <div className="font-bold text-slate-400 uppercase text-[10px]">Data Customer</div>
                <div className="font-bold text-slate-900 dark:text-white">{detailModalOrder.nama_customer}</div>
                <div className="font-mono">{detailModalOrder.no_hp}</div>
                <div className="text-slate-600 dark:text-slate-300">{detailModalOrder.alamat_lengkap}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 space-y-1">
                <div className="font-bold text-slate-400 uppercase text-[10px]">Info Pengiriman & DealPOS</div>
                <div>Ekspedisi: <strong>{detailModalOrder.opsi_pengiriman}</strong></div>
                <div>SJ Gudang Retur: <strong className="font-mono">{detailModalOrder.no_sj_gudang_retur || '-'}</strong></div>
                <div>Invoice Return: <strong className="font-mono">{detailModalOrder.no_invoice_return || '-'}</strong></div>
                <div>Resi Pengganti: <strong className="font-mono text-emerald-600">{detailModalOrder.no_resi || '-'}</strong></div>
              </div>
            </div>

            {detailModalOrder.foto_komplain_urls && detailModalOrder.foto_komplain_urls.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-300">Lampiran Foto Barang / Komplain:</div>
                <div className="flex flex-wrap gap-2">
                  {detailModalOrder.foto_komplain_urls.map((u, i) => (
                    <a
                      key={i}
                      href={u}
                      target="_blank"
                      rel="noreferrer"
                      className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 text-xs font-bold flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      <span>Foto Komplain #{i + 1}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="text-xs font-extrabold uppercase text-slate-500">Riwayat Aktivitas (Audit Trail)</div>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {(detailModalOrder.history_logs || []).map((h, i) => (
                  <div key={h.id || i} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 text-[11px] flex items-start justify-between gap-2">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{h.actor}</span>:{' '}
                      <span className="text-slate-600 dark:text-slate-300">{h.details}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {new Date(h.timestamp).toLocaleString('id-ID')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL 7: PENGATURAN KHUSUS PUSAT RESOLUSI (EMAIL TIM & WA GRUP)
         ===================================================================== */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-lg w-full p-5 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Mail className="w-5 h-5 text-rose-600" />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                    Pengaturan Email & Notifikasi Pusat Resolusi
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Atur alamat email tim yang menerima notifikasi otomatis saat CS submit retur baru
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => setIsSettingsModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Daftar Email Tim Penerima (Pisahkan dengan koma) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  value={emailInputText}
                  onChange={e => setEmailInputText(e.target.value)}
                  placeholder="Cth: chocochips.warehouse2@gmail.com, finance@chocochips.id, spv.cs@gmail.com"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-white"
                  required
                />
                <p className="mt-1 text-[10px] text-slate-400">
                  Dikirim menggunakan Google Apps Script (MailApp.sendEmail) yang terhubung ke akun Gmail resmi.
                </p>
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  CC Email (Opsional, pisahkan dengan koma)
                </label>
                <input
                  type="text"
                  value={ccEmailInputText}
                  onChange={e => setCcEmailInputText(e.target.value)}
                  placeholder="Cth: manager@chocochips.id"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nama Pengirim Email (Sender Name)
                </label>
                <input
                  type="text"
                  value={fromNameInput}
                  onChange={e => setFromNameInput(e.target.value)}
                  placeholder="Chocochips - Pusat Resolusi"
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  ID Grup WhatsApp Picking (Fonnte)
                </label>
                <input
                  type="text"
                  value={waGroupPickingInput}
                  onChange={e => setWaGroupPickingInput(e.target.value)}
                  placeholder="Kosongkan untuk memakai grup WA Gudang default..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 font-mono text-xs text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoEmailSubmit}
                    onChange={e => setAutoEmailSubmit(e.target.checked)}
                    className="rounded text-rose-600"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Kirim email otomatis ke tim saat CS klik <strong>Submit Pesanan Retur</strong>
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoEmailComplete}
                    onChange={e => setAutoEmailComplete(e.target.checked)}
                    className="rounded text-rose-600"
                  />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Kirim email otomatis ke tim saat Admin input <strong>No. Resi Pengiriman (Retur Selesai)</strong>
                  </span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
                >
                  {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================================
          FLOATING PRINT BAR & PRINT AREA (FORMAT IDENTIK MANUAL SHIPMENT)
          Label A6 = Produk Pengganti | Picking List = Produk Pengganti
         ===================================================================== */}
      {printPayload && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 bg-slate-900 text-white p-3.5 rounded-2xl shadow-2xl flex items-center justify-between gap-3 border border-slate-700 print:hidden">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-rose-600 text-white">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold">
                {printPayload.mode === 'LABEL'
                  ? `Siap Cetak Label A6 Retur (${printPayload.orders.length} Paket)`
                  : `Siap Cetak Picking List Retur (${printPayload.orders.length} Pesanan)`}
              </div>
              <div className="text-[10px] text-slate-300">
                Produk terlampir: Produk Pengganti • Klik Cetak jika dialog belum muncul
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak</span>
            </button>
            <button
              type="button"
              onClick={() => setPrintPayload(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

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
                box-shadow: none !important;
                border: none !important;
                background: transparent !important;
              }
              #retur-barang-print-area,
              #retur-barang-print-area * {
                visibility: visible !important;
              }
              #retur-barang-print-area {
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
                size: ${printPayload.mode === 'LABEL' ? '100mm 150mm' : 'A4 portrait'};
                margin: ${printPayload.mode === 'LABEL' ? '0mm' : '4mm 6mm'};
              }
            }
          `}</style>

          <div id="retur-barang-print-area" className="hidden print:block bg-white w-full text-black">
            {printPayload.mode === 'LABEL' ? (
              printPayload.orders.map((order, orderIdx) => {
                const qrDataUrl = printPayload.qrMap[order.no_retur] || '';
                const activeRepItems = (order.produk_pengganti || []).filter(
                  it => it.item_status !== 'sold_out' && it.item_status !== 'cancelled'
                );
                const totalQty = activeRepItems.reduce((acc, it) => acc + (Number(it.qty) || 0), 0);

                return (
                  <div
                    key={order.no_retur || orderIdx}
                    className="page-break w-full h-[148mm] max-h-[148mm] box-border bg-white relative flex flex-col justify-between overflow-hidden"
                    style={{
                      pageBreakAfter: orderIdx < printPayload.orders.length - 1 ? 'always' : 'auto',
                      breakAfter: orderIdx < printPayload.orders.length - 1 ? 'page' : 'auto',
                      pageBreakInside: 'avoid',
                      breakInside: 'avoid',
                    }}
                  >
                    <div className="w-full h-full border-[2px] border-black flex flex-col bg-white box-border text-black overflow-hidden">
                      <div className="flex flex-col shrink-0">
                        {/* 1. Header Label A6 (Format Manual Shipment) */}
                        <div className="border-b-[2px] border-black px-3 py-2 bg-gray-50 flex justify-between items-center">
                          <div className="text-xl font-black tracking-widest uppercase leading-none text-black flex items-center gap-2">
                            <img
                              src="/logo.svg"
                              alt=""
                              referrerPolicy="no-referrer"
                              className="h-7 object-contain hidden print:block"
                              onError={e => (e.currentTarget.style.display = 'none')}
                            />
                            <span className="text-[11px] font-black border border-black px-1.5 py-0.5">RETUR</span>
                          </div>
                          <div className="text-lg font-black tracking-wider uppercase leading-none text-black">
                            {order.opsi_pengiriman || 'PENGIRIMAN PAKET'}
                          </div>
                        </div>

                        {/* 2. Penerima / Pengirim + QR Code */}
                        <div className="flex border-b-[2px] border-black bg-white">
                          <div className="flex-1 flex flex-col border-r-[2px] border-black min-w-0">
                            <div className="p-3 border-b-[2px] border-black flex-1">
                              <div className="text-[11px] font-black uppercase text-gray-600 mb-1">Kepada / Penerima:</div>
                              <div className="text-[18px] font-black uppercase mb-1 leading-tight text-black">
                                {order.nama_customer || '-'}
                              </div>
                              {order.no_hp && (
                                <div className="text-[14px] font-black font-mono text-black mb-1.5 leading-none">
                                  {order.no_hp}
                                </div>
                              )}
                              <div className="text-[13px] font-bold leading-snug whitespace-pre-wrap text-black">
                                {order.alamat_lengkap || '-'}
                              </div>
                              {order.alasan_retur && (
                                <div className="mt-2 pt-1.5 border-t border-dashed border-gray-300">
                                  <span className="text-[10px] font-black uppercase text-gray-500 mr-1">KET RETUR:</span>
                                  <span className="text-[11px] font-bold text-black">{order.alasan_retur}</span>
                                </div>
                              )}
                            </div>

                            <div className="p-2.5 flex items-center justify-between gap-2 shrink-0 bg-white">
                              <div className="flex-1">
                                <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">Outlet Order / Pengirim:</div>
                                <div className="text-[12px] font-black uppercase text-black leading-tight">
                                  CHOCOCHIPS — {order.outlet_order || 'PUSAT RESOLUSI'}
                                </div>
                              </div>
                              <div className="px-2 border-l border-gray-300">
                                <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">PIC CS:</div>
                                <div className="text-[11px] font-bold text-gray-800 leading-tight">{order.submitted_by}</div>
                              </div>
                            </div>
                          </div>

                          {/* QR Code & Order ID */}
                          <div className="w-[110px] p-2 flex flex-col items-center justify-center shrink-0">
                            {qrDataUrl && (
                              <img
                                src={qrDataUrl}
                                alt="QR Code"
                                className="w-[75px] h-[75px] block object-contain mb-1.5"
                              />
                            )}
                            <div className="text-[10px] font-black text-center break-all mb-0.5 text-black leading-tight">
                              #{order.no_pesanan_asal}
                            </div>
                            <div className="text-[8.5px] font-bold text-center break-all text-neutral-600 leading-tight mt-0.5">
                              {order.no_retur}
                            </div>
                          </div>
                        </div>

                        {/* 3. Warning Box */}
                        <div className="border-b-[2px] border-black py-1.5 px-2 bg-gray-100 flex items-center justify-center text-center">
                          <div className="text-[8.5px] font-black text-black tracking-wide uppercase leading-tight">
                            ⚠️ PERHATIAN: JANGAN DITERIMA JIKA KONDISI PAKET RUSAK ATAU SEGEL TERBUKA &bull; MOHON DOKUMENTASIKAN PENERIMAAN DAN UNBOXING PAKET
                          </div>
                        </div>
                      </div>

                      {/* 4. Tabel Produk Pengganti (Identik Label A6 Manual Shipment) */}
                      <div className="p-3 bg-white flex-1 flex flex-col">
                        <div className="text-[12px] font-black uppercase text-gray-600 border-b border-black pb-1 mb-1.5">
                          ISI PRODUK PENGGANTI (RETUR)
                        </div>
                        <div className="flex-1">
                          <table className="w-full border-collapse text-[12px]">
                            <thead>
                              <tr className="border-b border-dashed border-black">
                                <th className="text-left py-1 w-[5%] font-bold">No.</th>
                                <th className="text-left py-1 w-[50%] font-bold">Nama Produk Pengganti</th>
                                <th className="text-left py-1 w-[15%] font-bold">Size</th>
                                <th className="text-left py-1 w-[20%] font-bold">SKU</th>
                                <th className="text-center py-1 w-[10%] font-bold">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(order.produk_pengganti || []).map((it, idx) => (
                                <tr key={idx} className="border-b border-dashed border-black">
                                  <td className="py-1 align-top">{idx + 1}.</td>
                                  <td className="py-1 align-top leading-snug pr-1">{it.nama_produk}</td>
                                  <td className="py-1 align-top">{it.size || '-'}</td>
                                  <td className="py-1 align-top font-mono">{it.sku || ''}</td>
                                  <td className="py-1 align-top text-center font-bold">{it.qty || 1}</td>
                                </tr>
                              ))}
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
              })
            ) : (
              /* PICKING LIST MODE (Format A4 Tabular Identik Manual Shipment) */
              (() => {
                const todayStr = new Date().toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
                const totalOrders = printPayload.orders.length;
                const totalAllQty = printPayload.orders.reduce(
                  (acc, o) => acc + (o.produk_pengganti || []).reduce((q, it) => q + (Number(it.qty) || 0), 0),
                  0
                );

                return (
                  <div className="bg-white w-full text-black p-2 max-w-[850px] mx-auto text-[9.5px]">
                    <div className="border-b-2 border-black pb-2 mb-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h1 className="text-base font-black tracking-tight uppercase">
                            SURAT JALAN & PICKING LIST RETUR BARANG (PRODUK PENGGANTI)
                          </h1>
                          <div className="text-[10px] text-gray-700 mt-0.5">
                            Pusat Resolusi WMS • Format A4 Portrait
                          </div>
                        </div>
                        <div className="text-right text-[10px] font-mono">
                          <div>
                            <b>Tgl Cetak:</b> {todayStr}
                          </div>
                          <div>
                            <b>Modul:</b> Retur Barang
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center text-[10px] mb-3 bg-gray-100 p-2 border border-gray-300 rounded">
                      <div>
                        <b>Total Pesanan Retur:</b> {totalOrders} Pesanan
                      </div>
                      <div>
                        <b>Total Produk Pengganti:</b> {totalAllQty} Pcs
                      </div>
                      <div>
                        <b>Dicetak Oleh:</b> {actorName}
                      </div>
                      <div>
                        <b>Petugas QC / Packing:</b> ____________________
                      </div>
                    </div>

                    <table className="w-full border-collapse text-[9.5px]">
                      <thead>
                        <tr className="bg-gray-200">
                          <th className="border border-black p-1 text-center font-black w-[4%]">No</th>
                          <th className="border border-black p-1 text-center font-black w-[16%]">No. Pesanan & Tiket</th>
                          <th className="border border-black p-1 text-center font-black w-[12%]">Outlet & Pengiriman</th>
                          <th className="border border-black p-1 text-center font-black w-[15%]">Nama Customer & HP</th>
                          <th className="border border-black p-1 text-center font-black w-[10%]">Lokasi Rak</th>
                          <th className="border border-black p-1 text-left font-black w-[24%]">SKU & Produk Pengganti</th>
                          <th className="border border-black p-1 text-center font-black w-[5%]">Qty</th>
                          <th className="border border-black p-1 text-center font-black w-[4%]">Pick</th>
                          <th className="border border-black p-1 text-left font-black w-[10%]">Alasan Retur</th>
                        </tr>
                      </thead>
                      <tbody>
                        {printPayload.orders.map((order, orderIdx) => {
                          const items = order.produk_pengganti || [];
                          const rowCount = items.length || 1;
                          return items.map((item, itemIdx) => (
                            <tr key={`${order.no_retur}-${itemIdx}`}>
                              {itemIdx === 0 && (
                                <>
                                  <td rowSpan={rowCount} className="border border-black p-1 text-center align-middle font-bold">
                                    {orderIdx + 1}
                                  </td>
                                  <td rowSpan={rowCount} className="border border-black p-1 text-center align-middle font-mono">
                                    <div className="font-black text-[10px]">#{order.no_pesanan_asal}</div>
                                    <div className="text-[8px] text-gray-600">{order.no_retur}</div>
                                  </td>
                                  <td rowSpan={rowCount} className="border border-black p-1 text-center align-middle font-bold text-[9px]">
                                    <div>{order.outlet_order}</div>
                                    <div className="text-[8px] text-gray-700 mt-0.5">{order.opsi_pengiriman}</div>
                                  </td>
                                  <td rowSpan={rowCount} className="border border-black p-1 align-middle">
                                    <div className="font-bold">{order.nama_customer}</div>
                                    <div className="font-mono text-[8.5px] text-gray-700">{order.no_hp}</div>
                                  </td>
                                </>
                              )}
                              <td className="border border-black p-1 text-center align-middle font-black text-[10px] bg-gray-50">
                                {item.lokasi || item.fulfillment || '-'}
                              </td>
                              <td className="border border-black p-1 align-middle">
                                <div className="font-black text-[9.5px]">{item.sku}</div>
                                <div className="text-gray-800 text-[8.5px]">{item.nama_produk}</div>
                                {item.size && <div className="text-gray-600 italic text-[8px]">Size: {item.size}</div>}
                                <div className="text-blue-800 font-bold text-[8px]">Fulfill: {item.fulfillment}</div>
                              </td>
                              <td className="border border-black p-1 text-center align-middle font-black text-[11px]">
                                {item.qty}
                              </td>
                              <td className="border border-black p-1 align-middle text-center">
                                <div className="w-3.5 h-3.5 border border-black mx-auto"></div>
                              </td>
                              <td className="border border-black p-1 text-[8px] align-middle">
                                {itemIdx === 0 ? order.alasan_retur : ''}
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
    </div>
  );
}
