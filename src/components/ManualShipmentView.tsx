import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package, Search, Plus, Trash2, Send, RefreshCw, Printer, AlertTriangle, Check, CheckCircle2, FileText, ChevronDown, QrCode, ShoppingBag, X, MapPin, Truck, History, Calendar, User, ArrowLeft
} from 'lucide-react';
import { ProductItem, UserSession, ManualShipmentOrder, ManualShipmentItem } from '../types';
import { hasPermission, isSuperadmin } from '../services/permissions';
import { PhysicalScanInput } from './PhysicalScanInput';
import {
  fetchOutlets,
  fetchManualShipments,
  submitManualShipment,
  updateShipmentStatus,
  updateShipmentResi,
  deleteManualShipment,
  fetchJasaKirimList,
  editManualShipment,
} from '../services/gasManualShipment';
import QRCode from 'qrcode';
import {
  generateCustomerTransactionNumber,
  generateManualShipmentOrderId,
  isTransactionNumberUnique,
  getStoreCode,
  generateShortOrderId,
} from '../utils/transactionGenerator';
import { getUserPersonName, formatOperatorWithPersonName } from '../utils/userResolver';

interface ManualShipmentViewProps {
  session: UserSession | null;
  productCatalog: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const ManualShipmentView: React.FC<ManualShipmentViewProps> = ({
  session,
  productCatalog,
  onShowToast,
}) => {
  const userIsAdmin = isSuperadmin(session);
  const canAction = userIsAdmin || hasPermission(session, 'can_manual_shipment_action');

  const [activeTab, setActiveTab] = useState<'form' | 'rekap'>('form');
  const [viewMode, setViewMode] = useState<'table' | 'card'>(() => typeof window !== 'undefined' && window.innerWidth < 768 ? 'card' : 'table');
  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState<{ nama: string; fulfillment: string }[]>([]);
  const [jasaKirimList, setJasaKirimList] = useState<string[]>([]);
  const [orders, setOrders] = useState<ManualShipmentOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterStore, setFilterStore] = useState<string>('all');
  const [filterJasaKirim, setFilterJasaKirim] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const [selectedOrderDetails, setSelectedOrderDetails] = useState<ManualShipmentOrder | null>(null);

  const [editingOrder, setEditingOrder] = useState<ManualShipmentOrder | null>(null);

  // State untuk cetak in-page A6 & Picking List (100% kompatibel di HP / mobile dan desktop tanpa popup blocker)
  const [printPayload, setPrintPayload] = useState<{
    mode: 'LABEL' | 'PICKING';
    orders: ManualShipmentOrder[];
    qrMap: Record<string, string>;
    timestamp: number;
  } | null>(null);

