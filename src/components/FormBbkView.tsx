import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Receipt,
  Plus,
  Search,
  Filter,
  Download,
  Printer,
  CheckCircle2,
  Clock,
  XCircle,
  AlertCircle,
  FileSpreadsheet,
  Upload,
  Image as ImageIcon,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit3,
  Eye,
  Check,
  Building2,
  User,
  CreditCard,
  Wallet,
  Calendar,
  Layers,
  ArrowUpRight,
  ShieldCheck,
  DollarSign,
  FileText,
  Copy,
  RefreshCw,
  Info,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { UserSession } from '../types';

export const EXTERNAL_GAS_BBK_URL =
  'https://script.google.com/macros/s/AKfycby375sn5vwYL_A_16YmuxXoaVZnLsfXQQgZfo5j4xf6yvu1_h_z161tPNOqHMzFaBdY/exec';

const STORAGE_KEY = 'wms_native_bbk_records_v1';

export type BbkStatus = 'Menunggu Approval' | 'Disetujui' | 'Sudah Ditransfer' | 'Ditolak' | 'Dibatalkan';

export type BbkDepartment =
  | 'Warehouse & Logistik'
  | 'Operasional'
  | 'Finance & Accounting'
  | 'HR & GA'
  | 'Marketing & Media'
  | 'Produksi & CMT'
  | 'IT & System'
  | 'Lainnya';

export type BbkExpenseCategory =
  | 'Biaya Operasional Gudang'
  | 'Bahan Baku & CMT'
  | 'Jasa Ekspedisi & Logistik'
  | 'Pembelian Perlengkapan / Alat'
  | 'Maintenance & Perbaikan'
  | 'Konsumsi & Lembur'
  | 'Sewa & Utilitas (Listrik/Air/Internet)'
  | 'Honor / Jasa Profesional'
  | 'Lain-lain';

export interface BbkItemRow {
  id: string;
  deskripsi: string;
  qty: number;
  satuan: string;
  hargaSatuan: number;
  total: number;
  catatan?: string;
}

export interface BbkRecord {
  id: string;
  noBbk: string;
  tanggalPengajuan: string;
  departemen: BbkDepartment;
  pemohonNama: string;
  pemohonNik?: string;
  vendorNama: string;
  bankNama: string;
  bankNoRekening: string;
  bankAtasNama: string;
  kategoriBiaya: BbkExpenseCategory;
  keperluan: string;
  items: BbkItemRow[];
  subtotal: number;
  pajakJenis: 'Tanpa PPh' | 'PPh 21 (2.5%)' | 'PPh 21 (5%)' | 'PPh 23 (2%)' | 'PPh Final (0.5%)';
  pajakTipe: 'Potong Langsung' | 'Gross Up' | 'Tidak Ada';
  pajakNominal: number;
  totalAkhir: number;
  terbilang: string;
  lampiranNota?: string[]; // Base64 or image URLs
  status: BbkStatus;
  approvedBy?: string;
  approvedAt?: string;
  catatanApproval?: string;
  buktiTransferUrl?: string;
  transferTanggal?: string;
  transferRefBank?: string;
  transferBy?: string;
  createdAt: string;
  updatedAt: string;
}

// Utility Terbilang Bahasa Indonesia
export function terbilangRupiah(angka: number): string {
  if (isNaN(angka) || angka <= 0) return 'Nol Rupiah';

  const satuan = ['', 'Satu', 'Dua', 'Tiga', 'Empat', 'Lima', 'Enam', 'Tujuh', 'Delapan', 'Sembilan', 'Sepuluh', 'Sebelas'];

  function konversi(n: number): string {
    if (n < 12) {
      return satuan[n];
    } else if (n < 20) {
      return konversi(n - 10) + ' Belas';
    } else if (n < 100) {
      return konversi(Math.floor(n / 10)) + ' Puluh' + (n % 10 !== 0 ? ' ' + konversi(n % 10) : '');
    } else if (n < 200) {
      return 'Seratus' + (n - 100 !== 0 ? ' ' + konversi(n - 100) : '');
    } else if (n < 1000) {
      return konversi(Math.floor(n / 100)) + ' Ratus' + (n % 100 !== 0 ? ' ' + konversi(n % 100) : '');
    } else if (n < 2000) {
      return 'Seribu' + (n - 1000 !== 0 ? ' ' + konversi(n - 1000) : '');
    } else if (n < 1000000) {
      return konversi(Math.floor(n / 1000)) + ' Ribu' + (n % 1000 !== 0 ? ' ' + konversi(n % 1000) : '');
    } else if (n < 1000000000) {
      return konversi(Math.floor(n / 1000000)) + ' Juta' + (n % 1000000 !== 0 ? ' ' + konversi(n % 1000000) : '');
    } else if (n < 1000000000000) {
      return konversi(Math.floor(n / 1000000000)) + ' Miliar' + (n % 1000000000 !== 0 ? ' ' + konversi(n % 1000000000) : '');
    } else {
      return konversi(Math.floor(n / 1000000000000)) + ' Triliun' + (n % 1000000000000 !== 0 ? ' ' + konversi(n % 1000000000000) : '');
    }
  }

  return `${konversi(Math.floor(angka)).trim()} Rupiah`;
}

export function formatRupiah(nominal: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(nominal || 0);
}

