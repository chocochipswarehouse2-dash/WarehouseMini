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
  FileSpreadsheet
} from 'lucide-react';
import { supabaseFetch } from '../services/supabase';
import Papa from 'papaparse';

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
}

export interface AddressBookItem {
  id: string;
  nama_penerima: string;
  no_telp: string;
  alamat: string;
  keterangan: string;
}

export const CetakLabelView: React.FC = () => {
  const [labels, setLabels] = useState<LabelItem[]>([]);
  const [addressBook, setAddressBook] = useState<AddressBookItem[]>([]);
  const [isAddressDropdownOpen, setIsAddressDropdownOpen] = useState(false);
  const [isLoadingAddresses, setIsLoadingAddresses] = useState(false);
  const [isSavingAddress, setIsSavingAddress] = useState(false);

  // CSV Import State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importNotice, setImportNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form State
  const [pengirimNama, setPengirimNama] = useState('CHOCOCHIPS');
  const [pengirimTelp, setPengirimTelp] = useState('');
  
  const [penerimaNama, setPenerimaNama] = useState('');
  const [penerimaTelp, setPenerimaTelp] = useState('');
  const [penerimaAlamat, setPenerimaAlamat] = useState('');
  
  const [deskripsi, setDeskripsi] = useState('');
  const [ekspedisi, setEkspedisi] = useState('');
  const [resi, setResi] = useState('');
  const [qty, setQty] = useState<number>(1);

  useEffect(() => {
    fetchAddressBook();
  }, []);

  const fetchAddressBook = async () => {
    setIsLoadingAddresses(true);
    try {
      const data = await supabaseFetch<AddressBookItem[]>('address_book', 'GET', null, 'order=created_at.desc');
      if (data && Array.isArray(data)) {
        setAddressBook(data);
      }
    } catch (e) {
      console.warn('Failed to load address book. Table might not exist yet.', e);
    } finally {
      setIsLoadingAddresses(false);
    }
  };

  const handleSaveToAddressBook = async () => {
    if (!penerimaNama || !penerimaAlamat) {
      alert('Nama dan Alamat harus diisi untuk disimpan ke Address Book');
      return;
    }
    setIsSavingAddress(true);
    try {
      await supabaseFetch('address_book', 'POST', {
        nama_penerima: penerimaNama,
        no_telp: penerimaTelp,
        alamat: penerimaAlamat,
        keterangan: deskripsi || '',
      });
      alert('Berhasil disimpan ke auto-fill!');
      await fetchAddressBook();
    } catch (e: any) {
      console.error(e);
      alert('Gagal menyimpan. Pastikan tabel address_book sudah dibuat di Supabase.');
    } finally {
      setIsSavingAddress(false);
    }
  };

  const handleDeleteAddress = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Hapus alamat ini dari penyimpanan?')) return;
    try {
      await supabaseFetch('address_book', 'DELETE', null, `id=eq.${id}`);
      setAddressBook(prev => prev.filter(item => item.id !== id));
    } catch (e) {
      console.error(e);
      alert('Gagal menghapus alamat');
    }
  };

  const handleSelectAddress = (item: AddressBookItem) => {
    setPenerimaNama(item.nama_penerima);
    setPenerimaTelp(item.no_telp || '');
    setPenerimaAlamat(item.alamat);
    setIsAddressDropdownOpen(false);
  };

  const handleAddLabel = (e: React.FormEvent) => {
    e.preventDefault();
    if (!penerimaNama || !penerimaAlamat) {
      alert('Nama dan Alamat Penerima wajib diisi');
      return;
    }

    const newLabels: LabelItem[] = [];
    for (let i = 0; i < qty; i++) {
      newLabels.push({
        id: `lbl_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        pengirim_nama: pengirimNama || 'CHOCOCHIPS',
        pengirim_telp: pengirimTelp,
        penerima_nama: penerimaNama,
        penerima_telp: penerimaTelp,
        penerima_alamat: penerimaAlamat,
        deskripsi: deskripsi,
        ekspedisi: ekspedisi,
        resi: resi,
      });
    }

    setLabels([...labels, ...newLabels]);

    // Reset some fields but keep pengirim and ekspedisi to speed up entry
    setPenerimaNama('');
    setPenerimaTelp('');
    setPenerimaAlamat('');
    setDeskripsi('');
    setResi('');
    setQty(1);
  };

  const handleRemoveLabel = (id: string) => {
    setLabels(labels.filter(l => l.id !== id));
  };

  const handlePrint = () => {
    if (labels.length === 0) {
      alert('Antrean label kosong');
      return;
    }
    window.print();
  };

  const handleDownloadTemplate = () => {
    const headers = [
      'nama_penerima',
      'no_telp_penerima',
      'alamat_penerima',
      'nama_pengirim',
      'no_telp_pengirim',
      'isi_paket',
      'ekspedisi',
      'no_resi',
      'jumlah_copy'
    ];

    const sampleRows = [
      [
        'Siti Rahma',
        '081234567890',
        'Jl. Merdeka No. 45 RT 02/05 Gambir Jakarta Pusat',
        pengirimNama || 'CHOCOCHIPS',
        pengirimTelp || '081122334455',
        '2x Dress Floral M, 1x Scarf',
        'JNE',
        'JNE12345678',
        '1'
      ],
      [
        'Budi Santoso',
        '087811223344',
        'Komplek Permai Blok B2 No. 10 Sukajadi Bandung',
        pengirimNama || 'CHOCOCHIPS',
        pengirimTelp || '081122334455',
        '1x Kemeja Rayon L',
        'SiCepat',
        'SCP99887766',
        '1'
      ]
    ];

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...sampleRows.map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'template_cetak_label_a6.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        try {
          const rows = results.data as Record<string, any>[];
          if (!rows || rows.length === 0) {
            setImportNotice({ type: 'error', message: 'File CSV kosong atau tidak memiliki baris data.' });
            return;
          }

          const newImportedLabels: LabelItem[] = [];
          let skippedCount = 0;

          // Helper to match column variations
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

          rows.forEach((row, index) => {
            const rNama = getField(row, ['nama_penerima', 'penerima_nama', 'penerima', 'nama', 'recipient', 'receiver', 'customer']);
            const rAlamat = getField(row, ['alamat_penerima', 'penerima_alamat', 'alamat', 'address', 'lokasi', 'alamat_lengkap']);
            const rTelp = getField(row, ['no_telp_penerima', 'telp_penerima', 'penerima_telp', 'telepon', 'no_telp', 'telp', 'no_hp', 'phone', 'hp']);
            const sNama = getField(row, ['nama_pengirim', 'pengirim_nama', 'pengirim', 'sender']) || pengirimNama || 'CHOCOCHIPS';
            const sTelp = getField(row, ['no_telp_pengirim', 'telp_pengirim', 'pengirim_telp', 'sender_phone']) || pengirimTelp || '';
            const rDeskripsi = getField(row, ['isi_paket', 'deskripsi', 'barang', 'keterangan', 'items', 'paket']);
            const rEkspedisi = getField(row, ['ekspedisi', 'kurir', 'courier', 'jasa_kirim', 'logistic']);
            const rResi = getField(row, ['no_resi', 'resi', 'tracking_number', 'airwaybill', 'awb']);
            
            const rawQty = getField(row, ['jumlah_copy', 'qty', 'copy', 'jumlah', 'copies']);
            const itemQty = Math.max(1, parseInt(rawQty, 10) || 1);

            // Skip row if it doesn't have minimal recipient data
            if (!rNama && !rAlamat) {
              skippedCount++;
              return;
            }

            for (let c = 0; c < itemQty; c++) {
              newImportedLabels.push({
                id: `lbl_import_${Date.now()}_${index}_${c}_${Math.random().toString(36).substring(2, 7)}`,
                pengirim_nama: sNama,
                pengirim_telp: sTelp,
                penerima_nama: rNama || 'Tanpa Nama',
                penerima_telp: rTelp,
                penerima_alamat: rAlamat || '-',
                deskripsi: rDeskripsi,
                ekspedisi: rEkspedisi,
                resi: rResi,
              });
            }
          });

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
      <div className="max-w-4xl mx-auto space-y-6 print:hidden mb-20">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 rounded-2xl p-5 sm:p-6 text-white shadow-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-black flex items-center gap-2">
              <Printer className="w-6 h-6" />
              Cetak Label Alamat (A6)
            </h1>
            <p className="text-indigo-100 text-sm mt-1">
              Tambahkan data penerima ke antrean atau import file CSV, lalu cetak sekaligus.
            </p>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handlePrint}
              disabled={labels.length === 0}
              className="w-full sm:w-auto px-5 py-2.5 bg-white text-indigo-700 font-bold rounded-xl shadow-sm hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Cetak {labels.length} Label
            </button>
          </div>
        </div>

        {/* Import CSV Notification Banner */}
        {importNotice && (
          <div className={`p-4 rounded-xl flex items-center justify-between gap-3 text-xs font-bold border transition-all ${
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

        {/* Card Import CSV & Download Template */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">
                Import Label Massal (CSV)
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Download format template CSV, isi data penerima, lalu upload file untuk memasukkan antrean sekaligus.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 cursor-pointer border border-slate-200 dark:border-slate-700"
              title="Download Template CSV"
            >
              <Download className="w-4 h-4 text-slate-500" />
              Download Template CSV
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer"
              title="Upload File CSV Berisi Data Penerima"
            >
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form Input */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center relative">
              <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                Form Input Label
              </h2>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsAddressDropdownOpen(!isAddressDropdownOpen)}
                  className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-lg text-xs font-bold hover:bg-indigo-200 dark:hover:bg-indigo-900/60 transition-colors flex items-center gap-2"
                >
                  <Bookmark className="w-3.5 h-3.5" />
                  Auto-Fill
                  <ChevronDown className="w-3 h-3" />
                </button>
                
                {isAddressDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                    <div className="p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                      <h3 className="text-xs font-black text-slate-700 dark:text-slate-300">Pilih Alamat Tersimpan</h3>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-2">
                      {isLoadingAddresses ? (
                        <div className="p-4 flex justify-center">
                          <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                        </div>
                      ) : addressBook.length === 0 ? (
                        <div className="p-4 text-center text-xs text-slate-500">
                          Belum ada alamat tersimpan.<br/>Isi form lalu klik Simpan.
                        </div>
                      ) : (
                        addressBook.map((item) => (
                          <div
                            key={item.id}
                            onClick={() => handleSelectAddress(item)}
                            className="p-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg cursor-pointer group mb-1 border border-transparent hover:border-slate-200 dark:hover:border-slate-700 transition-colors relative"
                          >
                            <h4 className="text-sm font-bold text-slate-800 dark:text-white mb-0.5">{item.nama_penerima}</h4>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2">{item.alamat}</p>
                            <button
                              onClick={(e) => handleDeleteAddress(e, item.id)}
                              className="absolute top-3 right-3 p-1.5 bg-white dark:bg-slate-800 rounded-md text-slate-400 hover:text-primary-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                              title="Hapus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <form onSubmit={handleAddLabel} className="p-4 sm:p-5 space-y-5">
              
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
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">Penerima <span className="text-primary-500">*</span></label>
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
                      className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1.5 disabled:opacity-50 transition-colors"
                    >
                      {isSavingAddress ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      Simpan sebagai Auto-Fill
                    </button>
                  </div>
                </div>
              </div>

              {/* Detail Paket */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">Detail Kiriman</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 relative">
                    <Package className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                    <textarea
                      value={deskripsi}
                      onChange={e => setDeskripsi(e.target.value)}
                      placeholder="Isi Paket (Misal: 3x Kemeja Putih L, 1x Topi)"
                      rows={2}
                      className="w-full pl-9 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      type="text"
                      value={ekspedisi}
                      onChange={e => setEkspedisi(e.target.value)}
                      placeholder="Kurir (JNE/J&T/dll)"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="col-span-1">
                    <input
                      type="text"
                      value={resi}
                      onChange={e => setResi(e.target.value)}
                      placeholder="No. Resi (Opsional)"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Action */}
              <div className="pt-2 flex gap-3">
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
                  className="flex-1 px-4 py-2 mt-[18px] bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
                >
                  <Plus className="w-5 h-5" />
                  Tambah ke Antrean
                </button>
              </div>
            </form>
          </div>

          {/* Antrean */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col h-[500px]">
            <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
              <h2 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <Printer className="w-4 h-4 text-indigo-500" />
                Antrean Cetak
              </h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-2.5 py-1 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                  title="Import Data dari CSV"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-500" />
                  Import CSV
                </button>
                <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-xs font-bold rounded-full">
                  {labels.length} Label
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {labels.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400">
                  <Package className="w-12 h-12 mb-3 text-slate-300 dark:text-slate-700" />
                  <p className="text-sm font-medium">Belum ada label di antrean</p>
                </div>
              ) : (
                labels.map((lbl, idx) => (
                  <div key={lbl.id} className="p-3 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/30 flex gap-3 group">
                    <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-black text-slate-500 flex-shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-start mb-1">
                        <h4 className="text-sm font-bold text-slate-800 dark:text-white truncate">
                          {lbl.penerima_nama}
                        </h4>
                        <button
                          onClick={() => handleRemoveLabel(lbl.id)}
                          className="text-slate-400 hover:text-primary-500 p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-1">{lbl.penerima_alamat}</p>
                      {(lbl.ekspedisi || lbl.resi) && (
                        <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 mt-1 uppercase">
                          {lbl.ekspedisi} {lbl.resi ? `- ${lbl.resi}` : ''}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
            {labels.length > 0 && (
              <div className="p-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <button
                  onClick={() => setLabels([])}
                  className="w-full px-4 py-2 bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 font-bold rounded-lg hover:bg-primary-200 dark:hover:bg-primary-900/50 transition-colors text-xs"
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
        AREA PRINT (Hanya muncul saat dicetak)
        ========================================================
      */}
      <div id="print-area" className="hidden print:block bg-white w-full h-full text-black">
        {labels.map((lbl, idx) => (
          <div key={lbl.id} className="page-break w-[105mm] h-[148mm] overflow-hidden p-4 relative bg-white box-border border-b border-dashed border-gray-300">
            {/* Outline box (opsional, membantu cutting jika print di A4 biasa, tapi di printer thermal ini menyesuaikan kertas) */}
            <div className="w-full h-full border-2 border-black flex flex-col relative overflow-hidden bg-white">
              
              {/* Header Label */}
              <div className="border-b-2 border-black p-3 bg-gray-50 flex justify-between items-center">
                <h1 className="text-lg font-black tracking-widest uppercase">PENGIRIMAN PAKET</h1>
                {(lbl.ekspedisi || lbl.resi) && (
                  <div className="text-right">
                    <div className="text-lg font-black uppercase leading-none">{lbl.ekspedisi}</div>
                    <div className="text-xs font-bold font-mono tracking-widest mt-0.5">{lbl.resi}</div>
                  </div>
                )}
              </div>

              {/* Penerima Box (Utama & Besar) */}
              <div className="p-4 border-b border-black bg-white flex-1 flex flex-col justify-center">
                <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">Kepada / Penerima:</div>
                <div className="text-xl font-black uppercase mb-1 leading-tight">{lbl.penerima_nama}</div>
                {lbl.penerima_telp && (
                  <div className="text-sm font-bold font-mono mb-2">{lbl.penerima_telp}</div>
                )}
                <div className="text-sm font-medium leading-snug whitespace-pre-wrap">{lbl.penerima_alamat}</div>
              </div>

              {/* Pengirim & Deskripsi */}
              <div className="flex border-b border-black">
                {/* Pengirim */}
                <div className="p-3 border-r border-black flex-1">
                  <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Dari / Pengirim:</div>
                  <div className="text-sm font-black uppercase">{lbl.pengirim_nama}</div>
                  {lbl.pengirim_telp && <div className="text-xs font-bold font-mono">{lbl.pengirim_telp}</div>}
                </div>
                {/* Qty / Indikator (Optional) */}
                <div className="p-3 w-16 flex items-center justify-center bg-gray-50">
                  <span className="text-xs font-black">1/1</span>
                </div>
              </div>

              {/* Deskripsi Paket */}
              <div className="p-3 text-xs bg-white flex-1 max-h-[80px] overflow-hidden">
                <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-1">Isi Paket:</div>
                <div className="font-medium whitespace-pre-wrap leading-tight">{lbl.deskripsi || '-'}</div>
              </div>

              {/* Footer / Barcode Placeholder */}
              <div className="h-12 border-t-2 border-black flex items-center justify-center bg-gray-50 text-[10px] font-bold text-gray-400">
                {lbl.resi ? `* ${lbl.resi} *` : 'Cetak Label WMS'}
              </div>

            </div>
          </div>
        ))}
      </div>
    </>
  );
};