  // Auto-trigger window.print saat payload cetak siap
  useEffect(() => {
    if (!printPayload) return;
    const timer = setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.warn('Window print direct error:', err);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [printPayload?.timestamp]);

  // Form State - langsung terisi Order ID Manual Shipment unik anti-collision
  const [pengirim, setPengirim] = useState('');
  const [picStore, setPicStore] = useState('');
  const [telpPengirim, setTelpPengirim] = useState('');
  const [transPengirim, setTransPengirim] = useState('');
  
  // Pilihan Jasa Kirim (Sheet outlet kolom C row 2)
  const [jasaKirim, setJasaKirim] = useState('');
  const [customJasaKirim, setCustomJasaKirim] = useState('');
  const [isCustomJasaKirim, setIsCustomJasaKirim] = useState(false);
  const [loadingJasaKirim, setLoadingJasaKirim] = useState(false);

  const [tujuan, setTujuan] = useState('');
  const [telpTujuan, setTelpTujuan] = useState('');
  const [alamatTujuan, setAlamatTujuan] = useState('');
  const [notesPaket, setNotesPaket] = useState('');
  const [transCustomer, setTransCustomer] = useState<string>(() => generateManualShipmentOrderId([], ''));
  
  const [items, setItems] = useState<ManualShipmentItem[]>([]);

  useEffect(() => {
    loadOutlets();
    loadOrders();
    loadJasaKirim();
  }, []);

  const loadJasaKirim = async () => {
    setLoadingJasaKirim(true);
    try {
      const list = await fetchJasaKirimList();
      setJasaKirimList(list);
    } catch (e) {
      console.warn('Error loading jasa kirim:', e);
    } finally {
      setLoadingJasaKirim(false);
    }
  };

  const loadOutlets = async () => {
    const data = await fetchOutlets();
    setOutlets(data);
  };

  const loadOrders = async () => {
    setLoading(true);
    try {
      const data = await fetchManualShipments();
      // Sanitize jika ada sisa data lama di mana string JSON masuk ke kolom no_transaksi_customer
      const cleaned = data.map(o => {
        const cleanOrder = { ...o };
        if (cleanOrder.no_transaksi_customer && (cleanOrder.no_transaksi_customer.startsWith('[') || cleanOrder.no_transaksi_customer.startsWith('{'))) {
          if (!cleanOrder.items || cleanOrder.items.length === 0) {
            try {
              const parsed = JSON.parse(cleanOrder.no_transaksi_customer);
              if (Array.isArray(parsed)) cleanOrder.items = parsed;
            } catch {}
          }
          cleanOrder.no_transaksi_customer = cleanOrder.no_pesanan || '';
        }
        return cleanOrder;
      });
      const reversed = [...cleaned].reverse();
      setOrders(reversed);

      // Pastikan nomor transaksi customer di form tidak bentrok dengan order yang baru di-load dari server
      setTransCustomer(current => {
        if (!current || reversed.some(o => o.no_transaksi_customer && o.no_transaksi_customer.trim().toUpperCase() === current.trim().toUpperCase())) {
          return generateCustomerTransactionNumber(reversed, pengirim);
        }
        return current;
      });
    } catch (e) {
      console.warn('Error in loadOrders:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleAddItem = () => {
    setItems(prev => [...prev, {
      id: `item-${Date.now()}`, nama_produk: '', sku: '', qty: 1, fulfillment: '', size: ''
    }]);
  };

  const handleRemoveItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleItemChange = (id: string, field: keyof ManualShipmentItem, value: any) => {
    setItems(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, [field]: value };
      }
      return item;
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pengirim || !tujuan || items.length === 0 || items.some(i => !i.nama_produk || !i.fulfillment)) {
      onShowToast('Harap lengkapi form dan item pesanan', 'warning');
      return;
    }

    setLoading(true);

    // 1. Validasi & pastikan no_transaksi_customer memuat kode store dan 100% unik
    let finalTransCustomer = transCustomer.trim();
    const expectedPrefix = pengirim ? `MS${getStoreCode(pengirim)}-` : 'MS-';
    
    if (!editingOrder) {
      if (!finalTransCustomer || !finalTransCustomer.startsWith(expectedPrefix) || !isTransactionNumberUnique(finalTransCustomer, orders)) {
        finalTransCustomer = generateCustomerTransactionNumber(orders, pengirim);
        setTransCustomer(finalTransCustomer);
      }
    }

    // 2. Ambil nilai jasa kirim
    const finalJasaKirim = (isCustomJasaKirim ? customJasaKirim : jasaKirim).trim();

    // 3. Cegah bentrokan ID pesanan internal dengan format ringkas yang rapi
    const uniquePesananId = editingOrder ? editingOrder.no_pesanan! : generateShortOrderId(pengirim, orders);

    const orderData: ManualShipmentOrder = {
      ...(editingOrder || {}),
      no_pesanan: uniquePesananId,
      nama_pengirim: pengirim,
      pic_store: picStore,
      no_telp_store: telpPengirim,
      no_transaksi_pengirim: transPengirim.split(',').map(s => s.trim()).filter(Boolean),
      nama_tujuan: tujuan,
      no_telp_tujuan: telpTujuan,
      alamat_tujuan: alamatTujuan,
      notes_paket: notesPaket,
      no_transaksi_customer: finalTransCustomer,
      jasa_kirim: finalJasaKirim,
      items: items.map((it) => ({
        ...it,
        qty: Math.max(1, Number(it.qty) || 1),
      })),
      status: editingOrder ? editingOrder.status : 'diterima',
      no_resi: editingOrder ? (editingOrder.no_resi || '') : '',
      created_at: editingOrder ? editingOrder.created_at : new Date().toISOString(),
      submitted_by: editingOrder ? editingOrder.submitted_by : (session?.name || getUserPersonName(session?.username) || 'Petugas')
    };

    let success = false;
    if (editingOrder) {
      success = await editManualShipment(orderData);
    } else {
      success = await submitManualShipment(orderData);
    }

    if (success) {
      onShowToast(editingOrder ? 'Pesanan berhasil diupdate' : 'Pesanan berhasil disubmit', 'success');
      resetForm();
      loadOrders();
      setActiveTab('rekap');
    } else {
      onShowToast(editingOrder ? 'Gagal update pesanan' : 'Gagal submit pesanan', 'error');
    }
    setLoading(false);
  };

  const resetForm = () => {
    setEditingOrder(null);
    setPengirim('');
    setPicStore('');
    setTelpPengirim('');
    setTransPengirim('');
    setJasaKirim('');
    setCustomJasaKirim('');
    setIsCustomJasaKirim(false);
    setTujuan('');
    setTelpTujuan('');
    setAlamatTujuan('');
    setNotesPaket('');
    // Otomatis terisi Order ID Manual Shipment baru yang unik untuk pesanan berikutnya
    setTransCustomer(generateManualShipmentOrderId(orders, ''));
    setItems([]);
  };

  const handleScanProduct = (sku: string) => {
    const product = productCatalog.find(p => p.k.toUpperCase() === sku.toUpperCase());
    if (!product) {
      onShowToast(`Produk dengan SKU ${sku} tidak ditemukan!`, 'error');
      return;
    }

    setItems(prev => {
      const existing = prev.find(i => i.sku.toUpperCase() === sku.toUpperCase());
      if (existing) {
        // Increment qty
        return prev.map(i => i.sku.toUpperCase() === sku.toUpperCase() ? { ...i, qty: (Number(i.qty) || 0) + 1 } : i);
      }
      
      const displayNama = product.p || product.n || 'Unknown Product';
      const displaySize = product.s && product.s !== 'ALL' ? ` - ${product.s}` : '';
      const fullName = `${displayNama}${displaySize}`;
      return [...prev, {
        id: `item-${Date.now()}`,
        nama_produk: fullName,
        sku: product.k,
        qty: 1,
        fulfillment: '',
        size: product.s && product.s !== 'ALL' ? product.s : ''
      }];
    });
    onShowToast(`Berhasil menambahkan ${product.p || product.n || product.k}`, 'success');
  };

  const renderForm = () => (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors">
      <div className="p-3.5 sm:p-6">
        <h2 className="text-lg sm:text-xl font-bold text-slate-800 dark:text-white mb-4 sm:mb-6 flex items-center">
          <Package className="w-5 h-5 sm:w-6 sm:h-6 mr-2 text-indigo-600 dark:text-indigo-400 shrink-0" />
          {editingOrder ? 'Edit Manual Shipment' : 'Form Manual Shipment'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Order ID Manual Shipment & Pilihan Jasa Kirim (Paling Atas) */}
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 rounded-xl p-4 space-y-4">
            <div className="max-w-md">
              <label className="block text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
                Order ID Manual Shipment
              </label>
              <input
                type="text"
                value={transCustomer}
                readOnly
                tabIndex={-1}
                placeholder="Pilih store pengirim..."
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold sm:text-base cursor-not-allowed select-all shadow-sm py-2 px-3 tracking-wide"
              />
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                Nomor unik dibuat otomatis oleh sistem berdasarkan store yang dipilih
              </p>
            </div>

            {/* Pilihan Jasa Kirim (Dibawah Order ID Manual Shipment) */}
            <div className="max-w-md">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-bold text-slate-700 dark:text-slate-200">
                  Pilihan Jasa Kirim <span className="text-xs font-normal text-slate-500 dark:text-slate-400">(Sheet outlet kolom C)</span>
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    await loadJasaKirim();
                    onShowToast('Daftar jasa kirim disinkronkan dari sheet outlet kolom C', 'info');
                  }}
                  disabled={loadingJasaKirim}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  title="Sinkronkan data jasa kirim dari sheet outlet kolom C"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingJasaKirim ? 'animate-spin' : ''}`} />
                  <span>Sinkron Sheet</span>
                </button>
              </div>

              <div className="space-y-2">
                <select
                  value={isCustomJasaKirim ? '__custom__' : jasaKirim}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === '__custom__') {
                      setIsCustomJasaKirim(true);
                      setJasaKirim(customJasaKirim);
                    } else {
                      setIsCustomJasaKirim(false);
                      setJasaKirim(val);
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-2 px-3"
                  required={!isCustomJasaKirim}
                >
                  <option value="">-- Pilih Jasa Kirim / Ekspedisi --</option>
                  {jasaKirimList.map((jk, idx) => (
                    <option key={idx} value={jk}>
                      {jk}
                    </option>
                  ))}
                  <option value="__custom__">+ Ketik Jasa Kirim Lainnya (Manual)</option>
                </select>

                {isCustomJasaKirim && (
                  <input
                    type="text"
                    value={customJasaKirim}
                    onChange={(e) => {
                      const val = e.target.value;
                      setCustomJasaKirim(val);
                      setJasaKirim(val);
                    }}
                    placeholder="Ketik nama ekspedisi / jasa kirim manual..."
                    className="w-full rounded-lg border border-indigo-300 dark:border-indigo-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 bg-indigo-50/40 dark:bg-indigo-950/40 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                    autoFocus
                    required
                  />
                )}
              </div>
            </div>
          </div>

          {/* Data Pengirim */}
          <div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-4 border-b border-slate-200 dark:border-slate-700/80 pb-2">Data Pengirim</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Pengirim (Store)</label>
                <select
                  value={pengirim}
                  onChange={(e) => {
                    const newStore = e.target.value;
                    setPengirim(newStore);
                    setTransCustomer(generateManualShipmentOrderId(orders, newStore));
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-2 px-3"
                  required
                >
                  <option value="">Pilih Store...</option>
                  {outlets.map((o, idx) => (
                    <option key={idx} value={o.nama}>{o.nama}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">PIC Store</label>
                <input
                  type="text"
                  value={picStore}
                  onChange={(e) => setPicStore(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                  placeholder="Nama PIC"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">No. Telp Store</label>
                <input
                  type="text"
                  value={telpPengirim}
                  onChange={(e) => setTelpPengirim(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                  placeholder="08..."
                />
              </div>
              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">No. Transaksi DealPOS (Bisa lebih dari 1, pisahkan koma)</label>
                <input
                  type="text"
                  value={transPengirim}
                  onChange={(e) => setTransPengirim(e.target.value)}
                  placeholder="Contoh: POS-260901-001, POS-260901-002"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                />
              </div>
            </div>
          </div>

          {/* Data Customer */}
          <div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-4 border-b border-slate-200 dark:border-slate-700/80 pb-2">Data Customer</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Nama Tujuan</label>
                <input
                  type="text"
                  value={tujuan}
                  onChange={(e) => setTujuan(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">No. Telp Tujuan</label>
                <input
                  type="text"
                  value={telpTujuan}
                  onChange={(e) => setTelpTujuan(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Alamat Tujuan</label>
                <textarea
                  value={alamatTujuan}
                  onChange={(e) => setAlamatTujuan(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                  rows={3}
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Notes Tambahan Paket</label>
                <input
                  type="text"
                  value={notesPaket}
                  onChange={(e) => setNotesPaket(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                />
              </div>
            </div>
          </div>

          {/* Pesanan */}
          <div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200 mb-4 border-b border-slate-200 dark:border-slate-700/80 pb-2 flex justify-between items-center">
              <span>Item Pesanan</span>
            </h3>

            {/* Scan / Add Product */}
            <div className="mb-6">
              <PhysicalScanInput 
                onScan={handleScanProduct}
                products={productCatalog}
                placeholder="KETIK SKU ATAU SCAN BARCODE"
              />
            </div>

            <div className="space-y-4">
              {items.length === 0 && (
                <div className="text-center py-12 text-slate-400 dark:text-slate-500">
                  <ShoppingBag className="w-16 h-16 mx-auto mb-4 text-slate-300 dark:text-slate-600" />
                  <div className="font-medium text-slate-500 dark:text-slate-400 mb-1">Empty Cart</div>
                  <div className="text-sm">Add products to the cart<br/>or scan barcode</div>
                </div>
              )}
              {items.map((item) => (
                  <div key={item.id} className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200 dark:border-slate-700/80 relative transition-colors">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      {/* Product Name */}
                      <div className="md:col-span-5 flex flex-col justify-center">
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Nama Produk</label>
                        <div className="font-semibold text-slate-800 dark:text-white text-sm">
                          {item.nama_produk}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                          SKU: {item.sku}
                        </div>
                      </div>

                      {/* QTY */}
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={item.qty ?? ''}
                          onFocus={(e) => e.target.select()}
                          onChange={(e) => {
                            const val = e.target.value;
                            handleItemChange(item.id, 'qty', val === '' ? '' : Math.max(0, parseInt(val, 10) || 0));
                          }}
                          onBlur={() => {
                            if (item.qty === '' || Number(item.qty) < 1) {
                              handleItemChange(item.id, 'qty', 1);
                            }
                          }}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-1.5 px-3 font-bold"
                          required
                        />
                      </div>

                      {/* Fulfillment */}
                      <div className="md:col-span-4">
                        <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Fulfillment</label>
                        <select
                          value={item.fulfillment}
                          onChange={(e) => handleItemChange(item.id, 'fulfillment', e.target.value)}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 text-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-1.5 px-3"
                          required
                        >
                          <option value="">Pilih Fulfillment...</option>
                          <option value="Marketplace">Marketplace</option>
                          {outlets.map((o, idx) => (
                            <option key={idx} value={o.nama}>{o.nama}</option>
                          ))}
                        </select>
                      </div>

                      {/* Remove */}
                      <div className="md:col-span-1 flex items-center md:items-end justify-end md:justify-center">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-2 rounded-lg transition-colors text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-1 text-xs font-semibold cursor-pointer"
                          title="Hapus item"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="md:hidden">Hapus</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
            {editingOrder && (
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-2.5 rounded-lg text-slate-700 dark:text-slate-300 font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Batal Edit
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className={`px-6 py-2.5 rounded-lg text-white font-medium flex items-center shadow-sm cursor-pointer transition-colors ${
                loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
              }`}
            >
              {loading ? (
                <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
              ) : (
                <Send className="w-5 h-5 mr-2" />
              )}
              {loading ? 'Submitting...' : editingOrder ? 'Update Pesanan' : 'Submit Pesanan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  const [selectedOrders, setSelectedOrders] = useState<Set<string>>(new Set());

  const toggleSelectOrder = (no_pesanan: string) => {
    const newSet = new Set(selectedOrders);
    if (newSet.has(no_pesanan)) newSet.delete(no_pesanan);
    else newSet.add(no_pesanan);
    setSelectedOrders(newSet);
  };

  const handlePrintPickingList = async () => {
    if (selectedOrders.size === 0) {
      onShowToast('Pilih setidaknya satu pesanan untuk mencetak picking list', 'info');
      return;
    }
    const itemsToPrint = orders.filter(o => o.no_pesanan && selectedOrders.has(o.no_pesanan));
    if (itemsToPrint.length === 0) return;
    
    // Update status to diproses
    setLoading(true);
    for (const id of selectedOrders) {
      await updateShipmentStatus(id, 'diproses');
    }
    loadOrders();
    setLoading(false);

    // Set payload cetak in-page (100% didukung di HP dan desktop)
    setPrintPayload({
      mode: 'PICKING',
      orders: itemsToPrint,
      qrMap: {},
      timestamp: Date.now(),
    });
    
    setSelectedOrders(new Set());
    onShowToast(`Menyiapkan cetak ${itemsToPrint.length} picking list`, 'success');
  };

  const renderOrderDetailsModal = () => {
    if (!selectedOrderDetails) return null;
    const order = selectedOrderDetails;
    const totalQty = order.items?.reduce((acc, it) => acc + (Number(it.qty) || 0), 0) || 0;

    return (
      <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl transition-colors">
          <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setSelectedOrderDetails(null)} 
                className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 dark:text-slate-400 cursor-pointer"
                title="Kembali"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h2 className="text-xl font-bold text-slate-800 dark:text-white tracking-tight">ORDER ID #{order.no_pesanan}</h2>
            </div>
            <button 
              onClick={() => setSelectedOrderDetails(null)} 
              className="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors text-slate-500 dark:text-slate-400 cursor-pointer"
              title="Tutup"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-slate-900">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Left Column */}
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Shipping Address</h3>
                  <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                    <div className="font-semibold text-slate-800 dark:text-white text-base">{order.nama_tujuan}</div>
                    <div className="font-mono">{order.no_telp_tujuan}</div>
                    <div className="mt-2 whitespace-pre-wrap leading-relaxed">{order.alamat_tujuan}</div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Pengirim / Store Info</h3>
                  <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                    <div className="font-semibold text-slate-800 dark:text-white text-base">{order.nama_pengirim}</div>
                    {order.pic_store && <div>PIC: <span className="text-slate-800 dark:text-slate-200 font-medium">{order.pic_store}</span></div>}
                    {order.no_telp_store && <div className="font-mono">{order.no_telp_store}</div>}
                    {order.no_transaksi_pengirim && order.no_transaksi_pengirim.length > 0 && (
                      <div className="mt-2">
                        <span className="font-medium text-slate-800 dark:text-slate-200">DealPOS:</span> {order.no_transaksi_pengirim.join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Customer Info</h3>
                  <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
                    <div className="font-semibold text-slate-800 dark:text-white">{order.nama_tujuan}</div>
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-8">
                <div className="flex gap-2 flex-wrap">
                  <button 
                    onClick={() => { setSelectedOrderDetails(null); handlePrintLabel(order); }}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold rounded-lg text-sm border border-slate-300 dark:border-slate-700 flex items-center transition-colors cursor-pointer"
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Print Label
                  </button>
                  <button 
                    onClick={() => { setSelectedOrderDetails(null); handleEdit(order); }}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold rounded-lg text-sm border border-slate-300 dark:border-slate-700 flex items-center transition-colors cursor-pointer"
                  >
                    Edit
                  </button>
                  <button 
                    onClick={() => { handleUpdateResi(order.no_pesanan!); }}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold rounded-lg text-sm border border-slate-300 dark:border-slate-700 flex items-center transition-colors cursor-pointer"
                  >
                    Resi
                  </button>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Order Items</h3>
                  <div className="space-y-3">
                    {order.items?.map((item, idx) => (
                      <div key={idx} className="text-sm text-slate-700 dark:text-slate-300 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                        <div>
                          <div className="font-semibold text-indigo-600 dark:text-indigo-400">{item.nama_produk}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">SKU: {item.sku} {item.size && item.size !== 'ALL' && item.size !== '-' ? `| Size: ${item.size}` : ''}</div>
                        </div>
                        <div className="font-bold bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700">x{item.qty}</div>
                      </div>
                    ))}
                    <div className="pt-2 font-bold text-slate-800 dark:text-white flex justify-between text-base">
                      <span>Total</span>
                      <span>{totalQty} Items</span>
                    </div>
                  </div>
                  <div className="mt-6 text-sm text-slate-600 dark:text-slate-300">
                    <span className="font-medium text-slate-800 dark:text-slate-200">Jasa Kirim:</span> {order.jasa_kirim || '-'}
                  </div>
                  {order.no_transaksi_customer && (
                     <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                       <span className="font-medium text-slate-800 dark:text-slate-200">Order ID:</span> {order.no_transaksi_customer}
                     </div>
                  )}
                  {order.notes_paket && (
                     <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                       <span className="font-medium text-slate-800 dark:text-slate-200">Notes:</span> {order.notes_paket}
                     </div>
                  )}
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">History</h3>
                  <div className="text-xs text-slate-500 dark:text-slate-400 space-y-2">
                    <div>Order was placed on <span className="font-semibold text-slate-700 dark:text-slate-300">{new Date(order.created_at || '').toLocaleString('id-ID')}</span></div>
                    {order.submitted_by && <div>Submitted by <span className="font-semibold text-slate-700 dark:text-slate-300">{formatOperatorWithPersonName(order.submitted_by)}</span></div>}
                    <div className="inline-block mt-2">
                      <span className={`px-2 py-1 rounded text-xs font-semibold uppercase tracking-wider border ${
                        order.status === 'diterima' ? 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800' : 
                        order.status === 'diproses' ? 'border-yellow-400 dark:border-yellow-600/70 text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40' : 
                        order.status === 'dikirim' ? 'border-emerald-400 dark:border-emerald-600/70 text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' : 
                        order.status === 'batal' ? 'border-red-400 dark:border-red-600/70 text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40' : 
                        'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
                      }`}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const handlePrintLabel = async (singleOrder?: ManualShipmentOrder) => {
    const itemsToPrint = singleOrder
      ? [singleOrder]
      : orders.filter(o => o.no_pesanan && selectedOrders.has(o.no_pesanan));

    if (itemsToPrint.length === 0) {
      onShowToast('Pilih setidaknya satu pesanan untuk dicetak labelnya', 'info');
      return;
    }

    setLoading(true);
    const qrMap: Record<string, string> = {};
    for (const order of itemsToPrint) {
      try {
        const qrDataUrl = await QRCode.toDataURL(order.no_pesanan || 'UNKNOWN', { 
          errorCorrectionLevel: 'M', 
          margin: 1, 
          width: 180 
        });
        qrMap[order.no_pesanan || ''] = qrDataUrl;
      } catch (err) {
        console.error('QR generation error:', err);
      }
    }
    setLoading(false);

    // Set payload cetak in-page (100% didukung di HP / mobile dan desktop)
    setPrintPayload({
      mode: 'LABEL',
      orders: itemsToPrint,
      qrMap,
      timestamp: Date.now(),
    });

    if (!singleOrder) {
      setSelectedOrders(new Set());
    }
    onShowToast(`Menyiapkan cetak label A6 ${itemsToPrint.length} paket`, 'success');
  };

  const handleUpdateResi = async (no_pesanan: string) => {
    const resi = prompt('Masukkan Nomor Resi:');
    if (!resi) return;
    
    setLoading(true);
    const success = await updateShipmentResi(no_pesanan, resi);
    if (success) {
      onShowToast('Resi berhasil diupdate', 'success');
      loadOrders();
    } else {
      onShowToast('Gagal update resi', 'error');
    }
    setLoading(false);
  };

  const handleEdit = (order: ManualShipmentOrder) => {
    setEditingOrder(order);
    setPengirim(order.nama_pengirim || '');
    setPicStore(order.pic_store || '');
    setTelpPengirim(order.no_telp_store || '');
    setTransPengirim((order.no_transaksi_pengirim || []).join(', '));
    
    if (jasaKirimList.includes(order.jasa_kirim || '')) {
      setJasaKirim(order.jasa_kirim || '');
      setIsCustomJasaKirim(false);
    } else {
      setJasaKirim('custom');
      setCustomJasaKirim(order.jasa_kirim || '');
      setIsCustomJasaKirim(true);
    }
    
    setTujuan(order.nama_tujuan || '');
    setTelpTujuan(order.no_telp_tujuan || '');
    setAlamatTujuan(order.alamat_tujuan || '');
    setNotesPaket(order.notes_paket || '');
    setTransCustomer(order.no_transaksi_customer || '');
    setItems(order.items || []);
    
    setActiveTab('form');
  };

  const handleDelete = async (no_pesanan: string) => {
    if (!confirm(`Yakin ingin menghapus pesanan ${no_pesanan}?`)) return;
    setLoading(true);
    const success = await deleteManualShipment(no_pesanan);
    if (success) {
      onShowToast('Pesanan berhasil dihapus', 'success');
      loadOrders();
    } else {
      onShowToast('Gagal hapus pesanan', 'error');
    }
    setLoading(false);
  };

  const filteredOrders = useMemo(() => {
    let result = orders;
    
    // Status filter
    if (filterStatus !== 'all') {
      result = result.filter(o => o.status === filterStatus);
    }
    
    // Store filter
    if (filterStore !== 'all') {
      result = result.filter(o => o.nama_pengirim === filterStore);
    }

    // Jasa Kirim filter
    if (filterJasaKirim !== 'all') {
      result = result.filter(o => o.jasa_kirim === filterJasaKirim);
    }
    
    // Date filter
    if (filterStartDate) {
      const start = new Date(filterStartDate);
      start.setHours(0, 0, 0, 0);
      result = result.filter(o => {
        if (!o.created_at) return false;
        const d = new Date(o.created_at);
        return d >= start;
      });
    }
    if (filterEndDate) {
      const end = new Date(filterEndDate);
      end.setHours(23, 59, 59, 999);
      result = result.filter(o => {
        if (!o.created_at) return false;
        const d = new Date(o.created_at);
        return d <= end;
      });
    }

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase().trim();
      result = result.filter(o => 
        (o.no_pesanan && o.no_pesanan.toLowerCase().includes(q)) ||
        (o.no_transaksi_customer && o.no_transaksi_customer.toLowerCase().includes(q)) ||
        (o.jasa_kirim && o.jasa_kirim.toLowerCase().includes(q)) ||
        (o.no_transaksi_pengirim && o.no_transaksi_pengirim.some(p => p.toLowerCase().includes(q))) ||
        (o.nama_tujuan && o.nama_tujuan.toLowerCase().includes(q)) ||
        (o.nama_pengirim && o.nama_pengirim.toLowerCase().includes(q)) ||
        (o.no_resi && o.no_resi.toLowerCase().includes(q)) ||
        (o.no_telp_tujuan && o.no_telp_tujuan.toLowerCase().includes(q)) ||
        (o.items && o.items.some(i => i.nama_produk?.toLowerCase().includes(q) || i.sku?.toLowerCase().includes(q)))
      );
    }
    
    return result;
  }, [orders, searchTerm, filterStore, filterJasaKirim, filterStatus, filterStartDate, filterEndDate]);

  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      onShowToast('Tidak ada data untuk diexport', 'warning');
      return;
    }
    
    // Standar format database seperti yang diterapkan di sheet:
    // Setiap baris merepresentasikan 1 item produk dengan kolom terpisah:
    // SKU | Nama produk | size | qty
    const headers = [
      'Order ID',
      'Tanggal',
      'Pengirim',
      'PIC Store',
      'No Telp Pengirim',
      'No Transaksi DealPOS',
      'Nama Tujuan',
      'No Telp Tujuan',
      'Alamat Tujuan',
      'Jasa Kirim',
      'No Resi',
      'Status',
      'Notes Paket',
      'Submitted By',
      'SKU',
      'Nama Produk',
      'Size',
      'Qty',
      'Fulfillment',
    ];

    const escapeCsv = (val: any): string => {
      if (val === null || val === undefined) return '""';
      const str = String(val);
      return `"${str.replace(/"/g, '""')}"`;
    };

    const rows: string[] = [];

    filteredOrders.forEach((o) => {
      const orderDate = o.created_at ? new Date(o.created_at).toLocaleDateString('id-ID', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }) : '';

      const dealposStr = Array.isArray(o.no_transaksi_pengirim)
        ? o.no_transaksi_pengirim.join('; ')
        : (o.no_transaksi_pengirim || '');

      const baseOrderCols = [
        o.no_pesanan || '',
        orderDate,
        o.nama_pengirim || '',
        o.pic_store || '',
        o.no_telp_store || '',
        dealposStr,
        o.nama_tujuan || '',
        o.no_telp_tujuan || '',
        o.alamat_tujuan || '',
        o.jasa_kirim || '',
        o.no_resi || '',
        o.status || '',
        o.notes_paket || '',
        o.submitted_by || '',
      ];

      if (o.items && o.items.length > 0) {
        o.items.forEach((it) => {
          let size = it.size || '';
          if (!size && it.nama_produk) {
            const parts = it.nama_produk.split('-');
            if (parts.length > 1) {
              size = parts[parts.length - 1].trim();
            }
          }

          const rowCols = [
            ...baseOrderCols,
            it.sku || '',
            it.nama_produk || '',
            size,
            it.qty || 1,
            it.fulfillment || '',
          ];

          rows.push(rowCols.map(escapeCsv).join(','));
        });
      } else {
        const rowCols = [
          ...baseOrderCols,
          '',
          '',
          '',
          '',
          '',
        ];
        rows.push(rowCols.map(escapeCsv).join(','));
      }
    });

    // Tambahkan UTF-8 BOM (\uFEFF) agar terbaca sempurna di Microsoft Excel dan Google Sheets
    const csvContent = '\uFEFF' + [headers.map(escapeCsv).join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `manual_shipment_database_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    onShowToast(`Berhasil mengekspor ${rows.length} baris data ke format database`, 'success');
  };

  const renderRekap = () => (
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-full min-h-[600px] transition-colors">
      <div className="p-3 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3 bg-slate-50 dark:bg-slate-800/60">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <h2 className="text-base sm:text-lg font-bold text-slate-800 dark:text-white flex items-center">
              <FileText className="w-5 h-5 mr-1.5 sm:mr-2 text-indigo-600 dark:text-indigo-400 shrink-0" />
              Rekap Manual Shipment
            </h2>
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-200/80 dark:bg-slate-700/80 px-2.5 py-0.5 rounded-full">
              {filteredOrders.length} Order
            </span>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={handleExportCSV}
              className="px-2.5 py-1.5 text-slate-700 dark:text-slate-200 hover:text-emerald-700 dark:hover:text-emerald-400 bg-white dark:bg-slate-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs transition-colors flex items-center gap-1.5 text-xs font-semibold cursor-pointer"
              title="Export CSV Format Database (SKU, Nama, Size, Qty)"
            >
              <FileText className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">Export</span>
            </button>
            <button
              onClick={loadOrders}
              className="p-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            
            <div className="flex border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800 shadow-xs">
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                  viewMode === 'table' 
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 font-bold' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                Tabel
              </button>
              <button
                onClick={() => setViewMode('card')}
                className={`px-2.5 py-1.5 text-xs font-semibold border-l border-slate-200 dark:border-slate-700 transition-colors cursor-pointer ${
                  viewMode === 'card' 
                    ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-400 font-bold' 
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700/50'
                }`}
              >
                Kartu
              </button>
            </div>
          </div>
        </div>

        {/* Filter Toolbar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-slate-400 dark:text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Cari Order ID, DealPOS, Jasa Kirim, resi..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-2 sm:flex items-center gap-1.5">
            <select
              value={filterStore}
              onChange={(e) => setFilterStore(e.target.value)}
              className="py-1.5 px-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 truncate"
            >
              <option value="all">Semua Store</option>
              {outlets.map((o, idx) => (
                <option key={idx} value={o.nama}>{o.nama}</option>
              ))}
            </select>

            <select
              value={filterJasaKirim}
              onChange={(e) => setFilterJasaKirim(e.target.value)}
              className="py-1.5 px-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 truncate"
            >
              <option value="all">Semua Jasa Kirim</option>
              {jasaKirimList.map((jk, idx) => (
                <option key={idx} value={jk}>{jk}</option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="py-1.5 px-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Semua Status</option>
              <option value="pending">Pending</option>
              <option value="diterima">Diterima</option>
              <option value="diproses">Diproses</option>
              <option value="dikirim">Dikirim</option>
              <option value="batal">Batal</option>
            </select>
            
            <div className="flex items-center gap-1 col-span-2 sm:col-span-1">
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="py-1.5 px-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full"
              />
              <span className="text-xs text-slate-500 dark:text-slate-400">-</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="py-1.5 px-2 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 w-full"
              />
            </div>
          </div>
        </div>

        {canAction && selectedOrders.size > 0 && (
          <div className="flex items-center gap-2 pt-2 border-t border-slate-200 dark:border-slate-700/80 flex-wrap">
            <button
              onClick={handlePrintPickingList}
              className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-200 dark:hover:bg-indigo-900/60 text-xs font-semibold flex items-center transition-colors cursor-pointer"
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              Cetak Picking ({selectedOrders.size})
            </button>
            <button
              onClick={() => handlePrintLabel()}
              className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-xs font-semibold flex items-center transition-colors cursor-pointer shadow-xs"
              title="Cetak Label Paket A6 untuk pesanan yang dipilih"
            >
              <Printer className="w-3.5 h-3.5 mr-1.5" />
              Cetak Label A6 ({selectedOrders.size})
            </button>
          </div>
        )}
      </div>
      
      <div className="flex-1 overflow-auto bg-slate-50/50 dark:bg-slate-900/50">
        {viewMode === 'table' ? (
          <table className="min-w-full">
            <thead className="bg-white dark:bg-slate-800/90 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 backdrop-blur-xs">
              <tr>
                {canAction && (
                  <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal w-10">
                    <input
                      type="checkbox"
                      className="rounded-sm border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                      onChange={(e) => {
                        if (e.target.checked) setSelectedOrders(new Set(filteredOrders.map(o => o.no_pesanan)));
                        else setSelectedOrders(new Set());
                      }}
                      checked={filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length}
                    />
                  </th>
                )}
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Order</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Date</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Store / Pengirim</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Customer</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Shipping Method</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Status</th>
                <th scope="col" className="px-3 py-2 text-center text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Total Items</th>
                {canAction && (
                  <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={canAction ? 9 : 8} className="px-3 py-8 text-center text-[11px] text-slate-500 dark:text-slate-400">
                    {searchTerm ? 'Tidak ada pesanan yang cocok dengan pencarian' : 'Tidak ada data pesanan'}
                  </td>
                </tr>
              ) : (
              filteredOrders.map((order) => (
                <tr key={order.no_pesanan} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  {canAction && (
                    <td className="px-3 py-2.5 whitespace-nowrap align-top">
                      <input
                        type="checkbox"
                        className="rounded-sm border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer mt-0.5"
                        checked={selectedOrders.has(order.no_pesanan)}
                        onChange={() => toggleSelectOrder(order.no_pesanan)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <div 
                      className="text-[11px] font-semibold text-[#00a8e8] dark:text-sky-400 hover:underline cursor-pointer"
                      onClick={() => setSelectedOrderDetails(order)}
                    >
                      {order.no_pesanan}
                    </div>
                    {order.no_transaksi_customer && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        ID: {order.no_transaksi_customer}
                      </div>
                    )}
                    {order.no_transaksi_pengirim && order.no_transaksi_pengirim.length > 0 && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                        DPOS: {order.no_transaksi_pengirim.join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">
                      {new Date(order.created_at || '').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="text-[11px] font-semibold text-slate-800 dark:text-white">{order.nama_pengirim}</div>
                    {order.pic_store && <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">PIC: {order.pic_store}</div>}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div 
                      className="text-[11px] font-medium text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer inline-flex transition-colors"
                      onClick={() => setSelectedOrderDetails(order)}
                    >
                      {order.nama_tujuan}
                    </div>
                    <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[160px] mt-0.5" title={order.alamat_tujuan}>
                      {order.alamat_tujuan}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5">{order.jasa_kirim || '-'}</div>
                    {order.no_resi && (
                      <div className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                        {order.no_resi}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <span className={`mt-0.5 px-2 py-0.5 inline-block text-[10px] font-semibold rounded-md border ${
                      order.status === 'diterima' ? 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800' : 
                      order.status === 'diproses' ? 'border-yellow-400 dark:border-yellow-600/70 text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40' : 
                      order.status === 'dikirim' ? 'border-emerald-400 dark:border-emerald-600/70 text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' : 
                      order.status === 'batal' ? 'border-red-400 dark:border-red-600/70 text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40' : 
                      'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
                    }`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-top text-center">
                    <button 
                      type="button"
                      onClick={() => setSelectedOrderDetails(order)}
                      className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-2.5 py-1 rounded-md border border-indigo-100 dark:border-indigo-800/80 transition-colors cursor-pointer"
                    >
                      {order.items?.reduce((acc, it) => acc + (Number(it.qty) || 0), 0) || 0} Items
                    </button>
                  </td>
                  {canAction && (
                    <td className="px-3 py-2.5 whitespace-nowrap text-right align-top">
                      <select
                        className="text-[10px] text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm font-medium"
                        onChange={(e) => {
                          const action = e.target.value;
                          if (action === 'print') handlePrintLabel(order);
                          if (action === 'edit') {
                            handleEdit(order);
                            setActiveTab('form');
                          }
                          if (action === 'resi') handleUpdateResi(order.no_pesanan!);
                          if (action === 'delete') handleDelete(order.no_pesanan!);
                          e.target.value = ''; // reset after selection
                        }}
                        defaultValue=""
                      >
                        <option value="" disabled>Aksi</option>
                        <option value="print">Print Label</option>
                        <option value="edit">Edit</option>
                        <option value="resi">Update Resi</option>
                        <option value="delete">Hapus</option>
                      </select>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
        ) : (
          <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredOrders.length === 0 ? (
              <div className="col-span-full py-8 text-center text-sm text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                {searchTerm ? 'Tidak ada pesanan yang cocok dengan pencarian' : 'Tidak ada data pesanan'}
              </div>
            ) : (
              filteredOrders.map((order) => (
                <div key={order.no_pesanan} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col transition-shadow hover:shadow-md">
                  <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-start">
                    <div className="flex gap-2 items-start">
                      {canAction && (
                        <input
                          type="checkbox"
                          className="rounded-sm border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-blue-500 focus:ring-blue-500 w-4 h-4 cursor-pointer mt-0.5"
                          checked={selectedOrders.has(order.no_pesanan)}
                          onChange={() => toggleSelectOrder(order.no_pesanan)}
                        />
                      )}
                      <div>
                        <div 
                          className="font-bold text-[#00a8e8] dark:text-sky-400 hover:underline cursor-pointer text-sm"
                          onClick={() => setSelectedOrderDetails(order)}
                        >
                          {order.no_pesanan}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {new Date(order.created_at || '').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide border ${
                      order.status === 'diterima' ? 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800' : 
                      order.status === 'diproses' ? 'border-yellow-400 dark:border-yellow-600/70 text-yellow-800 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-950/40' : 
                      order.status === 'dikirim' ? 'border-emerald-400 dark:border-emerald-600/70 text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40' : 
                      order.status === 'batal' ? 'border-red-400 dark:border-red-600/70 text-red-800 dark:text-red-300 bg-red-50 dark:bg-red-950/40' : 
                      'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800'
                    }`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1).toLowerCase()}
                    </span>
                  </div>
                  
                  <div className="p-4 flex-1 space-y-3">
                    <div className="flex items-start gap-2">
                      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 shrink-0 mt-0.5">
                        <Package className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Pengirim</div>
                        <div className="text-xs font-semibold text-slate-800 dark:text-white">{order.nama_pengirim}</div>
                        {order.pic_store && <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">PIC: {order.pic_store}</div>}
                      </div>
                    </div>
                    
                    <div className="flex items-start gap-2">
                      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 shrink-0 mt-0.5">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Customer</div>
                        <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{order.nama_tujuan}</div>
                      </div>
                    </div>

                    <div className="flex items-start gap-2">
                      <div className="bg-slate-100 dark:bg-slate-800 p-1.5 rounded-lg text-slate-500 dark:text-slate-400 shrink-0 mt-0.5">
                        <Truck className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Jasa Kirim</div>
                        <div className="text-xs font-medium text-slate-800 dark:text-slate-200">{order.jasa_kirim || '-'}</div>
                        {order.no_resi && (
                          <div className="text-[10px] text-slate-600 dark:text-slate-300 font-mono mt-0.5 tracking-wider bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 inline-block">
                            {order.no_resi}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex justify-between items-center">
                    <button 
                      type="button"
                      onClick={() => setSelectedOrderDetails(order)}
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-3 py-1.5 rounded-md border border-indigo-100 dark:border-indigo-800/80 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      {order.items?.reduce((acc, it) => acc + (Number(it.qty) || 0), 0) || 0} Items
                    </button>
                    
                    {canAction && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePrintLabel(order)}
                          title="Print Label A6"
                          className="p-1.5 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-lg flex items-center justify-center transition-colors cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <select
                          className="text-xs text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 shadow-sm font-medium w-24"
                          onChange={(e) => {
                            const action = e.target.value;
                            if (action === 'print') handlePrintLabel(order);
                            if (action === 'edit') {
                              handleEdit(order);
                              setActiveTab('form');
                            }
                            if (action === 'resi') handleUpdateResi(order.no_pesanan!);
                            if (action === 'delete') handleDelete(order.no_pesanan!);
                            e.target.value = ''; // reset after selection
                          }}
                          defaultValue=""
                        >
                          <option value="" disabled>Aksi</option>
                          <option value="print">Print Label</option>
                          <option value="edit">Edit</option>
                          <option value="resi">Update Resi</option>
                          <option value="delete">Hapus</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-2.5 sm:p-5 lg:p-6 animate-in fade-in duration-300">
      {/* Tab Navigation */}
      <div className="grid grid-cols-2 gap-1.5 p-1.5 mb-4 sm:mb-6 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 transition-colors">
        <button
          type="button"
          className={`w-full py-2.5 px-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 sm:gap-2 select-none min-w-0 cursor-pointer ${
            activeTab === 'form'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700 font-extrabold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
          onClick={() => {
            if (editingOrder) resetForm();
            setActiveTab('form');
          }}
        >
          <Package className="w-4 h-4 shrink-0" />
          <span className="truncate">{editingOrder ? 'Edit Pesanan' : 'Form Input Pesanan'}</span>
        </button>
        <button
          type="button"
          className={`w-full py-2.5 px-2 text-xs sm:text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 sm:gap-2 select-none min-w-0 cursor-pointer ${
            activeTab === 'rekap'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700 font-extrabold'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
          onClick={() => {
            setActiveTab('rekap');
            loadOrders();
          }}
        >
          <History className="w-4 h-4 shrink-0" />
          <span className="truncate">Rekap Pesanan</span>
        </button>
      </div>

      <div className="w-full">
        <div className={activeTab === 'form' ? 'block' : 'hidden'}>
          {renderForm()}
        </div>
        
        <div className={activeTab === 'rekap' ? 'block' : 'hidden'}>
          {renderRekap()}
        </div>
      </div>
      {renderOrderDetailsModal()}

      {/* CSS @media print terisolasi ke #manual-shipment-print-area untuk keandalan cetak di HP / mobile & desktop */}
      {printPayload && (
        <style>{`
          @media print {
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              ${printPayload.mode === 'LABEL' ? 'width: 105mm !important; height: 148mm !important;' : ''}
              overflow: visible !important;
            }
            body * {
              visibility: hidden !important;
            }
            #manual-shipment-print-area, #manual-shipment-print-area * {
              visibility: visible !important;
            }
            #manual-shipment-print-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: ${printPayload.mode === 'LABEL' ? '105mm' : '100%'} !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              z-index: 999999 !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            @page {
              size: ${printPayload.mode === 'LABEL' ? '105mm 148mm' : 'auto'};
              margin: ${printPayload.mode === 'LABEL' ? '0 !important' : '10mm !important'};
            }
            .page-break {
              box-sizing: border-box !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .page-break:not(:last-child) {
              page-break-after: always !important;
              break-after: page !important;
            }
            .page-break:last-child {
              page-break-after: avoid !important;
              break-after: avoid !important;
            }
          }
        `}</style>
      )}

      {/* Floating Action Bar jika dialog cetak perlu dipicu manual di HP */}
      {printPayload && (
        <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 z-50 bg-slate-900 text-white p-3 sm:p-4 rounded-2xl shadow-2xl flex items-center justify-between gap-3 border border-slate-700 print:hidden animate-in slide-in-from-bottom duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-600 text-white shrink-0">
              <Printer className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-bold truncate">
                {printPayload.mode === 'LABEL'
                  ? `Siap Cetak Label A6 (${printPayload.orders.length} Paket)`
                  : `Siap Cetak Picking List (${printPayload.orders.length} Pesanan)`}
              </div>
              <div className="text-[10px] text-slate-300 truncate">
                Tekan Cetak jika dialog belum muncul di HP
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                try {
                  window.print();
                } catch (err) {
                  console.error('Print error:', err);
                }
              }}
              className="px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-600 active:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Cetak
            </button>
            <button
              type="button"
              onClick={() => setPrintPayload(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              title="Tutup banner cetak"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Hidden In-Page Print Area (sama persis dengan arsitektur CetakLabelView yang terbukti bisa via HP) */}
      {printPayload && (
        <div id="manual-shipment-print-area" className="hidden print:block bg-white w-full text-black">
          {printPayload.mode === 'LABEL' ? (
            printPayload.orders.map((order, orderIdx) => {
              const qrDataUrl = printPayload.qrMap[order.no_pesanan || ''] || '';
              const totalQty = (order.items || []).reduce((acc, it) => acc + (Number(it.qty) || 0), 0) || 1;

              return (
                <div
                  key={order.no_pesanan || orderIdx}
                  className="page-break w-[105mm] h-[148mm] max-h-[148mm] p-[2mm] box-border bg-white relative overflow-hidden flex flex-col justify-between"
                  style={{
                    pageBreakAfter: orderIdx < printPayload.orders.length - 1 ? 'always' : 'avoid',
                    breakAfter: orderIdx < printPayload.orders.length - 1 ? 'page' : 'avoid',
                    pageBreakInside: 'avoid',
                    breakInside: 'avoid',
                  }}
                >
                  <div className="w-full h-full max-h-[144mm] border-[2px] border-black flex flex-col bg-white box-border text-black overflow-hidden justify-between">
                    {/* 1. Header */}
                    <div className="flex justify-between items-center px-3 py-2 border-b-2 border-black bg-gray-50 shrink-0">
                      <div className="text-[15px] font-black tracking-widest uppercase leading-none text-black">
                        CHOCOCHIPS
                      </div>
                      <div className="text-[13px] font-black tracking-wider uppercase text-right leading-tight text-black">
                        {order.jasa_kirim || 'PENGIRIMAN PAKET'}
                      </div>
                    </div>

                    {/* 2. Order ID Box */}
                    <div className="text-center border-b-2 border-black py-1 px-2 text-[11px] font-black uppercase tracking-wider bg-white text-black shrink-0">
                      ORDER ID: {order.no_pesanan || ''}
                    </div>

                    {/* 3. Address Block */}
                    <div className="flex border-b-2 border-black bg-white shrink-0">
                      {/* Left: Penerima */}
                      <div className="flex-1 p-2 border-r-2 border-black min-w-0">
                        <div className="text-[9px] font-black uppercase mb-0.5 text-gray-600">
                          PENERIMA: <span className="text-[11px] font-black text-black">{order.nama_tujuan || '-'}</span>
                        </div>
                        {order.no_telp_tujuan && (
                          <div className="text-[10px] font-black mb-0.5 text-black font-mono">{order.no_telp_tujuan}</div>
                        )}
                        <div className="text-[9.5px] font-bold leading-tight text-black line-clamp-3">{order.alamat_tujuan || '-'}</div>

                        {order.notes_paket && (
                          <>
                            <div className="mt-1 text-[8px] font-black uppercase text-gray-500">NOTE:</div>
                            <div className="text-[9px] font-bold text-black line-clamp-2">{order.notes_paket}</div>
                          </>
                        )}
                      </div>

                      {/* Right: Pengirim */}
                      <div className="w-[130px] flex flex-col p-2 text-black shrink-0">
                        <div className="text-[9px] font-black uppercase mb-0.5 text-gray-600">PENGIRIM:</div>
                        <div className="text-[11px] font-black uppercase mb-0.5 text-black leading-tight">{order.nama_pengirim || 'CHOCOCHIPS'}</div>
                        {order.pic_store && (
                          <div className="text-[9px] font-black mb-0.5 text-gray-800">PIC: {order.pic_store}</div>
                        )}
                        {order.no_telp_store && (
                          <div className="text-[9px] font-bold font-mono text-gray-700">{order.no_telp_store}</div>
                        )}
                      </div>
                    </div>

                    {/* 4. Warning Box */}
                    <div className="py-1 px-2 border-b-2 border-black text-[8.5px] font-black text-center uppercase bg-gray-100 text-black shrink-0">
                      ⚠️ PERHATIAN: JANGAN DITERIMA JIKA KONDISI PAKET RUSAK ATAU SEGEL TERBUKA • WAJIB VIDEO UNBOXING
                    </div>

                    {/* 5. Table Box & QR Code */}
                    <div className="flex flex-1 bg-white overflow-hidden min-h-0">
                      {/* Left Table */}
                      <div className="flex-1 p-2 border-r-2 border-black overflow-hidden flex flex-col justify-between">
                        <table className="w-full border-collapse text-[9.5px]">
                          <thead>
                            <tr className="border-b border-dashed border-black">
                              <th className="text-left py-0.5 px-0.5 w-[7%] font-normal">No.</th>
                              <th className="text-left py-0.5 px-0.5 w-[47%] font-normal">Nama Produk</th>
                              <th className="text-left py-0.5 px-0.5 w-[14%] font-normal">Size</th>
                              <th className="text-left py-0.5 px-0.5 w-[22%] font-normal">SKU</th>
                              <th className="text-center py-0.5 px-0.5 w-[10%] font-normal">Qty</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.items && order.items.length > 0 ? (
                              order.items.map((it, idx) => {
                                let cleanName = it.nama_produk;
                                let size = '';
                                const parts = it.nama_produk.split('-');
                                if (parts.length > 1) {
                                  size = parts[parts.length - 1].trim();
                                  cleanName = parts.slice(0, parts.length - 1).join('-').trim();
                                }
                                return (
                                  <tr key={idx} className="border-b border-dashed border-black">
                                    <td className="py-0.5 px-0.5 align-top">{idx + 1}.</td>
                                    <td className="py-0.5 px-0.5 align-top leading-tight line-clamp-1">{cleanName}</td>
                                    <td className="py-0.5 px-0.5 align-top">{size}</td>
                                    <td className="py-0.5 px-0.5 align-top">{it.sku || ''}</td>
                                    <td className="py-0.5 px-0.5 align-top text-center">{it.qty || 1}</td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={5} className="py-1 text-center border-b border-dashed border-black text-gray-500">
                                  Tidak ada detail produk
                                </td>
                              </tr>
                            )}
                            <tr>
                              <td colSpan={4} className="text-right py-1 pr-2 font-normal">TOTAL</td>
                              <td className="text-center py-1 font-normal">{totalQty}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>

                      {/* Right QR */}
                      <div className="w-[100px] p-2 flex flex-col items-center justify-start bg-white shrink-0">
                        {qrDataUrl && (
                          <img
                            src={qrDataUrl}
                            className="w-[70px] h-[70px] object-contain mb-1"
                            alt="QR Code"
                          />
                        )}
                        <div className="text-[8px] font-bold text-center break-all mb-0.5 text-black leading-tight">
                          {order.no_pesanan || ''}
                        </div>
                        {order.no_transaksi_customer && (
                          <div className="text-[7.5px] text-center break-all text-neutral-600 leading-tight">
                            {order.no_transaksi_customer}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            // Picking List Mode
            printPayload.orders.map((order, oIdx) => {
              const todayStr = new Date().toLocaleDateString('id-ID', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              });
              const dealPosStr = (order.no_transaksi_pengirim || []).join(', ') || '-';
              const totalQty = (order.items || []).reduce((acc, it) => acc + (Number(it.qty) || 0), 0);

              return (
                <div
                  key={order.no_pesanan || oIdx}
                  className="page-break p-5 max-w-[800px] mx-auto text-slate-900 bg-white"
                  style={{ pageBreakAfter: 'always', breakAfter: 'page' }}
                >
                  <div className="flex justify-between items-start border-b-2 border-slate-900 pb-3 mb-4">
                    <div>
                      <div className="text-lg font-black tracking-wide text-indigo-600">CHOCOCHIPS WMS</div>
                      <div className="text-sm font-extrabold mt-0.5">SURAT JALAN PICKING MANUAL SHIPMENT</div>
                      <div className="text-[11px] text-slate-500 mt-1">
                        Tanggal: <b>{todayStr}</b> • Admin: <b>{session?.name || getUserPersonName(session?.username) || 'Admin'}</b>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-base font-black font-mono border-2 border-slate-900 px-2.5 py-1 rounded-md inline-block">
                        {order.no_pesanan}
                      </div>
                      <div className="text-xs font-bold text-slate-700 mt-1">
                        Dari: <span className="text-indigo-600">{order.nama_pengirim}</span>
                      </div>
                      <div className="text-xs font-bold text-slate-700 mt-0.5">
                        Tujuan: <span className="text-emerald-700">{order.nama_tujuan}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mb-3 text-[11px] leading-relaxed">
                    <div><strong>Order ID:</strong> {order.no_transaksi_customer || '-'}</div>
                    <div><strong>Jasa Kirim:</strong> {order.jasa_kirim || '-'}</div>
                    <div><strong>DealPOS:</strong> {dealPosStr}</div>
                  </div>

                  <table className="w-full border-collapse mb-5 text-[11px]">
                    <thead>
                      <tr className="bg-slate-100 border-b-2 border-slate-300 text-[10px] uppercase text-slate-600">
                        <th className="p-2 text-center w-8">NO</th>
                        <th className="p-2 text-left w-36">SKU / CODE</th>
                        <th className="p-2 text-left">NAMA PRODUK</th>
                        <th className="p-2 text-center w-14">SIZE</th>
                        <th className="p-2 text-center w-14">QTY</th>
                        <th className="p-2 text-center w-20">LOKASI</th>
                        <th className="p-2 text-center w-10">CEK</th>
                      </tr>
                    </thead>
                    <tbody>
                      {order.items?.map((item, itemIdx) => {
                        let location = '-';
                        let variasi = 'Default';
                        let cleanName = item.nama_produk;
                        const parts = item.nama_produk.split('-');
                        if (parts.length > 1) {
                          variasi = parts[parts.length - 1].trim();
                          cleanName = parts.slice(0, parts.length - 1).join('-').trim();
                        }

                        if (item.fulfillment === 'Marketplace') {
                          const prod = productCatalog.find(p => p.k === item.sku);
                          if (prod && prod.lokasi) location = prod.lokasi;
                        } else {
                          location = item.fulfillment;
                        }

                        return (
                          <tr key={itemIdx} className="border-b border-slate-200 text-[11px]">
                            <td className="p-1.5 text-center text-slate-500">{itemIdx + 1}</td>
                            <td className="p-1.5 font-mono font-bold text-slate-900">{item.sku}</td>
                            <td className="p-1.5 font-semibold text-slate-800">{cleanName}</td>
                            <td className="p-1.5 text-center font-bold">{variasi}</td>
                            <td className="p-1.5 text-center font-extrabold text-indigo-600 text-xs">{item.qty}</td>
                            <td className="p-1.5 text-center font-bold bg-slate-50 text-emerald-700">{location}</td>
                            <td className="p-1.5 text-center">
                              <div className="w-3.5 h-3.5 border-2 border-slate-400 rounded-xs mx-auto" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <div className="flex justify-between items-end mt-6 pt-3 border-t border-dashed border-slate-300 text-[11px]">
                    <div className="text-slate-500">
                      Total Item: <b>{order.items?.length || 0} SKU</b> • Total Qty: <b>{totalQty} Pcs</b>
                    </div>
                    <div className="flex gap-10 text-center">
                      <div>
                        <div className="mb-9 text-slate-500">Petugas Picking</div>
                        <div className="font-bold border-t border-slate-400 pt-1 min-w-[90px]">
                          ({session?.name || getUserPersonName(session?.username) || 'Petugas'})
                        </div>
                      </div>
                      <div>
                        <div className="mb-9 text-slate-500">Checker / QC</div>
                        <div className="font-bold border-t border-slate-400 pt-1 min-w-[90px]">
                          (&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;)
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
