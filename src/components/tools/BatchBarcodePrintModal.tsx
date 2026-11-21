import React, { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import {
  X,
  Printer,
  Settings,
  Tag,
  QrCode,
  CheckSquare,
  Square,
  RotateCcw,
} from 'lucide-react';
import {
  BarcodePrinterConfig,
  BatchBarcodePrintItem,
  DEFAULT_BARCODE_LABEL_CONFIG,
  formatLabelPriceDisplay,
  getAutoProductNameFontSize,
  parseLabelNameAndVariant,
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

const STORAGE_KEY = 'CHO_BARCODE_CONFIG_50x20_V2';

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Realistic Preview Component for 1 Sticker (50x20mm scale)
 */
const StickerPreviewCard: React.FC<{
  item: BatchBarcodePrintItem;
  config: BarcodePrinterConfig;
}> = ({ item, config }) => {
  const barcodeSvgRef = useRef<SVGSVGElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  const { qrRow1, qrRow2, barcodeFullName } = useMemo(
    () => parseLabelNameAndVariant(item.name, item.variant),
    [item.name, item.variant]
  );

  const formattedPrice = useMemo(
    () => formatLabelPriceDisplay(item.price, config),
    [item.price, config]
  );

  const priceLine = useMemo(() => {
    if (!config.showPrice && !config.customText) return '';
    if (config.customText && config.customText.trim()) {
      return config.showPrice && formattedPrice
        ? `${config.customText.trim()} • ${formattedPrice}`
        : config.customText.trim();
    }
    return formattedPrice;
  }, [config.showPrice, config.customText, formattedPrice]);

  useEffect(() => {
    if (config.codeType === 'barcode' && barcodeSvgRef.current) {
      try {
        barcodeSvgRef.current.innerHTML = '';
        JsBarcode(barcodeSvgRef.current, String(item.sku || '123456789'), {
          format: 'CODE128',
          width: Number(config.barcodeWidth) || 1.2,
          height: Number(config.barcodeHeight) || 22,
          displayValue: false,
          margin: 0,
          background: 'transparent',
          lineColor: '#000000',
        });
      } catch (err) {
        console.warn('Preview barcode render error:', err);
      }
    } else if (config.codeType === 'qrcode') {
      QRCode.toDataURL(String(item.sku || '123456789'), {
        width: Number(config.qrSize) * 2 || 84,
        margin: 0,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      })
        .then((url) => setQrDataUrl(url))
        .catch(() => setQrDataUrl(''));
    }
  }, [
    config.codeType,
    config.barcodeWidth,
    config.barcodeHeight,
    config.qrSize,
    item.sku,
  ]);

  if (config.codeType === 'qrcode') {
    return (
      <div
        className="w-[190px] h-[76px] bg-white border border-slate-300 rounded shadow-xs p-1 flex items-center gap-1.5 overflow-hidden select-none text-slate-900"
        title={`${item.sku} - ${item.name}`}
      >
        <div className="shrink-0 flex items-center justify-center w-[44px] h-[44px]">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="QR" className="w-[42px] h-[42px] block" />
          ) : (
            <div className="w-[42px] h-[42px] bg-slate-100 flex items-center justify-center text-[8px] text-slate-400">
              QR
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col justify-between h-full py-0.5 text-left overflow-hidden">
          {config.showProductName && (
            <div
              style={{
                fontSize: `${Number(config.productNameSize) || 7.5}pt`,
                textTransform: config.productNameCase === 'uppercase' ? 'uppercase' : 'none',
              }}
              className="font-bold text-slate-950 truncate leading-tight"
            >
              {qrRow1}
            </div>
          )}
          {config.showVariantSize && qrRow2 ? (
            <div
              style={{ fontSize: `${Number(config.variantSize) || 7.0}pt` }}
              className="text-slate-600 truncate leading-tight"
            >
              {qrRow2}
            </div>
          ) : null}
          {config.showSku && (
            <div
              style={{ fontSize: `${Number(config.skuSize) || 6.5}pt` }}
              className="font-mono font-semibold text-slate-700 truncate leading-tight"
            >
              {config.skuPrefix}
              {item.sku}
            </div>
          )}
          {priceLine ? (
            <div
              style={{ fontSize: `${Number(config.priceSize) || 9.0}pt` }}
              className="font-extrabold text-slate-950 truncate leading-tight tracking-tight"
            >
              {priceLine}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // 1D Barcode Preview (Top SVG -> SKU -> Price -> Product Name + Size)
  const autoFontSize = getAutoProductNameFontSize(barcodeFullName, config.productNameSize);

  return (
    <div
      className="w-[190px] h-[76px] bg-white border border-slate-300 rounded shadow-xs p-1 flex flex-col justify-center items-center text-center overflow-hidden select-none text-slate-900"
      title={`${item.sku} - ${item.name}`}
    >
      <div className="w-full flex justify-center items-center overflow-hidden mb-0.5">
        <svg ref={barcodeSvgRef} className="max-w-full block"></svg>
      </div>
      <div className="w-full flex flex-col justify-center items-center text-center overflow-hidden leading-tight">
        {config.showSku && (
          <div
            style={{ fontSize: `${Number(config.skuSize) || 7.5}pt` }}
            className="font-mono font-bold text-slate-900 tracking-tight truncate w-full"
          >
            {config.skuPrefix}
            {item.sku}
          </div>
        )}
        {priceLine ? (
          <div
            style={{ fontSize: `${Number(config.priceSize) || 9.5}pt` }}
            className="font-extrabold text-slate-950 truncate w-full tracking-tight"
          >
            {priceLine}
          </div>
        ) : null}
        {config.showProductName && (
          <div
            style={{
              fontSize: `${autoFontSize}pt`,
              textTransform: config.productNameCase === 'uppercase' ? 'uppercase' : 'none',
            }}
            className="font-bold text-slate-800 truncate w-full"
          >
            {barcodeFullName}
          </div>
        )}
      </div>
    </div>
  );
};

export const BatchBarcodePrintModal: React.FC<BatchBarcodePrintModalProps> = ({
  isOpen,
  onClose,
  title,
  itemsByOutlet,
  initialSelectedOutlets,
  onNotify,
}) => {
  const [includeDividers, setIncludeDividers] = useState<boolean>(true);
  const [showSetup, setShowSetup] = useState<boolean>(false);
  const [selectedOutlets, setSelectedOutlets] = useState<Set<string>>(new Set());
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  const [config, setConfig] = useState<BarcodePrinterConfig>(() => {
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
        if (previewList.length < 32) {
          previewList.push({ type: 'divider', outlet });
        }
      }
      list.forEach((it) => {
        const q = Math.max(0, Math.floor(it.qty || 0));
        if (q <= 0) return;
        totalUniqueSkus += 1;
        totalStickers += q;
        for (let k = 0; k < q; k++) {
          if (previewList.length >= 32) break;
          previewList.push({ type: 'label', outlet, item: it });
        }
      });
    });

    return { totalStickers, totalUniqueSkus, previewList };
  }, [itemsByOutlet, selectedOutlets, includeDividers]);

  if (!isOpen) return null;

  const generateCodeSvgOrDataUrl = async (sku: string): Promise<string> => {
    if (config.codeType === 'qrcode') {
      return QRCode.toDataURL(sku, {
        width: (Number(config.qrSize) || 42) * 3,
        margin: 0,
        errorCorrectionLevel: 'M',
        color: { dark: '#000000', light: '#ffffff' },
      });
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, sku, {
      format: 'CODE128',
      width: Number(config.barcodeWidth) || 1.2,
      height: Number(config.barcodeHeight) || 22,
      displayValue: false,
      margin: 0,
      background: 'transparent',
      lineColor: '#000000',
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

      const renderSingleLabelHtml = (entry: {
        type: 'divider' | 'label';
        outlet: string;
        item?: BatchBarcodePrintItem;
      }) => {
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
        const { qrRow1, qrRow2, barcodeFullName } = parseLabelNameAndVariant(it.name, it.variant);
        const formattedPrice = formatLabelPriceDisplay(it.price, config);

        let priceLine = '';
        if (config.customText && config.customText.trim()) {
          priceLine =
            config.showPrice && formattedPrice
              ? `${escapeHtml(config.customText.trim())} • ${escapeHtml(formattedPrice)}`
              : escapeHtml(config.customText.trim());
        } else if (config.showPrice && formattedPrice) {
          priceLine = escapeHtml(formattedPrice);
        }

        if (config.codeType === 'qrcode') {
          return `
            <div class="sticker-cell is-qr">
              <div class="qr-code-wrap">
                <img src="${codeAsset}" class="qr-img" />
              </div>
              <div class="qr-text-block">
                ${
                  config.showProductName
                    ? `<div class="lbl-qr-row1 ${config.productNameCase === 'uppercase' ? 'uppercase' : ''}">${escapeHtml(qrRow1)}</div>`
                    : ''
                }
                ${
                  config.showVariantSize && qrRow2
                    ? `<div class="lbl-qr-row2">${escapeHtml(qrRow2)}</div>`
                    : ''
                }
                ${
                  config.showSku
                    ? `<div class="lbl-sku font-mono">${escapeHtml(config.skuPrefix)}${escapeHtml(it.sku)}</div>`
                    : ''
                }
                ${priceLine ? `<div class="lbl-price">${priceLine}</div>` : ''}
              </div>
            </div>
          `;
        }

        // 1D Barcode Standard Layout: Top Barcode SVG -> SKU -> Price -> Product Name (Size)
        const autoFontSize = getAutoProductNameFontSize(barcodeFullName, config.productNameSize);

        return `
          <div class="sticker-cell is-barcode">
            <div class="barcode-svg-wrap">
              ${codeAsset}
            </div>
            <div class="barcode-text-block">
              ${
                config.showSku
                  ? `<div class="lbl-sku font-mono">${escapeHtml(config.skuPrefix)}${escapeHtml(it.sku)}</div>`
                  : ''
              }
              ${priceLine ? `<div class="lbl-price">${priceLine}</div>` : ''}
              ${
                config.showProductName
                  ? `<div class="lbl-product-name ${config.productNameCase === 'uppercase' ? 'uppercase' : ''}" style="font-size: ${autoFontSize}pt;">${escapeHtml(barcodeFullName)}</div>`
                  : ''
              }
            </div>
          </div>
        `;
      };

      let pagesHtml = '';
      if (config.lineMode === '1') {
        pagesHtml = flatLabels
          .map((lbl) => `<div class="print-page single">${renderSingleLabelHtml(lbl)}</div>`)
          .join('');
      } else {
        for (let i = 0; i < flatLabels.length; i += 2) {
          const left = renderSingleLabelHtml(flatLabels[i]);
          const right = flatLabels[i + 1]
            ? renderSingleLabelHtml(flatLabels[i + 1])
            : '<div class="sticker-cell empty"></div>';
          pagesHtml += `<div class="print-page twin">${left}${right}</div>`;
        }
      }

      const pageWidthMm = config.lineMode === '2' ? 104 : 50;
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page {
      size: ${pageWidthMm}mm 20mm;
      margin: 0;
    }
    @media print {
      html, body {
        width: ${pageWidthMm}mm !important;
        height: 20mm !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }
      .print-page {
        page-break-after: always;
        break-after: page;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      background: #ffffff;
      color: #000000;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .print-page {
      width: ${pageWidthMm}mm;
      height: 20mm;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      margin: 0;
      padding: 0;
    }
    .print-page.twin {
      justify-content: space-between;
      gap: ${config.twoLineGapMm || 4}mm;
    }
    .sticker-cell {
      width: 50mm;
      height: 20mm;
      padding: ${config.printPaddingMm || 1.0}mm;
      box-sizing: border-box;
      overflow: hidden;
      background: #ffffff;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .sticker-cell.empty {
      visibility: hidden;
    }
    .sticker-cell.divider-cell {
      border: 1.5px dashed #000000;
      border-radius: 1.5mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .divider-tag {
      font-size: 6pt;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #000000;
    }
    .divider-name {
      font-size: 11pt;
      font-weight: 900;
      margin-top: 1mm;
      word-break: break-word;
      color: #000000;
      line-height: 1.1;
    }

    /* 1D Barcode Layout */
    .sticker-cell.is-barcode {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    .barcode-svg-wrap {
      width: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      margin-bottom: 0.3mm;
    }
    .barcode-svg-wrap svg {
      max-width: 47mm;
      height: ${Number(config.barcodeHeight) || 22}px;
      display: block;
    }
    .barcode-text-block {
      width: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      line-height: 1.15;
      overflow: hidden;
    }
    .lbl-sku {
      font-size: ${Number(config.skuSize) || 7.5}pt;
      font-weight: 700;
      letter-spacing: -0.2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      color: #000000;
    }
    .lbl-price {
      font-size: ${Number(config.priceSize) || 9.5}pt;
      font-weight: 800;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      color: #000000;
      letter-spacing: -0.2px;
    }
    .lbl-product-name {
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      width: 100%;
      color: #1e293b;
      letter-spacing: -0.25px;
    }

    /* 2D QR Code Layout */
    .sticker-cell.is-qr {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: flex-start;
      text-align: left;
    }
    .qr-code-wrap {
      width: ${Number(config.qrSize) || 42}px;
      height: ${Number(config.qrSize) || 42}px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-right: 1.5mm;
      flex-shrink: 0;
    }
    .qr-img {
      width: 100%;
      height: 100%;
      display: block;
    }
    .qr-text-block {
      flex: 1;
      min-width: 0;
      height: 100%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      overflow: hidden;
      padding: 0.2mm 0;
      text-align: left;
    }
    .lbl-qr-row1 {
      font-size: ${Number(config.productNameSize) || 7.5}pt;
      font-weight: 700;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #000000;
      line-height: 1.15;
    }
    .lbl-qr-row2 {
      font-size: ${Number(config.variantSize) || 7.0}pt;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      color: #475569;
      line-height: 1.15;
    }
    .font-mono {
      font-family: 'Courier New', Courier, monospace;
    }
    .uppercase {
      text-transform: uppercase;
    }
  </style>
</head>
<body>${pagesHtml}</body>
</html>`;

      printHtmlInHiddenIframe(html);
      onNotify?.(
        `Menyiapkan cetak ${expandedSummary.totalStickers} stiker (${config.lineMode === '2' ? '104x20mm Twin' : '50x20mm'})...`,
        'success'
      );
    } catch (err: any) {
      onNotify?.(err?.message || 'Gagal menyiapkan cetakan barcode.', 'error');
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white truncate">
              {title}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Format Thermal Presisi 50x20mm (1 Line) / 104x20mm (Twin 2 Line)
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowSetup((v) => !v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 transition-colors ${
                showSetup
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 dark:bg-indigo-950/40 dark:border-indigo-700 dark:text-indigo-300'
                  : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50'
              }`}
            >
              <Settings className="w-3.5 h-3.5" />
              <span>{showSetup ? 'Tutup Pengaturan' : 'Pengaturan Label'}</span>
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
          {/* Detailed Setup Drawer */}
          {showSetup && (
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                  Pengaturan Elemen &amp; Tipografi Label
                </span>
                <button
                  type="button"
                  onClick={() => setConfig(DEFAULT_BARCODE_LABEL_CONFIG)}
                  className="text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Reset Default</span>
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showProductName}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, showProductName: e.target.checked }))
                    }
                    className="rounded text-indigo-600"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    Nama Produk
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showVariantSize}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, showVariantSize: e.target.checked }))
                    }
                    className="rounded text-indigo-600"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    Size / Varian
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showSku}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, showSku: e.target.checked }))
                    }
                    className="rounded text-indigo-600"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    Kode SKU
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.showPrice}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, showPrice: e.target.checked }))
                    }
                    className="rounded text-indigo-600"
                  />
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    Harga Jual
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200 dark:border-slate-700 text-xs">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Awalan Harga
                  </label>
                  <select
                    value={config.pricePrefixType}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        pricePrefixType: e.target.value as any,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="Rp">Rp (Contoh: Rp 249.000)</option>
                    <option value="IDR">IDR (Contoh: IDR 249.000)</option>
                    <option value="none">Tanpa Awalan (Contoh: 249.000)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Teks Kustom (Opsional, e.g. SALE)
                  </label>
                  <input
                    type="text"
                    placeholder="SALE / PROMO"
                    value={config.customText}
                    onChange={(e) =>
                      setConfig((p) => ({ ...p, customText: e.target.value }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200"
                  />
                </div>

                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">
                    Huruf Nama Produk
                  </label>
                  <select
                    value={config.productNameCase}
                    onChange={(e) =>
                      setConfig((p) => ({
                        ...p,
                        productNameCase: e.target.value as any,
                      }))
                    }
                    className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200"
                  >
                    <option value="normal">Normal (Sesuai Katalog)</option>
                    <option value="uppercase">HURUF BESAR SEMUA</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Print Options */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase">
                Jenis Simbol Kode
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfig((p) => ({ ...p, codeType: 'barcode' }))}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                    config.codeType === 'barcode'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Tag className="w-3.5 h-3.5" />
                  <span>Barcode 1D</span>
                </button>
                <button
                  type="button"
                  onClick={() => setConfig((p) => ({ ...p, codeType: 'qrcode' }))}
                  className={`flex-1 py-2 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 border transition-all ${
                    config.codeType === 'qrcode'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  <span>QR Code 2D</span>
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
              <div className="text-[11px] font-bold text-slate-500 uppercase">
                Ukuran Kertas Thermal
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfig((p) => ({ ...p, lineMode: '1' }))}
                  className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold border transition-all ${
                    config.lineMode === '1'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  50x20mm (1 Line)
                </button>
                <button
                  type="button"
                  onClick={() => setConfig((p) => ({ ...p, lineMode: '2' }))}
                  className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold border transition-all ${
                    config.lineMode === '2'
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  104x20mm (Twin)
                </button>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col justify-between">
              <div className="text-[11px] font-bold text-slate-500 uppercase">
                Pembatas Toko / Outlet
              </div>
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
                Outlet / Saluran Dicetak ({selectedOutlets.size}/{allOutlets.length})
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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-36 overflow-y-auto pr-1">
              {allOutlets.map((o) => {
                const active = selectedOutlets.has(o);
                const pcs = (itemsByOutlet.get(o) || []).reduce(
                  (s, it) => s + (it.qty || 0),
                  0
                );
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
                    className={`px-2.5 py-1.5 rounded-lg border text-left text-xs flex items-center justify-between gap-1.5 transition-colors ${
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700 text-slate-900 dark:text-white'
                        : 'bg-white dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate font-semibold">
                      {active ? (
                        <CheckSquare className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 shrink-0" />
                      )}
                      <span className="truncate">{o}</span>
                    </span>
                    <span className="font-mono text-[10px] font-bold shrink-0">
                      {pcs.toLocaleString('id-ID')}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Realistic WYSIWYG Preview Sample */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-200">
                Pratinjau Stiker 50x20mm (Maksimal 32 Stiker Pertama)
              </span>
              <span className="text-slate-500">
                Total Siap Cetak:{' '}
                <b className="text-indigo-600 dark:text-indigo-400">
                  {expandedSummary.totalStickers.toLocaleString('id-ID')}
                </b>{' '}
                stiker ({expandedSummary.totalUniqueSkus} SKU)
              </span>
            </div>

            <div className="flex flex-wrap gap-3 max-h-56 overflow-y-auto p-3 bg-slate-100 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
              {expandedSummary.previewList.map((entry, idx) =>
                entry.type === 'divider' ? (
                  <div
                    key={`div-${idx}`}
                    className="w-[190px] h-[76px] p-2 rounded border-2 border-dashed border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-center flex flex-col justify-center items-center shadow-xs"
                  >
                    <span className="text-[9px] font-extrabold text-amber-700 dark:text-amber-300 tracking-wider">
                      PEMBATAS TOKO
                    </span>
                    <span className="text-xs font-black text-slate-900 dark:text-white truncate max-w-full px-1">
                      {entry.outlet}
                    </span>
                  </div>
                ) : (
                  <StickerPreviewCard
                    key={`lbl-${idx}`}
                    item={entry.item!}
                    config={config}
                  />
                )
              )}
              {expandedSummary.previewList.length === 0 && (
                <div className="w-full py-8 text-center text-xs text-slate-400">
                  Tidak ada stiker untuk ditampilkan. Pilih minimal 1 outlet yang memiliki kuota cetak &gt; 0.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Total:{' '}
            <b>{expandedSummary.totalStickers.toLocaleString('id-ID')}</b> stiker
            {config.lineMode === '2' && (
              <span className="text-[11px] text-indigo-600 dark:text-indigo-400 font-semibold ml-2">
                (Twin 104x20mm: ~{Math.ceil(expandedSummary.totalStickers / 2)} baris)
              </span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50"
            >
              Tutup
            </button>
            <button
              type="button"
              disabled={isPrinting || expandedSummary.totalStickers === 0}
              onClick={handlePrint}
              className="px-5 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 disabled:opacity-50 shadow-sm transition-all"
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
