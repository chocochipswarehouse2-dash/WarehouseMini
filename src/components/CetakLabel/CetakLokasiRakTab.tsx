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
  FileSpreadsheet,
  Download,
  Search,
  Sliders,
  ChevronRight,
  Info,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  LocationLabelItem,
  LocationLabelSettings,
  LocationPrintMedia,
  DEFAULT_LOCATION_SETTINGS,
} from './types';

const STORAGE_QUEUE_KEY = 'wms_location_barcode_queue_v1';
const STORAGE_SETTINGS_KEY = 'wms_location_barcode_settings_v1';

const DEFAULT_SAMPLE_ITEMS: LocationLabelItem[] = [
  {
    id: 'sample-1',
    locCode: 'A-001',
    qrPayload: '#LOK A001',
    zoneDesc: 'WAREHOUSE - DRESS',
    tagBadge: 'ZONA A',
    copies: 1,
    selected: true,
  },
  {
    id: 'sample-2',
    locCode: 'A-002',
    qrPayload: '#LOK A002',
    zoneDesc: 'WAREHOUSE - DRESS',
    tagBadge: 'ZONA A',
    copies: 1,
    selected: true,
  },
  {
    id: 'sample-3',
    locCode: 'A-003',
    qrPayload: '#LOK A003',
    zoneDesc: 'WAREHOUSE - DRESS',
    tagBadge: 'ZONA A',
    copies: 1,
    selected: true,
  },
  {
    id: 'sample-4',
    locCode: 'B-001',
    qrPayload: '#LOK B001',
    zoneDesc: 'WAREHOUSE - TOP & ATASAN',
    tagBadge: 'ZONA B',
    copies: 1,
    selected: true,
  },
];

