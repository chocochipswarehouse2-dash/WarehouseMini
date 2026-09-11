import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  Plus, 
  Trash2, 
  MapPin, 
  Package, 
  User, 
  Phone, 
  FileText, 
  Bookmark, 
  ChevronDown, 
  Loader2, 
  Save, 
  Upload, 
  Download, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  QrCode, 
  RefreshCw,
  Database,
  Truck,
  FileSpreadsheet
} from 'lucide-react';
import Papa from 'papaparse';
import QRCode from 'qrcode';
import { 
  fetchJasaKirimList, 
  DEFAULT_JASA_KIRIM 
} from '../services/gasManualShipment';
import { 
  fetchDataAlamatList, 
  saveDataAlamatList, 
  deleteDataAlamatItem, 
  AddressData 
} from '../services/gasDataAlamat';

export interface LabelItem {
  id: string;
  pengirim_nama: string;
  pengirim_telp: string;
  penerima_nama: string;
  penerima_telp: string;
  penerima_alamat: string;
  deskripsi: string;
  ekspedisi: string;
  resi: string;
  invoice_no: string; // ID Paket
  qr_content: string;
  qr_data_url?: string;
}

export const generatePackageId = (): string => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `PKG-${year}${month}${day}-${rand}`;
};

export const createQrDataUrl = async (text: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(text, {
      width: 180,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });
  } catch (err) {
    console.error('Error generating QR code:', err);
    return '';
  }
};

export const QrCodeImage: React.FC<{ text: string; size?: number; className?: string }> = ({
  text,
  size = 64,
  className = '',
}) => {
  const [dataUrl, setDataUrl] = useState<string>('');

  useEffect(() => {
    let isMounted = true;
    if (!text) {
      setDataUrl('');
      return;
    }
    createQrDataUrl(text).then((url) => {
      if (isMounted) setDataUrl(url);
    });
    return () => {
      isMounted = false;
    };
  }, [text]);

  if (!dataUrl) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`bg-gray-100 dark:bg-slate-800 flex items-center justify-center text-[7px] font-mono text-gray-400 ${className}`}
      >
        QR...
      </div>
    );
  }

  return (
    <img
      src={dataUrl}
      alt="QR Code"
      width={size}
      height={size}
      className={`block object-contain ${className}`}
    />
  );
};

