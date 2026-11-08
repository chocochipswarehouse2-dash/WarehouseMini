import React, { useState } from 'react';
import { X, Printer, CheckSquare, Calendar, Layers, Hash } from 'lucide-react';
import { TrelloUpItem } from '../../types';
import { TrelloImage } from './TrelloImage';

interface TrelloPrintA4ModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedUp: string;
  items: TrelloUpItem[];
}

export const TrelloPrintA4Modal: React.FC<TrelloPrintA4ModalProps> = ({
  isOpen,
  onClose,
  selectedUp,
  items,
}) => {
  const [columns, setColumns] = useState<2 | 3>(2);
  const [showChecklist, setShowChecklist] = useState<boolean>(true);

  if (!isOpen) return null;

  const sortedItems = [...items].sort((a, b) => a.sequence_order - b.sequence_order);
  const publishDate = sortedItems[0]?.publish_date_raw || '';
  const printDate = new Date().toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-4xl max-h-[95vh] flex flex-col shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Top Control Toolbar (Hidden on Print) */}
        <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-850 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 print:hidden shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
              <Printer className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">
                Cetak Susunan Koleksi A4
              </h2>
              <p className="text-[11px] text-slate-500 truncate">
                {selectedUp} • {sortedItems.length} Artikel
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Column Selector */}
            <div className="hidden sm:flex items-center bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
              <button
                type="button"
                onClick={() => setColumns(2)}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  columns === 2
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                2 Kolom
              </button>
              <button
                type="button"
                onClick={() => setColumns(3)}
                className={`px-2.5 py-1 rounded-lg transition cursor-pointer ${
                  columns === 3
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                3 Kolom
              </button>
            </div>

            {/* Checklist Toggle */}
            <label className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showChecklist}
                onChange={(e) => setShowChecklist(e.target.checked)}
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>Kotak Cek</span>
            </label>

            {/* Print Button */}
            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/30 cursor-pointer transition active:scale-95"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / PDF</span>
            </button>

            {/* Close */}
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Preview Area (Printed directly via @media print) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100 dark:bg-slate-950/50 print:p-0 print:bg-white print:overflow-visible">
          {/* A4 Sheet Container */}
          <div className="trello-a4-sheet max-w-[210mm] mx-auto bg-white text-slate-900 p-6 sm:p-8 rounded-xl shadow-lg border border-slate-200 print:shadow-none print:border-none print:p-0 print:max-w-none">
            {/* Header Cetak A4 */}
            <div className="border-b-2 border-slate-900 pb-3 mb-4 flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                  CHOCOCHIPS WMS • OPERASIONAL & PRODUKSI
                </div>
                <h1 className="text-xl sm:text-2xl font-black uppercase tracking-tight text-slate-900 mt-0.5">
                  SUSUNAN UPLOAD {selectedUp}
                </h1>
                {publishDate && (
                  <div className="inline-flex items-center gap-1.5 mt-1 px-2.5 py-0.5 rounded-md bg-slate-100 text-xs font-extrabold border border-slate-300">
                    <Calendar className="w-3.5 h-3.5 text-slate-600" />
                    <span>Jadwal Tayang / Publish: <b>{publishDate}</b></span>
                  </div>
                )}
              </div>

              <div className="text-right shrink-0">
                <div className="text-xs font-black text-slate-800">
                  Total: <span className="text-base font-mono">{sortedItems.length}</span> Artikel
                </div>
                <div className="text-[10px] text-slate-500 mt-1">
                  Dicetak: {printDate}
                </div>
              </div>
            </div>

            {/* Grid Kartu Susunan A4 */}
            <div
              className={`grid gap-3.5 print:gap-3 ${
                columns === 3 ? 'grid-cols-3' : 'grid-cols-2'
              }`}
            >
              {sortedItems.map((item) => (
                <div
                  key={item.id}
                  className="trello-a4-card border border-slate-300 rounded-xl p-2.5 bg-white flex flex-col justify-between break-inside-avoid shadow-2xs print:border-slate-400"
                >
                  {/* Card Header: Urutan & Kode */}
                  <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-slate-900 text-white font-mono font-black text-xs flex items-center justify-center shrink-0">
                        {item.sequence_order}
                      </span>
                      <span className="font-mono font-black text-sm text-slate-900">
                        {item.item_code}
                      </span>
                      <span className="text-[10px] font-bold text-slate-500 truncate">
                        ({item.up_code})
                      </span>
                    </div>

                    {showChecklist && (
                      <div className="w-5 h-5 rounded border-2 border-slate-400 flex items-center justify-center shrink-0" />
                    )}
                  </div>

                  {/* Foto Produk */}
                  <div className="my-2 aspect-square w-full rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center relative">
                    <TrelloImage
                      src={item.gdrive_image_url || item.trello_image_url}
                      fallbackSrc={item.trello_image_url}
                      eager={true}
                      alt={item.card_name}
                      className="w-full h-full object-cover"
                      fallbackText="Foto tidak tersedia"
                    />
                  </div>

                  {/* Card Footer: Nama & Note */}
                  <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
                    <div className="font-bold text-slate-800 truncate" title={item.item_name}>
                      {item.item_name}
                    </div>
                    {item.qty_note && (
                      <span className="px-1.5 py-0.2 rounded font-mono font-black text-[10px] bg-slate-100 border border-slate-200 shrink-0">
                        {item.qty_note}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Footer Form Tanda Tangan Fisik (Khusus Cetak) */}
            <div className="mt-6 pt-4 border-t-2 border-slate-300 grid grid-cols-3 gap-4 text-center text-xs text-slate-600 print:mt-6">
              <div>
                <p className="font-bold">Disusun Oleh</p>
                <div className="h-12" />
                <p className="border-t border-slate-400 pt-1 text-[11px] font-semibold">( Tim Merchandiser )</p>
              </div>
              <div>
                <p className="font-bold">Diperiksa Gudang</p>
                <div className="h-12" />
                <p className="border-t border-slate-400 pt-1 text-[11px] font-semibold">( Admin / Head Gudang )</p>
              </div>
              <div>
                <p className="font-bold">Diterima Produksi</p>
                <div className="h-12" />
                <p className="border-t border-slate-400 pt-1 text-[11px] font-semibold">( PIC Produksi )</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Media Print Global Rules */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .trello-a4-sheet, .trello-a4-sheet * {
            visibility: visible;
          }
          .trello-a4-sheet {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .trello-a4-card {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};

