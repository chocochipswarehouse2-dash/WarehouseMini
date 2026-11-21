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
  Compass,
} from 'lucide-react';
import {
  BarcodePrinterConfig,
  BatchBarcodePrintItem,
  DEFAULT_BARCODE_LABEL_CONFIG,
  formatLabelPriceDisplay,
  getAutoProductNameFontSize,
  parseLabelNameAndVariant,
  printHtmlInHiddenIframe,
  getOutletDisplayName,
} from '../../utils/csvToolsUtils';

interface BatchBarcodePrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  itemsByOutlet: Map<string, BatchBarcodePrintItem[]>;
  initialSelectedOutlets: string[];
  onNotify?: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

const STORAGE_KEY = 'CHO_BARCODE_CONFIG_50x20_V3';

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Realistic Preview Component for 1 Sticker (50x20mm scale) with Live Rotation
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
        width: (Number(config.qrSize) || 42) * 2,
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

  const rotation = Number(config.printRotation) || 0;
  const isPortrait = config.printOrientation === 'portrait';

  if (config.codeType === 'qrcode') {
    return (
      <div
        className={`w-[190px] h-[76px] bg-white border border-slate-300 rounded shadow-xs p-1 flex items-center gap-1.5 overflow-hidden select-none text-slate-900 transition-transform duration-200 ${
          rotation ? `rotate-[${rotation}deg]` : ''
        }`}
        style={{
          transform: rotation ? `rotate(${rotation}deg)` : undefined,
          transformOrigin: 'center center',
        }}
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
        <div className="flex-1 min-w-0 flex flex-col justify-center h-full py-0.5 text-left overflow-hidden">
          {config.showProductName && (
            <div
              style={{
                fontSize: `${Number(config.productNameSize) || 8.5}pt`,
                textTransform: config.productNameCase === 'uppercase' ? 'uppercase' : 'none',
              }}
              className="font-bold text-slate-950 truncate leading-tight"
            >
              {qrRow1}
            </div>
          )}
          {config.showVariantSize && qrRow2 ? (
            <div
              style={{ fontSize: `${Number(config.variantSize) || 8.0}pt` }}
              className="text-slate-700 truncate leading-tight mt-[0.8px]"
            >
              {qrRow2}
            </div>
          ) : null}
          {config.showSku && (
            <div
              style={{ fontSize: `${Number(config.skuSize) || 6.8}pt` }}
              className="font-mono font-bold text-slate-800 truncate leading-tight my-[1px]"
            >
              {config.skuPrefix}
              {item.sku}
            </div>
          )}
          {priceLine ? (
            <div
              style={{ fontSize: `${Number(config.priceSize) || 11.0}pt` }}
              className="font-black text-slate-950 truncate leading-tight tracking-tight mt-[1px]"
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
      className="w-[190px] h-[76px] bg-white border border-slate-300 rounded shadow-xs p-1 flex flex-col justify-center items-center text-center overflow-hidden select-none text-slate-900 transition-transform duration-200"
      style={{
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: 'center center',
      }}
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
      // 1. Cache generated barcode SVG / QR dataURL per unique SKU for blazing speed
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

      // 2. Compute Page Dimensions & Rotation Transform
      const isTwoLine = config.lineMode === '2';
      const rawWidthMm = isTwoLine
        ? (config.labelWidthMm || 50) * 2 + (Number(config.twoLineGapMm) || 4)
        : (config.labelWidthMm || 50);
      const rawHeightMm = config.labelHeightMm || 20;

      const isPortrait = config.printOrientation === 'portrait';
      const pageWidthMm = isPortrait ? rawHeightMm : rawWidthMm;
      const pageHeightMm = isPortrait ? rawWidthMm : rawHeightMm;
      const cellWidthMm = isPortrait ? rawHeightMm : (config.labelWidthMm || 50);
      const cellHeightMm = isPortrait ? rawWidthMm : (config.labelHeightMm || 20);

      const effectiveRot = Number(config.printRotation) || 0;
      const offsetX = Number(config.offsetX) || 0;
      const offsetY = Number(config.offsetY) || 0;
      const transformParts: string[] = [];
      if (effectiveRot) transformParts.push(`rotate(${effectiveRot}deg)`);
      if (offsetX || offsetY) transformParts.push(`translate(${offsetX}mm, ${offsetY}mm)`);
      const effectiveTransform = transformParts.join(' ');

      const renderSingleLabelHtml = (entry: {
        type: 'divider' | 'label';
        outlet: string;
        item?: BatchBarcodePrintItem;
      }) => {
        if (entry.type === 'divider') {
          const oName = entry.outlet;
          const oItems = itemsByOutlet.get(oName) || [];
          const oTotalPcs = oItems.reduce((sum, it) => sum + (it.qty || 0), 0);
          const oTotalSkus = oItems.length;

          return `
            <div class="sticker-cell sticker-divider" style="width: ${cellWidthMm}mm !important; height: ${cellHeightMm}mm !important; box-sizing: border-box !important; padding: 1.2mm 2mm !important; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; text-align: center !important; background: #000000 !important; color: #ffffff !important; overflow: hidden !important; font-family: system-ui, -apple-system, sans-serif !important; ${
              effectiveTransform
                ? `transform: ${effectiveTransform} !important; transform-origin: center center !important;`
                : ''
            }">
              <div style="font-size: 5.5pt; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: #ffffff; border-bottom: 1px dashed #ffffff; width: 100%; padding-bottom: 0.5mm; margin-bottom: 0.8mm;">★ PEMBATAS OUTLET ★</div>
              <div style="font-size: 8.5pt; font-weight: 900; line-height: 1.15; color: #ffffff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${escapeHtml(
                oName
              )}</div>
              <div style="font-size: 6.5pt; font-weight: 700; color: #e2e8f0; margin-top: 0.8mm; display: flex; gap: 2.5mm; justify-content: center; align-items: center;">
                <span>TOTAL: <b>${oTotalPcs} PCS</b></span>
                <span>(${oTotalSkus} SKU)</span>
              </div>
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
          const qrPx = Number(config.qrSize) || 44;
          return `
            <div class="sticker-cell is-qr ${isPortrait ? 'mode-portrait' : 'mode-landscape'}" style="width: ${cellWidthMm}mm !important; height: ${cellHeightMm}mm !important; box-sizing: border-box !important; padding: ${
              isPortrait ? '1.5mm 1mm' : '1mm 1.5mm'
            } !important; display: flex !important; flex-direction: ${
              isPortrait ? 'column' : 'row'
            } !important; align-items: center !important; justify-content: ${
              isPortrait ? 'center' : 'flex-start'
            } !important; overflow: hidden !important; background: #ffffff !important; color: #000000 !important; font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important; ${
            effectiveTransform
              ? `transform: ${effectiveTransform} !important; transform-origin: center center !important;`
              : ''
          }">
              <div style="width: ${qrPx}px; height: ${qrPx}px; flex-shrink: 0; margin-right: ${
                isPortrait ? '0' : '1.8mm'
              }; margin-bottom: ${
                isPortrait ? '1.2mm' : '0'
              }; display: flex; align-items: center; justify-content: center;">
                <img src="${codeAsset}" style="width: 100%; height: 100%; object-fit: contain; image-rendering: pixelated; display: block;" />
              </div>
              <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; overflow: hidden; text-align: ${
                isPortrait ? 'center' : 'left'
              };">
                ${
                  config.showProductName
                    ? `<div style="font-size: ${Number(config.productNameSize) || 8.5}pt; font-weight: ${
                        config.productNameBold ? '800' : '700'
                      }; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #000000; line-height: 1.15; letter-spacing: -0.01em; text-transform: ${
                        config.productNameCase === 'uppercase' ? 'uppercase' : 'none'
                      };">${escapeHtml(qrRow1)}</div>`
                    : ''
                }
                ${
                  config.showVariantSize && qrRow2
                    ? `<div style="font-size: ${Number(config.variantSize) || 8.0}pt; font-weight: ${
                        config.variantBold ? '700' : '600'
                      }; color: #111111; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.15; margin-top: 0.2mm; letter-spacing: -0.01em;">${escapeHtml(
                        qrRow2
                      )}</div>`
                    : ''
                }
                ${
                  config.showSku
                    ? `<div style="font-family: 'JetBrains Mono', monospace; font-size: ${
                        Number(config.skuSize) || 6.8
                      }pt; font-weight: 700; color: #333333; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1; margin: 0.3mm 0;">${escapeHtml(
                        config.skuPrefix
                      )}${escapeHtml(it.sku)}</div>`
                    : ''
                }
                ${
                  priceLine
                    ? `<div style="font-size: ${Number(config.priceSize) || 11.0}pt; font-weight: ${
                        config.priceBold ? '900' : '800'
                      }; color: #000000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; line-height: 1.1; letter-spacing: -0.01em; margin-top: 0.2mm;">${priceLine}</div>`
                    : ''
                }
              </div>
            </div>
          `;
        }

        // 1D Barcode Standard Layout: Top Barcode SVG -> SKU -> Price -> Product Name (Size)
        const autoFontSize = getAutoProductNameFontSize(barcodeFullName, config.productNameSize);

        return `
          <div class="sticker-cell is-barcode" style="width: ${cellWidthMm}mm !important; height: ${cellHeightMm}mm !important; box-sizing: border-box !important; padding: ${
            config.printPaddingMm || 1.0
          }mm 1.5mm !important; display: flex !important; flex-direction: column !important; justify-content: center !important; align-items: center !important; text-align: center !important; overflow: hidden !important; background: #ffffff !important; color: #000000 !important; ${
          effectiveTransform
            ? `transform: ${effectiveTransform} !important; transform-origin: center center !important;`
            : ''
        }">
            <div style="width: 100%; display: flex; justify-content: center; align-items: center; overflow: hidden; margin-bottom: 0.5mm;">
              ${codeAsset}
            </div>
            <div style="width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; overflow: hidden; line-height: 1.15;">
              ${
                config.showSku
                  ? `<div style="font-family: monospace; font-size: ${
                      Number(config.skuSize) || 7.5
                    }pt; font-weight: ${
                      config.skuBold ? '700' : '400'
                    }; color: #0f172a; letter-spacing: -0.2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%;">${escapeHtml(
                      config.skuPrefix
                    )}${escapeHtml(it.sku)}</div>`
                  : ''
              }
              ${
                priceLine
                  ? `<div style="font-size: ${Number(config.priceSize) || 9.5}pt; font-weight: ${
                      config.priceBold ? '800' : '400'
                    }; color: #000000; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; letter-spacing: -0.2px; margin: 0.5px 0;">${priceLine}</div>`
                  : ''
              }
              ${
                config.showProductName
                  ? `<div style="font-size: ${autoFontSize}pt; font-weight: ${
                      config.productNameBold ? '700' : '400'
                    }; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; width: 100%; text-transform: ${
                      config.productNameCase === 'uppercase' ? 'uppercase' : 'none'
                    };" title="${escapeHtml(barcodeFullName)}">${escapeHtml(barcodeFullName)}</div>`
                  : ''
              }
            </div>
          </div>
        `;
      };

      // Build each print row/page (Crucial: NO height constraint on html/body so ALL pages print!)
      let pagesHtml = '';
      if (config.lineMode === '1') {
        pagesHtml = flatLabels
          .map((lbl) => `<div class="print-row-page">${renderSingleLabelHtml(lbl)}</div>`)
          .join('');
      } else {
        for (let i = 0; i < flatLabels.length; i += 2) {
          const left = renderSingleLabelHtml(flatLabels[i]);
          const right = flatLabels[i + 1]
            ? renderSingleLabelHtml(flatLabels[i + 1])
            : '<div class="sticker-cell empty" style="width: 50mm; height: 20mm; visibility: hidden;"></div>';
          pagesHtml += `<div class="print-row-page">${left}${right}</div>`;
        }
      }

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="color-scheme" content="light" />
  <title>${escapeHtml(title)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700;800;900&family=JetBrains+Mono:wght@600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      color-scheme: light !important;
    }
    @page {
      size: ${pageWidthMm}mm ${pageHeightMm}mm ${isPortrait ? 'portrait' : 'landscape'};
      margin: 0mm !important;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      width: ${pageWidthMm}mm !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      color: #000000 !important;
      color-scheme: light !important;
      font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
    }
    .print-row-page {
      width: ${pageWidthMm}mm !important;
      height: ${pageHeightMm}mm !important;
      page-break-after: always !important;
      break-after: page !important;
      page-break-inside: avoid !important;
      break-inside: avoid !important;
      margin: 0 !important;
      padding: 0 !important;
      display: flex !important;
      flex-direction: row !important;
      align-items: center !important;
      justify-content: ${isTwoLine ? 'space-between' : 'center'} !important;
      gap: ${isTwoLine ? `${config.twoLineGapMm || 4}mm` : '0'} !important;
      overflow: hidden !important;
    }
    .sticker-cell {
      width: ${cellWidthMm}mm !important;
      height: ${cellHeightMm}mm !important;
      overflow: hidden !important;
      background: #ffffff !important;
      box-sizing: border-box !important;
    }
    svg { display: block; max-width: 100%; height: auto; }
    img { display: block; }
  </style>
</head>
<body>${pagesHtml}</body>
</html>`;

      printHtmlInHiddenIframe(html);
      onNotify?.(
        `Menyiapkan cetak ${expandedSummary.totalStickers} stiker (${
          config.lineMode === '2' ? '104x20mm Twin' : '50x20mm'
        })...`,
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
            <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-4">
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

              {/* Checkboxes */}
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

              {/* Harga & Teks Kustom */}
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

              {/* Orientasi & Rotasi Cetak Thermal */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Orientasi &amp; Rotasi Cetak Thermal</span>
                  </label>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400">
                    {config.printOrientation === 'portrait' ? 'Potret (Tegak)' : 'Lanskap (Melebar)'} • {config.printRotation || 0}&deg;
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {/* Arah Halaman */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Arah Halaman:
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((p) => ({ ...p, printOrientation: 'landscape' }))
                        }
                        className={`p-2 rounded-xl border text-center font-bold transition-all ${
                          (config.printOrientation || 'landscape') === 'landscape'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-xs">Lanskap (Melebar)</div>
                        <div className="text-[10px] font-normal opacity-80 mt-0.5">50 &times; 20 mm</div>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((p) => ({ ...p, printOrientation: 'portrait' }))
                        }
                        className={`p-2 rounded-xl border text-center font-bold transition-all ${
                          config.printOrientation === 'portrait'
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="text-xs">Potret (Tegak)</div>
                        <div className="text-[10px] font-normal opacity-80 mt-0.5">20 &times; 50 mm</div>
                      </button>
                    </div>
                  </div>

                  {/* Rotasi Konten */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                      Rotasi Stiker (Jika Hasil Cetak Terbalik):
                    </span>
                    <div className="grid grid-cols-4 gap-1.5">
                      {[
                        { deg: 0, label: '0° Normal' },
                        { deg: 90, label: '90° Kanan' },
                        { deg: 180, label: '180° Balik' },
                        { deg: 270, label: '270° Kiri' },
                      ].map((r) => (
                        <button
                          key={r.deg}
                          type="button"
                          onClick={() =>
                            setConfig((p) => ({ ...p, printRotation: r.deg }))
                          }
                          className={`py-2 px-1 rounded-xl border text-center font-bold transition-all ${
                            (Number(config.printRotation) || 0) === r.deg
                              ? 'bg-amber-400 text-slate-950 border-amber-500 font-extrabold shadow-xs'
                              : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-[11px] font-extrabold">{r.deg}&deg;</div>
                          <div className="text-[9px] font-normal opacity-80">{r.label.split(' ')[1]}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Print Options */}
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

          {/* Quick Orientation & Rotation Bar */}
          <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/40 dark:bg-amber-950/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Compass className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <div>
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Orientasi &amp; Rotasi Thermal Roll:
                </span>
                <span className="text-[11px] text-slate-500 dark:text-slate-400 ml-1.5 hidden md:inline">
                  (Jika hasil fisik Xprinter XP-420B miring 90&deg;, sesuaikan tombol di samping)
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
              <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setConfig((p) => ({ ...p, printOrientation: 'landscape' }))}
                  className={`px-2.5 py-1 rounded-md font-bold text-[11px] transition-all ${
                    (config.printOrientation || 'landscape') === 'landscape'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Lanskap (50x20)
                </button>
                <button
                  type="button"
                  onClick={() => setConfig((p) => ({ ...p, printOrientation: 'portrait' }))}
                  className={`px-2.5 py-1 rounded-md font-bold text-[11px] transition-all ${
                    config.printOrientation === 'portrait'
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'
                  }`}
                >
                  Potret (20x50)
                </button>
              </div>
              <div className="flex items-center gap-1">
                {[
                  { deg: 0, label: '0°' },
                  { deg: 90, label: '90°' },
                  { deg: 180, label: '180°' },
                  { deg: 270, label: '270°' },
                ].map((r) => (
                  <button
                    key={r.deg}
                    type="button"
                    onClick={() => setConfig((p) => ({ ...p, printRotation: r.deg }))}
                    className={`px-2 py-1 rounded-lg text-[11px] font-extrabold border transition-all ${
                      (Number(config.printRotation) || 0) === r.deg
                        ? 'bg-amber-400 text-slate-950 border-amber-500 shadow-xs'
                        : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100'
                    }`}
                    title={`Putar ${r.label}`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
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
                      <span className="truncate" title={getOutletDisplayName(o).title}>{o}</span>
                      {o.startsWith('B-') && (
                        <span className="text-[8px] font-extrabold px-1 py-0.2 rounded bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 shrink-0">
                          BAZAR
                        </span>
                      )}
                      {['MAP', 'WH', 'QC', 'GA', 'LOG', 'GUDANG_RETUR'].includes(o) && (
                        <span className="text-[8px] font-extrabold px-1 py-0.2 rounded bg-sky-100 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300 shrink-0">
                          GUDANG
                        </span>
                      )}
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
                      ★ PEMBATAS OUTLET ★
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