export const CetakLabelView: React.FC = () => {
  const [labels, setLabels] = useState<LabelItem[]>([]);
  
  // Data Alamat (Google Sheets & Local Cache)
  const [addressBook, setAddressBook] = useState<AddressData[]>([]);
  const [isAddressDropdownOpen, setIsAddressDropdownOpen] = useState(false);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isSavingQueue, setIsSavingQueue] = useState(false);

  // Jasa Kirim (Sheet Outlet Kolom C)
  const [jasaKirimList, setJasaKirimList] = useState<string[]>(DEFAULT_JASA_KIRIM);
  const [selectedJasaKirim, setSelectedJasaKirim] = useState<string>('JNE Regular');
  const [isCustomJasaKirim, setIsCustomJasaKirim] = useState<boolean>(false);
  const [customJasaKirim, setCustomJasaKirim] = useState<string>('');
  const [isSyncingJasaKirim, setIsSyncingJasaKirim] = useState<boolean>(false);

  // CSV Import State (Single Button)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importNotice, setImportNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form State
  const [idPaket, setIdPaket] = useState<string>(() => generatePackageId());
  const [pengirimNama, setPengirimNama] = useState('CHOCOCHIPS');
  const [pengirimTelp, setPengirimTelp] = useState('');
  
  const [penerimaNama, setPenerimaNama] = useState('');
  const [penerimaTelp, setPenerimaTelp] = useState('');
  const [penerimaAlamat, setPenerimaAlamat] = useState('');
  
  const [deskripsi, setDeskripsi] = useState('');
  const [qty, setQty] = useState<number>(1);

  // Fetch initial data
  useEffect(() => {
    loadAddressBook();
    loadJasaKirim();
  }, []);

  const loadJasaKirim = async () => {
    setIsSyncingJasaKirim(true);
    try {
      const list = await fetchJasaKirimList();
      if (list && list.length > 0) {
        setJasaKirimList(list);
        if (!selectedJasaKirim || !list.includes(selectedJasaKirim)) {
          setSelectedJasaKirim(list[0]);
        }
      }
    } catch (e) {
      console.warn('Gagal memuat Jasa Kirim dari Sheet:', e);
    } finally {
      setIsSyncingJasaKirim(false);
    }
  };

  const loadAddressBook = async () => {
    setIsLoadingAddresses(true);
    try {
      const data = await fetchDataAlamatList();
      if (data && Array.isArray(data)) {
        setAddressBook(data);
      }
    } catch (e) {
      console.warn('Gagal memuat address book:', e);
    } finally {
      setIsLoadingAddresses(false);
    }
  };

  const getEffectiveJasaKirim = (): string => {
    if (isCustomJasaKirim) {
      return customJasaKirim.trim() || 'Internal / Toko';
    }
    return selectedJasaKirim || 'JNE Regular';
  };

  // Simpan Alamat Form ke Sheet 'Data Alamat'
  const handleSaveToAddressBook = async () => {
    if (!penerimaNama.trim() || !penerimaAlamat.trim()) {
      alert('Nama dan Alamat Penerima harus diisi untuk disimpan ke Data Alamat!');
      return;
    }
    setIsSavingAddress(true);
    try {
      const newAddress: AddressData = {
        id: `addr_${Date.now()}`,
        nama_penerima: penerimaNama.trim(),
        no_telp: penerimaTelp.trim(),
        alamat: penerimaAlamat.trim(),
        keterangan: deskripsi.trim(),
        jasa_kirim: getEffectiveJasaKirim(),
        created_at: new Date().toISOString(),
      };
      await saveDataAlamatList([newAddress]);
      setAddressBook(prev => [newAddress, ...prev.filter(p => p.nama_penerima !== newAddress.nama_penerima || p.alamat !== newAddress.alamat)]);
      setImportNotice({ type: 'success', message: 'Alamat berhasil disimpan ke Sheet "Data Alamat" dan Auto-Fill!' });
      setTimeout(() => setImportNotice(null), 5000);
    } catch (e: any) {
      console.error(e);
      alert('Gagal menyimpan alamat ke database.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  // Simpan Semua Antrean Cetak ke Sheet 'Data Alamat'
  const handleSaveQueueToDatabase = async () => {
    if (labels.length === 0) {
      alert('Antrean cetak masih kosong.');
      return;
    }
    setIsSavingQueue(true);
    try {
      const uniqueItems: AddressData[] = [];
      const seen = new Set<string>();

      for (const lbl of labels) {
        const key = `${lbl.penerima_nama.toLowerCase()}_${lbl.penerima_alamat.toLowerCase()}`;
        if (!seen.has(key) && lbl.penerima_nama && lbl.penerima_alamat) {
          seen.add(key);
          uniqueItems.push({
            id: `addr_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            nama_penerima: lbl.penerima_nama,
            no_telp: lbl.penerima_telp || '',
            alamat: lbl.penerima_alamat,
            keterangan: lbl.deskripsi || '',
            jasa_kirim: lbl.ekspedisi || '',
            created_at: new Date().toISOString(),
          });
        }
      }

      await saveDataAlamatList(uniqueItems);
      await loadAddressBook();
      setImportNotice({
        type: 'success',
        message: `Berhasil menyimpan ${uniqueItems.length} alamat penerima dari antrean ke Sheet "Data Alamat"!`,
      });
      setTimeout(() => setImportNotice(null), 6000);
    } catch (err: any) {
      console.error(err);
      alert('Gagal menyimpan antrean ke sheet Data Alamat.');
    } finally {
      setIsSavingQueue(false);
    }
  };

  const handleDeleteAddress = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Hapus alamat ini dari Data Alamat?')) return;
    try {
      await deleteDataAlamatItem(id);
      setAddressBook(prev => prev.filter(item => item.id !== id));
    } catch (e) {
      console.error(e);
      alert('Gagal menghapus alamat');
    }
  };

  const handleSelectAddress = (item: AddressData) => {
    setPenerimaNama(item.nama_penerima);
    setPenerimaTelp(item.no_telp || '');
    setPenerimaAlamat(item.alamat);
    if (item.keterangan && !deskripsi) {
      setDeskripsi(item.keterangan);
    }
    if (item.jasa_kirim) {
      if (jasaKirimList.includes(item.jasa_kirim)) {
        setSelectedJasaKirim(item.jasa_kirim);
        setIsCustomJasaKirim(false);
      } else {
        setIsCustomJasaKirim(true);
        setCustomJasaKirim(item.jasa_kirim);
      }
    }
    setIsAddressDropdownOpen(false);
  };

  // Tambah Label ke Antrean
  const handleAddLabel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!penerimaNama.trim() || !penerimaAlamat.trim()) {
      alert('Nama dan Alamat Penerima wajib diisi');
      return;
    }

    const effectiveJasaKirim = getEffectiveJasaKirim();
    const newLabels: LabelItem[] = [];
    const baseId = idPaket.trim() || generatePackageId();

    for (let i = 0; i < qty; i++) {
      const currentId = qty > 1 ? `${baseId}-${i + 1}` : baseId;
      const qrText = `Manual paket + ID: ${currentId}`;
      const qrDataUrl = await createQrDataUrl(qrText);

      newLabels.push({
        id: `lbl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        pengirim_nama: pengirimNama || 'CHOCOCHIPS',
        pengirim_telp: pengirimTelp,
        penerima_nama: penerimaNama.trim(),
        penerima_telp: penerimaTelp.trim(),
        penerima_alamat: penerimaAlamat.trim(),
        deskripsi: deskripsi.trim(),
        ekspedisi: effectiveJasaKirim,
        resi: '',
        invoice_no: currentId,
        qr_content: qrText,
        qr_data_url: qrDataUrl,
      });
    }

    setLabels(prev => [...prev, ...newLabels]);

    // Reset input penerima & barang, buat ID Paket baru
    setPenerimaNama('');
    setPenerimaTelp('');
    setPenerimaAlamat('');
    setDeskripsi('');
    setQty(1);
    setIdPaket(generatePackageId());
  };

  const handleRemoveLabel = (id: string) => {
    setLabels(labels.filter(l => l.id !== id));
  };

  const handlePrint = () => {
    if (labels.length === 0) {
      alert('Antrean label kosong!');
      return;
    }
    window.print();
  };

  // Download Template CSV untuk panduan input paket massal
  const handleDownloadTemplate = () => {
    const headers = [
      'id_paket',
      'pilihan_jasa_kirim',
      'nama_penerima',
      'no_telp_penerima',
      'alamat_penerima',
      'nama_pengirim',
      'no_telp_pengirim',
      'isi_paket',
      'jumlah_copy',
    ];

    const sampleRows = [
      [
        'PKG-20260910-1001',
        'JNE Regular',
        'Siti Rahma',
        '081234567890',
        'Jl. Merdeka No. 45 RT 02/05 Gambir Jakarta Pusat',
        pengirimNama || 'CHOCOCHIPS',
        pengirimTelp || '',
        '2x Dress Floral M, 1x Scarf',
        '1',
      ],
      [
        'PKG-20260910-1002',
        'SiCepat REG',
        'Budi Santoso',
        '087811223344',
        'Komplek Permai Blok B2 No. 10 Sukajadi Bandung',
        pengirimNama || 'CHOCOCHIPS',
        pengirimTelp || '',
        '1x Kemeja Rayon L',
        '1',
      ],
    ];

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...sampleRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'template_input_paket_a6.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export seluruh data hasil input di antrean cetak ke file CSV
  // Hasil file export ini 100% siap di-import kembali kapan saja lewat tombol 'Import CSV'
  const handleExportQueue = () => {
    if (labels.length === 0) {
      alert('Antrean cetak masih kosong. Silakan input manual paket atau tambahkan data terlebih dahulu untuk diekspor.');
      return;
    }

    const headers = [
      'id_paket',
      'pilihan_jasa_kirim',
      'nama_penerima',
      'no_telp_penerima',
      'alamat_penerima',
      'nama_pengirim',
      'no_telp_pengirim',
      'isi_paket',
      'jumlah_copy',
    ];

    const rows = labels.map(lbl => [
      lbl.invoice_no,
      lbl.ekspedisi || 'JNE Regular',
      lbl.penerima_nama,
      lbl.penerima_telp || '',
      lbl.penerima_alamat,
      lbl.pengirim_nama || 'CHOCOCHIPS',
      lbl.pengirim_telp || '',
      lbl.deskripsi || '',
      '1',
    ]);

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...rows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',')),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const dateStr = new Date().toISOString().slice(0, 10);
    link.setAttribute('download', `antrean_label_a6_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setImportNotice({
      type: 'success',
      message: `Berhasil mengekspor ${labels.length} paket ke file CSV. Anda dapat mengimpor file ini kembali sewaktu-waktu!`,
    });
    setTimeout(() => setImportNotice(null), 6000);
  };

  // Import CSV Massal (Satu tombol saja)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as Record<string, any>[];
          if (!rows || rows.length === 0) {
            setImportNotice({ type: 'error', message: 'File CSV kosong atau tidak memiliki baris data.' });
            return;
          }

          const newImportedLabels: LabelItem[] = [];
          let skippedCount = 0;

          const getField = (row: Record<string, any>, candidates: string[]) => {
            const keys = Object.keys(row);
            for (const c of candidates) {
              const target = c.toLowerCase().replace(/[\s_-]/g, '');
              const matchedKey = keys.find(k => k.trim().toLowerCase().replace(/[\s_-]/g, '') === target);
              if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null) {
                const val = String(row[matchedKey]).trim();
                if (val) return val;
              }
            }
            return '';
          };

          for (let index = 0; index < rows.length; index++) {
            const row = rows[index];
            const rNama = getField(row, ['nama_penerima', 'penerima_nama', 'penerima', 'nama', 'recipient', 'receiver', 'customer']);
            const rAlamat = getField(row, ['alamat_penerima', 'penerima_alamat', 'alamat', 'address', 'lokasi', 'alamat_lengkap']);
            const rTelp = getField(row, ['no_telp_penerima', 'telp_penerima', 'penerima_telp', 'telepon', 'no_telp', 'telp', 'no_hp', 'phone', 'hp']);
            const sNama = getField(row, ['nama_pengirim', 'pengirim_nama', 'pengirim', 'sender']) || pengirimNama || 'CHOCOCHIPS';
            const sTelp = getField(row, ['no_telp_pengirim', 'telp_pengirim', 'pengirim_telp', 'sender_phone']) || pengirimTelp || '';
            const rDeskripsi = getField(row, ['isi_paket', 'deskripsi', 'barang', 'keterangan', 'items', 'paket']);
            const rJasaKirim = getField(row, ['pilihan_jasa_kirim', 'jasa_kirim', 'ekspedisi', 'kurir', 'courier', 'logistic']) || getEffectiveJasaKirim();
            const customId = getField(row, ['id_paket', 'no_invoice', 'invoice_no', 'invoice', 'nomor_invoice', 'inv']);

            const rawQty = getField(row, ['jumlah_copy', 'qty', 'copy', 'jumlah', 'copies']);
            const itemQty = Math.max(1, parseInt(rawQty, 10) || 1);

            if (!rNama && !rAlamat) {
              skippedCount++;
              continue;
            }

            const baseId = customId || generatePackageId();

            for (let c = 0; c < itemQty; c++) {
              const currentId = itemQty > 1 ? `${baseId}-${c + 1}` : baseId;
              const qrText = `Manual paket + ID: ${currentId}`;
              const qrDataUrl = await createQrDataUrl(qrText);

              newImportedLabels.push({
                id: `lbl_import_${Date.now()}_${index}_${c}_${Math.random().toString(36).substring(2, 7)}`,
                pengirim_nama: sNama,
                pengirim_telp: sTelp,
                penerima_nama: rNama || 'Tanpa Nama',
                penerima_telp: rTelp,
                penerima_alamat: rAlamat || '-',
                deskripsi: rDeskripsi,
                ekspedisi: rJasaKirim,
                resi: '',
                invoice_no: currentId,
                qr_content: qrText,
                qr_data_url: qrDataUrl,
              });
            }
          }

          if (newImportedLabels.length === 0) {
            setImportNotice({ 
              type: 'error', 
              message: 'Tidak ada data valid yang dapat diimpor. Pastikan header CSV memiliki kolom nama_penerima dan alamat_penerima.' 
            });
            return;
          }

          setLabels(prev => [...prev, ...newImportedLabels]);
          const successMsg = `Berhasil mengimpor ${newImportedLabels.length} label dari CSV!${skippedCount > 0 ? ` (${skippedCount} baris kosong dilewati)` : ''}`;
          setImportNotice({ type: 'success', message: successMsg });
          setTimeout(() => setImportNotice(null), 7000);
        } catch (err: any) {
          console.error(err);
          setImportNotice({ type: 'error', message: `Gagal memproses file CSV: ${err?.message || 'Format tidak valid'}` });
        } finally {
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (err) => {
        setImportNotice({ type: 'error', message: `Gagal membaca file CSV: ${err.message}` });
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
  };

  return (
    <>
      {/* 
        ========================================================
        CSS UNTUK PRINT A6 (Membunyikan UI dan mengatur ukuran halaman)
        ========================================================
      */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #print-area, #print-area * {
            visibility: visible;
          }
          #print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
          @page {
            size: A6 portrait;
            margin: 0;
          }
          .page-break {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>

      {/* 
        ========================================================
        UI APLIKASI (Tidak akan tercetak)
        ========================================================
      */}
      <div className="max-w-6xl mx-auto space-y-4 print:hidden mb-20 px-2 sm:px-4">
        
        {/* Notifikasi / Alert Banner */}
        {importNotice && (
          <div className={`p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs font-bold border transition-all ${
            importNotice.type === 'success' 
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
          }`}>
            <div className="flex items-center gap-2.5">
              {importNotice.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
              )}
              <span>{importNotice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setImportNotice(null)}
              className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Input CSV File Tersembunyi (Cukup 1 input untuk seluruh halaman) */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleFileUpload}
        />

        {/* Grid 2 Kolom: Form Input Label & Antrean Cetak (A6) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* ====================================================
              KOLOM KIRI: FORM INPUT PAKET (Termasuk Import CSV & Auto-Fill)
             ==================================================== */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            
            {/* Header Form Input dengan Opsi Import CSV & Auto-Fill */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                  Form Input Paket
                </h2>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* 1. Tombol Template CSV */}
                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Download Contoh Template CSV untuk input paket massal"
                >
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  Template CSV
                </button>

                {/* 2. Tombol Import CSV */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 rounded-lg text-xs font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Import Data Penerima Massal dari CSV (termasuk file hasil export antrean)"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Import CSV
                </button>

                {/* Dropdown Auto-Fill dari Sheet Data Alamat */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsAddressDropdownOpen(!isAddressDropdownOpen)}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                    Auto-Fill
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>
                  
                  {isAddressDropdownOpen && (
                    <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                      <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <Database className="w-3.5 h-3.5 text-indigo-500" />
                          <h3 className="text-xs font-black text-slate-700 dark:text-slate-300">Database Alamat (Sheet)</h3>
                        </div>
                        <button
                          type="button"
                          onClick={loadAddressBook}
                          disabled={isLoadingAddresses}
                          className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1"
                        >
                          <RefreshCw className={`w-2.5 h-2.5 ${isLoadingAddresses ? 'animate-spin' : ''}`} />
                          Sinkron
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto p-2">
                        {isLoadingAddresses ? (
                          <div className="p-4 flex justify-center">
                            <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                          </div>
                        ) : addressBook.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">
                            Belum ada data alamat tersimpan.<br/>Simpan alamat di bawah atau dari antrean cetak.
                          </div>
                        ) : (
                          addressBook.map((item) => (
                            <div
                              key={item.id}
                              onClick={() => handleSelectAddress(item)}
                              className="p-2.5 hover:bg-indigo-50/50 dark:hover:bg-slate-700/50 rounded-lg cursor-pointer group mb-1 border border-transparent hover:border-indigo-100 dark:hover:border-slate-700 transition-colors relative"
                            >
                              <div className="flex items-center gap-1.5">
                                <h4 className="text-xs font-bold text-slate-800 dark:text-white truncate">{item.nama_penerima}</h4>
                                {item.jasa_kirim && (
                                  <span className="px-1.5 py-0.2 text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold">
                                    {item.jasa_kirim}
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">{item.alamat}</p>
                              <button
                                onClick={(e) => handleDeleteAddress(e, item.id)}
                                className="absolute top-2.5 right-2 p-1 bg-white dark:bg-slate-800 rounded text-slate-400 hover:text-rose-500 shadow-xs opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Hapus dari database"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleAddLabel} className="p-4 sm:p-5 space-y-4">
              
              {/* =======================================================
                  BAGIAN ATAS: ID PAKET & PILIHAN JASA KIRIM (SEPERTI MANUAL SHIPMENT)
                  ======================================================= */}
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3.5">
                
                {/* 1. ID Paket (Auto-Generated) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                      <QrCode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      ID Paket (Auto-Generated)
                    </label>
                    <button
                      type="button"
                      onClick={() => setIdPaket(generatePackageId())}
                      className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1 cursor-pointer transition-colors"
                      title="Acak / Generate ID Baru"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Acak Ulang
                    </button>
                  </div>
                  <input
                    type="text"
                    value={idPaket}
                    onChange={e => setIdPaket(e.target.value)}
                    placeholder="Contoh: PKG-20260910-1234"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex items-center gap-1.5 mt-1.5 text-[10.5px] text-slate-500 dark:text-slate-400">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">Isi QR Code:</span>
                    <code className="px-1.5 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-[9.5px] font-mono text-indigo-600 dark:text-indigo-400 truncate">
                      Manual paket + ID: {idPaket || 'PKG-...'}
                    </code>
                  </div>
                </div>

                {/* 2. Pilihan Jasa Kirim (Sheet Outlet Kolom C) */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      Pilihan Jasa Kirim (Sheet Outlet Kolom C)
                    </label>
                    <button
                      type="button"
                      onClick={loadJasaKirim}
                      disabled={isSyncingJasaKirim}
                      className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Sinkron dari Google Sheet 'outlet' kolom C"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isSyncingJasaKirim ? 'animate-spin' : ''}`} />
                      {isSyncingJasaKirim ? 'Sinkron...' : 'Sinkron Sheet'}
                    </button>
                  </div>

                  <div className="space-y-2">
                    <select
                      value={isCustomJasaKirim ? '__CUSTOM__' : selectedJasaKirim}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === '__CUSTOM__') {
                          setIsCustomJasaKirim(true);
                        } else {
                          setIsCustomJasaKirim(false);
                          setSelectedJasaKirim(val);
                        }
                      }}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500"
                    >
                      {jasaKirimList.map((jk) => (
                        <option key={jk} value={jk}>
                          {jk}
                        </option>
                      ))}
                      <option value="__CUSTOM__">+ Ketik Jasa Kirim Lainnya (Manual)</option>
                    </select>

                    {isCustomJasaKirim && (
                      <input
                        type="text"
                        value={customJasaKirim}
                        onChange={(e) => setCustomJasaKirim(e.target.value)}
                        placeholder="Ketik nama ekspedisi / kurir manual..."
                        className="w-full px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 rounded-lg focus:ring-2 focus:ring-emerald-500 text-slate-800 dark:text-slate-100"
                      />
                    )}
                  </div>
                </div>

              </div>

              {/* Pengirim */}
              <div className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-xl border border-slate-100 dark:border-slate-800">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2 uppercase">Pengirim</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      type="text"
                      value={pengirimNama}
                      onChange={e => setPengirimNama(e.target.value)}
                      placeholder="Nama Pengirim"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      value={pengirimTelp}
                      onChange={e => setPengirimTelp(e.target.value)}
                      placeholder="Telp Pengirim (Opsional)"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Penerima */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Penerima <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 sm:col-span-1 relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={penerimaNama}
                      onChange={e => setPenerimaNama(e.target.value)}
                      placeholder="Nama Penerima"
                      required
                      className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1 relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={penerimaTelp}
                      onChange={e => setPenerimaTelp(e.target.value)}
                      placeholder="No. Telp / HP"
                      className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-2 relative">
                    <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <textarea
                      value={penerimaAlamat}
                      onChange={e => setPenerimaAlamat(e.target.value)}
                      placeholder="Alamat Lengkap"
                      required
                      rows={3}
                      className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-2 flex justify-end">
                    <button
                      type="button"
                      onClick={handleSaveToAddressBook}
                      disabled={isSavingAddress || !penerimaNama || !penerimaAlamat}
                      className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1.5 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {isSavingAddress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Simpan ke Sheet Data Alamat (Auto-Fill)
                    </button>
                  </div>
                </div>
              </div>

              {/* Detail Kiriman (Field Kurir & No Resi Dihilangkan Sesuai Request) */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">
                  Detail Kiriman
                </label>
                <div className="relative">
                  <Package className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <textarea
                    value={deskripsi}
                    onChange={e => setDeskripsi(e.target.value)}
                    placeholder="Isi Paket (Misal: 3x Kemeja Putih L, 1x Topi)"
                    rows={2}
                    className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Tombol Tambah ke Antrean */}
              <div className="pt-2 flex gap-3 items-end">
                <div className="w-24">
                  <label className="block text-[10px] font-bold text-slate-500 mb-1">Jumlah Copy</label>
                  <input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-center font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Tambah ke Antrean
                </button>
              </div>
            </form>
          </div>

          {/* ====================================================
              KOLOM KANAN: CETAK LABEL ALAMAT (A6) & ANTREAN CETAK
             ==================================================== */}
          <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col h-[650px] overflow-hidden">
            
            {/* Header Antrean dengan Judul Cetak Label Alamat (A6) dan Tombol Cetak Langsung */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                    <Printer className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Cetak Label Alamat (A6)
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Antrean Cetak Label Siap Print
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-xs font-black rounded-full border border-indigo-200 dark:border-indigo-800/60">
                  {labels.length} Label
                </span>
              </div>

              {/* Tombol Cetak Utama Langsung di Bubble Antrean */}
              <button
                type="button"
                onClick={handlePrint}
                disabled={labels.length === 0}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed text-sm"
              >
                <Printer className="w-4 h-4" />
                Cetak {labels.length} Label A6
              </button>

              {/* Opsi Ekspor Antrean ke CSV & Simpan Antrean ke Data Alamat */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleExportQueue}
                  disabled={labels.length === 0}
                  className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                  title="Export seluruh antrean sebagai file CSV (dapat di-import kembali kapan saja via tombol Import CSV)"
                >
                  <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Export Antrean (CSV)
                </button>

                <button
                  type="button"
                  onClick={handleSaveQueueToDatabase}
                  disabled={isSavingQueue || labels.length === 0}
                  className="flex-1 px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800/60 rounded-lg text-[11px] font-bold text-emerald-700 dark:text-emerald-300 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shadow-xs"
                  title="Simpan seluruh data penerima antrean ke Google Sheet Data Alamat untuk dipanggil via Auto-Fill"
                >
                  {isSavingQueue ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                  )}
                  Simpan ke Sheet
                </button>
              </div>

              {/* Tips 2 Opsi Simpan Data */}
              <div className="bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 rounded-lg px-2.5 py-1.5 text-[10px] text-slate-600 dark:text-slate-400 leading-tight">
                <span className="font-bold text-indigo-700 dark:text-indigo-300">2 Opsi Simpan:</span> Unduh file <strong className="text-slate-800 dark:text-slate-200">Export Antrean</strong> untuk dicetak lagi via <strong className="text-slate-800 dark:text-slate-200">Import CSV</strong>, atau klik <strong className="text-slate-800 dark:text-slate-200">Simpan ke Sheet</strong> agar tersimpan di database & bisa dipanggil via <strong className="text-slate-800 dark:text-slate-200">Auto-Fill</strong>.
              </div>
            </div>

            {/* List Isi Antrean */}
            <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
              {labels.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Package className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-700" />
                  <p className="text-xs font-semibold">Belum ada label di antrean</p>
                  <p className="text-[10px] text-slate-400 mt-1 text-center max-w-xs">
                    Isi form di sebelah kiri atau klik Import CSV untuk memasukkan penerima.
                  </p>
                </div>
              ) : (
                labels.map((lbl, idx) => (
                  <div 
                    key={lbl.id} 
                    className="p-3 border border-slate-200 dark:border-slate-700/80 rounded-xl bg-slate-50/70 dark:bg-slate-800/40 flex gap-2.5 group hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                  >
                    <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-black text-slate-600 dark:text-slate-300 flex-shrink-0 mt-0.5">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <h4 className="text-xs font-bold text-slate-800 dark:text-white truncate">
                            {lbl.penerima_nama}
                          </h4>
                          <span className="px-1.5 py-0.2 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[9px] font-mono font-bold rounded border border-indigo-200 dark:border-indigo-800 flex-shrink-0">
                            {lbl.invoice_no}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveLabel(lbl.id)}
                          className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
                          title="Hapus dari antrean"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">{lbl.penerima_alamat}</p>
                      
                      <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {lbl.ekspedisi && (
                          <span className="text-[9.5px] font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 px-1.5 py-0.5 rounded">
                            {lbl.ekspedisi}
                          </span>
                        )}
                        <span className="text-[9.5px] text-slate-500 dark:text-slate-400 flex items-center gap-1 font-mono">
                          <QrCode className="w-2.5 h-2.5 text-indigo-500 flex-shrink-0" />
                          {lbl.invoice_no}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer Antrean */}
            {labels.length > 0 && (
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <button
                  type="button"
                  onClick={() => setLabels([])}
                  className="w-full py-1.5 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 font-bold rounded-lg hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors text-[11px] cursor-pointer"
                >
                  Kosongkan Antrean
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 
        ========================================================
        AREA PRINT (Hanya muncul saat dicetak ke printer A6)
        ========================================================
      */}
      <div id="print-area" className="hidden print:block bg-white w-full text-black">
        {labels.map((lbl) => (
          <div key={lbl.id} className="page-break w-[105mm] min-h-[148mm] h-auto p-3 relative bg-white box-border border-b border-dashed border-transparent">
            {/* Outline box disesuaikan untuk A6 */}
            <div className="w-full h-full min-h-[calc(148mm-24px)] border-2 border-black flex flex-col relative bg-white">
              
              {/* 1. Header Label: Kiri Jasa Kirim, Kanan CHOCOCHIPS */}
              <div className="border-b-2 border-black px-3 py-2 bg-gray-50 flex justify-between items-center break-inside-avoid">
                <div className="text-base font-black tracking-wider uppercase leading-none text-black">
                  {lbl.ekspedisi || 'PENGIRIMAN PAKET'}
                </div>
                <div className="text-[15px] font-black tracking-widest uppercase leading-none text-black">
                  CHOCOCHIPS
                </div>
              </div>

              {/* 2. Penerima Box (Utama & Besar) */}
              <div className="p-3 border-b-2 border-black bg-white flex flex-col justify-center break-inside-avoid">
                <div className="text-[11px] font-extrabold text-gray-500 uppercase tracking-wider mb-0.5">Kepada / Penerima:</div>
                <div className="text-xl font-black uppercase mb-0.5 leading-tight text-black">{lbl.penerima_nama}</div>
                {lbl.penerima_telp && (
                  <div className="text-[14px] font-extrabold font-mono text-gray-900 mb-1">{lbl.penerima_telp}</div>
                )}
                <div className="text-[13px] font-bold leading-snug whitespace-pre-wrap text-black">{lbl.penerima_alamat}</div>
              </div>

              {/* 3. Warning Box: PERHATIAN JANGAN DITERIMA JIKA RUSAK */}
              <div className="border-b-2 border-black py-2 px-2 bg-gray-100 flex items-center justify-center text-center break-inside-avoid">
                <div className="text-[10px] font-black text-black tracking-tight uppercase leading-tight">
                  ⚠️ PERHATIAN: JANGAN DITERIMA JIKA KONDISI PAKET RUSAK ATAU SEGEL TERBUKA &bull; WAJIB VIDEO UNBOXING
                </div>
              </div>

              {/* 4. Pengirim & Total Item */}
              <div className="flex border-b-2 border-black break-inside-avoid">
                {/* Pengirim */}
                <div className="p-3 border-r-2 border-black flex-1">
                  <div className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mb-0.5">Dari / Pengirim:</div>
                  <div className="text-[13px] font-black uppercase text-black">{lbl.pengirim_nama || 'CHOCOCHIPS'}</div>
                  {lbl.pengirim_telp && <div className="text-[11px] font-bold font-mono text-gray-700">{lbl.pengirim_telp}</div>}
                </div>
                {/* Qty / Indikator */}
                <div className="p-2 w-24 flex flex-col items-center justify-center bg-gray-50">
                  <span className="text-[10px] font-extrabold text-gray-500 uppercase">PAKET</span>
                  <span className="text-sm font-black text-black">1/1</span>
                </div>
              </div>

              {/* 5. Footer: QR Code & ID Paket */}
              <div className="px-3 py-3 bg-gray-50 flex items-center justify-between gap-3 box-border border-b-2 border-black break-inside-avoid">
                {/* Left: ID Paket details */}
                <div className="flex-1 min-w-0 pr-1">
                  <div className="inline-block px-1.5 py-0.5 bg-black text-white text-[9px] font-black uppercase tracking-wider rounded mb-1">
                    MANUAL PAKET
                  </div>
                  <div className="text-[10px] font-extrabold text-gray-500 uppercase tracking-wider mt-1">ID Paket:</div>
                  <div className="text-base font-black font-mono tracking-tight text-black truncate leading-tight">
                    {lbl.invoice_no}
                  </div>
                  <div className="text-[11px] font-mono text-gray-600 mt-1.5 truncate">
                    {lbl.ekspedisi ? `Jasa Kirim: ${lbl.ekspedisi}` : `ID: ${lbl.invoice_no}`}
                  </div>
                </div>

                {/* Right: Clean QR Code (Tanpa Border Luar & Tanpa Caption) */}
                <div className="flex items-center justify-center flex-shrink-0">
                  {lbl.qr_data_url ? (
                    <img
                      src={lbl.qr_data_url}
                      alt="QR Code"
                      className="w-[74px] h-[74px] block object-contain"
                    />
                  ) : (
                    <QrCodeImage
                      text={lbl.qr_content || `Manual paket + ID: ${lbl.invoice_no}`}
                      size={74}
                    />
                  )}
                </div>
              </div>

              {/* 6. Deskripsi Paket (Isi Paket - Paling Bawah) */}
              <div className="p-3 bg-white flex-1 flex flex-col">
                <div className="text-[11px] font-extrabold text-gray-500 uppercase tracking-wider mb-1">Isi Paket:</div>
                <div className="font-bold text-[13px] whitespace-pre-wrap leading-snug text-gray-900 break-words flex-1">
                  {lbl.deskripsi || '-'}
                </div>
              </div>

            </div>
          </div>
        ))}
      </div>
    </>
  );
};
