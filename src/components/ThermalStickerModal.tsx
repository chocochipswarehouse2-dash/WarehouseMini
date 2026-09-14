import React, { useState } from 'react';
import { Printer, X, Copy, Check, Info } from 'lucide-react';

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

  // Sync print copies when ticket changes
  React.useEffect(() => {
    if (ticket) {
      setPrintCopies(ticket.qty > 0 ? ticket.qty : 1);
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

  // Generate simple deterministic barcode pattern bars for Code128-like appearance
  const generateBarcodeLines = (str: string) => {
    const chars = str.toUpperCase().split('');
    return chars.flatMap((c, idx) => {
      const code = c.charCodeAt(0);
      const isThick = code % 2 === 0;
      const isGapThick = (code + idx) % 3 === 0;
      return [
        <div key={`bar-${idx}-1`} className={`${isThick ? 'w-1 sm:w-1.5' : 'w-0.5'} bg-black self-stretch shrink-0`} />,
        <div key={`gap-${idx}-1`} className={`${isGapThick ? 'w-1' : 'w-0.5'} bg-white self-stretch shrink-0`} />,
      ];
    });
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
                padding: 1mm 1.5mm !important;
                page-break-after: always !important;
                break-after: page !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
                background: white !important;
                color: black !important;
                font-family: monospace, sans-serif !important;
                overflow: hidden !important;
              }
            }
          `
        }} />

        {copiesArray.map((_, i) => (
          <div key={`print-copy-${i}`} className="thermal-page-50x20">
            {/* Header: Label Type & No Tiket */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', lineHeight: '1.1' }}>
              <span style={{ fontSize: '7pt', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
                [DEFECT] {ticket.lokasi_sekarang ? `• ${ticket.lokasi_sekarang}` : ''}
              </span>
              <span style={{ fontSize: '7.5pt', fontWeight: 900, fontFamily: 'monospace' }}>
                {ticket.ticket_no}
              </span>
            </div>

            {/* Middle: SKU & Size */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', lineHeight: '1.1', marginTop: '0.5mm' }}>
              <span style={{ fontSize: '7.5pt', fontWeight: 900, letterSpacing: '-0.2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '34mm' }}>
                {ticket.sku}
              </span>
              <span style={{ fontSize: '7pt', fontWeight: 800 }}>
                {ticket.size ? `SZ: ${ticket.size}` : ''} {copiesArray.length > 1 ? `(${i + 1}/${copiesArray.length})` : ''}
              </span>
            </div>

            {/* Defect Description */}
            <div style={{ fontSize: '6pt', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1', marginTop: '0.4mm' }}>
              {ticket.kategori_rusak || 'CACAT DEFECT'} {ticket.acc_harga_defect ? `• ACC: Rp${ticket.acc_harga_defect.toLocaleString('id-ID')}` : ''}
            </div>

            {/* Simulated Barcode Pattern Lines */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '4.5mm', overflow: 'hidden', marginTop: '0.5mm', width: '100%' }}>
              <div style={{ display: 'flex', height: '100%', width: '92%', justifyContent: 'space-between' }}>
                {generateBarcodeLines(ticket.ticket_no)}
              </div>
            </div>

            {/* Bottom: Ticket Text & Date */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '5.5pt', lineHeight: '1', fontWeight: 600 }}>
              <span>*{ticket.ticket_no}*</span>
              <span>{ticket.tanggal ? ticket.tanggal.slice(0, 10) : new Date().toISOString().slice(0, 10)}</span>
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
              <h3 className="text-sm font-black tracking-tight">Cetak Stiker Barcode 50x20 mm</h3>
              <p className="text-[11px] text-slate-500">Standar label thermal roll stiker pakaian defect</p>
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
              Aturan WMS: Jika 1 produk memiliki qty {ticket.qty} pcs dengan defect yang sama, setiap baju ditempelkan 1 lembar stiker dengan nomor tiket yang sama (<strong>{ticket.ticket_no}</strong>).
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
            <div className="w-[280px] h-[112px] bg-white text-black p-2 rounded shadow-md border border-slate-300 flex flex-col justify-between select-none font-sans">
              {/* Header */}
              <div className="flex items-center justify-between text-[10px] font-black leading-none">
                <span className="bg-black text-white px-1 py-0.2 rounded text-[9px]">DEFECT</span>
                <span className="font-mono tracking-tight text-[11px] font-black">{ticket.ticket_no}</span>
              </div>

              {/* SKU & Size */}
              <div className="flex items-center justify-between text-[11px] font-black leading-tight pt-1">
                <span className="truncate max-w-[190px]">{ticket.sku}</span>
                <span className="text-[10px] font-bold shrink-0">{ticket.size ? `SZ: ${ticket.size}` : ''}</span>
              </div>

              {/* Defect note */}
              <div className="text-[9px] font-semibold text-slate-700 truncate leading-none">
                {ticket.kategori_rusak || 'Cacat Defect'} {ticket.acc_harga_defect ? `• ACC: Rp${ticket.acc_harga_defect.toLocaleString('id-ID')}` : ''}
              </div>

              {/* Barcode Visualization */}
              <div className="h-5 flex items-center justify-center overflow-hidden my-0.5">
                <div className="flex h-full w-full justify-between items-stretch px-1">
                  {generateBarcodeLines(ticket.ticket_no)}
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between text-[8px] font-mono font-semibold text-slate-600 leading-none">
                <span>*{ticket.ticket_no}*</span>
                <span>{ticket.tanggal ? ticket.tanggal.slice(0, 10) : new Date().toISOString().slice(0, 10)}</span>
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
          {ticket.acc_harga_defect ? (
            <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-bold">
              <span>Harga ACC Defect:</span>
              <span>Rp {ticket.acc_harga_defect.toLocaleString('id-ID')}</span>
            </div>
          ) : (
            <div className="flex items-center justify-between text-amber-600 font-bold">
              <span>Status Otorisasi:</span>
              <span>Menunggu ACC Manager/Buyer</span>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handlePrint}
            className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-700 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-purple-600/30 transition-all cursor-pointer active:scale-95"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak {printCopies}x Label (50x20mm)</span>
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
