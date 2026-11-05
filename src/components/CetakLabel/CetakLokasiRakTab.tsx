import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  Plus,
  Trash2,
  MapPin,
  Sparkles,
  QrCode,
  Layers,
  Settings2,
  Upload,
  Copy,
  RotateCw,
  Eye,
  CheckCircle2,
  Search,
  Sliders,
  ChevronRight,
  Info,
  Zap,
  Building2,
  PackageCheck,
  Wrench,
  X,
  Type,
  Maximize2,
  Grid,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  LocationLabelItem,
  LocationLabelSettings,
  LocationPrintMedia,
  DEFAULT_LOCATION_SETTINGS,
  WMS_QUICK_PREFIXES,
} from './types';

const STORAGE_QUEUE_KEY = 'wms_prefix_qr_queue_v2';
const STORAGE_SETTINGS_KEY = 'wms_prefix_qr_settings_v2';

const DEFAULT_SAMPLE_ITEMS: LocationLabelItem[] = [
  {
    id: 'sample-1',
    locCode: 'A001',
    qrPayload: '#LOK A001',
    zoneDesc: 'WAREHOUSE',
    tagBadge: 'LOKASI',
    copies: 1,
    selected: true,
  },
  {
    id: 'sample-2',
    locCode: 'SHOPEE',
    qrPayload: '#LOK SHOPEE',
    zoneDesc: 'BLOK F',
    tagBadge: 'LOKASI',
    copies: 1,
    selected: true,
  },
  {
    id: 'sample-3',
    locCode: 'DF001',
    qrPayload: '#LOK DF001',
    zoneDesc: 'PERBAIKAN',
    tagBadge: 'LOKASI',
    copies: 1,
    selected: true,
  },
  {
    id: 'sample-4',
    locCode: '#IN',
    qrPayload: '#IN',
    zoneDesc: 'SCAN MASUK & RESTOCK',
    tagBadge: 'ACTION WMS',
    copies: 1,
    selected: true,
  },
];

interface CetakLokasiRakTabProps {
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const CetakLokasiRakTab: React.FC<CetakLokasiRakTabProps> = ({ onShowToast }) => {
  const notify = useCallback(
    (msg: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
      if (onShowToast) onShowToast(msg, type);
    },
    [onShowToast]
  );

  // Main Sub-Tab Switcher inside QR Prefix: 'prefix_lokasi' | 'prefix_action' | 'custom_qr'
  const [subTab, setSubTab] = useState<'prefix_lokasi' | 'prefix_action' | 'custom_qr'>('prefix_lokasi');

  // Input Mode inside Tab Prefix Lokasi: 'preset' | 'range' | 'manual'
  const [lokasiInputMode, setLokasiInputMode] = useState<'preset' | 'range' | 'manual' | 'import'>('preset');

  // Print Settings State
  const [settings, setSettings] = useState<LocationLabelSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (saved) return { ...DEFAULT_LOCATION_SETTINGS, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_LOCATION_SETTINGS;
  });