export const CetakLokasiRakTab: React.FC = () => {
  // Mode Input Sub-tabs: 'range' | 'manual' | 'import'
  const [inputMode, setInputMode] = useState<'range' | 'manual' | 'import'>('range');

  // Print Settings
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

  // Queue of Locations to print
  const [queue, setQueue] = useState<LocationLabelItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_QUEUE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
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
      return await QRCode.toDataURL(text || ' ', {
        errorCorrectionLevel: 'H',
        margin: 1,
        scale: 8,
        color: { dark: '#000000', light: '#ffffff' },
      });
    } catch (err) {
      console.error('Error generating QR:', err);
      return '';
    }
  }, []);

  // Sync QR Cache for queue items
  useEffect(() => {
    const unCached = queue.filter((i) => !qrCache[i.qrPayload]);
    if (unCached.length === 0) return;

    let isMounted = true;
    (async () => {
      const newEntries: Record<string, string> = {};
      for (const item of unCached) {
        if (!newEntries[item.qrPayload]) {
          const url = await generateQr(item.qrPayload);
          if (url) newEntries[item.qrPayload] = url;
        }
      }
      if (isMounted && Object.keys(newEntries).length > 0) {
        setQrCache((prev) => ({ ...prev, ...newEntries }));
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [queue, qrCache, generateQr]);

  // ==========================================
  // 1. RANGE GENERATOR FORM STATE
  // ==========================================
  const [rangePrefix, setRangePrefix] = useState('A-');
  const [rangeStart, setRangeStart] = useState<number>(1);
  const [rangeEnd, setRangeEnd] = useState<number>(20);
  const [rangePadDigits, setRangePadDigits] = useState<number>(3);
  const [rangePayloadFormat, setRangePayloadFormat] = useState<
    '#LOK_COMPACT' | '#LOK_RAW' | '#LOC_RAW' | 'RAW_ONLY' | 'CUSTOM'
  >('#LOK_COMPACT');
  const [rangeCustomPrefix, setRangeCustomPrefix] = useState('#LOK ');
  const [rangeZoneDesc, setRangeZoneDesc] = useState('WAREHOUSE - DRESS');
  const [rangeTagBadge, setRangeTagBadge] = useState('ZONA A');
  const [rangeCopies, setRangeCopies] = useState<number>(1);

  // ==========================================
  // 2. MANUAL SINGLE FORM STATE
  // ==========================================
  const [manualCode, setManualCode] = useState('');
  const [manualPayload, setManualPayload] = useState('');
  const [manualZoneDesc, setManualZoneDesc] = useState('WAREHOUSE - DRESS');
  const [manualTagBadge, setManualTagBadge] = useState('');
  const [manualCopies, setManualCopies] = useState<number>(1);

  // Auto-fill manual payload when typing manual code
  const handleManualCodeChange = (val: string) => {
    setManualCode(val);
    const compact = val.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    if (compact) {
      setManualPayload(`#LOK ${compact}`);
    } else {
      setManualPayload('');
    }
  };

  // ==========================================
  // 3. IMPORT / PASTE STATE
  // ==========================================
  const [pasteText, setPasteText] = useState('');

  // Queue table filter & active preview
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
        item.locCode.toLowerCase().includes(q) ||
        item.qrPayload.toLowerCase().includes(q) ||
        item.zoneDesc.toLowerCase().includes(q) ||
        (item.tagBadge && item.tagBadge.toLowerCase().includes(q))
    );
  }, [queue, searchQuery]);

  const currentPreviewItem = selectedItems[previewIndex] || selectedItems[0] || queue[0] || null;

  // ==========================================
  // ACTIONS: GENERATE RANGE
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

    for (let n = rangeStart; n <= rangeEnd; n++) {
      const numStr = String(n).padStart(rangePadDigits, '0');
      const code = `${rangePrefix}${numStr}`;

      let payload = '';
      if (rangePayloadFormat === '#LOK_COMPACT') {
        const compact = code.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
        payload = `#LOK ${compact}`;
      } else if (rangePayloadFormat === '#LOK_RAW') {
        payload = `#LOK ${code.toUpperCase()}`;
      } else if (rangePayloadFormat === '#LOC_RAW') {
        payload = `#LOC ${code.toUpperCase()}`;
      } else if (rangePayloadFormat === 'RAW_ONLY') {
        payload = code.toUpperCase();
      } else {
        payload = `${rangeCustomPrefix}${code.toUpperCase()}`;
      }

      newItems.push({
        id: `loc_${Date.now()}_${n}_${Math.random().toString(36).substring(2, 6)}`,
        locCode: code.toUpperCase(),
        qrPayload: payload,
        zoneDesc: rangeZoneDesc.trim(),
        tagBadge: rangeTagBadge.trim() || undefined,
        copies: Math.max(1, rangeCopies),
        selected: true,
      });
    }

    setQueue((prev) => [...newItems, ...prev]);
    alert(`Berhasil membuat ${newItems.length} label lokasi (${rangePrefix}${String(rangeStart).padStart(rangePadDigits, '0')} s/d ${rangePrefix}${String(rangeEnd).padStart(rangePadDigits, '0')}) ke antrean.`);
  };

  // ==========================================
  // ACTIONS: MANUAL ADD
  // ==========================================
  const handleAddManual = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) {
      alert('Mohon isi kode lokasi (misal A-001).');
      return;
    }

    const payload =
      manualPayload.trim() ||
      `#LOK ${manualCode.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`;

    const newItem: LocationLabelItem = {
      id: `loc_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      locCode: manualCode.trim().toUpperCase(),
      qrPayload: payload,
      zoneDesc: manualZoneDesc.trim(),
      tagBadge: manualTagBadge.trim() || undefined,
      copies: Math.max(1, manualCopies),
      selected: true,
    };

    setQueue((prev) => [newItem, ...prev]);
    setManualCode('');
    setManualPayload('');
  };

  // ==========================================
  // ACTIONS: IMPORT / PASTE
  // ==========================================
  const handleParsePaste = () => {
    if (!pasteText.trim()) {
      alert('Mohon tempelkan teks daftar lokasi terlebih dahulu.');
      return;
    }

    const lines = pasteText.split('\n').map((l) => l.trim()).filter(Boolean);
    const parsed: LocationLabelItem[] = [];

    lines.forEach((line, idx) => {
      // CSV or Tab separated: CODE, ZONE, PAYLOAD, COPIES, BADGE
      const parts = line.split(/[,\t;]/).map((p) => p.trim());
      const locCode = parts[0] ? parts[0].toUpperCase() : '';
      if (!locCode) return;

      const zoneDesc = parts[1] || 'WAREHOUSE';
      const payload = parts[2] || `#LOK ${locCode.replace(/[^a-zA-Z0-9]/g, '')}`;
      const copies = parseInt(parts[3], 10) || 1;
      const tagBadge = parts[4] || undefined;

      parsed.push({
        id: `import_${Date.now()}_${idx}`,
        locCode,
        zoneDesc,
        qrPayload: payload,
        copies,
        tagBadge,
        selected: true,
      });
    });

    if (parsed.length === 0) {
      alert('Tidak ada data lokasi yang valid ditemukan.');
      return;
    }

    setQueue((prev) => [...parsed, ...prev]);
    setPasteText('');
    alert(`Berhasil mengimpor ${parsed.length} lokasi ke antrean cetak.`);
  };

  // ==========================================
  // QUEUE ACTIONS
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

  const handleDeleteSelected = () => {
    setQueue((prev) => prev.filter((i) => i.selected === false));
  };

  const handleClearQueue = () => {
    if (window.confirm('Kosongkan semua antrean cetak barcode lokasi?')) {
      setQueue([]);
    }
  };

  // ==========================================
  // PRINT EXECUTION ENGINE
  // ==========================================
  const handlePrint = async () => {
    if (selectedItems.length === 0) {
      alert('Pilih minimal 1 lokasi untuk dicetak.');
      return;
    }

    setIsPrinting(true);

    try {
      // 1. Ensure all QR images are ready
      const qrDataMap: Record<string, string> = { ...qrCache };
      for (const item of selectedItems) {
        if (!qrDataMap[item.qrPayload]) {
          qrDataMap[item.qrPayload] = await generateQr(item.qrPayload);
        }
      }
      setQrCache(qrDataMap);

      // 2. Media Dimensions & Page Rule
      const media = settings.media;
      let pageCss = '';
      let isA6Sheet = false;
      let gridPerSheet = 1;

      if (media === 'thermal_100x50') {
        pageCss = '@page { size: 100mm 50mm landscape; margin: 0; }';
      } else if (media === 'thermal_80x50') {
        pageCss = '@page { size: 80mm 50mm landscape; margin: 0; }';
      } else if (media === 'thermal_70x40') {
        pageCss = '@page { size: 70mm 40mm landscape; margin: 0; }';
      } else if (media === 'thermal_50x30') {
        pageCss = '@page { size: 50mm 30mm landscape; margin: 0; }';
      } else if (media === 'thermal_50x20') {
        pageCss = '@page { size: 50mm 20mm landscape; margin: 0; }';
      } else if (media.startsWith('a6_')) {
        isA6Sheet = true;
        gridPerSheet = parseInt(media.replace('a6_', ''), 10) || 4;
        pageCss = '@page { size: 105mm 148mm portrait; margin: 4mm; }';
      }

      // Font size mapping in pt
      const codePt =
        settings.codeFontSize === 'normal'
          ? '20pt'
          : settings.codeFontSize === 'large'
          ? '26pt'
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

      // Build Items Array flattened by copies
      const flattenedItems: LocationLabelItem[] = [];
      selectedItems.forEach((it) => {
        const c = Math.max(1, it.copies || 1);
        for (let i = 0; i < c; i++) {
          flattenedItems.push(it);
        }
      });

      // Generate HTML Content
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
        // Thermal roll: 1 card per page
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

      // 3. Render in Hidden Iframe
      let iframe = document.getElementById('location-barcode-print-iframe') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'location-barcode-print-iframe';
        iframe.style.position = 'fixed';
        iframe.style.right = '0';
        iframe.style.bottom = '0';
        iframe.style.width = '0';
        iframe.style.height = '0';
        iframe.style.border = '0';
        document.body.appendChild(iframe);
      }

      const doc = iframe.contentWindow?.document || iframe.contentDocument;
      if (!doc) throw new Error('Could not access print frame document');

      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8" />
          <title>Cetak QR Barcode Lokasi Rak</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@700;800;900&family=JetBrains+Mono:wght@700;800;900&display=swap" rel="stylesheet">
          <style>
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
              background: #fff;
              color: #000;
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

            /* A6 Sheet Grid */
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

            /* Inner Card Styling */
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
            .loc-header-bar {
              display: flex;
              align-items: center;
              justify-content: space-between;
              border-bottom: 2px solid #000;
              padding-bottom: 1mm;
              margin-bottom: 1mm;
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

      setTimeout(() => {
        setIsPrinting(false);
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      }, 500);
    } catch (err) {
      console.error('Print failed:', err);
      setIsPrinting(false);
      alert('Gagal menjalankan proses cetak printer thermal.');
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

    // Default Stacked (Kode di Atas BESAR, QR di Tengah, Zona di Bawah)
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
      {/* 1. TOP STATS & QUICK ACTIONS                              */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div className="p-3 bg-emerald-600/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl border border-emerald-200 dark:border-emerald-800">
              <MapPin className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  QR Code Lokasi Rak &amp; Bin
                </h2>
                <span className="px-2.5 py-0.5 text-[11px] font-black uppercase bg-emerald-100 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 rounded-full">
                  Prefix WMS (#LOK)
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Cetak label lokasi rak dengan huruf besar terlihat jelas dari kejauhan, QR code lega mudah discan scanner, dan isi otomatis prefix <code>#LOK A001</code>.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-center">
              <div className="text-[11px] font-bold text-slate-500">Antrean Lokasi</div>
              <div className="text-base font-black text-slate-900 dark:text-white">
                {queue.length} <span className="text-xs font-semibold text-slate-400">rak</span>
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
              disabled={selectedItems.length === 0 || isPrinting}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Menyiapkan...' : `Cetak ${totalSelectedCopies} Stiker Lokasi`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. DUA KOLOM: GENERATOR & PREVIEW + SETTINGS              */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        {/* Left Column: Input Modes (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
            {/* Input Navigation Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850/50 p-1.5 gap-1">
              <button
                type="button"
                onClick={() => setInputMode('range')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  inputMode === 'range'
                    ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Generator Range Lokasi (A-001 s/d A-050)</span>
              </button>

              <button
                type="button"
                onClick={() => setInputMode('manual')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  inputMode === 'manual'
                    ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Ketik Satuan</span>
              </button>

              <button
                type="button"
                onClick={() => setInputMode('import')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  inputMode === 'import'
                    ? 'bg-white dark:bg-slate-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Paste / CSV</span>
              </button>
            </div>

            <div className="p-4 sm:p-5">
              {/* SUB-TAB 1: RANGE GENERATOR */}
              {inputMode === 'range' && (
                <div className="space-y-4">
                  <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 rounded-xl text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
                    <Info className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-black">Fitur Range Generator:</span> Anda bisa menentukan nomor rak awal sampai nomor rak akhir secara otomatis (contoh: dari <code>A-001</code> sampai <code>A-050</code>). Isi barcode otomatis diformat dengan prefix <code>#LOK A001</code> agar siap ditembak scanner WMS.
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Prefix Blok / Rak
                      </label>
                      <input
                        type="text"
                        value={rangePrefix}
                        onChange={(e) => setRangePrefix(e.target.value.toUpperCase())}
                        placeholder="Contoh: A-, B-, RAK-A-"
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
                        Digit Padding Nomor
                      </label>
                      <div className="grid grid-cols-4 gap-1.5">
                        {[
                          { val: 1, label: '1 (1, 2)' },
                          { val: 2, label: '2 (01, 02)' },
                          { val: 3, label: '3 (001, 002)' },
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
                        Format Isi QR Barcode (Prefix WMS)
                      </label>
                      <select
                        value={rangePayloadFormat}
                        onChange={(e) => setRangePayloadFormat(e.target.value as any)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                      >
                        <option value="#LOK_COMPACT">
                          #LOK A001 (Kompak tanpa strip - Standar WMS)
                        </option>
                        <option value="#LOK_RAW">
                          #LOK A-001 (Dengan strip)
                        </option>
                        <option value="#LOC_RAW">#LOC A-001</option>
                        <option value="RAW_ONLY">A-001 (Tanpa prefix)</option>
                        <option value="CUSTOM">Custom Prefix...</option>
                      </select>
                    </div>
                  </div>

                  {rangePayloadFormat === 'CUSTOM' && (
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Ketik Prefix Custom
                      </label>
                      <input
                        type="text"
                        value={rangeCustomPrefix}
                        onChange={(e) => setRangeCustomPrefix(e.target.value)}
                        placeholder="Contoh: #BIN , #SHELF-"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Deskripsi Zona / Kategori di Bawah Label
                      </label>
                      <input
                        type="text"
                        value={rangeZoneDesc}
                        onChange={(e) => setRangeZoneDesc(e.target.value)}
                        placeholder="Contoh: WAREHOUSE - DRESS, LANTAI 1, AREA RETUR"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Badge / Tag (Opsional)
                      </label>
                      <input
                        type="text"
                        value={rangeTagBadge}
                        onChange={(e) => setRangeTagBadge(e.target.value)}
                        placeholder="Contoh: ZONA A, LEVEL 1"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        Salinan per Rak:
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
                        Generate {Math.max(0, rangeEnd - rangeStart + 1)} Label ke Antrean
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: MANUAL SATUAN */}
              {inputMode === 'manual' && (
                <form onSubmit={handleAddManual} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Kode Lokasi Rak (Teks Besar) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={manualCode}
                        onChange={(e) => handleManualCodeChange(e.target.value)}
                        placeholder="Contoh: A-001, B-102, RAK-C-05"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Isi Barcode QR (Format Scan WMS)
                      </label>
                      <input
                        type="text"
                        value={manualPayload}
                        onChange={(e) => setManualPayload(e.target.value)}
                        placeholder="Contoh: #LOK A001"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Deskripsi Zona / Kategori
                      </label>
                      <input
                        type="text"
                        value={manualZoneDesc}
                        onChange={(e) => setManualZoneDesc(e.target.value)}
                        placeholder="Contoh: WAREHOUSE - DRESS"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Badge / Label Tag (Opsional)
                      </label>
                      <input
                        type="text"
                        value={manualTagBadge}
                        onChange={(e) => setManualTagBadge(e.target.value)}
                        placeholder="Contoh: ZONA A, RAK UTAMA"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        Jumlah Stiker:
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

              {/* SUB-TAB 3: PASTE / CSV */}
              {inputMode === 'import' && (
                <div className="space-y-3">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Tempelkan daftar lokasi dalam format baris per baris. <br />
                    Format per baris: <code className="font-mono bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded">KODE_RAK, ZONA, ISI_QR, JUMLAH_STIKER</code>
                  </div>

                  <textarea
                    rows={6}
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={`A-001, WAREHOUSE - DRESS, #LOK A001, 1, ZONA A\nA-002, WAREHOUSE - DRESS, #LOK A002, 1, ZONA A\nB-001, WAREHOUSE - TOP, #LOK B001, 2, ZONA B`}
                    className="w-full p-3 font-mono text-xs bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setPasteText('')}
                      className="px-3 py-1.5 text-slate-500 text-xs font-bold hover:text-slate-700"
                    >
                      Bersihkan
                    </button>
                    <button
                      type="button"
                      onClick={handleParsePaste}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-4 h-4" />
                      <span>Impor ke Antrean</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Realistic Live Preview & Visual Customizer (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-850/50">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Pratinjau Stiker Lokasi
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

            {/* Visual Preview Box */}
            <div className="p-5 bg-slate-100 dark:bg-slate-950 flex flex-col items-center justify-center min-h-[220px]">
              {currentPreviewItem ? (
                <div
                  className={`bg-white text-black p-3.5 rounded-xl shadow-md border border-slate-300 transition-all ${
                    settings.media === 'thermal_50x20'
                      ? 'w-[280px] min-h-[120px]'
                      : settings.media === 'thermal_50x30'
                      ? 'w-[300px] min-h-[150px]'
                      : 'w-[320px] min-h-[170px]'
                  } ${settings.isRotated180 ? 'rotate-180' : ''}`}
                >
                  {settings.layout === 'side-by-side' ? (
                    <div className="flex items-center gap-3 h-full">
                      <div className="w-20 h-20 bg-white p-1 rounded border border-slate-200 shrink-0 flex items-center justify-center">
                        {qrCache[currentPreviewItem.qrPayload] ? (
                          <img
                            src={qrCache[currentPreviewItem.qrPayload]}
                            alt="QR"
                            className="w-full h-full object-contain [image-rendering:pixelated]"
                          />
                        ) : (
                          <QrCode className="w-12 h-12 text-slate-400" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        {settings.showTagBadge && currentPreviewItem.tagBadge && (
                          <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-black text-white rounded">
                            {currentPreviewItem.tagBadge}
                          </span>
                        )}
                        <div
                          className={`font-mono font-black text-slate-950 tracking-tight leading-none my-1 ${
                            settings.codeFontSize === 'jumbo'
                              ? 'text-3xl'
                              : settings.codeFontSize === 'xlarge'
                              ? 'text-2xl'
                              : 'text-xl'
                          }`}
                        >
                          {currentPreviewItem.locCode}
                        </div>
                        {settings.showQrPayloadText && (
                          <div className="font-mono text-[10px] font-bold text-slate-600">
                            {currentPreviewItem.qrPayload}
                          </div>
                        )}
                        {settings.showZoneDesc && currentPreviewItem.zoneDesc && (
                          <div className="mt-1.5 px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-black text-slate-800 truncate uppercase">
                            {currentPreviewItem.zoneDesc}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col justify-between h-full space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div
                          className={`font-mono font-black text-slate-950 tracking-tight leading-none ${
                            settings.codeFontSize === 'jumbo'
                              ? 'text-3xl'
                              : settings.codeFontSize === 'xlarge'
                              ? 'text-2xl'
                              : 'text-xl'
                          }`}
                        >
                          {currentPreviewItem.locCode}
                        </div>
                        {settings.showTagBadge && currentPreviewItem.tagBadge && (
                          <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-black text-white rounded">
                            {currentPreviewItem.tagBadge}
                          </span>
                        )}
                      </div>

                      <div className="flex justify-center py-1">
                        <div
                          className={`bg-white p-1 rounded border border-slate-200 flex items-center justify-center ${
                            settings.qrSize === 'jumbo'
                              ? 'w-24 h-24'
                              : settings.qrSize === 'xlarge'
                              ? 'w-20 h-20'
                              : settings.qrSize === 'large'
                              ? 'w-18 h-18'
                              : 'w-16 h-16'
                          }`}
                        >
                          {qrCache[currentPreviewItem.qrPayload] ? (
                            <img
                              src={qrCache[currentPreviewItem.qrPayload]}
                              alt="QR"
                              className="w-full h-full object-contain [image-rendering:pixelated]"
                            />
                          ) : (
                            <QrCode className="w-12 h-12 text-slate-400" />
                          )}
                        </div>
                      </div>

                      {settings.showQrPayloadText && (
                        <div className="text-center font-mono text-[10px] font-bold text-slate-600">
                          {currentPreviewItem.qrPayload}
                        </div>
                      )}

                      {settings.showZoneDesc && currentPreviewItem.zoneDesc && (
                        <div className="px-2 py-1 bg-slate-100 rounded text-[10px] font-black text-slate-800 text-center uppercase tracking-wider truncate">
                          {currentPreviewItem.zoneDesc}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400">Tidak ada item dalam antrean</div>
              )}
            </div>

            {/* Customizer Controls */}
            <div className="p-4 bg-white dark:bg-slate-900 space-y-3.5 border-t border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Ukuran Media Cetak
                </label>
                <select
                  value={settings.media}
                  onChange={(e) => updateSettings({ media: e.target.value as LocationPrintMedia })}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-bold"
                >
                  <option value="thermal_100x50">Thermal 100 × 50 mm (Rekomendasi Rak Lorong)</option>
                  <option value="thermal_80x50">Thermal 80 × 50 mm</option>
                  <option value="thermal_70x40">Thermal 70 × 40 mm</option>
                  <option value="thermal_50x30">Thermal 50 × 30 mm</option>
                  <option value="thermal_50x20">Thermal 50 × 20 mm (Stiker Standar)</option>
                  <option value="a6_1">Kertas A6 (1 Rak Raksasa per Lembar)</option>
                  <option value="a6_2">Kertas A6 (2 Rak per Lembar)</option>
                  <option value="a6_4">Kertas A6 (4 Rak per Lembar)</option>
                  <option value="a6_6">Kertas A6 (6 Rak per Lembar)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ukuran Huruf Lokasi
                  </label>
                  <select
                    value={settings.codeFontSize}
                    onChange={(e) => updateSettings({ codeFontSize: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold"
                  >
                    <option value="normal">Normal (20pt)</option>
                    <option value="large">Besar (26pt)</option>
                    <option value="xlarge">Sangat Besar (32pt)</option>
                    <option value="jumbo">Jumbo Raksasa (42pt)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ukuran QR Code
                  </label>
                  <select
                    value={settings.qrSize}
                    onChange={(e) => updateSettings({ qrSize: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold"
                  >
                    <option value="small">Sedang (22mm)</option>
                    <option value="normal">Standar (28mm)</option>
                    <option value="large">Besar (34mm)</option>
                    <option value="xlarge">Ekstra Besar (40mm)</option>
                    <option value="jumbo">Jumbo (46mm)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Tata Letak
                  </label>
                  <select
                    value={settings.layout}
                    onChange={(e) => updateSettings({ layout: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold"
                  >
                    <option value="stacked">Tumpuk (Kode Atas - QR - Zona)</option>
                    <option value="side-by-side">Berdampingan (QR Kiri - Teks Kanan)</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.isRotated180}
                      onChange={(e) => updateSettings({ isRotated180: e.target.checked })}
                      className="rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Putar 180°
                    </span>
                  </label>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-wrap gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold">
                  <input
                    type="checkbox"
                    checked={settings.showZoneDesc}
                    onChange={(e) => updateSettings({ showZoneDesc: e.target.checked })}
                    className="rounded text-emerald-600"
                  />
                  <span>Tampilkan Zona</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold">
                  <input
                    type="checkbox"
                    checked={settings.showTagBadge}
                    onChange={(e) => updateSettings({ showTagBadge: e.target.checked })}
                    className="rounded text-emerald-600"
                  />
                  <span>Tampilkan Badge</span>
                </label>

                <label className="flex items-center gap-1.5 cursor-pointer text-[11px] font-bold">
                  <input
                    type="checkbox"
                    checked={settings.showQrPayloadText}
                    onChange={(e) => updateSettings({ showQrPayloadText: e.target.checked })}
                    className="rounded text-emerald-600"
                  />
                  <span>Tampilkan Teks Prefix</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. DAFTAR ANTREAN CETAK LOKASI RAK                        */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-850/50">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Daftar Antrean Cetak Lokasi
            </h3>
            <span className="px-2.5 py-0.5 text-xs font-black bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-full">
              {queue.length} Lokasi / {totalSelectedCopies} Lembar Terpilih
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari lokasi rak..."
                className="pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 w-40"
              />
            </div>

            <button
              type="button"
              onClick={() => handleSelectAll(true)}
              className="px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold cursor-pointer"
            >
              Pilih Semua
            </button>

            <button
              type="button"
              onClick={handleDeleteSelected}
              className="px-2.5 py-1.5 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-300 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Hapus Terpilih</span>
            </button>

            <button
              type="button"
              onClick={handleClearQueue}
              className="px-2.5 py-1.5 text-slate-400 hover:text-red-500 text-xs font-bold cursor-pointer"
            >
              Kosongkan
            </button>
          </div>
        </div>

        {filteredQueue.length === 0 ? (
          <div className="p-8 sm:p-12 text-center">
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <MapPin className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white">
              Antrean Cetak Lokasi Kosong
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Gunakan Range Generator di atas untuk membuat urutan rak otomatis (misal A-001 s/d A-050) atau ketik manual.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-slate-500 font-black uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      checked={queue.length > 0 && selectedItems.length === queue.length}
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3 w-16">QR</th>
                  <th className="py-3 px-3">Kode Lokasi (Huruf Besar)</th>
                  <th className="py-3 px-3">Isi Barcode (WMS Prefix)</th>
                  <th className="py-3 px-3">Deskripsi Zona</th>
                  <th className="py-3 px-3">Badge Tag</th>
                  <th className="py-3 px-3 text-center w-36">Jumlah Stiker</th>
                  <th className="py-3 px-4 text-right w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
                {filteredQueue.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-emerald-50/30 dark:hover:bg-emerald-950/20 transition-colors ${
                      item.selected !== false ? 'bg-emerald-50/10' : 'opacity-60'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={item.selected !== false}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                      />
                    </td>
                    <td className="py-3 px-3">
                      <div className="w-9 h-9 bg-white p-0.5 rounded border border-slate-200 flex items-center justify-center">
                        {qrCache[item.qrPayload] ? (
                          <img
                            src={qrCache[item.qrPayload]}
                            alt="QR"
                            className="w-full h-full object-contain [image-rendering:pixelated]"
                          />
                        ) : (
                          <QrCode className="w-5 h-5 text-slate-300" />
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono font-black text-base text-slate-900 dark:text-white">
                      {item.locCode}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-emerald-700 dark:text-emerald-300">
                      {item.qrPayload}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-800 dark:text-slate-200">
                      {item.zoneDesc || '-'}
                    </td>
                    <td className="py-3 px-3">
                      {item.tagBadge ? (
                        <span className="px-2 py-0.5 bg-slate-900 text-white rounded font-bold text-[10px]">
                          {item.tagBadge}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleUpdateCopies(item.id, -1)}
                          className="w-7 h-7 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          -
                        </button>
                        <span className="w-10 text-center font-black text-slate-900 dark:text-white">
                          {item.copies}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleUpdateCopies(item.id, 1)}
                          className="w-7 h-7 rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                        >
                          +
                        </button>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => handleDeleteItem(item.id)}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                        title="Hapus lokasi"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
export default CetakLokasiRakTab;
