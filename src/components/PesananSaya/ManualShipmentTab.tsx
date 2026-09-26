import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Package, Search, Plus, Trash2, Send, RefreshCw, Printer, AlertTriangle, Check, CheckCircle2, FileText, ChevronDown, QrCode, ShoppingBag, X, MapPin, Truck, History, Calendar, User, ArrowLeft, Copy, Clock, MessageCircle, ExternalLink, Store
} from 'lucide-react';
import { ProductItem, UserSession, ManualShipmentOrder, ManualShipmentItem } from '../../types';
import { hasPermission, isSuperadmin } from '../../services/permissions';
import { PhysicalScanInput } from '../PhysicalScanInput';
import {
  fetchOutlets,
  fetchManualShipments,
  submitManualShipment,
  updateShipmentStatus,
  updateShipmentResi,
  deleteManualShipment,
  fetchJasaKirimList,
  editManualShipment,
} from '../../services/gasManualShipment';
import { clearDeltaSyncCache } from '../../services/gasSync';
import { sendFonnteMessage } from '../../services/whatsapp';
import { supabaseFetch } from '../../services/supabase';
import QRCode from 'qrcode';
import {
  generateCustomerTransactionNumber,
  generateManualShipmentOrderId,
  isTransactionNumberUnique,
  getStoreCode,
  generateShortOrderId,
} from '../../utils/transactionGenerator';
import { getUserPersonName, formatOperatorWithPersonName } from '../../utils/userResolver';