  const updateSettings = useCallback((patch: Partial<LocationLabelSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Queue of Locations & Prefix QR to print
  const [queue, setQueue] = useState<LocationLabelItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_QUEUE_KEY);
      if (saved !== null) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return DEFAULT_SAMPLE_ITEMS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify(queue));
    } catch {}
  }, [queue]);

  // QR Data URL cache
  const [qrCache, setQrCache] = useState<Record<string, string>>({});

  // Generate QR Data URL
  const generateQr = useCallback(async (text: string): Promise<string> => {
    try {
      return await QRCode.toDataURL(String(text || ' '), {
        errorCorrectionLevel: 'H',
        margin: 1,
        scale: 4,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (err) {
      console.error('Error generating QR:', err);
      return '';
    }
  }, []);

  // Sync QR Cache for queue items
  useEffect(() => {
    const unCached = queue.filter((i) => i && i.qrPayload && !qrCache[String(i.qrPayload)]);
    if (unCached.length === 0) return;

    let isMounted = true;
    (async () => {
      const newEntries: Record<string, string> = {};
      for (const item of unCached) {
        const payloadStr = String(item.qrPayload || '');
        if (payloadStr && !newEntries[payloadStr] && !qrCache[payloadStr]) {
          const url = await generateQr(payloadStr);
          newEntries[payloadStr] = url || 'FAILED';
        }
      }
      if (isMounted && Object.keys(newEntries).length > 0) {
        setQrCache((prev) => ({ ...prev, ...newEntries }));
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [queue, generateQr]);

  // ==========================================
  // FORM STATES FOR SUB-TAB 1: PREFIX LOKASI
  // ==========================================
  // Range Generator State
  const [rangePrefix, setRangePrefix] = useState('A');
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(50);
  const [rangePadDigits, setRangePadDigits] = useState<number>(3);
  const [rangeZoneDesc, setRangeZoneDesc] = useState('WAREHOUSE');
  const [rangeCopies, setRangeCopies] = useState<number>(1);

  // Manual Single Custom Location
  const [manualLocCode, setManualLocCode] = useState('');
  const [manualZoneDesc, setManualZoneDesc] = useState('WAREHOUSE');
  const [manualTagBadge, setManualTagBadge] = useState('LOKASI');
  const [manualCopies, setManualCopies] = useState<number>(1);

  // Import / Paste Text State
  const [pasteText, setPasteText] = useState('');

  // ==========================================
  // FORM STATES FOR SUB-TAB 3: TAB CUSTOM
  // ==========================================
  const [customTitle, setCustomTitle] = useState('');
  const [customPayload, setCustomPayload] = useState('');
  const [customSubtitle, setCustomSubtitle] = useState('');
  const [customBadge, setCustomBadge] = useState('CUSTOM');
  const [customCopies, setCustomCopies] = useState<number>(1);

  // Settings Panel Toggle
  const [showAdvanceSettings, setShowAdvanceSettings] = useState(false);

  // Queue Search & Preview Index
  const [searchQuery, setSearchQuery] = useState('');
  const [previewIndex, setPreviewIndex] = useState<number>(0);
  const [isPrinting, setIsPrinting] = useState(false);

  const selectedItems = useMemo(() => queue.filter((i) => i.selected !== false), [queue]);
  const totalSelectedCopies = useMemo(
    () => selectedItems.reduce((acc, i) => acc + (i.copies || 1), 0),
    [selectedItems]
  );
  const totalAllCopies = useMemo(() => queue.reduce((acc, i) => acc + (i.copies || 1), 0), [queue]);

  const filteredQueue = useMemo(() => {
    if (!searchQuery.trim()) return queue;
    const q = searchQuery.toLowerCase().trim();
    return queue.filter(
      (item) =>
        String(item.locCode || '').toLowerCase().includes(q) ||
        String(item.qrPayload || '').toLowerCase().includes(q) ||
        (item.zoneDesc && String(item.zoneDesc).toLowerCase().includes(q)) ||
        (item.tagBadge && String(item.tagBadge).toLowerCase().includes(q))
    );
  }, [queue, searchQuery]);

  const currentPreviewItem = selectedItems[previewIndex] || selectedItems[0] || queue[0] || null;

  // ==========================================
  // ACTIONS: PRESET MAPPING LOKASI
  // ==========================================
  const handleAddWarehousePreset = (blockPrefix: string, count: number = 50, startNum: number = 1) => {
    const newItems: LocationLabelItem[] = [];
    const endNum = startNum + count - 1;
    for (let i = startNum; i <= endNum; i++) {
      const numStr = String(i).padStart(3, '0');
      const loc = `${blockPrefix}${numStr}`;
      newItems.push({
        id: `loc_${Date.now()}_${blockPrefix}_${i}_${Math.random().toString(36).substring(2, 5)}`,
        locCode: loc,
        qrPayload: `#LOK ${loc}`,
        zoneDesc: 'WAREHOUSE',
        tagBadge: `ZONA ${blockPrefix}`,
        copies: 1,
        selected: true,
      });
    }
    setQueue((prev) => [...newItems, ...prev]);
    notify(
      `+${count} lokasi Warehouse (${blockPrefix}${String(startNum).padStart(3, '0')}–${blockPrefix}${String(endNum).padStart(3, '0')}) ditambahkan ke antrean.`,
      'success'
    );
  };

  const handleAddBlokFPreset = (locationName: string, zoneLabel: string = 'BLOK F') => {
    const cleanLoc = locationName.trim().toUpperCase();
    const newItem: LocationLabelItem = {
      id: `loc_${Date.now()}_${cleanLoc}_${Math.random().toString(36).substring(2, 5)}`,
      locCode: cleanLoc,
      qrPayload: `#LOK ${cleanLoc}`,
      zoneDesc: zoneLabel,
      tagBadge: 'LOKASI',
      copies: 1,
      selected: true,
    };
    setQueue((prev) => [newItem, ...prev]);
    notify(`Lokasi ${cleanLoc} (#LOK ${cleanLoc}) ditambahkan ke antrean.`, 'success');
  };

  const handleAddAllBlokFPreset = () => {
    const blokFList = ['SHOPEE', 'TIKTOK', 'IGLIVE', 'STUDIO'];
    const newItems: LocationLabelItem[] = blokFList.map((loc, idx) => ({
      id: `loc_${Date.now()}_blokf_${idx}`,
      locCode: loc,
      qrPayload: `#LOK ${loc}`,
      zoneDesc: 'BLOK F',
      tagBadge: 'LOKASI',
      copies: 1,
      selected: true,
    }));
    setQueue((prev) => [...newItems, ...prev]);
    notify('+4 lokasi Blok F (SHOPEE, TIKTOK, IGLIVE, STUDIO) ditambahkan ke antrean.', 'success');
  };

  const handleAddPerbaikanPreset = (prefix: string, count: number = 5, zoneLabel: string = 'PERBAIKAN') => {
    const cleanPrefix = prefix.trim().toUpperCase();
    const newItems: LocationLabelItem[] = [];
    for (let i = 1; i <= count; i++) {
      const numStr = String(i).padStart(3, '0');
      const loc = `${cleanPrefix}${numStr}`;
      newItems.push({
        id: `loc_${Date.now()}_${cleanPrefix}_${i}`,
        locCode: loc,
        qrPayload: `#LOK ${loc}`,
        zoneDesc: zoneLabel,
        tagBadge: zoneLabel,
        copies: 1,
        selected: true,
      });
    }
    setQueue((prev) => [...newItems, ...prev]);
    notify(`+${count} lokasi ${cleanPrefix}001–${cleanPrefix}${String(count).padStart(3, '0')} ditambahkan.`, 'success');
  };

  // ==========================================
  // ACTIONS: RANGE GENERATOR
  // ==========================================
  const handleGenerateRange = () => {
    if (rangeStart > rangeEnd) {
      notify('Nomor awal tidak boleh lebih besar dari nomor akhir.', 'warning');
      return;
    }

    const count = Math.min(500, rangeEnd - rangeStart + 1);
    const actualEnd = rangeStart + count - 1;
    const newItems: LocationLabelItem[] = [];
    const p = rangePrefix.trim().toUpperCase();

    for (let n = rangeStart; n <= actualEnd; n++) {
      const numStr = String(n).padStart(rangePadDigits, '0');
      const loc = `${p}${numStr}`;
      const payload = `#LOK ${loc}`;

      newItems.push({
        id: `loc_${Date.now()}_${n}_${Math.random().toString(36).substring(2, 6)}`,
        locCode: loc,
        qrPayload: payload,
        zoneDesc: rangeZoneDesc.trim() || 'WAREHOUSE',
        tagBadge: p ? `ZONA ${p.replace(/[^A-Z0-9]/g, '')}` : 'LOKASI',
        copies: Math.max(1, rangeCopies),
        selected: true,
      });
    }

    setQueue((prev) => [...newItems, ...prev]);
    notify(
      `Berhasil membuat ${newItems.length} label lokasi (${p}${String(rangeStart).padStart(rangePadDigits, '0')} s/d ${p}${String(actualEnd).padStart(rangePadDigits, '0')}).`,
      'success'
    );
  };

  // ==========================================
  // ACTIONS: MANUAL / MULTI-INPUT LOKASI
  // ==========================================
  const handleAddManualLokasi = (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = (manualLocCode || pasteText).trim();
    if (!rawInput) {
      notify('Mohon ketik atau tempelkan kode lokasi terlebih dahulu.', 'warning');
      return;
    }

    const tokens = rawInput
      .split(/[\n,;\t]+/)
      .map((s) => s.trim().toUpperCase().replace(/^#LOK\s*/i, ''))
      .filter(Boolean);

    if (tokens.length === 0) {
      notify('Tidak ada kode lokasi yang valid.', 'warning');
      return;
    }

    const newItems: LocationLabelItem[] = tokens.map((cleanCode, idx) => ({
      id: `loc_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`,
      locCode: cleanCode,
      qrPayload: `#LOK ${cleanCode}`,
      zoneDesc: manualZoneDesc.trim() || 'WAREHOUSE',
      tagBadge: manualTagBadge.trim() || 'LOKASI',
      copies: Math.max(1, manualCopies),
      selected: true,
    }));

    setQueue((prev) => [...newItems, ...prev]);
    setManualLocCode('');
    setPasteText('');
    notify(`+${newItems.length} lokasi ditambahkan ke antrean cetak.`, 'success');
  };

  // ==========================================
  // ACTIONS: PASTE / IMPORT
  // ==========================================
  const handleParsePaste = () => {
    if (!pasteText.trim()) {
      notify('Mohon tempelkan teks daftar lokasi terlebih dahulu.', 'warning');
      return;
    }

    const lines = pasteText.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed: LocationLabelItem[] = [];

    lines.forEach((line, idx) => {
      const parts = line.split(/[,\t;]/).map((p) => p.trim());
      const rawCode = parts[0] ? parts[0].toUpperCase() : '';
      if (!rawCode) return;

      const cleanCode = rawCode.replace(/^#LOK\s*/i, '');
      const zoneDesc = parts[1] || manualZoneDesc.trim() || 'WAREHOUSE';
      const copies = parseInt(parts[2], 10) || Math.max(1, manualCopies);

      parsed.push({
        id: `import_${Date.now()}_${idx}`,
        locCode: cleanCode,
        qrPayload: `#LOK ${cleanCode}`,
        zoneDesc,
        tagBadge: 'LOKASI',
        copies,
        selected: true,
      });
    });

    if (parsed.length === 0) {
      notify('Tidak ada data lokasi yang valid ditemukan.', 'warning');
      return;
    }

    setQueue((prev) => [...parsed, ...prev]);
    setPasteText('');
    notify(`Berhasil mengimpor ${parsed.length} lokasi ke antrean cetak.`, 'success');
  };

  // ==========================================
  // ACTIONS: PREFIX ACTION (#IN, #OUT, #SO)
  // ==========================================
  const handleAddActionPrefix = (code: string, _title: string, subtitle: string) => {
    const newItem: LocationLabelItem = {
      id: `action_${Date.now()}_${code.replace(/[^A-Z]/g, '')}_${Math.random().toString(36).substring(2, 5)}`,
      locCode: code,
      qrPayload: code,
      zoneDesc: subtitle,
      tagBadge: 'ACTION WMS',
      copies: 1,
      selected: true,
    };
    setQueue((prev) => [newItem, ...prev]);
    notify(`QR Action ${code} ditambahkan ke antrean.`, 'success');
  };

  const handleAddAllMainActions = () => {
    const mainActions = [
      { code: '#IN', title: 'SCAN MASUK (#IN)', desc: 'Mode Penerimaan & Restock Barang' },
      { code: '#OUT', title: 'SCAN KELUAR (#OUT)', desc: 'Mode Pengiriman & Dispatch Pesanan' },
      { code: '#SO', title: 'STOCK OPNAME (#SO)', desc: 'Mode Audit Fisik & Cek Selisih Stok' },
    ];

    const newItems: LocationLabelItem[] = mainActions.map((a, idx) => ({
      id: `action_${Date.now()}_${idx}`,
      locCode: a.code,
      qrPayload: a.code,
      zoneDesc: a.desc,
      tagBadge: 'ACTION WMS',
      copies: 1,
      selected: true,
    }));

    setQueue((prev) => [...newItems, ...prev]);
    notify('QR Action #IN, #OUT, dan #SO ditambahkan ke antrean.', 'success');
  };

  // ==========================================
  // ACTIONS: SUB-TAB CUSTOM
  // ==========================================
  const handleAddCustomQr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() && !customPayload.trim()) {
      notify('Mohon isi Judul Label atau Isi QR Code.', 'warning');
      return;
    }

    const payload = customPayload.trim() || customTitle.trim();
    const title = customTitle.trim() || payload;

    const newItem: LocationLabelItem = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      locCode: title,
      qrPayload: payload,
      zoneDesc: customSubtitle.trim() || 'CUSTOM QR',
      tagBadge: customBadge.trim() || 'CUSTOM',
      copies: Math.max(1, customCopies),
      selected: true,
    };

    setQueue((prev) => [newItem, ...prev]);
    setCustomTitle('');
    setCustomPayload('');
    setCustomSubtitle('');
    notify(`QR Custom "${title}" ditambahkan ke antrean.`, 'success');
  };

  // ==========================================
  // QUEUE OPERATIONS
  // ==========================================
  const handleToggleSelect = (id: string) => {
    setQueue((prev) =>
      prev.map((i) => (i.id === id ? { ...i, selected: i.selected === false } : i))
    );
  };

  const handleSelectAll = (select: boolean) => {
    setQueue((prev) => prev.map((i) => ({ ...i, selected: select })));
  };

  const handleUpdateCopies = (id: string, delta: number) => {
    setQueue((prev) =>
      prev.map((i) => {
        if (i.id === id) {
          return { ...i, copies: Math.max(1, (i.copies || 1) + delta) };
        }
        return i;
      })
    );
  };

  const handleDeleteItem = (id: string) => {
    setQueue((prev) => prev.filter((i) => i.id !== id));
  };

  const handleClearQueue = () => {
    setQueue([]);
    setPreviewIndex(0);
    try {
      localStorage.setItem(STORAGE_QUEUE_KEY, JSON.stringify([]));
    } catch {}
  };

  // ==========================================
  // PRINT EXECUTION ENGINE (A6 Grid 4 QR & Thermal)
  // ==========================================
  const handlePrint = async () => {
    let itemsToPrint = selectedItems;
    if (itemsToPrint.length === 0) {
      if (queue.length > 0) {
        itemsToPrint = queue;
        setQueue((prev) => prev.map((item) => ({ ...item, selected: true })));
      } else {
        notify('Antrean cetak kosong. Silakan tambahkan label terlebih dahulu.', 'warning');
        return;
      }
    }

    setIsPrinting(true);

    try {
      const qrDataMap: Record<string, string> = { ...qrCache };
      for (const item of itemsToPrint) {
        if (!qrDataMap[item.qrPayload]) {
          qrDataMap[item.qrPayload] = await generateQr(item.qrPayload);
        }
      }
      setQrCache(qrDataMap);

      const media = settings.media;
      let pageCss = '';
      let isA6Sheet = false;
      let gridPerSheet = 1;

      if (media === 'thermal_100x50') {
        pageCss = '@page { size: 100mm 50mm landscape; margin: 0mm !important; }';
      } else if (media === 'thermal_80x50') {
        pageCss = '@page { size: 80mm 50mm landscape; margin: 0mm !important; }';
      } else if (media === 'thermal_70x40') {
        pageCss = '@page { size: 70mm 40mm landscape; margin: 0mm !important; }';
      } else if (media === 'thermal_50x30') {
        pageCss = '@page { size: 50mm 30mm landscape; margin: 0mm !important; }';
      } else if (media === 'thermal_50x20') {
        pageCss = '@page { size: 50mm 20mm landscape; margin: 0mm !important; }';
      } else if (media.startsWith('a6_')) {
        isA6Sheet = true;
        gridPerSheet = parseInt(media.replace('a6_', ''), 10) || 4;
        pageCss = '@page { size: 105mm 148mm; margin: 4mm; page-orientation: upright; }';
      }

      // Font size & QR size mapping in pt & mm
      const is50x20 = media === 'thermal_50x20';

      const codePt = is50x20
        ? settings.codeFontSize === 'normal'
          ? '9pt'
          : settings.codeFontSize === 'large'
          ? '11pt'
          : settings.codeFontSize === 'jumbo'
          ? '13pt'
          : '10pt'
        : settings.codeFontSize === 'normal'
          ? '18pt'
          : settings.codeFontSize === 'large'
          ? '24pt'
          : settings.codeFontSize === 'jumbo'
          ? '42pt'
          : '32pt'; // xlarge default

      const qrMm = is50x20
        ? settings.qrSize === 'small'
          ? '12mm'
          : settings.qrSize === 'normal'
          ? '14mm'
          : settings.qrSize === 'xlarge'
          ? '16mm'
          : settings.qrSize === 'jumbo'
          ? '17mm'
          : '15mm'
        : settings.qrSize === 'small'
          ? '22mm'
          : settings.qrSize === 'normal'
          ? '28mm'
          : settings.qrSize === 'xlarge'
          ? '40mm'
          : settings.qrSize === 'jumbo'
          ? '46mm'
          : '34mm'; // large default

      // Flatten items by copies
      const flattenedItems: LocationLabelItem[] = [];
      itemsToPrint.forEach((it) => {
        const c = Math.max(1, it.copies || 1);
        for (let i = 0; i < c; i++) {
          flattenedItems.push(it);
        }
      });

      let bodyHtml = '';

      if (isA6Sheet) {
        // Chunk items into A6 sheets
        const chunks: LocationLabelItem[][] = [];
        for (let i = 0; i < flattenedItems.length; i += gridPerSheet) {
          chunks.push(flattenedItems.slice(i, i + gridPerSheet));
        }

        const gridClass =
          gridPerSheet === 1
            ? 'grid-1'
            : gridPerSheet === 2
            ? 'grid-2'
            : gridPerSheet === 6
            ? 'grid-6'
            : 'grid-4';

        bodyHtml = chunks
          .map((chunk) => {
            const cards = chunk
              .map(
                (item) => `
                <div class="a6-cell ${settings.showCutLines ? 'with-cut-lines' : ''}">
                  ${renderLabelInnerHtml(item, qrDataMap[item.qrPayload], codePt, qrMm)}
                </div>
              `
              )
              .join('');

            return `<div class="a6-sheet ${gridClass}">${cards}</div>`;
          })
          .join('');
      } else {
        // Thermal roll
        bodyHtml = flattenedItems
          .map(
            (item) => `
            <div class="thermal-card media-${media} ${settings.isRotated180 ? 'rotated-180' : ''}">
              ${renderLabelInnerHtml(item, qrDataMap[item.qrPayload], codePt, qrMm)}
            </div>
          `
          )
          .join('');
      }

      // 1. Write to main document print container for direct window.print() fallback
      let printContainer = document.getElementById('wms-print-container-lokasi');
      if (!printContainer) {
        printContainer = document.createElement('div');
        printContainer.id = 'wms-print-container-lokasi';
        document.body.appendChild(printContainer);
      }

      let printStyleTag = document.getElementById('wms-print-style-lokasi');
      if (!printStyleTag) {
        printStyleTag = document.createElement('style');
        printStyleTag.id = 'wms-print-style-lokasi';
        document.head.appendChild(printStyleTag);
      }
      printStyleTag.innerHTML = `
        @media print {
          body > *:not(#wms-print-container-lokasi) {
            display: none !important;
          }
          #wms-print-container-lokasi {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            background: #ffffff !important;
            color: #000000 !important;
          }
          ${pageCss}
        }
        @media screen {
          #wms-print-container-lokasi {
            display: none !important;
          }
        }
      `;
      printContainer.innerHTML = bodyHtml;

      // 2. Also write to hidden iframe
      let iframe = document.getElementById('prefix-barcode-print-iframe') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'prefix-barcode-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '1px';
        iframe.style.height = '1px';
        iframe.style.opacity = '0.01';
        iframe.style.pointerEvents = 'none';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (doc) {
        doc.open();
        doc.write(`
          <!DOCTYPE html>
          <html lang="id">
          <head>
            <meta charset="utf-8" />
            <meta name="color-scheme" content="light" />
            <title>Cetak Label QR Prefix WMS</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800;900&family=JetBrains+Mono:wght@700;800;900&display=swap" rel="stylesheet">
            <style>
              :root {
                color-scheme: light !important;
              }
              ${pageCss}
              * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              html, body {
                width: 100%;
                height: 100%;
                background: #ffffff !important;
                color: #000000 !important;
                color-scheme: light !important;
                font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              }
              .thermal-card {
                page-break-after: always;
                break-after: page;
                width: 100%;
                height: 100%;
                box-sizing: border-box;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                padding: 2mm 3mm;
                overflow: hidden;
              }
              .media-thermal_100x50 { width: 100mm; height: 50mm; padding: 2.5mm 3.5mm; }
              .media-thermal_80x50  { width: 80mm; height: 50mm; padding: 2mm 3mm; }
              .media-thermal_70x40  { width: 70mm; height: 40mm; padding: 2mm 2.5mm; }
              .media-thermal_50x30  { width: 50mm; height: 30mm; padding: 1.5mm 2mm; }
              .media-thermal_50x20  { width: 50mm; height: 20mm; padding: 1mm 1.5mm; }
              .media-thermal_50x20 .loc-layout-side-by-side { gap: 2mm; height: 100%; align-items: center; }
              .media-thermal_50x20 .loc-title-big { font-size: 11pt; line-height: 1.05; }
              .media-thermal_50x20 .loc-payload-code { font-size: 6.5pt; line-height: 1.1; }
              .media-thermal_50x20 .loc-badge-tag { font-size: 5.5pt; padding: 0.3mm 1mm; }
              .media-thermal_50x20 .loc-zone-desc { font-size: 5.5pt; padding: 0.3mm 0.8mm; margin-top: 0.5mm; }
              .rotated-180 { transform: rotate(180deg); }

              .a6-sheet {
                page-break-after: always;
                break-after: page;
                width: 97mm;
                height: 140mm;
                display: grid;
                gap: 2mm;
                box-sizing: border-box;
              }
              .a6-sheet.grid-1 { grid-template-columns: 1fr; grid-template-rows: 1fr; }
              .a6-sheet.grid-2 { grid-template-columns: 1fr; grid-template-rows: 1fr 1fr; }
              .a6-sheet.grid-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
              .a6-sheet.grid-6 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr 1fr; }

              .a6-cell {
                border: 1.5px dashed #444;
                border-radius: 3mm;
                padding: 2.5mm;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                overflow: hidden;
                box-sizing: border-box;
              }
              .a6-cell.with-cut-lines {
                border: 1.5px dashed #000;
              }

              .loc-wrapper {
                width: 100%;
                height: 100%;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
              }
              .loc-layout-side-by-side {
                flex-direction: row;
                align-items: center;
                gap: 3mm;
              }
              .loc-title-big {
                font-family: 'JetBrains Mono', 'Plus Jakarta Sans', monospace;
                font-weight: 900;
                color: #000;
                letter-spacing: -0.02em;
                line-height: 1.0;
              }
              .loc-qr-container {
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
              }
              .loc-qr-img {
                width: 100%;
                height: 100%;
                object-fit: contain;
                image-rendering: pixelated;
              }
              .loc-zone-desc {
                font-size: 8.5pt;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: #111;
                background: #f0f0f0;
                padding: 1mm 2mm;
                border-radius: 1.5mm;
                text-align: center;
                margin-top: 1mm;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
              }
              .loc-badge-tag {
                font-size: 7.5pt;
                font-weight: 900;
                text-transform: uppercase;
                background: #000;
                color: #fff;
                padding: 0.5mm 2mm;
                border-radius: 1mm;
                letter-spacing: 0.05em;
              }
              .loc-payload-code {
                font-family: 'JetBrains Mono', monospace;
                font-size: 7.5pt;
                font-weight: 800;
                color: #444;
                text-align: center;
                margin-top: 0.5mm;
              }
            </style>
          </head>
          <body>
            ${bodyHtml}
          </body>
          </html>
        `);
        doc.close();
      }

      setTimeout(() => {
        setIsPrinting(false);
        let printAttempted = false;
        try {
          if (iframe.contentWindow) {
            iframe.contentWindow.focus();
            iframe.contentWindow.print();
            printAttempted = true;
          }
        } catch (err) {
          console.warn('Iframe print failed:', err);
        }

        if (!printAttempted) {
          try {
            window.print();
          } catch (err) {
            console.warn('Window print failed:', err);
          }
        }
      }, 300);
    } catch (err) {
      console.error('Print failed:', err);
      setIsPrinting(false);
      notify('Gagal menyiapkan cetak printer.', 'error');
    }
  };

  function renderLabelInnerHtml(
    item: LocationLabelItem,
    qrUrl: string,
    codePt: string,
    qrMm: string
  ): string {
    const isSideBySide = settings.layout === 'side-by-side' || settings.media === 'thermal_50x20';

    if (isSideBySide) {
      return `
        <div class="loc-wrapper loc-layout-side-by-side">
          <div class="loc-qr-container" style="width: ${qrMm}; height: ${qrMm};">
            <img src="${qrUrl || ''}" class="loc-qr-img" alt="${escapeHtml(item.qrPayload)}" />
          </div>
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;">
            ${
              settings.showTagBadge && item.tagBadge
                ? `<div><span class="loc-badge-tag">${escapeHtml(item.tagBadge)}</span></div>`
                : ''
            }
            <div class="loc-title-big" style="font-size: ${codePt}; margin: 1mm 0;">
              ${escapeHtml(item.locCode)}
            </div>
            ${
              settings.showQrPayloadText
                ? `<div class="loc-payload-code" style="text-align: left;">${escapeHtml(
                    item.qrPayload
                  )}</div>`
                : ''
            }
            ${
              settings.showZoneDesc && item.zoneDesc
                ? `<div class="loc-zone-desc" style="text-align: left; margin-top: 1mm;">${escapeHtml(
                    item.zoneDesc
                  )}</div>`
                : ''
            }
          </div>
        </div>
      `;
    }

    return `
      <div class="loc-wrapper">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 2mm;">
          <div class="loc-title-big" style="font-size: ${codePt};">
            ${escapeHtml(item.locCode)}
          </div>
          ${
            settings.showTagBadge && item.tagBadge
              ? `<span class="loc-badge-tag">${escapeHtml(item.tagBadge)}</span>`
              : ''
          }
        </div>

        <div style="display: flex; align-items: center; justify-content: center; margin: 1mm 0;">
          <div class="loc-qr-container" style="width: ${qrMm}; height: ${qrMm};">
            <img src="${qrUrl || ''}" class="loc-qr-img" alt="${escapeHtml(item.qrPayload)}" />
          </div>
        </div>

        ${
          settings.showQrPayloadText
            ? `<div class="loc-payload-code">${escapeHtml(item.qrPayload)}</div>`
            : ''
        }

        ${
          settings.showZoneDesc && item.zoneDesc
            ? `<div class="loc-zone-desc">${escapeHtml(item.zoneDesc)}</div>`
            : ''
        }
      </div>
    `;
  }

  function escapeHtml(str: string): string {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
      {/* ========================================================= */}
      {/* LEFT COLUMN (7 COLS): COMPACT GENERATOR & QUEUE TABLE     */}
      {/* ========================================================= */}
      <div className="lg:col-span-7 space-y-3">
        {/* CARD 1: UNIFIED GENERATOR WORKSPACE */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs overflow-hidden">
          {/* Compact Top Toolbar: Category Switcher (Left) + Mode Switcher (Right) */}
          <div className="px-3 py-2.5 bg-slate-50/90 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
            {/* Category Switcher */}
            <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-900 shadow-2xs">
              <button
                type="button"
                onClick={() => setSubTab('prefix_lokasi')}
                className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  subTab === 'prefix_lokasi'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <MapPin className="w-3.5 h-3.5 shrink-0" />
                <span>Lokasi Rak (#LOK)</span>
              </button>
              <button
                type="button"
                onClick={() => setSubTab('prefix_action')}
                className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-700 transition-colors cursor-pointer ${
                  subTab === 'prefix_action'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Zap className="w-3.5 h-3.5 shrink-0" />
                <span>Action (#IN/#OUT/#SO)</span>
              </button>
              <button
                type="button"
                onClick={() => setSubTab('custom_qr')}
                className={`px-3 py-1.5 text-xs font-bold flex items-center gap-1.5 border-l border-slate-200 dark:border-slate-700 transition-colors cursor-pointer ${
                  subTab === 'custom_qr'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>Custom QR</span>
              </button>
            </div>

            {/* Sub-Mode Pills for Lokasi Rak */}
            {subTab === 'prefix_lokasi' && (
              <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg">
                {(
                  [
                    { id: 'preset', label: 'Preset Cepat' },
                    { id: 'range', label: 'Range Nomor' },
                    { id: 'manual', label: 'Input / Paste' },
                  ] as const
                ).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setLokasiInputMode(m.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                      (lokasiInputMode === m.id || (m.id === 'manual' && lokasiInputMode === 'import'))
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Generator Body */}
          <div className="p-3.5">
            {/* ===================================================== */}
            {/* SUB-TAB 1: LOKASI RAK (#LOK)                          */}
            {/* ===================================================== */}
            {subTab === 'prefix_lokasi' && (
              <>
                {/* MODE A: PRESET CEPAT (COMPACT CHIPS) */}
                {lokasiInputMode === 'preset' && (
                  <div className="space-y-3">
                    {/* Row 1: Warehouse */}
                    <div className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/70 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span>Area Warehouse (Otomatis Format #LOK)</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">Klik untuk tambah 50 rak</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {[
                          { block: 'A', start: 1, label: 'A001 – A050' },
                          { block: 'A', start: 51, label: 'A051 – A100' },
                          { block: 'B', start: 1, label: 'B001 – B050' },
                          { block: 'B', start: 51, label: 'B051 – B100' },
                          { block: 'C', start: 1, label: 'C001 – C050' },
                          { block: 'D', start: 1, label: 'D001 – D050' },
                        ].map((item) => (
                          <button
                            key={item.label}
                            type="button"
                            onClick={() => handleAddWarehousePreset(item.block, 50, item.start)}
                            className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 rounded-lg text-xs font-mono font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between transition-all cursor-pointer"
                          >
                            <span>{item.label}</span>
                            <Plus className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Row 2: Blok F & Transit */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                            <PackageCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                            <span>Blok F &amp; Transit</span>
                          </span>
                          <button
                            type="button"
                            onClick={handleAddAllBlokFPreset}
                            className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                          >
                            + Semua Blok F
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { name: 'SHOPEE', zone: 'BLOK F' },
                            { name: 'TIKTOK', zone: 'BLOK F' },
                            { name: 'STUDIO', zone: 'BLOK F' },
                            { name: 'TRANSIT', zone: 'TRANSIT' },
                          ].map((loc) => (
                            <button
                              key={loc.name}
                              type="button"
                              onClick={() => handleAddBlokFPreset(loc.name, loc.zone)}
                              className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-emerald-400 rounded-lg text-xs font-mono font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between transition-all cursor-pointer"
                            >
                              <span>{loc.name}</span>
                              <Plus className="w-3 h-3 text-emerald-600 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Row 3: Perbaikan & Kolian */}
                      <div className="p-2.5 rounded-xl bg-slate-50/90 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-700/70 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                            <Wrench className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                            <span>Perbaikan &amp; Kolian</span>
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            { prefix: 'DF', count: 5, label: 'DF001–005', zone: 'PERBAIKAN' },
                            { prefix: 'PMK', count: 5, label: 'PMK001–005', zone: 'PERBAIKAN' },
                            { prefix: 'CC', count: 5, label: 'CC001–005', zone: 'PERBAIKAN' },
                            { prefix: 'R', count: 10, label: 'R001–R010', zone: 'KOLIAN' },
                          ].map((p) => (
                            <button
                              key={p.label}
                              type="button"
                              onClick={() => handleAddPerbaikanPreset(p.prefix, p.count, p.zone)}
                              className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-400 rounded-lg text-xs font-mono font-bold text-slate-800 dark:text-slate-200 flex items-center justify-between transition-all cursor-pointer"
                            >
                              <span>{p.label}</span>
                              <Plus className="w-3 h-3 text-amber-600 shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* MODE B: GENERATOR RANGE NOMOR */}
                {lokasiInputMode === 'range' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5">
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Prefix
                        </label>
                        <input
                          type="text"
                          value={rangePrefix}
                          onChange={(e) => setRangePrefix(e.target.value.toUpperCase())}
                          placeholder="A / DF / R"
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Dari No
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={rangeStart}
                          onChange={(e) => setRangeStart(parseInt(e.target.value, 10) || 1)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Sampai
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={rangeEnd}
                          onChange={(e) => setRangeEnd(parseInt(e.target.value, 10) || 1)}
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Digit
                        </label>
                        <select
                          value={rangePadDigits}
                          onChange={(e) => setRangePadDigits(parseInt(e.target.value, 10) || 3)}
                          className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                        >
                          <option value={1}>1 (A1)</option>
                          <option value={2}>2 (A01)</option>
                          <option value={3}>3 (A001)</option>
                          <option value={4}>4 (A0001)</option>
                        </select>
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Deskripsi Area
                        </label>
                        <input
                          type="text"
                          value={rangeZoneDesc}
                          onChange={(e) => setRangeZoneDesc(e.target.value)}
                          placeholder="WAREHOUSE / KOLIAN"
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[11px] font-semibold text-slate-500">Salinan per rak:</span>
                        <input
                          type="number"
                          min="1"
                          value={rangeCopies}
                          onChange={(e) => setRangeCopies(parseInt(e.target.value, 10) || 1)}
                          className="w-14 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-center"
                        />
                        <span className="text-[11px] font-mono text-slate-400 hidden sm:inline">
                          Contoh: #LOK {rangePrefix.trim().toUpperCase()}{String(rangeStart).padStart(rangePadDigits, '0')}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={handleGenerateRange}
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Buat {Math.max(0, rangeEnd - rangeStart + 1)} Label</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* MODE C: INPUT SATUAN ATAU PASTE BANYAK SEKALIGUS */}
                {(lokasiInputMode === 'manual' || lokasiInputMode === 'import') && (
                  <form onSubmit={handleAddManualLokasi} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                      <div className="sm:col-span-7">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Kode Lokasi (Ketik 1 atau Paste Banyak Pisah Koma/Baris) <span className="text-rose-500">*</span>
                        </label>
                        <textarea
                          rows={2}
                          value={manualLocCode}
                          onChange={(e) => setManualLocCode(e.target.value)}
                          placeholder="Contoh: A001, A002, SHOPEE, DF001 (otomatis menjadi #LOK ...)"
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white resize-none"
                        />
                      </div>
                      <div className="sm:col-span-3">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Deskripsi Area
                        </label>
                        <input
                          type="text"
                          value={manualZoneDesc}
                          onChange={(e) => setManualZoneDesc(e.target.value)}
                          placeholder="WAREHOUSE"
                          className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                          Salinan
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={manualCopies}
                          onChange={(e) => setManualCopies(parseInt(e.target.value, 10) || 1)}
                          className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-center text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[11px] text-slate-400 font-mono">
                        Format otomatis: <code>#LOK &lt;KODE&gt;</code>
                      </span>
                      <button
                        type="submit"
                        className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Tambah ke Antrean</span>
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}

            {/* ===================================================== */}
            {/* SUB-TAB 2: ACTION WMS (#IN, #OUT, #SO)                */}
            {/* ===================================================== */}
            {subTab === 'prefix_action' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    Label Mode Scanner Cepat (#IN, #OUT, #SO):
                  </span>
                  <button
                    type="button"
                    onClick={handleAddAllMainActions}
                    className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                  >
                    + Tambah Ketiganya (#IN, #OUT, #SO)
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {[
                    {
                      code: '#IN',
                      badge: 'SCAN MASUK',
                      desc: 'Penerimaan & Restock',
                      cls: 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
                    },
                    {
                      code: '#OUT',
                      badge: 'SCAN KELUAR',
                      desc: 'Pengiriman & Dispatch',
                      cls: 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
                    },
                    {
                      code: '#SO',
                      badge: 'STOCK OPNAME',
                      desc: 'Audit Fisik Rak',
                      cls: 'bg-purple-50/70 dark:bg-purple-950/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
                    },
                  ].map((act) => (
                    <button
                      key={act.code}
                      type="button"
                      onClick={() => handleAddActionPrefix(act.code, act.badge, act.desc)}
                      className={`p-3 rounded-xl border text-left transition-all hover:shadow-xs flex flex-col justify-between gap-2 cursor-pointer ${act.cls}`}
                    >
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono font-extrabold text-base">{act.code}</span>
                        <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900/70 border border-current/20">
                          + Antrean
                        </span>
                      </div>
                      <div className="text-[11px] opacity-85 font-medium">{act.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Extra Quick Actions */}
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-[10px] font-bold uppercase text-slate-400 mb-1.5">
                    Action Tambahan:
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {WMS_QUICK_PREFIXES.filter((i) => !['#IN', '#OUT', '#SO'].includes(i.code)).map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => handleAddActionPrefix(item.code, item.title, item.subtitle)}
                        className="px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 rounded-lg text-left flex items-center justify-between transition-all cursor-pointer"
                      >
                        <div className="min-w-0">
                          <div className="font-mono font-bold text-xs text-slate-900 dark:text-white truncate">
                            {item.code}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{item.title}</div>
                        </div>
                        <Plus className="w-3 h-3 text-indigo-600 shrink-0 ml-1" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ===================================================== */}
            {/* SUB-TAB 3: CUSTOM QR                                  */}
            {/* ===================================================== */}
            {subTab === 'custom_qr' && (
              <form onSubmit={handleAddCustomQr} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Judul Label (Teks Besar) <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customTitle}
                      onChange={(e) => {
                        setCustomTitle(e.target.value);
                        if (!customPayload || customPayload === customTitle) setCustomPayload(e.target.value);
                      }}
                      placeholder="Contoh: MEJA PACKING 1"
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Isi Payload QR Code <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customPayload}
                      onChange={(e) => setCustomPayload(e.target.value)}
                      placeholder="Contoh: #PACKING-01"
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                      Keterangan Bawah (Opsional)
                    </label>
                    <input
                      type="text"
                      value={customSubtitle}
                      onChange={(e) => setCustomSubtitle(e.target.value)}
                      placeholder="Contoh: ZONA PACKING UTAMA"
                      className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-semibold text-slate-900 dark:text-white"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Badge Tag
                      </label>
                      <input
                        type="text"
                        value={customBadge}
                        onChange={(e) => setCustomBadge(e.target.value)}
                        placeholder="CUSTOM"
                        className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                        Salinan
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={customCopies}
                        onChange={(e) => setCustomCopies(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-2 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono font-bold text-center text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <button
                    type="submit"
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-2xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Tambah QR Custom</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* CARD 2: COMPACT ANTREAN CETAK TABLE */}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs overflow-hidden">
          <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white">
                Daftar Antrean Cetak
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                {queue.length} item &middot; {totalSelectedCopies} stiker
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-40 sm:w-48">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari kode / QR..."
                  className="w-full pl-8 pr-6 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleSelectAll(true)}
                className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
              >
                Pilih Semua
              </button>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <button
                type="button"
                onClick={() => handleSelectAll(false)}
                className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
              >
                Batal
              </button>
              <span className="text-slate-300 dark:text-slate-700">|</span>
              <button
                type="button"
                onClick={handleClearQueue}
                className="text-[11px] font-bold text-rose-600 dark:text-rose-400 hover:underline cursor-pointer"
              >
                Kosongkan
              </button>
            </div>
          </div>

          <div className="max-h-[340px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
            {filteredQueue.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs">
                Antrean cetak kosong. Klik salah satu tombol preset atau tambahkan lokasi di atas.
              </div>
            ) : (
              filteredQueue.map((item) => {
                const isSelected = item.selected !== false;
                const isBeingPreviewed = currentPreviewItem?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      const idxInSelected = selectedItems.findIndex((s) => s.id === item.id);
                      if (idxInSelected >= 0) setPreviewIndex(idxInSelected);
                    }}
                    className={`px-3.5 py-2 flex items-center justify-between gap-3 transition-colors cursor-pointer ${
                      isBeingPreviewed
                        ? 'bg-indigo-50/40 dark:bg-indigo-950/25 border-l-4 border-l-indigo-600'
                        : isSelected
                        ? 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        : 'bg-slate-50/60 dark:bg-slate-900/40 opacity-55'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onClick={(e) => e.stopPropagation()}
                        onChange={() => handleToggleSelect(item.id)}
                        className="w-3.5 h-3.5 text-indigo-600 rounded cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono font-extrabold text-xs sm:text-sm text-slate-900 dark:text-white">
                            {item.locCode}
                          </span>
                          {item.tagBadge && (
                            <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded text-[9.5px] font-bold">
                              {item.tagBadge}
                            </span>
                          )}
                          {item.zoneDesc && (
                            <span className="text-[10px] font-semibold text-slate-400">
                              &middot; {item.zoneDesc}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400 truncate">
                          Payload: <code>{item.qrPayload}</code>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-800">
                        <button
                          type="button"
                          onClick={() => handleUpdateCopies(item.id, -1)}
                          className="px-2 py-0.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs cursor-pointer"
                        >
                          -
                        </button>
                        <span className="px-2 font-mono font-extrabold text-xs text-slate-900 dark:text-white">
                          {item.copies || 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateCopies(item.id, 1)}
                          className="px-2 py-0.5 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs cursor-pointer"
                        >
                          +
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                        title="Hapus dari antrean"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* RIGHT COLUMN (5 COLS): UNIFIED PREVIEW & PRINT SETTINGS   */}
      {/* ========================================================= */}
      <div className="lg:col-span-5 lg:sticky lg:top-3 space-y-3">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-2xs overflow-hidden">
          {/* Header with Preview Pager & Primary Print Button */}
          <div className="px-3.5 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span className="text-xs font-extrabold text-slate-900 dark:text-white">
                Pratinjau Stiker
              </span>
              {selectedItems.length > 1 && (
                <div className="flex items-center gap-1 text-[11px] font-mono text-slate-500 ml-1">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewIndex((prev) => (prev > 0 ? prev - 1 : selectedItems.length - 1))
                    }
                    className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-bold hover:bg-slate-100 cursor-pointer"
                  >
                    &lt;
                  </button>
                  <span>
                    {previewIndex + 1}/{selectedItems.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewIndex((prev) => (prev < selectedItems.length - 1 ? prev + 1 : 0))
                    }
                    className="px-1.5 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-bold hover:bg-slate-100 cursor-pointer"
                  >
                    &gt;
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handlePrint}
              disabled={queue.length === 0 || isPrinting}
              className="py-1.5 px-3.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs rounded-lg shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>
                {isPrinting
                  ? 'Menyiapkan...'
                  : `Cetak ${totalSelectedCopies > 0 ? totalSelectedCopies : totalAllCopies} Stiker QR`}
              </span>
            </button>
          </div>

          {/* Live Sticker Stage */}
          <div className="p-4 bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center min-h-[195px]">
            {currentPreviewItem ? (
              settings.media === 'thermal_50x20' ? (
                <div className="w-[270px] h-[108px] bg-white text-black p-2.5 rounded-xl shadow-sm border border-slate-300 flex items-center justify-between gap-3">
                  <div className="w-[80px] h-[80px] flex items-center justify-center shrink-0">
                    {qrCache[currentPreviewItem.qrPayload] ? (
                      <img
                        src={qrCache[currentPreviewItem.qrPayload]}
                        alt={currentPreviewItem.qrPayload}
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <div className="w-full h-full bg-slate-100 flex items-center justify-center text-[10px] text-slate-400 font-mono">
                        QR...
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {settings.showTagBadge && currentPreviewItem.tagBadge && (
                        <span className="px-1.5 py-0.5 bg-black text-white rounded text-[8px] font-black uppercase tracking-wider">
                          {currentPreviewItem.tagBadge}
                        </span>
                      )}
                      <span className="font-mono font-black text-black leading-tight text-base truncate">
                        {currentPreviewItem.locCode}
                      </span>
                    </div>
                    {settings.showQrPayloadText && (
                      <div className="font-mono font-bold text-[9px] text-slate-700 truncate mt-0.5">
                        {currentPreviewItem.qrPayload}
                      </div>
                    )}
                    {settings.showZoneDesc && currentPreviewItem.zoneDesc && (
                      <div className="bg-slate-100 text-slate-900 font-extrabold text-[8.5px] uppercase tracking-wider py-0.5 px-1 rounded truncate mt-1">
                        {currentPreviewItem.zoneDesc}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-white text-black p-3 rounded-xl shadow-sm border border-slate-300 w-[260px]">
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1 mb-1.5">
                    <span
                      className="font-mono font-black text-black leading-tight truncate"
                      style={{
                        fontSize:
                          settings.codeFontSize === 'normal'
                            ? '1.1rem'
                            : settings.codeFontSize === 'large'
                            ? '1.35rem'
                            : settings.codeFontSize === 'jumbo'
                            ? '1.85rem'
                            : '1.55rem',
                      }}
                    >
                      {currentPreviewItem.locCode}
                    </span>
                    {settings.showTagBadge && currentPreviewItem.tagBadge && (
                      <span className="px-1.5 py-0.5 bg-black text-white rounded text-[9px] font-black uppercase tracking-wider shrink-0">
                        {currentPreviewItem.tagBadge}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-center my-1.5">
                    {qrCache[currentPreviewItem.qrPayload] ? (
                      <img
                        src={qrCache[currentPreviewItem.qrPayload]}
                        alt={currentPreviewItem.qrPayload}
                        className="object-contain"
                        style={{
                          width:
                            settings.qrSize === 'small'
                              ? '64px'
                              : settings.qrSize === 'normal'
                              ? '78px'
                              : settings.qrSize === 'xlarge'
                              ? '112px'
                              : settings.qrSize === 'jumbo'
                              ? '128px'
                              : '96px',
                          height:
                            settings.qrSize === 'small'
                              ? '64px'
                              : settings.qrSize === 'normal'
                              ? '78px'
                              : settings.qrSize === 'xlarge'
                              ? '112px'
                              : settings.qrSize === 'jumbo'
                              ? '128px'
                              : '96px',
                        }}
                      />
                    ) : (
                      <div className="w-20 h-20 bg-slate-100 flex items-center justify-center text-xs text-slate-400 font-mono">
                        QR...
                      </div>
                    )}
                  </div>

                  {settings.showQrPayloadText && (
                    <div className="text-center font-mono font-bold text-[10px] text-slate-700">
                      {currentPreviewItem.qrPayload}
                    </div>
                  )}

                  {settings.showZoneDesc && currentPreviewItem.zoneDesc && (
                    <div className="text-center bg-slate-100 text-slate-900 font-extrabold text-[10px] uppercase tracking-wider py-0.5 px-2 rounded mt-1">
                      {currentPreviewItem.zoneDesc}
                    </div>
                  )}
                </div>
              )
            ) : (
              <div className="text-slate-400 text-xs">Pilih item di antrean untuk pratinjau</div>
            )}
          </div>

          {/* Always-Visible Compact Paper & Layout Settings */}
          <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            {/* Ukuran Kertas */}
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                Ukuran Kertas &amp; Format Stiker
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { key: 'a6_4', label: 'A6 · 4 QR (Standar)' },
                  { key: 'a6_6', label: 'A6 · 6 QR (Kompak)' },
                  { key: 'a6_1', label: 'A6 · 1 QR (Jumbo)' },
                  { key: 'thermal_50x20', label: 'Roll 50×20mm (Barcode)' },
                  { key: 'thermal_50x30', label: 'Roll 50×30mm' },
                  { key: 'thermal_70x40', label: 'Roll 70×40mm' },
                  { key: 'thermal_80x50', label: 'Roll 80×50mm' },
                  { key: 'thermal_100x50', label: 'Roll 100×50mm' },
                ].map((m) => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => updateSettings({ media: m.key as LocationPrintMedia })}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-left border transition-all cursor-pointer truncate ${
                      settings.media === m.key
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Ukuran Font & QR */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Ukuran Teks Kode
                </label>
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { key: 'normal', label: 'S' },
                    { key: 'large', label: 'M' },
                    { key: 'xlarge', label: 'L' },
                    { key: 'jumbo', label: 'XL' },
                  ].map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => updateSettings({ codeFontSize: f.key as any })}
                      className={`py-1 text-center text-[10px] font-bold rounded border transition-all cursor-pointer ${
                        settings.codeFontSize === f.key
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                  Ukuran Gambar QR
                </label>
                <div className="grid grid-cols-5 gap-1">
                  {[
                    { key: 'small', label: 'XS' },
                    { key: 'normal', label: 'S' },
                    { key: 'large', label: 'M' },
                    { key: 'xlarge', label: 'L' },
                    { key: 'jumbo', label: 'XL' },
                  ].map((q) => (
                    <button
                      key={q.key}
                      type="button"
                      onClick={() => updateSettings({ qrSize: q.key as any })}
                      className={`py-1 text-center text-[10px] font-bold rounded border transition-all cursor-pointer ${
                        settings.qrSize === q.key
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Opsi Elemen Checkboxes (2x2 Grid) */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-2">
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={settings.showCutLines}
                  onChange={(e) => updateSettings({ showCutLines: e.target.checked })}
                  className="w-3.5 h-3.5 text-indigo-600 rounded"
                />
                <span>Garis Potong</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={settings.showQrPayloadText}
                  onChange={(e) => updateSettings({ showQrPayloadText: e.target.checked })}
                  className="w-3.5 h-3.5 text-indigo-600 rounded"
                />
                <span>Teks Payload QR</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={settings.showTagBadge}
                  onChange={(e) => updateSettings({ showTagBadge: e.target.checked })}
                  className="w-3.5 h-3.5 text-indigo-600 rounded"
                />
                <span>Badge Tag Atas</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={settings.showZoneDesc}
                  onChange={(e) => updateSettings({ showZoneDesc: e.target.checked })}
                  className="w-3.5 h-3.5 text-indigo-600 rounded"
                />
                <span>Deskripsi Area</span>
              </label>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CetakLokasiRakTab;
