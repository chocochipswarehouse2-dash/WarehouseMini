import React from 'react';
import {
  Eye,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  QrCode,
  Type,
  DollarSign,
  Layers,
  Settings2,
  Info,
} from 'lucide-react';
import { ProductItem } from '../../types';
import {
  ProductBarcodeItem,
  BarcodeCustomizerSettings,
  formatProductPriceWithTag,
  getProductMasterPrice,
  parseBarcodeProductInfo,
  PriceTagMode,
  QrSizePreset,
  TitleFontSizePreset,
  TitleFontWeight,
  TitleLayoutMode,
  PriceFontSizePreset,
  PriceFontWeight,
} from './types';

interface LabelCustomizerPreviewProps {
  settings: BarcodeCustomizerSettings;
  onUpdateSettings: (patch: Partial<BarcodeCustomizerSettings>) => void;
  currentPreviewItem: ProductBarcodeItem | null;
  previewIndex: number;
  setPreviewIndex: React.Dispatch<React.SetStateAction<number>>;
  totalSelectedItems: number;
  qrCache: Record<string, string>;
  catalogMap: Map<string, ProductItem>;
}

export const LabelCustomizerPreview: React.FC<LabelCustomizerPreviewProps> = ({
  settings,
  onUpdateSettings,
  currentPreviewItem,
  previewIndex,
  setPreviewIndex,
  totalSelectedItems,
  qrCache,
  catalogMap,
}) => {
  const {
    printOrientation,
    isRotated180,
    showProductName,
    showSize,
    showPrice,
    showLocation,
    priceTagMode,
    customPricePrefix,
    qrSizePreset,
    titleFontSizePreset,
    titleFontWeight,
    titleLayoutMode,
    priceFontSizePreset,
    priceFontWeight,
  } = settings;

  // Derive preview styling from settings
  const qrPixelSize =
    qrSizePreset === 'small' ? 72 : qrSizePreset === 'large' ? 96 : qrSizePreset === 'xlarge' ? 106 : 84;

  const titlePxSize =
    titleFontSizePreset === 'small' ? 11.5 : titleFontSizePreset === 'large' ? 14.5 : titleFontSizePreset === 'xlarge' ? 16 : 13;

  const variantPxSize =
    titleFontSizePreset === 'small' ? 10.5 : titleFontSizePreset === 'large' ? 13 : titleFontSizePreset === 'xlarge' ? 14.5 : 12;

  const pricePxSize =
    priceFontSizePreset === 'small' ? 13 : priceFontSizePreset === 'large' ? 17.5 : priceFontSizePreset === 'xlarge' ? 19.5 : 15.5;

  const parsedInfo = currentPreviewItem
    ? parseBarcodeProductInfo(currentPreviewItem.nama, currentPreviewItem.size, showProductName, showSize)
    : { titleLine: 'Nama Produk Contoh', variantLine: 'Varian Warna | L', color: 'Hitam', size: 'L' };

  const effectivePrice = currentPreviewItem
    ? currentPreviewItem.price || getProductMasterPrice(catalogMap.get(currentPreviewItem.sku.toLowerCase()))
    : 189000;

  const formattedPriceText = formatProductPriceWithTag(effectivePrice, priceTagMode, customPricePrefix);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
      {/* 1. PREVIEW HEADER */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-purple-600" />
          <h3 className="text-sm font-black text-slate-900 dark:text-white">
            Pratinjau Fisik Label (50 × 20 mm)
          </h3>
        </div>

        {totalSelectedItems > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPreviewIndex((p) => Math.max(0, p - 1))}
              disabled={previewIndex === 0}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
              title="Item Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[11px] font-black text-purple-600 dark:text-purple-400">
              {previewIndex + 1} / {totalSelectedItems}
            </span>
            <button
              type="button"
              onClick={() => setPreviewIndex((p) => Math.min(totalSelectedItems - 1, p + 1))}
              disabled={previewIndex >= totalSelectedItems - 1}
              className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30 cursor-pointer"
              title="Item Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* 2. ORIENTATION & ROTATION BAR */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-purple-50/60 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/60 rounded-xl text-xs">
        <div className="flex items-center gap-1.5">
          <span className="font-extrabold text-slate-700 dark:text-slate-300">Orientasi:</span>
          <div className="inline-flex rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 p-0.5">
            <button
              type="button"
              onClick={() => onUpdateSettings({ printOrientation: 'landscape' })}
              className={`px-2.5 py-1 rounded text-[11px] font-black cursor-pointer transition-all ${
                printOrientation === 'landscape'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              ↔️ Lanskap (50×20)
            </button>
            <button
              type="button"
              onClick={() => onUpdateSettings({ printOrientation: 'portrait' })}
              className={`px-2.5 py-1 rounded text-[11px] font-black cursor-pointer transition-all ${
                printOrientation === 'portrait'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300'
              }`}
            >
              ↕️ Portret (20×50)
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onUpdateSettings({ isRotated180: !isRotated180 })}
          className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border flex items-center gap-1 cursor-pointer transition-all ${
            isRotated180
              ? 'bg-purple-600 text-white border-purple-600'
              : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
          }`}
          title="Putar balik 180 derajat jika stiker terpasang terbalik"
        >
          <RotateCw className={`w-3 h-3 ${isRotated180 ? 'rotate-180' : ''}`} />
          <span>Putar 180°</span>
        </button>
      </div>

      {/* 3. REALISTIC THERMAL STICKER BOX (50×20 mm) */}
      <div className="flex flex-col items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-dashed border-slate-300 dark:border-slate-800">
        <div
          className={`bg-white text-black p-2.5 rounded shadow-md border border-slate-300 select-none font-sans relative overflow-hidden transition-all ${
            printOrientation === 'portrait'
              ? 'w-[140px] h-[260px] flex flex-col items-center justify-center text-center'
              : 'w-[285px] h-[114px] flex flex-row items-center justify-between'
          } ${isRotated180 ? 'rotate-180' : ''}`}
        >
          {/* QR Code */}
          <div
            style={{ width: `${qrPixelSize}px`, height: `${qrPixelSize}px` }}
            className={`${
              printOrientation === 'portrait' ? 'mb-1' : 'mr-2'
            } shrink-0 flex items-center justify-center`}
          >
            {currentPreviewItem && qrCache[currentPreviewItem.sku] ? (
              <img
                src={qrCache[currentPreviewItem.sku]}
                alt={currentPreviewItem.sku}
                className="w-full h-full object-contain [image-rendering:pixelated]"
              />
            ) : (
              <div className="w-full h-full bg-slate-100 border border-dashed border-slate-300 rounded flex items-center justify-center text-slate-400">
                <QrCode className="w-8 h-8" />
              </div>
            )}
          </div>

          {/* Text Area */}
          <div
            className={`flex flex-col justify-center overflow-hidden flex-1 py-0.5 pl-0.5 ${
              printOrientation === 'portrait' ? 'w-full text-center pl-0 pt-1' : 'text-left'
            }`}
          >
            {/* Title & Size */}
            {titleLayoutMode === 'single' ? (
              <div
                className="text-slate-950 truncate leading-tight tracking-tight"
                style={{
                  fontFamily: "'Quicksand', -apple-system, BlinkMacSystemFont, sans-serif",
                  fontSize: `${titlePxSize}px`,
                  fontWeight: Number(titleFontWeight),
                }}
              >
                {[parsedInfo.titleLine, parsedInfo.variantLine].filter(Boolean).join(' - ')}
              </div>
            ) : (
              <>
                {parsedInfo.titleLine && (
                  <div
                    className="text-slate-950 truncate leading-tight tracking-tight"
                    style={{
                      fontFamily: "'Quicksand', -apple-system, BlinkMacSystemFont, sans-serif",
                      fontSize: `${titlePxSize}px`,
                      fontWeight: Number(titleFontWeight),
                    }}
                    title={parsedInfo.titleLine}
                  >
                    {parsedInfo.titleLine}
                  </div>
                )}
                {parsedInfo.variantLine && (
                  <div
                    className="text-slate-900 truncate leading-tight tracking-tight mt-0.5"
                    style={{
                      fontFamily: "'Quicksand', -apple-system, BlinkMacSystemFont, sans-serif",
                      fontSize: `${variantPxSize}px`,
                      fontWeight: Number(titleFontWeight) > 600 ? 600 : 500,
                    }}
                    title={parsedInfo.variantLine}
                  >
                    {parsedInfo.variantLine}
                  </div>
                )}
              </>
            )}

            {/* SKU & Location */}
            <div className="text-[10px] font-semibold text-slate-600 font-mono truncate leading-tight my-0.5 tracking-tight flex items-center gap-1">
              <span>{currentPreviewItem?.sku || 'SKU-CONTOH-01'}</span>
              {showLocation && currentPreviewItem?.lokasi && (
                <span className="text-[8.5px] font-bold text-slate-400">
                  [{currentPreviewItem.lokasi}]
                </span>
              )}
            </div>

            {/* Price */}
            {showPrice && formattedPriceText && (
              <div
                className="text-slate-950 truncate leading-tight tracking-tight mt-0.5"
                style={{
                  fontFamily: "'Quicksand', -apple-system, BlinkMacSystemFont, sans-serif",
                  fontSize: `${pricePxSize}px`,
                  fontWeight: Number(priceFontWeight),
                }}
              >
                {formattedPriceText}
              </div>
            )}
          </div>
        </div>

        <div className="mt-2 text-[10px] font-bold text-slate-400">
          Skala Realistis Kertas Thermal 50 × 20 mm
        </div>
      </div>

      {/* 4. ADVANCED CUSTOMIZER CONTROLS */}
      <div className="space-y-3.5 pt-2 border-t border-slate-200 dark:border-slate-800 text-xs">
        {/* A. Tag / Format Harga */}
        <div className="space-y-1.5">
          <div className="font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-purple-600" />
            <span>Format Tag Harga Produk:</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            <button
              type="button"
              onClick={() => onUpdateSettings({ priceTagMode: 'none' })}
              className={`p-2 rounded-xl text-center border font-bold cursor-pointer transition-all ${
                priceTagMode === 'none'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              }`}
            >
              <div>Polos</div>
              <div className="text-[10px] opacity-80">189.000</div>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ priceTagMode: 'rp' })}
              className={`p-2 rounded-xl text-center border font-bold cursor-pointer transition-all ${
                priceTagMode === 'rp'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              }`}
            >
              <div>Tag Rp</div>
              <div className="text-[10px] opacity-80">Rp 189.000</div>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ priceTagMode: 'idr' })}
              className={`p-2 rounded-xl text-center border font-bold cursor-pointer transition-all ${
                priceTagMode === 'idr'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              }`}
            >
              <div>Tag IDR</div>
              <div className="text-[10px] opacity-80">IDR 189.000</div>
            </button>

            <button
              type="button"
              onClick={() => onUpdateSettings({ priceTagMode: 'custom' })}
              className={`p-2 rounded-xl text-center border font-bold cursor-pointer transition-all ${
                priceTagMode === 'custom'
                  ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                  : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              }`}
            >
              <div>Custom Tag</div>
              <div className="text-[10px] opacity-80">{customPricePrefix || 'Ketik...'}</div>
            </button>
          </div>

          {priceTagMode === 'custom' && (
            <div className="pt-1">
              <input
                type="text"
                value={customPricePrefix}
                onChange={(e) => onUpdateSettings({ customPricePrefix: e.target.value })}
                placeholder="Ketik prefix custom (cth: NET, SALE, S$, RP.)"
                className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
              />
            </div>
          )}
        </div>

        {/* B. Ukuran QR Code */}
        <div className="space-y-1.5">
          <div className="font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <QrCode className="w-3.5 h-3.5 text-purple-600" />
            <span>Ukuran QR Code:</span>
          </div>
          <div className="grid grid-cols-4 gap-1.5">
            {(['small', 'normal', 'large', 'xlarge'] as QrSizePreset[]).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => onUpdateSettings({ qrSizePreset: preset })}
                className={`py-1.5 px-2 rounded-lg text-center border font-bold text-[11px] cursor-pointer transition-all ${
                  qrSizePreset === preset
                    ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                }`}
              >
                {preset === 'small'
                  ? 'Kecil (11.5mm)'
                  : preset === 'normal'
                  ? 'Standar (13.5mm)'
                  : preset === 'large'
                  ? 'Besar (15mm)'
                  : 'Ekstra (16.5mm)'}
              </button>
            ))}
          </div>
        </div>

        {/* C. Font Nama Produk & Size */}
        <div className="space-y-1.5">
          <div className="font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Type className="w-3.5 h-3.5 text-purple-600" />
            <span>Font Nama Produk &amp; Size:</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 font-bold block mb-1">Ukuran Huruf:</label>
              <select
                value={titleFontSizePreset}
                onChange={(e) => onUpdateSettings({ titleFontSizePreset: e.target.value as TitleFontSizePreset })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
              >
                <option value="small">Kecil (7.5pt)</option>
                <option value="normal">Standar (8.8pt)</option>
                <option value="large">Besar (9.8pt)</option>
                <option value="xlarge">Ekstra Besar (11pt)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 font-bold block mb-1">Ketebalan Font:</label>
              <select
                value={titleFontWeight}
                onChange={(e) => onUpdateSettings({ titleFontWeight: e.target.value as TitleFontWeight })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
              >
                <option value="500">Medium (500)</option>
                <option value="600">Semi-Bold (600)</option>
                <option value="700">Bold (700)</option>
                <option value="800">Extra Bold (800)</option>
              </select>
            </div>
          </div>
        </div>

        {/* D. Font Harga */}
        <div className="space-y-1.5">
          <div className="font-black text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5 text-purple-600" />
            <span>Font Harga Produk:</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 font-bold block mb-1">Ukuran Font Harga:</label>
              <select
                value={priceFontSizePreset}
                onChange={(e) => onUpdateSettings({ priceFontSizePreset: e.target.value as PriceFontSizePreset })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
              >
                <option value="small">Kecil (9.5pt)</option>
                <option value="normal">Standar (11.5pt)</option>
                <option value="large">Besar (13.5pt)</option>
                <option value="xlarge">Ekstra Besar (15.5pt)</option>
              </select>
            </div>

            <div>
              <label className="text-[10px] text-slate-500 font-bold block mb-1">Ketebalan Font Harga:</label>
              <select
                value={priceFontWeight}
                onChange={(e) => onUpdateSettings({ priceFontWeight: e.target.value as PriceFontWeight })}
                className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-900 dark:text-white"
              >
                <option value="600">Semi-Bold (600)</option>
                <option value="700">Bold (700)</option>
                <option value="800">Extra Bold (800)</option>
                <option value="900">Black (900)</option>
              </select>
            </div>
          </div>
        </div>

        {/* E. Toggles Elemen */}
        <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="font-black text-slate-700 dark:text-slate-300">
            Tampilkan Elemen Stiker:
          </div>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showProductName}
                onChange={(e) => onUpdateSettings({ showProductName: e.target.checked })}
                className="rounded text-purple-600 focus:ring-purple-500"
              />
              <span>Nama Produk</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showSize}
                onChange={(e) => onUpdateSettings({ showSize: e.target.checked })}
                className="rounded text-purple-600 focus:ring-purple-500"
              />
              <span>Size / Ukuran</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showPrice}
                onChange={(e) => onUpdateSettings({ showPrice: e.target.checked })}
                className="rounded text-purple-600 focus:ring-purple-500"
              />
              <span className="font-bold text-purple-700 dark:text-purple-300">Harga Produk</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showLocation}
                onChange={(e) => onUpdateSettings({ showLocation: e.target.checked })}
                className="rounded text-purple-600 focus:ring-purple-500"
              />
              <span>Lokasi Rak</span>
            </label>
          </div>
        </div>

        {/* Thermal Print Setup Instructions */}
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl text-[11px] text-amber-900 dark:text-amber-100 space-y-1">
          <div className="flex items-center gap-1.5 font-black text-amber-950 dark:text-amber-50">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Pengaturan Printer Thermal 50×20 mm:</span>
          </div>
          <ul className="list-disc pl-4 space-y-0.5 text-[10.5px]">
            <li><b>Tata Letak:</b> Lanskap (Landscape)</li>
            <li><b>Ukuran Kertas:</b> 50×20 mm / User Defined</li>
            <li><b>Margin:</b> None (Tanpa Margin) &amp; Skala 100%</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