// Initial Seed Samples for Immediate Out-of-the-box Usage
const DEFAULT_SEED_RECORDS: BbkRecord[] = [
  {
    id: 'bbk_seed_1',
    noBbk: 'BBK-202610-0001',
    tanggalPengajuan: '2026-10-01',
    departemen: 'Warehouse & Logistik',
    pemohonNama: 'Staff Gudang',
    vendorNama: 'PT Lakban & Plastik Presisi',
    bankNama: 'BCA',
    bankNoRekening: '8820912381',
    bankAtasNama: 'PT Lakban & Plastik Presisi',
    kategoriBiaya: 'Pembelian Perlengkapan / Alat',
    keperluan: 'Pembelian Lakban Bening 200 yard (5 Dus) & Plastik Polymailer Packing',
    items: [
      { id: '1', deskripsi: 'Lakban Bening Daimaru 2" 200Y (Dus)', qty: 5, satuan: 'Dus', hargaSatuan: 285000, total: 1425000 },
      { id: '2', deskripsi: 'Plastik Polymailer Silver 25x35 cm (Roll)', qty: 10, satuan: 'Roll', hargaSatuan: 85000, total: 850000 },
    ],
    subtotal: 2275000,
    pajakJenis: 'Tanpa PPh',
    pajakTipe: 'Tidak Ada',
    pajakNominal: 0,
    totalAkhir: 2275000,
    terbilang: 'Dua Juta Dua Ratus Tujuh Puluh Lima Ribu Rupiah',
    status: 'Sudah Ditransfer',
    approvedBy: 'SPV Operasional',
    approvedAt: '2026-10-01 14:20',
    transferTanggal: '2026-10-01 16:05',
    transferRefBank: 'TRF-BCA-9831024',
    transferBy: 'Finance Team',
    createdAt: '2026-10-01T09:15:00.000Z',
    updatedAt: '2026-10-01T16:05:00.000Z',
  },
  {
    id: 'bbk_seed_2',
    noBbk: 'BBK-202610-0002',
    tanggalPengajuan: '2026-10-02',
    departemen: 'Produksi & CMT',
    pemohonNama: 'Supervisor Produksi',
    vendorNama: 'CV Berkah Jahit Mandiri',
    bankNama: 'Mandiri',
    bankNoRekening: '1310019284729',
    bankAtasNama: 'CV Berkah Jahit Mandiri',
    kategoriBiaya: 'Bahan Baku & CMT',
    keperluan: 'DP Pembayaran Jasa CMT Batch Gamis Rayon Salur (1.200 Pcs)',
    items: [
      { id: '1', deskripsi: 'DP 50% Ongkos Jahit CMT Gamis Rayon Salur', qty: 1200, satuan: 'Pcs', hargaSatuan: 8500, total: 10200000 },
    ],
    subtotal: 10200000,
    pajakJenis: 'PPh 23 (2%)',
    pajakTipe: 'Potong Langsung',
    pajakNominal: 204000,
    totalAkhir: 9996000,
    terbilang: 'Sembilan Juta Sembilan Ratus Sembilan Puluh Enam Ribu Rupiah',
    status: 'Menunggu Approval',
    createdAt: '2026-10-02T11:00:00.000Z',
    updatedAt: '2026-10-02T11:00:00.000Z',
  },
];

const BANK_OPTIONS = [
  'BCA (Bank Central Asia)',
  'Mandiri',
  'BRI (Bank Rakyat Indonesia)',
  'BNI (Bank Negara Indonesia)',
  'BSI (Bank Syariah Indonesia)',
  'CIMB Niaga',
  'Permata Bank',
  'Danamon',
  'Seabank',
  'Bank Jago',
  'Allo Bank',
  'Tunai / Kas Kecil (Petty Cash)',
  'Lainnya',
];

const DEPARTMENTS: BbkDepartment[] = [
  'Warehouse & Logistik',
  'Operasional',
  'Finance & Accounting',
  'HR & GA',
  'Marketing & Media',
  'Produksi & CMT',
  'IT & System',
  'Lainnya',
];

const EXPENSE_CATEGORIES: BbkExpenseCategory[] = [
  'Biaya Operasional Gudang',
  'Bahan Baku & CMT',
  'Jasa Ekspedisi & Logistik',
  'Pembelian Perlengkapan / Alat',
  'Maintenance & Perbaikan',
  'Konsumsi & Lembur',
  'Sewa & Utilitas (Listrik/Air/Internet)',
  'Honor / Jasa Profesional',
  'Lain-lain',
];

interface FormBbkViewProps {
  session: UserSession | null;
  onNotify?: (msg: string, type?: 'success' | 'error' | 'warning' | 'info') => void;
}

