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
    window.print();
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
              <span>Preview Desain Stiker Thermal 50x20mm:</span>
            </h4>
            {entries[0] && (
              <div className="inline-block p-2 bg-white text-black border border-slate-400 shadow-xs rounded-sm font-sans" style={{ width: '220px', height: '90px' }}>
                <div className="flex items-center justify-between border-b border-black/40 pb-0.5">
                  <span className="text-[9px] font-extrabold uppercase truncate tracking-tight">{entries[0].nama_produk}</span>
                  <span className="text-[8px] font-bold bg-black text-white px-1 rounded-xs">{entries[0].catalog_name}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {entries[0].qrDataUrl && (
                    <img src={entries[0].qrDataUrl} alt="QR" className="w-11 h-11 shrink-0" />
                  )}
                  <div className="min-w-0 text-[8px] leading-tight flex-1">
                    <div className="font-bold uppercase text-[9px] truncate">{entries[0].warna} - {entries[0].size}</div>
                    <div className="font-mono font-bold text-[9px] truncate text-slate-900 mt-0.5">{entries[0].sku}</div>
                    <div className="font-black text-[10px] mt-0.5 text-black">Rp {entries[0].price || '-'}</div>
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

      {/* HIDDEN PRINT-ONLY CONTAINER (FOR WINDOW.PRINT THERMAL) */}
      <div id="thermal-katalog-print-area" className="hidden print:block" ref={printAreaRef}>
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * {
              visibility: hidden !important;
            }
            #thermal-katalog-print-area, #thermal-katalog-print-area * {
              visibility: visible !important;
            }
            #thermal-katalog-print-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 50mm !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .thermal-sticker-page {
              width: 50mm !important;
              height: 20mm !important;
              page-break-after: always !important;
              page-break-inside: avoid !important;
              box-sizing: border-box !important;
              padding: 1.5mm 2mm !important;
              overflow: hidden !important;
              display: flex !important;
              flex-direction: column !important;
              justify-content: space-between !important;
              font-family: Arial, Helvetica, sans-serif !important;
              color: black !important;
              background: white !important;
            }
            @page {
              size: 50mm 20mm;
              margin: 0;
            }
          }
        `}} />

        {entries.flatMap((entry, eIdx) =>
          Array.from({ length: entry.copies }).map((_, cIdx) => (
            <div key={`${eIdx}-${cIdx}`} className="thermal-sticker-page">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid black', paddingBottom: '1px', lineHeight: 1 }}>
                <span style={{ fontSize: '7.5pt', fontWeight: 'bold', textTransform: 'uppercase', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '34mm' }}>
                  {entry.nama_produk}
                </span>
                <span style={{ fontSize: '6pt', fontWeight: 'bold', border: '0.5px solid black', padding: '0.5px 1.5px' }}>
                  {entry.catalog_name}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '2mm', marginTop: '1mm' }}>
                {entry.qrDataUrl && (
                  <img src={entry.qrDataUrl} alt="QR" style={{ width: '13mm', height: '13mm' }} />
                )}
                <div style={{ flex: 1, minWidth: 0, lineHeight: 1.15 }}>
                  <div style={{ fontSize: '6.5pt', fontWeight: 'bold', textTransform: 'uppercase' }}>
                    {entry.warna} / {entry.size}
                  </div>
                  <div style={{ fontSize: '7pt', fontWeight: 'bold', fontFamily: 'monospace' }}>
                    {entry.sku}
                  </div>
                  <div style={{ fontSize: '8pt', fontWeight: '900', marginTop: '0.5mm' }}>
                    Rp {entry.price || '-'}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
