import React, { useState, useEffect, useMemo } from 'react';
import {
  Scissors,
  Wrench,
  Calendar,
  User,
  Store,
  Tag,
  CheckCircle2,
  Printer,
  Save,
  RotateCcw,
  Sparkles,
  Camera,
  Upload,
  X,
  FileText,
  AlertCircle,
  HelpCircle,
  History,
  Check,
  Search,
  Plus,
  RefreshCw,
  Building2,
  Warehouse,
  ShieldCheck,
  Clock,
  ArrowRight,
  ChevronRight,
  Filter,
  Eye,
  Layers,
  MapPin,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  Truck,
  PackageCheck,
  Send,
  Share2,
  Copy,
  Phone,
  Mail,
  Trash2
} from 'lucide-react';
import {
  ProductItem,
  UserSession,
  ManualShipmentOrder,
  AlterationRepairData,
  AlterationLayananType,
  AlterationSourceType,
  AlterationFlowStage,
  AlterationFlowLog,
  KatalogBatch,
  ManualShipmentItem
} from '../../types';
import {
  loadKatalogBatches,
  parseStoredKatalogBatches,
  KATALOG_STORAGE_KEY
} from '../katalog/katalogStorage';
import initial325bData from '../../data/initialKatalog325b.json';
import {
  submitManualShipment,
  fetchManualShipments,
  editManualShipment,
  updateAlterationFlowStage,
  fetchOutlets,
  DEFAULT_OUTLETS,
  getFullStoreName
} from '../../services/gasManualShipment';
import { formatProductNameWithSize } from '../../utils/sortUtils';
import { sendFonnteMessage, getFonnteConfig } from '../../services/whatsapp';
import { AlterationRepairReceiptModal } from './AlterationRepairReceiptModal';
import { SuratJalanAlterReceiptModal } from './SuratJalanAlterReceiptModal';
import { AlterationActionModal, AlterationActionType } from './AlterationActionModal';

interface AlterationRepairTabProps {
  session: UserSession | null;
  productCatalog: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  orders?: ManualShipmentOrder[];
  onOrdersUpdated?: () => void;
  onOrderSaved?: (savedOrder: ManualShipmentOrder) => void;
  onGoToRekap?: () => void;
}

const FLOW_STAGES: {
  key: AlterationFlowStage;
  label: string;
  shortLabel: string;
  stepNum: number;
  description: string;
  badgeClass: string;
}[] = [
  {
    key: 'diajukan',
    label: '1. Diajukan (Input Store)',
    shortLabel: 'Input Store',
    stepNum: 1,
    description: 'Permintaan dibuat, menunggu dikirim ke Warehouse',
    badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-300 dark:border-amber-700',
  },
  {
    key: 'dikirim_store',
    label: '2. Dikirim ke Warehouse',
    shortLabel: 'Kirim ke WH',
    stepNum: 2,
    description: 'Barang sedang dalam perjalanan menuju Warehouse',
    badgeClass: 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border-blue-300 dark:border-blue-700',
  },
  {
    key: 'diterima_warehouse',
    label: '3. Diterima di Gudang',
    shortLabel: 'Tiba di WH',
    stepNum: 3,
    description: 'Fisik barang tiba di Warehouse & diverifikasi',
    badgeClass: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700',
  },
  {
    key: 'dalam_pengerjaan',
    label: '4. Dalam Pengerjaan',
    shortLabel: 'Pengerjaan',
    stepNum: 4,
    description: 'Sedang dialter / repair oleh tim penjahit gudang',
    badgeClass: 'bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300 border-purple-300 dark:border-purple-700',
  },
  {
    key: 'selesai_qc',
    label: '5. Selesai QC & Perbaikan',
    shortLabel: 'Selesai QC',
    stepNum: 5,
    description: 'Pengerjaan selesai dan lolos inspeksi QC',
    badgeClass: 'bg-teal-100 text-teal-800 dark:bg-teal-950/60 dark:text-teal-300 border-teal-300 dark:border-teal-700',
  },
  {
    key: 'dikirim_kembali',
    label: '6. Dikirim Kembali',
    shortLabel: 'Dikirim Balik',
    stepNum: 6,
    description: 'Sedang dikirim ke Customer / Store dengan bukti kirim',
    badgeClass: 'bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 border-sky-300 dark:border-sky-700',
  },
  {
    key: 'selesai',
    label: '7. Selesai (Closed)',
    shortLabel: 'Selesai',
    stepNum: 7,
    description: 'Barang telah diterima kembali dan proses selesai',
    badgeClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700',
  },
];

