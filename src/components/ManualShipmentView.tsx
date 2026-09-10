import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package, Search, Plus, Trash2, Send, RefreshCw, Printer, AlertTriangle, Check, CheckCircle2, FileText, ChevronDown, QrCode
} from 'lucide-react';
import { ProductItem, UserSession, ManualShipmentOrder, ManualShipmentItem } from '../types';
import { hasPermission, isSuperadmin } from '../services/permissions';
import {
  fetchOutlets,
  fetchManualShipments,
  submitManualShipment,
  updateShipmentStatus,
  updateShipmentResi,
  deleteManualShipment
} from '../services/gasManualShipment';
import QRCode from 'qrcode';

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
  const [orders, setOrders] = useState<ManualShipmentOrder[]>([]);

  // Form State
  const [pengirim, setPengirim] = useState('');
  const [telpPengirim, setTelpPengirim] = useState('');
  const [transPengirim, setTransPengirim] = useState('');
  
  const [tujuan, setTujuan] = useState('');
  const [telpTujuan, setTelpTujuan] = useState('');
  const [alamatTujuan, setAlamatTujuan] = useState('');
  const [notesPaket, setNotesPaket] = useState('');
  const [transCustomer, setTransCustomer] = useState('');
  
  const [items, setItems] = useState<ManualShipmentItem[]>([{
    id: 'item-1', nama_produk: '', sku: '', qty: 1, fulfillment: ''
  }]);

  // Autocomplete state
  const [activeComboIndex, setActiveComboIndex] = useState(-1);
  const [searchTerms, setSearchTerms] = useState<{ [id: string]: string }>({});

  useEffect(() => {
    loadOutlets();
    loadOrders();
  }, []);

  const loadOutlets = async () => {
    const data = await fetchOutlets();
    setOutlets(data);
  };

  const loadOrders = async () => {
    setLoading(true);
    const data = await fetchManualShipments();
    setOrders(data.reverse());
    setLoading(false);
  };

  const handleAddItem = () => {
    setItems(prev => [...prev, {
      id: `item-${Date.now()}`, nama_produk: '', sku: '', qty: 1, fulfillment: ''
    }]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length <= 1) return;
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
    if (!pengirim || !tujuan || items.some(i => !i.nama_produk || !i.fulfillment)) {
      onShowToast('Harap lengkapi form dan item pesanan', 'warning');
      return;
    }

    setLoading(true);
    const orderData: ManualShipmentOrder = {
      no_pesanan: `MS-${Date.now()}`,
      nama_pengirim: pengirim,
      no_telp_store: telpPengirim,
      no_transaksi_pengirim: transPengirim.split(',').map(s => s.trim()).filter(Boolean),
      nama_tujuan: tujuan,
      no_telp_tujuan: telpTujuan,
      alamat_tujuan: alamatTujuan,
      notes_paket: notesPaket,
      no_transaksi_customer: transCustomer,
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
    setTujuan('');
    setTelpTujuan('');
    setAlamatTujuan('');
    setNotesPaket('');
    setTransCustomer('');
    setItems([{ id: 'item-1', nama_produk: '', sku: '', qty: 1, fulfillment: '' }]);
    setSearchTerms({});
  };

  const renderForm = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
          <Package className="w-6 h-6 mr-2 text-indigo-600" />
          Form Manual Shipment
        </h2>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Data Pengirim */}
          <div>
            <h3 className="text-lg font-semibold text-slate-700 mb-4 border-b pb-2">Data Pengirim</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nama Pengirim (Store)</label>
                <select
                  value={pengirim}
                  onChange={(e) => setPengirim(e.target.value)}
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
                <label className="block text-sm font-medium text-slate-700 mb-1">No. Transaksi Pengirim (Bisa lebih dari 1, pisahkan koma)</label>
                <input
                  type="text"
                  value={transPengirim}
                  onChange={(e) => setTransPengirim(e.target.value)}
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
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">No. Transaksi Customer</label>
                <input
                  type="text"
                  value={transCustomer}
                  onChange={(e) => setTransCustomer(e.target.value)}
                  className="w-full rounded-lg border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                />
              </div>
              <div>
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
              <button
                type="button"
                onClick={handleAddItem}
                className="text-sm px-3 py-1 bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 flex items-center"
              >
                <Plus className="w-4 h-4 mr-1" />
                Tambah Produk
              </button>
            </h3>
            <div className="space-y-4">
              {items.map((item, index) => {
                const term = searchTerms[item.id] || '';
                
                let searchResults: ProductItem[] = [];
                if (term.length > 2 && activeComboIndex === index) {
                  const lower = term.toLowerCase().split(/\s+/).filter(Boolean);
                  searchResults = productCatalog.filter(p => {
                    const text = `${p.k} ${p.n} ${p.s}`.toLowerCase();
                    return lower.every(kw => text.includes(kw));
                  }).slice(0, 5);
                }

                return (
                  <div key={item.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200 relative">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                      {/* Product Name Autocomplete */}
                      <div className="md:col-span-5 relative">
                        <label className="block text-xs font-medium text-slate-500 mb-1">Nama Produk (SKU)</label>
                        <input
                          type="text"
                          value={item.nama_produk || searchTerms[item.id] || ''}
                          onChange={(e) => {
                            const val = e.target.value;
                            setSearchTerms(prev => ({ ...prev, [item.id]: val }));
                            handleItemChange(item.id, 'nama_produk', val);
                          }}
                          onFocus={() => setActiveComboIndex(index)}
                          onBlur={() => setTimeout(() => setActiveComboIndex(-1), 200)}
                          placeholder="Cari produk..."
                          className="w-full rounded-md border-slate-300 text-sm focus:ring-indigo-500 focus:border-indigo-500"
                          required
                        />
                        {searchResults.length > 0 && activeComboIndex === index && (
                          <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-auto">
                            {searchResults.map((res) => (
                              <div
                                key={res.k}
                                className="px-3 py-2 text-sm hover:bg-indigo-50 cursor-pointer border-b last:border-b-0 border-slate-100"
                                onMouseDown={() => {
                                  const fullName = `${res.n} - ${res.s} (${res.k})`;
                                  handleItemChange(item.id, 'nama_produk', fullName);
                                  handleItemChange(item.id, 'sku', res.k);
                                  setSearchTerms(prev => ({ ...prev, [item.id]: fullName }));
                                  setActiveComboIndex(-1);
                                }}
                              >
                                <div className="font-medium text-slate-800">{res.n}</div>
                                <div className="text-xs text-slate-500">Size: {res.s} | SKU: {res.k}</div>
                              </div>
                            ))}
                          </div>
                        )}
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
                          className={`p-2 rounded-md transition-colors ${items.length > 1 ? 'text-red-500 hover:bg-red-50' : 'text-slate-300 cursor-not-allowed'}`}
                          disabled={items.length <= 1}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
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

  const handlePrintLabel = async () => {
    if (selectedOrders.size === 0) return;
    const itemsToPrint = orders.filter(o => selectedOrders.has(o.no_pesanan));
    
    const printWin = window.open('', '_blank');
    if (!printWin) {
      onShowToast('Izinkan pop-ups untuk mencetak', 'error');
      return;
    }

    printWin.document.write(`
      <html>
        <head>
          <title>Cetak Label A6 - Manual Shipment</title>
          <style>
            @page { size: 100mm 150mm; margin: 0; }
            body { 
              font-family: Arial, sans-serif; 
              margin: 0; 
              padding: 0;
              width: 100mm;
              height: 150mm;
              color: #000;
              box-sizing: border-box;
            }
            .label-container {
              width: 100mm;
              height: 148mm;
              padding: 5mm;
              box-sizing: border-box;
              border: 1px solid #000;
              page-break-after: always;
              position: relative;
            }
            .header { text-align: center; font-weight: bold; font-size: 14px; border-bottom: 2px solid #000; padding-bottom: 5px; margin-bottom: 5px; }
            .section { border-bottom: 1px dashed #000; padding-bottom: 5px; margin-bottom: 5px; }
            .section-title { font-size: 10px; font-weight: bold; margin-bottom: 2px; text-transform: uppercase; }
            .text-sm { font-size: 11px; }
            .text-md { font-size: 13px; font-weight: bold; }
            .qr-code { position: absolute; right: 5mm; top: 15mm; width: 30mm; height: 30mm; }
            .items-list { font-size: 10px; }
          </style>
        </head>
        <body>
    `);

    for (const order of itemsToPrint) {
      const qrDataUrl = await QRCode.toDataURL(order.no_pesanan, { errorCorrectionLevel: 'M', margin: 1 });
      
      printWin.document.write(`
        <div class="label-container">
          <div class="header">MANUAL SHIPMENT</div>
          <img class="qr-code" src="${qrDataUrl}" />
          
          <div class="section">
            <div class="section-title">Penerima</div>
            <div class="text-md">${order.nama_tujuan}</div>
            <div class="text-sm">${order.no_telp_tujuan}</div>
            <div class="text-sm">${order.alamat_tujuan}</div>
          </div>
          
          <div class="section">
            <div class="section-title">Pengirim</div>
            <div class="text-sm">${order.nama_pengirim}</div>
            <div class="text-sm">${order.no_telp_store}</div>
          </div>
          
          <div class="section">
            <div class="section-title">Informasi Tambahan</div>
            <div class="text-sm">No Pesanan: ${order.no_pesanan}</div>
            <div class="text-sm">No Transaksi (P): ${(order.no_transaksi_pengirim || []).join(', ')}</div>
            <div class="text-sm">No Transaksi (C): ${order.no_transaksi_customer || '-'}</div>
            <div class="text-sm">Catatan: ${order.notes_paket || '-'}</div>
          </div>
          
          <div class="section" style="border-bottom: none;">
            <div class="section-title">Isi Paket</div>
            <ul class="items-list">
      `);
      
      order.items.forEach(item => {
        printWin.document.write(`<li>${item.qty}x ${item.nama_produk}</li>`);
      });
      
      printWin.document.write(`
            </ul>
          </div>
        </div>
      `);
    }

    printWin.document.write('</body></html>');
    printWin.document.close();
    printWin.focus();
    // Wait for images to load before printing
    setTimeout(() => {
      printWin.print();
    }, 1000);
    
    setSelectedOrders(new Set());
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

  const renderRekap = () => (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full min-h-[600px]">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 flex-wrap gap-2">
        <h2 className="text-lg font-bold text-slate-800 flex items-center">
          <FileText className="w-5 h-5 mr-2 text-indigo-600" />
          Rekap Manual Shipment
        </h2>
        
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
                onClick={handlePrintLabel}
                className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 text-sm font-medium flex items-center transition-colors"
              >
                <Printer className="w-4 h-4 mr-2" />
                Cetak Label ({selectedOrders.size})
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
                      if (e.target.checked) setSelectedOrders(new Set(orders.map(o => o.no_pesanan)));
                      else setSelectedOrders(new Set());
                    }}
                    checked={orders.length > 0 && selectedOrders.size === orders.length}
                  />
                </th>
              )}
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">No Pesanan</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Pengirim / Tujuan</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Status</th>
              <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">Item / Fulfillment</th>
              {canAction && (
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-slate-500 uppercase tracking-wider">Aksi</th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-200">
            {orders.length === 0 ? (
              <tr>
                <td colSpan={canAction ? 6 : 5} className="px-6 py-10 text-center text-slate-500">
                  Tidak ada data pesanan
                </td>
              </tr>
            ) : (
              orders.map((order) => (
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
                    {order.no_resi && (
                      <div className="mt-1 text-xs font-mono bg-slate-100 text-slate-700 px-2 py-1 rounded inline-block">
                        Resi: {order.no_resi}
                      </div>
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
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleUpdateResi(order.no_pesanan!)}
                          className="text-indigo-600 hover:text-indigo-900 bg-indigo-50 px-2 py-1 rounded"
                        >
                          Input Resi
                        </button>
                        <button
                          onClick={() => handleDelete(order.no_pesanan!)}
                          className="text-red-600 hover:text-red-900 bg-red-50 px-2 py-1 rounded"
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
