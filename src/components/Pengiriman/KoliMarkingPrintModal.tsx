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
  Smartphone,
  Bluetooth,
  BluetoothConnected,
  Share2,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import { KoliMarkingLabel } from '../../types';
import {
  connectBluetoothPrinter,
  disconnectBluetoothPrinter,
  sendBluetoothData,
  canvasToEscPosRaster,
  printViaRawBT,
  isWebBluetoothSupported,
  BluetoothDeviceInfo,
} from '../../utils/bluetoothPrinter';

interface KoliMarkingPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  labels: KoliMarkingLabel[];
  title?: string;
}

export type PrintFormat =
  | 'thermal_50x20'
  | 'thermal_70x40'
  | 'thermal_80x50'
  | 'thermal_100x150'
  | 'a6'
  | 'a4';

export type A6Grid = 1 | 2 | 4;
export type A4Grid = 4 | 6 | 8;
export type CodeDisplayType = 'both' | 'barcode_only' | 'qrcode_only';

export const KoliMarkingPrintModal: React.FC<KoliMarkingPrintModalProps> = ({
  isOpen,
  onClose,
  labels,
  title = 'Cetak Barcode & Label Koli',
}) => {
  const [format, setFormat] = useState<PrintFormat>('thermal_50x20');
  const [a6Grid, setA6Grid] = useState<A6Grid>(1);
  const [a4Grid, setA4Grid] = useState<A4Grid>(4);
  const [codeType, setCodeType] = useState<CodeDisplayType>('both');
  const [qrCodes, setQrCodes] = useState<Record<string, string>>({});
  
  // Bluetooth State
  const [btDevice, setBtDevice] = useState<BluetoothDeviceInfo | null>(null);
  const [isConnectingBt, setIsConnectingBt] = useState(false);
  const [isPrintingBt, setIsPrintingBt] = useState(false);
  const [btProgress, setBtProgress] = useState(0);
  const [btStatusMsg, setBtStatusMsg] = useState<string>('');

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
            width: 160,
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

    const timer = setTimeout(() => {
      labels.forEach((label) => {
        const svgEl = document.getElementById(`barcode-${label.id}`);
        if (svgEl) {
          try {
            let barcodeWidth = 1.2;
            let barcodeHeight = 22;

            if (format === 'thermal_50x20') {
              barcodeWidth = codeType === 'both' ? 1.05 : 1.35;
              barcodeHeight = codeType === 'both' ? 18 : 26;
            } else if (format === 'thermal_70x40') {
              barcodeWidth = 1.4;
              barcodeHeight = 36;
            } else if (format === 'thermal_80x50' || format === 'thermal_100x150') {
              barcodeWidth = 1.8;
              barcodeHeight = 50;
            } else if (format === 'a6') {
              barcodeWidth = a6Grid === 4 ? 1.15 : a6Grid === 2 ? 1.4 : 1.8;
              barcodeHeight = a6Grid === 4 ? 22 : a6Grid === 2 ? 32 : 46;
            } else if (format === 'a4') {
              barcodeWidth = a4Grid === 8 ? 1.15 : a4Grid === 6 ? 1.35 : 1.6;
              barcodeHeight = a4Grid === 8 ? 22 : a4Grid === 6 ? 30 : 40;
            }

            JsBarcode(svgEl, label.marking_code, {
              format: 'CODE128',
              lineColor: '#000000',
              width: barcodeWidth,
              height: barcodeHeight,
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
  }, [isOpen, labels, format, a6Grid, a4Grid, codeType]);

  if (!isOpen) return null;

  // 1. Standar System Print via Isolated IFrame / Popup Window (Reliable on Mobile & Desktop)
  const handleStandardPrint = () => {
    try {
      const iframeId = 'koli-direct-print-frame';
      let printFrame = document.getElementById(iframeId) as HTMLIFrameElement | null;
      if (printFrame) {
        document.body.removeChild(printFrame);
      }
      printFrame = document.createElement('iframe');
      printFrame.id = iframeId;
      printFrame.style.position = 'fixed';
      printFrame.style.top = '-9999px';
      printFrame.style.left = '-9999px';
      printFrame.style.width = '100%';
      printFrame.style.height = '100%';
      printFrame.style.border = 'none';
      document.body.appendChild(printFrame);

      const printableContent = printAreaRef.current?.innerHTML || '';

      const doc = printFrame.contentDocument || printFrame.contentWindow?.document;
      if (doc) {
        let pageSizeCss = 'size: 50mm 20mm; margin: 0;';
        let sheetPrintCss = '';

        if (format === 'thermal_70x40') {
          pageSizeCss = 'size: 70mm 40mm; margin: 0;';
          sheetPrintCss = `
            .koli-label-page {
              width: 70mm !important;
              height: 40mm !important;
              max-width: 70mm !important;
              max-height: 40mm !important;
              page-break-after: always;
              break-after: page;
            }
          `;
        } else if (format === 'thermal_80x50') {
          pageSizeCss = 'size: 80mm 50mm; margin: 0;';
          sheetPrintCss = `
            .koli-label-page {
              width: 80mm !important;
              height: 50mm !important;
              max-width: 80mm !important;
              max-height: 50mm !important;
              page-break-after: always;
              break-after: page;
            }
          `;
        } else if (format === 'thermal_100x150') {
          pageSizeCss = 'size: 100mm 150mm; margin: 0;';
          sheetPrintCss = `
            .koli-label-page {
              width: 100mm !important;
              height: 150mm !important;
              page-break-after: always;
              break-after: page;
            }
          `;
        } else if (format === 'a6') {
          pageSizeCss = 'size: A6 portrait; margin: 2mm;';
          sheetPrintCss = `
            .koli-sheet {
              width: 100% !important;
              height: 98vh !important;
              max-height: 100vh !important;
              page-break-after: always;
              break-after: page;
              padding: 2mm !important;
              box-shadow: none !important;
              border: none !important;
            }
          `;
        } else if (format === 'a4') {
          pageSizeCss = 'size: A4 portrait; margin: 4mm;';
          sheetPrintCss = `
            .koli-sheet {
              width: 100% !important;
              height: 98vh !important;
              max-height: 100vh !important;
              page-break-after: always;
              break-after: page;
              padding: 3mm !important;
              box-shadow: none !important;
              border: none !important;
            }
          `;
        } else {
          // thermal_50x20
          sheetPrintCss = `
            .koli-label-page {
              width: 50mm !important;
              height: 20mm !important;
              max-width: 50mm !important;
              max-height: 20mm !important;
              page-break-after: always;
              break-after: page;
            }
          `;
        }

        // Copy parent page stylesheets for Tailwind CSS
        const headStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
          .map((el) => el.outerHTML)
          .join('\n');

        const fullHtml = `
          <!DOCTYPE html>
          <html lang="id">
          <head>
            <meta charset="utf-8" />
            <title>Cetak Barcode Koli</title>
            ${headStyles}
            <style>
              * {
                box-sizing: border-box !important;
                margin: 0;
                padding: 0;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
              body {
                background: #ffffff !important;
                color: #000000 !important;
                font-family: monospace, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
              }
              @page {
                ${pageSizeCss}
              }

              /* Layout Utilities */
              .flex { display: flex !important; }
              .flex-col { flex-direction: column !important; }
              .flex-row { flex-direction: row !important; }
              .flex-wrap { flex-wrap: wrap !important; }
              .flex-1 { flex: 1 1 0% !important; }
              .items-center { align-items: center !important; }
              .items-start { align-items: flex-start !important; }
              .items-baseline { align-items: baseline !important; }
              .justify-between { justify-content: space-between !important; }
              .justify-center { justify-content: center !important; }
              .shrink-0 { flex-shrink: 0 !important; }
              .min-w-0 { min-width: 0px !important; }

              /* Grid Utilities */
              .grid { display: grid !important; }
              .grid-cols-1 { grid-template-columns: repeat(1, minmax(0, 1fr)) !important; }
              .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
              .grid-rows-1 { grid-template-rows: repeat(1, minmax(0, 1fr)) !important; }
              .grid-rows-2 { grid-template-rows: repeat(2, minmax(0, 1fr)) !important; }
              .grid-rows-3 { grid-template-rows: repeat(3, minmax(0, 1fr)) !important; }
              .grid-rows-4 { grid-template-rows: repeat(4, minmax(0, 1fr)) !important; }
              .gap-1 { gap: 4px !important; }
              .gap-1\\.5 { gap: 6px !important; }
              .gap-2 { gap: 8px !important; }
              .gap-2\\.5 { gap: 10px !important; }
              .gap-3 { gap: 12px !important; }

              /* Borders & Colors */
              .border { border: 1px solid #000000 !important; }
              .border-2 { border: 2px solid #000000 !important; }
              .border-t { border-top: 1px solid #000000 !important; }
              .border-t-2 { border-top: 2px solid #000000 !important; }
              .border-b { border-bottom: 1px solid #000000 !important; }
              .border-b-2 { border-bottom: 2px solid #000000 !important; }
              .border-black { border-color: #000000 !important; }
              .rounded-xs { border-radius: 2px !important; }
              .rounded-sm { border-radius: 3px !important; }
              .rounded-md { border-radius: 6px !important; }
              .rounded-lg { border-radius: 8px !important; }

              .bg-white { background-color: #ffffff !important; }
              .bg-black { background-color: #000000 !important; color: #ffffff !important; }
              .text-white { color: #ffffff !important; }
              .text-black { color: #000000 !important; }
              .text-slate-700 { color: #334155 !important; }

              /* Typography */
              .font-semibold { font-weight: 600 !important; }
              .font-bold { font-weight: 700 !important; }
              .font-black { font-weight: 900 !important; }
              .font-mono { font-family: monospace !important; }
              .uppercase { text-transform: uppercase !important; }
              .truncate { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }
              .whitespace-nowrap { white-space: nowrap !important; }
              .leading-tight { line-height: 1.2 !important; }
              .tracking-tight { letter-spacing: -0.025em !important; }
              .tracking-wider { letter-spacing: 0.05em !important; }

              /* Spacing & Sizes */
              .w-full { width: 100% !important; }
              .h-full { height: 100% !important; }
              .p-1 { padding: 4px !important; }
              .p-1\\.5 { padding: 6px !important; }
              .p-2 { padding: 8px !important; }
              .p-2\\.5 { padding: 10px !important; }
              .p-3 { padding: 12px !important; }
              .p-3\\.5 { padding: 14px !important; }
              .px-1 { padding-left: 4px !important; padding-right: 4px !important; }
              .px-1\\.5 { padding-left: 6px !important; padding-right: 6px !important; }
              .px-2 { padding-left: 8px !important; padding-right: 8px !important; }
              .px-2\\.5 { padding-left: 10px !important; padding-right: 10px !important; }
              .py-0\\.5 { padding-top: 2px !important; padding-bottom: 2px !important; }
              .py-1 { padding-top: 4px !important; padding-bottom: 4px !important; }
              .pt-0\\.5 { padding-top: 2px !important; }
              .pt-1 { padding-top: 4px !important; }
              .pb-0\\.5 { padding-bottom: 2px !important; }
              .pb-1 { padding-bottom: 4px !important; }
              .mt-0\\.5 { margin-top: 2px !important; }
              .mt-1 { margin-top: 4px !important; }
              .mt-2 { margin-top: 8px !important; }
              .mt-auto { margin-top: auto !important; }

              /* Explicit element constraints */
              img {
                object-fit: contain !important;
                display: block !important;
              }
              .w-8 { width: 32px !important; }
              .h-8 { height: 32px !important; }
              .w-11 { width: 44px !important; }
              .h-11 { height: 44px !important; }
              .w-16 { width: 64px !important; }
              .h-16 { height: 64px !important; }
              .w-24 { width: 96px !important; }
              .h-24 { height: 96px !important; }

              svg {
                display: block !important;
                width: 100% !important;
              }

              ${sheetPrintCss}
            </style>
          </head>
          <body>
            ${printableContent}
          </body>
          </html>
        `;

        doc.open();
        doc.write(fullHtml);
        doc.close();

        // Ensure all images are loaded before invoking print
        const triggerPrint = () => {
          setTimeout(() => {
            printFrame?.contentWindow?.focus();
            printFrame?.contentWindow?.print();
          }, 150);
        };

        const images = doc.images;
        let loadedCount = 0;
        const totalImages = images.length;
        if (totalImages === 0) {
          triggerPrint();
        } else {
          for (let i = 0; i < totalImages; i++) {
            if (images[i].complete) {
              loadedCount++;
              if (loadedCount === totalImages) triggerPrint();
            } else {
              images[i].onload = () => {
                loadedCount++;
                if (loadedCount === totalImages) triggerPrint();
              };
              images[i].onerror = () => {
                loadedCount++;
                if (loadedCount === totalImages) triggerPrint();
              };
            }
          }
        }
      }
    } catch (e) {
      window.print();
    }
  };

  // 2. Connect to Bluetooth Thermal Printer (Web Bluetooth)
  const handleConnectBluetooth = async () => {
    try {
      setIsConnectingBt(true);
      setBtStatusMsg('Mencari printer Bluetooth thermal...');
      const dev = await connectBluetoothPrinter();
      setBtDevice(dev);
      setBtStatusMsg(`Terhubung ke: ${dev.name}`);
    } catch (err: any) {
      setBtStatusMsg(err.message || 'Gagal koneksi Bluetooth');
      alert(err.message || 'Gagal menyambungkan printer Bluetooth.');
    } finally {
      setIsConnectingBt(false);
    }
  };

  // 3. Print directly to Bluetooth Printer via Web Bluetooth
  const handlePrintBluetooth = async () => {
    if (!btDevice) {
      await handleConnectBluetooth();
      return;
    }

    try {
      setIsPrintingBt(true);
      setBtProgress(0);
      setBtStatusMsg('Menyiapkan data label...');

      for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        setBtStatusMsg(`Mencetak label ${i + 1}/${labels.length}...`);

        // Render label to offscreen canvas (203 DPI = 8 dots/mm)
        // For 50x20mm: 384x160 px (58mm width max printable is ~384 px)
        const canvas = document.createElement('canvas');
        canvas.width = 384;
        canvas.height = format === 'thermal_50x20' ? 160 : 300;
        const ctx = canvas.getContext('2d');

        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = '#000000';

          // Header Store & Koli
          ctx.font = 'bold 22px monospace';
          ctx.fillText(label.store_tujuan.toUpperCase().slice(0, 20), 8, 26);

          ctx.font = 'bold 20px monospace';
          const koliText = `[ ${label.koli_index}/${label.total_koli_report} ]`;
          ctx.fillText(koliText, canvas.width - ctx.measureText(koliText).width - 8, 26);

          // Divider Line
          ctx.fillRect(6, 32, canvas.width - 12, 3);

          // Info lines
          ctx.font = 'bold 15px monospace';
          ctx.fillText(`SJ: ${label.no_surat_jalan}`, 8, 52);
          ctx.fillText(`ISI: ${label.deskripsi.slice(0, 26)} (${label.qty_display})`, 8, 70);

          // Render barcode or QR
          if (qrCodes[label.id]) {
            const qrImg = new Image();
            qrImg.src = qrCodes[label.id];
            await new Promise((res) => {
              qrImg.onload = res;
              qrImg.onerror = res;
            });
            ctx.drawImage(qrImg, canvas.width - 80, 80, 72, 72);
          }

          // Barcode Text
          ctx.font = 'bold 16px monospace';
          ctx.fillText(label.marking_code, 8, 110);
          ctx.font = '12px monospace';
          ctx.fillText(`TGL: ${label.tanggal} | PIC: ${label.pic_nama}`, 8, 140);

          // Convert to ESC/POS raster and send
          const escPosData = canvasToEscPosRaster(canvas);
          await sendBluetoothData(escPosData, (p) => {
            const overall = Math.round(((i + p / 100) / labels.length) * 100);
            setBtProgress(overall);
          });
        }
      }

      setBtStatusMsg(`Selesai mencetak ${labels.length} label koli!`);
    } catch (err: any) {
      console.error('Bluetooth Print Error:', err);
      setBtStatusMsg(`Gagal cetak: ${err.message}`);
      alert(`Gagal cetak via Bluetooth: ${err.message}`);
    } finally {
      setIsPrintingBt(false);
    }
  };

  // 4. Print via RawBT App (Android 1-Click)
  const handlePrintRawBT = async () => {
    try {
      // Build a merged high-res image of all labels
      const canvas = document.createElement('canvas');
      canvas.width = 384;
      const labelHeight = format === 'thermal_50x20' ? 160 : 280;
      canvas.height = labelHeight * labels.length;
      const ctx = canvas.getContext('2d');

      if (!ctx) return;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';

      for (let i = 0; i < labels.length; i++) {
        const label = labels[i];
        const yOffset = i * labelHeight;

        ctx.font = 'bold 22px monospace';
        ctx.fillText(label.store_tujuan.toUpperCase().slice(0, 20), 8, yOffset + 26);

        ctx.font = 'bold 20px monospace';
        const koliText = `[ ${label.koli_index}/${label.total_koli_report} ]`;
        ctx.fillText(koliText, canvas.width - ctx.measureText(koliText).width - 8, yOffset + 26);

        ctx.fillRect(6, yOffset + 32, canvas.width - 12, 3);

        ctx.font = 'bold 15px monospace';
        ctx.fillText(`SJ: ${label.no_surat_jalan}`, 8, yOffset + 52);
        ctx.fillText(`ISI: ${label.deskripsi.slice(0, 26)} (${label.qty_display})`, 8, yOffset + 70);

        if (qrCodes[label.id]) {
          const qrImg = new Image();
          qrImg.src = qrCodes[label.id];
          await new Promise((res) => {
            qrImg.onload = res;
            qrImg.onerror = res;
          });
          ctx.drawImage(qrImg, canvas.width - 80, yOffset + 80, 72, 72);
        }

        ctx.font = 'bold 16px monospace';
        ctx.fillText(label.marking_code, 8, yOffset + 110);
        ctx.font = '12px monospace';
        ctx.fillText(`TGL: ${label.tanggal} | PIC: ${label.pic_nama}`, 8, yOffset + 140);

        // Dashed line between labels
        if (i < labels.length - 1) {
          ctx.strokeStyle = '#888888';
          ctx.setLineDash([4, 4]);
          ctx.beginPath();
          ctx.moveTo(0, yOffset + labelHeight - 1);
          ctx.lineTo(canvas.width, yOffset + labelHeight - 1);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }

      const base64 = canvas.toDataURL('image/png');
      printViaRawBT(base64);
    } catch (e) {
      alert('Gagal membuka aplikasi RawBT. Pastikan aplikasi RawBT telah terinstal di Android.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* Print Specific CSS in case of native window.print() */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-koli-area, #printable-koli-area * {
            visibility: visible !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
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
          .koli-sheet {
            page-break-after: always;
            break-after: page;
            height: 98vh !important;
            box-shadow: none !important;
            border: none !important;
          }
          .koli-label-page {
            page-break-after: always;
            break-after: page;
          }
        }
      `}</style>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        
        {/* Header Modal */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <BarcodeIcon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                {title}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Total <span className="font-bold text-indigo-600 dark:text-indigo-400">{labels.length}</span> Label Koli • Standar Gudang
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
          
          {/* Format Pilihan */}
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-700 dark:text-slate-300">Format:</span>
            <div className="flex flex-wrap rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
              <button
                type="button"
                onClick={() => setFormat('thermal_50x20')}
                className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                  format === 'thermal_50x20'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Thermal 50×20
              </button>
              <button
                type="button"
                onClick={() => setFormat('thermal_80x50')}
                className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                  format === 'thermal_80x50'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Thermal 80×50
              </button>
              <button
                type="button"
                onClick={() => setFormat('a6')}
                className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                  format === 'a6'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Kertas A6
              </button>
              <button
                type="button"
                onClick={() => setFormat('a4')}
                className={`px-2.5 py-1 rounded-md font-bold transition-colors ${
                  format === 'a4'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Kertas A4
              </button>
            </div>
          </div>

          {/* Jika Format A6: Grid */}
          {format === 'a6' && (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-700 dark:text-slate-300">Isi per A6:</span>
              <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
                {[1, 2, 4].map((gridNum) => (
                  <button
                    key={gridNum}
                    type="button"
                    onClick={() => setA6Grid(gridNum as A6Grid)}
                    className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
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

          {/* Jika Format A4: Grid */}
          {format === 'a4' && (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-700 dark:text-slate-300">Isi per A4:</span>
              <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
                {[4, 6, 8].map((gridNum) => (
                  <button
                    key={gridNum}
                    type="button"
                    onClick={() => setA4Grid(gridNum as A4Grid)}
                    className={`px-2 py-0.5 rounded-md font-bold transition-colors ${
                      a4Grid === gridNum
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
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-700 dark:text-slate-300">Tipe Kode:</span>
            <div className="flex rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
              <button
                type="button"
                onClick={() => setCodeType('both')}
                className={`px-2 py-0.5 rounded-md font-bold ${
                  codeType === 'both'
                    ? 'bg-slate-800 text-white dark:bg-slate-700'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                QR + Barcode
              </button>
              <button
                type="button"
                onClick={() => setCodeType('barcode_only')}
                className={`px-2 py-0.5 rounded-md font-bold ${
                  codeType === 'barcode_only'
                    ? 'bg-slate-800 text-white dark:bg-slate-700'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Barcode 1D
              </button>
              <button
                type="button"
                onClick={() => setCodeType('qrcode_only')}
                className={`px-2 py-0.5 rounded-md font-bold ${
                  codeType === 'qrcode_only'
                    ? 'bg-slate-800 text-white dark:bg-slate-700'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                QR Saja
              </button>
            </div>
          </div>
        </div>

        {/* Status Bluetooth Panel jika HP / Web Bluetooth */}
        {btStatusMsg && (
          <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-950/40 border-b border-indigo-200 dark:border-indigo-800/60 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-indigo-800 dark:text-indigo-300 font-semibold">
              <Bluetooth className="w-3.5 h-3.5 animate-pulse" />
              <span>{btStatusMsg}</span>
            </div>
            {isPrintingBt && (
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{btProgress}%</span>
            )}
          </div>
        )}

        {/* Live Print Preview Area */}
        <div className="flex-1 p-4 overflow-y-auto bg-slate-200/70 dark:bg-slate-950/70 flex justify-center">
          <div
            id="printable-koli-area"
            ref={printAreaRef}
            className="w-full flex flex-col items-center gap-4"
          >
            {format.startsWith('thermal') ? (
              // PREVIEW & PRINT: THERMAL DIRECT ROLL (50x20, 80x50, etc.)
              <div className="flex flex-wrap justify-center gap-3">
                {labels.map((label) => {
                  const is50x20 = format === 'thermal_50x20';
                  return (
                    <div
                      key={label.id}
                      className="koli-label-page bg-white text-black p-1.5 rounded-sm border-2 border-black shadow-md flex flex-col justify-between"
                      style={{
                        width: is50x20 ? '192px' : '300px', // ~50mm or 80mm
                        height: is50x20 ? '78px' : '188px', // ~20mm or 50mm
                        fontSize: is50x20 ? '8px' : '12px',
                        fontFamily: 'monospace, sans-serif',
                        lineHeight: '1.15',
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* Header: Store Tujuan & Koli Badge (Tebal & Kontras Tinggi) */}
                      <div>
                        <div className="flex justify-between items-center border-b-2 border-black pb-0.5 gap-1">
                          <div className={`font-black ${is50x20 ? 'text-[10px]' : 'text-sm'} uppercase truncate flex-1 tracking-tight text-black`}>
                            {label.store_tujuan}
                          </div>
                          <div className={`font-black ${is50x20 ? 'text-[9px] px-1 py-0.2' : 'text-xs px-2 py-0.5'} bg-black text-white rounded-xs shrink-0 whitespace-nowrap`}>
                            KOLI {label.koli_index}/{label.total_koli_report}
                          </div>
                        </div>

                        {/* Detail Ringkas */}
                        <div className="mt-0.5 flex justify-between items-baseline text-[7.5px] leading-tight">
                          <span className="font-bold">SJ: {label.no_surat_jalan}</span>
                          <span className="font-bold truncate max-w-[100px]">{label.deskripsi} ({label.qty_display})</span>
                        </div>
                      </div>

                      {/* Barcode / QR Code Area */}
                      <div className="flex items-center justify-between gap-1 border-t border-black pt-0.5 mt-auto">
                        <div className="flex-1 flex flex-col items-center min-w-0">
                          {codeType !== 'qrcode_only' && (
                            <svg
                              id={`barcode-${label.id}`}
                              className={`w-full ${is50x20 ? 'max-h-[20px]' : 'max-h-[40px]'}`}
                            />
                          )}
                          <span className={`${is50x20 ? 'text-[7px]' : 'text-[9px]'} font-black tracking-tight text-black truncate max-w-full font-mono`}>
                            {label.marking_code}
                          </span>
                        </div>

                        {codeType !== 'barcode_only' && qrCodes[label.id] && (
                          <img
                            src={qrCodes[label.id]}
                            alt="QR"
                            className={`${is50x20 ? 'w-8 h-8' : 'w-16 h-16'} shrink-0 object-contain`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : format === 'a6' ? (
              // PREVIEW & PRINT: KERTAS A6
              <div className="flex flex-col items-center gap-6">
                {Array.from({ length: Math.ceil(labels.length / a6Grid) }).map((_, sheetIdx) => {
                  const sheetLabels = labels.slice(sheetIdx * a6Grid, (sheetIdx + 1) * a6Grid);

                  return (
                    <div
                      key={`sheet-a6-${sheetIdx}`}
                      className="koli-sheet bg-white text-black p-2.5 rounded-lg border border-slate-400 shadow-lg flex flex-col justify-between"
                      style={{
                        width: '380px',
                        height: '535px',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        className={`w-full h-full grid ${
                          a6Grid === 1
                            ? 'grid-cols-1 grid-rows-1'
                            : a6Grid === 2
                            ? 'grid-cols-1 grid-rows-2 gap-2'
                            : 'grid-cols-2 grid-rows-2 gap-2'
                        }`}
                      >
                        {sheetLabels.map((label) => {
                          const isGrid4 = a6Grid === 4;
                          const isGrid2 = a6Grid === 2;

                          return (
                            <div
                              key={label.id}
                              className={`border-2 border-black rounded-sm ${
                                isGrid4 ? 'p-1.5' : isGrid2 ? 'p-2.5' : 'p-3.5'
                              } flex flex-col justify-between bg-white text-black`}
                            >
                              {/* Header */}
                              <div>
                                <div className="flex items-start justify-between border-b-2 border-black pb-1 gap-1">
                                  <div className="min-w-0 flex-1">
                                    <span className="text-[7.5px] font-bold block uppercase tracking-wider text-slate-700">
                                      TUJUAN:
                                    </span>
                                    <h4 className={`${isGrid4 ? 'text-xs' : 'text-base'} font-black uppercase text-black leading-tight truncate`}>
                                      {label.store_tujuan}
                                    </h4>
                                  </div>
                                  <div className="shrink-0 text-right">
                                    <span className={`bg-black text-white ${isGrid4 ? 'px-1.5 py-0.5 text-[10px]' : 'px-2.5 py-1 text-sm'} font-black inline-block whitespace-nowrap`}>
                                      KOLI {label.koli_index} / {label.total_koli_report}
                                    </span>
                                  </div>
                                </div>

                                {/* No SJ & Deskripsi */}
                                <div className={`${isGrid4 ? 'mt-1 text-[8.5px]' : 'mt-2 text-[10px]'} leading-tight space-y-0.5 font-mono`}>
                                  <div>
                                    <span className="font-semibold">SJ: </span>
                                    <span className="font-bold">{label.no_surat_jalan}</span>
                                  </div>
                                  <div className="font-bold truncate">
                                    {label.deskripsi} ({label.qty_display})
                                  </div>
                                </div>
                              </div>

                              {/* Barcode & QR Code Section */}
                              <div className="mt-auto pt-1 border-t-2 border-black">
                                <div className="flex items-center justify-between gap-1.5">
                                  <div className="flex-1 flex flex-col items-center min-w-0">
                                    {codeType !== 'qrcode_only' && (
                                      <svg
                                        id={`barcode-${label.id}`}
                                        className={`w-full ${isGrid4 ? 'max-h-[22px]' : isGrid2 ? 'max-h-[32px]' : 'max-h-[46px]'}`}
                                      />
                                    )}
                                    <span className={`${isGrid4 ? 'text-[8px]' : 'text-[9.5px]'} font-black font-mono tracking-tight text-black mt-0.5 truncate max-w-full`}>
                                      {label.marking_code}
                                    </span>
                                  </div>

                                  {codeType !== 'barcode_only' && qrCodes[label.id] && (
                                    <img
                                      src={qrCodes[label.id]}
                                      alt="QR"
                                      className={`${isGrid4 ? 'w-11 h-11' : isGrid2 ? 'w-16 h-16' : 'w-24 h-24'} shrink-0 object-contain`}
                                    />
                                  )}
                                </div>

                                <div className="flex justify-between items-center text-[7px] font-mono text-slate-700 mt-1 pt-0.5 border-t border-black">
                                  <span>TGL: {label.tanggal}</span>
                                  <span>PIC: {label.pic_nama}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // PREVIEW & PRINT: KERTAS A4
              <div className="flex flex-col items-center gap-6">
                {Array.from({ length: Math.ceil(labels.length / a4Grid) }).map((_, sheetIdx) => {
                  const sheetLabels = labels.slice(sheetIdx * a4Grid, (sheetIdx + 1) * a4Grid);

                  return (
                    <div
                      key={`sheet-a4-${sheetIdx}`}
                      className="koli-sheet bg-white text-black p-3.5 rounded-lg border border-slate-400 shadow-lg flex flex-col justify-between"
                      style={{
                        width: '520px',
                        height: '735px',
                        boxSizing: 'border-box',
                      }}
                    >
                      <div
                        className={`w-full h-full grid ${
                          a4Grid === 4
                            ? 'grid-cols-2 grid-rows-2 gap-2.5'
                            : a4Grid === 6
                            ? 'grid-cols-2 grid-rows-3 gap-2'
                            : 'grid-cols-2 grid-rows-4 gap-1.5'
                        }`}
                      >
                        {sheetLabels.map((label) => (
                          <div
                            key={label.id}
                            className="border-2 border-black rounded-sm p-2 flex flex-col justify-between bg-white text-black"
                          >
                            <div className="flex items-start justify-between border-b-2 border-black pb-1 gap-1">
                              <div className="min-w-0 flex-1">
                                <span className="text-[7.5px] font-bold block uppercase text-slate-700">
                                  TUJUAN:
                                </span>
                                <h4 className="text-xs font-black uppercase text-black leading-tight truncate">
                                  {label.store_tujuan}
                                </h4>
                              </div>
                              <div className="shrink-0">
                                <span className="bg-black text-white px-1.5 py-0.5 text-[10px] font-black inline-block whitespace-nowrap">
                                  KOLI {label.koli_index} / {label.total_koli_report}
                                </span>
                              </div>
                            </div>

                            <div className="mt-1 text-[8.5px] font-mono leading-tight space-y-0.5">
                              <div>
                                <span className="font-semibold">SJ: </span>
                                <span className="font-bold">{label.no_surat_jalan}</span>
                              </div>
                              <div className="font-bold truncate">
                                {label.deskripsi} ({label.qty_display})
                              </div>
                            </div>

                            <div className="mt-auto pt-1 border-t-2 border-black">
                              <div className="flex items-center justify-between gap-1.5">
                                <div className="flex-1 flex flex-col items-center min-w-0">
                                  {codeType !== 'qrcode_only' && (
                                    <svg
                                      id={`barcode-${label.id}`}
                                      className="w-full max-h-[24px]"
                                    />
                                  )}
                                  <span className="text-[8px] font-black font-mono tracking-tight text-black mt-0.5 truncate max-w-full">
                                    {label.marking_code}
                                  </span>
                                </div>

                                {codeType !== 'barcode_only' && qrCodes[label.id] && (
                                  <img
                                    src={qrCodes[label.id]}
                                    alt="QR"
                                    className="w-11 h-11 shrink-0 object-contain"
                                  />
                                )}
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

        {/* Footer Actions: Bluetooth HP & Direct Print */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {/* Opsi Cetak Bluetooth HP */}
            <button
              type="button"
              onClick={handlePrintBluetooth}
              disabled={isConnectingBt || isPrintingBt}
              className={`px-3 py-2 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition-all cursor-pointer ${
                btDevice
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-500 shadow-xs'
                  : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/80 hover:bg-indigo-100'
              }`}
              title="Cetak langsung ke printer thermal bluetooth lewat HP / Web Bluetooth"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>{btDevice ? `Cetak ke ${btDevice.name}` : 'Cetak Bluetooth HP'}</span>
            </button>

            {/* Opsi Kirim ke RawBT Android App */}
            <button
              type="button"
              onClick={handlePrintRawBT}
              className="px-3 py-2 rounded-xl text-xs font-bold bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/80 hover:bg-amber-100 dark:hover:bg-amber-900/60 flex items-center gap-1.5 cursor-pointer transition-all"
              title="Kirim ke aplikasi RawBT di Android untuk cetak printer bluetooth"
            >
              <Share2 className="w-3.5 h-3.5" />
              <span>Kirim RawBT (Android)</span>
            </button>
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
              onClick={handleStandardPrint}
              className="px-5 py-2 rounded-xl text-xs font-black text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/25 flex items-center gap-2 transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Standar / PDF ({labels.length} Label)</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
