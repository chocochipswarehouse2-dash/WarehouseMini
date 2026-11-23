import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  Download,
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Search,
  RefreshCw,
  Save,
  Scissors,
  FileText,
  Copy,
  Check,
  Sparkles,
  Store,
  Layers,
  Package,
} from 'lucide-react';
import { ManualShipmentItem, ManualShipmentOrder, ProductItem } from '../../types';
import {
  bulkUpdateOrdersSjDealpos,
  BulkSjDealposUpdateItem,
  getValidPersonPicName,
  isMarketplaceFulfillmentItem,
} from '../../services/gasManualShipment';
import { isRealAlterItem, isStandaloneArOrder } from '../../utils/alterationUtils';
import { lookupProductBySku } from '../../utils/productLookup';

interface BulkUpdateSjModalProps {
  isOpen: boolean;
  onClose: () => void;
  orders: ManualShipmentOrder[];
  productCatalog: ProductItem[];
  operatorName: string;
  getValidItemSjDealpos: (order: ManualShipmentOrder | null | undefined, it: any) => string;
  onSuccess: (
    updatedCount: number,
    updatedEntries?: Array<{ order: ManualShipmentOrder; newSj: string }>
  ) => void;
  onShowToast: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface MarketplaceOrderEntry {
  order: ManualShipmentOrder;
  mktItems: Array<{
    item: ManualShipmentItem;
    officialName: string;
    officialSize: string;
    validSj: string;
  }>;
  otherActiveItemsCount: number;
  totalMktQty: number;
  existingSjList: string[];
  primaryExistingSj: string;
  missingSjCount: number;
  storeTxLowerSet: Set<string>;
}

interface CsvParsedSjRow {
  rawOrderRef: string;
  orderId: string;
  matchedEntry?: MarketplaceOrderEntry;
  oldSj: string;
  newSj: string;
  statusText: string;
  isValid: boolean;
}

const splitCsvLine = (text: string, delimiter: string): string[] => {
  const result: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === delimiter && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += char;
    }
  }
  result.push(cur);
  return result;
};

const extractStoreTxLowerSet = (order: ManualShipmentOrder): Set<string> => {
  const txList: string[] = Array.isArray(order?.no_transaksi_pengirim)
    ? order.no_transaksi_pengirim.map((t) => String(t || '').trim().toLowerCase()).filter(Boolean)
    : order?.no_transaksi_pengirim
    ? String(order.no_transaksi_pengirim)
        .split(',')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean)
    : [];
  return new Set(txList);
};

