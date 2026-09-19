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
  FileSpreadsheet, 
  Search, 
  Edit2 
} from 'lucide-react';
import Papa from 'papaparse';
import QRCode from 'qrcode';
import { 
  fetchJasaKirimList, 
  DEFAULT_JASA_KIRIM 
} from '../../services/gasManualShipment';
import { 
  fetchDataAlamatList, 
  saveDataAlamatList, 
  deleteDataAlamatItem, 
  AddressData 
} from '../../services/gasDataAlamat';

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

export const LabelPaketTab: React.FC = () => {
  const [labels, setLabels] = useState<LabelItem[]>([]);
  
  // Data Alamat (Database & Local Cache)
  const [addressBook, setAddressBook] = useState<AddressData[]>([]);
  const [isAddressDropdownOpen, setIsAddressDropdownOpen] = useState(false);
  const [searchAddress, setSearchAddress] = useState('');
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isSavingQueue, setIsSavingQueue] = useState(false);

  // Jasa Kirim (Database Config)
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
  const [qty, setQty] = useState<number | ''>(1);

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
      console.warn('Gagal memuat Jasa Kirim dari Database:', e);
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

  // Simpan Alamat Form ke Database
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
      const res = await saveDataAlamatList([newAddress]);
      if (!res.success) throw new Error(res.message);
      setAddressBook(prev => [newAddress, ...prev.filter(p => p.nama_penerima !== newAddress.nama_penerima || p.alamat !== newAddress.alamat)]);
      setImportNotice({ type: 'success', message: 'Alamat berhasil disimpan ke Database "Data Alamat" dan Auto-Fill!' });
      setTimeout(() => setImportNotice(null), 5000);
    } catch (e: any) {
      console.error(e);
      alert('Gagal menyimpan alamat ke database.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  // Simpan Semua Antrean Cetak ke Database
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

      const res = await saveDataAlamatList(uniqueItems);
      if (!res.success) throw new Error(res.message);
      await loadAddressBook();
      setImportNotice({
        type: 'success',
        message: `Berhasil menyimpan ${uniqueItems.length} alamat penerima dari antrean ke Database!`,
      });
      setTimeout(() => setImportNotice(null), 6000);
    } catch (err: any) {
      console.error(err);
      alert('Gagal menyimpan antrean ke Database Data Alamat.');
    } finally {
      setIsSavingQueue(false);
    }
  };

  const handleDeleteAddress = async (e: React.MouseEvent, id: string, namaPenerima?: string) => {
    e.stopPropagation();
    if (!confirm(`Hapus alamat ${namaPenerima ? `"${namaPenerima}"` : ''} dari Data Alamat?`)) return;
    try {
      await deleteDataAlamatItem(id);
      setAddressBook(prev => prev.filter(item => item.id !== id && (!namaPenerima || item.nama_penerima !== namaPenerima)));
    } catch (e) {
      console.error(e);
      alert('Gagal menghapus alamat');
    }
  };

  const handleSelectAddress = (item: AddressData) => {
    setPenerimaNama(item.nama_penerima);
    setPenerimaTelp(item.no_telp || '');
    setPenerimaAlamat(item.alamat);
    if (item.keterangan) {
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
    setSearchAddress('');
  };

  const filteredAddressBook = addressBook.filter((item) => {
    if (!searchAddress.trim()) return true;
    const q = searchAddress.toLowerCase().trim();
    return (
      item.nama_penerima.toLowerCase().includes(q) ||
      item.alamat.toLowerCase().includes(q) ||
      (item.no_telp && item.no_telp.includes(q)) ||
      (item.keterangan && item.keterangan.toLowerCase().includes(q))
    );
  });

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
    const totalQty = Math.max(1, Number(qty) || 1);

    for (let i = 0; i < totalQty; i++) {
      const currentId = totalQty > 1 ? `${baseId}-${i + 1}` : baseId;
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

  const handleEditLabel = (id: string) => {
    const lbl = labels.find((l) => l.id === id);
    if (!lbl) return;
    
    // Load back into state
    setPenerimaNama(lbl.penerima_nama);
    setPenerimaTelp(lbl.penerima_telp || '');
    setPenerimaAlamat(lbl.penerima_alamat);
    setPengirimNama(lbl.pengirim_nama || '');
    setPengirimTelp(lbl.pengirim_telp || '');
    setDeskripsi(lbl.deskripsi || '');
    
    if (lbl.ekspedisi) {
      if (jasaKirimList.includes(lbl.ekspedisi)) {
        setSelectedJasaKirim(lbl.ekspedisi);
        setIsCustomJasaKirim(false);
      } else {
        setSelectedJasaKirim('Lainnya');
        setIsCustomJasaKirim(true);
        setCustomJasaKirim(lbl.ekspedisi);
      }
    }
    
    // Remove from queue so it can be re-added
    setLabels(labels.filter(l => l.id !== id));
  };

  const handlePrint = () => {
    if (labels.length === 0) {
      alert('Antrean label kosong!');
      return;
    }
    
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.error('Print error:', err);
        alert('Gagal memunculkan dialog cetak. Jika Anda membukanya di dalam iframe/preview, silakan buka aplikasi di Tab Baru (Open in New Tab) untuk mencetak.');
      }
    }, 300);
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
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            width: 105mm !important;
            height: 148mm !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden !important;
          }
          #print-area-paket, #print-area-paket * {
            visibility: visible !important;
          }
          #print-area-paket {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 105mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            z-index: 999999 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: 105mm 148mm;
            margin: 0 !important;
          }
          .page-break-paket {
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .page-break-paket:not(:last-child) {
            page-break-after: always !important;
            break-after: page !important;
          }
          .page-break-paket:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      `}</style>

      {/* 
        ========================================================
        UI APLIKASI (Tidak akan tercetak)
        ========================================================
      */}
      <div className="space-y-3 print:hidden">
        
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
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
          
          {/* ====================================================
              KOLOM KIRI: FORM INPUT PAKET (Termasuk Import CSV & Auto-Fill)
             ==================================================== */}
          <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800">
            
            {/* Header Form Input dengan Opsi Import CSV & Auto-Fill */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 rounded-t-2xl flex flex-wrap justify-between items-center gap-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                  Form Input Label Paket
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

                {/* Dropdown Auto-Fill dari Supabase Database */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !isAddressDropdownOpen;
                      setIsAddressDropdownOpen(next);
                      if (next && addressBook.length === 0) {
                        loadAddressBook();
                      }
                    }}
                    className="px-2.5 py-1.5 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-700/60 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Bookmark className="w-3.5 h-3.5 text-amber-500" />
                    Auto-Fill
                    {addressBook.length > 0 && (
                      <span className="px-1.5 py-0.2 text-[10px] bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 font-extrabold rounded-full">
                        {addressBook.length}
                      </span>
                    )}
                    <ChevronDown className="w-3 h-3 text-slate-400" />
                  </button>
                  
                  {isAddressDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-40 bg-black/10 sm:bg-transparent"
                        onClick={() => setIsAddressDropdownOpen(false)}
                      />

                      <div className="absolute left-0 sm:left-auto sm:right-0 top-full mt-2 w-[calc(100vw-2.5rem)] max-w-[340px] sm:max-w-md sm:w-96 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden animate-in fade-in-50 duration-150">
                        <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Database className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                            <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 truncate">
                              Database Alamat ({addressBook.length})
                            </h3>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={loadAddressBook}
                              disabled={isLoadingAddresses}
                              className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-bold cursor-pointer"
                              title="Sinkronisasi dari Supabase Database"
                            >
                              <RefreshCw className={`w-2.5 h-2.5 ${isLoadingAddresses ? 'animate-spin' : ''}`} />
                              Sinkron
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsAddressDropdownOpen(false)}
                              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-md transition-colors cursor-pointer"
                              title="Tutup"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Search Bar */}
                        <div className="p-2 border-b border-slate-100 dark:border-slate-700/60 bg-white dark:bg-slate-800">
                          <div className="relative">
                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                              type="text"
                              value={searchAddress}
                              onChange={(e) => setSearchAddress(e.target.value)}
                              placeholder="Cari penerima, telepon, alamat..."
                              className="w-full pl-8 pr-7 py-1.5 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            {searchAddress && (
                              <button
                                type="button"
                                onClick={() => setSearchAddress('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* List Alamat */}
                        <div className="max-h-72 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-700/50">
                          {isLoadingAddresses ? (
                            <div className="p-6 flex flex-col items-center justify-center gap-2 text-slate-400">
                              <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                              <span className="text-xs font-semibold">Memuat database alamat...</span>
                            </div>
                          ) : filteredAddressBook.length === 0 ? (
                            <div className="p-4 text-center text-xs text-slate-500 space-y-1.5">
                              {searchAddress ? (
                                <p>Tidak ditemukan alamat cocok dengan "{searchAddress}".</p>
                              ) : (
                                <>
                                  <p className="font-bold text-slate-700 dark:text-slate-300">Belum ada data alamat tersimpan.</p>
                                  <p className="text-[11px] text-slate-400 leading-snug">
                                    Simpan alamat di bawah atau dari antrean cetak agar tersimpan di Supabase & bisa auto-fill kapan saja.
                                  </p>
                                </>
                              )}
                            </div>
                          ) : (
                            filteredAddressBook.map((item) => (
                              <div
                                key={item.id}
                                onClick={() => handleSelectAddress(item)}
                                className="p-2.5 hover:bg-indigo-50/60 dark:hover:bg-slate-700/60 rounded-xl cursor-pointer group transition-colors relative"
                              >
                                <div className="flex items-start justify-between gap-2 pr-6">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <h4 className="text-xs font-bold text-slate-800 dark:text-white truncate">
                                        {item.nama_penerima}
                                      </h4>
                                      {item.no_telp && (
                                        <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                                          ({item.no_telp})
                                        </span>
                                      )}
                                      {item.jasa_kirim && (
                                        <span className="px-1.5 py-0.2 text-[9px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded font-semibold">
                                          {item.jasa_kirim}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-[10px] text-slate-600 dark:text-slate-300 line-clamp-2 mt-1 leading-snug">
                                      {item.alamat}
                                    </p>
                                    {item.keterangan && (
                                      <p className="text-[9px] text-indigo-600 dark:text-indigo-400 truncate mt-0.5 font-medium">
                                        Note: {item.keterangan}
                                      </p>
                                    )}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={(e) => handleDeleteAddress(e, item.id, item.nama_penerima)}
                                  className="absolute top-2.5 right-2 p-1.5 bg-white dark:bg-slate-800 rounded-lg text-slate-400 hover:text-rose-500 shadow-xs opacity-70 sm:opacity-0 group-hover:opacity-100 transition-all hover:scale-105 cursor-pointer"
                                  title="Hapus dari database"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <form onSubmit={handleAddLabel} className="p-2 sm:p-3 space-y-2">
              
              {/* ID PAKET & JASA KIRIM */}
              <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 space-y-3.5">
                
                {/* 1. ID Paket */}
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

                {/* 2. Pilihan Jasa Kirim */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase flex items-center gap-1.5">
                      <Truck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      Pilihan Jasa Kirim (Database Config)
                    </label>
                    <button
                      type="button"
                      onClick={loadJasaKirim}
                      disabled={isSyncingJasaKirim}
                      className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      title="Sinkron dari Database Outlet Config"
                    >
                      <RefreshCw className={`w-2.5 h-2.5 ${isSyncingJasaKirim ? 'animate-spin' : ''}`} />
                      {isSyncingJasaKirim ? 'Sinkron...' : 'Sinkron Database'}
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
                      Simpan ke Database (Auto-Fill)
                    </button>
                  </div>
                </div>
              </div>

              {/* Detail Kiriman */}
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
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const val = e.target.value;
                      setQty(val === '' ? '' : Math.max(0, parseInt(val, 10) || 0));
                    }}
                    onBlur={() => {
                      if (qty === '' || Number(qty) < 1) {
                        setQty(1);
                      }
                    }}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-center font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <button
                  type="submit"
                  className="flex-1 px-2 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Plus className="w-4 h-4" />
                  Tambah ke Antrean Cetak
                </button>
              </div>

            </form>
          </div>

          {/* ====================================================
              KOLOM KANAN: DAFTAR ANTREAN & ACTION PRINT A6
             ==================================================== */}
          <div className="lg:col-span-5 space-y-3">
            
            {/* Header Box Action */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                    Antrean Cetak Label Paket
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Total: <strong className="text-indigo-600 dark:text-indigo-400 font-extrabold">{labels.length}</strong> Lembar A6
                  </p>
                </div>
                {labels.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Kosongkan semua antrean cetak?')) setLabels([]);
                    }}
                    className="text-xs text-rose-500 hover:text-rose-700 font-bold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Hapus Semua
                  </button>
                )}
              </div>

              {/* Action Buttons: Export Antrean & Simpan ke DB */}
              {labels.length > 0 && (
                <div className="flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800 flex-wrap">
                  <button
                    type="button"
                    onClick={handleExportQueue}
                    className="flex-1 px-3 py-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs"
                    title="Simpan & Download seluruh antrean ini ke file CSV"
                  >
                    <Download className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    Export CSV
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveQueueToDatabase}
                    disabled={isSavingQueue}
                    className="flex-1 px-3 py-2 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
                    title="Simpan semua alamat penerima yang ada di antrean ke Database Supabase"
                  >
                    {isSavingQueue ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />}
                    Simpan ke DB
                  </button>
                </div>
              )}

              {/* Big Print Button */}
              <button
                type="button"
                onClick={handlePrint}
                disabled={labels.length === 0}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm rounded-xl transition-all shadow-md shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                <Printer className="w-5 h-5" />
                Cetak {labels.length} Label A6 (Print)
              </button>
            </div>

            {/* List Item Antrean */}
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {labels.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-8 text-center text-slate-400 dark:text-slate-500 space-y-2">
                  <Package className="w-10 h-10 mx-auto stroke-1 text-slate-300 dark:text-slate-600" />
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-400">Antrean Cetak Masih Kosong</p>
                  <p className="text-[11px] text-slate-400 leading-snug">
                    Isi formulir di sebelah kiri atau klik <strong>Import CSV</strong> untuk menambahkan data secara massal.
                  </p>
                </div>
              ) : (
                labels.map((lbl, idx) => (
                  <div
                    key={lbl.id}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-2xs hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors relative group flex items-start justify-between gap-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="w-5 h-5 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-full flex items-center justify-center text-[10px] font-black shrink-0">
                          {idx + 1}
                        </span>
                        <h4 className="text-xs font-bold text-slate-800 dark:text-white truncate">
                          {lbl.penerima_nama}
                        </h4>
                        {lbl.ekspedisi && (
                          <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[9px] font-bold">
                            {lbl.ekspedisi}
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-slate-400">
                          {lbl.invoice_no}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-400 line-clamp-1">
                        {lbl.penerima_alamat}
                      </p>
                      {lbl.deskripsi && (
                        <p className="text-[10px] text-indigo-600 dark:text-indigo-400 truncate mt-0.5">
                          📦 {lbl.deskripsi}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleEditLabel(lbl.id)}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Edit / Tarik Kembali ke Form"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveLabel(lbl.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Hapus dari antrean"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>

        </div>

      </div>

      {/* 
        ========================================================
        ELEMEN CETAK A6 (Hanya terlihat saat window.print() aktif)
        ========================================================
      */}
      <div id="print-area-paket" className="hidden print:block text-black bg-white">
        {labels.map((lbl, idx) => (
          <div
            key={lbl.id || idx}
            className="page-break-paket w-[105mm] h-[148mm] box-border p-[4mm] bg-white flex flex-col justify-between relative overflow-hidden"
          >
            <div className="w-full h-full border-[2.5px] border-black flex flex-col justify-between box-border">
              
              {/* TOP SECTION: Header & Courier Info */}
              <div>
                 {/* 1. Header Bar: EKSPEDISI & NO RESI / INVOICE */}
                 <div className="border-b-[2.5px] border-black p-3 bg-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                       <span className="text-[18px] font-black tracking-wider uppercase">{lbl.ekspedisi || 'REGULAR'}</span>
                    </div>
                    <div className="text-right">
                       <div className="text-[10px] font-bold text-gray-500 uppercase">ID PAKET</div>
                       <div className="text-[13px] font-black font-mono tracking-tight">{lbl.invoice_no || '-'}</div>
                    </div>
                 </div>

                 {/* 2. Addresses Area: Penerima & Pengirim + QR */}
                 <div className="border-b-[2.5px] border-black flex">
                    {/* Penerima & Pengirim (Left Box) */}
                    <div className="flex-1 p-3 border-r-[2.5px] border-black flex flex-col justify-between">
                      {/* Penerima */}
                      <div className="mb-3">
                        <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5 tracking-wider">PENERIMA:</div>
                        <div className="text-[14px] font-black leading-tight text-black mb-1">{lbl.penerima_nama || '-'}</div>
                        <div className="text-[11px] font-bold text-gray-800 leading-snug whitespace-pre-wrap">{lbl.penerima_alamat || '-'}</div>
                        {lbl.penerima_telp && (
                          <div className="text-[11px] font-black font-mono text-black mt-1">Telp: {lbl.penerima_telp}</div>
                        )}
                      </div>

                      {/* Pengirim */}
                      <div className="pt-2 border-t border-dashed border-gray-400 flex items-start justify-between">
                        <div>
                          <div className="text-[8.5px] font-black uppercase text-gray-600 mb-0.5">PENGIRIM:</div>
                          <div className="text-[11px] font-black text-black leading-tight">{lbl.pengirim_nama || 'CHOCOCHIPS'}</div>
                        </div>
                        {lbl.pengirim_telp && (
                          <div className="text-right pl-2 border-l border-gray-300">
                            <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">No. Telp:</div>
                            <div className="text-[11px] font-bold font-mono text-gray-800 leading-tight">{lbl.pengirim_telp}</div>
                          </div>
                        )}
                      </div>
                    </div>
            
                    {/* QR Code and ID */}
                    <div className="w-[110px] p-2 flex flex-col items-center justify-center shrink-0">
                      {lbl.qr_data_url ? (
                        <img
                          src={lbl.qr_data_url}
                          alt="QR Code"
                          className="w-[75px] h-[75px] block object-contain mb-1.5"
                        />
                      ) : (
                        <QrCodeImage
                          text={lbl.qr_content || `Manual paket + ID: ${lbl.invoice_no}`}
                          size={75}
                        />
                      )}
                      <div className="text-[10px] font-black text-center break-all mb-0.5 text-black leading-tight">
                        ID: {lbl.invoice_no || ''}
                      </div>
                    </div>
                 </div>
            
                 {/* 3. Warning Box: PERHATIAN JANGAN DITERIMA JIKA RUSAK */}
                 <div className="border-b-[2px] border-black py-1.5 px-2 bg-gray-100 flex items-center justify-center text-center break-inside-avoid">
                   <div className="text-[8.5px] font-black text-black tracking-wide uppercase leading-tight">
                     ⚠️ PERHATIAN: JANGAN DITERIMA JIKA KONDISI PAKET RUSAK ATAU SEGEL TERBUKA &bull; MOHON DOKUMENTASIKAN PENERIMAAN DAN UNBOXING PAKET UNTUK KLAIM KOMPLAIN PAKET YANG DITERIMA
                   </div>
                 </div>
              </div>
            
              {/* BOTTOM DYNAMIC AREA: Catatan/Deskripsi for Cetak Label */}
              <div className="p-3 bg-white flex-1 flex flex-col">
                 <div className="text-[12px] font-black uppercase text-gray-600 border-b border-black pb-1 mb-2">CATATAN / DESKRIPSI PAKET</div>
                 <div className="text-[14px] font-bold text-black whitespace-pre-wrap flex-1">
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
