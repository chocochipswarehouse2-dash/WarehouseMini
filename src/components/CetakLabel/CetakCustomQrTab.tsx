import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Printer,
  Plus,
  Trash2,
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
  Zap,
  Info,
} from 'lucide-react';
import QRCode from 'qrcode';
import {
  CustomQrLabelItem,
  LocationLabelSettings,
  LocationPrintMedia,
  DEFAULT_LOCATION_SETTINGS,
  WMS_QUICK_PREFIXES,
} from './types';

const STORAGE_QUEUE_KEY = 'wms_custom_qr_queue_v1';
const STORAGE_SETTINGS_KEY = 'wms_custom_qr_settings_v1';

const DEFAULT_SAMPLE_ITEMS: CustomQrLabelItem[] = [
  {
    id: 'wms-1',
    title: '#IN (SCAN MASUK)',
    subtitle: 'Mode Penerimaan & Restock Barang',
    qrPayload: '#IN',
    badge: 'ACTION WMS',
    copies: 2,
    selected: true,
  },
  {
    id: 'wms-2',
    title: '#OUT (SCAN KELUAR)',
    subtitle: 'Mode Pengiriman & Dispatch Pesanan',
    qrPayload: '#OUT',
    badge: 'ACTION WMS',
    copies: 2,
    selected: true,
  },
  {
    id: 'wms-3',
    title: '#SO (STOCK OPNAME)',
    subtitle: 'Mode Audit Fisik & Cek Selisih Stok',
    qrPayload: '#SO',
    badge: 'ACTION WMS',
    copies: 1,
    selected: true,
  },
];