export const FormBbkView: React.FC<FormBbkViewProps> = ({ session, onNotify }) => {
  // Navigation tabs inside BBK View
  const [activeTab, setActiveTab] = useState<'form' | 'riwayat' | 'external'>('form');

  // BBK Records
  const [records, setRecords] = useState<BbkRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // Fallback
    }
    return DEFAULT_SEED_RECORDS;
  });

  // Save to LocalStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    } catch (err) {
      console.warn('Gagal menyimpan record BBK ke localStorage:', err);
    }
  }, [records]);

  // Form State
  const [departemen, setDepartemen] = useState<BbkDepartment>('Warehouse & Logistik');
  const [pemohonNama, setPemohonNama] = useState(session?.username || 'Staff WMS');
  const [vendorNama, setVendorNama] = useState('');
  const [bankNama, setBankNama] = useState('BCA (Bank Central Asia)');
  const [bankNoRekening, setBankNoRekening] = useState('');
  const [bankAtasNama, setBankAtasNama] = useState('');
  const [kategoriBiaya, setKategoriBiaya] = useState<BbkExpenseCategory>('Biaya Operasional Gudang');
  const [keperluan, setKeperluan] = useState('');
  const [tanggalPengajuan, setTanggalPengajuan] = useState(() => new Date().toISOString().split('T')[0]);

  // Item List
  const [items, setItems] = useState<BbkItemRow[]>([
    { id: '1', deskripsi: '', qty: 1, satuan: 'Pcs', hargaSatuan: 0, total: 0 },
  ]);

  // Tax Options
  const [pajakJenis, setPajakJenis] = useState<'Tanpa PPh' | 'PPh 21 (2.5%)' | 'PPh 21 (5%)' | 'PPh 23 (2%)' | 'PPh Final (0.5%)'>('Tanpa PPh');
  const [pajakTipe, setPajakTipe] = useState<'Tidak Ada' | 'Potong Langsung' | 'Gross Up'>('Tidak Ada');
  const [lampiranNota, setLampiranNota] = useState<string[]>([]);

  // Search & Filter in Riwayat Tab
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDept, setFilterDept] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');

  // Modals & Detail
  const [selectedRecord, setSelectedRecord] = useState<BbkRecord | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
  const [transferRefInput, setTransferRefInput] = useState('');
  const [transferTglInput, setTransferTglInput] = useState(() => new Date().toISOString().split('T')[0]);
  const [transferBuktiFile, setTransferBuktiFile] = useState<string>('');

  const printRef = useRef<HTMLDivElement>(null);

  // Auto Calculations
  const subtotal = useMemo(() => {
    return items.reduce((acc, curr) => acc + (Number(curr.total) || 0), 0);
  }, [items]);

  const pajakNominal = useMemo(() => {
    let rate = 0;
    if (pajakJenis === 'PPh 21 (2.5%)') rate = 0.025;
    if (pajakJenis === 'PPh 21 (5%)') rate = 0.05;
    if (pajakJenis === 'PPh 23 (2%)') rate = 0.02;
    if (pajakJenis === 'PPh Final (0.5%)') rate = 0.005;

    if (rate === 0 || pajakTipe === 'Tidak Ada') return 0;
    return Math.round(subtotal * rate);
  }, [subtotal, pajakJenis, pajakTipe]);

  const totalAkhir = useMemo(() => {
    if (pajakTipe === 'Potong Langsung') {
      return Math.max(0, subtotal - pajakNominal);
    } else if (pajakTipe === 'Gross Up') {
      return subtotal + pajakNominal;
    }
    return subtotal;
  }, [subtotal, pajakNominal, pajakTipe]);

  const terbilangStr = useMemo(() => {
    return terbilangRupiah(totalAkhir);
  }, [totalAkhir]);

  // Item List Handlers
  const handleItemChange = (index: number, field: keyof BbkItemRow, value: any) => {
    setItems((prev) => {
      const next = [...prev];
      const target = { ...next[index], [field]: value };

      if (field === 'qty' || field === 'hargaSatuan') {
        const qty = Number(field === 'qty' ? value : target.qty) || 0;
        const harga = Number(field === 'hargaSatuan' ? value : target.hargaSatuan) || 0;
        target.total = qty * harga;
      }
      next[index] = target;
      return next;
    });
  };

  const handleAddItemRow = () => {
    setItems((prev) => [
      ...prev,
      { id: Date.now().toString(), deskripsi: '', qty: 1, satuan: 'Pcs', hargaSatuan: 0, total: 0 },
    ]);
  };

  const handleRemoveItemRow = (index: number) => {
    if (items.length <= 1) {
      onNotify?.('Minimal harus ada 1 item rincian pengeluaran.', 'warning');
      return;
    }
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Image Upload Handler (Base64)
  const handleNotaUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    Array.from(files).forEach((file) => {
      if (!file.type.startsWith('image/')) {
        onNotify?.('Harap pilih file gambar (JPG / PNG).', 'warning');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (reader.result) {
          setLampiranNota((prev) => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Submit Handler
  const handleSubmitBbk = (e: React.FormEvent) => {
    e.preventDefault();

    if (!vendorNama.trim()) {
      onNotify?.('Nama Vendor / Penerima Dana wajib diisi.', 'error');
      return;
    }

    if (!bankNoRekening.trim()) {
      onNotify?.('Nomor Rekening Bank wajib diisi.', 'error');
      return;
    }

    if (!keperluan.trim()) {
      onNotify?.('Keterangan keperluan pengeluaran wajib diisi.', 'error');
      return;
    }

    const hasEmptyItem = items.some((it) => !it.deskripsi.trim() || it.total <= 0);
    if (hasEmptyItem) {
      onNotify?.('Harap lengkapi deskripsi dan nominal harga pada semua baris rincian.', 'error');
      return;
    }

    // Generate Nomor BBK
    const now = new Date();
    const yearMonth = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const randomSeq = String(records.length + 1).padStart(4, '0');
    const noBbk = `BBK-${yearMonth}-${randomSeq}`;

    const newRecord: BbkRecord = {
      id: `bbk_${Date.now()}`,
      noBbk,
      tanggalPengajuan,
      departemen,
      pemohonNama: pemohonNama.trim() || 'Staff WMS',
      vendorNama: vendorNama.trim(),
      bankNama,
      bankNoRekening: bankNoRekening.trim(),
      bankAtasNama: bankAtasNama.trim() || vendorNama.trim(),
      kategoriBiaya,
      keperluan: keperluan.trim(),
      items,
      subtotal,
      pajakJenis,
      pajakTipe,
      pajakNominal,
      totalAkhir,
      terbilang: terbilangStr,
      lampiranNota,
      status: 'Menunggu Approval',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setRecords((prev) => [newRecord, ...prev]);
    onNotify?.(`Pengajuan BBK ${noBbk} berhasil disimpan & masuk antrean approval!`, 'success');

    // Reset Form
    setVendorNama('');
    setBankNoRekening('');
    setBankAtasNama('');
    setKeperluan('');
    setItems([{ id: Date.now().toString(), deskripsi: '', qty: 1, satuan: 'Pcs', hargaSatuan: 0, total: 0 }]);
    setPajakJenis('Tanpa PPh');
    setPajakTipe('Tidak Ada');
    setLampiranNota([]);
    setActiveTab('riwayat');
  };

  // Filtered List
  const filteredRecords = useMemo(() => {
    return records.filter((r) => {
      const matchSearch =
        r.noBbk.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.vendorNama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.keperluan.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.pemohonNama.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.bankNoRekening.includes(searchTerm);

      const matchDept = filterDept === 'ALL' || r.departemen === filterDept;
      const matchStatus = filterStatus === 'ALL' || r.status === filterStatus;
      const matchCategory = filterCategory === 'ALL' || r.kategoriBiaya === filterCategory;

      return matchSearch && matchDept && matchStatus && matchCategory;
    });
  }, [records, searchTerm, filterDept, filterStatus, filterCategory]);

  // Statistics
  const stats = useMemo(() => {
    const total = records.length;
    const pending = records.filter((r) => r.status === 'Menunggu Approval').length;
    const approved = records.filter((r) => r.status === 'Disetujui').length;
    const transferred = records.filter((r) => r.status === 'Sudah Ditransfer').length;
    const rejected = records.filter((r) => r.status === 'Ditolak' || r.status === 'Dibatalkan').length;
    const totalNominal = records
      .filter((r) => r.status !== 'Ditolak' && r.status !== 'Dibatalkan')
      .reduce((acc, curr) => acc + curr.totalAkhir, 0);

    return { total, pending, approved, transferred, rejected, totalNominal };
  }, [records]);

  // Actions
  const handleApprove = (record: BbkRecord) => {
    const approver = session?.username || 'Supervisor WMS';
    const nowStr = new Date().toLocaleString('id-ID');
    setRecords((prev) =>
      prev.map((r) =>
        r.id === record.id
          ? {
              ...r,
              status: 'Disetujui',
              approvedBy: approver,
              approvedAt: nowStr,
              updatedAt: new Date().toISOString(),
            }
          : r
      )
    );
    if (selectedRecord?.id === record.id) {
      setSelectedRecord((prev) => (prev ? { ...prev, status: 'Disetujui', approvedBy: approver, approvedAt: nowStr } : null));
    }
    onNotify?.(`Pengajuan BBK ${record.noBbk} berhasil disetujui (Approved)!`, 'success');
  };

  const handleReject = (record: BbkRecord) => {
    const alasan = window.prompt('Masukkan alasan penolakan pengajuan BBK ini:') || 'Ditolak oleh atasan / finance';
    setRecords((prev) =>
      prev.map((r) =>
        r.id === record.id
          ? {
              ...r,
              status: 'Ditolak',
              catatanApproval: alasan,
              updatedAt: new Date().toISOString(),
            }
          : r
      )
    );
    if (selectedRecord?.id === record.id) {
      setSelectedRecord((prev) => (prev ? { ...prev, status: 'Ditolak', catatanApproval: alasan } : null));
    }
    onNotify?.(`Pengajuan BBK ${record.noBbk} ditolak.`, 'info');
  };

  const handleOpenTransferModal = (record: BbkRecord) => {
    setSelectedRecord(record);
    setTransferRefInput(`TRF-${record.bankNama.split(' ')[0]}-${Math.floor(100000 + Math.random() * 900000)}`);
    setTransferTglInput(new Date().toISOString().split('T')[0]);
    setTransferBuktiFile('');
    setIsTransferModalOpen(true);
  };

  const handleSaveTransfer = () => {
    if (!selectedRecord) return;
    const transferBy = session?.username || 'Finance Team';

    setRecords((prev) =>
      prev.map((r) =>
        r.id === selectedRecord.id
          ? {
              ...r,
              status: 'Sudah Ditransfer',
              transferTanggal: transferTglInput,
              transferRefBank: transferRefInput,
              transferBy,
              buktiTransferUrl: transferBuktiFile || undefined,
              updatedAt: new Date().toISOString(),
            }
          : r
      )
    );

    setIsTransferModalOpen(false);
    onNotify?.(`Bukti Transfer untuk BBK ${selectedRecord.noBbk} berhasil dicatat! Status: LUNAS/DITRANSFER.`, 'success');
  };

  const handleDeleteRecord = (id: string) => {
    if (window.confirm('Yakin ingin menghapus arsip pengajuan BBK ini?')) {
      setRecords((prev) => prev.filter((r) => r.id !== id));
      if (selectedRecord?.id === id) {
        setSelectedRecord(null);
        setIsPreviewOpen(false);
      }
      onNotify?.('Data BBK berhasil dihapus.', 'info');
    }
  };

  // Export to CSV
  const handleExportCsv = () => {
    if (records.length === 0) {
      onNotify?.('Tidak ada data BBK untuk di-export.', 'warning');
      return;
    }

    const headers = [
      'No BBK',
      'Tanggal Pengajuan',
      'Departemen',
      'Pemohon',
      'Vendor / Penerima',
      'Bank',
      'No Rekening',
      'Atas Nama',
      'Kategori Biaya',
      'Keperluan',
      'Subtotal',
      'Pajak PPh',
      'Total Akhir (IDR)',
      'Status',
      'Disetujui Oleh',
      'Ref Transfer',
    ];

    const rows = records.map((r) => [
      `"${r.noBbk}"`,
      `"${r.tanggalPengajuan}"`,
      `"${r.departemen}"`,
      `"${r.pemohonNama}"`,
      `"${r.vendorNama}"`,
      `"${r.bankNama}"`,
      `"${r.bankNoRekening}"`,
      `"${r.bankAtasNama}"`,
      `"${r.kategoriBiaya}"`,
      `"${r.keperluan.replace(/"/g, '""')}"`,
      r.subtotal,
      r.pajakNominal,
      r.totalAkhir,
      `"${r.status}"`,
      `"${r.approvedBy || '-'}"`,
      `"${r.transferRefBank || '-'}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Rekap_BBK_WMS_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onNotify?.('File CSV Rekap BBK berhasil diunduh!', 'success');
  };

  // Print Handler
  const handleTriggerPrint = () => {
    window.print();
  };

  return (
    <div className="w-full space-y-5">
      {/* 1. TOP HEADER & SYSTEM BANNER */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-teal-600 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
            <Receipt className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                Bukti Bank Keluar (BBK)
              </h1>
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                Native WMS Module
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
              Kelola Pengajuan Dana Operasional, Pembayaran Vendor, Approval &amp; Cetak Bukti Bank Keluar Standar Resmi
            </p>
          </div>
        </div>

        {/* Tab Switching Buttons */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('form')}
            className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'form'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Plus className="w-4 h-4" />
            <span>Form Pengajuan</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('riwayat')}
            className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'riwayat'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>Riwayat &amp; Approval</span>
            <span className="ml-1 px-1.5 py-0.2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 text-[10px] rounded-full font-mono">
              {records.length}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('external')}
            className={`px-3 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'external'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            title="Tautan Eksternal Google Apps Script"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Link GAS</span>
          </button>
        </div>
      </div>

      {/* 2. TAB 1: FORM PENGAJUAN BBK BARU */}
      {activeTab === 'form' && (
        <form onSubmit={handleSubmitBbk} className="space-y-5">
          {/* Main Card: Detail Pengajuan */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-7 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-sm">
                  1
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">Informasi Pengaju &amp; Vendor</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Pilih departemen pemohon dan data rekening penerima pembayaran</p>
                </div>
              </div>
              <span className="text-xs font-mono font-bold text-slate-400 dark:text-slate-500">
                Tanggal: {tanggalPengajuan}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Departemen */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Departemen / Divisi <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Building2 className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <select
                    value={departemen}
                    onChange={(e) => setDepartemen(e.target.value as BbkDepartment)}
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-hidden"
                  >
                    {DEPARTMENTS.map((dept) => (
                      <option key={dept} value={dept}>
                        {dept}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Pemohon */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nama Pemohon / Disiapkan Oleh <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={pemohonNama}
                    onChange={(e) => setPemohonNama(e.target.value)}
                    placeholder="Nama lengkap pemohon"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>

              {/* Kategori Biaya */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Kategori Pengeluaran <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Layers className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <select
                    value={kategoriBiaya}
                    onChange={(e) => setKategoriBiaya(e.target.value as BbkExpenseCategory)}
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-hidden"
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Nama Vendor / Penerima */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Dibayarkan Kepada / Vendor <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={vendorNama}
                  onChange={(e) => {
                    setVendorNama(e.target.value);
                    if (!bankAtasNama) setBankAtasNama(e.target.value);
                  }}
                  placeholder="Contoh: PT Sumber Rejeki / Nama Toko"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-hidden"
                />
              </div>

              {/* Bank Tujuan */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Bank Tujuan <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Wallet className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <select
                    value={bankNama}
                    onChange={(e) => setBankNama(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-hidden"
                  >
                    {BANK_OPTIONS.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* No Rekening & Atas Nama */}
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Nomor Rekening &amp; A/N Penerima <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    required
                    value={bankNoRekening}
                    onChange={(e) => setBankNoRekening(e.target.value)}
                    placeholder="No Rekening"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-hidden"
                  />
                  <input
                    type="text"
                    value={bankAtasNama}
                    onChange={(e) => setBankAtasNama(e.target.value)}
                    placeholder="A/N Rekening"
                    className="w-full px-3 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-hidden"
                  />
                </div>
              </div>

              {/* Deskripsi Keperluan (Full Span) */}
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  Keterangan Keperluan / Deskripsi Pengeluaran <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={keperluan}
                  onChange={(e) => setKeperluan(e.target.value)}
                  placeholder="Jelaskan secara ringkas peruntukan dana ini, misal: Pembelian lakban, bubble wrap, servis genset, dll..."
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Table Card: Rincian Item Pengeluaran */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 sm:p-7 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-sm">
                  2
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-900 dark:text-white">Rincian Item &amp; Subtotal</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Masukkan item barang/jasa, kuantitas, dan harga satuan</p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleAddItemRow}
                className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah Baris</span>
              </button>
            </div>

            {/* Item Rows Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-y border-slate-100 dark:border-slate-800">
                    <th className="py-2.5 px-3 w-12 text-center">No</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Deskripsi Barang / Jasa</th>
                    <th className="py-2.5 px-3 w-24 text-center">Qty</th>
                    <th className="py-2.5 px-3 w-28 text-center">Satuan</th>
                    <th className="py-2.5 px-3 w-36 text-right">Harga Satuan (Rp)</th>
                    <th className="py-2.5 px-3 w-40 text-right">Total (Rp)</th>
                    <th className="py-2.5 px-2 w-12 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {items.map((item, idx) => (
                    <tr key={item.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400 font-bold">{idx + 1}</td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          required
                          value={item.deskripsi}
                          onChange={(e) => handleItemChange(idx, 'deskripsi', e.target.value)}
                          placeholder="Nama item / pengeluaran..."
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 outline-hidden"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min="1"
                          required
                          value={item.qty || ''}
                          onChange={(e) => handleItemChange(idx, 'qty', Number(e.target.value))}
                          className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-center text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 outline-hidden"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="text"
                          value={item.satuan}
                          onChange={(e) => handleItemChange(idx, 'satuan', e.target.value)}
                          placeholder="Pcs/Dus/Pak"
                          className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-center text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 outline-hidden"
                        />
                      </td>
                      <td className="py-2.5 px-3">
                        <input
                          type="number"
                          min="0"
                          required
                          value={item.hargaSatuan || ''}
                          onChange={(e) => handleItemChange(idx, 'hargaSatuan', Number(e.target.value))}
                          placeholder="0"
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-right text-slate-900 dark:text-white focus:ring-1 focus:ring-emerald-500 outline-hidden"
                        />
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 dark:text-white">
                        {formatRupiah(item.total)}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItemRow(idx)}
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                          title="Hapus baris"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Calculations & Tax Settings */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Pajak Setting & Lampiran */}
              <div className="space-y-4">
                <div className="bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-3">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 block">
                    Pengaturan Pajak Penghasilan (PPh)
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Jenis Pajak
                      </label>
                      <select
                        value={pajakJenis}
                        onChange={(e) => setPajakJenis(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200"
                      >
                        <option value="Tanpa PPh">Tanpa PPh (0%)</option>
                        <option value="PPh 21 (2.5%)">PPh 21 (2.5%)</option>
                        <option value="PPh 21 (5%)">PPh 21 (5.0%)</option>
                        <option value="PPh 23 (2%)">PPh 23 (2.0%) - Jasa</option>
                        <option value="PPh Final (0.5%)">PPh Final (0.5%)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                        Metode Pajak
                      </label>
                      <select
                        value={pajakTipe}
                        onChange={(e) => setPajakTipe(e.target.value as any)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-slate-200"
                      >
                        <option value="Tidak Ada">Tidak Ada Pajak</option>
                        <option value="Potong Langsung">Potong Langsung (Netto Kurang)</option>
                        <option value="Gross Up">Gross Up (Ditanggung Perusahaan)</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Upload Lampiran Nota / Invoice */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                    Lampiran Nota / Kwitansi / Invoice (Opsional)
                  </label>
                  <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl hover:border-emerald-500 hover:bg-emerald-50/20 dark:hover:bg-emerald-950/10 cursor-pointer transition-all">
                    <Upload className="w-4 h-4 text-emerald-600" />
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                      Pilih Foto Nota / Kwitansi
                    </span>
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      onChange={handleNotaUpload}
                      className="hidden"
                    />
                  </label>

                  {lampiranNota.length > 0 && (
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {lampiranNota.map((url, i) => (
                        <div key={i} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-slate-200">
                          <img src={url} alt="Nota" className="w-full h-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setLampiranNota((prev) => prev.filter((_, idx) => idx !== i))}
                            className="absolute top-0.5 right-0.5 bg-rose-600 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Ringkasan Nominal & Terbilang */}
              <div className="bg-gradient-to-br from-slate-900 to-slate-800 text-white p-5 rounded-2xl space-y-3.5 shadow-md">
                <div className="flex justify-between items-center text-xs text-slate-300 pb-2 border-b border-slate-700">
                  <span>Subtotal Item</span>
                  <span className="font-mono font-bold">{formatRupiah(subtotal)}</span>
                </div>

                {pajakNominal > 0 && (
                  <div className="flex justify-between items-center text-xs text-amber-300 pb-2 border-b border-slate-700">
                    <span>
                      {pajakJenis} ({pajakTipe})
                    </span>
                    <span className="font-mono font-bold">
                      {pajakTipe === 'Potong Langsung' ? `- ${formatRupiah(pajakNominal)}` : `+ ${formatRupiah(pajakNominal)}`}
                    </span>
                  </div>
                )}

                <div className="flex justify-between items-center text-sm sm:text-base font-black text-emerald-400 pt-1">
                  <span>Total Pengajuan BBK</span>
                  <span className="text-xl sm:text-2xl font-mono">{formatRupiah(totalAkhir)}</span>
                </div>

                <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800 text-slate-300 text-xs italic">
                  <span className="font-bold text-slate-400 not-italic block mb-0.5">Terbilang:</span>
                  &ldquo;{terbilangStr}&rdquo;
                </div>
              </div>
            </div>
          </div>

          {/* Action Submit */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => {
                setVendorNama('');
                setKeperluan('');
                setBankNoRekening('');
                setItems([{ id: Date.now().toString(), deskripsi: '', qty: 1, satuan: 'Pcs', hargaSatuan: 0, total: 0 }]);
              }}
              className="px-5 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold transition-all cursor-pointer"
            >
              Reset Form
            </button>

            <button
              type="submit"
              className="px-8 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-sm font-black shadow-lg shadow-emerald-600/30 hover:shadow-xl hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-5 h-5" />
              <span>Simpan &amp; Ajukan BBK Baru</span>
            </button>
          </div>
        </form>
      )}

      {/* 3. TAB 2: RIWAYAT, APPROVAL & CETAK BBK */}
      {activeTab === 'riwayat' && (
        <div className="space-y-5">
          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs">
              <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 block">Total Pengajuan</span>
              <span className="text-xl font-black text-slate-900 dark:text-white">{stats.total}</span>
            </div>

            <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 shadow-xs">
              <span className="text-[11px] font-bold text-amber-700 dark:text-amber-400 block">Menunggu Approval</span>
              <span className="text-xl font-black text-amber-700 dark:text-amber-300">{stats.pending}</span>
            </div>

            <div className="p-4 rounded-2xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800/60 shadow-xs">
              <span className="text-[11px] font-bold text-blue-700 dark:text-blue-400 block">Disetujui (Ready TF)</span>
              <span className="text-xl font-black text-blue-700 dark:text-blue-300">{stats.approved}</span>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 shadow-xs">
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 block">Sudah Ditransfer</span>
              <span className="text-xl font-black text-emerald-700 dark:text-emerald-300">{stats.transferred}</span>
            </div>

            <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 shadow-xs">
              <span className="text-[11px] font-bold text-rose-700 dark:text-rose-400 block">Ditolak / Batal</span>
              <span className="text-xl font-black text-rose-700 dark:text-rose-300">{stats.rejected}</span>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 text-white shadow-xs col-span-2 sm:col-span-1">
              <span className="text-[11px] font-bold text-slate-400 block">Total Nilai BBK</span>
              <span className="text-sm font-black font-mono text-emerald-400 block truncate">
                {formatRupiah(stats.totalNominal)}
              </span>
            </div>
          </div>

          {/* Filter Bar & Export */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              {/* Search Box */}
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Cari No BBK, vendor, pemohon, nomor rekening, atau keperluan..."
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-hidden"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('form')}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-emerald-600/20"
                >
                  <Plus className="w-4 h-4" />
                  <span>Buat BBK Baru</span>
                </button>
              </div>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap text-xs pt-1">
              <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1">
                <Filter className="w-3 h-3" /> Filter:
              </span>

              {/* Filter Dept */}
              <select
                value={filterDept}
                onChange={(e) => setFilterDept(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                <option value="ALL">Semua Departemen</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              {/* Filter Status */}
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                <option value="ALL">Semua Status</option>
                <option value="Menunggu Approval">Menunggu Approval</option>
                <option value="Disetujui">Disetujui</option>
                <option value="Sudah Ditransfer">Sudah Ditransfer</option>
                <option value="Ditolak">Ditolak</option>
              </select>

              {/* Filter Category */}
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-2.5 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                <option value="ALL">Semua Kategori Biaya</option>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              {(filterDept !== 'ALL' || filterStatus !== 'ALL' || filterCategory !== 'ALL' || searchTerm) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterDept('ALL');
                    setFilterStatus('ALL');
                    setFilterCategory('ALL');
                    setSearchTerm('');
                  }}
                  className="text-rose-500 dark:text-rose-400 hover:underline text-[11px] font-bold ml-auto cursor-pointer"
                >
                  Reset Filter
                </button>
              )}
            </div>
          </div>

          {/* Records Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                    <th className="py-3 px-4">No. BBK &amp; Tanggal</th>
                    <th className="py-3 px-4">Departemen &amp; Pemohon</th>
                    <th className="py-3 px-4">Vendor &amp; Rekening</th>
                    <th className="py-3 px-4">Keperluan &amp; Kategori</th>
                    <th className="py-3 px-4 text-right">Nominal (IDR)</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                  {filteredRecords.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <Receipt className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                        <p className="font-bold text-sm text-slate-700 dark:text-slate-300">Belum ada pengajuan BBK</p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          Klik &quot;Buat BBK Baru&quot; untuk mengajukan permohonan dana pertama Anda.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredRecords.map((r) => {
                      let statusBadge = (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                          <Clock className="w-3 h-3" /> Menunggu SPV
                        </span>
                      );

                      if (r.status === 'Disetujui') {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                            <CheckCircle2 className="w-3 h-3" /> Siap Bayar
                          </span>
                        );
                      } else if (r.status === 'Sudah Ditransfer') {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                            <Check className="w-3 h-3" /> Lunas / TF
                          </span>
                        );
                      } else if (r.status === 'Ditolak') {
                        statusBadge = (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                            <XCircle className="w-3 h-3" /> Ditolak
                          </span>
                        );
                      }

                      return (
                        <tr key={r.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 block">
                              {r.noBbk}
                            </span>
                            <span className="text-[11px] text-slate-400 font-mono">{r.tanggalPengajuan}</span>
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900 dark:text-white block">{r.departemen}</span>
                            <span className="text-[11px] text-slate-500 dark:text-slate-400">Oleh: {r.pemohonNama}</span>
                          </td>

                          <td className="py-3 px-4">
                            <span className="font-bold text-slate-900 dark:text-white block">{r.vendorNama}</span>
                            <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                              {r.bankNama.split(' ')[0]} - {r.bankNoRekening}
                            </span>
                          </td>

                          <td className="py-3 px-4 max-w-xs">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 line-clamp-1">
                              {r.keperluan}
                            </span>
                            <span className="text-[10px] text-slate-400 block">{r.kategoriBiaya}</span>
                          </td>

                          <td className="py-3 px-4 text-right">
                            <span className="font-mono font-black text-sm text-slate-900 dark:text-white block">
                              {formatRupiah(r.totalAkhir)}
                            </span>
                            {r.items.length > 1 && (
                              <span className="text-[10px] text-slate-400">({r.items.length} item rincian)</span>
                            )}
                          </td>

                          <td className="py-3 px-4 text-center">{statusBadge}</td>

                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              {/* Preview / Detail */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRecord(r);
                                  setIsPreviewOpen(true);
                                }}
                                className="p-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg transition-colors cursor-pointer"
                                title="Lihat Detail & Dokumen"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>

                              {/* Cetak Formulir Standar A4 */}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedRecord(r);
                                  setIsPrintModalOpen(true);
                                }}
                                className="p-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 rounded-lg transition-colors cursor-pointer"
                                title="Cetak Dokumen Resmi BBK"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>

                              {/* Approval Quick Action */}
                              {r.status === 'Menunggu Approval' && (
                                <button
                                  type="button"
                                  onClick={() => handleApprove(r)}
                                  className="p-1.5 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/60 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 rounded-lg transition-colors cursor-pointer"
                                  title="Setujui Pengajuan BBK"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Upload TF Action */}
                              {r.status === 'Disetujui' && (
                                <button
                                  type="button"
                                  onClick={() => handleOpenTransferModal(r)}
                                  className="p-1.5 bg-purple-50 hover:bg-purple-100 dark:bg-purple-950/60 dark:hover:bg-purple-900/60 text-purple-700 dark:text-purple-300 rounded-lg transition-colors cursor-pointer"
                                  title="Input Bukti Transfer Bank"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                </button>
                              )}

                              {/* Delete */}
                              <button
                                type="button"
                                onClick={() => handleDeleteRecord(r.id)}
                                className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors cursor-pointer"
                                title="Hapus"
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

      {/* 4. TAB 3: LINK EKSTERNAL GOOGLE APPS SCRIPT (OPSIONAL) */}
      {activeTab === 'external' && (
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-6 shadow-xs space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <ExternalLink className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 dark:text-white">
                  Tautan Eksternal Form BBK Google Apps Script
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Akses cadangan ke web app Google Apps Script bagi pengguna yang memiliki hak akses email Google
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700 text-xs space-y-2">
              <p className="font-mono text-slate-700 dark:text-slate-300 break-all">{EXTERNAL_GAS_BBK_URL}</p>
              <div className="flex items-center gap-2 pt-2">
                <a
                  href={EXTERNAL_GAS_BBK_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Buka di Tab Baru</span>
                </a>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(EXTERNAL_GAS_BBK_URL);
                    onNotify?.('Link eksternal berhasil disalin!', 'success');
                  }}
                  className="px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-200"
                >
                  Salin URL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL DETAIL / PREVIEW BBK */}
      {isPreviewOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl flex flex-col">
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Receipt className="w-5 h-5 text-emerald-600" />
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  Detail Pengajuan: {selectedRecord.noBbk}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsPreviewOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl">
                <div>
                  <span className="text-slate-400 block font-semibold">Tanggal</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">{selectedRecord.tanggalPengajuan}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Departemen</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedRecord.departemen}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Pemohon</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedRecord.pemohonNama}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Vendor / Penerima</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedRecord.vendorNama}</span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Rekening Bank</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {selectedRecord.bankNama} - {selectedRecord.bankNoRekening} (A/N {selectedRecord.bankAtasNama})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block font-semibold">Kategori</span>
                  <span className="font-bold text-slate-900 dark:text-white">{selectedRecord.kategoriBiaya}</span>
                </div>
              </div>

              <div>
                <span className="text-slate-400 block font-semibold mb-1">Keperluan:</span>
                <p className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
                  {selectedRecord.keperluan}
                </p>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold">
                    <tr>
                      <th className="p-2.5">Deskripsi</th>
                      <th className="p-2.5 text-center w-16">Qty</th>
                      <th className="p-2.5 text-right w-28">Harga</th>
                      <th className="p-2.5 text-right w-32">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {selectedRecord.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-medium">{it.deskripsi}</td>
                        <td className="p-2.5 text-center font-mono">
                          {it.qty} {it.satuan}
                        </td>
                        <td className="p-2.5 text-right font-mono">{formatRupiah(it.hargaSatuan)}</td>
                        <td className="p-2.5 text-right font-mono font-bold">{formatRupiah(it.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="p-4 bg-slate-900 text-white rounded-xl space-y-1">
                <div className="flex justify-between font-bold text-sm text-emerald-400">
                  <span>Total Pengajuan</span>
                  <span className="font-mono text-base">{formatRupiah(selectedRecord.totalAkhir)}</span>
                </div>
                <p className="text-[11px] text-slate-300 italic">&ldquo;{selectedRecord.terbilang}&rdquo;</p>
              </div>

              {/* Transfer Info if Done */}
              {selectedRecord.status === 'Sudah Ditransfer' && (
                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 space-y-1">
                  <div className="flex items-center gap-1.5 font-bold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Telah Ditransfer &amp; Selesai Dibukukan</span>
                  </div>
                  <p className="text-[11px]">
                    Tanggal: {selectedRecord.transferTanggal} | Ref: {selectedRecord.transferRefBank} | Oleh: {selectedRecord.transferBy}
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  setIsPreviewOpen(false);
                  setIsPrintModalOpen(true);
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Cetak Dokumen A4</span>
              </button>

              <div className="flex items-center gap-2">
                {selectedRecord.status === 'Menunggu Approval' && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        handleReject(selectedRecord);
                        setIsPreviewOpen(false);
                      }}
                      className="px-3.5 py-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-xl text-xs font-bold transition-all"
                    >
                      Tolak
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleApprove(selectedRecord);
                        setIsPreviewOpen(false);
                      }}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition-all"
                    >
                      Setujui (Approve)
                    </button>
                  </>
                )}
                {selectedRecord.status === 'Disetujui' && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsPreviewOpen(false);
                      handleOpenTransferModal(selectedRecord);
                    }}
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold transition-all"
                  >
                    Input Bukti Transfer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 6. MODAL INPUT BUKTI TRANSFER (FINANCE) */}
      {isTransferModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 max-w-md w-full shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-black text-slate-900 dark:text-white">Input Pembayaran / Bukti Transfer</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                <span className="text-slate-400 block">No. BBK:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">{selectedRecord.noBbk}</span>
                <span className="text-slate-400 block mt-1">Vendor &amp; Rekening:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {selectedRecord.vendorNama} ({selectedRecord.bankNama} - {selectedRecord.bankNoRekening})
                </span>
                <span className="text-slate-400 block mt-1">Total Transfer:</span>
                <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-sm">
                  {formatRupiah(selectedRecord.totalAkhir)}
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Tanggal Transfer
                </label>
                <input
                  type="date"
                  value={transferTglInput}
                  onChange={(e) => setTransferTglInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Nomor Referensi Bank / No. Transaksi
                </label>
                <input
                  type="text"
                  value={transferRefInput}
                  onChange={(e) => setTransferRefInput(e.target.value)}
                  placeholder="Contoh: TRF-BCA-9810238"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-mono font-bold"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setIsTransferModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleSaveTransfer}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20"
              >
                Konfirmasi Pembayaran (Lunas)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. MODAL CETAK FORMULIR STANDAR RESMI BBK A4 */}
      {isPrintModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
          <div className="bg-white text-slate-900 rounded-2xl max-w-3xl w-full shadow-2xl p-6 sm:p-8 space-y-6 max-h-[95vh] overflow-y-auto">
            {/* Top Toolbar in Print Modal */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 no-print">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-emerald-600" />
                <span className="font-bold text-sm text-slate-800">Pratinjau Dokumen Cetak Bukti Bank Keluar (A4)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleTriggerPrint}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>Cetak / Simpan PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPrintModalOpen(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 rounded-xl"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PRINTABLE A4 CONTENT */}
            <div ref={printRef} className="printable-bbk space-y-6 text-slate-900 font-sans p-2">
              {/* Kop Dokumen */}
              <div className="flex justify-between items-start border-b-2 border-slate-900 pb-4">
                <div>
                  <h2 className="text-xl font-black tracking-tight uppercase">BUKTI BANK KELUAR (BBK)</h2>
                  <p className="text-xs font-bold text-slate-600">SISTEM MANAJEMEN GUDANG &amp; OPERASIONAL WMS</p>
                  <p className="text-[11px] text-slate-500">Departemen: {selectedRecord.departemen}</p>
                </div>
                <div className="text-right">
                  <div className="font-mono font-black text-base text-slate-900">{selectedRecord.noBbk}</div>
                  <div className="text-xs text-slate-600">Tanggal: {selectedRecord.tanggalPengajuan}</div>
                  <div className="text-[11px] font-bold text-emerald-700 uppercase mt-0.5">
                    Status: {selectedRecord.status}
                  </div>
                </div>
              </div>

              {/* Data Vendor & Rekening Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs border border-slate-300 rounded-lg p-3 bg-slate-50/50">
                <div>
                  <span className="text-slate-500 font-semibold block">Dibayarkan Kepada:</span>
                  <span className="font-bold text-sm text-slate-900">{selectedRecord.vendorNama}</span>
                  <span className="text-slate-500 block mt-2 font-semibold">Keperluan / Keterangan:</span>
                  <span className="font-medium text-slate-800">{selectedRecord.keperluan}</span>
                </div>

                <div>
                  <span className="text-slate-500 font-semibold block">Transfer ke Bank:</span>
                  <span className="font-bold text-slate-900">{selectedRecord.bankNama}</span>
                  <span className="font-mono font-bold text-slate-900 block">{selectedRecord.bankNoRekening}</span>
                  <span className="text-slate-600 text-[11px]">A/N {selectedRecord.bankAtasNama}</span>
                  {selectedRecord.transferRefBank && (
                    <span className="text-[11px] font-mono text-emerald-700 block mt-1">
                      Ref: {selectedRecord.transferRefBank}
                    </span>
                  )}
                </div>
              </div>

              {/* Tabel Rincian */}
              <div className="border border-slate-300 rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-200/80 font-bold uppercase text-slate-700 border-b border-slate-300">
                    <tr>
                      <th className="p-2.5 w-10 text-center">No</th>
                      <th className="p-2.5">Deskripsi Rincian Pengeluaran</th>
                      <th className="p-2.5 w-16 text-center">Qty</th>
                      <th className="p-2.5 w-20 text-center">Satuan</th>
                      <th className="p-2.5 w-28 text-right">Harga Satuan</th>
                      <th className="p-2.5 w-32 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedRecord.items.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2 text-center font-mono">{idx + 1}</td>
                        <td className="p-2 font-medium">{it.deskripsi}</td>
                        <td className="p-2 text-center font-mono">{it.qty}</td>
                        <td className="p-2 text-center">{it.satuan}</td>
                        <td className="p-2 text-right font-mono">{formatRupiah(it.hargaSatuan)}</td>
                        <td className="p-2 text-right font-mono font-bold">{formatRupiah(it.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-400 bg-slate-100 font-bold">
                    <tr>
                      <td colSpan={5} className="p-2.5 text-right font-bold uppercase">
                        Total Nilai Pengajuan
                      </td>
                      <td className="p-2.5 text-right font-mono font-black text-sm">
                        {formatRupiah(selectedRecord.totalAkhir)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Terbilang Box */}
              <div className="p-3 bg-slate-100 border border-slate-300 rounded-lg text-xs italic">
                <span className="font-bold not-italic text-slate-700">Terbilang: </span>
                &ldquo;{selectedRecord.terbilang}&rdquo;
              </div>

              {/* 4 Kolom Tanda Tangan */}
              <div className="grid grid-cols-4 gap-2 pt-6 text-center text-xs">
                <div className="space-y-12">
                  <span className="font-bold text-slate-700 block">Dibuat / Diajukan:</span>
                  <div>
                    <div className="border-b border-slate-900 mx-4" />
                    <span className="font-bold text-[11px] block mt-1">{selectedRecord.pemohonNama}</span>
                    <span className="text-[10px] text-slate-500">Staff / Pemohon</span>
                  </div>
                </div>

                <div className="space-y-12">
                  <span className="font-bold text-slate-700 block">Diperiksa / SPV:</span>
                  <div>
                    <div className="border-b border-slate-900 mx-4" />
                    <span className="font-bold text-[11px] block mt-1">{selectedRecord.approvedBy || '( .................... )'}</span>
                    <span className="text-[10px] text-slate-500">Supervisor</span>
                  </div>
                </div>

                <div className="space-y-12">
                  <span className="font-bold text-slate-700 block">Disetujui / Manager:</span>
                  <div>
                    <div className="border-b border-slate-900 mx-4" />
                    <span className="font-bold text-[11px] block mt-1">( .................... )</span>
                    <span className="text-[10px] text-slate-500">Manager Operasional</span>
                  </div>
                </div>

                <div className="space-y-12">
                  <span className="font-bold text-slate-700 block">Dibukukan / Finance:</span>
                  <div>
                    <div className="border-b border-slate-900 mx-4" />
                    <span className="font-bold text-[11px] block mt-1">{selectedRecord.transferBy || '( .................... )'}</span>
                    <span className="text-[10px] text-slate-500">Kasir / Finance</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
