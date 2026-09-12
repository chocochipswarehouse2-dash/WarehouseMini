import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package, Search, Plus, Trash2, Send, RefreshCw, Printer, AlertTriangle, Check, CheckCircle2, FileText, ChevronDown, QrCode, ShoppingBag
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
  const [loading, setLoading] = useState(false);
  const [outlets, setOutlets] = useState<{ nama: string; fulfillment: string }[]>([]);
  const [jasaKirimList, setJasaKirimList] = useState<string[]>([]);
  const [orders, setOrders] = useState<ManualShipmentOrder[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');

  const [editingOrder, setEditingOrder] = useState<ManualShipmentOrder | null>(null);

  // Form State - langsung terisi Order ID Manual Shipment unik anti-collision
  const [pengirim, setPengirim] = useState('');
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
      no_telp_store: telpPengirim,
      no_transaksi_pengirim: transPengirim.split(',').map(s => s.trim()).filter(Boolean),
      nama_tujuan: tujuan,
      no_telp_tujuan: telpTujuan,
      alamat_tujuan: alamatTujuan,
      notes_paket: notesPaket,
      no_transaksi_customer: finalTransCustomer,
      jasa_kirim: finalJasaKirim,
      items: items,
      status: editingOrder ? editingOrder.status : 'diterima',
      no_resi: editingOrder ? (editingOrder.no_resi || '') : '',
      created_at: editingOrder ? editingOrder.created_at : new Date().toISOString(),
      submitted_by: editingOrder ? editingOrder.submitted_by : (session?.username || 'Unknown')
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
        return prev.map(i => i.sku.toUpperCase() === sku.toUpperCase() ? { ...i, qty: i.qty + 1 } : i);
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
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
          <Package className="w-6 h-6 mr-2 text-indigo-600" />
          {editingOrder ? 'Edit Manual Shipment' : 'Form Manual Shipment'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Order ID Manual Shipment & Pilihan Jasa Kirim (Paling Atas) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
            <div className="max-w-md">
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Order ID Manual Shipment
              </label>
              <input
                type="text"
                value={transCustomer}
                readOnly
                tabIndex={-1}
                placeholder="Pilih store pengirim..."
                className="w-full rounded-lg border-slate-300 bg-white text-slate-900 font-mono font-bold sm:text-base cursor-not-allowed select-all shadow-sm py-2 px-3 tracking-wide"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Nomor unik dibuat otomatis oleh sistem berdasarkan store yang dipilih
              </p>
            </div>

            {/* Pilihan Jasa Kirim (Dibawah Order ID Manual Shipment) */}
            <div className="max-w-md">
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-sm font-bold text-slate-700">
                  Pilihan Jasa Kirim <span className="text-xs font-normal text-slate-500">(Sheet outlet kolom C)</span>
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    await loadJasaKirim();
                    onShowToast('Daftar jasa kirim disinkronkan dari sheet outlet kolom C', 'info');
                  }}
                  disabled={loadingJasaKirim}
                  className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1 cursor-pointer disabled:opacity-50"
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
                  className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm bg-white"
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
                    className="w-full rounded-lg border-indigo-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm px-3 py-2 bg-indigo-50/40 text-slate-800"
                    autoFocus
                    required
                  />
                )}
              </div>
            </div>
          </div>

          {/* Data Pengirim */}
          <div>
            <h3 className="text-lg font-semibold text-slate-700 mb-4 border-b pb-2">Data Pengirim</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Pengirim (Store)</label>
                <select
                  value={pengirim}
                  onChange={(e) => {
                    const newStore = e.target.value;
                    setPengirim(newStore);
                    setTransCustomer(generateManualShipmentOrderId(orders, newStore));
                  }}
                  className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  required
                >
                  <option value="">Pilih Store...</option>
                  {outlets.map((o, idx) => (
                    <option key={idx} value={o.nama}>{o.nama}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">No. Telp Store</label>
                <input
                  type="text"
                  value={telpPengirim}
                  onChange={(e) => setTelpPengirim(e.target.value)}
                  className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">No. Transaksi DealPOS (Bisa lebih dari 1, pisahkan koma)</label>
                <input
                  type="text"
                  value={transPengirim}
                  onChange={(e) => setTransPengirim(e.target.value)}
                  placeholder="Contoh: POS-260901-001, POS-260901-002"
                  className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
              </div>
            </div>
          </div>

          {/* Data Customer */}
          <div>
            <h3 className="text-lg font-semibold text-slate-700 mb-4 border-b pb-2">Data Customer</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Tujuan</label>
                <input
                  type="text"
                  value={tujuan}
                  onChange={(e) => setTujuan(e.target.value)}
                  className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">No. Telp Tujuan</label>
                <input
                  type="text"
                  value={telpTujuan}
                  onChange={(e) => setTelpTujuan(e.target.value)}
                  className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Alamat Tujuan</label>
                <textarea
                  value={alamatTujuan}
                  onChange={(e) => setAlamatTujuan(e.target.value)}
                  className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                  rows={3}
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes Tambahan Paket</label>
                <input
                  type="text"
                  value={notesPaket}
                  onChange={(e) => setNotesPaket(e.target.value)}
                  className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
              </div>
            </div>
          </div>

          {/* Pesanan */}
          <div>
            <h3 className="text-lg font-semibold text-slate-700 mb-4 border-b pb-2 flex justify-between items-center">
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
                <div className="text-center py-12 text-slate-400">
                  <ShoppingBag className="w-16 h-16 mx-auto mb-4 text-slate-300" />
                  <div className="font-medium text-slate-500 mb-1">Empty Cart</div>
                  <div className="text-sm">Add products to the cart<br/>or scan barcode</div>
                </div>
              )}
              {items.map((item) => (
                  <div key={item.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200 relative">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      {/* Product Name */}
                      <div className="md:col-span-5 flex flex-col justify-center">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Nama Produk</label>
                        <div className="font-medium text-slate-800 text-sm">
                          {item.nama_produk}
                        </div>
                        <div className="text-xs text-slate-500 font-mono mt-0.5">
                          SKU: {item.sku}
                        </div>
                      </div>

                      {/* QTY */}
                      <div className="md:col-span-2">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Qty</label>
                        <input
                          type="number"
                          min="1"
                          value={item.qty}
                          onChange={(e) => handleItemChange(item.id, 'qty', parseInt(e.target.value) || 1)}
                          className="w-full rounded-md border-slate-300 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                          required
                        />
                      </div>

                      {/* Fulfillment */}
                      <div className="md:col-span-4">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Fulfillment</label>
                        <select
                          value={item.fulfillment}
                          onChange={(e) => handleItemChange(item.id, 'fulfillment', e.target.value)}
                          className="w-full rounded-md border-slate-300 text-sm focus:ring-indigo-500 focus:border-indigo-500"
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
                      <div className="md:col-span-1 flex items-end justify-center pb-1">
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(item.id)}
                          className="p-2 rounded-md transition-colors text-red-500 hover:bg-red-50"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          <div className="pt-6 border-t border-slate-200 flex justify-end gap-3">
            {editingOrder && (
              <button
                type="button"
                onClick={resetForm}
                className="px-6 py-2.5 rounded-lg text-slate-700 font-medium bg-slate-100 hover:bg-slate-200"
              >
                Batal Edit
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className={`px-6 py-2.5 rounded-lg text-white font-medium flex items-center shadow-sm ${
                loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700'
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
    if (selectedOrders.size === 0) return;
    const itemsToPrint = orders.filter(o => selectedOrders.has(o.no_pesanan));
    
    // Update status to diproses
    setLoading(true);
    for (const id of selectedOrders) {
      await updateShipmentStatus(id, 'diproses');
    }
    loadOrders();
    setLoading(false);

    // Build print HTML for Picking List
    const printWin = window.open('', '_blank');
    if (!printWin) {
      onShowToast('Izinkan pop-ups untuk mencetak', 'error');
      return;
    }

    const todayStr = new Date().toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    printWin.document.write(`
      <html>
        <head>
          <title>Picking List - Manual Shipment</title>
          <style>
            body { font-family: 'Courier New', Courier, monospace; font-size: 11px; margin: 0; padding: 15px; color: #000; }
            h2 { margin: 0 0 10px 0; font-size: 14px; font-weight: bold; border-bottom: 1px dashed #000; padding-bottom: 5px; text-transform: uppercase; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 25px; table-layout: fixed; }
            th, td { border: none; border-bottom: 1px solid #ccc; padding: 6px 4px; text-align: left; vertical-align: top; word-wrap: break-word; }
            th { border-bottom: 2px solid #000; font-weight: bold; }
            .header-info { margin-bottom: 20px; font-size: 10px; color: #333; }
            .order-header { margin-bottom: 8px; line-height: 1.4; font-size: 11px; }
            .order-header strong { display: inline-block; width: 90px; }
            .item-name { font-weight: 500; margin-bottom: 2px; }
            .item-sku { color: #555; font-size: 10px; }
            .text-center { text-align: center; }
            .page-container { max-width: 800px; margin: 0 auto; }
            
            @media print {
              body { margin: 0; padding: 5mm; }
              @page { size: portrait; margin: 5mm; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="page-container">
            <h2>PICKING LIST - MANUAL SHIPMENT</h2>
            <div class="header-info">Dicetak: ${todayStr}<br/>Admin: ${session?.username || 'admin'}</div>
    `);

    itemsToPrint.forEach((order) => {
      printWin.document.write(`
        <div>
          <div class="order-header">
            <strong>No Pesanan:</strong> ${order.no_pesanan} <br/>
            <strong>Order ID:</strong> ${order.no_transaksi_customer || '-'} <br/>
            <strong>Jasa Kirim:</strong> ${order.jasa_kirim || '-'} <br/>
            <strong>DealPOS:</strong> ${(order.no_transaksi_pengirim || []).join(', ') || '-'} <br/>
            <strong>Dari:</strong> ${order.nama_pengirim} <br/>
            <strong>Tujuan:</strong> ${order.nama_tujuan}
          </div>
          <table>
            <thead>
              <tr>
                <th style="width: 5%" class="text-center">#</th>
                <th style="width: 35%">Nama Produk</th>
                <th style="width: 25%">SKU</th>
                <th style="width: 15%">Variasi</th>
                <th style="width: 8%" class="text-center">Qty</th>
                <th style="width: 12%">Lokasi</th>
              </tr>
            </thead>
            <tbody>
      `);

      order.items.forEach((item, itemIdx) => {
        // find location and details
        let location = '-';
        let variasi = 'Default';
        
        // Clean up item name (remove variasi from the end if it exists)
        let cleanName = item.nama_produk;
        const parts = item.nama_produk.split('-');
        if (parts.length > 1) {
          variasi = parts[parts.length - 1].trim();
          // Assume the rest is the product name
          cleanName = parts.slice(0, parts.length - 1).join('-').trim();
        }

        if (item.fulfillment === 'Marketplace') {
          const prod = productCatalog.find(p => p.k === item.sku);
          if (prod && prod.lokasi) location = prod.lokasi;
        }

        printWin.document.write(`
          <tr>
            <td class="text-center">${itemIdx + 1}</td>
            <td><div class="item-name">${cleanName}</div></td>
            <td><div class="item-sku">${item.sku}</div></td>
            <td>${variasi}</td>
            <td class="text-center"><strong>${item.qty}</strong></td>
            <td>${location}</td>
          </tr>
        `);
      });

      printWin.document.write(`
            </tbody>
          </table>
        </div>
      `);
    });

    printWin.document.write('</div></body></html>');
    printWin.document.close();
    printWin.focus();
    setTimeout(() => {
      printWin.print();
    }, 500);
    
    setSelectedOrders(new Set());
    onShowToast(`Berhasil mencetak ${itemsToPrint.length} picking list`, 'success');
  };

  const escapeHtml = (unsafe: string = '') => {
    return String(unsafe || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  const handlePrintLabel = async (singleOrder?: ManualShipmentOrder) => {
    const itemsToPrint = singleOrder
      ? [singleOrder]
      : orders.filter(o => o.no_pesanan && selectedOrders.has(o.no_pesanan));

    if (itemsToPrint.length === 0) {
      onShowToast('Pilih setidaknya satu pesanan untuk dicetak labelnya', 'info');
      return;
    }
    
    const printWin = window.open('', '_blank');
    if (!printWin) {
      onShowToast('Izinkan pop-ups browser untuk mencetak label', 'error');
      return;
    }

    printWin.document.write(`<!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Cetak Label A6 - Manual Shipment</title>
          <style>
            @page { 
              size: 105mm 148mm; 
              margin: 0; 
            }
            * {
              box-sizing: border-box;
            }
            body { 
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; 
              margin: 0; 
              padding: 0;
              width: 105mm;
              color: #000;
              background-color: #fff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            @media print {
              html, body {
                width: 105mm !important;
                height: 148mm !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .page-break {
                page-break-after: always;
                break-after: page;
              }
            }
          </style>
        </head>
        <body>
    `);

    for (const order of itemsToPrint) {
      const qrDataUrl = await QRCode.toDataURL(order.no_pesanan || 'UNKNOWN', { 
        errorCorrectionLevel: 'M', 
        margin: 1,
        width: 180 
      });

      const totalQty = (order.items || []).reduce((acc, it) => acc + (Number(it.qty) || 0), 0) || 1;
      
      const itemsListStr = (order.items && order.items.length > 0)
        ? order.items.map(it => `${it.qty}x ${it.nama_produk}`).join(', ')
        : (order.notes_paket || '-');

      const fullDesc = order.notes_paket && order.items && order.items.length > 0
        ? `${itemsListStr} (Catatan: ${order.notes_paket})`
        : itemsListStr;

      const subInfoParts: string[] = [];
      if (order.no_transaksi_customer) {
        subInfoParts.push(`Order ID: ${order.no_transaksi_customer}`);
      } else if (order.jasa_kirim) {
        subInfoParts.push(`Jasa Kirim: ${order.jasa_kirim}`);
      }
      if (order.no_transaksi_pengirim && order.no_transaksi_pengirim.length > 0) {
        subInfoParts.push(`DealPOS: ${order.no_transaksi_pengirim.join(', ')}`);
      }
      
      let itemsTableHtml = '';
      if (order.items && order.items.length > 0) {
        order.items.forEach((it, idx) => {
          let cleanName = escapeHtml(it.nama_produk);
          let size = '';
          const parts = it.nama_produk.split('-');
          if (parts.length > 1) {
            size = escapeHtml(parts[parts.length - 1].trim());
            cleanName = escapeHtml(parts.slice(0, parts.length - 1).join('-').trim());
          }
          itemsTableHtml += `
            <tr>
              <td style="border-bottom: 1px dashed #111; padding: 4px 2px; vertical-align: top;">${idx + 1}.</td>
              <td style="border-bottom: 1px dashed #111; padding: 4px 2px; vertical-align: top;">${cleanName}</td>
              <td style="border-bottom: 1px dashed #111; padding: 4px 2px; vertical-align: top;">${size}</td>
              <td style="border-bottom: 1px dashed #111; padding: 4px 2px; vertical-align: top;">${escapeHtml(it.sku || '')}</td>
              <td style="border-bottom: 1px dashed #111; padding: 4px 2px; vertical-align: top; text-align: center;">${it.qty || 1}</td>
            </tr>
          `;
        });
      } else {
        itemsTableHtml = `
          <tr>
            <td colspan="5" style="border-bottom: 1px dashed #111; padding: 8px 2px; text-align: center;">Tidak ada detail produk</td>
          </tr>
        `;
      }
      
      printWin.document.write(`
        <div class="page-break" style="width: 105mm; min-height: 148mm; height: auto; padding: 2mm; box-sizing: border-box; background: #fff; position: relative; page-break-after: always; break-after: page;">
          
          <div style="width: 100%; height: 100%; min-height: calc(148mm - 4mm); border: 3px solid #111; display: flex; flex-direction: column; background: #fff; box-sizing: border-box;">
            
            <!-- 1. Header -->
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 2px solid #111;">
               <div style="font-size: 28px; font-weight: normal; font-family: 'Brush Script MT', 'Lucida Handwriting', cursive; letter-spacing: -1px; line-height: 1; color: #444;">
                 chocochips
               </div>
               <div style="font-size: 14px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; text-align: right; line-height: 1.2; color: #000;">
                 ${escapeHtml(order.jasa_kirim || 'PENGIRIMAN PAKET')}
               </div>
            </div>

            <!-- 2. Order ID Box -->
            <div style="text-align: center; border-bottom: 2px solid #111; padding: 6px; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; background: #fff;">
               ORDER ID: ${escapeHtml(order.no_pesanan || '')}
            </div>

            <!-- 3. Address Block (Left/Right) -->
            <div style="display: flex; border-bottom: 2px solid #111; background: #fff;">
              <!-- Left: Penerima -->
              <div style="flex: 1; padding: 12px; border-right: 2px solid #111;">
                 <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; margin-bottom: 4px;">PENERIMA: <span style="font-size: 13px;">${escapeHtml(order.nama_tujuan || '-')}</span></div>
                 ${order.no_telp_tujuan ? `<div style="font-size: 12px; font-weight: 900; margin-bottom: 4px;">${escapeHtml(order.no_telp_tujuan)}</div>` : ''}
                 <div style="font-size: 11px; font-weight: 700; line-height: 1.35;">${escapeHtml(order.alamat_tujuan || '-')}</div>
                 
                 <div style="margin-top: 12px; font-size: 10px; font-weight: 900; text-transform: uppercase;">NOTE:</div>
                 <div style="font-size: 11px; font-weight: 700;">${escapeHtml(order.notes_paket || '-')}</div>
              </div>
              <!-- Right: Pengirim -->
              <div style="width: 145px; display: flex; flex-direction: column;">
                 <div style="padding: 12px; flex: 1;">
                    <div style="font-size: 11px; font-weight: 900; text-transform: uppercase; margin-bottom: 4px;">PENGIRIM:</div>
                    <div style="font-size: 12px; font-weight: 900; text-transform: uppercase; margin-bottom: 4px;">${escapeHtml(order.nama_pengirim || 'CHOCOCHIPS')}</div>
                    ${order.no_telp_store ? `<div style="font-size: 11px; font-weight: 900; margin-bottom: 4px;">${escapeHtml(order.no_telp_store)}</div>` : ''}
                 </div>
              </div>
            </div>

            <!-- 4. Warning Box -->
            <div style="padding: 8px 10px; border-bottom: 2px solid #111; font-size: 10px; font-weight: 900; text-align: center; text-transform: uppercase; background: #f3f4f6;">
               ⚠️ PERHATIAN: JANGAN DITERIMA JIKA KONDISI PAKET RUSAK ATAU SEGEL TERBUKA &bull; WAJIB VIDEO UNBOXING
            </div>

            <!-- 5. Table Box & QR Code -->
            <div style="display: flex; flex: 1; background: #fff;">
               <!-- Left Table -->
               <div style="flex: 1; padding: 12px; border-right: 2px solid #111;">
                 <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead>
                      <tr>
                        <th style="border-bottom: 1px dashed #111; text-align: left; padding: 4px 2px; width: 6%; font-weight: normal;">No.</th>
                        <th style="border-bottom: 1px dashed #111; text-align: left; padding: 4px 2px; width: 48%; font-weight: normal;">Nama Produk</th>
                        <th style="border-bottom: 1px dashed #111; text-align: left; padding: 4px 2px; width: 14%; font-weight: normal;">Size</th>
                        <th style="border-bottom: 1px dashed #111; text-align: left; padding: 4px 2px; width: 22%; font-weight: normal;">SKU</th>
                        <th style="border-bottom: 1px dashed #111; text-align: center; padding: 4px 2px; width: 10%; font-weight: normal;">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${itemsTableHtml}
                      <tr>
                        <td colspan="4" style="text-align: right; padding: 8px 12px 8px 0; font-weight: normal;">TOTAL</td>
                        <td style="text-align: center; padding: 8px 2px; font-weight: normal;">${totalQty}</td>
                      </tr>
                    </tbody>
                 </table>
               </div>
               
               <!-- Right QR -->
               <div style="width: 110px; padding: 12px 8px; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; background: #fff;">
                 <img src="${qrDataUrl}" style="width: 80px; height: 80px; object-fit: contain; margin-bottom: 8px;" alt="QR Code" />
                 <div style="font-size: 9px; font-weight: bold; text-align: center; word-break: break-all; margin-bottom: 4px;">${escapeHtml(order.no_pesanan || '')}</div>
                 <div style="font-size: 9px; text-align: center; word-break: break-all; color: #555;">${escapeHtml(order.no_transaksi_customer || '')}</div>
               </div>
            </div>

          </div>
        </div>
      `);
    }

    printWin.document.write('</body></html>');
    printWin.document.close();
    printWin.focus();
    // Wait for images and layout to settle before printing
    setTimeout(() => {
      printWin.print();
    }, 600);
    
    if (!singleOrder) {
      setSelectedOrders(new Set());
    }
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
  }, [orders, searchTerm, filterStatus, filterStartDate, filterEndDate]);

  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      onShowToast('Tidak ada data untuk diexport', 'warning');
      return;
    }
    
    const headers = ['Order ID', 'Tanggal', 'Pengirim', 'No Telp Pengirim', 'Tujuan', 'No Telp Tujuan', 'Alamat Tujuan', 'Jasa Kirim', 'Resi', 'Status', 'Items'];
    
    const rows = filteredOrders.map(o => {
      const itemsStr = o.items ? o.items.map(i => `${i.nama_produk} (x${i.qty})`).join('; ') : '';
      return [
        o.no_pesanan,
        new Date(o.created_at || '').toLocaleDateString('en-US'),
        o.nama_pengirim,
        o.no_telp_store || '',
        o.nama_tujuan,
        o.no_telp_tujuan,
        `"${(o.alamat_tujuan || '').replace(/"/g, '""')}"`,
        o.jasa_kirim,
        o.no_resi || '',
        o.status,
        `"${itemsStr.replace(/"/g, '""')}"`
      ].join(',');
    });
    
    const csvContent = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `manual_shipment_export_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderRekap = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[600px]">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 flex-wrap gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-slate-800 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-indigo-600" />
            Rekap Manual Shipment
          </h2>
          <span className="text-xs font-medium text-slate-500 bg-slate-200/70 px-2 py-0.5 rounded-full">
            {filteredOrders.length} Order
          </span>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative w-full max-w-xs min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Cari Order ID, DealPOS, Jasa Kirim, resi..."
                className="w-full pl-8 pr-7 py-1.5 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  ✕
                </button>
              )}
            </div>
            
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="py-1.5 px-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="all">Semua Status</option>
              <option value="pending">Pending</option>
              <option value="diterima">Diterima</option>
              <option value="diproses">Diproses</option>
              <option value="dikirim">Dikirim</option>
              <option value="batal">Batal</option>
            </select>
            
            <div className="flex items-center gap-1">
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="py-1.5 px-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-500">-</span>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="py-1.5 px-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
        
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleExportCSV}
            className="p-2 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors"
            title="Export CSV"
          >
            <span className="text-[11px] font-semibold flex items-center gap-1"><FileText className="w-4 h-4" /> Export</span>
          </button>
          <button
            onClick={loadOrders}
            className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          
          {canAction && selectedOrders.size > 0 && (
            <>
              <button
                onClick={handlePrintPickingList}
                className="px-4 py-2 bg-indigo-100 text-indigo-700 rounded-md hover:bg-indigo-200 text-sm font-medium flex items-center transition-colors"
              >
                <FileText className="w-4 h-4 mr-2" />
                Cetak Picking ({selectedOrders.size})
              </button>
              <button
                onClick={() => handlePrintLabel()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium flex items-center transition-colors cursor-pointer shadow-xs"
                title="Cetak Label Paket A6 untuk pesanan yang dipilih"
              >
                <Printer className="w-4 h-4 mr-2" />
                Cetak Label A6 ({selectedOrders.size})
              </button>
            </>
          )}
        </div>
      </div>
      
      <div className="flex-1 overflow-auto">
        <table className="min-w-full">
          <thead className="bg-white sticky top-0 z-10 border-b border-slate-200">
            <tr>
              {canAction && (
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 capitalize tracking-normal w-10">
                  <input
                    type="checkbox"
                    className="rounded-sm border-slate-300 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer"
                    onChange={(e) => {
                      if (e.target.checked) setSelectedOrders(new Set(filteredOrders.map(o => o.no_pesanan)));
                      else setSelectedOrders(new Set());
                    }}
                    checked={filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length}
                  />
                </th>
              )}
              <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 capitalize tracking-normal">Order</th>
              <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 capitalize tracking-normal">Date</th>
              <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 capitalize tracking-normal">Customer</th>
              <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 capitalize tracking-normal">Shipping Method</th>
              <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 capitalize tracking-normal">Status</th>
              <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 capitalize tracking-normal">Items</th>
              {canAction && (
                <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-slate-700 capitalize tracking-normal">Aksi</th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={canAction ? 8 : 7} className="px-3 py-8 text-center text-[11px] text-slate-500">
                  {searchTerm ? 'Tidak ada pesanan yang cocok dengan pencarian' : 'Tidak ada data pesanan'}
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr key={order.no_pesanan} className="hover:bg-slate-50 border-b border-slate-100/80 last:border-b-0">
                  {canAction && (
                    <td className="px-3 py-2.5 whitespace-nowrap align-top">
                      <input
                        type="checkbox"
                        className="rounded-sm border-slate-300 text-blue-500 focus:ring-blue-500 w-3.5 h-3.5 cursor-pointer mt-0.5"
                        checked={selectedOrders.has(order.no_pesanan)}
                        onChange={() => toggleSelectOrder(order.no_pesanan)}
                      />
                    </td>
                  )}
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <div className="text-[11px] font-medium text-[#00a8e8] hover:underline cursor-pointer">{order.no_pesanan}</div>
                    {order.no_transaksi_customer && (
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        ID: {order.no_transaksi_customer}
                      </div>
                    )}
                    {order.no_transaksi_pengirim && order.no_transaksi_pengirim.length > 0 && (
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        DPOS: {order.no_transaksi_pengirim.join(', ')}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      {new Date(order.created_at || '').toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="text-[11px] text-[#00a8e8] hover:underline cursor-pointer inline-flex">{order.nama_tujuan}</div>
                    <div className="text-[10px] text-slate-500 truncate max-w-[160px] mt-0.5" title={order.alamat_tujuan}>
                      {order.alamat_tujuan}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <div className="text-[11px] text-slate-600 mt-0.5">{order.jasa_kirim || '-'}</div>
                    {order.no_resi && (
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        {order.no_resi}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    <span className={`mt-0.5 px-1.5 py-0.5 inline-block text-[10px] font-semibold rounded-sm border ${
                      order.status === 'diterima' ? 'border-slate-300 text-slate-600 bg-white' : 
                      order.status === 'diproses' ? 'border-yellow-400 text-yellow-600 bg-white' : 
                      order.status === 'dikirim' ? 'border-emerald-400 text-emerald-600 bg-white' : 
                      order.status === 'batal' ? 'border-red-400 text-red-500 bg-white' : 
                      'border-slate-300 text-slate-600 bg-white'
                    }`}>
                      {order.status.charAt(0).toUpperCase() + order.status.slice(1).toLowerCase()}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="text-[10px] text-slate-600 leading-tight space-y-0.5">
                      {order.items?.map((item, idx) => (
                        <div key={idx} className="truncate max-w-[180px]" title={item.nama_produk}>
                          <span className="text-[#00a8e8]">{item.nama_produk}</span> <span className="font-semibold text-slate-700">x{item.qty}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  {canAction && (
                    <td className="px-3 py-2.5 whitespace-nowrap text-right align-top">
                      <div className="flex justify-end gap-1.5 mt-0.5">
                        <button
                          type="button"
                          onClick={() => handlePrintLabel(order)}
                          className="text-[10px] text-slate-600 border border-slate-300 bg-white px-2 py-0.5 rounded-sm hover:bg-slate-50 transition-colors shadow-xs"
                          title="Cetak Label A6 Pesanan Ini"
                        >
                          Print
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEdit(order)}
                          className="text-[10px] text-blue-600 border border-blue-200 bg-white px-2 py-0.5 rounded-sm hover:bg-blue-50 transition-colors shadow-xs"
                          title="Edit Pesanan"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateResi(order.no_pesanan!)}
                          className="text-[10px] text-slate-600 border border-slate-300 bg-white px-2 py-0.5 rounded-sm hover:bg-slate-50 transition-colors shadow-xs"
                        >
                          Resi
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(order.no_pesanan!)}
                          className="text-[10px] text-red-500 border border-red-200 bg-white px-2 py-0.5 rounded-sm hover:bg-red-50 transition-colors shadow-xs"
                          title="Hapus Pesanan"
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 animate-in fade-in duration-300">
      {/* Mobile Tab Navigation */}
      <div className="flex md:hidden mb-4 bg-slate-100 p-1 rounded-lg">
        <button
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'form' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
          }`}
          onClick={() => {
            if (editingOrder) resetForm();
            setActiveTab('form');
          }}
        >
          {editingOrder ? 'Edit Pesanan' : 'Form Input'}
        </button>
        <button
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            activeTab === 'rekap' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'
          }`}
          onClick={() => {
            setActiveTab('rekap');
            loadOrders();
          }}
        >
          Rekap
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
        <div className={`xl:col-span-5 ${activeTab !== 'form' ? 'hidden md:block' : ''}`}>
          {renderForm()}
        </div>
        
        <div className={`xl:col-span-7 ${activeTab !== 'rekap' ? 'hidden md:block' : ''}`}>
          {renderRekap()}
        </div>
      </div>
    </div>
  );
};
