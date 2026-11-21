import React, { useEffect, useMemo, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { X, Printer, Settings, Tag, QrCode, CheckSquare, Square } from 'lucide-react';
import {
  BarcodeLabelConfig,
  BatchBarcodePrintItem,
  DEFAULT_BARCODE_LABEL_CONFIG,
  printHtmlInHiddenIframe,
} from '../../utils/csvToolsUtils';

interface BatchBarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  itemsByOutlet: Map<string, BatchBarcodePrintItem[]>;
  initialSelectedOutlets: string[];
  onNotify?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const STORAGE_KEY = 'CHO_BARCODE_CONFIG_50x20';

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const BatchBarcodePrintModal: React.FC<BatchBarcodePrintModalProps> = ({
  isOpen,
  onClose,
  title,
  itemsByOutlet,
  initialSelectedOutlets,
  onNotify,
}) => {
  const [codeType, setCodeType] = useState<'barcode' | 'qrcode'>('barcode');
  const [lineMode, setLineMode] = useState<'1' | '2'>('1');
  const [includeDividers, setIncludeDividers] = useState<boolean>(true);
  const [showSetup, setShowSetup] = useState<boolean>(false);
  const [selectedOutlets, setSelectedOutlets] = useState<Set<string>>(new Set());
  const [isPrinting, setIsPrinting] = useState<boolean>(false);
  const [config, setConfig] = useState<BarcodeLabelConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return { ...DEFAULT_BARCODE_LABEL_CONFIG, ...JSON.parse(saved) };
    } catch {}
    return DEFAULT_BARCODE_LABEL_CONFIG;
  });

  useEffect(() => {
    if (isOpen) {
      setSelectedOutlets(new Set(initialSelectedOutlets));
    }
  }, [isOpen, initialSelectedOutlets]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch {}
  }, [config]);

  const allOutlets = useMemo(() => Array.from(itemsByOutlet.keys()), [itemsByOutlet]);

  const expandedSummary = useMemo(() => {
    let totalStickers = 0;
    let totalUniqueSkus = 0;
    const previewList: Array<{ type: 'divider' | 'label'; outlet: string; item?: BatchBarcodePrintItem }> = [];

    selectedOutlets.forEach((outlet) => {
      const list = itemsByOutlet.get(outlet) || [];
      if (list.length === 0) return;
      if (includeDividers) {
        totalStickers += 1;
        if (previewList.length < 40) {
          previewList.push({ type: 'divider', outlet });
        }
      }
      list.forEach((it) => {
        const q = Math.max(0, Math.floor(it.qty || 0));
        if (q <= 0) return;
        totalUniqueSkus += 1;
        totalStickers += q;
        for (let k = 0; k < q; k++) {
          if (previewList.length >= 40) break;
          previewList.push({ type: 'label', outlet, item: it });
        }
      });
    });

    return { totalStickers, totalUniqueSkus, previewList };
  }, [itemsByOutlet, selectedOutlets, includeDividers]);

  if (!isOpen) return null;

  const generateCodeSvgOrDataUrl = async (sku: string): Promise<string> => {
    if (codeType === 'qrcode') {
      return QRCode.toDataURL(sku, {
        width: 120,
        margin: 0,
        errorCorrectionLevel: 'M',
      });
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, sku, {
      format: 'CODE128',
      width: 1.4,
      height: Math.max(24, config.codeHeightMm * 3.5),
      displayValue: false,
      margin: 0,
    });
    return new XMLSerializer().serializeToString(svg);
  };

  const handlePrint = async () => {
    if (expandedSummary.totalStickers === 0) {
      onNotify?.('Tidak ada stiker untuk dicetak.', 'warning');
      return;
    }
    setIsPrinting(true);
    try {
      // Cache generated barcode SVG / QR dataURL per unique SKU for blazing speed
      const codeCache = new Map<string, string>();
      const flatLabels: Array<{ type: 'divider' | 'label'; outlet: string; item?: BatchBarcodePrintItem }> = [];

      for (const outlet of selectedOutlets) {
        const list = itemsByOutlet.get(outlet) || [];
        if (list.length === 0) continue;
        if (includeDividers) {
          flatLabels.push({ type: 'divider', outlet });
        }
        for (const it of list) {
          const q = Math.max(0, Math.floor(it.qty || 0));
          if (q <= 0) continue;
          if (!codeCache.has(it.sku)) {
            codeCache.set(it.sku, await generateCodeSvgOrDataUrl(it.sku));
          }
          for (let i = 0; i < q; i++) {
            flatLabels.push({ type: 'label', outlet, item: it });
          }
        }
      }

      const renderSingleLabelHtml = (entry: { type: 'divider' | 'label'; outlet: string; item?: BatchBarcodePrintItem }) => {
        if (entry.type === 'divider') {
          return `
            <div class="sticker-cell divider-cell">
              <div class="divider-tag">PEMBATAS TOKO</div>
              <div class="divider-name">${escapeHtml(entry.outlet)}</div>
            </div>
          `;
        }
        const it = entry.item!;
        const codeAsset = codeCache.get(it.sku) || '';
        const codeHtml =
          codeType === 'qrcode'
            ? `<img src="${codeAsset}" class="qr-img" style="height:${config.codeHeightMm + 3}mm;width:${config.codeHeightMm + 3}mm;" />`
            : `<div class="barcode-svg-wrap" style="height:${config.codeHeightMm}mm;">${codeAsset}</div>`;
        const priceFmt =
          config.showPrice && Number(it.price) > 0
            ? `Rp ${Number(it.price).toLocaleString('id-ID')}`
            : '';

        return `
          <div class="sticker-cell">
            ${config.showName ? `<div class="lbl-name">${escapeHtml(it.name || it.sku)}</div>` : ''}
            <div class="lbl-code-row ${codeType === 'qrcode' ? 'is-qr' : ''}">
              ${codeHtml}
              ${
                codeType === 'qrcode'
                  ? `<div class="qr-meta">
                      <div class="lbl-sku">${escapeHtml(it.sku)}</div>
                      ${config.showVariant && it.variant ? `<div class="lbl-var">Size: ${escapeHtml(it.variant)}</div>` : ''}
                      ${priceFmt ? `<div class="lbl-price">${escapeHtml(priceFmt)}</div>` : ''}
                    </div>`
                  : ''
              }
            </div>
            ${
              codeType === 'barcode'
                ? `<div class="lbl-bottom">
                    <span class="lbl-sku">${escapeHtml(it.sku)}</span>
                    ${config.showVariant && it.variant ? `<span class="lbl-var">(${escapeHtml(it.variant)})</span>` : ''}
                    ${priceFmt ? `<span class="lbl-price">${escapeHtml(priceFmt)}</span>` : ''}
                  </div>`
                : ''
            }
          </div>
        `;
      };

      let pagesHtml = '';
      if (lineMode === '1') {
        pagesHtml = flatLabels
          .map((lbl) => `<div class="print-page">${renderSingleLabelHtml(lbl)}</div>`)
          .join('');
      } else {
        for (let i = 0; i < flatLabels.length; i += 2) {
          const left = renderSingleLabelHtml(flatLabels[i]);
          const right = flatLabels[i + 1] ? renderSingleLabelHtml(flatLabels[i + 1]) : '<div class="sticker-cell empty"></div>';
          pagesHtml += `<div class="print-page twin">${left}${right}</div>`;
        }
      }

      const pageWidthMm = lineMode === '2' ? 104 : 50;
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: ${pageWidthMm}mm 20mm; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #fff; color: #000; }
    .print-page {
      width: ${pageWidthMm}mm;
      height: 20mm;
      display: flex;
      align-items: center;
      justify-content: center;
      page-break-after: always;
      break-after: page;
      overflow: hidden;
    }
    .print-page.twin {
      justify-content: space-between;
      gap: 4mm;
    }
    .sticker-cell {
      width: 50mm;
      height: 20mm;
      padding: 1mm 2mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      overflow: hidden;
    }
    .divider-cell {
      border: 1.5px dashed #000;
      border-radius: 2mm;
    }
    .divider-tag { font-size: 6pt; font-weight: 700; letter-spacing: 0.5px; }
    .divider-name { font-size: 10pt; font-weight: 800; margin-top: 1mm; word-break: break-word; }
    .lbl-name {
      font-size: ${Math.max(6, config.fontSizePx - 1)}pt;
      font-weight: 700;
      max-width: 46mm;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 0.5mm;
    }
    .barcode-svg-wrap { display: flex; align-items: center; justify-content: center; width: 100%; }
    .barcode-svg-wrap svg { max-width: 45mm; height: 100%; }
    .lbl-code-row.is-qr { display: flex; align-items: center; gap: 2mm; width: 100%; justify-content: center; }
    .qr-meta { text-align: left; max-width: 28mm; overflow: hidden; }
    .lbl-bottom {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 1.5mm;
      font-size: ${config.fontSizePx}pt;
      margin-top: 0.5mm;
    }
    .lbl-sku { font-family: 'Courier New', monospace; font-weight: 800; font-size: ${config.fontSizePx}pt; }
    .lbl-var { font-weight: 700; font-size: ${Math.max(6, config.fontSizePx - 1)}pt; }
    .lbl-price { font-weight: 700; font-size: ${Math.max(6, config.fontSizePx - 1)}pt; }
  </style>
</head>
<body>${pagesHtml}</body>
</html>`;

      printHtmlInHiddenIframe(html);
      onNotify?.(`Menyiapkan cetak ${expandedSummary.totalStickers} stiker (${lineMode === '2' ? '104x20mm Twin' : '50x20mm'})...`, 'success');
    } catch (err: any) {
      onNotify?.(err?.message || 'Gagal menyiapkan cetakan barcode.', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">{title}</h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Cetak in-page via hidden iframe (50x20mm Single / 104x20mm Twin)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowSetup((v) => !v)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 flex items-center gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              <span>Setup Label</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {showSetup && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showName}
                  onChange={(e) => setConfig((p) => ({ ...p, showName: e.target.checked }))}
                  className="rounded text-indigo-600"
                />
                <span>Nama Produk</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showVariant}
                  onChange={(e) => setConfig((p) => ({ ...p, showVariant: e.target.checked }))}
                  className="rounded text-indigo-600"
                />
                <span>Size / Varian</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.showPrice}
                  onChange={(e) => setConfig((p) => ({ ...p, showPrice: e.target.checked }))}
                  className="rounded text-indigo-600"
                />
                <span>Harga</span>
              </label>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Tinggi Kode:</span>
                <input
                  type="number"
                  min={6}
                  max={13}
                  value={config.codeHeightMm}
                  onChange={(e) => setConfig((p) => ({ ...p, codeHeightMm: Number(e.target.value) || 9 }))}
                  className="w-14 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Font (pt):</span>
                <input
                  type="number"
                  min={6}
                  max={11}
                  value={config.fontSizePx}
                  onChange={(e) => setConfig((p) => ({ ...p, fontSizePx: Number(e.target.value) || 8 }))}
                  className="w-14 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs"
                />
              </div>
            </div>
          )}

          {/* Print Options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Jenis Kode</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setCodeType('barcode')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border ${
                    codeType === 'barcode'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Barcode</span>
                </button>
                <button
                  type="button"
                  onClick={() => setCodeType('qrcode')}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border ${
                    codeType === 'qrcode'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>QR Code</span>
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Ukuran Kertas Thermal</div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setLineMode('1')}
                  className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold border ${
                    lineMode === '1'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  50x20mm (1 Line)
                </button>
                <button
                  type="button"
                  onClick={() => setLineMode('2')}
                  className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold border ${
                    lineMode === '2'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  104x20mm (Twin)
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Pembatas Toko</div>
              <label className="flex items-center gap-2 text-xs cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={includeDividers}
                  onChange={(e) => setIncludeDividers(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span className="text-slate-700 dark:text-slate-200 font-medium">
                  Sisipkan Stiker Pembatas Nama Toko
                </span>
              </label>
            </div>
          </div>

          {/* Outlet Selection */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                Outlet / Lokasi Dicetak ({selectedOutlets.size}/{allOutlets.length})
              </span>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedOutlets(new Set(allOutlets))}
                  className="text-indigo-600 dark:text-indigo-400 font-semibold hover:underline"
                >
                  Pilih Semua
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedOutlets(new Set())}
                  className="text-rose-600 font-semibold hover:underline"
                >
                  Kosongkan
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto">
              {allOutlets.map((o) => {
                const active = selectedOutlets.has(o);
                const pcs = (itemsByOutlet.get(o) || []).reduce((s, it) => s + (it.qty || 0), 0);
                return (
                  <button
                    key={o}
                    type="button"
                    onClick={() => {
                      setSelectedOutlets((prev) => {
                        const next = new Set(prev);
                        if (active) next.delete(o);
                        else next.add(o);
                        return next;
                      });
                    }}
                    className={`px-2.5 py-1.5 rounded-lg border text-left text-xs flex items-center justify-between gap-1.5 ${
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700 text-slate-900 dark:text-white'
                        : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate font-semibold">
                      {active ? <CheckSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" /> : <Square className="w-3.5 h-3.5 shrink-0" />}
                      <span className="truncate">{o}</span>
                    </span>
                    <span className="font-mono text-[10px] font-bold shrink-0">{pcs}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Preview Sample */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                Preview Stiker (maks 40 stiker pertama)
              </span>
              <span className="text-slate-500">
                Total Siap Cetak: <b className="text-indigo-600 dark:text-indigo-400">{expandedSummary.totalStickers.toLocaleString('id-ID')}</b> stiker ({expandedSummary.totalUniqueSkus} SKU)
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-2 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
              {expandedSummary.previewList.map((entry, idx) =>
                entry.type === 'divider' ? (
                  <div
                    key={`div-${idx}`}
                    className="p-2 rounded-lg border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-center flex flex-col justify-center"
                  >
                    <span className="text-[9px] font-bold text-amber-700 dark:text-amber-300">PEMBATAS TOKO</span>
                    <span className="text-xs font-extrabold text-slate-900 dark:text-white truncate">{entry.outlet}</span>
                  </div>
                ) : (
                  <div
                    key={`lbl-${idx}`}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center flex flex-col justify-center"
                  >
                    {config.showName && (
                      <span className="text-[10px] font-bold text-slate-800 dark:text-slate-100 truncate">
                        {entry.item?.name || entry.item?.sku}
                      </span>
                    )}
                    <span className="font-mono text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400">
                      {entry.item?.sku}
                    </span>
                    {config.showVariant && entry.item?.variant && (
                      <span className="text-[9px] text-slate-500">Size: {entry.item.variant}</span>
                    )}
                  </div>
                )
              )}
              {expandedSummary.previewList.length === 0 && (
                <div className="col-span-full py-6 text-center text-xs text-slate-400">
                  Tidak ada stiker untuk ditampilkan. Pilih minimal 1 outlet yang memiliki Qty &gt; 0.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Total: <b>{expandedSummary.totalStickers.toLocaleString('id-ID')}</b> stiker
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
            >
              Tutup
            </button>
            <button
              type="button"
              disabled={isPrinting || expandedSummary.totalStickers === 0}
              onClick={handlePrint}
              className="px-5 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 disabled:opacity-50"
            >
              <Printer className="w-4 h-4" />
              <span>{isPrinting ? 'Menyiapkan...' : 'Cetak Sekarang'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