export const CetakCustomQrTab: React.FC = () => {
  // Mode Tab: 'quick_wms' | 'manual_free' | 'sequence'
  const [activeTab, setActiveTab] = useState<'quick_wms' | 'manual_free' | 'sequence'>('quick_wms');

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

  // Queue of Custom QR items
  const [queue, setQueue] = useState<CustomQrLabelItem[]>(() => {
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

  // QR Cache
  const [qrCache, setQrCache] = useState<Record<string, string>>({});

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
  // 1. MANUAL FREE FORM STATE
  // ==========================================
  const [formTitle, setFormTitle] = useState('');
  const [formSubtitle, setFormSubtitle] = useState('');
  const [formPayload, setFormPayload] = useState('');
  const [formBadge, setFormBadge] = useState('CUSTOM');
  const [formCopies, setFormCopies] = useState<number>(1);

  // Auto-sync payload if empty
  const handleTitleChange = (val: string) => {
    setFormTitle(val);
    if (!formPayload || formPayload === formTitle) {
      setFormPayload(val);
    }
  };

  // ==========================================
  // 2. SEQUENCE GENERATOR STATE
  // ==========================================
  const [seqPrefix, setSeqPrefix] = useState('PALLET-');
  const [seqStart, setSeqStart] = useState<number>(1);
  const [seqEnd, setSeqEnd] = useState<number>(10);
  const [seqPadDigits, setSeqPadDigits] = useState<number>(2);
  const [seqSubtitle, setSeqSubtitle] = useState('PALLET GUDANG UTAMA');
  const [seqBadge, setSeqBadge] = useState('PALLET');
  const [seqCopies, setSeqCopies] = useState<number>(1);

  // Queue search & Preview
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
        item.title.toLowerCase().includes(q) ||
        item.qrPayload.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        (item.badge && item.badge.toLowerCase().includes(q))
    );
  }, [queue, searchQuery]);

  const currentPreviewItem = selectedItems[previewIndex] || selectedItems[0] || queue[0] || null;

  // ==========================================
  // ACTIONS: QUICK WMS PREFIX
  // ==========================================
  const handleAddQuickPrefix = (item: (typeof WMS_QUICK_PREFIXES)[0]) => {
    const newItem: CustomQrLabelItem = {
      id: `wms_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title: item.title,
      subtitle: item.subtitle,
      qrPayload: item.code,
      badge: item.badge,
      copies: 1,
      selected: true,
    };
    setQueue((prev) => [newItem, ...prev]);
  };

  const handleAddAllQuickPrefixes = () => {
    const newItems: CustomQrLabelItem[] = WMS_QUICK_PREFIXES.map((item, idx) => ({
      id: `wms_${Date.now()}_${idx}`,
      title: item.title,
      subtitle: item.subtitle,
      qrPayload: item.code,
      badge: item.badge,
      copies: 1,
      selected: true,
    }));
    setQueue((prev) => [...newItems, ...prev]);
  };

  // ==========================================
  // ACTIONS: MANUAL FREE
  // ==========================================
  const handleAddManualFree = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim() && !formPayload.trim()) {
      alert('Mohon isi Judul Label atau Isi QR Code.');
      return;
    }

    const payload = formPayload.trim() || formTitle.trim();
    const title = formTitle.trim() || payload;

    const newItem: CustomQrLabelItem = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      title,
      subtitle: formSubtitle.trim() || undefined,
      qrPayload: payload,
      badge: formBadge.trim() || undefined,
      copies: Math.max(1, formCopies),
      selected: true,
    };

    setQueue((prev) => [newItem, ...prev]);
    setFormTitle('');
    setFormSubtitle('');
    setFormPayload('');
  };

  // ==========================================
  // ACTIONS: GENERATE SEQUENCE
  // ==========================================
  const handleGenerateSequence = () => {
    if (seqStart > seqEnd) {
      alert('Nomor awal tidak boleh lebih besar dari nomor akhir.');
      return;
    }

    const count = seqEnd - seqStart + 1;
    const newItems: CustomQrLabelItem[] = [];

    for (let n = seqStart; n <= seqEnd; n++) {
      const numStr = String(n).padStart(seqPadDigits, '0');
      const code = `${seqPrefix}${numStr}`;

      newItems.push({
        id: `seq_${Date.now()}_${n}_${Math.random().toString(36).substring(2, 6)}`,
        title: code,
        subtitle: seqSubtitle.trim() || undefined,
        qrPayload: code,
        badge: seqBadge.trim() || undefined,
        copies: Math.max(1, seqCopies),
        selected: true,
      });
    }

    setQueue((prev) => [...newItems, ...prev]);
    alert(`Berhasil membuat ${newItems.length} label sequence ke antrean.`);
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

  const handleDeleteSelected = () => {
    setQueue((prev) => prev.filter((i) => i.selected === false));
  };

  const handleClearQueue = () => {
    if (window.confirm('Kosongkan semua item dalam antrean cetak QR custom?')) {
      setQueue([]);
    }
  };

  // ==========================================
  // PRINT EXECUTION ENGINE
  // ==========================================
  const handlePrint = async () => {
    if (selectedItems.length === 0) {
      alert('Pilih minimal 1 item untuk dicetak.');
      return;
    }

    setIsPrinting(true);

    try {
      const qrDataMap: Record<string, string> = { ...qrCache };
      for (const item of selectedItems) {
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

      const codePt =
        settings.codeFontSize === 'normal'
          ? '18pt'
          : settings.codeFontSize === 'large'
          ? '24pt'
          : settings.codeFontSize === 'jumbo'
          ? '36pt'
          : '28pt';

      const qrMm =
        settings.qrSize === 'small'
          ? '22mm'
          : settings.qrSize === 'normal'
          ? '28mm'
          : settings.qrSize === 'xlarge'
          ? '40mm'
          : settings.qrSize === 'jumbo'
          ? '46mm'
          : '34mm';

      const flattenedItems: CustomQrLabelItem[] = [];
      selectedItems.forEach((it) => {
        const c = Math.max(1, it.copies || 1);
        for (let i = 0; i < c; i++) {
          flattenedItems.push(it);
        }
      });

      let bodyHtml = '';

      if (isA6Sheet) {
        const chunks: CustomQrLabelItem[][] = [];
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
                  ${renderCustomLabelInnerHtml(item, qrDataMap[item.qrPayload], codePt, qrMm)}
                </div>
              `
              )
              .join('');

            return `<div class="a6-sheet ${gridClass}">${cards}</div>`;
          })
          .join('');
      } else {
        bodyHtml = flattenedItems
          .map(
            (item) => `
            <div class="thermal-card media-${media} ${settings.isRotated180 ? 'rotated-180' : ''}">
              ${renderCustomLabelInnerHtml(item, qrDataMap[item.qrPayload], codePt, qrMm)}
            </div>
          `
          )
          .join('');
      }

      let iframe = document.getElementById('custom-qr-print-iframe') as HTMLIFrameElement;
      if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'custom-qr-print-iframe';
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
          <title>Cetak QR Code Custom & Prefix WMS</title>
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
            .a6-cell.with-cut-lines { border: 1.5px dashed #000; }

            .qr-wrapper {
              width: 100%;
              height: 100%;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
            }
            .qr-layout-side-by-side {
              flex-direction: row;
              align-items: center;
              gap: 3mm;
            }
            .qr-title-big {
              font-family: 'JetBrains Mono', 'Plus Jakarta Sans', monospace;
              font-weight: 900;
              color: #000;
              letter-spacing: -0.02em;
              line-height: 1.05;
            }
            .qr-img-box {
              display: flex;
              align-items: center;
              justify-content: center;
              flex-shrink: 0;
            }
            .qr-img {
              width: 100%;
              height: 100%;
              object-fit: contain;
              image-rendering: pixelated;
            }
            .qr-subtitle-box {
              font-size: 8pt;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.03em;
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
            .qr-badge-tag {
              font-size: 7.5pt;
              font-weight: 900;
              text-transform: uppercase;
              background: #000;
              color: #fff;
              padding: 0.5mm 2mm;
              border-radius: 1mm;
              letter-spacing: 0.05em;
            }
            .qr-payload-text {
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
      alert('Gagal menjalankan proses cetak.');
    }
  };

  function renderCustomLabelInnerHtml(
    item: CustomQrLabelItem,
    qrUrl: string,
    codePt: string,
    qrMm: string
  ): string {
    const isSideBySide = settings.layout === 'side-by-side';

    if (isSideBySide) {
      return `
        <div class="qr-wrapper qr-layout-side-by-side">
          <div class="qr-img-box" style="width: ${qrMm}; height: ${qrMm};">
            <img src="${qrUrl || ''}" class="qr-img" alt="${escapeHtml(item.qrPayload)}" />
          </div>
          <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;">
            ${
              settings.showTagBadge && item.badge
                ? `<div><span class="qr-badge-tag">${escapeHtml(item.badge)}</span></div>`
                : ''
            }
            <div class="qr-title-big" style="font-size: ${codePt}; margin: 1mm 0;">
              ${escapeHtml(item.title)}
            </div>
            ${
              settings.showQrPayloadText
                ? `<div class="qr-payload-text" style="text-align: left;">${escapeHtml(
                    item.qrPayload
                  )}</div>`
                : ''
            }
            ${
              settings.showZoneDesc && item.subtitle
                ? `<div class="qr-subtitle-box" style="text-align: left; margin-top: 1mm;">${escapeHtml(
                    item.subtitle
                  )}</div>`
                : ''
            }
          </div>
        </div>
      `;
    }

    return `
      <div class="qr-wrapper">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 2mm;">
          <div class="qr-title-big" style="font-size: ${codePt};">
            ${escapeHtml(item.title)}
          </div>
          ${
            settings.showTagBadge && item.badge
              ? `<span class="qr-badge-tag">${escapeHtml(item.badge)}</span>`
              : ''
          }
        </div>

        <div style="display: flex; align-items: center; justify-content: center; margin: 1mm 0;">
          <div class="qr-img-box" style="width: ${qrMm}; height: ${qrMm};">
            <img src="${qrUrl || ''}" class="qr-img" alt="${escapeHtml(item.qrPayload)}" />
          </div>
        </div>

        ${
          settings.showQrPayloadText
            ? `<div class="qr-payload-text">${escapeHtml(item.qrPayload)}</div>`
            : ''
        }

        ${
          settings.showZoneDesc && item.subtitle
            ? `<div class="qr-subtitle-box">${escapeHtml(item.subtitle)}</div>`
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
            <div className="p-3 bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-200 dark:border-indigo-800">
              <Zap className="w-7 h-7" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                  Cetak QR Code Custom &amp; Prefix WMS
                </h2>
                <span className="px-2.5 py-0.5 text-[11px] font-black uppercase bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-full">
                  #IN, #OUT, #SO, #QC, Custom QR
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                Cetak stiker barcode aksi WMS cepat (seperti #IN, #OUT, #SO) atau buat QR code custom bebas semau Anda.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
            <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-center">
              <div className="text-[11px] font-bold text-slate-500">Antrean Item</div>
              <div className="text-base font-black text-slate-900 dark:text-white">
                {queue.length} <span className="text-xs font-semibold text-slate-400">item</span>
              </div>
            </div>

            <div className="px-3.5 py-2 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 rounded-xl text-center">
              <div className="text-[11px] font-bold text-indigo-600 dark:text-indigo-300">Total Stiker</div>
              <div className="text-base font-black text-indigo-700 dark:text-indigo-300">
                {totalSelectedCopies}{' '}
                <span className="text-xs font-semibold text-indigo-500/80">/ {totalAllCopies} lembar</span>
              </div>
            </div>

            <button
              type="button"
              onClick={handlePrint}
              disabled={selectedItems.length === 0 || isPrinting}
              className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-black text-sm rounded-xl shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Menyiapkan...' : `Cetak ${totalSelectedCopies} Stiker QR`}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 2. DUA KOLOM: INPUT CUSTOM & PREVIEW                       */}
      {/* ========================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6">
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850/50 p-1.5 gap-1">
              <button
                type="button"
                onClick={() => setActiveTab('quick_wms')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'quick_wms'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Zap className="w-4 h-4" />
                <span>Preset Aksi WMS (#IN, #OUT)</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('manual_free')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'manual_free'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>QR Bebas Semau Kita</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('sequence')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs sm:text-sm font-black flex items-center justify-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'sequence'
                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>Generator Urutan (Pallet/Box)</span>
              </button>
            </div>

            <div className="p-4 sm:p-5">
              {/* SUB-TAB 1: QUICK PRESETS WMS */}
              {activeTab === 'quick_wms' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                      Pilih Prefix Barcode Aksi WMS:
                    </span>
                    <button
                      type="button"
                      onClick={handleAddAllQuickPrefixes}
                      className="text-xs font-black text-indigo-600 hover:text-indigo-700 cursor-pointer"
                    >
                      + Tambah Semua Preset ke Antrean
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {WMS_QUICK_PREFIXES.map((item) => (
                      <div
                        key={item.code}
                        className="p-3 border border-slate-200 dark:border-slate-700/80 rounded-xl hover:border-indigo-400 dark:hover:border-indigo-600 transition-all flex items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/40"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                              {item.code}
                            </span>
                            <span className="px-1.5 py-0.2 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded text-[9px] font-bold">
                              {item.badge}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            {item.subtitle}
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleAddQuickPrefix(item)}
                          className="px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shrink-0 cursor-pointer transition-all active:scale-95 flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Pilih</span>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* SUB-TAB 2: FREE MANUAL QR */}
              {activeTab === 'manual_free' && (
                <form onSubmit={handleAddManualFree} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Judul Utama (Teks Besar) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formTitle}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        placeholder="Contoh: #OUT, AREA PACKING, USER-01"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Isi QR Barcode (Teks / Prefix Bebas) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formPayload}
                        onChange={(e) => setFormPayload(e.target.value)}
                        placeholder="Contoh: #OUT, https://..., DATA-123"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-mono font-bold text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Sub-Judul / Keterangan di Bawah Label
                      </label>
                      <input
                        type="text"
                        value={formSubtitle}
                        onChange={(e) => setFormSubtitle(e.target.value)}
                        placeholder="Contoh: SCAN KELUAR / DISPATCH PESANAN"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Badge / Tag (Opsional)
                      </label>
                      <input
                        type="text"
                        value={formBadge}
                        onChange={(e) => setFormBadge(e.target.value)}
                        placeholder="Contoh: ACTION, SYSTEM, PALLET"
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
                        value={formCopies}
                        onChange={(e) => setFormCopies(parseInt(e.target.value, 10) || 1)}
                        className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-center"
                      />
                    </div>

                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>+ Tambah QR Custom ke Antrean</span>
                    </button>
                  </div>
                </form>
              )}

              {/* SUB-TAB 3: SEQUENCE GENERATOR */}
              {activeTab === 'sequence' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Prefix Kode
                      </label>
                      <input
                        type="text"
                        value={seqPrefix}
                        onChange={(e) => setSeqPrefix(e.target.value.toUpperCase())}
                        placeholder="Contoh: PALLET-, BOX-"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold font-mono"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Nomor Awal
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={seqStart}
                        onChange={(e) => setSeqStart(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Nomor Akhir
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={seqEnd}
                        onChange={(e) => setSeqEnd(parseInt(e.target.value, 10) || 1)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Keterangan di Bawah Label
                      </label>
                      <input
                        type="text"
                        value={seqSubtitle}
                        onChange={(e) => setSeqSubtitle(e.target.value)}
                        placeholder="Contoh: AREA PENYIMPANAN PALLET"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                        Badge Tag
                      </label>
                      <input
                        type="text"
                        value={seqBadge}
                        onChange={(e) => setSeqBadge(e.target.value)}
                        placeholder="Contoh: PALLET, BOX"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-600 dark:text-slate-400">
                        Salinan per Item:
                      </span>
                      <input
                        type="number"
                        min="1"
                        value={seqCopies}
                        onChange={(e) => setSeqCopies(parseInt(e.target.value, 10) || 1)}
                        className="w-16 px-2 py-1 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-center"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerateSequence}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black shadow-md flex items-center gap-2 cursor-pointer transition-all active:scale-95"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        Generate {Math.max(0, seqEnd - seqStart + 1)} QR ke Antrean
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Live Preview & Settings (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/60 dark:bg-slate-850/50">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs sm:text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                  Pratinjau QR Custom
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
                        {settings.showTagBadge && currentPreviewItem.badge && (
                          <span className="px-1.5 py-0.5 text-[9px] font-black uppercase bg-black text-white rounded">
                            {currentPreviewItem.badge}
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
                          {currentPreviewItem.title}
                        </div>
                        {settings.showQrPayloadText && (
                          <div className="font-mono text-[10px] font-bold text-slate-600">
                            {currentPreviewItem.qrPayload}
                          </div>
                        )}
                        {settings.showZoneDesc && currentPreviewItem.subtitle && (
                          <div className="mt-1.5 px-1.5 py-0.5 bg-slate-100 rounded text-[10px] font-black text-slate-800 truncate uppercase">
                            {currentPreviewItem.subtitle}
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
                          {currentPreviewItem.title}
                        </div>
                        {settings.showTagBadge && currentPreviewItem.badge && (
                          <span className="px-2 py-0.5 text-[10px] font-black uppercase bg-black text-white rounded">
                            {currentPreviewItem.badge}
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

                      {settings.showZoneDesc && currentPreviewItem.subtitle && (
                        <div className="px-2 py-1 bg-slate-100 rounded text-[10px] font-black text-slate-800 text-center uppercase tracking-wider truncate">
                          {currentPreviewItem.subtitle}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-xs text-slate-400">Tidak ada item dalam antrean</div>
              )}
            </div>

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
                  <option value="thermal_100x50">Thermal 100 × 50 mm (Rekomendasi Label Besar)</option>
                  <option value="thermal_80x50">Thermal 80 × 50 mm</option>
                  <option value="thermal_70x40">Thermal 70 × 40 mm</option>
                  <option value="thermal_50x30">Thermal 50 × 30 mm</option>
                  <option value="thermal_50x20">Thermal 50 × 20 mm (Stiker Standar)</option>
                  <option value="a6_1">Kertas A6 (1 Label per Lembar)</option>
                  <option value="a6_2">Kertas A6 (2 Label per Lembar)</option>
                  <option value="a6_4">Kertas A6 (4 Label per Lembar)</option>
                  <option value="a6_6">Kertas A6 (6 Label per Lembar)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Ukuran Huruf Judul
                  </label>
                  <select
                    value={settings.codeFontSize}
                    onChange={(e) => updateSettings({ codeFontSize: e.target.value as any })}
                    className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg font-bold"
                  >
                    <option value="normal">Normal (18pt)</option>
                    <option value="large">Besar (24pt)</option>
                    <option value="xlarge">Sangat Besar (28pt)</option>
                    <option value="jumbo">Jumbo Raksasa (36pt)</option>
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
                    <option value="stacked">Tumpuk (Judul - QR - Keterangan)</option>
                    <option value="side-by-side">Berdampingan (QR Kiri - Teks Kanan)</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.isRotated180}
                      onChange={(e) => updateSettings({ isRotated180: e.target.checked })}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      Putar 180°
                    </span>
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================= */}
      {/* 3. DAFTAR ANTREAN CETAK QR CUSTOM                         */}
      {/* ========================================================= */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-850/50">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Daftar Antrean Cetak QR Custom
            </h3>
            <span className="px-2.5 py-0.5 text-xs font-black bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-full">
              {queue.length} Item / {totalSelectedCopies} Lembar Terpilih
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari item QR..."
                className="pl-8 pr-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500 w-40"
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
              <QrCode className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-black text-slate-900 dark:text-white">
              Antrean Cetak Kosong
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">
              Pilih Preset Aksi WMS (#IN, #OUT) di atas atau gunakan input QR bebas untuk menambahkan stiker.
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
                      className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="py-3 px-3 w-16">QR</th>
                  <th className="py-3 px-3">Judul Label</th>
                  <th className="py-3 px-3">Isi Barcode (Payload QR)</th>
                  <th className="py-3 px-3">Keterangan</th>
                  <th className="py-3 px-3">Badge Tag</th>
                  <th className="py-3 px-3 text-center w-36">Jumlah Stiker</th>
                  <th className="py-3 px-4 text-right w-16">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium text-slate-700 dark:text-slate-300">
                {filteredQueue.map((item) => (
                  <tr
                    key={item.id}
                    className={`hover:bg-indigo-50/30 dark:hover:bg-indigo-950/20 transition-colors ${
                      item.selected !== false ? 'bg-indigo-50/10' : 'opacity-60'
                    }`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        checked={item.selected !== false}
                        onChange={() => handleToggleSelect(item.id)}
                        className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
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
                      {item.title}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-indigo-700 dark:text-indigo-300">
                      {item.qrPayload}
                    </td>
                    <td className="py-3 px-3 text-slate-700 dark:text-slate-300">
                      {item.subtitle || '-'}
                    </td>
                    <td className="py-3 px-3">
                      {item.badge ? (
                        <span className="px-2 py-0.5 bg-slate-900 text-white rounded font-bold text-[10px]">
                          {item.badge}
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
                        title="Hapus item"
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
export default CetakCustomQrTab;