export const BulkUpdateSjModal: React.FC<BulkUpdateSjModalProps> = ({
  isOpen,
  onClose,
  orders,
  productCatalog,
  operatorName,
  getValidItemSjDealpos,
  onSuccess,
  onShowToast,
}) => {
  const [activeTab, setActiveTab] = useState<'table' | 'csv'>('table');
  const [filterMode, setFilterMode] = useState<'need_sj_only' | 'all_mkt'>('need_sj_only');
  const [filterStore, setFilterStore] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Table direct edit state: map of order.no_pesanan -> new SJ string
  const [tableSjInputs, setTableSjInputs] = useState<Record<string, string>>({});
  const [selectedOrderNos, setSelectedOrderNos] = useState<Set<string>>(new Set());
  const [batchSjValue, setBatchSjValue] = useState('');

  // Quick paste & copy states
  const [quickPasteText, setQuickPasteText] = useState('');
  const [showQuickPaste, setShowQuickPaste] = useState(false);
  const [copiedSummary, setCopiedSummary] = useState(false);

  // CSV Import State
  const [csvFileName, setCsvFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<CsvParsedSjRow[]>([]);
  const [csvParseErrors, setCsvParseErrors] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Reset transient selections when modal closes/opens
  useEffect(() => {
    if (!isOpen) {
      setSelectedOrderNos(new Set());
      setBatchSjValue('');
      setShowQuickPaste(false);
      setQuickPasteText('');
      setCsvFileName('');
      setParsedRows([]);
      setCsvParseErrors([]);
    }
  }, [isOpen]);

  // Build authoritative list of orders that have active Marketplace / Gudang items
  const allMarketplaceEntries = useMemo<MarketplaceOrderEntry[]>(() => {
    const entries: MarketplaceOrderEntry[] = [];

    for (const order of orders) {
      if (!order || order.status === 'batal') continue;
      const items = Array.isArray(order.items) ? order.items : [];
      const activeMktItems = items.filter(isMarketplaceFulfillmentItem);
      if (activeMktItems.length === 0) continue;

      const otherActiveItemsCount = items.filter(
        (it) =>
          it &&
          it.item_status !== 'sold_out' &&
          it.item_status !== 'cancelled' &&
          !isMarketplaceFulfillmentItem(it)
      ).length;

      const mappedMktItems = activeMktItems.map((it) => {
        const cleanSku = String(it.sku || '').trim().toUpperCase();
        const master = cleanSku
          ? lookupProductBySku(cleanSku, productCatalog, it.nama_produk, it.size)
          : null;
        const officialName =
          master && master.found ? master.nama_produk : String(it.nama_produk || cleanSku || '-').trim();
        const officialSize =
          master && master.found
            ? master.size || '-'
            : String(it.size || '-').trim() || '-';
        const validSj = getValidItemSjDealpos(order, it);
        return {
          item: it,
          officialName,
          officialSize,
          validSj,
        };
      });

      const existingSjList = Array.from(
        new Set(mappedMktItems.map((m) => m.validSj).filter(Boolean))
      );
      const missingSjCount = mappedMktItems.filter((m) => !m.validSj).length;
      const totalMktQty = mappedMktItems.reduce(
        (sum, m) => sum + Math.max(1, Number(m.item.qty) || 1),
        0
      );

      entries.push({
        order,
        mktItems: mappedMktItems,
        otherActiveItemsCount,
        totalMktQty,
        existingSjList,
        primaryExistingSj: existingSjList[0] || '',
        missingSjCount,
        storeTxLowerSet: extractStoreTxLowerSet(order),
      });
    }

    return entries;
  }, [orders, productCatalog, getValidItemSjDealpos]);

  // O(1) lookup map by no_pesanan
  const entryByOrderNo = useMemo(() => {
    const map = new Map<string, MarketplaceOrderEntry>();
    for (const e of allMarketplaceEntries) {
      if (e.order.no_pesanan) {
        map.set(e.order.no_pesanan, e);
      }
    }
    return map;
  }, [allMarketplaceEntries]);

  // Store filter options with pending SJ counts
  const storeFilterOptions = useMemo(() => {
    const countMap = new Map<string, { total: number; pending: number }>();
    for (const e of allMarketplaceEntries) {
      const store = (e.order.nama_pengirim || 'Tanpa Store').trim();
      const prev = countMap.get(store) || { total: 0, pending: 0 };
      prev.total += 1;
      if (e.missingSjCount > 0) prev.pending += 1;
      countMap.set(store, prev);
    }
    return Array.from(countMap.entries())
      .map(([name, counts]) => ({ name, ...counts }))
      .sort((a, b) => b.pending - a.pending || a.name.localeCompare(b.name));
  }, [allMarketplaceEntries]);

  // Pending SJ summary counts
  const pendingSummary = useMemo(() => {
    let orderCount = 0;
    let itemCount = 0;
    let totalPcs = 0;
    for (const e of allMarketplaceEntries) {
      if (e.missingSjCount > 0) {
        orderCount++;
        for (const m of e.mktItems) {
          if (!m.validSj) {
            itemCount++;
            totalPcs += Math.max(1, Number(m.item.qty) || 1);
          }
        }
      }
    }
    return { orderCount, itemCount, totalPcs };
  }, [allMarketplaceEntries]);

  // Filtered rows for Table/Card view
  const filteredEntries = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return allMarketplaceEntries.filter((e) => {
      if (filterMode === 'need_sj_only' && e.missingSjCount === 0) return false;
      if (filterStore !== 'all' && (e.order.nama_pengirim || '').trim() !== filterStore) {
        return false;
      }
      if (q) {
        const o = e.order;
        const matchOrder =
          (o.no_pesanan || '').toLowerCase().includes(q) ||
          (o.no_transaksi_customer || '').toLowerCase().includes(q) ||
          (o.nama_pengirim || '').toLowerCase().includes(q) ||
          (o.nama_tujuan || '').toLowerCase().includes(q) ||
          e.existingSjList.some((s) => s.toLowerCase().includes(q));
        if (matchOrder) return true;
        return e.mktItems.some(
          (m) =>
            (m.item.sku || '').toLowerCase().includes(q) ||
            m.officialName.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allMarketplaceEntries, filterMode, filterStore, searchTerm]);

  // Count valid changed entries & conflict entries (equal to Store POS transaction)
  const { changedEntriesCount, conflictOrderNos } = useMemo(() => {
    let count = 0;
    const conflicts = new Set<string>();
    Object.entries(tableSjInputs).forEach(([orderNo, rawVal]) => {
      const trimmed = rawVal.trim();
      if (!trimmed) return;
      const entry = entryByOrderNo.get(orderNo);
      if (!entry) return;
      if (entry.storeTxLowerSet.has(trimmed.toLowerCase())) {
        conflicts.add(orderNo);
        return;
      }
      if (entry.primaryExistingSj.trim() !== trimmed || entry.missingSjCount > 0) {
        count++;
      }
    });
    return { changedEntriesCount: count, conflictOrderNos: conflicts };
  }, [tableSjInputs, entryByOrderNo]);

  if (!isOpen) return null;

  const isAllFilteredSelected =
    filteredEntries.length > 0 &&
    filteredEntries.every((e) => selectedOrderNos.has(e.order.no_pesanan));

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      setSelectedOrderNos(new Set());
    } else {
      setSelectedOrderNos(new Set(filteredEntries.map((e) => e.order.no_pesanan)));
    }
  };

  const handleToggleSelectRow = (orderNo: string) => {
    setSelectedOrderNos((prev) => {
      const next = new Set(prev);
      if (next.has(orderNo)) next.delete(orderNo);
      else next.add(orderNo);
      return next;
    });
  };

  const handleTableSjChange = (orderNo: string, value: string) => {
    setTableSjInputs((prev) => ({
      ...prev,
      [orderNo]: value,
    }));
  };

  // Apply 1 DealPOS SJ number to all checked orders (ideal when 1 Transfer Order covers multiple orders to the same Store)
  const handleApplyBatchSjToSelected = () => {
    const cleanSj = batchSjValue.trim();
    if (!cleanSj) {
      onShowToast('Masukkan No. SJ Delivery DealPOS terlebih dahulu.', 'warning');
      return;
    }
    if (selectedOrderNos.size === 0) {
      onShowToast('Pilih minimal 1 pesanan terlebih dahulu.', 'warning');
      return;
    }

    const nextInputs = { ...tableSjInputs };
    let applied = 0;
    let skippedConflict = 0;
    selectedOrderNos.forEach((orderNo) => {
      const entry = entryByOrderNo.get(orderNo);
      if (!entry) return;
      if (entry.storeTxLowerSet.has(cleanSj.toLowerCase())) {
        skippedConflict++;
        return;
      }
      nextInputs[orderNo] = cleanSj;
      applied++;
    });

    setTableSjInputs(nextInputs);
    setBatchSjValue('');
    if (skippedConflict > 0) {
      onShowToast(
        `No. SJ diterapkan ke ${applied} pesanan (${skippedConflict} dilewati karena sama dengan No. Transaksi Kasir Store).`,
        'warning'
      );
    } else {
      onShowToast(`No. SJ "${cleanSj}" diterapkan ke ${applied} pesanan terpilih!`, 'success');
    }
  };

  // Quick Paste sequential lines
  const handleApplyQuickPaste = () => {
    if (!quickPasteText.trim()) return;
    const lines = quickPasteText
      .split(/[\r\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      onShowToast('Tidak ada nomor SJ yang terdeteksi dari teks yang ditempel.', 'warning');
      return;
    }

    const nextInputs = { ...tableSjInputs };
    let filledCount = 0;
    filteredEntries.forEach((entry, idx) => {
      if (idx < lines.length) {
        nextInputs[entry.order.no_pesanan] = lines[idx];
        filledCount++;
      }
    });

    setTableSjInputs(nextInputs);
    setQuickPasteText('');
    setShowQuickPaste(false);
    onShowToast(`Berhasil memasukkan ${filledCount} No. SJ secara berurutan!`, 'success');
  };

  // Copy readable summary list of Marketplace products that need SJ (grouped by Store) for DealPOS Transfer Order creation
  const handleCopyProductListForDealpos = async () => {
    const targetEntries =
      selectedOrderNos.size > 0
        ? filteredEntries.filter((e) => selectedOrderNos.has(e.order.no_pesanan))
        : filteredEntries;

    if (targetEntries.length === 0) {
      onShowToast('Tidak ada daftar pesanan untuk disalin.', 'warning');
      return;
    }

    const byStore = new Map<string, MarketplaceOrderEntry[]>();
    for (const e of targetEntries) {
      const st = (e.order.nama_pengirim || 'Tanpa Store').trim();
      if (!byStore.has(st)) byStore.set(st, []);
      byStore.get(st)!.push(e);
    }

    const lines: string[] = [
      `DAFTAR PESANAN & PRODUK FULFILL MARKETPLACE BUTUH SJ DEALPOS`,
      `Tanggal: ${new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })} | Total: ${targetEntries.length} Pesanan`,
      `════════════════════════════════════`,
    ];

    for (const [storeName, storeEntries] of byStore.entries()) {
      const storePcs = storeEntries.reduce((s, e) => s + e.totalMktQty, 0);
      lines.push(`\n🏪 STORE: ${storeName} (${storeEntries.length} Pesanan / ${storePcs} pcs)`);
      storeEntries.forEach((e, idx) => {
        lines.push(`  ${idx + 1}. #${e.order.no_pesanan} — ${e.order.nama_tujuan || '-'}`);
        e.mktItems.forEach((m) => {
          const sjBadge = m.validSj ? ` [SJ: ${m.validSj}]` : ' [Belum Ada SJ]';
          lines.push(
            `     • [${m.item.sku || '-'}] ${m.officialName} (${m.officialSize}) x${Math.max(1, Number(m.item.qty) || 1)}${sjBadge}`
          );
        });
      });
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedSummary(true);
      onShowToast(
        `Daftar ${targetEntries.length} pesanan & produk Marketplace disalin ke clipboard!`,
        'success'
      );
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      onShowToast('Gagal menyalin ke clipboard browser.', 'error');
    }
  };

  // Save direct table inputs
  const handleSaveTableSj = async () => {
    if (conflictOrderNos.size > 0) {
      onShowToast(
        `Terdapat ${conflictOrderNos.size} baris dengan No. SJ yang sama persis dengan No. Transaksi Kasir Store. Harap perbaiki terlebih dahulu.`,
        'error'
      );
      return;
    }

    const updateList: BulkSjDealposUpdateItem[] = [];
    const updatedEntries: Array<{ order: ManualShipmentOrder; newSj: string }> = [];

    Object.entries(tableSjInputs).forEach(([orderNo, rawVal]) => {
      const cleanSj = rawVal.trim();
      if (!cleanSj) return;
      const entry = entryByOrderNo.get(orderNo);
      if (!entry) return;
      if (entry.primaryExistingSj.trim() !== cleanSj || entry.missingSjCount > 0) {
        updateList.push({
          order: entry.order,
          no_sj_dealpos: cleanSj,
        });
        updatedEntries.push({ order: entry.order, newSj: cleanSj });
      }
    });

    if (updateList.length === 0) {
      onShowToast('Tidak ada perubahan No. SJ DealPOS yang perlu disimpan.', 'info');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await bulkUpdateOrdersSjDealpos(updateList, operatorName);
      if (result.successCount > 0) {
        onShowToast(
          `Berhasil menyimpan No. SJ DealPOS untuk ${result.successCount} pesanan!`,
          'success'
        );
        setTableSjInputs({});
        onSuccess(result.successCount, updatedEntries);
        onClose();
      } else {
        onShowToast(`Gagal memperbarui SJ: ${result.errors.join(', ')}`, 'error');
      }
    } catch (err: any) {
      onShowToast(`Terjadi kesalahan: ${err?.message || err}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // -------------------------------------------------------------
  // CSV TEMPLATE EXPORT
  // -------------------------------------------------------------
  const handleDownloadTemplate = () => {
    const targetEntries =
      filterMode === 'need_sj_only'
        ? filteredEntries
        : allMarketplaceEntries.filter((e) => e.missingSjCount > 0);
    const exportList =
      targetEntries.length > 0 ? targetEntries : allMarketplaceEntries;

    if (exportList.length === 0) {
      onShowToast('Tidak ada pesanan dengan produk fulfillment Marketplace untuk diekspor.', 'warning');
      return;
    }

    const headers = [
      'No Pesanan (Jangan Diubah)',
      'Tanggal',
      'Store Pengirim',
      'PIC Store',
      'Nama Penerima',
      'Daftar Produk Fulfill Marketplace (SKU | Nama | Size | Qty)',
      'Total Qty Marketplace',
      'No Transaksi Kasir Store (Ref)',
      'No SJ Delivery DealPOS (Wajib Diisi Admin)',
      'Status SJ Saat Ini',
    ];

    const escapeCsv = (val: string | number | undefined | null) => {
      if (val === undefined || val === null) return '""';
      return `"${String(val).replace(/"/g, '""')}"`;
    };

    const rows = exportList.map((e) => {
      const o = e.order;
      const productsSummary = e.mktItems
        .map(
          (m) =>
            `[${m.item.sku || '-'}] ${m.officialName} (${m.officialSize}) x${Math.max(1, Number(m.item.qty) || 1)}`
        )
        .join('; ');
      const txRef = Array.isArray(o.no_transaksi_pengirim)
        ? o.no_transaksi_pengirim.join('; ')
        : o.no_transaksi_pengirim || '';

      return [
        escapeCsv(o.no_pesanan),
        escapeCsv(o.created_at ? new Date(o.created_at).toLocaleDateString('id-ID') : ''),
        escapeCsv(o.nama_pengirim || ''),
        escapeCsv(
          getValidPersonPicName(
            o.pic_store || o.alteration_repair_data?.pic_pemohon,
            o.nama_pengirim
          )
        ),
        escapeCsv(o.nama_tujuan || ''),
        escapeCsv(productsSummary),
        escapeCsv(e.totalMktQty),
        escapeCsv(txRef),
        escapeCsv(e.primaryExistingSj),
        escapeCsv(
          e.missingSjCount === 0
            ? 'SUDAH ADA SJ'
            : e.existingSjList.length > 0
            ? 'SEBAGIAN'
            : 'BELUM ADA SJ'
        ),
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute(
      'download',
      `Template_Input_SJ_Marketplace_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    onShowToast(`Template CSV SJ berhasil diunduh (${exportList.length} pesanan)!`, 'success');
  };

  // -------------------------------------------------------------
  // CSV PARSER & UPLOAD
  // -------------------------------------------------------------
  const parseCsvText = (text: string) => {
    const lines = text
      .split(/\r\n|\n|\r/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length < 2) {
      setCsvParseErrors(['File CSV kosong atau hanya berisi baris judul.']);
      setParsedRows([]);
      return;
    }

    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const delimiter = semicolonCount > commaCount ? ';' : ',';

    const rawHeaders = splitCsvLine(firstLine, delimiter).map((h) =>
      h.toLowerCase().trim().replace(/^[\uFEFF"']|["']$/g, '')
    );

    let noPesananIdx = rawHeaders.findIndex(
      (h) =>
        h.includes('no pesanan') ||
        h.includes('no_pesanan') ||
        h.includes('nopesanan') ||
        h === 'id' ||
        h === 'order id'
    );
    let noSjIdx = rawHeaders.findIndex(
      (h) =>
        h.includes('no sj') ||
        h.includes('no_sj') ||
        h.includes('surat jalan') ||
        h.includes('dealpos') && !h.includes('transaksi')
    );

    if (noPesananIdx === -1) noPesananIdx = 0;
    if (noSjIdx === -1) {
      noSjIdx = rawHeaders.length >= 9 ? 8 : rawHeaders.length - 1;
    }

    const entryMapUpper = new Map<string, MarketplaceOrderEntry>();
    for (const e of allMarketplaceEntries) {
      if (e.order.no_pesanan) {
        entryMapUpper.set(e.order.no_pesanan.trim().toUpperCase(), e);
      }
      if (e.order.no_transaksi_customer) {
        const custKey = e.order.no_transaksi_customer.trim().toUpperCase();
        if (!entryMapUpper.has(custKey)) entryMapUpper.set(custKey, e);
      }
    }

    const parsed: CsvParsedSjRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = splitCsvLine(lines[i], delimiter).map((c) =>
        c.trim().replace(/^["']|["']$/g, '')
      );
      const rawNoPesanan = (cols[noPesananIdx] || '').trim();
      const rawSj = (cols[noSjIdx] || '').trim();
      const cleanNoPesanan = rawNoPesanan.toUpperCase();

      if (!cleanNoPesanan) continue;

      const matched = entryMapUpper.get(cleanNoPesanan);
      let statusText = '';
      let isValid = false;

      if (!matched) {
        statusText = 'Order ID tidak ditemukan / tidak punya item Marketplace';
      } else if (!rawSj) {
        statusText = 'No. SJ kosong (Skip)';
      } else if (matched.storeTxLowerSet.has(rawSj.toLowerCase())) {
        statusText = 'Sama dengan No. Transaksi Kasir Store (Ditolak)';
      } else if (
        matched.primaryExistingSj.trim().toUpperCase() === rawSj.toUpperCase() &&
        matched.missingSjCount === 0
      ) {
        statusText = 'Sama dengan SJ saat ini (Skip)';
      } else {
        statusText = 'Siap Diperbarui';
        isValid = true;
      }

      parsed.push({
        rawOrderRef: rawNoPesanan,
        orderId: matched ? matched.order.no_pesanan : rawNoPesanan,
        matchedEntry: matched,
        oldSj: matched?.primaryExistingSj || '-',
        newSj: rawSj,
        statusText,
        isValid,
      });
    }

    setParsedRows(parsed);
    setCsvParseErrors([]);
  };

  const handleFileUpload = (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      onShowToast('Harap pilih file berformat .CSV', 'error');
      return;
    }
    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      if (content) parseCsvText(content);
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleApplyCsvUpdate = async () => {
    const validRows = parsedRows.filter((r) => r.isValid && r.matchedEntry && r.newSj);
    if (validRows.length === 0) {
      onShowToast('Tidak ada data No. SJ valid yang siap diperbarui.', 'warning');
      return;
    }

    const updateList: BulkSjDealposUpdateItem[] = validRows.map((r) => ({
      order: r.matchedEntry!.order,
      no_sj_dealpos: r.newSj,
    }));
    const updatedEntries = validRows.map((r) => ({
      order: r.matchedEntry!.order,
      newSj: r.newSj,
    }));

    setIsSubmitting(true);
    try {
      const result = await bulkUpdateOrdersSjDealpos(updateList, operatorName);
      if (result.successCount > 0) {
        onShowToast(
          `Berhasil memperbarui ${result.successCount} No. SJ DealPOS via import CSV!`,
          'success'
        );
        onSuccess(result.successCount, updatedEntries);
        onClose();
      } else {
        onShowToast(`Gagal update SJ: ${result.errors.join(', ')}`, 'error');
      }
    } catch (err: any) {
      onShowToast(`Terjadi kesalahan: ${err?.message || err}`, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const validCsvCount = parsedRows.filter((r) => r.isValid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-5 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/80 dark:bg-slate-800/60">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-950/80 text-indigo-600 dark:text-indigo-400 shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  Input No. SJ DealPOS Massal (Marketplace)
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60 whitespace-nowrap">
                  {pendingSummary.orderCount} Pesanan • {pendingSummary.totalPcs} pcs Belum SJ
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-1">
                Daftar pesanan &amp; produk fulfillment Marketplace yang perlu dibuatkan SJ Delivery (MKT ➔ Store)
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            aria-label="Tutup modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between px-4 sm:px-5 pt-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex-wrap gap-2">
          <div className="flex gap-1 sm:gap-2 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveTab('table')}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'table'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>Daftar &amp; Input Tabel</span>
              {changedEntriesCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-600 text-white font-mono">
                  {changedEntriesCount}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('csv')}
              className={`px-3 sm:px-4 py-2 text-xs sm:text-sm font-bold border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'csv'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                  : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Import CSV &amp; Template</span>
            </button>
          </div>

          <div className="hidden md:flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 pb-2">
            <Package className="w-3.5 h-3.5 text-indigo-500" />
            <span>Hanya menampilkan item aktif fulfillment Marketplace / Stok Gudang</span>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-5 bg-slate-50/50 dark:bg-slate-900/50 space-y-3">
          {activeTab === 'table' && (
            <>
              {/* Toolbar */}
              <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Segmented Filter */}
                  <div className="inline-flex p-0.5 bg-slate-200/70 dark:bg-slate-800 rounded-lg text-xs font-bold">
                    <button
                      type="button"
                      onClick={() => setFilterMode('need_sj_only')}
                      className={`px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                        filterMode === 'need_sj_only'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Belum Ada SJ ({pendingSummary.orderCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterMode('all_mkt')}
                      className={`px-2.5 py-1.5 rounded-md transition-colors cursor-pointer ${
                        filterMode === 'all_mkt'
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                      }`}
                    >
                      Semua MKT ({allMarketplaceEntries.length})
                    </button>
                  </div>

                  {/* Store Filter */}
                  <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg px-2 h-8">
                    <Store className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <select
                      value={filterStore}
                      onChange={(e) => {
                        setFilterStore(e.target.value);
                        setSelectedOrderNos(new Set());
                      }}
                      className="text-xs bg-transparent text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer max-w-[170px]"
                    >
                      <option value="all">Semua Store ({storeFilterOptions.length})</option>
                      {storeFilterOptions.map((st) => (
                        <option key={st.name} value={st.name}>
                          {st.name} ({st.pending} butuh SJ)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Search */}
                  <div className="relative flex-1 min-w-[180px] sm:max-w-[260px]">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      placeholder="Cari #order, SKU, produk, store..."
                      className="w-full h-8 pl-8 pr-3 text-xs bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 dark:text-slate-100"
                    />
                  </div>
                </div>

                {/* Utility Buttons (Secondary Outline) */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleCopyProductListForDealpos}
                    className="h-8 px-2.5 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Salin daftar pesanan & produk Marketplace untuk acuan buat SJ di DealPOS"
                  >
                    {copiedSummary ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                    )}
                    <span>
                      {selectedOrderNos.size > 0
                        ? `Salin Daftar (${selectedOrderNos.size})`
                        : 'Salin Daftar Produk'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowQuickPaste(!showQuickPaste)}
                    className="h-8 px-2.5 text-xs font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                    <span>Tempel SJ Berurutan</span>
                  </button>
                </div>
              </div>

              {/* Contextual Batch Apply Bar (when rows are selected) */}
              {selectedOrderNos.size > 0 && (
                <div className="p-3 bg-indigo-50/80 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/70 rounded-xl flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 animate-in fade-in duration-150">
                  <div className="flex items-center gap-2 text-xs font-bold text-indigo-900 dark:text-indigo-200 shrink-0">
                    <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <span>{selectedOrderNos.size} pesanan dipilih:</span>
                  </div>
                  <input
                    type="text"
                    value={batchSjValue}
                    onChange={(e) => setBatchSjValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleApplyBatchSjToSelected();
                      }
                    }}
                    placeholder="Ketik 1 No. SJ DealPOS (Cth: Transfer Order #26.11.00195)..."
                    className="flex-1 h-8 px-2.5 font-mono text-xs bg-white dark:bg-slate-900 border border-indigo-300 dark:border-indigo-700 rounded-lg text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                  />
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleApplyBatchSjToSelected}
                      className="h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Terapkan ke {selectedOrderNos.size} Pesanan
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedOrderNos(new Set())}
                      className="h-8 px-2.5 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 cursor-pointer"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}

              {/* Quick Paste Collapse Box */}
              {showQuickPaste && (
                <div className="p-3 bg-white dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl space-y-2 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
                      Tempel Daftar No. SJ (1 Baris = 1 Pesanan Sesuai Urutan Tabel)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowQuickPaste(false)}
                      className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      Tutup
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={quickPasteText}
                    onChange={(e) => setQuickPasteText(e.target.value)}
                    placeholder="Contoh:&#10;Transfer Order #26.11.00195&#10;Transfer Order #26.11.00196"
                    className="w-full text-xs font-mono p-2 bg-slate-50 dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900 dark:text-white"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleApplyQuickPaste}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer"
                    >
                      Terapkan ke Baris Tabel
                    </button>
                  </div>
                </div>
              )}

              {/* Desktop Table View (>= 768px) */}
              <div className="hidden md:block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs">
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="min-w-full text-left text-xs">
                    <thead className="bg-slate-100/90 dark:bg-slate-800 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300">
                      <tr>
                        <th className="py-2.5 px-3 w-9 text-center">
                          <input
                            type="checkbox"
                            checked={isAllFilteredSelected}
                            onChange={handleToggleSelectAll}
                            className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            aria-label="Pilih semua pesanan"
                          />
                        </th>
                        <th className="py-2.5 px-2 w-8 text-center">#</th>
                        <th className="py-2.5 px-3 w-48">No. Pesanan &amp; Store</th>
                        <th className="py-2.5 px-3">Daftar Produk Fulfill Marketplace</th>
                        <th className="py-2.5 px-3 w-64">
                          Input No. SJ DealPOS (MKT ➔ Store)
                        </th>
                        <th className="py-2.5 px-3 w-28 text-center">Status SJ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                      {filteredEntries.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-slate-400">
                            {filterMode === 'need_sj_only'
                              ? 'Semua pesanan dengan produk Marketplace sudah memiliki No. SJ DealPOS.'
                              : 'Tidak ada pesanan fulfillment Marketplace yang sesuai filter.'}
                          </td>
                        </tr>
                      ) : (
                        filteredEntries.map((entry, idx) => {
                          const { order } = entry;
                          const orderNo = order.no_pesanan;
                          const currentVal =
                            tableSjInputs[orderNo] !== undefined
                              ? tableSjInputs[orderNo]
                              : entry.primaryExistingSj;
                          const isConflict = conflictOrderNos.has(orderNo);
                          const isModified =
                            !isConflict &&
                            currentVal.trim().length > 0 &&
                            (entry.primaryExistingSj.trim() !== currentVal.trim() ||
                              entry.missingSjCount > 0);
                          const hasAlter =
                            (order.items || []).some(isRealAlterItem) ||
                            isStandaloneArOrder(order);
                          const isSelected = selectedOrderNos.has(orderNo);
                          const txRef = Array.isArray(order.no_transaksi_pengirim)
                            ? order.no_transaksi_pengirim.join(', ')
                            : order.no_transaksi_pengirim || '';

                          return (
                            <tr
                              key={orderNo || idx}
                              className={`align-top transition-colors ${
                                isConflict
                                  ? 'bg-rose-50/70 dark:bg-rose-950/30'
                                  : isModified
                                  ? 'bg-indigo-50/50 dark:bg-indigo-950/30'
                                  : isSelected
                                  ? 'bg-slate-50 dark:bg-slate-800/60'
                                  : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleSelectRow(orderNo)}
                                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500 cursor-pointer mt-0.5"
                                />
                              </td>

                              <td className="py-2.5 px-2 text-center text-slate-400 font-mono">
                                {idx + 1}
                              </td>

                              <td className="py-2.5 px-3 space-y-0.5">
                                <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                  #{orderNo}
                                </div>
                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                  {order.nama_pengirim || '-'}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                  Cust: {order.nama_tujuan || '-'}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {order.created_at
                                    ? new Date(order.created_at).toLocaleDateString('id-ID')
                                    : '-'}
                                  {txRef ? ` • POS: ${txRef}` : ''}
                                </div>
                                {hasAlter && (
                                  <span className="inline-flex items-center gap-1 mt-0.5 px-1.5 py-0.2 rounded text-[9px] font-bold bg-rose-100 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                                    <Scissors className="w-2.5 h-2.5" />
                                    {isStandaloneArOrder(order) ? 'Alter & Repair' : 'Ada Alter'}
                                  </span>
                                )}
                              </td>

                              <td className="py-2.5 px-3">
                                <div className="space-y-1.5">
                                  {entry.mktItems.map((m, mIdx) => (
                                    <div
                                      key={m.item.id || mIdx}
                                      className="flex items-start justify-between gap-2 text-[11px] bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/70 rounded-lg px-2 py-1"
                                    >
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <span className="font-mono font-bold text-slate-700 dark:text-slate-200">
                                            {m.item.sku || '-'}
                                          </span>
                                          <span className="font-semibold text-slate-800 dark:text-slate-100">
                                            {m.officialName}
                                          </span>
                                          {m.officialSize && m.officialSize !== '-' && (
                                            <span className="px-1 py-0.2 rounded bg-slate-200/80 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-bold">
                                              {m.officialSize}
                                            </span>
                                          )}
                                        </div>
                                        {m.validSj && (
                                          <div className="text-[10px] font-mono text-emerald-700 dark:text-emerald-400 mt-0.5">
                                            SJ: {m.validSj}
                                          </div>
                                        )}
                                      </div>
                                      <span className="font-mono font-bold text-indigo-700 dark:text-indigo-300 shrink-0">
                                        x{Math.max(1, Number(m.item.qty) || 1)}
                                      </span>
                                    </div>
                                  ))}
                                  {entry.otherActiveItemsCount > 0 && (
                                    <div className="text-[10px] text-slate-400 italic">
                                      +{entry.otherActiveItemsCount} item fulfill Store (tidak butuh SJ Marketplace)
                                    </div>
                                  )}
                                </div>
                              </td>

                              <td className="py-2.5 px-3">
                                <input
                                  type="text"
                                  value={currentVal}
                                  onChange={(e) => handleTableSjChange(orderNo, e.target.value)}
                                  placeholder="Cth: Transfer Order #26.11.00195"
                                  className={`w-full font-mono text-xs px-2.5 py-1.5 rounded-lg border focus:outline-none focus:ring-1 ${
                                    isConflict
                                      ? 'border-rose-500 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 ring-1 ring-rose-500'
                                      : isModified
                                      ? 'border-indigo-500 bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 font-bold ring-1 ring-indigo-500'
                                      : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                                  }`}
                                />
                                {isConflict && (
                                  <p className="mt-1 text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                                    Tidak boleh sama dengan No. Transaksi Kasir Store!
                                  </p>
                                )}
                              </td>

                              <td className="py-2.5 px-3 text-center">
                                {entry.missingSjCount === 0 ? (
                                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                                    <CheckCircle2 className="w-3 h-3" />
                                    Ada SJ
                                  </span>
                                ) : entry.existingSjList.length > 0 ? (
                                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300">
                                    Sebagian
                                  </span>
                                ) : (
                                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300">
                                    Belum SJ
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Mobile Native Card List (< 768px) */}
              <div className="md:hidden space-y-2.5">
                {filteredEntries.length > 0 && (
                  <div className="flex items-center justify-between px-1">
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isAllFilteredSelected}
                        onChange={handleToggleSelectAll}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600"
                      />
                      <span>Pilih Semua ({filteredEntries.length})</span>
                    </label>
                    <span className="text-[11px] text-slate-400 font-mono">
                      {filteredEntries.reduce((s, e) => s + e.totalMktQty, 0)} pcs MKT
                    </span>
                  </div>
                )}

                {filteredEntries.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800">
                    {filterMode === 'need_sj_only'
                      ? 'Semua pesanan Marketplace sudah memiliki No. SJ DealPOS.'
                      : 'Tidak ada pesanan yang sesuai filter.'}
                  </div>
                ) : (
                  filteredEntries.map((entry) => {
                    const { order } = entry;
                    const orderNo = order.no_pesanan;
                    const currentVal =
                      tableSjInputs[orderNo] !== undefined
                        ? tableSjInputs[orderNo]
                        : entry.primaryExistingSj;
                    const isConflict = conflictOrderNos.has(orderNo);
                    const isModified =
                      !isConflict &&
                      currentVal.trim().length > 0 &&
                      (entry.primaryExistingSj.trim() !== currentVal.trim() ||
                        entry.missingSjCount > 0);
                    const isSelected = selectedOrderNos.has(orderNo);

                    return (
                      <div
                        key={orderNo}
                        className={`p-3 rounded-xl border space-y-2.5 transition-colors ${
                          isConflict
                            ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-300 dark:border-rose-800'
                            : isModified
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700'
                            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <label className="flex items-start gap-2.5 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectRow(orderNo)}
                              className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-indigo-600 mt-0.5 shrink-0"
                            />
                            <div className="min-w-0">
                              <div className="font-mono text-xs font-bold text-indigo-600 dark:text-indigo-400">
                                #{orderNo}
                              </div>
                              <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                                {order.nama_pengirim || '-'} • {order.nama_tujuan || '-'}
                              </div>
                            </div>
                          </label>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                              entry.missingSjCount === 0
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                            }`}
                          >
                            {entry.missingSjCount === 0 ? 'Ada SJ' : 'Belum SJ'}
                          </span>
                        </div>

                        {/* Marketplace Products List */}
                        <div className="space-y-1">
                          {entry.mktItems.map((m, mIdx) => (
                            <div
                              key={m.item.id || mIdx}
                              className="flex items-center justify-between gap-2 text-[11px] bg-slate-50 dark:bg-slate-800/70 rounded-lg px-2.5 py-1.5 border border-slate-200/70 dark:border-slate-700/60"
                            >
                              <div className="min-w-0">
                                <span className="font-mono font-bold text-slate-700 dark:text-slate-200 mr-1.5">
                                  {m.item.sku || '-'}
                                </span>
                                <span className="text-slate-800 dark:text-slate-100 font-medium">
                                  {m.officialName}
                                </span>
                                {m.officialSize && m.officialSize !== '-' && (
                                  <span className="ml-1 text-[10px] text-slate-500 font-bold">
                                    ({m.officialSize})
                                  </span>
                                )}
                              </div>
                              <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400 shrink-0">
                                x{Math.max(1, Number(m.item.qty) || 1)}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Input SJ */}
                        <div>
                          <label className="block text-[10px] font-semibold uppercase text-slate-500 mb-1">
                            No. SJ Delivery DealPOS (MKT ➔ Store)
                          </label>
                          <input
                            type="text"
                            value={currentVal}
                            onChange={(e) => handleTableSjChange(orderNo, e.target.value)}
                            placeholder="Cth: Transfer Order #26.11.00195"
                            className={`w-full h-10 font-mono text-xs px-3 rounded-lg border focus:outline-none focus:ring-1 ${
                              isConflict
                                ? 'border-rose-500 text-rose-700 dark:text-rose-300'
                                : 'border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white'
                            }`}
                          />
                          {isConflict && (
                            <p className="mt-1 text-[10px] text-rose-600 font-semibold">
                              Tidak boleh sama dengan No. Transaksi Kasir Store!
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* TAB 2: CSV IMPORT & TEMPLATE */}
          {activeTab === 'csv' && (
            <div className="space-y-4">
              {/* Step 1: Download Template */}
              <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold">
                      1
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      Unduh Template Pesanan &amp; Produk Marketplace Belum Ada SJ (CSV)
                    </h4>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 pl-7 max-w-xl">
                    Mengekspor seluruh daftar nomor pesanan beserta rincian produk fulfillment Marketplace (SKU, Nama, Size, Qty) yang perlu dibuatkan SJ di DealPOS. Isi kolom <strong>No SJ Delivery DealPOS</strong> di Excel, simpan, lalu unggah pada Langkah 2.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="px-4 py-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-bold flex items-center gap-2 transition-colors cursor-pointer whitespace-nowrap self-stretch sm:self-auto justify-center"
                >
                  <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Unduh Template CSV ({pendingSummary.orderCount} Pesanan)</span>
                </button>
              </div>

              {/* Step 2: Upload CSV */}
              <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs space-y-3">
                <div className="flex items-center gap-2">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold">
                    2
                  </span>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    Unggah File CSV yang Telah Diisi No. SJ DealPOS
                  </h4>
                </div>

                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      handleFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                  className={`border-2 border-dashed rounded-xl p-6 text-center transition-colors ${
                    isDragging
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                      : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/50 dark:bg-slate-900/30'
                  }`}
                >
                  <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Tarik dan lepaskan file CSV Anda di sini, atau
                  </p>
                  <label className="mt-2 inline-block px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg cursor-pointer shadow-xs transition-colors">
                    <span>Pilih File CSV</span>
                    <input
                      type="file"
                      accept=".csv"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          handleFileUpload(e.target.files[0]);
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  {csvFileName && (
                    <div className="mt-2 text-xs font-mono text-indigo-600 dark:text-indigo-400 font-bold flex items-center justify-center gap-1.5">
                      <FileSpreadsheet className="w-3.5 h-3.5" />
                      <span>{csvFileName}</span>
                    </div>
                  )}
                </div>

                {csvParseErrors.length > 0 && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <div>
                      {csvParseErrors.map((err, i) => (
                        <div key={i}>{err}</div>
                      ))}
                    </div>
                  </div>
                )}

                {parsedRows.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                      <span className="font-bold text-slate-700 dark:text-slate-300">
                        Pratinjau Hasil Sinkronisasi ({parsedRows.length} baris)
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 font-bold text-[11px]">
                          ✓ {validCsvCount} Siap Update
                        </span>
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-semibold text-[11px]">
                          {parsedRows.length - validCsvCount} Skip / Invalid
                        </span>
                      </div>
                    </div>

                    <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden max-h-[38vh] overflow-y-auto bg-white dark:bg-slate-900">
                      <table className="min-w-full text-left text-xs">
                        <thead className="bg-slate-100/90 dark:bg-slate-800 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700 font-bold text-slate-700 dark:text-slate-300">
                          <tr>
                            <th className="py-2 px-3">No. Pesanan</th>
                            <th className="py-2 px-3">Store &amp; Produk Marketplace</th>
                            <th className="py-2 px-3">SJ Semula</th>
                            <th className="py-2 px-3">No. SJ Baru</th>
                            <th className="py-2 px-3 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200/70 dark:divide-slate-800">
                          {parsedRows.map((row, rIdx) => (
                            <tr
                              key={rIdx}
                              className={
                                row.isValid
                                  ? 'bg-emerald-50/40 dark:bg-emerald-950/20'
                                  : 'bg-slate-50/40 dark:bg-slate-900/40 opacity-75'
                              }
                            >
                              <td className="py-2 px-3 font-mono font-bold text-slate-800 dark:text-slate-200">
                                #{row.orderId}
                              </td>
                              <td className="py-2 px-3">
                                {row.matchedEntry ? (
                                  <div>
                                    <div className="font-semibold text-slate-800 dark:text-slate-200">
                                      {row.matchedEntry.order.nama_pengirim} •{' '}
                                      {row.matchedEntry.order.nama_tujuan}
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      {row.matchedEntry.mktItems
                                        .map((m) => `${m.item.sku} (x${m.item.qty})`)
                                        .join(', ')}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-slate-400">-</span>
                                )}
                              </td>
                              <td className="py-2 px-3 font-mono text-slate-500">{row.oldSj}</td>
                              <td className="py-2 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-300">
                                {row.newSj || '-'}
                              </td>
                              <td className="py-2 px-3 text-center">
                                <span
                                  className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    row.isValid
                                      ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300'
                                      : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                  }`}
                                >
                                  {row.statusText}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {activeTab === 'table' ? (
              changedEntriesCount > 0 ? (
                <span>
                  <strong className="text-indigo-600 dark:text-indigo-400">
                    {changedEntriesCount} pesanan
                  </strong>{' '}
                  siap disimpan No. SJ DealPOS-nya
                  {conflictOrderNos.size > 0 && (
                    <span className="text-rose-600 font-bold ml-1.5">
                      ({conflictOrderNos.size} konflik No. POS)
                    </span>
                  )}
                </span>
              ) : (
                <span>Isi No. SJ pada tabel atau pilih beberapa pesanan untuk menerapkan 1 SJ sekaligus.</span>
              )
            ) : (
              <span>
                {validCsvCount > 0 ? (
                  <strong className="text-indigo-600 dark:text-indigo-400">
                    {validCsvCount} pesanan valid siap diperbarui dari CSV
                  </strong>
                ) : (
                  'Unduh template CSV, isi kolom No SJ Delivery DealPOS, lalu unggah kembali.'
                )}
              </span>
            )}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="h-9 px-4 rounded-xl text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Tutup
            </button>

            {activeTab === 'table' ? (
              <button
                type="button"
                onClick={handleSaveTableSj}
                disabled={isSubmitting || changedEntriesCount === 0 || conflictOrderNos.size > 0}
                className="h-9 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>
                  {isSubmitting
                    ? 'Menyimpan...'
                    : `Simpan ${changedEntriesCount > 0 ? `${changedEntriesCount} ` : ''}No. SJ DealPOS`}
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleApplyCsvUpdate}
                disabled={isSubmitting || validCsvCount === 0}
                className="h-9 px-4 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>
                  {isSubmitting
                    ? 'Memperbarui...'
                    : `Terapkan ${validCsvCount > 0 ? `${validCsvCount} ` : ''}No. SJ dari CSV`}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