export const AlterationRepairTab: React.FC<AlterationRepairTabProps> = ({
  session,
  productCatalog,
  onShowToast,
  orders: propOrders,
  onOrdersUpdated,
  onOrderSaved,
  onGoToRekap,
}) => {
  const [internalOrders, setInternalOrders] = useState<ManualShipmentOrder[]>([]);
  const [isLoadingOrders, setIsLoadingOrders] = useState(false);
  const [outlets, setOutlets] = useState<{ nama: string; fulfillment: string; kode?: string }[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal Surat Jalan Struk & Action Modal State
  const [sjStrukModalOrder, setSjStrukModalOrder] = useState<ManualShipmentOrder | null>(null);
  const [actionModalData, setActionModalData] = useState<{
    order: ManualShipmentOrder;
    actionType: AlterationActionType;
  } | null>(null);

  // Modal Flow Update State
  const [selectedOrderForFlow, setSelectedOrderForFlow] = useState<ManualShipmentOrder | null>(null);
  const [nextStage, setNextStage] = useState<AlterationFlowStage>('diterima_warehouse');
  const [flowNotes, setFlowNotes] = useState('');
  const [flowPicWarehouse, setFlowPicWarehouse] = useState('');
  const [isUpdatingFlow, setIsUpdatingFlow] = useState(false);

  // Modal Timeline State
  const [timelineOrder, setTimelineOrder] = useState<ManualShipmentOrder | null>(null);

  // Modal Print SPK
  const [spkModalOrder, setSpkModalOrder] = useState<ManualShipmentOrder | null>(null);

  // Modal Preview Image
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  // Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSource, setFilterSource] = useState<'all' | 'store' | 'warehouse'>('all');
  const [filterStage, setFilterStage] = useState<string>('all');
  const [filterService, setFilterService] = useState<'all' | 'alteration' | 'repair' | 'both'>('all');

  // Customer Courier Options
  const CUSTOMER_COURIER_OPTIONS = [
    'JNE REG',
    'JNE YES',
    'JNE OKE',
    'SiCepat REG',
    'SiCepat BEST',
    'SiCepat Cargo',
    'J&T Express',
    'Shopee Xpress (SPX)',
    'Lion Parcel',
    'Paxel (Same Day / Next Day)',
    'GoSend Instant',
    'GoSend Sameday',
    'GrabExpress Instant',
    'GrabExpress Sameday',
    'Lalamove',
    'Kurir Internal Store / Gudang',
    'Custom / Ekspedisi Lainnya',
  ];

  // Multi-Item Structure Interface
  interface FormAlterationItemState {
    id: string;
    sku: string;
    nama_produk: string;
    size: string;
    qty: number;
    layanan_type: AlterationLayananType;
    kondisi: string;
    alteration_detail: string;
    repair_detail: string;
    catalogSearch: string;
    showDropdown: boolean;
  }

  const createDefaultItem = (): FormAlterationItemState => ({
    id: `alt_item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    sku: '',
    nama_produk: '',
    size: '-',
    qty: 1,
    layanan_type: 'alteration',
    kondisi: 'Kondisi baik & bersih',
    alteration_detail: '',
    repair_detail: '',
    catalogSearch: '',
    showDropdown: false,
  });

  // Form Creation State
  const [formSource, setFormSource] = useState<AlterationSourceType>('store');
  const [formIdFormAlter, setFormIdFormAlter] = useState<string>('');
  const [formOutlet, setFormOutlet] = useState<string>('');
  const [formWarehouseRak, setFormWarehouseRak] = useState<string>('');
  const [formPicPemohon, setFormPicPemohon] = useState<string>('');
  const [formPicStorePhone, setFormPicStorePhone] = useState<string>('');
  const [formPicStoreEmail, setFormPicStoreEmail] = useState<string>('');
  const [formRefNo, setFormRefNo] = useState<string>('');
  const [formCustomerNama, setFormCustomerNama] = useState<string>('');
  const [formCustomerHp, setFormCustomerHp] = useState<string>('');
  const [formCustomerAlamat, setFormCustomerAlamat] = useState<string>('');
  const [formCatatanCustomer, setFormCatatanCustomer] = useState<string>('');
  const [formTujuanPengembalian, setFormTujuanPengembalian] = useState<'customer' | 'store'>('store');
  const [formJasaKirimCustomer, setFormJasaKirimCustomer] = useState<string>('JNE REG');
  const [formCustomJasaKirim, setFormCustomJasaKirim] = useState<string>('');
  const [formNotesPaket, setFormNotesPaket] = useState<string>('');
  const [formTanggal, setFormTanggal] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [formPerkiraanSelesai, setFormPerkiraanSelesai] = useState<string>('');
  const [formFotoUrls, setFormFotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Multi-Item State
  const [formItems, setFormItems] = useState<FormAlterationItemState[]>([createDefaultItem()]);

  // Autocomplete catalog search & Dropsearch
  const [extraCatalogProducts, setExtraCatalogProducts] = useState<ProductItem[]>([]);

  // Modal Submission Summary
  const [submittedSummaryOrder, setSubmittedSummaryOrder] = useState<ManualShipmentOrder | null>(null);

  // Helper item array managers
  const handleAddItem = () => {
    setFormItems((prev) => [...prev, createDefaultItem()]);
  };

  const handleRemoveItem = (index: number) => {
    if (formItems.length <= 1) return;
    setFormItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleUpdateItem = (index: number, updates: Partial<FormAlterationItemState>) => {
    setFormItems((prev) =>
      prev.map((it, idx) => (idx === index ? { ...it, ...updates } : it))
    );
  };

  const handleSelectItemCatalog = (index: number, p: ProductItem) => {
    handleUpdateItem(index, {
      nama_produk: String(p.n || p.p || (p as any).deskripsi || (p as any).nomor || ''),
      sku: String(p.k || (p as any).sku || ''),
      size: String(p.size || p.s || '-'),
      catalogSearch: '',
      showDropdown: false,
    });
  };

  // Helper generate Auto ID Form Alter for Warehouse
  const generateAutoWarehouseId = () => {
    const today = new Date();
    const y = String(today.getFullYear()).slice(-2);
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `ALT-WH-${y}${m}${d}-${randomHex}`;
  };

  // Helper flatten batches to ProductItem list
  const extractProductsFromBatches = (batches: KatalogBatch[]): ProductItem[] => {
    const list: ProductItem[] = [];
    const seen = new Set<string>();
    batches.forEach((b) => {
      (b.items || []).forEach((it) => {
        const baseName = it.deskripsi || it.nomor || 'Produk';
        if (Array.isArray(it.variants) && it.variants.length > 0) {
          it.variants.forEach((v) => {
            const sku = v.sku || it.nomor || '';
            const key = `${sku}_${v.size || ''}`.toUpperCase();
            if (!seen.has(key)) {
              seen.add(key);
              list.push({
                k: sku,
                n: baseName,
                p: baseName,
                size: v.size || '-',
                s: v.size || '-',
                category: (it as any).category || b.name || 'Pakaian',
                price: it.price ? parseFloat(String(it.price).replace(/[^\d.]/g, '')) : undefined,
              });
            }
          });
        } else {
          const sku = it.nomor || '';
          const key = sku.toUpperCase();
          if (!seen.has(key)) {
            seen.add(key);
            list.push({
              k: sku,
              n: baseName,
              p: baseName,
              size: '-',
              s: '-',
              category: (it as any).category || b.name || 'Pakaian',
              price: it.price ? parseFloat(String(it.price).replace(/[^\d.]/g, '')) : undefined,
            });
          }
        }
      });
    });
    return list;
  };

  // Load Extra Catalog Items from Storage/Supabase if needed
  useEffect(() => {
    const loadExtraProducts = async () => {
      try {
        const batches = await loadKatalogBatches();
        if (batches && batches.length > 0) {
          const extracted = extractProductsFromBatches(batches);
          setExtraCatalogProducts(extracted);
        } else {
          // Fallback to initial json
          const parsed = parseStoredKatalogBatches(JSON.stringify(initial325bData));
          setExtraCatalogProducts(extractProductsFromBatches(parsed));
        }
      } catch (err) {
        console.warn('Error loading catalog batches for dropsearch:', err);
      }
    };
    loadExtraProducts();
  }, []);

  // Combined product catalog (guaranteed rich dataset for dropsearch)
  const allCatalogProducts = useMemo(() => {
    const seen = new Set<string>();
    const combined: ProductItem[] = [];

    // 1. From prop
    (productCatalog || []).forEach((p) => {
      const key = `${p.k}_${p.size || ''}`.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(p);
      }
    });

    // 2. From extra batches
    extraCatalogProducts.forEach((p) => {
      const key = `${p.k}_${p.size || ''}`.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(p);
      }
    });

    return combined;
  }, [productCatalog, extraCatalogProducts]);

  // Load Outlets
  useEffect(() => {
    fetchOutlets().then((res) => {
      if (res && res.length > 0) {
        setOutlets(res);
      }
    }).catch(() => {});
  }, []);

  // Fetch orders if not provided from prop
  const fetchOrdersDirectly = async () => {
    setIsLoadingOrders(true);
    try {
      const data = await fetchManualShipments();
      setInternalOrders(data);
    } catch (err) {
      console.warn('Error fetching orders for Alteration tab:', err);
    } finally {
      setIsLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (!propOrders) {
      fetchOrdersDirectly();
    }
  }, [propOrders]);

  const allOrders = propOrders || internalOrders;

  // Auto-detect logged-in user store
  const userAssignedStore = useMemo(() => {
    if (!session) return '';
    const userDiv = (session.divisi || '').toLowerCase().trim();
    const userName = (session.name || '').toLowerCase().trim();
    const userUname = (session.username || '').toLowerCase().trim();

    const allOutlets = outlets.length > 0 ? outlets : DEFAULT_OUTLETS;
    const match = allOutlets.find((o) => {
      const oName = o.nama.toLowerCase().trim();
      const oKode = 'kode' in o && o.kode ? (o as any).kode.toLowerCase() : '';
      
      const isGenericDiv = userDiv === 'store' || userDiv === 'outlet';

      return (
        (!isGenericDiv && userDiv && (userDiv === oName || userDiv.includes(oName) || oName.includes(userDiv))) ||
        (userName && (userName === oName || userName.includes(oName))) ||
        (userUname && (userUname === oName || userUname.includes(oName))) ||
        (oKode && userUname && userUname.includes(oKode)) ||
        (oKode && userDiv && userDiv.includes(oKode))
      );
    });

    return match ? match.nama : (allOutlets[0]?.nama || 'Central Park Jakarta');
  }, [session, outlets]);

  // Init form fields
  useEffect(() => {
    if (!formOutlet && userAssignedStore) {
      setFormOutlet(userAssignedStore);
    }
    if (!formPicPemohon && session) {
      setFormPicPemohon(session.name || session.username || '');
    }
    if (!flowPicWarehouse && session) {
      setFlowPicWarehouse(session.name || session.username || '');
    }
  }, [userAssignedStore, session]);

  // Filter only Alteration & Repair orders
  const alterationOrders = useMemo(() => {
    return allOrders.filter((o) => {
      const no = (o.no_pesanan || '').toUpperCase();
      const isAr = o.order_type === 'alteration_repair' || no.startsWith('AR-') || no.startsWith('REP-') || no.startsWith('ALT-') || !!o.alteration_repair_data;
      return isAr;
    });
  }, [allOrders]);

  // Filtered list
  const filteredOrders = useMemo(() => {
    return alterationOrders.filter((o) => {
      const ar = o.alteration_repair_data;
      const sumber = ar?.sumber_barang || (o.nama_pengirim?.toLowerCase().includes('gudang') || o.nama_pengirim?.toLowerCase().includes('warehouse') ? 'warehouse' : 'store');
      const stage = ar?.status_flow || 'diajukan';
      const service = ar?.layanan_type || o.layanan_type || 'both';

      // 1. Source filter
      if (filterSource !== 'all' && sumber !== filterSource) return false;

      // 2. Stage filter
      if (filterStage !== 'all' && stage !== filterStage) return false;

      // 3. Service filter
      if (filterService !== 'all' && service !== filterService) return false;

      // 4. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const no = (o.no_pesanan || '').toLowerCase();
        const prod = (o.items?.[0]?.nama_produk || '').toLowerCase();
        const sku = (o.items?.[0]?.sku || '').toLowerCase();
        const pemohon = (ar?.pic_pemohon || o.pic_store || o.submitted_by || '').toLowerCase();
        const asal = (ar?.nama_asal || o.nama_pengirim || '').toLowerCase();
        const warehousePic = (ar?.pic_warehouse || '').toLowerCase();
        const rak = (ar?.lokasi_rak || '').toLowerCase();

        const match =
          no.includes(q) ||
          prod.includes(q) ||
          sku.includes(q) ||
          pemohon.includes(q) ||
          asal.includes(q) ||
          warehousePic.includes(q) ||
          rak.includes(q);

        if (!match) return false;
      }

      return true;
    });
  }, [alterationOrders, filterSource, filterStage, filterService, searchQuery]);

  // KPI Metrics
  const metrics = useMemo(() => {
    const total = alterationOrders.length;
    let diajukan = 0;
    let diterimaWarehouse = 0;
    let dalamPengerjaan = 0;
    let selesaiQc = 0;
    let siapKirim = 0;
    let selesai = 0;

    alterationOrders.forEach((o) => {
      const st = o.alteration_repair_data?.status_flow || 'diajukan';
      if (st === 'diajukan') diajukan++;
      else if (st === 'diterima_warehouse') diterimaWarehouse++;
      else if (st === 'dalam_pengerjaan') dalamPengerjaan++;
      else if (st === 'selesai_qc') selesaiQc++;
      else if (st === 'siap_dikirim') siapKirim++;
      else if (st === 'selesai') selesai++;
    });

    return {
      total,
      diajukan,
      diterimaWarehouse,
      dalamPengerjaan,
      selesaiQc,
      siapKirim,
      selesai,
    };
  }, [alterationOrders]);

  // Helper generate Registration No
  const generateRegistrationNo = (source: AlterationSourceType, storeName: string) => {
    const today = new Date();
    const y = String(today.getFullYear()).slice(-2);
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const dateStr = `${y}${m}${d}`;

    const code = source === 'warehouse' ? 'WH' : (storeName.slice(0, 3).toUpperCase() || 'STR');
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    return `AR-${code}-${dateStr}-${randomHex}`;
  };

  // Quick preset days for completion
  const handleSetPresetDate = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    setFormPerkiraanSelesai(d.toISOString().slice(0, 10));
  };

  // Preset conditions
  const conditionPresets = [
    'Baru dengan tag',
    'Defect minor pabrik',
    'Sample photoshoot / display',
    'Keliman lepas',
    'Resleting rusak / macet',
    'Kancing hilang',
    'Jahitan sambungan robek',
  ];

  // Preset instructions
  const alterationPresets = [
    'Potong panjang celana/dress ... cm, kelim rapi',
    'Kecilkan pinggang ... cm',
    'Kecilkan lingkar dada ... cm',
    'Pendekkan tali bahu ... cm',
    'Potong panjang lengan ... cm',
  ];

  const repairPresets = [
    'Ganti resleting baru (YKK matching color)',
    'Jahit ulang keliman bawah yang terlepas',
    'Pasang kancing pengganti cadangan',
    'Obras ulang tepi jahitan kain',
    'Jahit rapi sobekan sambungan samping',
  ];

  // Photo upload
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploadingPhoto(true);
    try {
      const urls: string[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
        urls.push(base64);
      }
      setFormFotoUrls((prev) => [...prev, ...urls]);
      onShowToast(`${files.length} foto berhasil ditambahkan`, 'success');
    } catch (err) {
      onShowToast('Gagal memuat foto', 'error');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  // Submit new request
  const handleSubmitNewRequest = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formItems || formItems.length === 0) {
      onShowToast('Minimal 1 item produk pakaian wajib didaftarkan', 'error');
      return;
    }

    // Validate each item
    for (let i = 0; i < formItems.length; i++) {
      const it = formItems[i];
      if (!it.nama_produk.trim()) {
        onShowToast(`Item #${i + 1}: Nama produk wajib diisi / dipilih dari katalog`, 'error');
        return;
      }
      if ((it.layanan_type === 'alteration' || it.layanan_type === 'both') && !it.alteration_detail.trim()) {
        onShowToast(`Item #${i + 1} (${it.nama_produk}): Instruksi alteration wajib diisi`, 'error');
        return;
      }
      if ((it.layanan_type === 'repair' || it.layanan_type === 'both') && !it.repair_detail.trim()) {
        onShowToast(`Item #${i + 1} (${it.nama_produk}): Instruksi repair wajib diisi`, 'error');
        return;
      }
    }

    if (formSource === 'store' && !formIdFormAlter.trim()) {
      onShowToast('Store wajib mengisi No. ID Form Alter secara manual', 'error');
      return;
    }

    if (!formPicPemohon.trim()) {
      onShowToast('Nama PIC Store / SA wajib diisi', 'error');
      return;
    }

    if (!formPicStorePhone.trim()) {
      onShowToast('No. HP / WhatsApp PIC Store wajib diisi', 'error');
      return;
    }

    if (formTujuanPengembalian === 'customer') {
      if (!formCustomerNama.trim() || !formCustomerHp.trim() || !formCustomerAlamat.trim()) {
        onShowToast('Nama, No. WhatsApp, dan Alamat Customer wajib diisi lengkap jika memilih kirim ke Customer', 'error');
        return;
      }
      if (formJasaKirimCustomer === 'Custom / Ekspedisi Lainnya' && !formCustomJasaKirim.trim()) {
        onShowToast('Nama ekspedisi custom wajib diisi jika memilih opsi Custom', 'error');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const isWarehouseStock = formSource === 'warehouse';
      const initialStage: AlterationFlowStage = isWarehouseStock ? 'diterima_warehouse' : 'diajukan';
      const regNo = generateRegistrationNo(formSource, formOutlet);
      const finalIdFormAlter = isWarehouseStock
        ? (formIdFormAlter.trim() || generateAutoWarehouseId())
        : formIdFormAlter.trim();
      const asalDisplayName = formOutlet || (session?.divisi || 'Store');

      const effectiveCourierCustomer = formJasaKirimCustomer === 'Custom / Ekspedisi Lainnya'
        ? (formCustomJasaKirim.trim() || 'Custom Courier')
        : formJasaKirimCustomer;

      const initialLog: AlterationFlowLog = {
        id: `flow-${Date.now()}`,
        stage: initialStage,
        timestamp: new Date().toISOString(),
        actor_name: formPicPemohon.trim() || 'PIC Store',
        actor_role: 'Store PIC',
        notes: isWarehouseStock
          ? `Request Pembelian Customer dari Stok Gudang (${formItems.length} items). Store: ${asalDisplayName} (PIC: ${formPicPemohon.trim()}, WA: ${formPicStorePhone.trim()}) - ID: ${finalIdFormAlter}`
          : `Request dibuat oleh Store ${asalDisplayName} (${formItems.length} items, PIC: ${formPicPemohon.trim()}, WA: ${formPicStorePhone.trim()}) - ID Form Alter: ${finalIdFormAlter} - Menunggu pengiriman fisik ke Gudang`,
      };

      // Construct Multi-item payload
      const orderItems: ManualShipmentItem[] = formItems.map((it, idx) => ({
        id: `item-${idx + 1}-${Date.now()}`,
        sku: it.sku.trim() || 'ALTER-REPAIR',
        nama_produk: it.nama_produk.trim(),
        size: it.size || '-',
        qty: Number(it.qty) || 1,
        fulfillment: isWarehouseStock ? 'Warehouse (Stok Gudang)' : asalDisplayName,
        layanan_type: it.layanan_type,
        kondisi: it.kondisi.trim(),
        alteration_detail: it.alteration_detail.trim(),
        repair_detail: it.repair_detail.trim(),
      }));

      // Dominant / Overall Layanan Type
      const hasAlter = formItems.some((it) => it.layanan_type === 'alteration' || it.layanan_type === 'both');
      const hasRepair = formItems.some((it) => it.layanan_type === 'repair' || it.layanan_type === 'both');
      const overallLayanan: AlterationLayananType = (hasAlter && hasRepair) ? 'both' : hasRepair ? 'repair' : 'alteration';

      const primaryProductName = formItems.length === 1
        ? formItems[0].nama_produk.trim()
        : `${formItems[0].nama_produk.trim()} (+ ${formItems.length - 1} pakaian lainnya)`;

      const combinedSku = formItems.map((it) => it.sku.trim()).filter(Boolean).join(', ') || '-';
      const totalQty = formItems.reduce((sum, it) => sum + (Number(it.qty) || 1), 0);

      const combinedAlterDetails = formItems
        .filter((it) => it.alteration_detail?.trim())
        .map((it, idx) => `${formItems.length > 1 ? `[#${idx + 1} ${it.nama_produk}]: ` : ''}${it.alteration_detail.trim()}`)
        .join('\n');

      const combinedRepairDetails = formItems
        .filter((it) => it.repair_detail?.trim())
        .map((it, idx) => `${formItems.length > 1 ? `[#${idx + 1} ${it.nama_produk}]: ` : ''}${it.repair_detail.trim()}`)
        .join('\n');

      const combinedKondisi = formItems.map((it, idx) => `${formItems.length > 1 ? `#${idx + 1}: ` : ''}${it.kondisi}`).join(', ');

      const arData: AlterationRepairData = {
        layanan_type: overallLayanan,
        id_form_alter: finalIdFormAlter,
        sumber_barang: formSource,
        nama_asal: asalDisplayName,
        pic_pemohon: formPicPemohon.trim() || 'PIC Pemohon',
        pic_store_phone: formPicStorePhone.trim(),
        pic_store_email: formPicStoreEmail.trim() || undefined,
        lokasi_rak: isWarehouseStock ? formWarehouseRak.trim() : '',
        nama_customer: formCustomerNama.trim(),
        nama_sa: formPicPemohon.trim(),
        no_hp: formCustomerHp.trim() || formPicStorePhone.trim(),
        toko: asalDisplayName,
        nama_produk: primaryProductName,
        sku: combinedSku,
        size: formItems.length === 1 ? formItems[0].size : 'MULTI',
        qty: totalQty,
        kondisi: combinedKondisi,
        perkiraan_selesai: formPerkiraanSelesai.trim(),
        alteration_detail: combinedAlterDetails,
        repair_detail: combinedRepairDetails,
        pic_warehouse: '',
        status_flow: initialStage,
        flow_logs: [initialLog],
        foto_urls: formFotoUrls,
        tujuan_pengembalian: formTujuanPengembalian,
        nama_penerima_kembali: formTujuanPengembalian === 'customer' ? (formCustomerNama.trim() || 'Customer') : asalDisplayName,
        no_telp_penerima_kembali: formTujuanPengembalian === 'customer' ? formCustomerHp.trim() : formPicStorePhone.trim(),
        alamat_penerima_kembali: formTujuanPengembalian === 'customer' ? formCustomerAlamat.trim() : `Outlet Store (${asalDisplayName})`,
        jasa_kirim_customer: formTujuanPengembalian === 'customer' ? effectiveCourierCustomer : undefined,
        notes_pengiriman_customer: formNotesPaket.trim() || undefined,
      };

      const newOrderPayload: ManualShipmentOrder = {
        no_pesanan: regNo,
        order_type: 'alteration_repair',
        nama_pengirim: asalDisplayName,
        pic_store: formPicPemohon.trim(),
        no_telp_store: formPicStorePhone.trim(),
        no_transaksi_pengirim: formRefNo ? [formRefNo.trim()] : (finalIdFormAlter ? [finalIdFormAlter] : []),
        nama_tujuan: formTujuanPengembalian === 'customer' ? (formCustomerNama.trim() || 'Customer') : `Store (${asalDisplayName})`,
        no_telp_tujuan: formTujuanPengembalian === 'customer' ? formCustomerHp.trim() : formPicStorePhone.trim(),
        alamat_tujuan: formCustomerAlamat.trim() || (formTujuanPengembalian === 'customer' ? 'Alamat Pengiriman Customer' : `Outlet Store (${asalDisplayName})`),
        notes_paket: `[ALTER & REPAIR - ${finalIdFormAlter}] ${primaryProductName} ${isWarehouseStock ? '(Stok Warehouse)' : '(Fisik Store)'}${formNotesPaket ? ` [Notes: ${formNotesPaket.trim()}]` : ''}`,
        no_transaksi_customer: formRefNo.trim() || finalIdFormAlter || regNo,
        jasa_kirim: formTujuanPengembalian === 'customer' ? effectiveCourierCustomer : (isWarehouseStock ? 'Warehouse Courier / Ekspedisi' : 'Store Courier / Ekspedisi'),
        items: orderItems,
        alteration_repair_data: arData,
        layanan_type: overallLayanan,
        kondisi: combinedKondisi,
        perkiraan_selesai: formPerkiraanSelesai.trim(),
        alteration_detail: combinedAlterDetails,
        repair_detail: combinedRepairDetails,
        foto_urls: formFotoUrls,
        status: 'diterima',
        created_at: new Date().toISOString(),
        submitted_by: formPicPemohon.trim() || session?.name || session?.username || 'Staff',
      };

      const res = await submitManualShipment(newOrderPayload);
      if (res.success) {
        onShowToast(
          isWarehouseStock
            ? `Tiket ${regNo} (${finalIdFormAlter}) berhasil dibuat! (${formItems.length} produk). Masuk antrian Warehouse.`
            : `Tiket ${regNo} (${finalIdFormAlter}) berhasil didaftarkan! (${formItems.length} produk). Silakan cetak Surat Jalan Struk.`,
          'success'
        );

        // OTOMATIS FONNTE: Kirim notifikasi WhatsApp ke PIC Store & Grup Tim Penjahit
        const fonnteCfg = getFonnteConfig();
        if (fonnteCfg.token) {
          const photoText = formFotoUrls.length > 0
            ? `\n📸 *Foto Panduan (Google Drive):*\n` + formFotoUrls.map((u, i) => `  ${i + 1}. ${u}`).join('\n')
            : '';

          const itemsText = formItems.map((it, idx) => `*${idx + 1}. ${it.nama_produk}* (SKU: \`${it.sku || '-'}\`, Size: *${it.size || '-'}\`, Qty: *${it.qty || 1} pcs*)
   • Layanan: *${it.layanan_type || 'Alteration'}*
   • Instruksi: _${it.alteration_detail || it.repair_detail || 'Sesuai standar'}_`).join('\n\n');

          const alterWaMsg = `✂️ *PERMINTAAN ALTER & REPAIR MASUK [${regNo}]*
--------------------------------------------------
Halo Tim Gudang & Penjahit, terdapat pendaftaran tiket alterasi/repair baru:

📋 *Detail Tiket:*
• *No. Tiket / Registrasi:* ${regNo}
• *ID Form Alter:* *${finalIdFormAlter}*
• *Sumber Barang:* ${isWarehouseStock ? 'Warehouse / Gudang' : `Store (${asalDisplayName})`}
• *PIC Pemohon:* ${formPicPemohon.trim()} (WA: ${formPicStorePhone.trim() || '-'})
• *Penerima Selesai:* ${formTujuanPengembalian === 'customer' ? `Customer (${formCustomerNama})` : `Outlet Store (${asalDisplayName})`}
• *Estimasi Selesai:* ${formPerkiraanSelesai || '7 Hari'}

✂️ *Daftar Produk (${formItems.length} Item):*
${itemsText}${photoText}

📝 *Catatan:* ${formNotesPaket.trim() || '-'}

Mohon tim penjahit segera memeriksa detail instruksi & foto panduan di atas.
_WMS Warehouse & Alteration System_`;

          if (formPicStorePhone.trim()) {
            sendFonnteMessage(formPicStorePhone.trim(), alterWaMsg, fonnteCfg.token).catch(() => {});
          }
          if (fonnteCfg.groupTarget) {
            sendFonnteMessage(fonnteCfg.groupTarget, alterWaMsg, fonnteCfg.token)
              .then((resF) => {
                if (resF.success) onShowToast('✅ Notif SPK Alterasi berhasil dikirim ke Grup WA via Fonnte!', 'success');
              })
              .catch(() => {});
          }
        }

        // Reset form to default single item
        setFormItems([createDefaultItem()]);
        setFormIdFormAlter('');
        setFormRefNo('');
        setFormCustomerNama('');
        setFormCustomerHp('');
        setFormCustomerAlamat('');
        setFormNotesPaket('');
        setFormCustomJasaKirim('');
        setFormFotoUrls([]);
        setShowCreateModal(false);

        // Open Submission Summary Notification Modal
        setSubmittedSummaryOrder(newOrderPayload);

        // Refresh orders
        if (onOrdersUpdated) {
          onOrdersUpdated();
        } else {
          fetchOrdersDirectly();
        }

        if (onOrderSaved) {
          onOrderSaved(newOrderPayload);
        }
      } else {
        onShowToast(res.message || 'Gagal menyimpan request', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Terjadi kesalahan sistem', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle open flow update modal
  const handleOpenFlowUpdate = (order: ManualShipmentOrder) => {
    setSelectedOrderForFlow(order);
    const currStage = order.alteration_repair_data?.status_flow || 'diajukan';

    // Suggest next stage in sequence
    const currIdx = FLOW_STAGES.findIndex((s) => s.key === currStage);
    const nextIdx = currIdx >= 0 && currIdx < FLOW_STAGES.length - 1 ? currIdx + 1 : currIdx;
    setNextStage(FLOW_STAGES[nextIdx]?.key || 'diterima_warehouse');
    setFlowNotes('');
    setFlowPicWarehouse(order.alteration_repair_data?.pic_warehouse || session?.name || session?.username || '');
  };

  // Submit flow stage update
  const handleSaveFlowUpdate = async () => {
    if (!selectedOrderForFlow) return;

    setIsUpdatingFlow(true);
    try {
      const actor = flowPicWarehouse.trim() || session?.name || session?.username || 'Tim Warehouse';
      const res = await updateAlterationFlowStage(
        selectedOrderForFlow,
        nextStage,
        actor,
        flowNotes.trim(),
        flowPicWarehouse.trim()
      );

      if (res.success) {
        onShowToast(`Status flow berhasil diperbarui ke tahap: ${nextStage}`, 'success');
        setSelectedOrderForFlow(null);

        // Refresh
        if (onOrdersUpdated) {
          onOrdersUpdated();
        } else {
          fetchOrdersDirectly();
        }
      } else {
        onShowToast(res.message || 'Gagal update status flow', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Gagal memperbarui status', 'error');
    } finally {
      setIsUpdatingFlow(false);
    }
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* ==================================================== */}
      {/* HEADER SECTION: Title & Actions */}
      {/* ==================================================== */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-md shadow-indigo-600/20">
              <Scissors className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>Alteration & Repair Tracking</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 font-bold">
                  Warehouse Operations
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Monitoring alur pengerjaan alter & repair barang oleh Warehouse (Sumber Store & Internal Gudang)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => {
              if (onOrdersUpdated) onOrdersUpdated();
              else fetchOrdersDirectly();
            }}
            disabled={isLoadingOrders}
            className="p-2 sm:px-3 sm:py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoadingOrders ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="flex-1 sm:flex-none px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md shadow-indigo-600/20 hover:shadow-indigo-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>+ Buat Request Baru</span>
          </button>
        </div>
      </div>

      {/* ==================================================== */}
      {/* SUMMARY STATS BAR (PIPELINE COUNTER) */}
      {/* ==================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <div 
          onClick={() => setFilterStage('all')}
          className={`p-3 rounded-xl border transition-all cursor-pointer ${
            filterStage === 'all'
              ? 'bg-slate-900 dark:bg-slate-800 text-white border-slate-900 shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-slate-300'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider opacity-75">Total Tiket</div>
          <div className="text-xl font-black mt-1">{metrics.total}</div>
          <div className="text-[10px] opacity-75 mt-0.5">Semua antrian</div>
        </div>

        <div 
          onClick={() => setFilterStage('diajukan')}
          className={`p-3 rounded-xl border transition-all cursor-pointer ${
            filterStage === 'diajukan'
              ? 'bg-amber-600 text-white border-amber-600 shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-amber-300'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">1. Diajukan</div>
          <div className="text-xl font-black mt-1 text-amber-700 dark:text-amber-300">{metrics.diajukan}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Menunggu gudang</div>
        </div>

        <div 
          onClick={() => setFilterStage('diterima_warehouse')}
          className={`p-3 rounded-xl border transition-all cursor-pointer ${
            filterStage === 'diterima_warehouse'
              ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-blue-300'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">2. Diterima</div>
          <div className="text-xl font-black mt-1 text-blue-700 dark:text-blue-300">{metrics.diterimaWarehouse}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Tiba di gudang</div>
        </div>

        <div 
          onClick={() => setFilterStage('dalam_pengerjaan')}
          className={`p-3 rounded-xl border transition-all cursor-pointer ${
            filterStage === 'dalam_pengerjaan'
              ? 'bg-purple-600 text-white border-purple-600 shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-purple-300'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">3. Pengerjaan</div>
          <div className="text-xl font-black mt-1 text-purple-700 dark:text-purple-300">{metrics.dalamPengerjaan}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Sedang dialter</div>
        </div>

        <div 
          onClick={() => setFilterStage('selesai_qc')}
          className={`p-3 rounded-xl border transition-all cursor-pointer ${
            filterStage === 'selesai_qc'
              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-indigo-300'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">4. Selesai QC</div>
          <div className="text-xl font-black mt-1 text-indigo-700 dark:text-indigo-300">{metrics.selesaiQc}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Lolos verifikasi QC</div>
        </div>

        <div 
          onClick={() => setFilterStage('selesai')}
          className={`p-3 rounded-xl border transition-all cursor-pointer ${
            filterStage === 'selesai'
              ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm'
              : 'bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:border-emerald-300'
          }`}
        >
          <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">5-6. Siap / Selesai</div>
          <div className="text-xl font-black mt-1 text-emerald-700 dark:text-emerald-300">{metrics.siapKirim + metrics.selesai}</div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Selesai dikerjakan</div>
        </div>
      </div>

      {/* ==================================================== */}
      {/* FILTER & SEARCH BAR */}
      {/* ==================================================== */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3.5 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari SKU, Nama Produk, No Tiket, PIC, Toko..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Source Filter */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs font-semibold shrink-0">
            <button
              type="button"
              onClick={() => setFilterSource('all')}
              className={`px-2.5 py-1 rounded-lg transition-all ${
                filterSource === 'all'
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              Semua Asal
            </button>
            <button
              type="button"
              onClick={() => setFilterSource('store')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                filterSource === 'store'
                  ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Building2 className="w-3 h-3" />
              <span>Dari Store</span>
            </button>
            <button
              type="button"
              onClick={() => setFilterSource('warehouse')}
              className={`px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
                filterSource === 'warehouse'
                  ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-xs font-bold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
              }`}
            >
              <Warehouse className="w-3 h-3" />
              <span>Dari Warehouse</span>
            </button>
          </div>

          {/* Service filter */}
          <select
            value={filterService}
            onChange={(e) => setFilterService(e.target.value as any)}
            className="text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-700 dark:text-slate-200 font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="all">Semua Layanan</option>
            <option value="alteration">✂️ Alteration</option>
            <option value="repair">🔧 Repair</option>
            <option value="both">✂️+🔧 Both</option>
          </select>
        </div>
      </div>

      {/* ==================================================== */}
      {/* TICKET CARDS LIST (FLOW TRACKING BOARD) */}
      {/* ==================================================== */}
      <div className="space-y-3">
        {filteredOrders.length === 0 ? (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-10 text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-500 flex items-center justify-center mx-auto">
              <Scissors className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-white">
              Tidak Ada Tiket Alteration & Repair
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
              {searchQuery || filterSource !== 'all' || filterStage !== 'all' || filterService !== 'all'
                ? 'Tidak ada tiket yang sesuai dengan filter atau kata kunci pencarian.'
                : 'Belum ada permintaan alter/repair yang terdaftar. Klik tombol "+ Buat Request Baru" untuk mendaftarkan barang.'}
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Buat Request Baru</span>
            </button>
          </div>
        ) : (
          filteredOrders.map((order) => {
            const ar = order.alteration_repair_data;
            const sumber = ar?.sumber_barang || (order.nama_pengirim?.toLowerCase().includes('gudang') ? 'warehouse' : 'store');
            const asalName = ar?.nama_asal || order.nama_pengirim || 'Store';
            const currentStageKey = (ar?.status_flow || 'diajukan') as AlterationFlowStage;
            const stageConfig = FLOW_STAGES.find((s) => s.key === currentStageKey) || FLOW_STAGES[0];
            const currentStepIdx = FLOW_STAGES.findIndex((s) => s.key === currentStageKey);

            const item = order.items?.[0];
            const productName = item?.nama_produk || 'Produk Pakaian';
            const sku = item?.sku || '-';
            const size = item?.size || '-';
            const qty = item?.qty || 1;

            const picPemohon = ar?.pic_pemohon || order.pic_store || order.submitted_by || 'PIC';
            const picWarehouse = ar?.pic_warehouse || 'Belum Ditugaskan';
            const logs = Array.isArray(ar?.flow_logs) ? ar.flow_logs : [];
            const lastLog = logs.length > 0 ? logs[logs.length - 1] : null;

            return (
              <div
                key={order.no_pesanan || order.id}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-800/80 rounded-2xl p-4 sm:p-5 shadow-xs transition-all space-y-4"
              >
                {/* Header Ticket Card */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-black text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700">
                      {order.no_pesanan}
                    </span>

                    {/* Source Badge */}
                    {sumber === 'warehouse' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                        <Warehouse className="w-3 h-3" />
                        <span>Stok Gudang (Order Toko: {asalName})</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                        <Store className="w-3 h-3" />
                        <span>Fisik dari Store: {asalName}</span>
                      </span>
                    )}

                    {ar?.nama_customer && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                        <User className="w-3 h-3 text-slate-500" />
                        <span>Cust: <strong>{ar.nama_customer}</strong></span>
                      </span>
                    )}

                    {/* Service Type Badge */}
                    {ar?.layanan_type === 'alteration' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                        <Scissors className="w-3 h-3" />
                        <span>Alteration</span>
                      </span>
                    ) : ar?.layanan_type === 'repair' ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        <Wrench className="w-3 h-3" />
                        <span>Repair</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                        <Scissors className="w-3 h-3" />
                        <span>Alter & Repair</span>
                      </span>
                    )}
                  </div>

                  {/* Current Stage Badge & Date */}
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${stageConfig.badgeClass}`}>
                      {stageConfig.label}
                    </span>
                    {order.perkiraan_selesai && (
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        <span>Target: <strong>{order.perkiraan_selesai}</strong></span>
                      </span>
                    )}
                  </div>
                </div>

                {/* VISUAL FLOW STEPPER (6 Stages) */}
                <div className="py-1">
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 sm:gap-2">
                    {FLOW_STAGES.map((step, idx) => {
                      const isPast = idx < currentStepIdx;
                      const isCurrent = idx === currentStepIdx;

                      return (
                        <div
                          key={step.key}
                          className={`p-2 rounded-xl border text-center transition-all ${
                            isCurrent
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm ring-2 ring-indigo-500/30'
                              : isPast
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60 font-semibold'
                              : 'bg-slate-50 dark:bg-slate-800/40 text-slate-400 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1 text-[10px] font-bold mb-0.5">
                            {isPast ? (
                              <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 inline" />
                            ) : (
                              <span>Step {step.stepNum}</span>
                            )}
                          </div>
                          <div className="text-[11px] font-black leading-tight truncate">
                            {step.shortLabel}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Details Section */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs bg-slate-50 dark:bg-slate-800/40 p-3 sm:p-3.5 rounded-xl border border-slate-100 dark:border-slate-800">
                  {/* Product Info */}
                  <div className="space-y-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Produk & SKU</span>
                    <div className="font-black text-slate-900 dark:text-white text-sm leading-snug">
                      {productName}
                    </div>
                    <div className="text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                      SKU: <strong className="text-indigo-600 dark:text-indigo-400">{sku}</strong>
                    </div>
                    <div className="text-slate-600 dark:text-slate-300 text-[11px]">
                      Size: <strong>{size}</strong> • Qty: <strong>{qty} pcs</strong>
                    </div>
                    {order.kondisi && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 pt-0.5">
                        Kondisi: <em>{order.kondisi}</em>
                      </div>
                    )}
                  </div>

                  {/* Instructions */}
                  <div className="space-y-1 md:col-span-1">
                    <span className="text-[10px] uppercase font-bold text-slate-400 block">Instruksi Pengerjaan Gudang</span>
                    {order.alteration_detail && (
                      <div className="p-2 rounded-lg bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/60 dark:border-indigo-800/40 text-[11px] text-indigo-950 dark:text-indigo-200 leading-relaxed">
                        <strong className="block text-indigo-700 dark:text-indigo-400 font-bold mb-0.5">✂️ Alteration:</strong>
                        {order.alteration_detail}
                      </div>
                    )}
                    {order.repair_detail && (
                      <div className="p-2 rounded-lg bg-amber-50/70 dark:bg-amber-950/40 border border-amber-200/60 dark:border-amber-800/40 text-[11px] text-amber-950 dark:text-amber-200 leading-relaxed mt-1">
                        <strong className="block text-amber-700 dark:text-amber-400 font-bold mb-0.5">🔧 Repair:</strong>
                        {order.repair_detail}
                      </div>
                    )}
                    {!order.alteration_detail && !order.repair_detail && (
                      <div className="text-slate-400 italic text-[11px]">Tidak ada instruksi khusus tertulis</div>
                    )}
                  </div>

                  {/* PIC & Last Progress Log */}
                  <div className="space-y-1.5 flex flex-col justify-between">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 block">Petugas & PIC</span>
                      <div className="text-[11px] text-slate-700 dark:text-slate-300">
                        PIC Pemohon: <strong>{picPemohon}</strong>
                      </div>
                      <div className="text-[11px] text-slate-700 dark:text-slate-300">
                        Penjahit/Warehouse: <strong>{picWarehouse}</strong>
                      </div>
                    </div>

                    {lastLog && (
                      <div className="p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[10px] text-slate-600 dark:text-slate-400">
                        <span className="font-bold text-slate-800 dark:text-slate-200 block truncate">
                          Log Terakhir: {lastLog.notes || `Update ke ${lastLog.stage}`}
                        </span>
                        <span className="text-[9px] text-slate-400 block">
                          oleh {lastLog.actor_name} • {new Date(lastLog.timestamp).toLocaleString('id-ID', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                    )}

                    {/* Photos thumbnails */}
                    {ar?.foto_urls && ar.foto_urls.length > 0 && (
                      <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                        {ar.foto_urls.map((fUrl, fIdx) => (
                          <img
                            key={fIdx}
                            src={fUrl}
                            alt=""
                            onClick={() => setPreviewPhotoUrl(fUrl)}
                            className="w-8 h-8 rounded-md object-cover border border-slate-200 cursor-pointer hover:opacity-80 transition-opacity shrink-0"
                          />
                        ))}
                        <span className="text-[10px] text-slate-400">({ar.foto_urls.length} foto)</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* DealPOS Delivery to Store Banner & Received Action */}
                {ar?.no_delivery_dealpos && (
                  <div className={`p-2.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
                    ar.status_dealpos_received
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                      : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-800 text-indigo-950 dark:text-indigo-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <div className={`p-1.5 rounded-lg ${ar.status_dealpos_received ? 'bg-emerald-600 text-white' : 'bg-indigo-600 text-white'}`}>
                        {ar.status_dealpos_received ? <CheckCircle2 className="w-4 h-4" /> : <Truck className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="font-bold flex items-center gap-1.5">
                          <span>Delivery DealPOS: <strong className="font-mono">{ar.no_delivery_dealpos}</strong></span>
                          {ar.status_dealpos_received ? (
                            <span className="bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-200 text-[10px] px-1.5 py-0.2 rounded font-bold">
                              TELAH DITERIMA (RECEIVED)
                            </span>
                          ) : (
                            <span className="bg-amber-100 dark:bg-amber-900 text-amber-900 dark:text-amber-200 text-[10px] px-1.5 py-0.2 rounded font-bold">
                              MENUNGGU TERIMA STORE
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] opacity-80">
                          {ar.status_dealpos_received ? (
                            <span>Diterima oleh PIC Store: <strong>{ar.pic_dealpos_receiver || 'PIC Store'}</strong> ({ar.tgl_dealpos_received || '-'})</span>
                          ) : (
                            <span>Diinput oleh Admin Warehouse. Menunggu PIC Store melakukan konfirmasi terima.</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {!ar.status_dealpos_received && (
                      <button
                        type="button"
                        onClick={() => setActionModalData({ order, actionType: 'mark_dealpos_received' })}
                        className="px-3 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 active:scale-95"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>Konfirmasi Terima di Store (Received)</span>
                      </button>
                    )}
                  </div>
                )}

                {/* Card Actions Footer */}
                <div className="flex items-center justify-between flex-wrap gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Tombol Cetak SJ Struk Rangkap 2 */}
                    <button
                      type="button"
                      onClick={() => setSjStrukModalOrder(order)}
                      className="px-2.5 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 border border-amber-300 dark:border-amber-700/80 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      title="Cetak Surat Jalan Format Struk Kasir Rangkap 2 (Store & Fisik Baju)"
                    >
                      <Printer className="w-3.5 h-3.5 text-amber-600" />
                      <span>SJ Struk (Rangkap 2)</span>
                    </button>

                    {/* Tombol Cetak SPK Work Order */}
                    <button
                      type="button"
                      onClick={() => setSpkModalOrder(order)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                      title="Cetak Surat Perintah Kerja (SPK) Internal Gudang"
                    >
                      <FileText className="w-3.5 h-3.5 text-indigo-500" />
                      <span className="hidden sm:inline">SPK Gudang</span>
                    </button>

                    {/* Tombol Timeline */}
                    <button
                      type="button"
                      onClick={() => setTimelineOrder(order)}
                      className="px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5 text-slate-500" />
                      <span>Timeline ({logs.length})</span>
                    </button>
                  </div>

                  {/* Contextual Action Buttons (2-Way Flow) */}
                  <div className="flex items-center gap-2">
                    {/* Aksi 1: Toko Kirim ke Gudang */}
                    {currentStageKey === 'diajukan' && (
                      <button
                        type="button"
                        onClick={() => setActionModalData({ order, actionType: 'mark_sent_store' })}
                        className="px-3.5 py-1.5 text-xs font-bold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        <span>Kirim ke Warehouse</span>
                      </button>
                    )}

                    {/* Aksi 2: Gudang Terima Barang */}
                    {(currentStageKey === 'dikirim_store' || currentStageKey === 'diajukan') && (
                      <button
                        type="button"
                        onClick={() => setActionModalData({ order, actionType: 'mark_received_warehouse' })}
                        className="px-3.5 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>Terima di Warehouse</span>
                      </button>
                    )}

                    {/* Aksi 3: Selesai & Kirim Bukti */}
                    {(currentStageKey === 'dalam_pengerjaan' || currentStageKey === 'selesai_qc') && (
                      <button
                        type="button"
                        onClick={() => setActionModalData({ order, actionType: 'complete_and_ship' })}
                        className="px-3.5 py-1.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Selesai & Bukti Kirim</span>
                      </button>
                    )}

                    {/* Aksi 4: Konfirmasi Received jika ada dealpos dan belum received */}
                    {ar?.no_delivery_dealpos && !ar?.status_dealpos_received && (
                      <button
                        type="button"
                        onClick={() => setActionModalData({ order, actionType: 'mark_dealpos_received' })}
                        className="px-3 py-1.5 text-xs font-bold bg-teal-600 hover:bg-teal-500 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                      >
                        <PackageCheck className="w-3.5 h-3.5" />
                        <span>Receive di Store</span>
                      </button>
                    )}

                    {/* Aksi 5: Notifikasi WA */}
                    {(currentStageKey === 'dikirim_kembali' || currentStageKey === 'selesai') && (
                      <button
                        type="button"
                        onClick={() => setActionModalData({ order, actionType: 'complete_and_ship' })}
                        className="px-3 py-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>WA Bukti Kirim</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => handleOpenFlowUpdate(order)}
                      className="px-3 py-1.5 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <span>Update Flow</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ==================================================== */}
      {/* MODAL 1: UPDATE STATUS FLOW DIALOG */}
      {/* ==================================================== */}
      {selectedOrderForFlow && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-600 text-white">
                  <Scissors className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Update Tahapan Flow Alteration & Repair
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    No. Tiket: {selectedOrderForFlow.no_pesanan}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrderForFlow(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {/* Product recap */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white text-xs">
                  {selectedOrderForFlow.items?.[0]?.nama_produk}
                </div>
                <div className="text-slate-500 text-[11px]">
                  Asal: <strong>{selectedOrderForFlow.alteration_repair_data?.nama_asal || selectedOrderForFlow.nama_pengirim}</strong> • SKU: {selectedOrderForFlow.items?.[0]?.sku}
                </div>
              </div>

              {/* Stage selector */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Pilih Tahapan Progres Baru:
                </label>
                <div className="space-y-1.5">
                  {FLOW_STAGES.map((s) => {
                    const isSelected = nextStage === s.key;
                    return (
                      <div
                        key={s.key}
                        onClick={() => setNextStage(s.key)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                          isSelected
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-900 dark:text-indigo-200 font-bold shadow-xs'
                            : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="text-xs">{s.label}</div>
                          <div className="text-[10px] text-slate-400">{s.description}</div>
                        </div>
                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'}`}>
                          {isSelected && <Check className="w-2.5 h-2.5" />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Warehouse PIC */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Petugas / Penjahit Warehouse:
                </label>
                <input
                  type="text"
                  value={flowPicWarehouse}
                  onChange={(e) => setFlowPicWarehouse(e.target.value)}
                  placeholder="Nama penjahit / operator gudang..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 font-semibold"
                />
              </div>

              {/* Progress Note */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Catatan Progres Pengerjaan:
                </label>
                <textarea
                  value={flowNotes}
                  onChange={(e) => setFlowNotes(e.target.value)}
                  rows={3}
                  placeholder="Contoh: Sudah selesai dipotong 4cm, sedang proses obras keliman bawah..."
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-none"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSelectedOrderForFlow(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveFlowUpdate}
                disabled={isUpdatingFlow}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isUpdatingFlow ? 'Menyimpan...' : 'Simpan Update Flow'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 2: TIMELINE RIWAYAT LENGKAP */}
      {/* ==================================================== */}
      {timelineOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-slate-800 text-white">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Timeline Riwayat Alur Pengerjaan
                  </h3>
                  <p className="text-[11px] text-slate-500 font-mono">
                    No. Tiket: {timelineOrder.no_pesanan}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTimelineOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 max-h-[65vh] overflow-y-auto space-y-4">
              {(!timelineOrder.alteration_repair_data?.flow_logs || timelineOrder.alteration_repair_data.flow_logs.length === 0) ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  Belum ada catatan riwayat flow.
                </div>
              ) : (
                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200 dark:before:bg-slate-700">
                  {timelineOrder.alteration_repair_data.flow_logs.map((log, lIdx) => {
                    const stConfig = FLOW_STAGES.find((s) => s.key === log.stage) || { label: log.stage, badgeClass: '' };
                    return (
                      <div key={log.id || lIdx} className="relative group text-xs">
                        {/* Dot indicator */}
                        <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-indigo-600 border-2 border-white dark:border-slate-900 shadow-xs" />
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-1">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 dark:text-white">
                              {stConfig.label}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(log.timestamp).toLocaleString('id-ID')}
                            </span>
                          </div>
                          <div className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold">
                            Operator / PIC: {log.actor_name} {log.actor_role ? `(${log.actor_role})` : ''}
                          </div>
                          {log.notes && (
                            <p className="text-slate-700 dark:text-slate-300 text-[11px] pt-1 border-t border-slate-200/50 dark:border-slate-700/50">
                              {log.notes}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-right">
              <button
                type="button"
                onClick={() => setTimelineOrder(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 3: INPUT FORM REQUEST BARU */}
      {/* ==================================================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[92vh] flex flex-col overflow-hidden my-auto">
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/90 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-indigo-600 text-white shadow-xs">
                  <Scissors className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Pendaftaran Request Alteration & Repair Baru
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Input tiket pengerjaan untuk tim perbaikan Warehouse
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleSubmitNewRequest} className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
              {/* 1. ASAL / SUMBER FISIK BARANG */}
              <div className="p-3.5 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="font-extrabold text-indigo-950 dark:text-indigo-200 text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Sumber Fisik Barang:</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-medium">Pilih skenario asal barang</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setFormSource('store');
                      if (formIdFormAlter.startsWith('ALT-WH-')) setFormIdFormAlter('');
                    }}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-start gap-0.5 transition-all cursor-pointer text-left ${
                      formSource === 'store'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <Store className="w-3.5 h-3.5 shrink-0" />
                      <span>1. Fisik dari Store / Toko</span>
                    </div>
                    <span className={`text-[10px] ${formSource === 'store' ? 'text-indigo-100' : 'text-slate-400'}`}>
                      Barang dari toko, dikirim ke gudang
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setFormSource('warehouse');
                      if (!formIdFormAlter || !formIdFormAlter.startsWith('ALT-WH-')) {
                        setFormIdFormAlter(generateAutoWarehouseId());
                      }
                    }}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold flex flex-col items-start gap-0.5 transition-all cursor-pointer text-left ${
                      formSource === 'warehouse'
                        ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 font-bold">
                      <Warehouse className="w-3.5 h-3.5 shrink-0" />
                      <span>2. Ambil Stok Gudang</span>
                    </div>
                    <span className={`text-[10px] ${formSource === 'warehouse' ? 'text-purple-100' : 'text-slate-400'}`}>
                      Pembelian customer sekalian di-alter
                    </span>
                  </button>
                </div>

                {/* Sub-inputs: ID Form Alter & PIC Store Contacts */}
                <div className="space-y-2.5 pt-1">
                  {/* ID Form Alter: Store (Manual) vs Warehouse (Otomatis) */}
                  {formSource === 'store' ? (
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                        <span>No. ID Form Alter (Diisi Manual oleh Store) *</span>
                        <span className="text-[10px] font-normal text-rose-500">Wajib Diisi Manual</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formIdFormAlter || ''}
                        onChange={(e) => setFormIdFormAlter(e.target.value)}
                        placeholder="Contoh: ALT/CP/2026/001 atau No. Form Fisik Store..."
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-indigo-300 dark:border-indigo-700 rounded-xl text-slate-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold text-purple-900 dark:text-purple-300 mb-1 flex items-center justify-between">
                        <span>No. ID Form Alter (Otomatis Dibuat Sistem):</span>
                        <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/60 px-1.5 py-0.5 rounded">
                          AUTO-GENERATED
                        </span>
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          readOnly
                          value={formIdFormAlter || ''}
                          className="w-full px-2.5 py-1.5 bg-purple-50 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-800 rounded-xl text-purple-950 dark:text-purple-200 font-mono font-bold text-xs cursor-not-allowed"
                        />
                        <button
                          type="button"
                          onClick={() => setFormIdFormAlter(generateAutoWarehouseId())}
                          className="px-2.5 py-1.5 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900 dark:hover:bg-purple-800 text-purple-700 dark:text-purple-200 rounded-xl text-[10px] font-bold shrink-0 transition-colors"
                          title="Generate Ulang ID"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Store & PIC Name */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Store / Outlet Pengirim:
                      </label>
                      <select
                        value={formOutlet || (outlets.length > 0 ? outlets[0].nama : DEFAULT_OUTLETS[0].nama)}
                        onChange={(e) => setFormOutlet(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-indigo-500 text-xs"
                      >
                        {(outlets.length > 0 ? outlets : DEFAULT_OUTLETS).map((o) => (
                          <option key={o.nama} value={o.nama}>
                            {o.nama}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        PIC Store / SA *
                      </label>
                      <input
                        type="text"
                        required
                        value={formPicPemohon || ''}
                        onChange={(e) => setFormPicPemohon(e.target.value)}
                        placeholder="Nama SA / PIC Store..."
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                  </div>

                  {/* No HP PIC Store & Email PIC Store */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <Phone className="w-3 h-3 text-emerald-600" />
                        <span>No. HP / WhatsApp PIC Store *</span>
                      </label>
                      <input
                        type="tel"
                        required
                        value={formPicStorePhone || ''}
                        onChange={(e) => setFormPicStorePhone(e.target.value)}
                        placeholder="0812xxxx (Untuk notifikasi submit & update)..."
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-indigo-500 text-xs font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                        <Mail className="w-3 h-3 text-blue-600" />
                        <span>Email PIC Store (Opsional)</span>
                      </label>
                      <input
                        type="email"
                        value={formPicStoreEmail || ''}
                        onChange={(e) => setFormPicStoreEmail(e.target.value)}
                        placeholder="pic.store@chocochips.co.id..."
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-1 focus:ring-indigo-500 text-xs"
                      />
                    </div>
                  </div>

                  {/* Pilihan Kirim Produk: Store Terkait vs Alamat Customer */}
                  <div className="pt-1 border-t border-indigo-100 dark:border-indigo-900/40">
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Pilihan Kirim Produk Setelah Selesai:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setFormTujuanPengembalian('store')}
                        className={`py-1.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                          formTujuanPengembalian === 'store'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Store className="w-3.5 h-3.5" />
                        <span>Store Terkait</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setFormTujuanPengembalian('customer')}
                        className={`py-1.5 px-3 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                          formTujuanPengembalian === 'customer'
                            ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Alamat Customer</span>
                      </button>
                    </div>

                    {/* Form Data Customer (Wajib jika kirim ke Customer) */}
                    {formTujuanPengembalian === 'customer' && (
                      <div className="mt-2.5 p-3.5 bg-purple-50/70 dark:bg-purple-950/50 rounded-xl border border-purple-200 dark:border-purple-800 space-y-2.5 animate-in fade-in">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-purple-950 dark:text-purple-200 text-xs flex items-center gap-1.5">
                            <Send className="w-3.5 h-3.5 text-purple-600" />
                            Data Pengiriman Langsung ke Customer
                          </span>
                          <span className="text-[10px] bg-purple-200 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-0.5 rounded-full font-bold">
                            Wajib Lengkap
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-bold text-purple-900 dark:text-purple-300 mb-0.5">
                              Nama Penerima Customer *
                            </label>
                            <input
                              type="text"
                              required
                              value={formCustomerNama || ''}
                              onChange={(e) => setFormCustomerNama(e.target.value)}
                              placeholder="Nama lengkap customer..."
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white font-medium text-xs shadow-2xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-bold text-purple-900 dark:text-purple-300 mb-0.5">
                              No. WhatsApp / Telp Customer *
                            </label>
                            <input
                              type="tel"
                              required
                              value={formCustomerHp || ''}
                              onChange={(e) => setFormCustomerHp(e.target.value)}
                              placeholder="0812xxxxxxx"
                              className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white font-mono text-xs font-bold shadow-2xs"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-purple-900 dark:text-purple-300 mb-0.5">
                            Alamat Lengkap Pengiriman *
                          </label>
                          <textarea
                            rows={2}
                            required
                            value={formCustomerAlamat || ''}
                            onChange={(e) => setFormCustomerAlamat(e.target.value)}
                            placeholder="Alamat lengkap (Jalan, No Rumah/RT/RW, Kelurahan, Kecamatan, Kota/Kab, Kode Pos)..."
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white text-xs resize-none shadow-2xs"
                          />
                        </div>

                        {/* Opsi Jasa Kirim / Ekspedisi ke Customer */}
                        <div className="pt-1 border-t border-purple-200/70 dark:border-purple-800/70 space-y-1.5">
                          <label className="block text-[10px] font-bold text-purple-900 dark:text-purple-300">
                            Pilihan Jasa Kirim / Ekspedisi ke Customer:
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <div>
                              <select
                                value={formJasaKirimCustomer}
                                onChange={(e) => setFormJasaKirimCustomer(e.target.value)}
                                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white font-semibold text-xs shadow-2xs"
                              >
                                {CUSTOMER_COURIER_OPTIONS.map((c) => (
                                  <option key={c} value={c}>
                                    {c}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {formJasaKirimCustomer === 'Custom / Ekspedisi Lainnya' ? (
                              <div>
                                <input
                                  type="text"
                                  required
                                  value={formCustomJasaKirim || ''}
                                  onChange={(e) => setFormCustomJasaKirim(e.target.value)}
                                  placeholder="Ketik nama ekspedisi / kurir..."
                                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white text-xs font-bold shadow-2xs"
                                />
                              </div>
                            ) : (
                              <div>
                                <input
                                  type="text"
                                  value={formNotesPaket || ''}
                                  onChange={(e) => setFormNotesPaket(e.target.value)}
                                  placeholder="Catatan pengiriman / patokan lokasi (opsional)..."
                                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white text-xs shadow-2xs"
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. DAFTAR PRODUK & RINCIAN PERBAIKAN (MULTI-ITEM SUPPORT) */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
                  <div>
                    <label className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-1.5">
                      <Tag className="w-4 h-4 text-indigo-600" />
                      <span>Daftar Pakaian / Produk yang Dikerjakan ({formItems.length})</span>
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Anda dapat menambahkan lebih dari 1 pakaian dalam 1 nomor tiket & pengiriman yang sama.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAddItem}
                    className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ Tambah Produk</span>
                  </button>
                </div>

                {/* Items List */}
                <div className="space-y-4">
                  {formItems.map((item, idx) => (
                    <div
                      key={item.id || idx}
                      className="p-3.5 bg-slate-50/70 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 relative transition-all"
                    >
                      {/* Item Header */}
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-indigo-600 text-white rounded-lg text-xs font-bold">
                            #{idx + 1}
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 text-xs">
                            {item.nama_produk ? item.nama_produk : `Pakaian #${idx + 1}`}
                          </span>
                          {item.sku && (
                            <span className="text-[10px] font-mono text-slate-500 bg-slate-200 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                              {item.sku}
                            </span>
                          )}
                        </div>

                        {formItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 p-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                            title="Hapus item ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Hapus</span>
                          </button>
                        )}
                      </div>

                      {/* Dropsearch Katalog per Item */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                            <Search className="w-3 h-3 text-indigo-500" />
                            <span>Cari dari Katalog (Dropsearch):</span>
                          </label>
                          <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold">
                            {allCatalogProducts.length} Produk Tersedia
                          </span>
                        </div>

                        <div className="relative">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                              type="text"
                              value={item.catalogSearch || ''}
                              onChange={(e) =>
                                handleUpdateItem(idx, {
                                  catalogSearch: e.target.value,
                                  showDropdown: true,
                                })
                              }
                              onFocus={() => handleUpdateItem(idx, { showDropdown: true })}
                              placeholder={`Ketik SKU / Nama produk #${idx + 1} untuk dropsearch...`}
                              className="w-full pl-8 pr-8 py-1.5 bg-white dark:bg-slate-800 border-2 border-indigo-100 dark:border-indigo-900 rounded-xl text-slate-900 dark:text-white font-medium text-xs focus:border-indigo-500 focus:outline-none shadow-2xs"
                            />
                            {item.catalogSearch && (
                              <button
                                type="button"
                                onClick={() =>
                                  handleUpdateItem(idx, {
                                    catalogSearch: '',
                                    showDropdown: false,
                                  })
                                }
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 rounded-md"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Floating Dropdown */}
                          {item.showDropdown && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl z-50 max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in">
                              <div className="sticky top-0 bg-slate-100 dark:bg-slate-950 px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center select-none">
                                <span>Pilih Produk ({allCatalogProducts.filter((p) => {
                                  if (!item.catalogSearch) return true;
                                  const q = item.catalogSearch.toLowerCase();
                                  return (p.n || p.p || '').toLowerCase().includes(q) || (p.k || '').toLowerCase().includes(q);
                                }).length})</span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateItem(idx, { showDropdown: false })}
                                  className="text-slate-400 hover:text-slate-600 font-bold"
                                >
                                  Tutup [×]
                                </button>
                              </div>

                              {allCatalogProducts
                                .filter((p) => {
                                  if (!item.catalogSearch) return true;
                                  const q = item.catalogSearch.toLowerCase().trim();
                                  return (
                                    (p.n || p.p || '').toLowerCase().includes(q) ||
                                    (p.k || '').toLowerCase().includes(q) ||
                                    (p.category || '').toLowerCase().includes(q)
                                  );
                                })
                                .slice(0, 20)
                                .map((p, pIdx) => (
                                  <div
                                    key={`${p.k}_${p.size || ''}_${pIdx}`}
                                    onClick={() => handleSelectItemCatalog(idx, p)}
                                    className="p-2.5 hover:bg-indigo-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between transition-colors"
                                  >
                                    <div className="space-y-0.5 pr-2">
                                      <div className="font-bold text-slate-800 dark:text-white text-xs">
                                        {p.n || p.p || 'Produk Pakaian'}
                                      </div>
                                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                        <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">{p.k}</span>
                                        {p.size && p.size !== '-' && <span>• Size: <strong>{String(p.size)}</strong></span>}
                                        {p.category && <span>• {String(p.category)}</span>}
                                      </div>
                                    </div>
                                    <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-2 py-1 rounded-lg shrink-0">
                                      Pilih
                                    </span>
                                  </div>
                                ))}

                              {allCatalogProducts.filter((p) => {
                                if (!item.catalogSearch) return true;
                                const q = item.catalogSearch.toLowerCase();
                                return (p.n || p.p || '').toLowerCase().includes(q) || (p.k || '').toLowerCase().includes(q);
                              }).length === 0 && (
                                <div className="p-3 text-center text-slate-400 text-xs">
                                  Tidak ditemukan produk untuk &ldquo;{item.catalogSearch}&rdquo;. Silakan ketik nama produk manual di bawah.
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Detail Nama Produk, SKU, Size, Qty */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                        <div className="sm:col-span-2">
                          <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                            Nama Produk *
                          </label>
                          <input
                            type="text"
                            required
                            value={item.nama_produk || ''}
                            onChange={(e) => handleUpdateItem(idx, { nama_produk: e.target.value })}
                            placeholder="Misal: Sarah Linen Dress..."
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-medium text-xs shadow-2xs"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                            SKU / Kode
                          </label>
                          <input
                            type="text"
                            value={item.sku || ''}
                            onChange={(e) => handleUpdateItem(idx, { sku: e.target.value })}
                            placeholder="SKU-XXX..."
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-xs font-bold shadow-2xs"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                              Size
                            </label>
                            <input
                              type="text"
                              value={item.size || '-'}
                              onChange={(e) => handleUpdateItem(idx, { size: e.target.value })}
                              placeholder="S/M/L"
                              className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs font-semibold shadow-2xs text-center"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-0.5">
                              Qty *
                            </label>
                            <input
                              type="number"
                              min={1}
                              required
                              value={item.qty ?? 1}
                              onChange={(e) => handleUpdateItem(idx, { qty: Number(e.target.value) || 1 })}
                              className="w-full px-2 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-bold text-xs shadow-2xs text-center"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Jenis Layanan per Item */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Layanan untuk Pakaian #{idx + 1}:
                        </label>
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(idx, { layanan_type: 'alteration' })}
                            className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer text-xs font-semibold flex items-center justify-center gap-1 ${
                              item.layanan_type === 'alteration'
                                ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-900 dark:text-rose-200 font-bold shadow-xs'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600'
                            }`}
                          >
                            <Scissors className="w-3.5 h-3.5 text-rose-600" />
                            <span>Alter Only</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleUpdateItem(idx, { layanan_type: 'repair' })}
                            className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer text-xs font-semibold flex items-center justify-center gap-1 ${
                              item.layanan_type === 'repair'
                                ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-500 text-amber-900 dark:text-amber-200 font-bold shadow-xs'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600'
                            }`}
                          >
                            <Wrench className="w-3.5 h-3.5 text-amber-600" />
                            <span>Repair Only</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleUpdateItem(idx, { layanan_type: 'both' })}
                            className={`py-1.5 px-2 rounded-lg border text-center transition-all cursor-pointer text-xs font-semibold flex items-center justify-center gap-1 ${
                              item.layanan_type === 'both'
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-900 dark:text-indigo-200 font-bold shadow-xs'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600'
                            }`}
                          >
                            <div className="flex items-center gap-0.5">
                              <Scissors className="w-3 h-3 text-indigo-600" />
                              <Wrench className="w-3 h-3 text-indigo-600" />
                            </div>
                            <span>Alter & Repair</span>
                          </button>
                        </div>
                      </div>

                      {/* Kondisi Fisik Barang */}
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-[10px] font-bold text-slate-700 dark:text-slate-300">
                            Kondisi Fisik Barang:
                          </label>
                          <div className="flex flex-wrap gap-1">
                            {conditionPresets.slice(0, 4).map((c) => (
                              <button
                                key={c}
                                type="button"
                                onClick={() => handleUpdateItem(idx, { kondisi: c })}
                                className="text-[9px] bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 cursor-pointer"
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        </div>
                        <input
                          type="text"
                          value={item.kondisi || ''}
                          onChange={(e) => handleUpdateItem(idx, { kondisi: e.target.value })}
                          className="w-full px-2.5 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs shadow-2xs"
                        />
                      </div>

                      {/* Instruksi Alteration */}
                      {(item.layanan_type === 'alteration' || item.layanan_type === 'both') && (
                        <div className="p-2.5 bg-rose-50/50 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 rounded-xl space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="font-bold text-rose-950 dark:text-rose-200 text-[11px] flex items-center gap-1">
                              <Scissors className="w-3 h-3 text-rose-600" />
                              <span>Instruksi Alteration #{idx + 1} *</span>
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {alterationPresets.slice(0, 3).map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => handleUpdateItem(idx, { alteration_detail: p })}
                                  className="text-[9px] bg-white dark:bg-slate-800 text-rose-700 dark:text-rose-300 px-1.5 py-0.5 rounded border border-rose-200 hover:bg-rose-100 cursor-pointer"
                                >
                                  + {p.split(' ')[0]} {p.split(' ')[1]}
                                </button>
                              ))}
                            </div>
                          </div>
                          <textarea
                            rows={2}
                            required
                            value={item.alteration_detail || ''}
                            onChange={(e) => handleUpdateItem(idx, { alteration_detail: e.target.value })}
                            placeholder="Misal: Potong keliman 4cm, kecilkan lingkar pinggang 2cm..."
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 rounded-lg text-slate-900 dark:text-white text-xs resize-none shadow-2xs"
                          />
                        </div>
                      )}

                      {/* Instruksi Repair */}
                      {(item.layanan_type === 'repair' || item.layanan_type === 'both') && (
                        <div className="p-2.5 bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 rounded-xl space-y-1">
                          <div className="flex items-center justify-between">
                            <label className="font-bold text-amber-950 dark:text-amber-200 text-[11px] flex items-center gap-1">
                              <Wrench className="w-3 h-3 text-amber-600" />
                              <span>Instruksi Repair #{idx + 1} *</span>
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {repairPresets.slice(0, 3).map((p) => (
                                <button
                                  key={p}
                                  type="button"
                                  onClick={() => handleUpdateItem(idx, { repair_detail: p })}
                                  className="text-[9px] bg-white dark:bg-slate-800 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded border border-amber-200 hover:bg-amber-100 cursor-pointer"
                                >
                                  + {p.split(' ')[0]} {p.split(' ')[1]}
                                </button>
                              ))}
                            </div>
                          </div>
                          <textarea
                            rows={2}
                            required
                            value={item.repair_detail || ''}
                            onChange={(e) => handleUpdateItem(idx, { repair_detail: e.target.value })}
                            placeholder="Misal: Ganti resleting belakang YKK warna senada, jahit sobekan lengan..."
                            className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 rounded-lg text-slate-900 dark:text-white text-xs resize-none shadow-2xs"
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Bottom Add Item Button */}
                <button
                  type="button"
                  onClick={handleAddItem}
                  className="w-full py-2.5 border-2 border-dashed border-indigo-300 dark:border-indigo-800 hover:border-indigo-500 rounded-2xl text-indigo-600 dark:text-indigo-400 font-bold text-xs flex items-center justify-center gap-2 hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-all cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>+ Tambah Pakaian / Produk Lainnya ke Tiket Ini</span>
                </button>
              </div>

              {/* 3. TARGET PENYELESAIAN (ESTIMASI SELESAI) */}
              <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 text-xs">
                  Target Tanggal Selesai Warehouse:
                </label>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="date"
                    value={formPerkiraanSelesai || ''}
                    onChange={(e) => setFormPerkiraanSelesai(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => handleSetPresetDate(1)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    +1 Hari
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresetDate(3)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    +3 Hari
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetPresetDate(7)}
                    className="px-2.5 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-lg text-slate-700 dark:text-slate-300 cursor-pointer"
                  >
                    +7 Hari
                  </button>
                </div>
              </div>

              {/* 4. FOTO LAMPIRAN */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 text-xs">
                  Dokumentasi Foto Fisik / Bagian yang Perlu Dikerjakan:
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700 dark:text-slate-300 text-xs">
                    <Camera className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Upload / Ambil Foto</span>
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handlePhotoUpload}
                      className="hidden"
                    />
                  </label>
                  {isUploadingPhoto && <span className="text-slate-400 text-xs">Memproses foto...</span>}
                </div>

                {formFotoUrls.length > 0 && (
                  <div className="flex items-center gap-2 mt-2 overflow-x-auto pb-1">
                    {formFotoUrls.map((fUrl, fIdx) => (
                      <div key={fIdx} className="relative group shrink-0">
                        <img
                          src={fUrl}
                          alt=""
                          className="w-12 h-12 object-cover rounded-lg border border-slate-300"
                        />
                        <button
                          type="button"
                          onClick={() => setFormFotoUrls((prev) => prev.filter((_, i) => i !== fIdx))}
                          className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  <span>{isSubmitting ? 'Mendaftarkan...' : 'Daftarkan Request & Buat Tiket'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 4: CETAK WORK ORDER SPK */}
      {/* ==================================================== */}
      {spkModalOrder && (
        <AlterationRepairReceiptModal
          order={spkModalOrder}
          onClose={() => setSpkModalOrder(null)}
          onShowToast={onShowToast}
        />
      )}

      {/* ==================================================== */}
      {/* MODAL 4B: CETAK SURAT JALAN STRUK (RANGKAP 2) */}
      {/* ==================================================== */}
      {sjStrukModalOrder && (
        <SuratJalanAlterReceiptModal
          order={sjStrukModalOrder}
          onClose={() => setSjStrukModalOrder(null)}
          onShowToast={onShowToast}
        />
      )}

      {/* ==================================================== */}
      {/* MODAL 4C: AKSI 2-ARAH (KIRIM STORE / TERIMA GUDANG / BUKTI KIRIM) */}
      {/* ==================================================== */}
      {actionModalData && (
        <AlterationActionModal
          order={actionModalData.order}
          actionType={actionModalData.actionType}
          session={session}
          onClose={() => setActionModalData(null)}
          onSuccess={() => {
            if (onOrdersUpdated) onOrdersUpdated();
            else fetchOrdersDirectly();
          }}
          onShowToast={onShowToast}
        />
      )}

      {/* ==================================================== */}
      {/* MODAL 4D: STATUS SUBMIT & RINCIAN PENDAFTARAN */}
      {/* ==================================================== */}
      {submittedSummaryOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-3xl border border-emerald-300 dark:border-emerald-800 shadow-2xl max-w-lg w-full overflow-hidden my-auto">
            {/* Header */}
            <div className="px-5 py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/20 rounded-xl">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black">Status Submit: Berhasil Didaftarkan!</h3>
                  <p className="text-[11px] text-emerald-100">Rincian tiket telah dicatat dan siap diproses</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSubmittedSummaryOrder(null)}
                className="p-1.5 text-white/80 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Rincian Submit Content */}
            <div className="p-5 space-y-3.5 text-xs">
              {/* Ticket & ID Summary */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">No. Registrasi Tiket:</span>
                  <span className="font-mono font-black text-indigo-600 dark:text-indigo-400">{submittedSummaryOrder.no_pesanan}</span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">No. ID Form Alter:</span>
                  <span className="font-mono font-black text-slate-900 dark:text-white bg-slate-200 dark:bg-slate-700 px-1.5 py-0.5 rounded">
                    {submittedSummaryOrder.alteration_repair_data?.id_form_alter || submittedSummaryOrder.no_pesanan}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">Sumber Fisik:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {submittedSummaryOrder.alteration_repair_data?.sumber_barang === 'warehouse' ? '🏢 Stok Warehouse (Customer Alter)' : `🏬 Fisik dari Store (${submittedSummaryOrder.nama_pengirim})`}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">Layanan:</span>
                  <span className="font-bold text-rose-600 dark:text-rose-400 uppercase">
                    {submittedSummaryOrder.alteration_repair_data?.layanan_type}
                  </span>
                </div>
              </div>

              {/* PIC & Tujuan Info */}
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="p-2.5 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800">
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 font-bold block">PIC STORE / SA</span>
                  <div className="font-bold text-slate-800 dark:text-slate-200">{submittedSummaryOrder.pic_store}</div>
                  <div className="text-slate-600 dark:text-slate-400 font-mono text-[10px]">WA: {submittedSummaryOrder.no_telp_store || '-'}</div>
                  {submittedSummaryOrder.alteration_repair_data?.pic_store_email && (
                    <div className="text-slate-500 text-[9.5px] truncate">Email: {submittedSummaryOrder.alteration_repair_data.pic_store_email}</div>
                  )}
                </div>
                <div className="p-2.5 bg-purple-50 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800">
                  <span className="text-[10px] text-purple-600 dark:text-purple-400 font-bold block">TUJUAN PENGIRIMAN</span>
                  <div className="font-bold text-slate-800 dark:text-slate-200 truncate">{submittedSummaryOrder.nama_tujuan}</div>
                  <div className="text-slate-600 dark:text-slate-400 font-mono text-[10px]">Telp: {submittedSummaryOrder.no_telp_tujuan || '-'}</div>
                  <div className="text-slate-500 text-[9.5px] truncate">{submittedSummaryOrder.alamat_tujuan}</div>
                </div>
              </div>

              {/* Product Details (Multi-item support) */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex justify-between items-center text-[10px] font-bold uppercase text-slate-400">
                  <span>Rincian Produk ({submittedSummaryOrder.items?.length || 1} Item)</span>
                  <span>Total Qty: {submittedSummaryOrder.items?.reduce((s, it) => s + (Number(it.qty) || 1), 0) || 1} pcs</span>
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto divide-y divide-slate-200/60 dark:divide-slate-700/60">
                  {(submittedSummaryOrder.items && submittedSummaryOrder.items.length > 0 ? submittedSummaryOrder.items : [{
                    nama_produk: submittedSummaryOrder.alteration_repair_data?.nama_produk || 'Produk Pakaian',
                    sku: submittedSummaryOrder.alteration_repair_data?.sku || '-',
                    size: submittedSummaryOrder.alteration_repair_data?.size || '-',
                    qty: submittedSummaryOrder.alteration_repair_data?.qty || 1,
                    layanan_type: submittedSummaryOrder.layanan_type,
                    alteration_detail: submittedSummaryOrder.alteration_detail,
                    repair_detail: submittedSummaryOrder.repair_detail,
                  }]).map((it, itIdx) => (
                    <div key={itIdx} className={`space-y-1 ${itIdx > 0 ? 'pt-2' : ''}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 dark:text-white text-xs">
                          #{itIdx + 1} {it.nama_produk}
                        </span>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                          Qty: {it.qty} pcs
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10.5px] text-slate-600 dark:text-slate-400 font-mono">
                        <span>SKU: <strong>{it.sku || '-'}</strong></span>
                        <span>• Size: <strong>{it.size || '-'}</strong></span>
                        {it.layanan_type && <span>• <span className="uppercase text-rose-600 dark:text-rose-400 font-bold">{it.layanan_type}</span></span>}
                      </div>
                      {(it.alteration_detail || it.repair_detail) && (
                        <div className="text-[10px] text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-900 p-1.5 rounded-lg border border-slate-200 dark:border-slate-800">
                          {it.alteration_detail && <div>✂️ <strong>Alter:</strong> {it.alteration_detail}</div>}
                          {it.repair_detail && <div>🔧 <strong>Repair:</strong> {it.repair_detail}</div>}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {submittedSummaryOrder.alteration_repair_data?.jasa_kirim_customer && (
                  <div className="pt-1.5 border-t border-slate-200 dark:border-slate-700 text-[10.5px] text-purple-700 dark:text-purple-300 flex items-center justify-between font-semibold">
                    <span>🚚 Ekspedisi ke Customer:</span>
                    <span className="font-bold font-mono">{submittedSummaryOrder.alteration_repair_data.jasa_kirim_customer}</span>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                {/* Kirim WhatsApp */}
                <button
                  type="button"
                  onClick={() => {
                    const ord = submittedSummaryOrder;
                    const ar = ord.alteration_repair_data || ({} as any);
                    const phone = (ar.pic_store_phone || ord.no_telp_store || '').replace(/\D/g, '');
                    const cleanPhone = phone.startsWith('0') ? '62' + phone.slice(1) : phone.startsWith('62') ? phone : '62' + phone;

                    const itemsText = (ord.items || []).map((it, i) =>
                      `  ${i + 1}. *${it.nama_produk}* (SKU: ${it.sku || '-'}, Size: ${it.size || '-'}, Qty: ${it.qty || 1} pcs)
     - Layanan: ${it.layanan_type?.toUpperCase() || '-'}
     ${it.alteration_detail ? `- Alter: ${it.alteration_detail}\n     ` : ''}${it.repair_detail ? `- Repair: ${it.repair_detail}` : ''}`
                    ).join('\n');

                    const text = encodeURIComponent(
`*RINCIAN PENDAFTARAN ALTERATION & REPAIR* ✨
───────────────────────────
🔖 *No. ID Form Alter:* *${ar.id_form_alter || ord.no_pesanan}*
📋 *No. Tiket Sistem:* ${ord.no_pesanan}
🏬 *Sumber Fisik:* ${ar.sumber_barang === 'warehouse' ? 'Stok Warehouse (Customer Order)' : `Store (${ar.nama_asal || ord.nama_pengirim})`}
👤 *PIC Store / SA:* ${ord.pic_store || ar.pic_pemohon || '-'} (${ar.pic_store_phone || '-'})
${ar.pic_store_email ? `📧 *Email PIC:* ${ar.pic_store_email}\n` : ''}📦 *Daftar Produk (${ord.items?.length || 1} item):*
${itemsText || `  - ${ord.items?.[0]?.nama_produk || (ord as any).nama_produk || '-'} (Qty: ${ord.items?.[0]?.qty || (ord as any).qty || 1} pcs)`}
📍 *Tujuan Kirim:* ${ar.tujuan_pengembalian === 'customer' ? `Customer (${ar.nama_penerima_kembali}) - ${ar.alamat_penerima_kembali}${ar.jasa_kirim_customer ? ` [Kurir: ${ar.jasa_kirim_customer}]` : ''}` : `Store (${ar.nama_asal || ord.nama_pengirim})`}
───────────────────────────
Status submit telah berhasil dicatat di sistem WMS Chocochips. Terima kasih! 🙏✨`
                    );

                    if (cleanPhone.length >= 9) {
                      window.open(`https://wa.me/${cleanPhone}?text=${text}`, '_blank');
                    } else {
                      navigator.clipboard.writeText(decodeURIComponent(text));
                      onShowToast('Template rincian WhatsApp disalin ke clipboard!', 'info');
                    }
                  }}
                  className="w-full py-2 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>📱 Kirim Rincian Submit via WhatsApp</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  {submittedSummaryOrder.alteration_repair_data?.sumber_barang === 'store' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSjStrukModalOrder(submittedSummaryOrder);
                        setSubmittedSummaryOrder(null);
                      }}
                      className="py-2 px-3 text-xs font-bold text-amber-900 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Cetak SJ Rangkap 2</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setSpkModalOrder(submittedSummaryOrder);
                        setSubmittedSummaryOrder(null);
                      }}
                      className="py-2 px-3 text-xs font-bold text-purple-900 bg-purple-100 hover:bg-purple-200 border border-purple-300 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>Cetak SPK Gudang</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setSubmittedSummaryOrder(null)}
                    className="py-2 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <span>Selesai & Tutup</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL 5: PREVIEW FOTO */}
      {/* ==================================================== */}
      {previewPhotoUrl && (
        <div 
          onClick={() => setPreviewPhotoUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs cursor-pointer animate-in fade-in"
        >
          <div className="max-w-xl max-h-[85vh] relative" onClick={(e) => e.stopPropagation()}>
            <img src={previewPhotoUrl} alt="" className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl" />
            <button
              type="button"
              onClick={() => setPreviewPhotoUrl(null)}
              className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
