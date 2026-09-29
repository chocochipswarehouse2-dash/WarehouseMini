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

export const CetakLokasiRakTab: React.FC = () => {
  // Main Sub-Tab Switcher inside QR Prefix: 'prefix_lokasi' | 'prefix_action' | 'custom_qr'
  const [subTab, setSubTab] = useState<'prefix_lokasi' | 'prefix_action' | 'custom_qr'>('prefix_lokasi');

  // Input Mode inside Tab Prefix Lokasi: 'preset' | 'range' | 'manual' | 'import'
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
  const handleAddWarehousePreset = (blockPrefix: string, count: number = 50) => {
    const newItems: LocationLabelItem[] = [];
    for (let i = 1; i <= count; i++) {
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
    alert(`Berhasil menambahkan ${count} lokasi Warehouse (${blockPrefix}001 s/d ${blockPrefix}${String(count).padStart(3, '0')}) dengan QR #LOK ${blockPrefix}001.`);
  };

  const handleAddBlokFPreset = (locationName: string) => {
    const cleanLoc = locationName.trim().toUpperCase();
    const newItem: LocationLabelItem = {
      id: `loc_${Date.now()}_${cleanLoc}_${Math.random().toString(36).substring(2, 5)}`,
      locCode: cleanLoc,
      qrPayload: `#LOK ${cleanLoc}`,
      zoneDesc: 'BLOK F',
      tagBadge: 'LOKASI',
      copies: 1,
      selected: true,
    };
    setQueue((prev) => [newItem, ...prev]);
  };

  const handleAddAllBlokFPreset = () => {
    const blokFList = ['SHOPEE', 'TIKTOK', 'STUDIO'];
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
    alert('Berhasil menambahkan semua lokasi Blok F (SHOPEE, TIKTOK, STUDIO) ke antrean.');
  };

  const handleAddPerbaikanPreset = (prefix: string, count: number = 5) => {
    const cleanPrefix = prefix.trim().toUpperCase();
    const newItems: LocationLabelItem[] = [];
    for (let i = 1; i <= count; i++) {
      const numStr = String(i).padStart(3, '0');
      const loc = `${cleanPrefix}${numStr}`;
      newItems.push({
        id: `loc_${Date.now()}_${cleanPrefix}_${i}`,
        locCode: loc,
        qrPayload: `#LOK ${loc}`,
        zoneDesc: 'PERBAIKAN',
        tagBadge: 'PERBAIKAN',
        copies: 1,
        selected: true,
      });
    }
    setQueue((prev) => [...newItems, ...prev]);
  };

  // ==========================================
  // ACTIONS: RANGE GENERATOR
  // ==========================================
  const handleGenerateRange = () => {
    if (rangeStart > rangeEnd) {
      alert('Nomor awal tidak boleh lebih besar dari nomor akhir.');
      return;
    }

    const count = rangeEnd - rangeStart + 1;
    if (count > 500) {
      if (!window.confirm(`Anda akan membuat ${count} barcode lokasi. Lanjutkan?`)) return;
    }

    const newItems: LocationLabelItem[] = [];
    const p = rangePrefix.trim().toUpperCase();

    for (let n = rangeStart; n <= rangeEnd; n++) {
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
    alert(`Berhasil membuat ${newItems.length} label lokasi (${p}${String(rangeStart).padStart(rangePadDigits, '0')} s/d ${p}${String(rangeEnd).padStart(rangePadDigits, '0')}) dengan QR #LOK.`);
  };

  // ==========================================
  // ACTIONS: MANUAL SINGLE LOKASI
  // ==========================================
  const handleAddManualLokasi = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualLocCode.trim()) {
      alert('Mohon ketik nama / kode lokasi.');
      return;
    }

    const cleanCode = manualLocCode.trim().toUpperCase();
    const newItem: LocationLabelItem = {
      id: `loc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      locCode: cleanCode,
      qrPayload: `#LOK ${cleanCode}`,
      zoneDesc: manualZoneDesc.trim() || 'WAREHOUSE',
      tagBadge: manualTagBadge.trim() || 'LOKASI',
      copies: Math.max(1, manualCopies),
      selected: true,
    };

    setQueue((prev) => [newItem, ...prev]);
    setManualLocCode('');
  };

  // ==========================================
  // ACTIONS: PASTE / IMPORT
  // ==========================================
  const handleParsePaste = () => {
    if (!pasteText.trim()) {
      alert('Mohon tempelkan teks daftar lokasi terlebih dahulu.');
      return;
    }

    const lines = pasteText.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed: LocationLabelItem[] = [];

    lines.forEach((line, idx) => {
      const parts = line.split(/[,\t;]/).map((p) => p.trim());
      const rawCode = parts[0] ? parts[0].toUpperCase() : '';
      if (!rawCode) return;

      const cleanCode = rawCode.replace(/^#LOK\s*/i, '');
      const zoneDesc = parts[1] || 'WAREHOUSE';
      const copies = parseInt(parts[2], 10) || 1;

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
      alert('Tidak ada data lokasi yang valid ditemukan.');
      return;
    }

    setQueue((prev) => [...parsed, ...prev]);
    setPasteText('');
    alert(`Berhasil mengimpor ${parsed.length} lokasi ke antrean cetak dengan QR #LOK.`);
  };

  // ==========================================
  // ACTIONS: PREFIX ACTION (#IN, #OUT, #SO)
  // ==========================================
  const handleAddActionPrefix = (code: string, title: string, subtitle: string) => {
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
    alert('Berhasil menambahkan QR Action #IN, #OUT, dan #SO ke antrean.');
  };

  // ==========================================
  // ACTIONS: SUB-TAB CUSTOM
  // ==========================================
  const handleAddCustomQr = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customTitle.trim() && !customPayload.trim()) {
      alert('Mohon isi Judul Label atau Isi QR Code.');
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
        alert('Antrean cetak kosong. Silakan tambahkan label terlebih dahulu.');
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
        pageCss = '@page { size: 100mm 50mm; margin: 0; page-orientation: upright; }';
      } else if (media === 'thermal_80x50') {
        pageCss = '@page { size: 80mm 50mm; margin: 0; page-orientation: upright; }';
      } else if (media === 'thermal_70x40') {
        pageCss = '@page { size: 70mm 40mm; margin: 0; page-orientation: upright; }';
      } else if (media === 'thermal_50x30') {
        pageCss = '@page { size: 50mm 30mm; margin: 0; page-orientation: upright; }';
      } else if (media === 'thermal_50x20') {
        pageCss = '@page { size: 50mm 20mm; margin: 0; page-orientation: upright; }';
      } else if (media.startsWith('a6_')) {
        isA6Sheet = true;
        gridPerSheet = parseInt(media.replace('a6_', ''), 10) || 4;
        pageCss = '@page { size: 105mm 148mm; margin: 4mm; page-orientation: upright; }';
      }

      // Font size mapping in pt
      const codePt =
        settings.codeFontSize === 'normal'
          ? '18pt'
          : settings.codeFontSize === 'large'
          ? '24pt'
          : settings.codeFontSize === 'jumbo'
          ? '42pt'
          : '32pt'; // xlarge default

      const qrMm =
        settings.qrSize === 'small'
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
      alert('Gagal menyiapkan cetak printer.');
    }
  };

  function renderLabelInnerHtml(
    item: LocationLabelItem,
    qrUrl: string,
    codePt: string,
    qrMm: string
  ): string {
    const isSideBySide = settings.layout === 'side-by-side';

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
    <div className="space-y-4 sm:space-y-6">
      {/* ========================================================= */}
      {/* 1. TOP BANNER & ACTION HEADER                             */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-3 bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-200 dark:border-emerald-800">
              <QrCode className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  QR Prefix (#LOK, #IN, #OUT, #SO)
                </h2>
                <span className="px-2.5 py-0.5 text-[11px] font-black uppercase bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-full">
                  A6 (4 QR) &amp; Custom
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Cetak label QR action lokasi (format <code>#LOK A001</code>), mode scanner (#IN, #OUT, #SO), dan QR custom bebas.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-center">
              <div className="text-[11px] font-bold text-slate-500">Antrean Item</div>
              <div className="text-base font-black text-slate-900 dark:text-white">
                {queue.length} <span className="text-xs font-semibold text-slate-400">label</span>
              </div>
            </div>

            <div className="px-3.5 py-2 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 rounded-xl text-center">
              <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-300">Total Stiker</div>
              <div className="text-base font-black text-emerald-700 dark:text-emerald-300">
                {totalSelectedCopies}{' '}
                <span className="text-xs font-semibold text-emerald-500/80">/ {totalAllCopies} lembar</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              disabled={queue.length === 0 || isPrinting}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>
                {isPrinting
                  ? 'Menyiapkan...'
                  : `Cetak ${totalSelectedCopies > 0 ? totalSelectedCopies : totalAllCopies} Stiker QR`}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. SUB-TAB SWITCHER (Lokasi, Action, Custom)               */}
      {/* ========================================================= */}
      <div className="bg-slate-200/80 dark:bg-slate-800/80 p-1.5 rounded-2xl border border-slate-300 dark:border-slate-700/80 flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
        <button
          type="button"
          onClick={() => setSubTab('prefix_lokasi')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer select-none ${
            subTab === 'prefix_lokasi'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-md shadow-emerald-500/10 border border-emerald-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/50'
          }`}
        >
          <MapPin className="w-4 h-4 shrink-0" />
          <span>Tab Prefix Lokasi</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('prefix_action')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer select-none ${
            subTab === 'prefix_action'
              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-md shadow-indigo-500/10 border border-indigo-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/50'
          }`}
        >
          <Zap className="w-4 h-4 shrink-0" />
          <span>Tab Prefix Action (#IN, #OUT, #SO)</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('custom_qr')}
          className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer select-none ${
            subTab === 'custom_qr'
              ? 'bg-white dark:bg-slate-900 text-purple-600 dark:text-purple-400 shadow-md shadow-purple-500/10 border border-purple-500/20'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-white/50'
          }`}
        >
          <Sparkles className="w-4 h-4 shrink-0" />
          <span>Tab Custom</span>
        </button>
      </div>

      {/* ========================================================= */}
      {/* 3. DUA KOLOM: FORM INPUT SUB-TAB & PREVIEW / ADVANCE       */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* LEFT COLUMN: SUB-TAB INPUT FORM (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* SUB-TAB 1: TAB PREFIX LOKASI */}
          {subTab === 'prefix_lokasi' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
              <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 border-b border-emerald-200/80 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black">Format Prefix Lokasi:</span> Setiap QR lokasi otomatis berisi <code>#LOK &lt;LOKASI&gt;</code> (contoh: <code>#LOK A001</code>). PREFIX yang dibutuhkan hanya nama lokasi, tidak memerlukan prefix nama area.
                </div>
              </div>

              {/* Mode Sub-nav: Preset Area vs Range vs Ketik Satuan vs Paste */}
              <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 p-1.5 gap-1 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setLokasiInputMode('preset')}
                  className={`py-2 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
                    lokasiInputMode === 'preset'
                      ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Building2 className="w-3.5 h-3.5" />
                  <span>Preset Area Mapping</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLokasiInputMode('range')}
                  className={`py-2 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
                    lokasiInputMode === 'range'
                      ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generator Range (A001 - A050)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLokasiInputMode('manual')}
                  className={`py-2 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
                    lokasiInputMode === 'manual'
                      ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ketik Satuan</span>
                </button>

                <button
                  type="button"
                  onClick={() => setLokasiInputMode('import')}
                  className={`py-2 px-3 rounded-xl text-xs font-black flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
                    lokasiInputMode === 'import'
                      ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Paste Daftar Lokasi</span>
                </button>
              </div>

              <div className="p-4 sm:p-5">
                {/* 1. PRESET AREA MAPPING */}
                {lokasiInputMode === 'preset' && (
                  <div className="space-y-4">
                    {/* Warehouse Section */}
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-emerald-600" />
                          <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                            Area Warehouse
                          </h4>
                        </div>
                        <span className="text-[11px] font-bold text-slate-500">
                          A001–A050, B001–B050
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mb-2.5">
                        Klik untuk membuat 50 stiker barcode QR lokasi sekaligus:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddWarehousePreset('A', 50)}
                          className="px-3 py-2 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 transition-all flex items-center justify-between cursor-pointer"
                        >
                          <span>Rak A001 s/d A050</span>
                          <Plus className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAddWarehousePreset('B', 50)}
                          className="px-3 py-2 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 transition-all flex items-center justify-between cursor-pointer"
                        >
                          <span>Rak B001 s/d B050</span>
                          <Plus className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAddWarehousePreset('C', 50)}
                          className="px-3 py-2 bg-white dark:bg-slate-900 border border-emerald-300 dark:border-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-xl text-xs font-bold text-emerald-700 dark:text-emerald-300 transition-all flex items-center justify-between cursor-pointer"
                        >
                          <span>Rak C001 s/d C050</span>
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Blok F Section */}
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <PackageCheck className="w-4 h-4 text-indigo-600" />
                          <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                            Area Blok F
                          </h4>
                        </div>
                        <button
                          type="button"
                          onClick={handleAddAllBlokFPreset}
                          className="text-[11px] font-black text-indigo-600 hover:text-indigo-700 cursor-pointer"
                        >
                          + Tambah Semua Blok F
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { name: 'Shopee', payload: '#LOK SHOPEE' },
                          { name: 'Tiktok', payload: '#LOK TIKTOK' },
                          { name: 'Studio', payload: '#LOK STUDIO' },
                        ].map((item) => (
                          <button
                            key={item.name}
                            type="button"
                            onClick={() => handleAddBlokFPreset(item.name)}
                            className="p-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 rounded-xl text-left transition-all cursor-pointer group"
                          >
                            <div className="font-mono font-black text-xs text-slate-900 dark:text-white group-hover:text-indigo-600">
                              {item.name}
                            </div>
                            <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                              {item.payload}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Perbaikan Section */}
                    <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-700/80">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-amber-600" />
                          <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                            Area Perbaikan
                          </h4>
                        </div>
                        <span className="text-[11px] font-bold text-slate-500">
                          DF001, PMK001, CC001
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => handleAddPerbaikanPreset('DF', 5)}
                          className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-400 rounded-xl text-left transition-all cursor-pointer"
                        >
                          <div className="font-mono font-black text-xs text-slate-900 dark:text-white">
                            DF001 - DF005
                          </div>
                          <div className="text-[10px] text-slate-400">#LOK DF001</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAddPerbaikanPreset('PMK', 5)}
                          className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-400 rounded-xl text-left transition-all cursor-pointer"
                        >
                          <div className="font-mono font-black text-xs text-slate-900 dark:text-white">
                            PMK001 - PMK005
                          </div>
                          <div className="text-[10px] text-slate-400">#LOK PMK001</div>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAddPerbaikanPreset('CC', 5)}
                          className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-amber-400 rounded-xl text-left transition-all cursor-pointer"
                        >
                          <div className="font-mono font-black text-xs text-slate-900 dark:text-white">
                            CC001 - CC005
                          </div>
                          <div className="text-[10px] text-slate-400">#LOK CC001</div>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. RANGE GENERATOR FORM */}
                {lokasiInputMode === 'range' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Prefix Nama Lokasi
                        </label>
                        <input
                          type="text"
                          value={rangePrefix}
                          onChange={(e) => setRangePrefix(e.target.value.toUpperCase())}
                          placeholder="Contoh: A, B, DF, PMK"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Nomor Awal
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={rangeStart}
                          onChange={(e) => setRangeStart(parseInt(e.target.value, 10) || 1)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Nomor Akhir
                        </label>
                        <input
                          type="number"
                          min="1"
                          value={rangeEnd}
                          onChange={(e) => setRangeEnd(parseInt(e.target.value, 10) || 1)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Digit Padding
                        </label>
                        <div className="grid grid-cols-4 gap-1.5">
                          {[
                            { val: 1, label: '1 (1)' },
                            { val: 2, label: '2 (01)' },
                            { val: 3, label: '3 (001)' },
                            { val: 4, label: '4 (0001)' },
                          ].map((item) => (
                            <button
                              key={item.val}
                              type="button"
                              onClick={() => setRangePadDigits(item.val)}
                              className={`py-1.5 text-center text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                                rangePadDigits === item.val
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {item.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Deskripsi Area Gudang
                        </label>
                        <input
                          type="text"
                          value={rangeZoneDesc}
                          onChange={(e) => setRangeZoneDesc(e.target.value)}
                          placeholder="Contoh: WAREHOUSE, BLOK F, PERBAIKAN"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                          Salinan:
                        </span>
                        <input
                          type="number"
                          min="1"
                          value={rangeCopies}
                          onChange={(e) => setRangeCopies(parseInt(e.target.value, 10) || 1)}
                          className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-center"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleGenerateRange}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>
                          Generate {Math.max(0, rangeEnd - rangeStart + 1)} Label Lokasi
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                {/* 3. KETIK SATUAN */}
                {lokasiInputMode === 'manual' && (
                  <form onSubmit={handleAddManualLokasi} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Nama / Kode Lokasi Custom <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={manualLocCode}
                          onChange={(e) => setManualLocCode(e.target.value)}
                          placeholder="Contoh: A001, SHOPEE, DF001, PMK001"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">
                          QR otomatis diformat sebagai <code>#LOK {manualLocCode.trim().toUpperCase() || 'A001'}</code>
                        </p>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Deskripsi Zona / Kategori
                        </label>
                        <input
                          type="text"
                          value={manualZoneDesc}
                          onChange={(e) => setManualZoneDesc(e.target.value)}
                          placeholder="Contoh: WAREHOUSE, BLOK F, PERBAIKAN"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                          Jumlah Salinan:
                        </span>
                        <input
                          type="number"
                          min="1"
                          value={manualCopies}
                          onChange={(e) => setManualCopies(parseInt(e.target.value, 10) || 1)}
                          className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-center"
                        />
                      </div>

                      <button
                        type="submit"
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ Tambah Lokasi ke Antrean</span>
                      </button>
                    </div>
                  </form>
                )}

                {/* 4. PASTE DAFTAR LOKASI */}
                {lokasiInputMode === 'import' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Tempelkan / Paste Daftar Nama Lokasi (Pisahkan Baris / Koma)
                      </label>
                      <textarea
                        rows={4}
                        value={pasteText}
                        onChange={(e) => setPasteText(e.target.value)}
                        placeholder={`A001\nA002\nSHOPEE\nTIKTOK\nDF001\nPMK001`}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleParsePaste}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                      >
                        <Upload className="w-4 h-4" />
                        <span>Impor Daftar Lokasi dengan QR #LOK</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* SUB-TAB 2: TAB PREFIX ACTION (#IN, #OUT, #SO) */}
          {subTab === 'prefix_action' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
              <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/60 rounded-xl text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black">QR Prefix Action WMS:</span> Tempelkan label QR ini di dinding / meja kerja untuk scan instant beralih mode scanner tanpa klik layar.
                </div>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                  Pilih Aksi WMS yang Ingin Dicetak:
                </span>
                <button
                  type="button"
                  onClick={handleAddAllMainActions}
                  className="text-xs font-black text-indigo-600 hover:text-indigo-700 cursor-pointer"
                >
                  + Tambah Semua Action (#IN, #OUT, #SO)
                </button>
              </div>

              {/* Tiga Utama: IN, OUT, SO */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 rounded-2xl flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-xl text-emerald-700 dark:text-emerald-300">
                        #IN
                      </span>
                      <span className="px-2 py-0.5 bg-emerald-200 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 rounded text-[10px] font-black">
                        SCAN MASUK
                      </span>
                    </div>
                    <p className="text-xs text-emerald-900 dark:text-emerald-300 font-medium mt-1">
                      Mode Penerimaan Barang &amp; Restock Stok
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddActionPrefix('#IN', 'SCAN MASUK (#IN)', 'Mode Penerimaan & Restock')}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Pilih #IN</span>
                  </button>
                </div>

                <div className="p-4 bg-rose-50 dark:bg-rose-950/40 border border-rose-300 dark:border-rose-800 rounded-2xl flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-xl text-rose-700 dark:text-rose-300">
                        #OUT
                      </span>
                      <span className="px-2 py-0.5 bg-rose-200 dark:bg-rose-900 text-rose-800 dark:text-rose-200 rounded text-[10px] font-black">
                        SCAN KELUAR
                      </span>
                    </div>
                    <p className="text-xs text-rose-900 dark:text-rose-300 font-medium mt-1">
                      Mode Pengiriman Paket &amp; Dispatch Pesanan
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddActionPrefix('#OUT', 'SCAN KELUAR (#OUT)', 'Mode Pengiriman & Dispatch')}
                    className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Pilih #OUT</span>
                  </button>
                </div>

                <div className="p-4 bg-purple-50 dark:bg-purple-950/40 border border-purple-300 dark:border-purple-800 rounded-2xl flex flex-col justify-between gap-3">
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-black text-xl text-purple-700 dark:text-purple-300">
                        #SO
                      </span>
                      <span className="px-2 py-0.5 bg-purple-200 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded text-[10px] font-black">
                        STOCK OPNAME
                      </span>
                    </div>
                    <p className="text-xs text-purple-900 dark:text-purple-300 font-medium mt-1">
                      Mode Audit Fisik &amp; Cek Selisih Stok
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAddActionPrefix('#SO', 'STOCK OPNAME (#SO)', 'Mode Audit Fisik Stok')}
                    className="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Pilih #SO</span>
                  </button>
                </div>
              </div>

              {/* Extra Action Presets */}
              <div className="pt-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Action WMS Tambahan:
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {WMS_QUICK_PREFIXES.filter((i) => !['#IN', '#OUT', '#SO'].includes(i.code)).map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => handleAddActionPrefix(item.code, item.title, item.subtitle)}
                      className="p-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 rounded-xl text-left transition-all cursor-pointer flex items-center justify-between"
                    >
                      <div>
                        <div className="font-mono font-black text-xs text-slate-900 dark:text-white">
                          {item.code}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[100px]">
                          {item.title}
                        </div>
                      </div>
                      <Plus className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* SUB-TAB 3: TAB CUSTOM */}
          {subTab === 'custom_qr' && (
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
              <div className="p-3 bg-purple-50/70 dark:bg-purple-950/30 border border-purple-200/80 dark:border-purple-800/60 rounded-xl text-xs text-purple-900 dark:text-purple-200 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black">Tab QR Custom:</span> Bebas menuliskan apa saja kebutuhan QR Code (Judul, Subtitle, Isi Teks / Payload, dan Badge Tag).
                </div>
              </div>

              <form onSubmit={handleAddCustomQr} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Judul Utama (Teks Besar) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customTitle}
                      onChange={(e) => {
                        setCustomTitle(e.target.value);
                        if (!customPayload || customPayload === customTitle) setCustomPayload(e.target.value);
                      }}
                      placeholder="Contoh: AREA PACKING, USER-01, BOX-5"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Isi QR Code / Payload Bebas <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={customPayload}
                      onChange={(e) => setCustomPayload(e.target.value)}
                      placeholder="Contoh: #PACKING, DATA-1234, https://..."
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Subtitle / Keterangan di Bawah Label
                    </label>
                    <input
                      type="text"
                      value={customSubtitle}
                      onChange={(e) => setCustomSubtitle(e.target.value)}
                      placeholder="Contoh: AREA DOKUMENTASI PACKING"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                      Badge Tag (Opsional)
                    </label>
                    <input
                      type="text"
                      value={customBadge}
                      onChange={(e) => setCustomBadge(e.target.value)}
                      placeholder="Contoh: CUSTOM, AREA, USER"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                      Jumlah Salinan:
                    </span>
                    <input
                      type="number"
                      min="1"
                      value={customCopies}
                      onChange={(e) => setCustomCopies(parseInt(e.target.value, 10) || 1)}
                      className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-center"
                    />
                  </div>

                  <button
                    type="submit"
                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>+ Tambah QR Custom ke Antrean</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TABLE ANTREAN CETAK LOKASI / PREFIX */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-800/40">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Daftar Antrean Cetak ({queue.length})
                </h3>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => handleSelectAll(true)}
                  className="text-[11px] font-bold text-emerald-600 hover:underline"
                >
                  Pilih Semua
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => handleSelectAll(false)}
                  className="text-[11px] font-bold text-slate-500 hover:underline"
                >
                  Batal Semua
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleClearQueue}
                  className="text-[11px] font-bold text-rose-500 hover:underline"
                >
                  Kosongkan
                </button>
              </div>
            </div>

            {/* Search Queue */}
            <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari item di antrean..."
                  className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium"
                />
              </div>
            </div>

            {/* List Table */}
            <div className="max-h-[320px] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {filteredQueue.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-xs font-medium">
                  Antrean cetak kosong. Pilih preset atau buat label baru di atas.
                </div>
              ) : (
                filteredQueue.map((item, idx) => {
                  const isSelected = item.selected !== false;
                  return (
                    <div
                      key={item.id}
                      className={`p-3 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all ${
                        isSelected ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/80 opacity-60'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                          className="w-4 h-4 text-emerald-600 rounded cursor-pointer"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                              {item.locCode}
                            </span>
                            {item.tagBadge && (
                              <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[9px] font-bold">
                                {item.tagBadge}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-mono text-slate-500 truncate mt-0.5">
                            QR: <code>{item.qrPayload}</code> {item.zoneDesc ? `• ${item.zoneDesc}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-slate-50 dark:bg-slate-800">
                          <button
                            type="button"
                            onClick={() => handleUpdateCopies(item.id, -1)}
                            className="px-2 py-1 text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs"
                          >
                            -
                          </button>
                          <span className="px-2 font-mono font-black text-xs text-slate-900 dark:text-white">
                            {item.copies || 1}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleUpdateCopies(item.id, 1)}
                            className="px-2 py-1 text-slate-600 hover:bg-slate-200 dark:hover:bg-slate-700 font-bold text-xs"
                          >
                            +
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleDeleteItem(item.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PRATINJAU & SETTING ADVANCE (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* LIVE PREVIEW CARD */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Pratinjau Label Stiker
                </h3>
              </div>

              {selectedItems.length > 1 && (
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewIndex((prev) => (prev > 0 ? prev - 1 : selectedItems.length - 1))
                    }
                    className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-bold hover:bg-slate-100"
                  >
                    &lt;
                  </button>
                  <span>
                    {previewIndex + 1} / {selectedItems.length}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setPreviewIndex((prev) => (prev < selectedItems.length - 1 ? prev + 1 : 0))
                    }
                    className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded font-bold hover:bg-slate-100"
                  >
                    &gt;
                  </button>
                </div>
              )}
            </div>

            <div className="p-5 bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center min-h-[220px]">
              {currentPreviewItem ? (
                <div
                  className={`bg-white text-black p-3.5 rounded-xl shadow-md border border-slate-300 transition-all ${
                    settings.media === 'a6_4' || settings.media === 'a6_6'
                      ? 'w-[290px] min-h-[160px]'
                      : 'w-[320px] min-h-[170px]'
                  }`}
                >
                  {/* Top Bar: Code & Badge */}
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-1.5 mb-2">
                    <span
                      className="font-mono font-black text-black leading-tight"
                      style={{
                        fontSize:
                          settings.codeFontSize === 'normal'
                            ? '1.2rem'
                            : settings.codeFontSize === 'large'
                            ? '1.5rem'
                            : settings.codeFontSize === 'jumbo'
                            ? '2.2rem'
                            : '1.8rem',
                      }}
                    >
                      {currentPreviewItem.locCode}
                    </span>
                    {settings.showTagBadge && currentPreviewItem.tagBadge && (
                      <span className="px-2 py-0.5 bg-black text-white rounded text-[10px] font-black uppercase tracking-wider">
                        {currentPreviewItem.tagBadge}
                      </span>
                    )}
                  </div>

                  {/* QR Image Box */}
                  <div className="flex items-center justify-center my-2">
                    {qrCache[currentPreviewItem.qrPayload] ? (
                      <img
                        src={qrCache[currentPreviewItem.qrPayload]}
                        alt={currentPreviewItem.qrPayload}
                        className="object-contain"
                        style={{
                          width:
                            settings.qrSize === 'small'
                              ? '70px'
                              : settings.qrSize === 'normal'
                              ? '85px'
                              : settings.qrSize === 'xlarge'
                              ? '130px'
                              : settings.qrSize === 'jumbo'
                              ? '150px'
                              : '110px',
                          height:
                            settings.qrSize === 'small'
                              ? '70px'
                              : settings.qrSize === 'normal'
                              ? '85px'
                              : settings.qrSize === 'xlarge'
                              ? '130px'
                              : settings.qrSize === 'jumbo'
                              ? '150px'
                              : '110px',
                        }}
                      />
                    ) : (
                      <div className="w-24 h-24 bg-slate-100 flex items-center justify-center text-xs text-slate-400 font-mono">
                        Loading QR...
                      </div>
                    )}
                  </div>

                  {/* Payload Text */}
                  {settings.showQrPayloadText && (
                    <div className="text-center font-mono font-bold text-[11px] text-slate-700 mt-1">
                      {currentPreviewItem.qrPayload}
                    </div>
                  )}

                  {/* Subtitle / Zone Desc */}
                  {settings.showZoneDesc && currentPreviewItem.zoneDesc && (
                    <div className="text-center bg-slate-100 text-slate-900 font-extrabold text-[11px] uppercase tracking-wider py-1 px-2 rounded-lg mt-1.5">
                      {currentPreviewItem.zoneDesc}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-slate-400 text-xs">Pilih item untuk pratinjau</div>
              )}
            </div>
          </div>

          {/* ADVANCE SETTINGS PANEL */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAdvanceSettings((prev) => !prev)}
              className="w-full p-4 flex items-center justify-between bg-slate-50/60 dark:bg-slate-800/40 hover:bg-slate-100 transition-all cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Setting Advance Label (A6 &amp; Ukuran)
                </h3>
              </div>
              <span className="text-xs font-bold text-emerald-600">
                {showAdvanceSettings ? 'Sembunyikan ▲' : 'Buka Pengaturan ▼'}
              </span>
            </button>

            {showAdvanceSettings && (
              <div className="p-4 sm:p-5 space-y-4 border-t border-slate-200 dark:border-slate-800">
                {/* 1. Ukuran Label / Format Kertas */}
                <div>
                  <label className="block text-xs font-black text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                    <Grid className="w-3.5 h-3.5 text-emerald-600" />
                    Ukuran Label &amp; Kertas:
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { key: 'a6_4', label: '1 A6 = 4 QR (Default Standards)' },
                      { key: 'a6_1', label: '1 A6 = 1 QR Jumbo' },
                      { key: 'a6_6', label: '1 A6 = 6 QR Kompak' },
                      { key: 'thermal_100x50', label: 'Thermal Roll 100x50 mm' },
                      { key: 'thermal_80x50', label: 'Thermal Roll 80x50 mm' },
                      { key: 'thermal_70x40', label: 'Thermal Roll 70x40 mm' },
                      { key: 'thermal_50x30', label: 'Thermal Roll 50x30 mm' },
                    ].map((m) => (
                      <button
                        key={m.key}
                        type="button"
                        onClick={() => updateSettings({ media: m.key as LocationPrintMedia })}
                        className={`p-2 rounded-xl text-xs font-bold text-left border transition-all cursor-pointer ${
                          settings.media === m.key
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 2. Ukuran Font */}
                <div>
                  <label className="block text-xs font-black text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-emerald-600" />
                    Ukuran Font Kode / Judul:
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { key: 'normal', label: 'Normal' },
                      { key: 'large', label: 'Large' },
                      { key: 'xlarge', label: 'X-Large' },
                      { key: 'jumbo', label: 'Jumbo' },
                    ].map((f) => (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => updateSettings({ codeFontSize: f.key as any })}
                        className={`py-1.5 text-center text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          settings.codeFontSize === f.key
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 3. Ukuran QR Code */}
                <div>
                  <label className="block text-xs font-black text-slate-900 dark:text-white mb-1.5 flex items-center gap-1.5">
                    <Maximize2 className="w-3.5 h-3.5 text-emerald-600" />
                    Ukuran Gambar QR Code:
                  </label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {[
                      { key: 'small', label: 'Kecil' },
                      { key: 'normal', label: 'Sedang' },
                      { key: 'large', label: 'Besar' },
                      { key: 'xlarge', label: 'X-Large' },
                      { key: 'jumbo', label: 'Jumbo' },
                    ].map((q) => (
                      <button
                        key={q.key}
                        type="button"
                        onClick={() => updateSettings({ qrSize: q.key as any })}
                        className={`py-1.5 text-center text-[11px] font-bold rounded-lg border transition-all cursor-pointer ${
                          settings.qrSize === q.key
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 4. Opsi Tampilan Elements */}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={settings.showCutLines}
                      onChange={(e) => updateSettings({ showCutLines: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span>Tampilkan Garis Potong Putus-putus (Sangat membantu cetak A6)</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={settings.showZoneDesc}
                      onChange={(e) => updateSettings({ showZoneDesc: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span>Tampilkan Subtitle Keterangan / Deskripsi Area</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={settings.showTagBadge}
                      onChange={(e) => updateSettings({ showTagBadge: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span>Tampilkan Badge Tag Hitam di Atas</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={settings.showQrPayloadText}
                      onChange={(e) => updateSettings({ showQrPayloadText: e.target.checked })}
                      className="w-4 h-4 text-emerald-600 rounded"
                    />
                    <span>Tampilkan Teks Isi QR Code di Bawah Gambar QR</span>
                  </label>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CetakLokasiRakTab;
