import React, { useState, useEffect, useRef } from 'react';
import {
  Printer,
  X,
  Layers,
  Settings2,
  Check,
  Maximize2,
  FileText,
  QrCode,
  Barcode as BarcodeIcon,
} from 'lucide-react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { KoliMarkingLabel } from '../../types';

interface KoliMarkingPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  labels: KoliMarkingLabel[];
  title?: string;
}

export type PrintFormat = 'thermal_50x20' | 'a6';
export type A6Grid = 1 | 2 | 4;
export type CodeDisplayType = 'both' | 'qrcode_only' | 'barcode_only';

export const KoliMarkingPrintModal: React.FC<KoliMarkingPrintModalProps> = ({
  isOpen,
  onClose,
  labels,
  title = 'Cetak Barcode / QR Marking Koli',
}) => {
  const [format, setFormat] = useState<PrintFormat>('thermal_50x20');
  const [a6Grid, setA6Grid] = useState<A6Grid>(1);
  const [codeType, setCodeType] = useState<CodeDisplayType>('both');
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  const printAreaRef = useRef<HTMLDivElement>(null);

  // Generate QR Code Data URLs for all labels
  useEffect(() => {
    if (!isOpen || labels.length === 0) return;

    const generateQRs = async () => {
      const qrs: Record<string, string> = {};
      for (const label of labels) {
        try {
          const qrContent = label.qr_data_string || label.marking_code;
          const url = await QRCode.toDataURL(qrContent, {
            width: 140,
            margin: 1,
            color: { dark: '#000000', light: '#ffffff' },
          });
          qrs[label.id] = url;
        } catch (err) {
          console.warn('Gagal render QR code:', err);
        }
      }
      setQrCodes(qrs);
    };

    generateQRs();
  }, [isOpen, labels]);

  // Generate 1D Barcodes via JsBarcode onto SVGs
  useEffect(() => {
    if (!isOpen || labels.length === 0) return;

    // Small delay to allow SVG elements to mount in DOM
    const timer = setTimeout(() => {
      labels.forEach((label) => {
        const svgEl = document.getElementById(`barcode-${label.id}`);
        if (svgEl) {
          try {
            JsBarcode(svgEl, label.marking_code, {
              format: 'CODE128',
              lineColor: '#000000',
              width: format === 'thermal_50x20' ? 1.2 : 1.6,
              height: format === 'thermal_50x20' ? 22 : 36,
              displayValue: false,
              margin: 0,
            });
          } catch (e) {
            console.warn('JsBarcode render error:', e);
          }
        }
      });
    }, 100);

    return () => clearTimeout(timer);
  }, [isOpen, labels, format, a6Grid, codeType]);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* Dynamic Print Stylesheet */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-koli-area, #printable-koli-area * {
            visibility: visible !important;
          }
          #printable-koli-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          ${
            format === 'thermal_50x20'
              ? `
            @page {
              size: 50mm 20mm;
              margin: 0;
            }
            .koli-label-page {
              page-break-after: always;
              break-after: page;
              width: 50mm !important;
              height: 20mm !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }
          `
              : `
            @page {
              size: A6 portrait;
              margin: 4mm;
            }
            .koli-a6-sheet {
              page-break-after: always;
              break-after: page;
              width: 100% !important;
              box-sizing: border-box !important;
            }
          `
          }
        }
      `}</style>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Modal */}
        <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                {title}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Total <span className="font-bold text-indigo-600 dark:text-indigo-400">{labels.length}</span> label koli siap dicetak
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar Pengaturan Format Cetak */}
        <div className="p-3 bg-slate-100/80 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Format Pilihan: Thermal 50x20 vs A6 */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 dark:text-slate-300">Format Kertas:</span>
            <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
              <button
                type="button"
                onClick={() => setFormat('thermal_50x20')}
                className={`px-3 py-1 rounded-md font-bold transition-colors ${
                  format === 'thermal_50x20'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Thermal 50×20 mm
              </button>
              <button
                type="button"
                onClick={() => setFormat('a6')}
                className={`px-3 py-1 rounded-md font-bold transition-colors ${
                  format === 'a6'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Kertas A6
              </button>
            </div>
          </div>

          {/* Jika Format A6: Pilihan Label per Halaman (1, 2, atau 4) */}
          {format === 'a6' && (
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-700 dark:text-slate-300">Isi per A6:</span>
              <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
                {[1, 2, 4].map((gridNum) => (
                  <button
                    key={gridNum}
                    type="button"
                    onClick={() => setA6Grid(gridNum as A6Grid)}
                    className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                      a6Grid === gridNum
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {gridNum} Label
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tipe Kode: QR Code / Barcode / Keduanya */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 dark:text-slate-300">Tipe Kode:</span>
            <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
              <button
                type="button"
                onClick={() => setCodeType('both')}
                className={`px-2 py-1 rounded-md font-bold ${
                  codeType === 'both'
                    ? 'bg-slate-800 text-white dark:bg-slate-700'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                QR + Barcode
              </button>
              <button
                type="button"
                onClick={() => setCodeType('qrcode_only')}
                className={`px-2 py-1 rounded-md font-bold ${
                  codeType === 'qrcode_only'
                    ? 'bg-slate-800 text-white dark:bg-slate-700'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                QR Saja
              </button>
              <button
                type="button"
                onClick={() => setCodeType('barcode_only')}
                className={`px-2 py-1 rounded-md font-bold ${
                  codeType === 'barcode_only'
                    ? 'bg-slate-800 text-white dark:bg-slate-700'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Barcode Saja
              </button>
            </div>
          </div>
        </div>

        {/* Live Print Preview Area */}
        <div className="flex-1 p-4 overflow-y-auto bg-slate-200/60 dark:bg-slate-950/60 flex justify-center">
          <div
            id="printable-koli-area"
            ref={printAreaRef}
            className="w-full flex flex-col items-center gap-4"
          >
            {format === 'thermal_50x20' ? (
              // PREVIEW & PRINT: THERMAL 50x20 mm
              <div className="flex flex-wrap justify-center gap-3">
                {labels.map((label) => (
                  <div
                    key={label.id}
                    className="koli-label-page bg-white text-black p-1 rounded-md border border-slate-400 shadow-md flex flex-col justify-between"
                    style={{
                      width: '188px', // ~50mm at 96 DPI
                      height: '76px', // ~20mm at 96 DPI
                      fontSize: '7.5px',
                      fontFamily: 'monospace, sans-serif',
                      lineHeight: '1.15',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Header: Store Tujuan & Koli Badge */}
                    <div className="flex justify-between items-center border-b border-black pb-0.5">
                      <div className="font-black text-[9px] truncate max-w-[110px] uppercase">
                        {label.store_tujuan}
                      </div>
                      <div className="font-black text-[8px] bg-black text-white px-1 py-0.2 rounded-xs">
                        KOLI {label.koli_index}/{label.total_koli_report}
                      </div>
                    </div>

                    {/* Deskripsi Singkat & No SJ */}
                    <div className="truncate text-[7.5px] font-semibold text-slate-800">
                      {label.deskripsi}
                    </div>

                    {/* Barcode & Code Area */}
                    <div className="flex items-center justify-between gap-1 mt-auto">
                      <div className="flex-1 flex flex-col items-start overflow-hidden">
                        {codeType !== 'qrcode_only' && (
                          <svg
                            id={`barcode-${label.id}`}
                            className="max-w-full h-[18px]"
                          />
                        )}
                        <span className="text-[6.5px] font-bold tracking-tight text-slate-700 truncate max-w-full">
                          {label.marking_code}
                        </span>
                      </div>

                      {codeType !== 'barcode_only' && qrCodes[label.id] && (
                        <img
                          src={qrCodes[label.id]}
                          alt="QR"
                          className="w-8 h-8 shrink-0 object-contain"
                        />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              // PREVIEW & PRINT: KERTAS A6 (1, 2, atau 4 per sheet)
              <div className="w-full flex flex-col items-center gap-6">
                {/* Chunk labels according to a6Grid */}
                {Array.from({ length: Math.ceil(labels.length / a6Grid) }).map((_, sheetIdx) => {
                  const sheetLabels = labels.slice(sheetIdx * a6Grid, (sheetIdx + 1) * a6Grid);

                  return (
                    <div
                      key={`sheet-${sheetIdx}`}
                      className="koli-a6-sheet bg-white text-black p-4 rounded-xl border border-slate-400 shadow-lg"
                      style={{
                        width: '390px', // ~A6 width in preview
                        minHeight: '550px', // ~A6 height in preview
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        className={`w-full h-full grid gap-3 ${
                          a6Grid === 1
                            ? 'grid-cols-1'
                            : a6Grid === 2
                            ? 'grid-cols-1 grid-rows-2'
                            : 'grid-cols-2 grid-rows-2'
                        }`}
                      >
                        {sheetLabels.map((label) => (
                          <div
                            key={label.id}
                            className={`border-2 border-black rounded-lg p-2.5 flex flex-col justify-between ${
                              a6Grid === 1 ? 'min-h-[500px]' : a6Grid === 2 ? 'min-h-[235px]' : 'min-h-[235px]'
                            }`}
                          >
                            {/* Header Section */}
                            <div>
                              <div className="flex items-start justify-between border-b-2 border-black pb-2">
                                <div>
                                  <span className="text-[9px] font-bold text-slate-600 block uppercase">
                                    TUJUAN STORE:
                                  </span>
                                  <h4 className="text-base font-black uppercase leading-tight text-slate-950">
                                    {label.store_tujuan}
                                  </h4>
                                </div>
                                <div className="text-right">
                                  <span className="bg-black text-white px-2 py-0.5 rounded-sm font-black text-xs inline-block">
                                    KOLI {label.koli_index} / {label.total_koli_report}
                                  </span>
                                </div>
                              </div>

                              {/* No SJ & Deskripsi */}
                              <div className="mt-2 space-y-1">
                                <div className="text-[10px]">
                                  <span className="text-slate-500 font-semibold">No Surat Jalan: </span>
                                  <span className="font-bold font-mono">{label.no_surat_jalan}</span>
                                </div>
                                <div className="text-[11px] font-bold text-slate-900 line-clamp-2">
                                  {label.deskripsi}
                                </div>
                                <div className="text-[10px] text-slate-700">
                                  <span>Jumlah: </span>
                                  <span className="font-bold">{label.qty_display}</span>
                                </div>
                              </div>
                            </div>

                            {/* Barcode & QR Code Section */}
                            <div className="mt-auto pt-2 border-t border-slate-300">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex-1 flex flex-col items-center">
                                  {codeType !== 'qrcode_only' && (
                                    <svg
                                      id={`barcode-${label.id}`}
                                      className="w-full max-h-[36px]"
                                    />
                                  )}
                                  <span className="text-[9px] font-black font-mono tracking-wider text-slate-800 mt-0.5">
                                    {label.marking_code}
                                  </span>
                                </div>

                                {codeType !== 'barcode_only' && qrCodes[label.id] && (
                                  <img
                                    src={qrCodes[label.id]}
                                    alt="QR"
                                    className={`${a6Grid === 1 ? 'w-24 h-24' : 'w-14 h-14'} shrink-0 object-contain`}
                                  />
                                )}
                              </div>

                              {/* Footer note */}
                              <div className="flex justify-between items-center text-[8px] text-slate-500 mt-1.5 pt-1 border-t border-dashed border-slate-200">
                                <span>Tgl: {label.tanggal}</span>
                                <span>PIC: {label.pic_nama}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Pilihan: <strong className="text-slate-800 dark:text-slate-200">{format === 'thermal_50x20' ? 'Thermal 50×20mm Roll' : `Kertas A6 (${a6Grid} label/lembar)`}</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Sekarang ({labels.length} Label)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
