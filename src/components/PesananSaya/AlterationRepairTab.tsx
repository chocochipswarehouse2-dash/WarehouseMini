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
  Clock,
  ArrowRight,
  Filter,
  Eye,
  Layers,
  MapPin,
  ExternalLink,
  MessageSquare,
  AlertTriangle,
  Truck,
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modals state
  const [sjStrukModalOrder, setSjStrukModalOrder] = useState<ManualShipmentOrder | null>(null);
  const [spkModalOrder, setSpkModalOrder] = useState<ManualShipmentOrder | null>(null);
  const [actionModalData, setActionModalData] = useState<{
    order: ManualShipmentOrder;
    actionType: AlterationActionType;
  } | null>(null);
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);
  const [submittedSummaryOrder, setSubmittedSummaryOrder] = useState<ManualShipmentOrder | null>(null);

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
  const [formTujuanPengembalian, setFormTujuanPengembalian] = useState<'customer' | 'store'>('store');
  const [formJasaKirimCustomer, setFormJasaKirimCustomer] = useState<string>('JNE REG');
  const [formCustomJasaKirim, setFormCustomJasaKirim] = useState<string>('');
  const [formNotesPaket, setFormNotesPaket] = useState<string>('');
  const [formPerkiraanSelesai, setFormPerkiraanSelesai] = useState<string>('');
  const [formFotoUrls, setFormFotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Multi-Item State
  const [formItems, setFormItems] = useState<FormAlterationItemState[]>([createDefaultItem()]);

  // Autocomplete catalog search & Dropsearch
  const [extraCatalogProducts, setExtraCatalogProducts] = useState<ProductItem[]>([]);

  // Item array managers
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
      size: p.size && p.size !== '-' ? String(p.size) : '-',
      catalogSearch: String(p.n || p.p || (p as any).deskripsi || (p as any).nomor || ''),
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

  // Load Katalog data
  useEffect(() => {
    try {
      const stored = localStorage.getItem(KATALOG_STORAGE_KEY);
      let loadedBatches: KatalogBatch[] = [];
      if (stored) {
        loadedBatches = parseStoredKatalogBatches(stored);
      }
      if (loadedBatches.length === 0 && Array.isArray(initial325bData) && initial325bData.length > 0) {
        loadedBatches = initial325bData as unknown as KatalogBatch[];
      }
      const flattened = extractProductsFromBatches(loadedBatches);
      setExtraCatalogProducts(flattened);
    } catch (e) {
      console.warn('Gagal memuat batch katalog:', e);
    }
  }, []);

  // Combined product catalog
  const allCatalogProducts = useMemo(() => {
    const combined: ProductItem[] = [];
    const seen = new Set<string>();

    (productCatalog || []).forEach((p) => {
      const key = `${p.k}_${p.size || p.s || ''}`.toUpperCase();
      if (!seen.has(key)) {
        seen.add(key);
        combined.push(p);
      }
    });

    extraCatalogProducts.forEach((p) => {
      const key = `${p.k}_${p.size || p.s || ''}`.toUpperCase();
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
  }, [userAssignedStore, session]);

  // Filter only Alteration & Repair orders count for Rekap indicator
  const alterationOrdersCount = useMemo(() => {
    return allOrders.filter((o) => {
      const no = (o.no_pesanan || '').toUpperCase();
      return o.order_type === 'alteration_repair' || no.startsWith('AR-') || no.startsWith('REP-') || no.startsWith('ALT-') || !!o.alteration_repair_data;
    }).length;
  }, [allOrders]);

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

  // Reset form
  const handleResetForm = () => {
    setFormItems([createDefaultItem()]);
    setFormIdFormAlter('');
    setFormRefNo('');
    setFormCustomerNama('');
    setFormCustomerHp('');
    setFormCustomerAlamat('');
    setFormNotesPaket('');
    setFormCustomJasaKirim('');
    setFormFotoUrls([]);
    setFormPerkiraanSelesai('');
    onShowToast('Formulir berhasil direset', 'info');
  };

  // Submit request
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

        // Reset form
        setFormItems([createDefaultItem()]);
        setFormIdFormAlter('');
        setFormRefNo('');
        setFormCustomerNama('');
        setFormCustomerHp('');
        setFormCustomerAlamat('');
        setFormNotesPaket('');
        setFormCustomJasaKirim('');
        setFormFotoUrls([]);

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

  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* ==================================================== */}
      {/* HEADER SECTION: Clean Title, Store Info & Rekap Jump */}
      {/* ==================================================== */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-rose-500 text-white shadow-md shadow-rose-500/20 shrink-0">
            <Scissors className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                Alteration & Repair
              </h2>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold">
                Form Input
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Form pendaftaran tiket perbaikan & alterasi pakaian (Store & Internal Warehouse)
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end flex-wrap">
          {formOutlet && (
            <div className="hidden md:flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <Store className="w-3.5 h-3.5 text-rose-500" />
              <span>{formOutlet}</span>
            </div>
          )}

          {onGoToRekap && (
            <button
              type="button"
              onClick={onGoToRekap}
              className="px-3.5 py-1.5 text-xs font-bold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Buka Rekap Pesanan untuk memantau status pesanan dan cetak SPK"
            >
              <History className="w-4 h-4 text-blue-500" />
              <span>Buka Rekap Pesanan</span>
              {alterationOrdersCount > 0 && (
                <span className="text-[10px] font-black px-1.5 py-0.2 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">
                  {alterationOrdersCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ==================================================== */}
      {/* FORM INPUT UTAMA (LANGSUNG TAMPIL - TANPA MODAL) */}
      {/* ==================================================== */}
      <form onSubmit={handleSubmitNewRequest} className="space-y-4">
        {/* ==================================================== */}
        {/* BAGIAN 1: SUMBER FISIK BARANG & IDENTITAS STORE */}
        {/* ==================================================== */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                1. Sumber Fisik Barang & Pengirim
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">
              Pilih asal fisik barang yang dikerjakan
            </span>
          </div>

          {/* Toggle Skenario Sumber Barang */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={() => {
                setFormSource('store');
                if (formIdFormAlter.startsWith('ALT-WH-')) setFormIdFormAlter('');
              }}
              className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-start gap-1 transition-all cursor-pointer text-left ${
                formSource === 'store'
                  ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-500 text-rose-950 dark:text-rose-100 ring-2 ring-rose-500/20 shadow-xs'
                  : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                <Store className="w-4 h-4 text-rose-600 shrink-0" />
                <span>1. Fisik dari Store / Toko</span>
              </div>
              <span className={`text-[11px] ${formSource === 'store' ? 'text-rose-700 dark:text-rose-300' : 'text-slate-500'}`}>
                Barang fisik dari outlet toko dikirim ke Warehouse untuk di-alter/repair
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
              className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-start gap-1 transition-all cursor-pointer text-left ${
                formSource === 'warehouse'
                  ? 'bg-purple-50 dark:bg-purple-950/50 border-purple-500 text-purple-950 dark:text-purple-100 ring-2 ring-purple-500/20 shadow-xs'
                  : 'bg-white dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center gap-1.5 font-bold">
                <Warehouse className="w-4 h-4 text-purple-600 shrink-0" />
                <span>2. Ambil Stok Gudang (Customer Order)</span>
              </div>
              <span className={`text-[11px] ${formSource === 'warehouse' ? 'text-purple-700 dark:text-purple-300' : 'text-slate-500'}`}>
                Pembelian customer dari stok warehouse yang sekalian minta di-alter sebelum dikirim
              </span>
            </button>
          </div>

          {/* Form ID & Lokasi Rak */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {formSource === 'store' ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                  <span>No. ID Form Alter (Diisi Manual oleh Store) *</span>
                  <span className="text-[10px] font-semibold text-rose-500">Wajib Diisi Manual</span>
                </label>
                <input
                  type="text"
                  required
                  value={formIdFormAlter || ''}
                  onChange={(e) => setFormIdFormAlter(e.target.value)}
                  placeholder="Contoh: ALT/CP/2026/001 atau No. Form Fisik Store..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-rose-300 dark:border-rose-700/80 rounded-xl text-slate-900 dark:text-white font-mono font-bold focus:ring-2 focus:ring-rose-500 text-xs"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-bold text-purple-900 dark:text-purple-300 mb-1 flex items-center justify-between">
                  <span>No. ID Form Alter (Otomatis Sistem):</span>
                  <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/60 px-1.5 py-0.5 rounded">
                    AUTO-GENERATED
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={formIdFormAlter || ''}
                    className="w-full px-3 py-2 bg-purple-50 dark:bg-purple-950/60 border border-purple-300 dark:border-purple-800 rounded-xl text-purple-950 dark:text-purple-200 font-mono font-bold text-xs cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setFormIdFormAlter(generateAutoWarehouseId())}
                    className="p-2 bg-purple-100 hover:bg-purple-200 dark:bg-purple-900 dark:hover:bg-purple-800 text-purple-700 dark:text-purple-200 rounded-xl text-xs font-bold shrink-0 transition-colors cursor-pointer"
                    title="Generate Ulang ID"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {formSource === 'warehouse' ? (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Lokasi Rak / Bin Gudang (Opsional):
                </label>
                <input
                  type="text"
                  value={formWarehouseRak || ''}
                  onChange={(e) => setFormWarehouseRak(e.target.value)}
                  placeholder="Misal: A012, B005, X..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs uppercase"
                />
              </div>
            ) : (
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  No. Referensi / Kasir Store (Opsional):
                </label>
                <input
                  type="text"
                  value={formRefNo || ''}
                  onChange={(e) => setFormRefNo(e.target.value)}
                  placeholder="No. Transaksi Kasir POS..."
                  className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
                />
              </div>
            )}
          </div>

          {/* Store & PIC Name */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                Store / Outlet Pengirim:
              </label>
              <select
                value={formOutlet || (outlets.length > 0 ? outlets[0].nama : DEFAULT_OUTLETS[0].nama)}
                onChange={(e) => setFormOutlet(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-rose-500 text-xs"
              >
                {(outlets.length > 0 ? outlets : DEFAULT_OUTLETS).map((o) => (
                  <option key={o.nama} value={o.nama}>
                    {o.nama}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                PIC Store / SA *
              </label>
              <input
                type="text"
                required
                value={formPicPemohon || ''}
                onChange={(e) => setFormPicPemohon(e.target.value)}
                placeholder="Nama SA / PIC..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-rose-500 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                <Phone className="w-3.5 h-3.5 text-emerald-600" />
                <span>No. WhatsApp PIC Store *</span>
              </label>
              <input
                type="tel"
                required
                value={formPicStorePhone || ''}
                onChange={(e) => setFormPicStorePhone(e.target.value)}
                placeholder="0812xxxx (Untuk notif WA)..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-rose-500 text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1 flex items-center gap-1">
                <Mail className="w-3.5 h-3.5 text-blue-600" />
                <span>Email PIC Store (Opsional):</span>
              </label>
              <input
                type="email"
                value={formPicStoreEmail || ''}
                onChange={(e) => setFormPicStoreEmail(e.target.value)}
                placeholder="pic.store@chocochips.co.id..."
                className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-rose-500 text-xs"
              />
            </div>
          </div>

          {/* Pilihan Kirim Produk: Store Terkait vs Alamat Customer */}
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              Pilihan Kirim Produk Setelah Selesai Dikerjakan:
            </label>
            <div className="grid grid-cols-2 gap-2 max-w-md">
              <button
                type="button"
                onClick={() => setFormTujuanPengembalian('store')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  formTujuanPengembalian === 'store'
                    ? 'bg-rose-500 text-white border-rose-500 shadow-xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <Store className="w-3.5 h-3.5" />
                <span>Kembali ke Store Asal</span>
              </button>

              <button
                type="button"
                onClick={() => setFormTujuanPengembalian('customer')}
                className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                  formTujuanPengembalian === 'customer'
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50'
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Langsung ke Customer</span>
              </button>
            </div>

            {/* Form Data Customer (Wajib jika kirim ke Customer) */}
            {formTujuanPengembalian === 'customer' && (
              <div className="p-3.5 sm:p-4 bg-purple-50/70 dark:bg-purple-950/40 rounded-xl border border-purple-200 dark:border-purple-800 space-y-3 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-purple-950 dark:text-purple-200 text-xs flex items-center gap-1.5">
                    <Send className="w-3.5 h-3.5 text-purple-600" />
                    <span>Data Pengiriman Langsung ke Customer</span>
                  </span>
                  <span className="text-[10px] bg-purple-200 dark:bg-purple-900 text-purple-800 dark:text-purple-200 px-2 py-0.5 rounded-full font-bold">
                    Wajib Lengkap
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-bold text-purple-900 dark:text-purple-300 mb-1">
                      Nama Penerima Customer *
                    </label>
                    <input
                      type="text"
                      required
                      value={formCustomerNama || ''}
                      onChange={(e) => setFormCustomerNama(e.target.value)}
                      placeholder="Nama lengkap customer..."
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white font-medium text-xs shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-purple-900 dark:text-purple-300 mb-1">
                      No. WhatsApp / Telp Customer *
                    </label>
                    <input
                      type="tel"
                      required
                      value={formCustomerHp || ''}
                      onChange={(e) => setFormCustomerHp(e.target.value)}
                      placeholder="0812xxxxxxx"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white font-mono text-xs font-bold shadow-2xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-purple-900 dark:text-purple-300 mb-1">
                    Alamat Lengkap Pengiriman Customer *
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={formCustomerAlamat || ''}
                    onChange={(e) => setFormCustomerAlamat(e.target.value)}
                    placeholder="Alamat lengkap (Jalan, No Rumah, Kelurahan, Kecamatan, Kota/Kab, Kode Pos)..."
                    className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white text-xs resize-none shadow-2xs"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="block text-[11px] font-bold text-purple-900 dark:text-purple-300 mb-1">
                      Pilihan Jasa Kirim / Ekspedisi ke Customer:
                    </label>
                    <select
                      value={formJasaKirimCustomer}
                      onChange={(e) => setFormJasaKirimCustomer(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white font-semibold text-xs shadow-2xs"
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
                      <label className="block text-[11px] font-bold text-purple-900 dark:text-purple-300 mb-1">
                        Nama Ekspedisi Custom *
                      </label>
                      <input
                        type="text"
                        required
                        value={formCustomJasaKirim || ''}
                        onChange={(e) => setFormCustomJasaKirim(e.target.value)}
                        placeholder="Ketik nama ekspedisi / kurir..."
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white text-xs font-bold shadow-2xs"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block text-[11px] font-bold text-purple-900 dark:text-purple-300 mb-1">
                        Catatan Khusus Pengiriman (Opsional):
                      </label>
                      <input
                        type="text"
                        value={formNotesPaket || ''}
                        onChange={(e) => setFormNotesPaket(e.target.value)}
                        placeholder="Patokan lokasi / instruksi kurir..."
                        className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-slate-900 dark:text-white text-xs shadow-2xs"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ==================================================== */}
        {/* BAGIAN 2: DAFTAR PRODUK & RINCIAN PERBAIKAN (MULTI-ITEM) */}
        {/* ==================================================== */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 flex-wrap gap-2">
            <div>
              <div className="flex items-center gap-2">
                <Tag className="w-4 h-4 text-rose-500" />
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  2. Daftar Pakaian / Produk ({formItems.length})
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Daftarkan pakaian yang akan di-alter atau repair. Anda dapat menambahkan beberapa item sekaligus.
              </p>
            </div>
            <button
              type="button"
              onClick={handleAddItem}
              className="px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Tambah Produk</span>
            </button>
          </div>

          {/* List of Items */}
          <div className="space-y-4">
            {formItems.map((item, idx) => (
              <div
                key={item.id || idx}
                className="p-3.5 sm:p-4 bg-slate-50/70 dark:bg-slate-900/60 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3 relative transition-all"
              >
                {/* Item Header */}
                <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 bg-rose-500 text-white rounded-lg text-xs font-bold">
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
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/40 px-2 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
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
                      <Search className="w-3 h-3 text-rose-500" />
                      <span>Cari dari Katalog (Dropsearch):</span>
                    </label>
                    <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
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
                        className="w-full pl-8 pr-8 py-2 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium text-xs focus:border-rose-500 focus:outline-none shadow-2xs"
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
                      <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl rounded-2xl z-40 max-h-60 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800 animate-in fade-in">
                        <div className="sticky top-0 bg-slate-100 dark:bg-slate-950 px-3 py-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex justify-between items-center select-none">
                          <span>Pilih Produk ({allCatalogProducts.filter((p) => {
                            if (!item.catalogSearch) return true;
                            const q = item.catalogSearch.toLowerCase();
                            return (p.n || p.p || '').toLowerCase().includes(q) || (p.k || '').toLowerCase().includes(q);
                          }).length})</span>
                          <button
                            type="button"
                            onClick={() => handleUpdateItem(idx, { showDropdown: false })}
                            className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer"
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
                              className="p-2.5 hover:bg-rose-50 dark:hover:bg-slate-800 cursor-pointer flex items-center justify-between transition-colors"
                            >
                              <div className="space-y-0.5 pr-2">
                                <div className="font-bold text-slate-800 dark:text-white text-xs">
                                  {p.n || p.p || 'Produk Pakaian'}
                                </div>
                                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                                  <span className="font-mono text-rose-600 dark:text-rose-400 font-bold">{p.k}</span>
                                  {p.size && p.size !== '-' && <span>• Size: <strong>{String(p.size)}</strong></span>}
                                  {p.category && <span>• {String(p.category)}</span>}
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-2 py-1 rounded-lg shrink-0">
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
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      Nama Produk *
                    </label>
                    <input
                      type="text"
                      required
                      value={item.nama_produk || ''}
                      onChange={(e) => handleUpdateItem(idx, { nama_produk: e.target.value })}
                      placeholder="Misal: Sarah Linen Dress..."
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-medium text-xs shadow-2xs"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                      SKU / Kode
                    </label>
                    <input
                      type="text"
                      value={item.sku || ''}
                      onChange={(e) => handleUpdateItem(idx, { sku: e.target.value })}
                      placeholder="SKU-XXX..."
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-xs font-bold shadow-2xs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Size
                      </label>
                      <input
                        type="text"
                        value={item.size || '-'}
                        onChange={(e) => handleUpdateItem(idx, { size: e.target.value })}
                        placeholder="S/M/L"
                        className="w-full px-2 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs font-semibold shadow-2xs text-center"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Qty *
                      </label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={item.qty ?? 1}
                        onChange={(e) => handleUpdateItem(idx, { qty: Number(e.target.value) || 1 })}
                        className="w-full px-2 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-bold text-xs shadow-2xs text-center"
                      />
                    </div>
                  </div>
                </div>

                {/* Jenis Layanan per Item */}
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Layanan untuk Pakaian #{idx + 1}:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => handleUpdateItem(idx, { layanan_type: 'alteration' })}
                      className={`py-2 px-2 rounded-xl border text-center transition-all cursor-pointer text-xs font-semibold flex items-center justify-center gap-1.5 ${
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
                      className={`py-2 px-2 rounded-xl border text-center transition-all cursor-pointer text-xs font-semibold flex items-center justify-center gap-1.5 ${
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
                      className={`py-2 px-2 rounded-xl border text-center transition-all cursor-pointer text-xs font-semibold flex items-center justify-center gap-1.5 ${
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
                  <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
                    <label className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      Kondisi Fisik Barang:
                    </label>
                    <div className="flex flex-wrap gap-1">
                      {conditionPresets.slice(0, 4).map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => handleUpdateItem(idx, { kondisi: c })}
                          className="text-[9px] bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 cursor-pointer"
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
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-xs shadow-2xs"
                  />
                </div>

                {/* Instruksi Alteration */}
                {(item.layanan_type === 'alteration' || item.layanan_type === 'both') && (
                  <div className="p-3 bg-rose-50/50 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-900/60 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <label className="font-bold text-rose-950 dark:text-rose-200 text-xs flex items-center gap-1">
                        <Scissors className="w-3.5 h-3.5 text-rose-600" />
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
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-800 rounded-lg text-slate-900 dark:text-white text-xs resize-none shadow-2xs"
                    />
                  </div>
                )}

                {/* Instruksi Repair */}
                {(item.layanan_type === 'repair' || item.layanan_type === 'both') && (
                  <div className="p-3 bg-amber-50/50 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 rounded-xl space-y-1.5">
                    <div className="flex items-center justify-between flex-wrap gap-1">
                      <label className="font-bold text-amber-950 dark:text-amber-200 text-xs flex items-center gap-1">
                        <Wrench className="w-3.5 h-3.5 text-amber-600" />
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
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-amber-200 dark:border-amber-800 rounded-lg text-slate-900 dark:text-white text-xs resize-none shadow-2xs"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Item Button */}
          <button
            type="button"
            onClick={handleAddItem}
            className="w-full py-2.5 border-2 border-dashed border-rose-300 dark:border-rose-800 hover:border-rose-500 rounded-2xl text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-center gap-2 hover:bg-rose-50/40 dark:hover:bg-rose-950/30 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ Tambah Pakaian Lainnya ke Tiket Ini</span>
          </button>
        </div>

        {/* ==================================================== */}
        {/* BAGIAN 3: TARGET WAKTU, CATATAN & FOTO DOKUMENTASI */}
        {/* ==================================================== */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                3. Target Waktu & Dokumentasi Foto
              </h3>
            </div>
            <span className="text-[11px] text-slate-500">
              Estimasi penyelesaian & foto panduan
            </span>
          </div>

          {/* Target Selesai */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 text-xs">
              Target Tanggal Selesai Warehouse:
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={formPerkiraanSelesai || ''}
                onChange={(e) => setFormPerkiraanSelesai(e.target.value)}
                className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => handleSetPresetDate(1)}
                className="px-2.5 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                +1 Hari
              </button>
              <button
                type="button"
                onClick={() => handleSetPresetDate(3)}
                className="px-2.5 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                +3 Hari
              </button>
              <button
                type="button"
                onClick={() => handleSetPresetDate(7)}
                className="px-2.5 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                +7 Hari
              </button>
              <button
                type="button"
                onClick={() => handleSetPresetDate(14)}
                className="px-2.5 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                +14 Hari
              </button>
            </div>
          </div>

          {/* Foto Lampiran */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1 text-xs">
              Dokumentasi Foto Fisik / Bagian yang Perlu Dikerjakan:
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer font-semibold text-slate-700 dark:text-slate-300 text-xs">
                <Camera className="w-4 h-4 text-rose-500" />
                <span>Upload / Ambil Foto</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
              {isUploadingPhoto && <span className="text-slate-400 text-xs animate-pulse">Memproses foto...</span>}
            </div>

            {formFotoUrls.length > 0 && (
              <div className="flex items-center gap-2 mt-2.5 overflow-x-auto pb-1">
                {formFotoUrls.map((fUrl, fIdx) => (
                  <div key={fIdx} className="relative group shrink-0">
                    <img
                      src={fUrl}
                      alt=""
                      onClick={() => setPreviewPhotoUrl(fUrl)}
                      className="w-14 h-14 object-cover rounded-xl border border-slate-300 dark:border-slate-700 cursor-pointer hover:opacity-90"
                    />
                    <button
                      type="button"
                      onClick={() => setFormFotoUrls((prev) => prev.filter((_, i) => i !== fIdx))}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full p-0.5 cursor-pointer shadow-xs"
                      title="Hapus foto"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ==================================================== */}
        {/* ACTION BAR: RESET & SUBMIT BUTTON */}
        {/* ==================================================== */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 p-4 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleResetForm}
              className="px-3.5 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer w-full sm:w-auto"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Form</span>
            </button>

            {onGoToRekap && (
              <button
                type="button"
                onClick={onGoToRekap}
                className="px-3.5 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer w-full sm:w-auto border border-slate-200 dark:border-slate-700"
              >
                <History className="w-3.5 h-3.5" />
                <span>Lihat Rekap Pesanan</span>
              </button>
            )}
          </div>

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 text-xs sm:text-sm font-bold bg-rose-500 hover:bg-rose-600 text-white rounded-xl shadow-md shadow-rose-500/20 hover:shadow-rose-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-98"
          >
            <Save className={`w-4 h-4 ${isSubmitting ? 'animate-spin' : ''}`} />
            <span>{isSubmitting ? 'Mendaftarkan Tiket...' : 'Simpan & Daftarkan Request Alteration & Repair'}</span>
          </button>
        </div>
      </form>

      {/* ==================================================== */}
      {/* MODAL: CETAK WORK ORDER SPK GUDANG */}
      {/* ==================================================== */}
      {spkModalOrder && (
        <AlterationRepairReceiptModal
          order={spkModalOrder}
          onClose={() => setSpkModalOrder(null)}
          onShowToast={onShowToast}
        />
      )}

      {/* ==================================================== */}
      {/* MODAL: CETAK SURAT JALAN STRUK (RANGKAP 2) */}
      {/* ==================================================== */}
      {sjStrukModalOrder && (
        <SuratJalanAlterReceiptModal
          order={sjStrukModalOrder}
          onClose={() => setSjStrukModalOrder(null)}
          onShowToast={onShowToast}
        />
      )}

      {/* ==================================================== */}
      {/* MODAL: AKSI 2-ARAH (KIRIM STORE / TERIMA GUDANG) */}
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
      {/* MODAL: STATUS SUBMIT & RINCIAN PENDAFTARAN */}
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
                  <h3 className="text-sm font-black">Tiket Berhasil Didaftarkan!</h3>
                  <p className="text-[11px] text-emerald-100">Tiket Alteration & Repair siap diproses</p>
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
              <div className="p-3 bg-slate-50 dark:bg-slate-800/70 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">No. Registrasi Tiket:</span>
                  <span className="font-mono font-black text-rose-600 dark:text-rose-400">{submittedSummaryOrder.no_pesanan}</span>
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
                    {submittedSummaryOrder.alteration_repair_data?.layanan_type || 'Alteration'}
                  </span>
                </div>
                <div className="flex justify-between items-center text-[11px]">
                  <span className="text-slate-500">PIC SA / Store:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {submittedSummaryOrder.pic_store || submittedSummaryOrder.alteration_repair_data?.pic_pemohon} ({submittedSummaryOrder.no_telp_store || '-'})
                  </span>
                </div>
              </div>

              {/* Items List */}
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                  Daftar Pakaian ({submittedSummaryOrder.items?.length || 1} Item):
                </div>
                {(submittedSummaryOrder.items || []).map((it, i) => (
                  <div key={i} className="p-2 bg-slate-100/70 dark:bg-slate-800/50 rounded-lg text-xs space-y-1 border border-slate-200 dark:border-slate-700/60">
                    <div className="font-bold text-slate-800 dark:text-slate-200 flex justify-between">
                      <span>#{i + 1} {it.nama_produk}</span>
                      <span className="text-rose-600 dark:text-rose-400 font-mono font-bold">{it.qty || 1} pcs</span>
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

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                {/* Salin / Kirim Template WhatsApp */}
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

                    const text = `*RINCIAN PENDAFTARAN ALTERATION & REPAIR* ✨
───────────────────────────
🔖 *No. ID Form Alter:* *${ar.id_form_alter || ord.no_pesanan}*
📋 *No. Tiket Sistem:* ${ord.no_pesanan}
🏬 *Sumber Fisik:* ${ar.sumber_barang === 'warehouse' ? 'Stok Warehouse (Customer Order)' : `Store (${ar.nama_asal || ord.nama_pengirim})`}
👤 *PIC Store / SA:* ${ord.pic_store || ar.pic_pemohon || '-'} (${ar.pic_store_phone || '-'})
${ar.pic_store_email ? `📧 *Email PIC:* ${ar.pic_store_email}\n` : ''}📦 *Daftar Produk (${ord.items?.length || 1} item):*
${itemsText || `  - ${ord.items?.[0]?.nama_produk || (ord as any).nama_produk || '-'} (Qty: ${ord.items?.[0]?.qty || (ord as any).qty || 1} pcs)`}
📍 *Tujuan Kirim:* ${ar.tujuan_pengembalian === 'customer' ? `Customer (${ar.nama_penerima_kembali}) - ${ar.alamat_penerima_kembali}` : `Store (${ar.nama_asal || ord.nama_pengirim})`}
───────────────────────────
Status submit telah berhasil dicatat di sistem WMS Chocochips. Terima kasih! 🙏✨`;

                    navigator.clipboard.writeText(text).then(() => {
                      onShowToast('Template WhatsApp disalin ke clipboard!', 'success');
                    }).catch(() => {
                      onShowToast('Gagal menyalin ke clipboard', 'error');
                    });
                  }}
                  className="w-full py-2 px-3 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>📱 Salin Rincian Tiket untuk WhatsApp</span>
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

                  {onGoToRekap ? (
                    <button
                      type="button"
                      onClick={() => {
                        setSubmittedSummaryOrder(null);
                        onGoToRekap();
                      }}
                      className="py-2 px-3 text-xs font-bold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Ke Rekap Pesanan</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSubmittedSummaryOrder(null)}
                      className="py-2 px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span>Input Tiket Baru</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: PREVIEW FOTO */}
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
              className="absolute top-2 right-2 p-1.5 bg-black/60 text-white rounded-full hover:bg-black cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
