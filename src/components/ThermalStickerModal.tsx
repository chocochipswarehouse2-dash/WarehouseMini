import React, { useState, useEffect } from 'react';
import { Printer, X, Copy, Check, Info } from 'lucide-react';
import QRCode from 'qrcode';

interface ThermalStickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  ticket: {
    ticket_no: string;
    sku: string;
    nama_produk: string;
    size?: string;
    qty: number;
    kategori_rusak?: string;
    detail_kerusakan?: string;
    lokasi_sekarang?: string;
    tanggal?: string;
    acc_harga_defect?: number;
    acc_harga_by?: string;
  } | null;
}

export const ThermalStickerModal: React.FC<ThermalStickerModalProps> = ({
  isOpen,
  onClose,
  ticket,
}) => {
  const [printCopies, setPrintCopies] = useState<number>(() => ticket?.qty || 1);
  const [isCopied, setIsCopied] = useState(false);
  const [qrSrc, setQrSrc] = useState<string>('');

  // Sync print copies and generate QR Code when ticket changes
  useEffect(() => {
    if (ticket) {
      setPrintCopies(ticket.qty > 0 ? ticket.qty : 1);
      QRCode.toDataURL(ticket.ticket_no, { margin: 0, width: 80, errorCorrectionLevel: 'M' })
        .then((url) => setQrSrc(url))
        .catch((err) => console.error(err));
    }
  }, [ticket]);

  if (!isOpen || !ticket) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleCopyTicket = () => {
    navigator.clipboard.writeText(ticket.ticket_no);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const copiesArray = Array.from({ length: Math.max(1, printCopies) });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
      {/* Hidden container specifically styled for 50x20mm thermal printer */}
      <div id="thermal-sticker-50x20-print" className="hidden print:block">
        <style dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                size: 50mm 20mm;
                margin: 0;
              }
              body {
                margin: 0 !important;
                padding: 0 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                background: white !important;
              }
              body * {
                visibility: hidden !important;
              }
              #thermal-sticker-50x20-print, #thermal-sticker-50x20-print * {
                visibility: visible !important;
              }
              #thermal-sticker-50x20-print {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 50mm !important;
                display: block !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .thermal-page-50x20 {
                width: 50mm !important;
                height: 20mm !important;
                max-width: 50mm !important;
                max-height: 20mm !important;
                box-sizing: border-box !important;
                padding: 1.5mm 2mm !important;
                page-break-after: always !important;
                break-after: page !important;
                display: flex !important;
                flex-direction: row !important;
                align-items: center !important;
                background: white !important;
                color: black !important;
                font-family: monospace, sans-serif !important;
                overflow: hidden !important;
              }
              .thermal-qr-container {
                width: 15mm !important;
                height: 15mm !important;
                margin-right: 2mm !important;
                flex-shrink: 0 !important;
              }
              .thermal-qr-container img {
                width: 100% !important;
                height: 100% !important;
                object-fit: contain !important;
              }
              .thermal-text-container {
                display: flex !important;
                flex-direction: column !important;
                justify-content: center !important;
                overflow: hidden !important;
                width: 100% !important;
              }
            }
          `
        }} />

        {copiesArray.map((_, i) => (
          <div key={`print-copy-${i}`} className="thermal-page-50x20">
            {/* QR Code on the left */}
            <div className="thermal-qr-container">
              {qrSrc && <img src={qrSrc} alt="QR Code" />}
            </div>
            {/* Text on the right */}
            <div className="thermal-text-container">
              <div style={{ fontSize: '7pt', fontWeight: 900, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', letterSpacing: '-0.2px' }}>
                {ticket.sku}
              </div>
              <div style={{ fontSize: '6pt', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.2', marginTop: '0.5mm' }}>
                {ticket.nama_produk}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1mm' }}>
                <span style={{ fontSize: '6.5pt', fontWeight: 900 }}>
                  {ticket.size ? `SZ: ${ticket.size}` : ''}
                </span>
                <span style={{ fontSize: '6pt', fontWeight: 700, fontFamily: 'monospace' }}>
                  *{ticket.ticket_no}*
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Screen Preview Modal */}
      <div className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white max-w-md w-full rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Modal Title */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-950/60 text-purple-600 flex items-center justify-center font-bold">
              <Printer className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black tracking-tight">Cetak Stiker QR 50x20 mm</h3>
              <p className="text-[11px] text-slate-500">Label thermal tiket produk defect</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Setting Jumlah Cetak (Multi-Qty Sticker Support) */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-slate-700 dark:text-slate-300">Jumlah Stiker yang Dicetak:</span>
            <span className="font-mono text-purple-600 dark:text-purple-400">{printCopies} Lembar</span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={100}
              value={printCopies}
              onChange={(e) => setPrintCopies(Math.max(1, parseInt(e.target.value) || 1))}
              className="w-24 px-3 py-1.5 text-center font-mono font-bold text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
            />
            <button
              type="button"
              onClick={() => setPrintCopies(ticket.qty > 0 ? ticket.qty : 1)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              Sesuai Qty ({ticket.qty} pcs)
            </button>
            <button
              type="button"
              onClick={() => setPrintCopies(1)}
              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              1 Lembar
            </button>
          </div>

          <div className="flex items-start gap-1.5 text-[10px] text-slate-500 leading-snug">
            <Info className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
            <span>
              Aturan WMS: Jika 1 produk memiliki qty {ticket.qty} pcs, stiker perlu ditempel 1 lembar per baju. Stiker QR ini tidak menampilkan detail kerusakan, keterangan defect dapat dicek di tabel Defect.
            </span>
          </div>
        </div>

        {/* Visual Preview 50x20 mm on Screen */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
            <span>Pratinjau Stiker Fisik (Skala Realistis 50 × 20 mm):</span>
            <button
              type="button"
              onClick={handleCopyTicket}
              className="flex items-center gap-1 text-purple-600 hover:underline cursor-pointer"
            >
              {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
              <span>{isCopied ? 'Tersalin' : 'Salin No. Tiket'}</span>
            </button>
          </div>

          <div className="flex justify-center p-4 bg-slate-100 dark:bg-slate-950 rounded-xl border border-dashed border-slate-300 dark:border-slate-800">
            {/* Box representing 50mm x 20mm (aspect ratio 2.5:1) */}
            <div className="w-[280px] h-[112px] bg-white text-black p-2 rounded shadow-md border border-slate-300 flex items-center select-none font-sans gap-2">
              <div className="w-[85px] h-[85px] shrink-0">
                {qrSrc && <img src={qrSrc} alt="QR Code" className="w-full h-full object-contain" />}
              </div>
              <div className="flex flex-col justify-center overflow-hidden flex-1 py-1">
                <div className="text-[12px] font-black truncate">{ticket.sku}</div>
                <div className="text-[10px] font-bold truncate mt-0.5 text-slate-800 leading-tight">{ticket.nama_produk}</div>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[11px] font-black">{ticket.size ? `SZ: ${ticket.size}` : ''}</span>
                  <span className="text-[9px] font-mono font-bold">*{ticket.ticket_no}*</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Detail Info Ringkas */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
            <span>Nama Produk:</span>
            <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{ticket.nama_produk}</span>
          </div>
          <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
            <span>Lokasi Rak Defect:</span>
            <span className="font-mono font-bold text-purple-600">{ticket.lokasi_sekarang || 'DF-01'}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-purple-600/30 transition-all cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak {printCopies}x Label QR (50x20mm)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

