import React, { useState, useEffect, useRef } from 'react';
import { X, Printer, QrCode, Check, Copy, SlidersHorizontal, Plus, Minus, Layers } from 'lucide-react';
import QRCode from 'qrcode';
import { KatalogItem, KatalogVariant } from '../../types';

interface KatalogBarcodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: KatalogItem | null;
  items?: KatalogItem[] | null; // Support multi-product barcode print
  onNotify: (msg: string, type: 'success' | 'error' | 'warning' | 'info') => void;
}

interface PrintableBarcodeEntry {
  nomor: string;
  catalog_name: string;
  nama_produk: string;
  price: string | number;
  warna: string;
  size: string;
  sku: string;
  qty: number;
  copies: number;
  qrDataUrl?: string;
}

export const KatalogBarcodeModal: React.FC<KatalogBarcodeModalProps> = ({
  isOpen,
  onClose,
  item,
  items,
  onNotify,
}) => {
  const [entries, setEntries] = useState<PrintableBarcodeEntry[]>([]);
  const [useQtyAsCopies, setUseQtyAsCopies] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Siapkan data tiket barcode
  useEffect(() => {
    if (!isOpen) return;

    const targetList: KatalogItem[] = items && items.length > 0 ? items : item ? [item] : [];
    if (targetList.length === 0) return;

    const flatEntries: PrintableBarcodeEntry[] = [];
    targetList.forEach((prod) => {
      (prod.variants || []).forEach((v) => {
        flatEntries.push({
          nomor: prod.nomor || '-',
          catalog_name: prod.catalog_name || 'KATALOG',
          nama_produk: prod.deskripsi || 'Produk',
          price: prod.price || '',
          warna: v.warna || '-',
          size: v.size || 'Default',
          sku: v.sku || '-',
          qty: v.qty || 0,
          copies: useQtyAsCopies && v.qty > 0 ? v.qty : 1,
        });
      });
    });

    setIsGenerating(true);
    // Generate QR Code untuk setiap SKU
    Promise.all(
      flatEntries.map(async (entry) => {
        try {
          const qrText = entry.sku && entry.sku !== '-' ? entry.sku : `${entry.nama_produk}-${entry.warna}`;
          const qrUrl = await QRCode.toDataURL(qrText, {
            width: 140,
            margin: 1,
            errorCorrectionLevel: 'M',
          });
          return { ...entry, qrDataUrl: qrUrl };
        } catch {
          return entry;
        }
      })
    )
      .then((res) => {
        setEntries(res);
        setIsGenerating(false);
      })
      .catch(() => {
        setEntries(flatEntries);
        setIsGenerating(false);
      });
  }, [isOpen, item, items, useQtyAsCopies]);

  if (!isOpen) return null;

  const totalLabels = entries.reduce((acc, e) => acc + (e.copies || 0), 0);

  const handleUpdateCopies = (index: number, delta: number) => {
    setEntries((prev) =>
      prev.map((e, i) => {
        if (i === index) {
          const next = Math.max(0, e.copies + delta);
          return { ...e, copies: next };
        }
        return e;
      })
    );
  };

  const handlePrint = () => {
    if (totalLabels === 0) {
      onNotify('Jumlah stiker yang akan dicetak adalah 0', 'warning');
      return;
    }

    // Bangun HTML cetak thermal 50x20mm murni
    const pagesHtml = entries
      .flatMap((entry) => {
        const copies = Math.max(0, entry.copies || 0);
        const qrTag = entry.qrDataUrl
          ? `<img src="${entry.qrDataUrl}" alt="QR" style="width: 13.5mm; height: 13.5mm; object-fit: contain; image-rendering: pixelated; display: block;" />`
          : `<div style="font-size: 8px; font-weight: bold; text-align: center;">${entry.sku}</div>`;

        let rawPrice = String(entry.price || '').replace(/^Rp\s*/i, '').trim();
        let displayPrice = '';
        if (rawPrice) {
          displayPrice = rawPrice.startsWith('Rp') ? rawPrice : `Rp ${rawPrice}`;
        }

        const variantText = [entry.warna, entry.size && entry.size !== 'Default' ? entry.size : ''].filter(Boolean).join(' | ') || 'Default';

        return Array.from({ length: copies }).map(
          () => `
          <div class="thermal-page-wrapper">
            <div class="thermal-page-inner">
              <div class="thermal-qr-container">
                ${qrTag}
              </div>
              <div class="thermal-info-container">
                <div class="thermal-line-title" title="${escapeHtml(entry.nama_produk)}">${escapeHtml(entry.nama_produk)}</div>
                <div class="thermal-line-variant" title="${escapeHtml(variantText)}">${escapeHtml(variantText)}</div>
                <div class="thermal-line-sku">${escapeHtml(entry.sku)}</div>
                ${displayPrice ? `<div class="thermal-line-price">${escapeHtml(displayPrice)}</div>` : ''}
              </div>
            </div>
          </div>
        `
        );
      })
      .join('');

    // Buat iframe terisolasi agar TIDAK ADA duplikasi halaman dari parent document!
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '50mm';
    iframe.style.height = '20mm';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Cetak Barcode Produk 50x20mm</title>
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap" rel="stylesheet">
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Quicksand:wght@400;500;600;700&display=swap');
            @page {
              size: 50mm 20mm landscape;
              margin: 0mm !important;
            }
            *, *::before, *::after {
              box-sizing: border-box !important;
              margin: 0;
              padding: 0;
            }
            html, body {
              width: 50mm !important;
              height: 20mm !important;
              margin: 0 !important;
              padding: 0 !important;
              background: #ffffff !important;
              color: #000000 !important;
              font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .thermal-page-wrapper {
              display: block !important;
              position: relative !important;
              width: 50mm !important;
              height: 20mm !important;
              max-width: 50mm !important;
              max-height: 20mm !important;
              page-break-before: auto !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              break-before: auto !important;
              break-after: page !important;
              break-inside: avoid !important;
              overflow: hidden !important;
              margin: 0 !important;
              padding: 0 !important;
              box-sizing: border-box !important;
            }
            .thermal-page-inner {
              width: 50mm !important;
              height: 20mm !important;
              max-width: 50mm !important;
              max-height: 20mm !important;
              box-sizing: border-box !important;
              padding: 1.0mm 1.5mm !important;
              display: flex !important;
              flex-direction: row !important;
              align-items: center !important;
              justify-content: flex-start !important;
              overflow: hidden !important;
              background: #ffffff !important;
              color: #000000 !important;
            }
            .thermal-qr-container {
              width: 13.5mm !important;
              height: 13.5mm !important;
              margin-right: 1.5mm !important;
              margin-bottom: 0 !important;
              flex-shrink: 0 !important;
              display: flex !important;
              align-items: center !important;
              justify-content: center !important;
              background: #ffffff !important;
            }
            .thermal-info-container {
              flex: 1 !important;
              min-width: 0 !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: center !important;
              overflow: hidden !important;
              padding-right: 0.5mm !important;
              text-align: left;
            }
            .thermal-line-title {
              font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
              font-size: 9.2pt !important;
              font-weight: 600 !important;
              line-height: 1.15 !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              color: #000000 !important;
              letter-spacing: -0.05px !important;
            }
            .thermal-line-variant {
              font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
              font-size: 8.4pt !important;
              font-weight: 600 !important;
              line-height: 1.15 !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              color: #111111 !important;
              letter-spacing: -0.05px !important;
              margin-bottom: 0.15mm !important;
            }
            .thermal-line-sku {
              font-size: 7.0pt !important;
              font-weight: 600 !important;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace, sans-serif !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              text-overflow: ellipsis !important;
              color: #222222 !important;
              line-height: 1.1 !important;
              margin: 0.2mm 0 !important;
              letter-spacing: 0px !important;
            }
            .thermal-line-price {
              font-family: 'Quicksand', sans-serif !important;
              font-size: 12.0pt !important;
              font-weight: 700 !important;
              white-space: nowrap !important;
              overflow: hidden !important;
              color: #000000 !important;
              line-height: 1.05 !important;
              letter-spacing: -0.1px !important;
            }
          </style>
        </head>
        <body>
          ${pagesHtml}
        </body>
      </html>
    `;

    doc.open();
    doc.write(fullHtml);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }, 250);
  };

  const escapeHtml = (str: string) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-3xl max-h-[92vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Modal */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>Cetak Barcode Thermal Produk</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300 font-semibold">
                  Ukuran 50x20 mm
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {item ? `${item.deskripsi} (${entries.length} Varian)` : `${items?.length || 0} Produk dipilih`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar Pengaturan Salinan */}
        <div className="px-6 py-2.5 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={useQtyAsCopies}
                onChange={(e) => setUseQtyAsCopies(e.target.checked)}
                className="rounded text-violet-600 focus:ring-violet-500"
              />
              <span>Gunakan Jumlah Stok Fisik (Qty) Sebagai Jumlah Cetak</span>
            </label>
          </div>

          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-400 font-medium">
            <span>
              Total Barcode Varian: <strong className="text-slate-900 dark:text-slate-100">{entries.length}</strong>
            </span>
            <span>•</span>
            <span>
              Total Lembar Stiker: <strong className="text-violet-600 dark:text-violet-400">{totalLabels} pcs</strong>
            </span>
          </div>
        </div>

        {/* Isi Daftar SKU & Pengaturan Copies */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-850">
            {entries.map((ent, idx) => (
              <div key={idx} className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  {ent.qrDataUrl ? (
                    <img src={ent.qrDataUrl} alt="QR" className="w-12 h-12 rounded border border-slate-200 dark:border-slate-700 shrink-0 bg-white" />
                  ) : (
                    <div className="w-12 h-12 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                      <QrCode className="w-6 h-6" />
                    </div>
                  )}

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-300">
                        {ent.catalog_name}
                      </span>
                      <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                        {ent.nama_produk}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 mt-0.5 flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {ent.warna} / {ent.size}
                      </span>
                      <span>•</span>
                      <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-violet-700 dark:text-violet-300 font-semibold">
                        {ent.sku}
                      </span>
                      <span>•</span>
                      <span>Stok: {ent.qty} pcs</span>
                      {ent.price && (
                        <>
                          <span>•</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-bold">Rp {ent.price}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Kontrol Jumlah Cetak (Copies) */}
                <div className="flex items-center gap-1.5 shrink-0 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => handleUpdateCopies(idx, -1)}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 cursor-pointer"
                  >
                    <Minus className="w-3.5 h-3.5" />
                  </button>
                  <input
                    type="number"
                    min="0"
                    value={ent.copies}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10) || 0;
                      setEntries((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, copies: Math.max(0, val) } : item))
                      );
                    }}
                    className="w-12 text-center text-xs font-bold bg-transparent text-slate-900 dark:text-slate-100 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => handleUpdateCopies(idx, 1)}
                    className="w-7 h-7 flex items-center justify-center rounded-md bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 shadow-xs hover:bg-slate-50 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Thermal Preview Card */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2 flex items-center gap-1.5">
              <span>Preview Desain Stiker Thermal 50×20 mm:</span>
            </h4>
            {entries[0] && (
              <div
                className="inline-block p-2 bg-white text-black border border-slate-300 shadow-xs rounded-sm"
                style={{
                  width: '260px',
                  height: '104px',
                  fontFamily: "'Quicksand', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
                }}
              >
                <div className="flex items-center h-full gap-2">
                  <div className="w-18 h-18 shrink-0 flex items-center justify-center bg-white border border-slate-200 rounded-xs p-0.5">
                    {entries[0].qrDataUrl ? (
                      <img src={entries[0].qrDataUrl} alt="QR" className="w-full h-full object-contain" />
                    ) : (
                      <QrCode className="w-8 h-8 text-slate-400" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center leading-tight">
                    <div className="text-[11px] font-semibold text-black truncate tracking-tight">
                      {entries[0].nama_produk}
                    </div>
                    <div className="text-[10px] font-semibold text-slate-800 truncate mt-0.5">
                      {[entries[0].warna, entries[0].size && entries[0].size !== 'Default' ? entries[0].size : ''].filter(Boolean).join(' | ') || 'Default'}
                    </div>
                    <div className="text-[9px] font-mono font-semibold text-slate-700 truncate mt-0.5">
                      {entries[0].sku}
                    </div>
                    <div className="text-sm font-bold text-black truncate mt-1 tracking-tight">
                      {entries[0].price
                        ? entries[0].price.toString().startsWith('Rp')
                          ? entries[0].price
                          : `Rp ${entries[0].price}`
                        : '-'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer & Action Buttons */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
          >
            Tutup
          </button>

          <button
            type="button"
            onClick={handlePrint}
            disabled={totalLabels === 0 || isGenerating}
            className="px-6 py-2.5 text-sm font-bold text-white bg-violet-600 hover:bg-violet-700 disabled:opacity-50 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak {totalLabels} Stiker Thermal (50x20 mm)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