interface ManualShipmentViewProps {
  session: UserSession | null;
  productCatalog: ProductItem[];
  onShowToast: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const ManualShipmentTab: React.FC<ManualShipmentViewProps> = ({
  session,
  productCatalog,
  onShowToast,
}) => {
  const userIsAdmin = isSuperadmin(session);
  const canAction = userIsAdmin || hasPermission(session, 'tab_ops_pesanan_manual_shipment');

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

  // Modal WhatsApp Template untuk PIC Store kirim ke Customer
  const [waModalOrder, setWaModalOrder] = useState<ManualShipmentOrder | null>(null);
  const [copiedResi, setCopiedResi] = useState<string | null>(null);
  const [copiedUpdateMsg, setCopiedUpdateMsg] = useState<boolean>(false);

  // Modal Konfirmasi & Salin Pesan Pembaruan (Diff Log)
  const [updateSuccessModal, setUpdateSuccessModal] = useState<{
    order: ManualShipmentOrder;
    message: string;
    changes: string[];
  } | null>(null);

  // Helper Clipboard dengan fallback aman
  const copyToClipboard = async (text: string, successMsg: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        onShowToast(successMsg, 'success');
        return true;
      }
    } catch (err) {
      console.warn('Clipboard writeText failed, fallback to textarea:', err);
    }

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (successful) {
        onShowToast(successMsg, 'success');
        return true;
      }
    } catch (e) {
      console.warn('Fallback copy failed:', e);
    }
    onShowToast('Gagal menyalin teks.', 'error');
    return false;
  };

  const getCleanCustomerPhone = (phone?: string): string => {
    if (!phone) return '';
    let clean = phone.replace(/[^0-9]/g, '');
    if (clean.startsWith('0')) {
      clean = '62' + clean.slice(1);
    } else if (clean.startsWith('8')) {
      clean = '62' + clean;
    }
    return clean;
  };

  const generateCustomerWaTemplate = (order: ManualShipmentOrder): string => {
    const storeName = order.nama_pengirim || 'Toko Kami';
    const customerName = order.nama_tujuan || 'Kakak';
    const jasaKirim = order.jasa_kirim || 'Ekspedisi';
    const noResi = order.no_resi || '(Sedang diproses / Menunggu Resi)';
    const dealposArr = Array.isArray(order.no_transaksi_pengirim)
      ? order.no_transaksi_pengirim.filter(Boolean)
      : (order.no_transaksi_pengirim ? [order.no_transaksi_pengirim] : []);
    const noTrans = dealposArr.length > 0
      ? dealposArr.join(', ')
      : (order.no_transaksi_customer || order.no_pesanan || '-');

    let itemsList = '';
    if (order.items && order.items.length > 0) {
      itemsList = order.items.map((it, idx) => {
        const sizeStr = it.size && it.size !== 'ALL' && it.size !== '-' ? ` (${it.size})` : '';
        return `  ${idx + 1}. *${it.nama_produk}*${sizeStr} - ${it.qty || 1} pcs`;
      }).join('\n');
    }

    return `Halo Kak *${customerName}*! 👋
Terima kasih telah berbelanja di *${storeName}*.

Pesanan Kakak telah dikemas dan dikirimkan dengan rincian berikut:
📦 *No. Transaksi:* ${noTrans}
🚚 *Ekspedisi:* ${jasaKirim}
🔖 *No. Resi:* *${noResi}*
📍 *Alamat Pengiriman:* ${order.alamat_tujuan || '-'}
${itemsList ? `\n📋 *Daftar Produk:*\n${itemsList}\n` : ''}${order.notes_paket ? `\n📝 *Catatan Paket:* ${order.notes_paket}\n` : ''}
Kakak dapat memantau status pengiriman paket melalui website resmi atau aplikasi *${jasaKirim}* menggunakan No. Resi di atas.

Terima kasih banyak atas kepercayaannya! Semoga paket lekas sampai dan bermanfaat ya Kak. ✨🙏`;
  };

  /**
   * Helper Cerdas: Deteksi seluruh poin perubahan data (Diff Summary)
   * Mendeteksi: Ganti produk, ganti qty, ganti fulfilment, ganti alamat, ekspedisi, dll.
   */
  const generateOrderUpdateDiff = (oldOrder: ManualShipmentOrder, newOrder: ManualShipmentOrder): string[] => {
    const changes: string[] = [];

    // 1. Data Penerima & Alamat
    if ((oldOrder.alamat_tujuan || '').trim() !== (newOrder.alamat_tujuan || '').trim()) {
      changes.push(`📍 *Alamat Pengiriman Diubah:*
    • Semula: ${oldOrder.alamat_tujuan || '(Kosong)'}
    • Menjadi: *${newOrder.alamat_tujuan || '(Kosong)'}*`);
    }

    if ((oldOrder.nama_tujuan || '').trim() !== (newOrder.nama_tujuan || '').trim()) {
      changes.push(`👤 *Nama Penerima:* ${oldOrder.nama_tujuan || '-'} ➡️ *${newOrder.nama_tujuan || '-'}*`);
    }

    if ((oldOrder.no_telp_tujuan || '').trim() !== (newOrder.no_telp_tujuan || '').trim()) {
      changes.push(`📱 *No. Telp Penerima:* ${oldOrder.no_telp_tujuan || '-'} ➡️ *${newOrder.no_telp_tujuan || '-'}*`);
    }

    // 2. Ekspedisi / Jasa Kirim & DealPOS
    if ((oldOrder.jasa_kirim || '').trim() !== (newOrder.jasa_kirim || '').trim()) {
      changes.push(`🚚 *Jasa Kirim / Ekspedisi:* ${oldOrder.jasa_kirim || '-'} ➡️ *${newOrder.jasa_kirim || '-'}*`);
    }

    const oldDealpos = Array.isArray(oldOrder.no_transaksi_pengirim)
      ? oldOrder.no_transaksi_pengirim.join(', ')
      : (oldOrder.no_transaksi_pengirim || '');
    const newDealpos = Array.isArray(newOrder.no_transaksi_pengirim)
      ? newOrder.no_transaksi_pengirim.join(', ')
      : (newOrder.no_transaksi_pengirim || '');
    if (oldDealpos.trim() !== newDealpos.trim()) {
      changes.push(`🏷️ *No. Transaksi DealPOS:* ${oldDealpos || '-'} ➡️ *${newDealpos || '-'}*`);
    }

    if ((oldOrder.notes_paket || '').trim() !== (newOrder.notes_paket || '').trim()) {
      changes.push(`📝 *Catatan Paket:* ${oldOrder.notes_paket || '(Kosong)'} ➡️ *${newOrder.notes_paket || '(Kosong)'}*`);
    }

    if ((oldOrder.pic_store || '').trim() !== (newOrder.pic_store || '').trim()) {
      changes.push(`👨‍💼 *PIC Store:* ${oldOrder.pic_store || '-'} ➡️ *${newOrder.pic_store || '-'}*`);
    }

    if (oldOrder.status !== newOrder.status) {
      changes.push(`📊 *Status Pesanan:* ${oldOrder.status} ➡️ *${newOrder.status}*`);
    }

    if ((oldOrder.no_resi || '').trim() !== (newOrder.no_resi || '').trim()) {
      changes.push(`📦 *No. Resi:* ${oldOrder.no_resi || '(Belum Ada)'} ➡️ *${newOrder.no_resi || '(Belum Ada)'}*`);
    }

    // 3. Perubahan Produk, Qty, dan Fulfilment
    const oldItems = oldOrder.items || [];
    const newItems = newOrder.items || [];

    const matchedOldIdx = new Set<number>();
    const matchedNewIdx = new Set<number>();

    // Step A: Match by id
    oldItems.forEach((oldIt, oIdx) => {
      if (!oldIt.id) return;
      const nIdx = newItems.findIndex((newIt, idx) => !matchedNewIdx.has(idx) && newIt.id === oldIt.id);
      if (nIdx !== -1) {
        matchedOldIdx.add(oIdx);
        matchedNewIdx.add(nIdx);
        const newIt = newItems[nIdx];

        const oldSku = (oldIt.sku || '').trim().toUpperCase();
        const newSku = (newIt.sku || '').trim().toUpperCase();
        const oldName = (oldIt.nama_produk || '').trim();
        const newName = (newIt.nama_produk || '').trim();

        if (oldSku !== newSku || oldName !== newName) {
          changes.push(`🔄 *Produk Diganti:*
    • Semula: *${oldIt.sku || '-'}* (${oldIt.nama_produk}) [Qty: ${oldIt.qty} pcs, Fulfilment: ${oldIt.fulfillment || 'Gudang'}]
    • Menjadi: *${newIt.sku || '-'}* (${newIt.nama_produk}) [Qty: ${newIt.qty} pcs, Fulfilment: ${newIt.fulfillment || 'Gudang'}]`);
        } else {
          if (Number(oldIt.qty) !== Number(newIt.qty)) {
            changes.push(`🔢 *Perubahan Qty [${newIt.sku || newIt.nama_produk}]:* ${oldIt.qty} pcs ➡️ *${newIt.qty} pcs*`);
          }
          if ((oldIt.fulfillment || '').trim().toLowerCase() !== (newIt.fulfillment || '').trim().toLowerCase()) {
            changes.push(`🏢 *Perubahan Fulfilment [${newIt.sku || newIt.nama_produk}]:* "${oldIt.fulfillment || 'Gudang'}" ➡️ *"${newIt.fulfillment || 'Gudang'}"*`);
          }
          if ((oldIt.size || '').trim() !== (newIt.size || '').trim()) {
            changes.push(`📏 *Perubahan Size [${newIt.sku || newIt.nama_produk}]:* ${oldIt.size || '-'} ➡️ *${newIt.size || '-'}*`);
          }
        }
      }
    });

    // Step B: Match remaining by SKU
    oldItems.forEach((oldIt, oIdx) => {
      if (matchedOldIdx.has(oIdx)) return;
      const nIdx = newItems.findIndex((newIt, idx) =>
        !matchedNewIdx.has(idx) &&
        oldIt.sku &&
        newIt.sku &&
        oldIt.sku.trim().toUpperCase() === newIt.sku.trim().toUpperCase()
      );
      if (nIdx !== -1) {
        matchedOldIdx.add(oIdx);
        matchedNewIdx.add(nIdx);
        const newIt = newItems[nIdx];
        if (Number(oldIt.qty) !== Number(newIt.qty)) {
          changes.push(`🔢 *Perubahan Qty [${newIt.sku}]:* ${oldIt.qty} pcs ➡️ *${newIt.qty} pcs*`);
        }
        if ((oldIt.fulfillment || '').trim().toLowerCase() !== (newIt.fulfillment || '').trim().toLowerCase()) {
          changes.push(`🏢 *Perubahan Fulfilment [${newIt.sku}]:* "${oldIt.fulfillment || 'Gudang'}" ➡️ *"${newIt.fulfillment || 'Gudang'}"*`);
        }
        if ((oldIt.size || '').trim() !== (newIt.size || '').trim()) {
          changes.push(`📏 *Perubahan Size [${newIt.sku}]:* ${oldIt.size || '-'} ➡️ *${newIt.size || '-'}*`);
        }
      }
    });

    // Step C: If equal unmatched count 1-on-1, detect as swap
    const unmatchedOld = oldItems.filter((_, idx) => !matchedOldIdx.has(idx));
    const unmatchedNew = newItems.filter((_, idx) => !matchedNewIdx.has(idx));

    if (unmatchedOld.length === 1 && unmatchedNew.length === 1) {
      const oldIt = unmatchedOld[0];
      const newIt = unmatchedNew[0];
      changes.push(`🔄 *Produk Diganti:*
    • Semula: *${oldIt.sku || '-'}* (${oldIt.nama_produk}) [Qty: ${oldIt.qty} pcs, Fulfilment: ${oldIt.fulfillment || 'Gudang'}]
    • Menjadi: *${newIt.sku || '-'}* (${newIt.nama_produk}) [Qty: ${newIt.qty} pcs, Fulfilment: ${newIt.fulfillment || 'Gudang'}]`);
    } else {
      unmatchedOld.forEach((oldIt) => {
        changes.push(`❌ *Hapus Produk:* *${oldIt.sku || '-'}* (${oldIt.nama_produk}) — Qty: ${oldIt.qty} pcs, Fulfilment: ${oldIt.fulfillment || 'Gudang'}`);
      });
      unmatchedNew.forEach((newIt) => {
        changes.push(`➕ *Tambah Produk Baru:* *${newIt.sku || '-'}* (${newIt.nama_produk}) — Qty: *${newIt.qty} pcs*, Fulfilment: *${newIt.fulfillment || 'Gudang'}*`);
      });
    }

    if (changes.length === 0) {
      changes.push(`ℹ️ Konfirmasi pembaruan data pesanan (tanpa perbedaan nilai field utama).`);
    }

    return changes;
  };

  /**
   * Format Pesan WhatsApp Pembaruan Pesanan (Sangat Lengkap & Jelas)
   */
  const formatOrderUpdateMessage = (
    oldOrder: ManualShipmentOrder,
    newOrder: ManualShipmentOrder,
    changes: string[],
    editorName: string
  ): string => {
    const dealposStr = Array.isArray(newOrder.no_transaksi_pengirim)
      ? newOrder.no_transaksi_pengirim.join(', ')
      : (newOrder.no_transaksi_pengirim || '-');

    const totalQty = (newOrder.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    const orderId = newOrder.no_transaksi_customer || newOrder.no_pesanan || '-';

    const itemsListStr = (newOrder.items || [])
      .map((it, idx) => {
        const sizeStr = it.size && it.size !== 'ALL' && it.size !== '-' ? ` | Size: ${it.size}` : '';
        const fulStr = it.fulfillment ? ` | Fulfilment: *${it.fulfillment}*` : '';
        return `  ${idx + 1}. *${it.sku || '-'}* - ${it.nama_produk} (Qty: *${it.qty} pcs*${sizeStr}${fulStr})`;
      })
      .join('\n');

    const changesText = changes.map((c) => `• ${c}`).join('\n');

    return `✏️ *PEMBARUAN DATA PESANAN MANUAL SHIPMENT*
--------------------------------------------
Halo Tim *${newOrder.nama_pengirim}*, terdapat pembaruan data pada pesanan manual shipment di sistem WMS Gudang:

📌 *INFORMASI PESANAN:*
• *Order ID / No. Pesanan:* ${orderId}
• *Store Pengirim:* ${newOrder.nama_pengirim} (PIC: ${newOrder.pic_store || '-'})
• *No. DealPOS:* ${dealposStr}
• *Diperbarui Oleh:* ${editorName}
• *Waktu Update:* ${new Date().toLocaleString('id-ID')}

🔄 *POIN-POIN PERUBAHAN DATA:*
${changesText}

📋 *RINCIAN LENGKAP PESANAN TERKINI (FINAL STATE):*
• *Nama Penerima:* ${newOrder.nama_tujuan}
• *No. Telp Customer:* ${newOrder.no_telp_tujuan || '-'}
• *Alamat Pengiriman:* ${newOrder.alamat_tujuan || '-'}
• *Jasa Kirim:* ${newOrder.jasa_kirim || '-'}
• *No. Resi:* ${newOrder.no_resi || 'Menunggu Resi'}
• *Status Pesanan:* ${newOrder.status || 'diterima'}

📦 *Daftar Produk Akhir (${totalQty} Pcs):*
${itemsListStr}
${newOrder.notes_paket ? `\n📝 *Catatan Paket:* ${newOrder.notes_paket}` : ''}

⚠️ *MOHON DICEK KEMBALI:*
Silakan periksa kembali rincian pembaruan di atas untuk memastikan kesesuaian fisik dan sistem. Jika terdapat pertanyaan atau perubahan lanjutan, segera hubungi Tim Admin Gudang sebelum paket diproses kirim.

Terima kasih!
_WMS Warehouse System_`;
  };

  /**
   * Format Rincian Lengkap Pesanan (Full Summary WA)
   */
  const formatOrderFullSummary = (order: ManualShipmentOrder): string => {
    const dealposStr = Array.isArray(order.no_transaksi_pengirim)
      ? order.no_transaksi_pengirim.join(', ')
      : (order.no_transaksi_pengirim || '-');

    const totalQty = (order.items || []).reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
    const orderId = order.no_transaksi_customer || order.no_pesanan || '-';

    const itemsListStr = (order.items || [])
      .map((it, idx) => {
        const sizeStr = it.size && it.size !== 'ALL' && it.size !== '-' ? ` | Size: ${it.size}` : '';
        const fulStr = it.fulfillment ? ` | Fulfilment: *${it.fulfillment}*` : '';
        return `  ${idx + 1}. *${it.sku || '-'}* - ${it.nama_produk} (Qty: *${it.qty} pcs*${sizeStr}${fulStr})`;
      })
      .join('\n');

    return `📦 *RINCIAN PESANAN MANUAL SHIPMENT*
--------------------------------------------
• *Order ID / No. Pesanan:* ${orderId}
• *Store Pengirim:* ${order.nama_pengirim} (PIC: ${order.pic_store || '-'})
• *No. DealPOS:* ${dealposStr}
• *Jasa Kirim:* ${order.jasa_kirim || '-'}
• *No. Resi:* ${order.no_resi || 'Menunggu Resi'}
• *Status:* ${order.status || 'diterima'}

👤 *Data Penerima (Customer):*
• *Nama Tujuan:* ${order.nama_tujuan}
• *No. Telp:* ${order.no_telp_tujuan || '-'}
• *Alamat:* ${order.alamat_tujuan || '-'}

📦 *Daftar Produk (${totalQty} Pcs):*
${itemsListStr}
${order.notes_paket ? `\n📝 *Catatan Paket:* ${order.notes_paket}` : ''}

_WMS Warehouse System_`;
  };
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
        alert('Gagal memunculkan dialog cetak. Jika Anda menggunakan iframe preview, silakan buka aplikasi ini di tab baru (Open in New Tab).');
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [printPayload?.timestamp]);

  // Form State - langsung terisi Order ID Manual Shipment unik anti-collision
  const [pengirim, setPengirim] = useState('');
  const [picStore, setPicStore] = useState('');
  const [telpPengirim, setTelpPengirim] = useState('');
  const [transPengirim, setTransPengirim] = useState('');
  
  // Pilihan Jasa Kirim (Database outlet kolom C row 2)
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

  // Auto-resolve Store & Phone Number from user login session & database
  useEffect(() => {
    let isMounted = true;

    const resolveAccountData = async () => {
      if (!session || editingOrder) return;

      // 1. Resolve Store from session
      let targetStore = '';
      if (!pengirim) {
        const userDiv = (session.divisi || '').toLowerCase().trim();
        const userName = (session.name || '').toLowerCase().trim();
        const userUname = (session.username || '').toLowerCase().trim();

        const match = outlets.find((o) => {
          const oName = o.nama.toLowerCase().trim();
          return (
            userDiv === oName ||
            userDiv.includes(oName) ||
            userName === oName ||
            userName.includes(oName) ||
            userUname === oName ||
            userUname.includes(oName)
          );
        });

        if (match) {
          targetStore = match.nama;
          if (isMounted) {
            setPengirim(match.nama);
            setTransCustomer(generateManualShipmentOrderId(orders, match.nama));
          }
        }
      }

      // 2. Resolve Phone Number from session or database
      if (!telpPengirim) {
        if (session.no_hp && session.no_hp.trim()) {
          if (isMounted) setTelpPengirim(session.no_hp.trim());
        } else {
          try {
            if (session.username) {
              const users = await supabaseFetch<any[]>(
                'wms_users',
                'GET',
                null,
                `username=eq.${encodeURIComponent(session.username)}&limit=1`
              );
              if (isMounted && users && users.length > 0 && users[0].no_hp) {
                setTelpPengirim(users[0].no_hp.trim());
                return;
              }
            }
            if (session.nik) {
              const emps = await supabaseFetch<any[]>(
                'karyawan',
                'GET',
                null,
                `nik=eq.${encodeURIComponent(session.nik)}&limit=1`
              );
              if (isMounted && emps && emps.length > 0 && emps[0].no_hp) {
                setTelpPengirim(emps[0].no_hp.trim());
                return;
              }
            }
          } catch (e) {
            console.warn('Could not auto-fetch user phone number', e);
          }
        }
      }
    };

    resolveAccountData();

    return () => {
      isMounted = false;
    };
  }, [session, outlets, editingOrder]);

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

  /**
   * Force full reload: reset delta sync cache so ALL data is fetched fresh
   */
  const forceReloadOrders = async () => {
    setLoading(true);
    try {
      await clearDeltaSyncCache('Manual Shipment');
      localStorage.removeItem('wms_cached_manual_shipments'); // Also clear localStorage cache
      await loadOrders();
      if (onShowToast) onShowToast('Muat ulang penuh selesai.', 'success');
    } catch (e) {
      console.warn('Error in forceReloadOrders:', e);
      if (onShowToast) onShowToast('Gagal muat ulang penuh.', 'error');
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

    // Validasi Kelengkapan Data Pengirim & PIC
    if (!pengirim || !pengirim.trim()) {
      onShowToast('Nama Pengirim (Store) wajib dipilih/diisi', 'warning');
      return;
    }
    if (!picStore || !picStore.trim()) {
      onShowToast('PIC Store wajib diisi secara manual', 'warning');
      return;
    }
    if (!telpPengirim || !telpPengirim.trim()) {
      onShowToast('No. Telp Store wajib diisi agar notifikasi konfirmasi WhatsApp dapat terkirim', 'warning');
      return;
    }
    if (!transPengirim || !transPengirim.trim()) {
      onShowToast('No. Transaksi DealPOS wajib diisi', 'warning');
      return;
    }
    if (!tujuan || !tujuan.trim() || !telpTujuan || !telpTujuan.trim() || !alamatTujuan || !alamatTujuan.trim()) {
      onShowToast('Harap lengkapi Data Customer (Nama Tujuan, No. Telp, Alamat)', 'warning');
      return;
    }
    if (items.length === 0 || items.some(i => !i.nama_produk || !i.fulfillment)) {
      onShowToast('Harap lengkapi item produk dan pilihan fulfillment toko', 'warning');
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
      nama_pengirim: pengirim.trim(),
      pic_store: picStore.trim(),
      no_telp_store: telpPengirim.trim(),
      no_transaksi_pengirim: transPengirim.split(',').map(s => s.trim()).filter(Boolean),
      nama_tujuan: tujuan.trim(),
      no_telp_tujuan: telpTujuan.trim(),
      alamat_tujuan: alamatTujuan.trim(),
      notes_paket: notesPaket.trim(),
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

    let result = { success: false, message: '' };
    if (editingOrder) {
      result = await editManualShipment(orderData);
    } else {
      result = await submitManualShipment(orderData);
    }

    if (result.success) {
      onShowToast(editingOrder ? 'Pesanan berhasil diupdate' : 'Pesanan berhasil disubmit', 'success');

      // OTOMATIS FONNTE: Kirim notifikasi WhatsApp ke No. Telp Store (Pengirim)
      if (orderData.no_telp_store && orderData.no_telp_store.trim()) {
        const totalQty = orderData.items.reduce((sum, it) => sum + (Number(it.qty) || 0), 0);
        const dealposStr = Array.isArray(orderData.no_transaksi_pengirim)
          ? orderData.no_transaksi_pengirim.join(', ')
          : (orderData.no_transaksi_pengirim || '-');

        if (editingOrder) {
          // Pesan Notifikasi Perubahan Data Lengkap & Terstruktur (Diff Log)
          const editorName = session?.name || getUserPersonName(session?.username) || 'Admin Gudang';
          const changes = generateOrderUpdateDiff(editingOrder, orderData);
          const updateMsg = formatOrderUpdateMessage(editingOrder, orderData, changes, editorName);

          // Buka popup modal sukses update dengan preview pesan siap salin
          setUpdateSuccessModal({
            order: orderData,
            message: updateMsg,
            changes,
          });

          sendFonnteMessage(orderData.no_telp_store, updateMsg)
            .then((res) => {
              if (res.success) {
                console.log('Notifikasi WA update pesanan terkirim ke store:', orderData.no_telp_store);
              }
            })
            .catch((err) => console.warn('WA update notice error:', err));
        } else {
          // Pesan Notifikasi Submit Baru
          const itemsListStr = orderData.items
            .map(
              (it, idx) =>
                `  ${idx + 1}. *${it.sku || '-'}* - ${it.nama_produk} (Qty: ${it.qty} pcs, Fulfillment: ${it.fulfillment || '-'})`
            )
            .join('\n');

          const submitMsg = `📦 *KONFIRMASI PESANAN MANUAL SHIPMENT BERHASIL*
--------------------------------------------
Halo Tim *${orderData.nama_pengirim}*, pesanan manual shipment Anda telah berhasil disubmit ke sistem WMS Gudang.

📋 *Rincian Pesanan:*
• *Order ID / No. Pesanan:* ${orderData.no_transaksi_customer || orderData.no_pesanan}
• *Store Pengirim:* ${orderData.nama_pengirim}
• *PIC Store:* ${orderData.pic_store || '-'}
• *No. DealPOS:* ${dealposStr}
• *Jasa Kirim:* ${orderData.jasa_kirim || '-'}
• *Waktu Submit:* ${new Date().toLocaleString('id-ID')}

👤 *Data Penerima (Customer):*
• *Nama Tujuan:* ${orderData.nama_tujuan}
• *No. Telp:* ${orderData.no_telp_tujuan || '-'}
• *Alamat Tujuan:* ${orderData.alamat_tujuan || '-'}

📦 *Daftar Produk (${totalQty} Pcs):*
${itemsListStr}

📝 *Catatan Paket:* ${orderData.notes_paket || '-'}

⚠️ *PENTING - MOHON DICEK KEMBALI:*
Silakan periksa kembali rincian data di atas untuk menghindari kesalahan input. Jika terdapat revisi atau perubahan alamat, segera hubungi Tim Admin Gudang sebelum paket diproses dan dikirim.

Terima kasih!
_WMS Warehouse System_`;

          sendFonnteMessage(orderData.no_telp_store, submitMsg)
            .then((res) => {
              if (res.success) {
                console.log('Notifikasi WA submit pesanan terkirim ke store:', orderData.no_telp_store);
              }
            })
            .catch((err) => console.warn('WA submit notice error:', err));
        }
      }

      resetForm();
      loadOrders();
      setActiveTab('rekap');
    } else {
      onShowToast(result.message || (editingOrder ? 'Gagal update pesanan' : 'Gagal submit pesanan'), 'error');
    }
    setLoading(false);
  };

  const resetForm = () => {
    setEditingOrder(null);
    setPicStore('');
    setTransPengirim('');
    setJasaKirim('');
    setCustomJasaKirim('');
    setIsCustomJasaKirim(false);
    setTujuan('');
    setTelpTujuan('');
    setAlamatTujuan('');
    setNotesPaket('');
    setTransCustomer(generateManualShipmentOrderId(orders, pengirim));
    setItems([]);
  };

  const handleScanProduct = (sku: string) => {
    const product = productCatalog.find(p => p.k.toUpperCase() === sku.toUpperCase());
    if (!product) {
      onShowToast(`SKU ${sku} tidak terdaftar!`, 'error');
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
    <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xs border border-slate-200/90 dark:border-slate-800 overflow-hidden transition-colors">
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800 pb-3.5 mb-5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                {editingOrder ? 'Edit Pesanan Manual Shipment' : 'Form Pengiriman Manual Shipment'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Input data pesanan store untuk pengiriman ke customer
              </p>
            </div>
          </div>
          {pengirim && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              {pengirim}
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Top Row: Order ID & Pilihan Jasa Kirim (Compact & Aesthetic) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-3.5 sm:p-4 bg-slate-50/80 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-700/60">
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Order ID Manual Shipment
              </label>
              <input
                type="text"
                value={transCustomer}
                readOnly
                tabIndex={-1}
                placeholder="Pilih store pengirim..."
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-mono font-bold text-xs sm:text-sm cursor-not-allowed select-all shadow-xs py-2 px-3 tracking-wide"
              />
              <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Dibuat otomatis oleh sistem</p>
            </div>

            {/* Pilihan Jasa Kirim */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                  Pilihan Jasa Kirim / Ekspedisi <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    await loadJasaKirim();
                    onShowToast('Daftar jasa kirim disinkronkan dari Database', 'info');
                  }}
                  disabled={loadingJasaKirim}
                  className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors disabled:opacity-50 flex items-center gap-1 text-[10px] cursor-pointer"
                  title="Sinkronkan data jasa kirim"
                >
                  <RefreshCw className={`w-3 h-3 ${loadingJasaKirim ? 'animate-spin' : ''}`} />
                  <span>Sync</span>
                </button>
              </div>

              <div className="space-y-1.5">
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
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-2 px-3"
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
                    placeholder="Ketik nama ekspedisi manual..."
                    className="w-full rounded-lg border border-indigo-300 dark:border-indigo-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs px-3 py-1.5 bg-indigo-50/40 dark:bg-indigo-950/40 text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500"
                    autoFocus
                    required
                  />
                )}
              </div>
            </div>
          </div>

          {/* Section 1: Data Pengirim */}
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-700/80 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Store className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Data Pengirim (Store)
              </h3>
              {pengirim && (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  {pengirim}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nama Pengirim (Store) <span className="text-red-500">*</span>
                </label>
                <select
                  value={pengirim}
                  onChange={(e) => {
                    const newStore = e.target.value;
                    setPengirim(newStore);
                    setTransCustomer(generateManualShipmentOrderId(orders, newStore));
                  }}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-2 px-3 font-semibold"
                  required
                >
                  <option value="">Pilih Store...</option>
                  {outlets.map((o, idx) => (
                    <option key={idx} value={o.nama}>{o.nama}</option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Terisi otomatis sesuai akun login</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  PIC Store <span className="text-red-500 font-bold">* (Wajib Isi Manual)</span>
                </label>
                <input
                  type="text"
                  value={picStore}
                  onChange={(e) => setPicStore(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3 font-semibold"
                  placeholder="Nama PIC (Wajib Diisi)"
                  required
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Nama staf yang bertugas / bertanggung jawab</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  No. Telp Store (WhatsApp) <span className="text-red-500 font-bold">* (Wajib Diisi)</span>
                </label>
                <input
                  type="text"
                  value={telpPengirim}
                  onChange={(e) => setTelpPengirim(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3 font-mono font-semibold"
                  placeholder="08... (Wajib diisi)"
                  required
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">Notifikasi konfirmasi & resi dikirim ke nomor ini</p>
              </div>
              <div className="md:col-span-3">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  No. Transaksi DealPOS <span className="text-red-500 font-bold">* (Wajib Diisi)</span>
                </label>
                <input
                  type="text"
                  value={transPengirim}
                  onChange={(e) => setTransPengirim(e.target.value)}
                  placeholder="Contoh: 26.09.00023 (bisa lebih dari 1, pisahkan koma)"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3 font-mono"
                  required
                />
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1">
                  Format DealPOS: <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">26.09.00023</span> (bisa lebih dari 1 transaksi jika digabung, pisahkan tanda koma)
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: Data Customer */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-200 dark:border-slate-700/80 pb-2 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              Data Customer (Penerima)
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Nama Tujuan / Customer <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={tujuan}
                  onChange={(e) => setTujuan(e.target.value)}
                  placeholder="Nama lengkap customer"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  No. Telp Tujuan (WhatsApp Customer) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={telpTujuan}
                  onChange={(e) => setTelpTujuan(e.target.value)}
                  placeholder="08..."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3 font-mono"
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Alamat Lengkap Tujuan <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={alamatTujuan}
                  onChange={(e) => setAlamatTujuan(e.target.value)}
                  placeholder="Jalan, No. Rumah, RT/RW, Kelurahan, Kecamatan, Kota/Kabupaten, Kode Pos"
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                  rows={2}
                  required
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notes Tambahan Paket (Opsional)
                </label>
                <input
                  type="text"
                  value={notesPaket}
                  onChange={(e) => setNotesPaket(e.target.value)}
                  placeholder="Contoh: Jangan dibanting, titip di satpam, dll."
                  className="w-full rounded-lg border border-slate-300 dark:border-slate-700 shadow-xs focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-xs sm:text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 py-2 px-3"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Item Pesanan */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-3 border-b border-slate-200 dark:border-slate-700/80 pb-2 flex justify-between items-center">
              <span className="flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                Item Pesanan
              </span>
              <span className="text-[11px] font-semibold text-slate-500">
                {items.length} Baris Produk
              </span>
            </h3>

            {/* Scan / Add Product */}
            <div className="mb-4">
              <PhysicalScanInput 
                onScan={handleScanProduct}
                products={productCatalog}
                placeholder="KETIK SKU ATAU SCAN BARCODE..."
              />
            </div>

            <div className="space-y-3">
              {items.length === 0 && (
                <div className="text-center py-8 text-slate-400 dark:text-slate-500 bg-slate-50/60 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                  <ShoppingBag className="w-10 h-10 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                  <div className="font-semibold text-slate-600 dark:text-slate-400 text-xs">Belum ada item pesanan</div>
                  <div className="text-[11px]">Ketik SKU produk atau scan barcode untuk menambahkan ke pesanan</div>
                </div>
              )}
              {items.map((item) => (
                  <div key={item.id} className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80 relative transition-colors">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                      {/* Product Name */}
                      <div className="md:col-span-5 flex flex-col justify-center">
                        <label className="block text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500 mb-0.5">Nama Produk</label>
                        <div className="font-semibold text-slate-800 dark:text-white text-xs truncate" title={item.nama_produk}>
                          {item.nama_produk}
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                          SKU: {item.sku}
                        </div>
                      </div>

                      {/* QTY */}
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500 mb-0.5">Qty</label>
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
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 text-xs focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-1 px-2.5 font-bold"
                          required
                        />
                      </div>

                      {/* Fulfillment */}
                      <div className="md:col-span-4">
                        <label className="block text-[10px] font-semibold uppercase text-slate-400 dark:text-slate-500 mb-0.5">Fulfillment</label>
                        <select
                          value={item.fulfillment}
                          onChange={(e) => handleItemChange(item.id, 'fulfillment', e.target.value)}
                          className="w-full rounded-md border border-slate-300 dark:border-slate-700 text-xs focus:ring-indigo-500 focus:border-indigo-500 bg-white dark:bg-slate-900 text-slate-900 dark:text-white py-1 px-2"
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
                          className="p-1.5 rounded-lg transition-colors text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 flex items-center gap-1 text-xs font-semibold cursor-pointer"
                          title="Hapus item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span className="md:hidden">Hapus</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2.5">
            {editingOrder && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-xl text-slate-700 dark:text-slate-300 text-xs font-semibold bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                Batal Edit
              </button>
            )}
            <button
              type="submit"
              disabled={loading}
              className={`px-5 py-2 rounded-xl text-white text-xs font-bold flex items-center shadow-xs cursor-pointer transition-colors ${
                loading ? 'bg-indigo-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800'
              }`}
            >
              {loading ? (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 mr-1.5" />
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
                <div className="flex gap-2 flex-wrap items-center">
                  <button 
                    onClick={() => { setSelectedOrderDetails(null); handlePrintLabel(order); }}
                    className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold rounded-lg text-xs border border-slate-300 dark:border-slate-700 flex items-center transition-colors cursor-pointer"
                  >
                    <Printer className="w-3.5 h-3.5 mr-1.5" />
                    Print Label
                  </button>
                  <button 
                    type="button"
                    onClick={() => {
                      const summary = formatOrderFullSummary(order);
                      copyToClipboard(summary, 'Rincian lengkap pesanan (format WA) berhasil disalin!');
                    }}
                    className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold rounded-lg text-xs border border-slate-300 dark:border-slate-700 flex items-center transition-colors cursor-pointer"
                    title="Salin Rincian Pesanan Lengkap untuk WhatsApp"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5 text-indigo-600" />
                    Salin Rincian (WA)
                  </button>
                  {userIsAdmin && (
                    <>
                      <button 
                        onClick={() => { setSelectedOrderDetails(null); handleEdit(order); }}
                        className="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 font-semibold rounded-lg text-xs border border-slate-300 dark:border-slate-700 flex items-center transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                      <button 
                        onClick={() => { handleUpdateResi(order.no_pesanan!); }}
                        className="px-3.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-semibold rounded-lg text-xs border border-indigo-200 dark:border-indigo-800 flex items-center transition-colors cursor-pointer"
                      >
                        Update Resi
                      </button>
                    </>
                  )}
                </div>

                {/* Section No. Resi & Template WA Customer (Khusus PIC Store & Admin) */}
                <div className="bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <span className="text-[10px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider block">
                        Nomor Resi Pengiriman
                      </span>
                      <div className="text-base font-mono font-black text-emerald-950 dark:text-emerald-200 mt-0.5">
                        {order.no_resi ? (
                          <span className="bg-emerald-100 dark:bg-emerald-900/60 px-2.5 py-0.5 rounded border border-emerald-300 dark:border-emerald-700">
                            {order.no_resi}
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-sans font-semibold text-xs flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" />
                            Menunggu update resi dari Admin Gudang
                          </span>
                        )}
                      </div>
                    </div>
                    {order.no_resi && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            copyToClipboard(order.no_resi || '', `No. Resi ${order.no_resi} berhasil disalin!`);
                            setCopiedResi(order.no_pesanan);
                            setTimeout(() => setCopiedResi(null), 2000);
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                        >
                          {copiedResi === order.no_pesanan ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>Salin No. Resi</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setWaModalOrder(order)}
                          className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Template WA Customer</span>
                        </button>
                      </div>
                    )}
                  </div>
                  
                  {/* WhatsApp Message Preview Box */}
                  <div className="pt-2 border-t border-emerald-200/80 dark:border-emerald-800/40">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        Format Pesan WA untuk Customer (Kirim Manual oleh PIC Store):
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(generateCustomerWaTemplate(order), 'Format pesan WA customer berhasil disalin!')}
                        className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        Salin Format WA
                      </button>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-emerald-200/90 dark:border-emerald-800/50 rounded-lg p-3 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans max-h-40 overflow-y-auto leading-relaxed select-all">
                      {generateCustomerWaTemplate(order)}
                    </div>
                    {order.no_telp_tujuan && (
                      <div className="mt-2 flex justify-end">
                        <a
                          href={`https://wa.me/${getCleanCustomerPhone(order.no_telp_tujuan)}?text=${encodeURIComponent(generateCustomerWaTemplate(order))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Buka Chat WhatsApp Customer ({order.no_telp_tujuan})
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Order Items</h3>
                  <div className="space-y-3">
                    {order.items?.map((item, idx) => (
                      <div key={idx} className="text-sm text-slate-700 dark:text-slate-300 flex justify-between items-center border-b border-slate-100 dark:border-slate-800 pb-2">
                        <div>
                          <div className="font-semibold text-indigo-600 dark:text-indigo-400">{item.nama_produk}</div>
                          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex-wrap">
                            <span>SKU: {item.sku}</span>
                            {item.size && item.size !== 'ALL' && item.size !== '-' && <span>| Size: {item.size}</span>}
                            {item.fulfillment && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                Fulfilment: {item.fulfillment}
                              </span>
                            )}
                          </div>
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
    if (!resi || !resi.trim()) return;
    
    const cleanResi = resi.trim();
    setLoading(true);
    const targetOrder = orders.find(o => o.no_pesanan === no_pesanan || (o as any).id === no_pesanan);
    const success = await updateShipmentResi(no_pesanan, cleanResi);
    if (success) {
      onShowToast('Resi berhasil diupdate', 'success');

      // OTOMATIS FONNTE: Kirim notifikasi WhatsApp ke Store
      const storePhone = targetOrder?.no_telp_store;
      if (storePhone && storePhone.trim()) {
        const resiMsg = `🚚 *UPDATE RESI PENGIRIMAN MANUAL SHIPMENT*
--------------------------------------------
Halo Tim *${targetOrder?.nama_pengirim || 'Store'}*, nomor resi pengiriman untuk pesanan Anda telah diperbarui di sistem WMS Gudang:

📋 *Rincian Pesanan:*
• *Order ID / No. Pesanan:* ${targetOrder?.no_transaksi_customer || targetOrder?.no_pesanan}
• *Store Pengirim:* ${targetOrder?.nama_pengirim || '-'} (PIC: ${targetOrder?.pic_store || '-'})
• *Jasa Kirim:* ${targetOrder?.jasa_kirim || '-'}
• *Nama Customer:* ${targetOrder?.nama_tujuan || '-'}
• *No. Telp Customer:* ${targetOrder?.no_telp_tujuan || '-'}

📦 *Nomor Resi Baru:*
👉 *${cleanResi}*

Status pengiriman paket telah diperbarui. Silakan simpan dan teruskan nomor resi ini kepada customer Anda.

Terima kasih!
_WMS Warehouse System_`;

        sendFonnteMessage(storePhone, resiMsg)
          .then((res) => {
            if (res.success) {
              console.log('Notifikasi WA update resi terkirim ke store:', storePhone);
            }
          })
          .catch((err) => console.warn('WA resi notice error:', err));
      }

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

    // Tambahkan UTF-8 BOM (\uFEFF) agar terbaca sempurna di Microsoft Excel dan Google Databases
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
              className="px-2.5 py-1.5 flex items-center gap-1.5 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 border border-slate-200 dark:border-slate-700 rounded-lg shadow-xs transition-colors cursor-pointer text-xs font-semibold"
              title="Refresh delta (hanya data baru)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
            <button
              onClick={forceReloadOrders}
              className="px-2.5 py-1.5 flex items-center gap-1.5 text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 bg-amber-50 dark:bg-amber-950/20 hover:bg-amber-100 dark:hover:bg-amber-900/40 border border-amber-200 dark:border-amber-800/60 rounded-lg shadow-xs transition-colors cursor-pointer text-xs font-semibold"
              title="Muat ulang SEMUA data dari awal (reset cache lokal)"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Muat Ulang Penuh</span>
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
                {userIsAdmin && (
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
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Ekspedisi</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">No. Resi</th>
                <th scope="col" className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Status</th>
                <th scope="col" className="px-3 py-2 text-center text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Total Items</th>
                {userIsAdmin && (
                  <th scope="col" className="px-3 py-2 text-right text-[11px] font-semibold text-slate-700 dark:text-slate-300 capitalize tracking-normal">Aksi</th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800/80">
              {filteredOrders.length === 0 ? (
                <tr>
                  <td colSpan={userIsAdmin ? 10 : 8} className="px-3 py-8 text-center text-[11px] text-slate-500 dark:text-slate-400">
                    {searchTerm ? 'Tidak ada pesanan yang cocok dengan pencarian' : 'Tidak ada data pesanan'}
                  </td>
                </tr>
              ) : (
              filteredOrders.map((order) => (
                <tr key={order.no_pesanan} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  {userIsAdmin && (
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
                    <div className="text-[11px] text-slate-700 dark:text-slate-300 mt-0.5 font-medium">{order.jasa_kirim || '-'}</div>
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap align-top">
                    {order.no_resi ? (
                      <div className="flex flex-col gap-1 items-start">
                        <div className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/70 rounded-md px-2 py-0.5 text-[11px] font-mono font-bold text-emerald-800 dark:text-emerald-300">
                          <Truck className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          <span>{order.no_resi}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              copyToClipboard(order.no_resi || '', `No. Resi ${order.no_resi} berhasil disalin!`);
                              setCopiedResi(order.no_pesanan);
                              setTimeout(() => setCopiedResi(null), 2000);
                            }}
                            className="ml-1 p-0.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-950 dark:hover:text-emerald-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded cursor-pointer transition-colors"
                            title="Salin No. Resi"
                          >
                            {copiedResi === order.no_pesanan ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setWaModalOrder(order);
                          }}
                          className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 hover:text-emerald-900 dark:hover:text-emerald-200 bg-emerald-100/70 dark:bg-emerald-950/60 hover:bg-emerald-200/70 dark:hover:bg-emerald-900/80 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/60 transition-colors cursor-pointer"
                          title="Format pesan WhatsApp untuk customer"
                        >
                          <MessageCircle className="w-2.5 h-2.5" />
                          <span>WA Customer</span>
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800/50 font-medium">
                        <Clock className="w-3 h-3 shrink-0" />
                        <span>Menunggu Resi</span>
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
                  {userIsAdmin && (
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
                      {userIsAdmin && (
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
                      </div>
                    </div>

                    {/* No. Resi Box (Khusus agar PIC Store bisa copas langsung) */}
                    <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">No. Resi Pengiriman</span>
                        {order.no_resi && (
                          <button
                            type="button"
                            onClick={() => {
                              copyToClipboard(order.no_resi || '', `No. Resi ${order.no_resi} berhasil disalin!`);
                              setCopiedResi(order.no_pesanan);
                              setTimeout(() => setCopiedResi(null), 2000);
                            }}
                            className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 flex items-center gap-1 hover:underline cursor-pointer"
                          >
                            {copiedResi === order.no_pesanan ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                            <span>Salin</span>
                          </button>
                        )}
                      </div>
                      {order.no_resi ? (
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <span className="text-xs font-mono font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-200 dark:border-emerald-800/50">
                            {order.no_resi}
                          </span>
                          <button
                            type="button"
                            onClick={() => setWaModalOrder(order)}
                            className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                          >
                            <MessageCircle className="w-3 h-3" />
                            <span>WA Customer</span>
                          </button>
                        </div>
                      ) : (
                        <div className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1 bg-amber-50 dark:bg-amber-950/40 px-2 py-1 rounded border border-amber-200 dark:border-amber-800/40 font-medium">
                          <Clock className="w-3 h-3 shrink-0" />
                          <span>Menunggu resi dari Admin</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex justify-between items-center">
                    <button 
                      type="button"
                      onClick={() => setSelectedOrderDetails(order)}
                      className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 px-3 py-1.5 rounded-md border border-indigo-100 dark:border-indigo-800/80 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" />
                      {order.items?.reduce((acc, it) => acc + (Number(it.qty) || 0), 0) || 0} Items
                    </button>
                    
                    {userIsAdmin && (
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
      {/* Tab Navigation - Compact, Sleek & Aesthetic */}
      <div className="flex items-center justify-between flex-wrap gap-2.5 mb-4">
        <div className="inline-flex p-1 bg-slate-100/90 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700/80 rounded-xl shadow-xs">
          <button
            type="button"
            id="tab-manual-form"
            className={`py-1.5 px-3.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 flex items-center gap-2 cursor-pointer ${
              activeTab === 'form'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            onClick={() => {
              if (editingOrder) resetForm();
              setActiveTab('form');
            }}
          >
            <Package className="w-4 h-4 shrink-0" />
            <span>{editingOrder ? 'Edit Pesanan' : 'Form Pesanan'}</span>
          </button>
          <button
            type="button"
            id="tab-manual-rekap"
            className={`py-1.5 px-3.5 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-150 flex items-center gap-2 cursor-pointer ${
              activeTab === 'rekap'
                ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-xs font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
            onClick={() => {
              setActiveTab('rekap');
              loadOrders();
            }}
          >
            <History className="w-4 h-4 shrink-0" />
            <span>Rekap Pesanan</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
              {orders.length}
            </span>
          </button>
        </div>

        {pengirim && (
          <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Store: <strong className="text-slate-900 dark:text-white font-semibold">{pengirim}</strong></span>
            {picStore && <span className="text-slate-400 text-[11px]">(PIC: {picStore})</span>}
          </div>
        )}
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

      {/* Modal WhatsApp Template Customer */}
      {waModalOrder && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
            <div className="flex justify-between items-center px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 bg-emerald-50/80 dark:bg-emerald-950/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-600 text-white">
                  <MessageCircle className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800 dark:text-white">
                    Template Pesan WhatsApp Customer
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Disalin atau dikirim langsung oleh PIC Store ke customer
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setWaModalOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Customer</span>
                  <span className="font-bold text-slate-800 dark:text-white truncate block">{waModalOrder.nama_tujuan || '-'}</span>
                  <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{waModalOrder.no_telp_tujuan || '-'}</span>
                </div>
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg border border-slate-200/80 dark:border-slate-700/80">
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Ekspedisi</span>
                  <span className="font-bold text-slate-800 dark:text-white truncate block">{waModalOrder.jasa_kirim || '-'}</span>
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">Store: {waModalOrder.nama_pengirim}</span>
                </div>
                <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/40 rounded-lg border border-emerald-200 dark:border-emerald-800/60 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase font-bold block">No. Resi</span>
                  <span className="font-bold font-mono text-emerald-900 dark:text-emerald-200 truncate block text-sm">
                    {waModalOrder.no_resi || 'Belum Ada'}
                  </span>
                  {waModalOrder.no_resi && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(waModalOrder.no_resi || '', `No. Resi disalin: ${waModalOrder.no_resi}`)}
                      className="text-[10px] text-emerald-700 dark:text-emerald-400 hover:underline font-semibold cursor-pointer"
                    >
                      Salin Resi Saja
                    </button>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Format Pesan WhatsApp (Siap Kirim):</span>
                  <span className="text-[10px] font-normal text-slate-400">Dapat diedit sebelum disalin</span>
                </label>
                <textarea
                  defaultValue={generateCustomerWaTemplate(waModalOrder)}
                  id="wa-template-textarea"
                  rows={9}
                  className="w-full text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-slate-800 dark:text-slate-100 font-sans focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed select-all"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const ta = document.getElementById('wa-template-textarea') as HTMLTextAreaElement | null;
                  const textToCopy = ta ? ta.value : generateCustomerWaTemplate(waModalOrder);
                  copyToClipboard(textToCopy, 'Template pesan WhatsApp Customer berhasil disalin!');
                }}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>Salin Pesan WA</span>
              </button>

              <div className="flex items-center gap-2">
                {waModalOrder.no_telp_tujuan && (
                  <button
                    type="button"
                    onClick={() => {
                      const ta = document.getElementById('wa-template-textarea') as HTMLTextAreaElement | null;
                      const textToSend = ta ? ta.value : generateCustomerWaTemplate(waModalOrder);
                      const cleanPhone = getCleanCustomerPhone(waModalOrder.no_telp_tujuan);
                      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(textToSend)}`, '_blank');
                    }}
                    className="px-4 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Buka WhatsApp Customer</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setWaModalOrder(null)}
                  className="px-3.5 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Preview & Salin Pesan Pembaruan Data (Diff Log) */}
      {updateSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black/60 dark:bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl">
            {/* Modal Header */}
            <div className="flex justify-between items-center px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-indigo-50/80 dark:bg-indigo-950/40">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-600 text-white shadow-xs">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-800 dark:text-white">
                    Pembaruan Pesanan Berhasil Disimpan
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pesan notifikasi pembaruan lengkap &amp; siap dikirim / disalin ke WhatsApp
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUpdateSuccessModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 flex-1 overflow-y-auto space-y-4">
              {/* Highlight Poin-Poin Perubahan */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700/80 space-y-2">
                <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider block">
                  🔍 Ringkasan Perubahan Terdeteksi ({updateSuccessModal.changes.length} Poin):
                </span>
                <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                  {updateSuccessModal.changes.map((ch, idx) => (
                    <div key={idx} className="flex items-start gap-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="text-indigo-600 font-bold shrink-0">•</span>
                      <span className="leading-relaxed whitespace-pre-wrap">{ch}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Textarea Template WA */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                  <span>Format Pesan WhatsApp Pembaruan (Siap Kirim):</span>
                  <span className="text-[10px] font-normal text-slate-400">Dapat diedit sebelum disalin</span>
                </label>
                <textarea
                  id="update-msg-textarea"
                  defaultValue={updateSuccessModal.message}
                  rows={10}
                  className="w-full text-xs font-mono rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3 text-slate-800 dark:text-slate-100 focus:bg-white dark:focus:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500 leading-relaxed select-all"
                />
              </div>
            </div>

            {/* Modal Footer */}
            <div className="px-5 py-3.5 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const ta = document.getElementById('update-msg-textarea') as HTMLTextAreaElement | null;
                  const textToCopy = ta ? ta.value : updateSuccessModal.message;
                  copyToClipboard(textToCopy, 'Pesan pembaruan pesanan berhasil disalin!');
                  setCopiedUpdateMsg(true);
                  setTimeout(() => setCopiedUpdateMsg(false), 2500);
                }}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                {copiedUpdateMsg ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                <span>{copiedUpdateMsg ? 'Tersalin ke Clipboard!' : 'Salin Pesan Pembaruan'}</span>
              </button>

              <div className="flex items-center gap-2">
                {updateSuccessModal.order.no_telp_store && (
                  <button
                    type="button"
                    onClick={() => {
                      const ta = document.getElementById('update-msg-textarea') as HTMLTextAreaElement | null;
                      const textToSend = ta ? ta.value : updateSuccessModal.message;
                      const cleanPhone = getCleanCustomerPhone(updateSuccessModal.order.no_telp_store);
                      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(textToSend)}`, '_blank');
                    }}
                    className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Kirim WA Store</span>
                  </button>
                )}
                {updateSuccessModal.order.no_telp_tujuan && (
                  <button
                    type="button"
                    onClick={() => {
                      const ta = document.getElementById('update-msg-textarea') as HTMLTextAreaElement | null;
                      const textToSend = ta ? ta.value : updateSuccessModal.message;
                      const cleanPhone = getCleanCustomerPhone(updateSuccessModal.order.no_telp_tujuan);
                      window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(textToSend)}`, '_blank');
                    }}
                    className="px-3.5 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Kirim WA Customer</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setUpdateSuccessModal(null)}
                  className="px-3.5 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  alert('Gagal memunculkan dialog cetak. Silakan buka aplikasi di Tab Baru (Open in New Tab).');
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
                  className="page-break w-[105mm] min-h-[140mm] p-[2mm] box-border bg-white relative flex flex-col justify-between"
                  style={{
                    pageBreakAfter: orderIdx < printPayload.orders.length - 1 ? 'always' : 'auto',
                    breakAfter: orderIdx < printPayload.orders.length - 1 ? 'page' : 'auto',
                    pageBreakInside: 'avoid',
                    breakInside: 'avoid',
                  }}
                >
                  <div className="w-full h-full min-h-[136mm] border-[2px] border-black flex flex-col bg-white box-border text-black">
                    {/* TOP FIXED AREA */}
                    <div className="flex flex-col shrink-0">
                       {/* 1. Header Label */}
                       <div className="border-b-[2px] border-black px-3 py-2 bg-gray-50 flex justify-between items-center break-inside-avoid">
                         <div className="text-xl font-black tracking-widest uppercase leading-none text-black flex items-center">
                           <img src="/logo.svg" alt="" referrerPolicy="no-referrer" className="h-7 object-contain hidden print:block" onError={(e) => e.currentTarget.style.display = 'none'} />
                         </div>
                         <div className="text-lg font-black tracking-wider uppercase leading-none text-black">
                           {order.jasa_kirim || 'PENGIRIMAN PAKET'}
                         </div>
                       </div>
                  
                       {/* 2. Sender / Receiver + QR Code block */}
                       <div className="flex border-b-[2px] border-black bg-white break-inside-avoid">
                          {/* Main Left Column (Penerima & Pengirim Stacked) */}
                          <div className="flex-1 flex flex-col border-r-[2px] border-black min-w-0">
                            
                            {/* PENERIMA (Top, Gets Maximum Space) */}
                            <div className="p-3 border-b-[2px] border-black flex-1">
                              <div className="text-[11px] font-black uppercase text-gray-600 mb-1">Kepada / Penerima:</div>
                              <div className="text-[18px] font-black uppercase mb-1 leading-tight text-black">{order.nama_tujuan || '-'}</div>
                              {order.no_telp_tujuan && (
                                <div className="text-[14px] font-black font-mono text-black mb-1.5 leading-none">{order.no_telp_tujuan}</div>
                              )}
                              <div className="text-[13px] font-bold leading-snug whitespace-pre-wrap text-black">{order.alamat_tujuan || '-'}</div>
                              {order.notes_paket && (
                                <div className="mt-2 pt-1.5 border-t border-dashed border-gray-300">
                                  <span className="text-[10px] font-black uppercase text-gray-500 mr-1">NOTE:</span>
                                  <span className="text-[12px] font-bold text-black whitespace-pre-wrap">{order.notes_paket}</span>
                                </div>
                              )}
                            </div>

                            {/* PENGIRIM (Bottom) */}
                            <div className="p-2.5 flex items-center justify-between gap-2 shrink-0 bg-white">
                              <div className="flex-1">
                                <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">Dari / Pengirim:</div>
                                <div className="text-[12px] font-black uppercase text-black leading-tight">{order.nama_pengirim || 'CHOCOCHIPS'}</div>
                              </div>
                              {order.pic_store && (
                                <div className="px-2 border-l border-gray-300">
                                  <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">PIC:</div>
                                  <div className="text-[11px] font-bold text-gray-800 leading-tight">{order.pic_store}</div>
                                </div>
                              )}
                              {order.no_telp_store && (
                                <div className="text-right pl-2 border-l border-gray-300">
                                  <div className="text-[9px] font-black uppercase text-gray-600 mb-0.5">No. Telp:</div>
                                  <div className="text-[11px] font-bold font-mono text-gray-800 leading-tight">{order.no_telp_store}</div>
                                </div>
                              )}
                            </div>
                          </div>
                  
                          {/* QR Code and ID */}
                          <div className="w-[110px] p-2 flex flex-col items-center justify-center shrink-0">
                            {qrDataUrl && (
                              <img
                                src={qrDataUrl}
                                alt="QR Code"
                                className="w-[75px] h-[75px] block object-contain mb-1.5"
                              />
                            )}
                            <div className="text-[10px] font-black text-center break-all mb-0.5 text-black leading-tight">
                              ID: {order.no_pesanan || ''}
                            </div>
                            {order.no_transaksi_customer && (
                              <div className="text-[9px] font-bold text-center break-all text-neutral-600 leading-tight mt-0.5">
                                Ref: {order.no_transaksi_customer}
                              </div>
                            )}
                          </div>
                       </div>
                  
                       {/* 3. Warning Box */}
                       <div className="border-b-[2px] border-black py-1.5 px-2 bg-gray-100 flex items-center justify-center text-center break-inside-avoid">
                         <div className="text-[8.5px] font-black text-black tracking-wide uppercase leading-tight">
                           ⚠️ PERHATIAN: JANGAN DITERIMA JIKA KONDISI PAKET RUSAK ATAU SEGEL TERBUKA &bull; MOHON DOKUMENTASIKAN PENERIMAAN DAN UNBOXING PAKET UNTUK KLAIM KOMPLAIN PAKET YANG DITERIMA
                         </div>
                       </div>
                    </div>
                  
                    {/* BOTTOM DYNAMIC AREA: Table for Manual Shipment */}
                    <div className="p-3 bg-white flex-1 flex flex-col">
                      <div className="text-[12px] font-black uppercase text-gray-600 border-b border-black pb-1 mb-1.5">ISI PRODUK PESANAN</div>
                      <div className="flex-1">
                        <table className="w-full border-collapse text-[12px]">
                          <thead>
                            <tr className="border-b border-dashed border-black">
                              <th className="text-left py-1 w-[5%] font-bold">No.</th>
                              <th className="text-left py-1 w-[50%] font-bold">Nama Produk</th>
                              <th className="text-left py-1 w-[15%] font-bold">Size</th>
                              <th className="text-left py-1 w-[20%] font-bold">SKU</th>
                              <th className="text-center py-1 w-[10%] font-bold">Qty</th>
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
                                    <td className="py-1 align-top">{idx + 1}.</td>
                                    <td className="py-1 align-top leading-snug line-clamp-2 pr-1">{cleanName}</td>
                                    <td className="py-1 align-top">{size}</td>
                                    <td className="py-1 align-top">{it.sku || ''}</td>
                                    <td className="py-1 align-top text-center font-bold">{it.qty || 1}</td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr>
                                <td colSpan={5} className="py-2 text-center border-b border-dashed border-black text-gray-500">
                                  Tidak ada detail produk
                                </td>
                              </tr>
                            )}
                            <tr>
                              <td colSpan={4} className="text-right py-1 pr-2 font-bold uppercase">Total Item</td>
                              <td className="text-center py-1 font-bold text-[14px]">{totalQty}</td>
                            </tr>
                          </tbody>
                        </table>
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
                      <div className="text-lg font-black tracking-wide text-indigo-600 flex items-center gap-2">
                        <img src="/logo.svg" alt="" referrerPolicy="no-referrer" className="h-5 object-contain hidden print:block" onError={(e) => e.currentTarget.style.display = 'none'} />
                        WMS
                      </div>
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
