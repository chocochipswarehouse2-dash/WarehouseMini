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
      const reversed = [...data].reverse();
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
      id: `item-${Date.now()}`, nama_produk: '', sku: '', qty: 1, fulfillment: ''
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
    if (!finalTransCustomer || !finalTransCustomer.startsWith(expectedPrefix) || !isTransactionNumberUnique(finalTransCustomer, orders)) {
      finalTransCustomer = generateCustomerTransactionNumber(orders, pengirim);
      setTransCustomer(finalTransCustomer);
    }

    // 2. Ambil nilai jasa kirim
    const finalJasaKirim = (isCustomJasaKirim ? customJasaKirim : jasaKirim).trim();

    // 3. Cegah bentrokan ID pesanan internal dengan format ringkas yang rapi
    const uniquePesananId = generateShortOrderId(pengirim, orders);

    const orderData: ManualShipmentOrder = {
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
      status: 'diterima',
      no_resi: '',
      created_at: new Date().toISOString(),
      submitted_by: session?.username || 'Unknown'
    };

    const success = await submitManualShipment(orderData);
    if (success) {
      onShowToast('Pesanan berhasil disubmit', 'success');
      resetForm();
      loadOrders();
      setActiveTab('rekap');
    } else {
      onShowToast('Gagal submit pesanan', 'error');
    }
    setLoading(false);
  };

  const resetForm = () => {
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
        fulfillment: ''
      }];
    });
    onShowToast(`Berhasil menambahkan ${product.p || product.n || product.k}`, 'success');
  };

  const renderForm = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
          <Package className="w-6 h-6 mr-2 text-indigo-600" />
          Form Manual Shipment
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

          <div className="pt-6 border-t border-slate-200 flex justify-end">
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
              {loading ? 'Submitting...' : 'Submit Pesanan'}
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
            body { font-family: monospace; font-size: 12px; margin: 0; padding: 20px; color: #000; }
            h2 { margin: 0 0 10px 0; font-size: 16px; border-bottom: 1px dashed #000; padding-bottom: 5px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px dashed #000; padding: 5px; text-align: left; }
            .header-info { margin-bottom: 15px; }
            .barcode { font-size: 14px; font-weight: bold; }
            @media print {
              body { margin: 0; padding: 10px; }
              .page-break { page-break-after: always; }
              @page { size: portrait; margin: 5mm; }
            }
          </style>
        </head>
        <body>
          <h2>PICKING LIST - MANUAL SHIPMENT</h2>
          <div class="header-info">Dicetak: ${todayStr}<br/>Admin: ${session?.username}</div>
    `);

    itemsToPrint.forEach((order, index) => {
      printWin.document.write(`
        <div style="margin-bottom: 30px; ${index < itemsToPrint.length - 1 ? 'page-break-after: always;' : ''}">
          <div style="margin-bottom: 10px;">
            <strong>No Pesanan:</strong> ${order.no_pesanan} <br/>
            <strong>Order ID:</strong> ${order.no_transaksi_customer || '-'} <br/>
            <strong>Jasa Kirim:</strong> ${order.jasa_kirim || '-'} <br/>
            <strong>DealPOS:</strong> ${(order.no_transaksi_pengirim || []).join(', ') || '-'} <br/>
            <strong>Dari:</strong> ${order.nama_pengirim} <br/>
            <strong>Tujuan:</strong> ${order.nama_tujuan} <br/>
          </div>
          <table>
            <thead>
              <tr>
                <th>Produk & SKU</th>
                <th>Qty</th>
                <th>Fulfillment</th>
                <th>Lokasi (Marketplace Only)</th>
              </tr>
            </thead>
            <tbody>
      `);

      order.items.forEach(item => {
        // find location if marketplace
        let location = '-';
        if (item.fulfillment === 'Marketplace') {
          const prod = productCatalog.find(p => p.k === item.sku);
          if (prod && prod.lokasi) location = prod.lokasi;
        }

        printWin.document.write(`
          <tr>
            <td>${item.nama_produk}</td>
            <td>${item.qty}</td>
            <td>${item.fulfillment}</td>
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

    printWin.document.write('</body></html>');
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
      const subInfoText = subInfoParts.length > 0 ? subInfoParts.join(' | ') : 'WMS Manual Package';
      
      printWin.document.write(`
        <div class="page-break" style="width: 105mm; height: 148mm; padding: 3mm; box-sizing: border-box; background: #fff; position: relative; overflow: hidden; page-break-after: always; break-after: page;">
          <!-- Outline box A6 -->
          <div style="width: 100%; height: 100%; border: 2px solid #000; display: flex; flex-direction: column; position: relative; overflow: hidden; background: #fff; box-sizing: border-box;">
            
            <!-- 1. Header Label -->
            <div style="border-bottom: 2px solid #000; padding: 7px 10px; background-color: #f9fafb; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <div style="font-size: 14px; font-weight: 900; letter-spacing: 0.05em; text-transform: uppercase; line-height: 1;">PENGIRIMAN PAKET</div>
                <div style="font-size: 8.5px; font-weight: 700; color: #6b7280; margin-top: 2px;">WMS CHOCOCHIPS EXPRESS</div>
              </div>
              <div style="text-align: right;">
                <div style="font-size: 13px; font-weight: 900; text-transform: uppercase; line-height: 1;">${escapeHtml(order.jasa_kirim || 'MANUAL')}</div>
              </div>
            </div>

            <!-- 2. Penerima Box (Utama & Besar) -->
            <div style="padding: 10px 12px; border-bottom: 2px solid #000; background: #fff; flex: 1; display: flex; flex-direction: column; justify-content: center;">
              <div style="font-size: 8.5px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Kepada / Penerima:</div>
              <div style="font-size: 16px; font-weight: 900; text-transform: uppercase; line-height: 1.2; margin-bottom: 2px;">${escapeHtml(order.nama_tujuan || '-')}</div>
              ${order.no_telp_tujuan ? `<div style="font-size: 11.5px; font-weight: 800; font-family: monospace; color: #111827; margin-bottom: 3px;">${escapeHtml(order.no_telp_tujuan)}</div>` : ''}
              <div style="font-size: 11px; font-weight: 500; line-height: 1.35; color: #000; white-space: pre-wrap; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(order.alamat_tujuan || '-')}</div>
            </div>

            <!-- 3. Pengirim & Total Item -->
            <div style="display: flex; border-bottom: 2px solid #000;">
              <!-- Pengirim -->
              <div style="padding: 7px 10px; border-right: 2px solid #000; flex: 1;">
                <div style="font-size: 8px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Dari / Pengirim:</div>
                <div style="font-size: 11.5px; font-weight: 900; text-transform: uppercase;">${escapeHtml(order.nama_pengirim || 'CHOCOCHIPS')}</div>
                ${order.no_telp_store ? `<div style="font-size: 9.5px; font-weight: 700; font-family: monospace; color: #374151;">${escapeHtml(order.no_telp_store)}</div>` : ''}
              </div>
              <!-- Qty / Indikator -->
              <div style="padding: 7px 10px; width: 75px; display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: #f9fafb;">
                <span style="font-size: 8px; font-weight: 800; color: #6b7280; text-transform: uppercase;">TOTAL ITEM</span>
                <span style="font-size: 13px; font-weight: 900;">${totalQty} Pcs</span>
              </div>
            </div>

            <!-- 4. Isi Paket / Deskripsi -->
            <div style="padding: 7px 10px; font-size: 11px; background-color: #fff; height: 56px; overflow: hidden; border-bottom: 2px solid #000; box-sizing: border-box;">
              <div style="font-size: 8px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px;">Isi Paket:</div>
              <div style="font-size: 10px; font-weight: 600; line-height: 1.25; color: #111827; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; word-break: break-word;">
                ${escapeHtml(fullDesc)}
              </div>
            </div>

            <!-- 5. QR Code & No Pesanan Section (Sesuai Format Label A6) -->
            <div style="padding: 6px 10px; background-color: #f9fafb; display: flex; align-items: center; justify-content: space-between; gap: 8px; height: 82px; box-sizing: border-box;">
              <!-- Left: ID & Info -->
              <div style="flex: 1; min-width: 0; padding-right: 4px;">
                <div style="display: inline-block; padding: 2px 6px; background-color: #000; color: #fff; font-size: 7.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.05em; border-radius: 3px; margin-bottom: 2px;">
                  MANUAL SHIPMENT
                </div>
                <div style="font-size: 8.5px; font-weight: 800; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">No. Pesanan:</div>
                <div style="font-size: 12.5px; font-weight: 900; font-family: monospace; letter-spacing: -0.02em; color: #000; word-break: break-all;">
                  ${escapeHtml(order.no_pesanan || '')}
                </div>
                <div style="font-size: 8px; font-family: monospace; color: #4b5563; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                  ${escapeHtml(subInfoText)}
                </div>
              </div>

              <!-- Right: Crisp QR Code -->
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; background-color: #fff; padding: 3px; border: 2px solid #000; border-radius: 4px;">
                <img src="${qrDataUrl}" alt="QR Code" style="width: 54px; height: 54px; display: block; object-fit: contain;" />
                <span style="font-size: 6.5px; font-family: monospace; font-weight: 900; color: #000; text-transform: uppercase; letter-spacing: -0.05em; margin-top: 1px;">
                  SCAN QR PAKET
                </span>
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
    if (!searchTerm.trim()) return orders;
    const q = searchTerm.toLowerCase().trim();
    return orders.filter(o => 
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
  }, [orders, searchTerm]);

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

        <div className="flex items-center gap-2 flex-1 max-w-xs min-w-[200px]">
          <div className="relative w-full">
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
        </div>
        
        <div className="flex gap-2 flex-wrap">
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
        <table className="min-w-full divide-y divide-slate-200">
          <thead className="bg-slate-50 sticky top-0 z-10">
            <tr>
              {canAction && (
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider w-10">
                  <input
                    type="checkbox"
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    onChange={(e) => {
                      if (e.target.checked) setSelectedOrders(new Set(filteredOrders.map(o => o.no_pesanan)));
                      else setSelectedOrders(new Set());
                    }}
                    checked={filteredOrders.length > 0 && selectedOrders.size === filteredOrders.length}
                  />
                </th>
              )}
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">No Pesanan / Order ID</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Jasa Kirim</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Pengirim / Tujuan</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Item / Fulfillment</th>
              {canAction && (
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Aksi</th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={canAction ? 7 : 6} className="px-6 py-10 text-center text-slate-500">
                  {searchTerm ? 'Tidak ada pesanan yang cocok dengan pencarian' : 'Tidak ada data pesanan'}
                </td>
              </tr>
            ) : (
              filteredOrders.map((order) => (
                <tr key={order.no_pesanan} className="hover:bg-slate-50">
                  {canAction && (
                    <td className="px-4 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={selectedOrders.has(order.no_pesanan)}
                        onChange={() => toggleSelectOrder(order.no_pesanan)}
                      />
                    </td>
                  )}
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="font-medium text-slate-900">{order.no_pesanan}</div>
                    <div className="text-xs text-slate-500">{new Date(order.created_at || '').toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year:'numeric'})}</div>
                    {order.no_transaksi_customer && (
                      <div className="mt-1 text-xs font-mono bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 block font-semibold w-fit">
                        Order ID: {order.no_transaksi_customer}
                      </div>
                    )}
                    {order.no_transaksi_pengirim && order.no_transaksi_pengirim.length > 0 && (
                      <div className="mt-0.5 text-[11px] font-mono text-slate-600 block">
                        DealPOS: {order.no_transaksi_pengirim.join(', ')}
                      </div>
                    )}
                    {order.no_resi && (
                      <div className="mt-1 text-xs font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded inline-block">
                        Resi: {order.no_resi}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    {order.jasa_kirim ? (
                      <span className="px-2.5 py-1 inline-flex text-xs font-semibold rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">
                        {order.jasa_kirim}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-400 italic">-</span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="text-sm">
                      <span className="font-medium text-slate-800">{order.nama_pengirim}</span>
                      <span className="text-slate-500 mx-2">→</span>
                      <span className="font-medium text-slate-800">{order.nama_tujuan}</span>
                    </div>
                    <div className="text-xs text-slate-500 mt-1 truncate max-w-xs" title={order.alamat_tujuan}>
                      {order.alamat_tujuan}
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <span className={`px-2.5 py-1 inline-flex text-xs leading-5 font-semibold rounded-full 
                      ${order.status === 'diterima' ? 'bg-blue-100 text-blue-800' : 
                        order.status === 'diproses' ? 'bg-yellow-100 text-yellow-800' : 
                        order.status === 'dikirim' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}
                    >
                      {order.status.toUpperCase()}
                    </span>
                  </td>
                  <td className="px-4 py-4">
                    <ul className="text-sm text-slate-700 list-disc pl-4 space-y-1">
                      {order.items?.map((item, idx) => (
                        <li key={idx}>
                          {item.nama_produk} <span className="font-medium">x{item.qty}</span>
                          <span className="text-xs text-slate-500 ml-2">({item.fulfillment})</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                  {canAction && (
                    <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handlePrintLabel(order)}
                          className="text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 px-2 py-1 rounded text-xs flex items-center gap-1 font-semibold cursor-pointer shadow-xs"
                          title="Cetak Label A6 Pesanan Ini"
                        >
                          <Printer className="w-3.5 h-3.5 text-slate-600" />
                          Label A6
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUpdateResi(order.no_pesanan!)}
                          className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 hover:bg-indigo-100 px-2 py-1 rounded text-xs font-semibold cursor-pointer"
                        >
                          Input Resi
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(order.no_pesanan!)}
                          className="text-red-600 hover:text-red-900 bg-red-50 hover:bg-red-100 px-2 py-1 rounded cursor-pointer"
                          title="Hapus Pesanan"
                        >
                          <Trash2 className="w-4 h-4" />
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
          onClick={() => setActiveTab('form')}
        >
          Form Input
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
