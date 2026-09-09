import React, { useState, useEffect } from 'react';
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
  Save
} from 'lucide-react';
import { supabaseFetch } from '../services/supabase';

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
              Tambahkan data penerima ke antrean lalu cetak sekaligus.
            </p>
          </div>
          <button
            onClick={handlePrint}
            disabled={labels.length === 0}
            className="w-full sm:w-auto px-5 py-2.5 bg-white text-indigo-700 font-bold rounded-xl shadow-sm hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <Printer className="w-4 h-4" />
            Cetak {labels.length} Label
          </button>
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
                              className="absolute top-3 right-3 p-1.5 bg-white dark:bg-slate-800 rounded-md text-slate-400 hover:text-rose-500 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
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
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">Penerima <span className="text-rose-500">*</span></label>
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
              <span className="px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-400 text-xs font-bold rounded-full">
                {labels.length} Label
              </span>
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
                          className="text-slate-400 hover:text-rose-500 p-1 rounded transition-colors opacity-0 group-hover:opacity-100"
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
                  className="w-full px-4 py-2 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 font-bold rounded-lg hover:bg-rose-200 dark:hover:bg-rose-900/50 transition-colors text-xs"
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
