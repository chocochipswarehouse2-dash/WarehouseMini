import React, { useState, useRef } from 'react';
import { X, Download, UploadCloud, CheckCircle2, Link as LinkIcon, RefreshCw } from 'lucide-react';
import Papa from 'papaparse';
import { IGLiveOrder, IGLiveOrderStatus } from '../../services/igLiveService';

interface ImportPesananIgLiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveBatch: (newOrders: IGLiveOrder[]) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

const parseRupiah = (str: string) => {
  if (!str) return 0;
  const num = parseInt(str.toString().replace(/[^0-9]/g, ''));
  return isNaN(num) ? 0 : num;
};

const mapStatus = (statusStr: string): IGLiveOrderStatus => {
  const s = (statusStr || '').toLowerCase().trim();
  if (s.includes('cancel') || s.includes('batal')) return 'batal';
  if (s.includes('shipped') || s.includes('dikirim')) return 'dikirim';
  if (s.includes('paid') || s.includes('bayar')) return 'siap_diproses';
  return 'siap_diproses';
};

export const ImportPesananIgLiveModal: React.FC<ImportPesananIgLiveModalProps> = ({
  isOpen,
  onClose,
  onSaveBatch,
  onShowToast,
}) => {
  const [url, setUrl] = useState('');
  const [parsedOrders, setParsedOrders] = useState<IGLiveOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const processCsvData = (data: any[][]) => {
    // Cari baris header (yang kolom pertamanya berisi 'NAMA PEMESAN')
    let headerIdx = -1;
    for (let i = 0; i < Math.min(data.length, 10); i++) {
      if (data[i][0] && typeof data[i][0] === 'string' && data[i][0].toUpperCase().includes('NAMA PEMESAN')) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      onShowToast('Format CSV tidak dikenali. Pastikan kolom pertama adalah "NAMA PEMESAN".', 'error');
      setLoading(false);
      return;
    }

    const rows = data.slice(headerIdx + 1);
    const ordersMap = new Map<string, IGLiveOrder>();

    rows.forEach((row, i) => {
      const nama = (row[0] || '').toString().trim();
      const hp = (row[1] || '').toString().trim();
      const alamat = (row[2] || '').toString().trim();
      
      // Jika kosong atau merupakan teks summary/contoh, abaikan
      if (!nama || nama.toLowerCase().includes('contoh') || nama.toLowerCase().includes('total') || nama.toLowerCase().includes('jumlah')) {
        return;
      }

      const kode = (row[3] || '').toString().trim();
      const produk = (row[4] || '').toString().trim();
      const size = (row[5] || '').toString().trim();
      const sku = (row[6] || '').toString().trim();
      const qtyStr = (row[8] || '').toString().trim();
      const priceStr = (row[9] || '').toString().trim();
      const shippingStr = (row[10] || '').toString().trim();
      const totalStr = (row[11] || '').toString().trim();
      const statusStr = (row[12] || '').toString().trim();
      const ket = (row[13] || '').toString().trim();
      const resi = (row[14] || '').toString().trim();

      const qty = parseInt(qtyStr) || 1;
      const price = parseRupiah(priceStr);
      const shipping = parseRupiah(shippingStr);
      const total = parseRupiah(totalStr);

      const key = `${nama}-${hp}`;
      let order = ordersMap.get(key);

      if (!order) {
        order = {
          id: crypto.randomUUID(),
          no_pesanan: `IG-${Date.now()}-${Math.floor(Math.random() * 1000) + i}`,
          tanggal: new Date().toISOString(),
          session_live: kode,
          username_ig: nama,
          nama_pembeli: nama,
          no_telp: hp,
          alamat_lengkap: alamat,
          ekspedisi: 'JNE',
          layanan: 'Reguler',
          no_resi: resi || '-',
          biaya_ongkir: shipping,
          total_bayar: total,
          status: mapStatus(statusStr),
          catatan: ket,
          items: [],
        };
        ordersMap.set(key, order);
      } else {
        if (!order.biaya_ongkir && shipping > 0) order.biaya_ongkir = shipping;
        if (!order.total_bayar && total > 0) order.total_bayar = total;
        if (order.no_resi === '-' && resi) order.no_resi = resi;
        if (ket && !order.catatan) order.catatan = ket;
        if (order.status === 'siap_diproses' && mapStatus(statusStr) !== 'siap_diproses') {
          order.status = mapStatus(statusStr);
        }
      }

      if (produk || sku) {
        order.items.push({
          sku: sku || '-',
          nama_produk: produk || 'Item',
          size: size || 'ALL SIZE',
          qty: qty,
          harga: price,
          picked: false
        });
      }
    });

    const finalOrders = Array.from(ordersMap.values());
    if (finalOrders.length === 0) {
      onShowToast('Tidak ada data pesanan yang berhasil diparsing', 'warning');
    } else {
      setParsedOrders(finalOrders);
      onShowToast(`Berhasil membaca ${finalOrders.length} pesanan`, 'success');
    }
    setLoading(false);
  };

  const handleFetchUrl = () => {
    if (!url) return onShowToast('Masukkan URL Spreadsheet terlebih dahulu', 'warning');
    setLoading(true);

    let fetchUrl = url;
    if (url.includes('/edit')) {
      fetchUrl = url.replace(/\/edit.*$/, '/export?format=csv');
      const gidMatch = url.match(/gid=([0-9]+)/);
      if (gidMatch) {
        fetchUrl += `&gid=${gidMatch[1]}`;
      }
    }

    Papa.parse(fetchUrl, {
      download: true,
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        processCsvData(results.data as any[][]);
      },
      error: (err) => {
        onShowToast('Gagal menarik data dari URL. Pastikan sheet bersifat publik (Anyone with the link can view)', 'error');
        setLoading(false);
      }
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);

    Papa.parse(file, {
      header: false,
      skipEmptyLines: true,
      complete: (results) => {
        processCsvData(results.data as any[][]);
        if (fileInputRef.current) fileInputRef.current.value = '';
      },
      error: () => {
        onShowToast('Gagal membaca file CSV', 'error');
        setLoading(false);
      }
    });
  };

  const handleSave = () => {
    onSaveBatch(parsedOrders);
    onShowToast(`Berhasil menyimpan ${parsedOrders.length} pesanan baru`, 'success');
    setParsedOrders([]);
    setUrl('');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-2xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-4xl rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-100 dark:border-slate-800">
          <h3 className="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
            <Download className="w-5 h-5 text-indigo-500" />
            Tarik Data Pesanan GSheet
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-6">
          {parsedOrders.length === 0 ? (
            <div className="space-y-6">
              <div className="p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/30 rounded-xl">
                <h4 className="font-bold text-indigo-800 dark:text-indigo-300 flex items-center gap-2 mb-2">
                  <LinkIcon className="w-4 h-4" />
                  Opsi 1: Tarik Langsung dari Link GSheet
                </h4>
                <p className="text-sm text-indigo-600 dark:text-indigo-400 mb-3">
                  Pastikan Google Sheet Anda memiliki akses <strong>"Anyone with the link can view"</strong>.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://docs.google.com/spreadsheets/d/..."
                    className="flex-1 px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
                  />
                  <button
                    onClick={handleFetchUrl}
                    disabled={loading || !url}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold rounded-lg flex items-center gap-2 transition-all cursor-pointer"
                  >
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    Tarik Data
                  </button>
                </div>
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-slate-700"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-white dark:bg-slate-900 px-3 text-sm font-medium text-slate-400">ATAU</span>
                </div>
              </div>

              <div className="p-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-center">
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-sm"
                >
                  <UploadCloud className="w-5 h-5 text-emerald-500" />
                  Upload File CSV GSheet
                </button>
                <p className="text-xs text-slate-500 mt-2">
                  Jika link gagal ditarik, download GSheet sebagai CSV (File &gt; Download &gt; Comma Separated Values) lalu upload kesini.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 rounded-xl">
                <div className="flex items-center gap-3 text-emerald-700 dark:text-emerald-400 font-medium">
                  <CheckCircle2 className="w-5 h-5" />
                  {parsedOrders.length} pesanan berhasil diparsing
                </div>
                <button
                  onClick={() => setParsedOrders([])}
                  className="text-sm font-semibold text-emerald-600 hover:text-emerald-700 dark:hover:text-emerald-300 underline cursor-pointer"
                >
                  Batal / Reset
                </button>
              </div>

              <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-left border-collapse text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="p-3 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">Pembeli</th>
                      <th className="p-3 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">Items</th>
                      <th className="p-3 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">Total + Ongkir</th>
                      <th className="p-3 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700">Status / Resi</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {parsedOrders.map((o, idx) => (
                      <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="p-3 font-medium text-slate-800 dark:text-slate-200 align-top">
                          {o.nama_pembeli}
                          <div className="text-xs text-slate-500 font-normal">{o.no_telp}</div>
                          <div className="text-xs text-slate-400 mt-1 line-clamp-2 max-w-[200px]" title={o.alamat_lengkap}>
                            {o.alamat_lengkap}
                          </div>
                        </td>
                        <td className="p-3 align-top">
                          <ul className="list-disc pl-4 text-xs text-slate-600 dark:text-slate-400 space-y-1">
                            {o.items.map((item, i) => (
                              <li key={i}>
                                {item.qty}x {item.nama_produk} ({item.size})
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="p-3 align-top text-slate-700 dark:text-slate-300 font-medium">
                          Rp {(o.total_bayar || 0).toLocaleString('id-ID')}
                          <div className="text-xs text-slate-500 font-normal">Ongkir: Rp {(o.biaya_ongkir || 0).toLocaleString('id-ID')}</div>
                        </td>
                        <td className="p-3 align-top">
                          <div className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            {o.status.replace('_', ' ')}
                          </div>
                          <div className="text-xs text-slate-500 mt-1 font-mono">{o.no_resi !== '-' ? o.no_resi : 'Belum ada resi'}</div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/30 flex justify-end gap-3 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-slate-600 dark:text-slate-300 font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all cursor-pointer"
          >
            Tutup
          </button>
          {parsedOrders.length > 0 && (
            <button
              onClick={handleSave}
              className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-lg shadow-indigo-500/30 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Download className="w-5 h-5" />
              Simpan {parsedOrders.length} Pesanan
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
