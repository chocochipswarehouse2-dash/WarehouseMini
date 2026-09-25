import React, { useRef, useState } from 'react';
import {
  Printer,
  X,
  FileText,
  CheckSquare,
  Sparkles,
  Layout,
  Maximize2,
  Minimize2,
  Info,
  Loader2,
} from 'lucide-react';
import { PengirimanStoreReport, PengirimanStoreTrip } from '../../types';

interface SuratJalanPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip?: Partial<PengirimanStoreTrip> | null;
  reports: PengirimanStoreReport[];
}

type PrintLayoutMode = 'auto' | 'a5_half' | 'a4_full';

const A5_MAX_ITEMS = 7;
const A4_MAX_ITEMS_PER_PAGE = 18;

export const SuratJalanPrintModal: React.FC<SuratJalanPrintModalProps> = ({
  isOpen,
  onClose,
  trip,
  reports,
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [layoutMode, setLayoutMode] = useState<PrintLayoutMode>('auto');
  const [isPrinting, setIsPrinting] = useState<boolean>(false);

  if (!isOpen || reports.length === 0) return null;

  // Kelompokkan reports berdasarkan store_tujuan
  const storeGroups: Record<string, PengirimanStoreReport[]> = {};
  reports.forEach((r) => {
    const store = r.store_tujuan || 'Store Tujuan';
    if (!storeGroups[store]) {
      storeGroups[store] = [];
    }
    storeGroups[store].push(r);
  });

  const stores = Object.keys(storeGroups);

  // Standar Isolated IFrame Print (Reliable across Desktop, Mobile, & iFrames)
  const handlePrint = () => {
    setIsPrinting(true);
    try {
      const iframeId = 'surat-jalan-direct-print-frame';
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
        const fullHtml = `
          <!DOCTYPE html>
          <html lang="id">
          <head>
            <meta charset="utf-8" />
            <title>Surat Jalan Pengiriman - Chocochips</title>
            <style>
              * {
                box-sizing: border-box !important;
                margin: 0;
                padding: 0;
                visibility: visible !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
              }
              html, body {
                background: #ffffff !important;
                color: #000000 !important;
                font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                width: 100% !important;
                height: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              @page {
                size: A4 portrait;
                margin: 4mm 6mm;
              }
              .surat-jalan-print-page {
                page-break-after: always !important;
                break-after: page !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                box-sizing: border-box !important;
                margin: 0 auto !important;
                padding: 0 !important;
                border: none !important;
                box-shadow: none !important;
                background: #ffffff !important;
                width: 200mm !important;
              }
              .surat-jalan-print-page:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
              }
              .surat-jalan-a5-double-page {
                height: 282mm !important;
                min-height: 282mm !important;
                max-height: 285mm !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
              }
              .surat-jalan-a4-single-page {
                height: 282mm !important;
                min-height: 282mm !important;
                max-height: 285mm !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: space-between !important;
              }

              /* Flex & Grid Layout Utilities */
              .flex { display: flex !important; }
              .flex-col { flex-direction: column !important; }
              .flex-row { flex-direction: row !important; }
              .flex-wrap { flex-wrap: wrap !important; }
              .flex-1 { flex: 1 1 0% !important; }
              .items-center { align-items: center !important; }
              .items-start { align-items: flex-start !important; }
              .items-end { align-items: flex-end !important; }
              .justify-between { justify-content: space-between !important; }
              .justify-center { justify-content: center !important; }
              .shrink-0 { flex-shrink: 0 !important; }

              .grid { display: grid !important; }
              .grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
              .grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
              .gap-1 { gap: 4px !important; }
              .gap-1\\.5 { gap: 6px !important; }
              .gap-2 { gap: 8px !important; }
              .gap-3 { gap: 12px !important; }
              .gap-4 { gap: 16px !important; }
              .gap-6 { gap: 24px !important; }

              /* Borders & Colors */
              .border { border: 1px solid #000000 !important; }
              .border-2 { border: 2px solid #000000 !important; }
              .border-t { border-top: 1px solid #000000 !important; }
              .border-t-2 { border-top: 2px solid #000000 !important; }
              .border-b { border-bottom: 1px solid #000000 !important; }
              .border-b-2 { border-bottom: 2px solid #000000 !important; }
              .border-black { border-color: #000000 !important; }
              .border-dashed { border-style: dashed !important; }
              .border-slate-200 { border-color: #e2e8f0 !important; }
              .border-slate-300 { border-color: #cbd5e1 !important; }
              .border-slate-400 { border-color: #94a3b8 !important; }

              .rounded-xs { border-radius: 2px !important; }
              .rounded-sm { border-radius: 4px !important; }
              .rounded-md { border-radius: 6px !important; }
              .rounded-lg { border-radius: 8px !important; }
              .rounded-xl { border-radius: 12px !important; }

              .bg-white { background-color: #ffffff !important; }
              .bg-slate-50 { background-color: #f8fafc !important; }
              .bg-slate-100 { background-color: #f1f5f9 !important; }
              .text-black { color: #000000 !important; }
              .text-white { color: #ffffff !important; }
              .text-slate-400 { color: #94a3b8 !important; }
              .text-slate-500 { color: #64748b !important; }
              .text-slate-600 { color: #475569 !important; }
              .text-slate-700 { color: #334155 !important; }
              .text-slate-800 { color: #1e293b !important; }
              .text-slate-900 { color: #0f172a !important; }

              /* Table Specific */
              table { width: 100% !important; border-collapse: collapse !important; }
              th, td { border: 1px solid #000000 !important; vertical-align: middle !important; }
              th { background-color: #f1f5f9 !important; }

              /* Typography */
              .font-normal { font-weight: 400 !important; }
              .font-medium { font-weight: 500 !important; }
              .font-semibold { font-weight: 600 !important; }
              .font-bold { font-weight: 700 !important; }
              .font-black { font-weight: 900 !important; }
              .font-mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace !important; }
              .uppercase { text-transform: uppercase !important; }
              .italic { font-style: italic !important; }
              .text-center { text-align: center !important; }
              .text-right { text-align: right !important; }
              .text-left { text-align: left !important; }
              .truncate { overflow: hidden !important; text-overflow: ellipsis !important; white-space: nowrap !important; }

              /* Sizes */
              .w-full { width: 100% !important; }
              .w-6 { width: 24px !important; }
              .w-8 { width: 32px !important; }
              .w-10 { width: 40px !important; }
              .w-12 { width: 48px !important; }
              .w-16 { width: 64px !important; }
              .w-20 { width: 80px !important; }
              .w-22 { width: 88px !important; }
              .w-24 { width: 96px !important; }
              .w-28 { width: 112px !important; }
              .w-32 { width: 128px !important; }
              .w-36 { width: 144px !important; }
              .h-9 { height: 36px !important; }
              .h-16 { height: 64px !important; }
              .w-3\\.5 { width: 14px !important; }
              .h-3\\.5 { height: 14px !important; }
              .w-4 { width: 16px !important; }
              .h-4 { height: 16px !important; }

              /* Spacing */
              .p-1 { padding: 4px !important; }
              .p-1\\.5 { padding: 6px !important; }
              .p-2 { padding: 8px !important; }
              .p-3 { padding: 12px !important; }
              .p-4 { padding: 16px !important; }
              .p-6 { padding: 24px !important; }
              .px-1 { padding-left: 4px !important; padding-right: 4px !important; }
              .px-1\\.5 { padding-left: 6px !important; padding-right: 6px !important; }
              .px-2 { padding-left: 8px !important; padding-right: 8px !important; }
              .px-3 { padding-left: 12px !important; padding-right: 12px !important; }
              .py-0\\.5 { padding-top: 2px !important; padding-bottom: 2px !important; }
              .py-1 { padding-top: 4px !important; padding-bottom: 4px !important; }
              .py-1\\.5 { padding-top: 6px !important; padding-bottom: 6px !important; }
              .py-2 { padding-top: 8px !important; padding-bottom: 8px !important; }
              .py-2\\.5 { padding-top: 10px !important; padding-bottom: 10px !important; }
              .mt-0\\.5 { margin-top: 2px !important; }
              .mt-1 { margin-top: 4px !important; }
              .mt-1\\.5 { margin-top: 6px !important; }
              .mt-2 { margin-top: 8px !important; }
              .mt-4 { margin-top: 16px !important; }
              .mb-1\\.5 { margin-bottom: 6px !important; }
              .mb-2 { margin-bottom: 8px !important; }
              .mb-3 { margin-bottom: 12px !important; }
              .my-2 { margin-top: 8px !important; margin-bottom: 8px !important; }
              .pb-0\\.5 { padding-bottom: 2px !important; }
              .pb-1 { padding-bottom: 4px !important; }
              .pb-1\\.5 { padding-bottom: 6px !important; }
              .pb-2 { padding-bottom: 8px !important; }
              .pb-2\\.5 { padding-bottom: 10px !important; }
              .pt-1 { padding-top: 4px !important; }
              .pt-2 { padding-top: 8px !important; }
              .space-y-1 > * + * { margin-top: 4px !important; }
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

        setTimeout(() => {
          try {
            printFrame?.contentWindow?.focus();
            printFrame?.contentWindow?.print();
          } catch (err) {
            console.warn('Iframe print focus error, falling back to window.print():', err);
            window.print();
          } finally {
            setIsPrinting(false);
          }
        }, 300);
      } else {
        window.print();
        setIsPrinting(false);
      }
    } catch (e) {
      console.warn('Direct iframe print error, using fallback:', e);
      window.print();
      setIsPrinting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* Print Specific CSS for direct system fallback */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-surat-jalan-area, #printable-surat-jalan-area * {
            visibility: visible !important;
          }
          #printable-surat-jalan-area {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
          }
          @page {
            size: A4 portrait;
            margin: 4mm 6mm;
          }
          .surat-jalan-print-page {
            page-break-after: always !important;
            break-after: page !important;
            box-sizing: border-box !important;
            margin: 0 !important;
            padding: 0 !important;
            border: none !important;
            box-shadow: none !important;
            background: white !important;
          }
          .surat-jalan-print-page:last-child {
            page-break-after: auto !important;
            break-after: auto !important;
          }
          .surat-jalan-a5-double-page {
            height: 282mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
          }
          .surat-jalan-a4-single-page {
            min-height: 282mm !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
            padding: 6mm 4mm !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-5xl max-h-[94vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
                <span>Cetak Surat Jalan & Tanda Terima Pengiriman</span>
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Otomatis adaptif: Mode hemat <strong>A5 x2</strong> (jika ≤{A5_MAX_ITEMS} item) atau <strong>A4 x2 Full Page</strong> (jika &gt;{A5_MAX_ITEMS} item)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isPrinting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              <span>Cetak Sekarang</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Toolbar Pengaturan Format & Info */}
        <div className="px-4 py-2.5 bg-slate-100/90 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-2.5 text-xs">
          {/* Layout Mode Selector Buttons */}
          <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 p-1 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xs">
            <span className="text-[11px] font-bold text-slate-500 px-2 flex items-center gap-1">
              <Layout className="w-3.5 h-3.5 text-blue-500" />
              Format Layout:
            </span>

            <button
              type="button"
              onClick={() => setLayoutMode('auto')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                layoutMode === 'auto'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="Otomatis pilih A5 x2 jika muat, atau A4 x2 jika banyak barang"
            >
              <Sparkles className="w-3 h-3" />
              <span>Otomatis (Adaptif)</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('a5_half')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                layoutMode === 'a5_half'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="1 Lembar A4 dibagi dua (Setengah Atas: Penerima, Setengah Bawah: Pengirim)"
            >
              <Minimize2 className="w-3 h-3" />
              <span>A5 x 2 (1 Lembar A4 Bagi 2)</span>
            </button>

            <button
              type="button"
              onClick={() => setLayoutMode('a4_full')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                layoutMode === 'a4_full'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
              title="2 Lembar A4 Penuh (Halaman 1: Full A4 Penerima, Halaman 2: Full A4 Arsip Gudang)"
            >
              <Maximize2 className="w-3 h-3" />
              <span>A4 x 2 (Full Halaman Rangkap 2)</span>
            </button>
          </div>

          <div className="flex items-center gap-3 text-slate-600 dark:text-slate-300">
            <span className="flex items-center gap-1 font-medium">
              <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
              <span>{stores.length} Toko Tujuan</span>
            </span>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              Total {reports.reduce((acc, r) => {
                const repItems = r.items || [];
                const repKoli = repItems.length > 0
                  ? repItems.reduce((sum, it) => sum + (Number(it.hitung_koli) || (it.satuan === 'Pcs' ? 1 : Number(it.qty) || 1)), 0)
                  : Number(r.total_koli) || 0;
                return acc + repKoli;
              }, 0)} Koli
            </span>
          </div>
        </div>

        {/* Live Preview Area */}
        <div className="flex-1 p-4 overflow-y-auto bg-slate-200/80 dark:bg-slate-950/80 flex justify-center">
          <div id="printable-surat-jalan-area" ref={printAreaRef} className="w-full flex flex-col items-center gap-8">
            {stores.map((storeName, storeIdx) => {
              const storeReports = storeGroups[storeName];
              const allItems = storeReports.flatMap((r) => r.items || []);
              
              // Hitung total koli akurat langsung dari jumlah item di tabel
              const totalKoli = allItems.reduce((acc, it) => {
                const k = Number(it.hitung_koli);
                if (!isNaN(k) && k > 0) return acc + k;
                return acc + (it.satuan === 'Pcs' ? 1 : Math.max(1, Number(it.qty) || 1));
              }, 0);

              const totalQty = allItems.reduce((a, b) => a + Number(b.qty || 0), 0);

              const docNo =
                trip?.id || storeReports[0]?.trip_id || storeReports[0]?.id || `SJ-${Date.now().toString().slice(-6)}`;
              const tglKirim =
                trip?.tanggal_kirim || storeReports[0]?.tanggal_kirim || storeReports[0]?.tanggal_laporan || '-';
              const driver = trip?.dikirim_oleh || storeReports[0]?.dikirim_oleh || 'Kurir Toko / Driver';
              const catatan = trip?.catatan || storeReports[0]?.catatan_kirim || '-';
              const picGudang = trip?.created_by_nama || storeReports[0]?.pic_nama || 'Admin Gudang';

              // Tentukan apakah menggunakan format A5x2 atau A4x2
              const isA5Mode =
                layoutMode === 'a5_half'
                  ? true
                  : layoutMode === 'a4_full'
                  ? false
                  : allItems.length <= A5_MAX_ITEMS;

              // -------------------------------------------------------------
              // CASE 1: FORMAT A5 x 2 (1 Lembar A4 dibagi 2 simetris)
              // -------------------------------------------------------------
              if (isA5Mode) {
                // Chunk per 7 item agar jika dipaksa A5 dengan >7 item, tetap terbagi dalam halaman terpaginasi
                const a5Chunks: typeof allItems[] = [];
                for (let i = 0; i < allItems.length; i += A5_MAX_ITEMS) {
                  a5Chunks.push(allItems.slice(i, i + A5_MAX_ITEMS));
                }
                if (a5Chunks.length === 0) a5Chunks.push([]);

                return a5Chunks.map((chunkItems, chunkIdx) => {
                  const chunkKoli = chunkItems.reduce((acc, it) => {
                    const k = Number(it.hitung_koli);
                    if (!isNaN(k) && k > 0) return acc + k;
                    return acc + (it.satuan === 'Pcs' ? 1 : Math.max(1, Number(it.qty) || 1));
                  }, 0);
                  const chunkQty = chunkItems.reduce((a, b) => a + Number(b.qty || 0), 0);

                  const renderHalfSheet = (isPenerima: boolean) => (
                    <div
                      className="bg-white text-black p-4 rounded-xs border border-slate-300 flex flex-col justify-between"
                      style={{
                        height: '138mm',
                        fontSize: '9px',
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        lineHeight: '1.25',
                        boxSizing: 'border-box',
                      }}
                    >
                      {/* Header Bar */}
                      <div>
                        <div className="flex justify-between items-start border-b-2 border-black pb-1.5 mb-2">
                          <div>
                            <div className="font-black text-xs uppercase tracking-wider text-slate-900">
                              CHOCOCHIPS WAREHOUSE & LOGISTICS
                            </div>
                            <h4 className="font-black text-sm uppercase text-black mt-0.5">
                              SURAT JALAN & TANDA TERIMA PENGIRIMAN
                            </h4>
                          </div>

                          <div className="text-right">
                            <span className="inline-block border-2 border-black px-2 py-0.5 text-[10px] font-black uppercase rounded-xs">
                              {isPenerima ? 'LEMBAR 1: PENERIMA / TOKO' : 'LEMBAR 2: PENGIRIM / ARSIP GUDANG'}
                            </span>
                            <div className="text-[9px] font-mono font-bold mt-1 text-slate-700">
                              No: {docNo} {a5Chunks.length > 1 ? `(Hal ${chunkIdx + 1}/${a5Chunks.length})` : ''}
                            </div>
                          </div>
                        </div>

                        {/* Metadata Grid */}
                        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xs border border-slate-300 mb-2 text-[9px]">
                          <div>
                            <div className="flex">
                              <span className="w-20 font-bold text-slate-600">Toko Tujuan</span>
                              <span className="font-black text-xs text-black uppercase">: {storeName}</span>
                            </div>
                            <div className="flex mt-0.5">
                              <span className="w-20 font-bold text-slate-600">Tanggal Kirim</span>
                              <span className="font-bold">: {tglKirim}</span>
                            </div>
                            <div className="flex mt-0.5">
                              <span className="w-20 font-bold text-slate-600">PIC Gudang</span>
                              <span className="font-semibold">: {picGudang}</span>
                            </div>
                          </div>

                          <div>
                            <div className="flex">
                              <span className="w-22 font-bold text-slate-600">Dikirim Oleh</span>
                              <span className="font-black text-black">: {driver}</span>
                            </div>
                            <div className="flex mt-0.5">
                              <span className="w-22 font-bold text-slate-600">Total Muatan</span>
                              <span className="font-black text-black">
                                : {totalKoli} Koli ({allItems.length} Macam Barang)
                              </span>
                            </div>
                            <div className="flex mt-0.5">
                              <span className="w-22 font-bold text-slate-600">Catatan Kirim</span>
                              <span className="font-medium text-slate-700 truncate">: {catatan}</span>
                            </div>
                          </div>
                        </div>

                        {/* Tabel Rincian Barang dengan Kolom CEKLIS */}
                        <table className="w-full border-collapse border border-black text-left text-[8.5px]">
                          <thead>
                            <tr className="bg-slate-100 border-b border-black font-black">
                              <th className="border border-black px-1.5 py-1 text-center w-6">No</th>
                              <th className="border border-black px-1 py-1 text-center w-10">Ceklis</th>
                              <th className="border border-black px-1.5 py-1 w-28">No. Surat Jalan</th>
                              <th className="border border-black px-1.5 py-1">Deskripsi Barang</th>
                              <th className="border border-black px-1.5 py-1 text-center w-16">Qty</th>
                              <th className="border border-black px-1.5 py-1 text-center w-16">Jumlah Koli</th>
                              <th className="border border-black px-1.5 py-1 w-24">Keterangan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {chunkItems.map((it, itIdx) => {
                              const itemKoli = Number(it.hitung_koli) || (it.satuan === 'Pcs' ? 1 : Number(it.qty) || 1);
                              return (
                                <tr key={it.id || itIdx} className="border-b border-slate-300">
                                  <td className="border border-black px-1.5 py-1 text-center font-bold">
                                    {chunkIdx * A5_MAX_ITEMS + itIdx + 1}
                                  </td>
                                  <td className="border border-black px-1 py-1 text-center">
                                    <span className="inline-block w-3.5 h-3.5 border-2 border-black rounded-xs bg-white"></span>
                                  </td>
                                  <td className="border border-black px-1.5 py-1 font-mono font-semibold">
                                    {it.no_surat_jalan}
                                  </td>
                                  <td className="border border-black px-1.5 py-1 font-bold text-black">
                                    <div className="flex items-center justify-between gap-1">
                                      <span>{it.deskripsi}</span>
                                      {it.foto_barang && (
                                        <span className="text-[7.5px] font-normal text-slate-500 italic shrink-0">
                                          [+Foto]
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="border border-black px-1.5 py-1 text-center font-bold">
                                    {it.qty} {it.satuan}
                                  </td>
                                  <td className="border border-black px-1.5 py-1 text-center font-black">
                                    {itemKoli} Koli
                                  </td>
                                  <td className="border border-black px-1.5 py-1 text-slate-600 truncate">
                                    {it.keterangan || '-'}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          <tfoot>
                            <tr className="bg-slate-100 font-black border-t-2 border-black">
                              <td colSpan={4} className="border border-black px-2 py-1 text-right">
                                {a5Chunks.length > 1 ? `TOTAL (HALAMAN ${chunkIdx + 1}/${a5Chunks.length}):` : 'TOTAL PENGIRIMAN:'}
                              </td>
                              <td className="border border-black px-1.5 py-1 text-center">
                                {a5Chunks.length > 1 ? chunkQty : totalQty}
                              </td>
                              <td className="border border-black px-1.5 py-1 text-center text-[9.5px]">
                                {a5Chunks.length > 1 ? `${chunkKoli} Koli` : `${totalKoli} Koli`}
                              </td>
                              <td className="border border-black px-1.5 py-1 text-center text-[8px]">
                                {a5Chunks.length > 1 ? `${chunkItems.length} Macam Barang` : `${allItems.length} Macam Barang`}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>

                      {/* Footer & Tanda Tangan */}
                      <div className="mt-2 pt-1 border-t border-slate-200">
                        <div className="text-[7.5px] text-slate-500 mb-1.5 italic">
                          * Harap diceklis saat barang diserahterimakan. Segala ketidaksesuaian/kerusakan wajib dicatat pada lembar tanda terima ini.
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-center text-[8.5px]">
                          <div>
                            <div className="font-bold text-slate-700">Dibuat Oleh (Gudang):</div>
                            <div className="h-9 border-b border-black flex items-end justify-center pb-0.5 font-bold">
                              ({picGudang})
                            </div>
                          </div>

                          <div>
                            <div className="font-bold text-slate-700">Diserahkan Oleh (Driver):</div>
                            <div className="h-9 border-b border-black flex items-end justify-center pb-0.5 font-bold">
                              ({driver})
                            </div>
                          </div>

                          <div>
                            <div className="font-bold text-slate-700">Diterima Oleh (Toko):</div>
                            <div className="h-9 border-b border-black flex items-end justify-center pb-0.5 font-bold">
                              (....................................)
                            </div>
                            <div className="text-[7.5px] text-slate-400 mt-0.5">Tgl & Jam: .... / .... WIB</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );

                  return (
                    <div
                      key={`store-a5-${storeIdx}-page-${chunkIdx}`}
                      className="surat-jalan-print-page surat-jalan-a5-double-page bg-white text-black p-4 rounded-xl border border-slate-400 shadow-xl mb-6"
                      style={{
                        width: '210mm',
                        minHeight: '282mm',
                        boxSizing: 'border-box',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      {/* Top Half: Lembar 1 Penerima */}
                      {renderHalfSheet(true)}

                      {/* Cut Line */}
                      <div className="my-2 py-1 border-t-2 border-dashed border-slate-400 flex items-center justify-between text-[8px] text-slate-400 font-mono select-none">
                        <span>✂ Potong disini (Format A5 x 2 pada Lembar A4)</span>
                        <span>- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</span>
                        <span>✂ Rangkap 2 (Penerima & Pengirim)</span>
                      </div>

                      {/* Bottom Half: Lembar 2 Pengirim / Arsip */}
                      {renderHalfSheet(false)}
                    </div>
                  );
                });
              }

              // -------------------------------------------------------------
              // CASE 2: FORMAT A4 x 2 (Full Halaman A4 Rangkap 2 untuk data banyak)
              // -------------------------------------------------------------
              const chunks: typeof allItems[] = [];
              for (let i = 0; i < allItems.length; i += A4_MAX_ITEMS_PER_PAGE) {
                chunks.push(allItems.slice(i, i + A4_MAX_ITEMS_PER_PAGE));
              }
              if (chunks.length === 0) chunks.push([]);

              // Render Single Full A4 Page
              const renderFullA4Sheet = (
                isPenerima: boolean,
                itemsPage: typeof allItems,
                pageNumber: number,
                totalPages: number,
                startIndex: number
              ) => (
                <div
                  className="bg-white text-black p-6 rounded-xs border border-slate-300 flex flex-col justify-between"
                  style={{
                    height: '282mm',
                    fontSize: '11px',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    lineHeight: '1.35',
                    boxSizing: 'border-box',
                  }}
                >
                  {/* Header & Details */}
                  <div>
                    <div className="flex justify-between items-start border-b-2 border-black pb-2.5 mb-3">
                      <div>
                        <div className="font-black text-sm uppercase tracking-wider text-slate-900">
                          CHOCOCHIPS WAREHOUSE & LOGISTICS
                        </div>
                        <h4 className="font-black text-lg uppercase text-black mt-0.5">
                          SURAT JALAN & TANDA TERIMA PENGIRIMAN
                        </h4>
                        <div className="text-[10px] text-slate-600 font-medium">
                          Dokumen Resmi Serah Terima Fisik Barang Antar Gudang & Store
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="inline-block border-2 border-black px-3 py-1 text-xs font-black uppercase rounded-xs bg-slate-100">
                          {isPenerima ? 'LEMBAR 1: PENERIMA / TOKO' : 'LEMBAR 2: PENGIRIM / ARSIP GUDANG'}
                        </span>
                        <div className="text-xs font-mono font-bold mt-1.5 text-slate-800">
                          No. Dokumen: {docNo}
                        </div>
                        {totalPages > 1 && (
                          <div className="text-[10px] font-bold text-slate-500 mt-0.5">
                            Halaman {pageNumber} dari {totalPages}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Metadata Card */}
                    <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-xs border border-slate-300 mb-3 text-[10.5px]">
                      <div className="space-y-1">
                        <div className="flex">
                          <span className="w-28 font-bold text-slate-600">Toko Tujuan</span>
                          <span className="font-black text-sm text-black uppercase">: {storeName}</span>
                        </div>
                        <div className="flex">
                          <span className="w-28 font-bold text-slate-600">Tanggal Kirim</span>
                          <span className="font-bold text-black">: {tglKirim}</span>
                        </div>
                        <div className="flex">
                          <span className="w-28 font-bold text-slate-600">PIC Gudang</span>
                          <span className="font-semibold text-black">: {picGudang}</span>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex">
                          <span className="w-28 font-bold text-slate-600">Dikirim Oleh</span>
                          <span className="font-black text-black">: {driver}</span>
                        </div>
                        <div className="flex">
                          <span className="w-28 font-bold text-slate-600">Total Muatan</span>
                          <span className="font-black text-black">
                            : {totalKoli} Koli ({allItems.length} Macam Barang)
                          </span>
                        </div>
                        <div className="flex">
                          <span className="w-28 font-bold text-slate-600">Catatan Kirim</span>
                          <span className="font-medium text-slate-700">: {catatan}</span>
                        </div>
                      </div>
                    </div>

                    {/* Full Table */}
                    <table className="w-full border-collapse border border-black text-left text-[10px]">
                      <thead>
                        <tr className="bg-slate-100 border-b-2 border-black font-black text-slate-900">
                          <th className="border border-black px-2 py-1.5 text-center w-8">No</th>
                          <th className="border border-black px-1.5 py-1.5 text-center w-12">Ceklis</th>
                          <th className="border border-black px-2 py-1.5 w-32 font-mono">No. Surat Jalan</th>
                          <th className="border border-black px-2 py-1.5">Deskripsi / Nama Barang</th>
                          <th className="border border-black px-2 py-1.5 text-center w-20">Qty</th>
                          <th className="border border-black px-2 py-1.5 text-center w-20">Jumlah Koli</th>
                          <th className="border border-black px-2 py-1.5 w-36">Keterangan</th>
                        </tr>
                      </thead>
                      <tbody>
                        {itemsPage.map((it, itIdx) => {
                          const itemKoli = Number(it.hitung_koli) || (it.satuan === 'Pcs' ? 1 : Number(it.qty) || 1);
                          return (
                            <tr key={it.id || itIdx} className="border-b border-slate-300 hover:bg-slate-50">
                              <td className="border border-black px-2 py-1.5 text-center font-bold">
                                {startIndex + itIdx + 1}
                              </td>
                              <td className="border border-black px-1.5 py-1.5 text-center">
                                <span className="inline-block w-4 h-4 border-2 border-black rounded-xs bg-white"></span>
                              </td>
                              <td className="border border-black px-2 py-1.5 font-mono font-semibold text-slate-800">
                                {it.no_surat_jalan}
                              </td>
                              <td className="border border-black px-2 py-1.5 font-bold text-black">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span>{it.deskripsi}</span>
                                  {it.foto_barang && (
                                    <span className="text-[8.5px] font-normal text-slate-500 italic shrink-0">
                                      [+Foto Terlampir]
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="border border-black px-2 py-1.5 text-center font-bold">
                                {it.qty} {it.satuan}
                              </td>
                              <td className="border border-black px-2 py-1.5 text-center font-black text-slate-900">
                                {itemKoli} Koli
                              </td>
                              <td className="border border-black px-2 py-1.5 text-slate-600">
                                {it.keterangan || '-'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      {pageNumber === totalPages && (
                        <tfoot>
                          <tr className="bg-slate-100 font-black border-t-2 border-black text-slate-900">
                            <td colSpan={4} className="border border-black px-3 py-1.5 text-right font-black">
                              TOTAL KESELURUHAN PENGIRIMAN:
                            </td>
                            <td className="border border-black px-2 py-1.5 text-center text-[11px] font-black">
                              {totalQty}
                            </td>
                            <td className="border border-black px-2 py-1.5 text-center text-[11px] font-black">
                              {totalKoli} Koli
                            </td>
                            <td className="border border-black px-2 py-1.5 text-center text-[9.5px]">
                              {allItems.length} Macam Barang
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>

                  {/* Signatures & Confirmation */}
                  <div className="mt-4 pt-2 border-t border-slate-300">
                    <div className="text-[9px] text-slate-600 mb-3 italic">
                      * <strong>Perhatian:</strong> Mohon periksa dan centang (✓) fisik barang pada kolom Ceklis di atas sebelum menandatangani surat jalan ini. Apabila ada selisih atau kerusakan koli, wajib dituliskan di kolom Keterangan.
                    </div>

                    <div className="grid grid-cols-3 gap-6 text-center text-[10px]">
                      <div>
                        <div className="font-bold text-slate-700">Dibuat Oleh (Admin Gudang):</div>
                        <div className="h-16 border-b border-black flex items-end justify-center pb-1 font-bold">
                          ({picGudang})
                        </div>
                        <div className="text-[8.5px] text-slate-400 mt-1">Staf Logistik / Gudang</div>
                      </div>

                      <div>
                        <div className="font-bold text-slate-700">Diserahkan Oleh (Driver / Ekspedisi):</div>
                        <div className="h-16 border-b border-black flex items-end justify-center pb-1 font-bold">
                          ({driver})
                        </div>
                        <div className="text-[8.5px] text-slate-400 mt-1">Petugas Pengantar</div>
                      </div>

                      <div>
                        <div className="font-bold text-slate-700">Diterima Oleh (PIC Toko):</div>
                        <div className="h-16 border-b border-black flex items-end justify-center pb-1 font-bold">
                          (......................................................)
                        </div>
                        <div className="text-[8.5px] text-slate-400 mt-1">Tgl: ..... / ..... / 2026 &nbsp;&nbsp; Jam: ..... : ..... WIB</div>
                      </div>
                    </div>
                  </div>
                </div>
              );

              // Buat halaman berpasangan: Pertama kumpulan halaman Toko, lalu kumpulan halaman Arsip Gudang
              return (
                <React.Fragment key={`store-a4-group-${storeIdx}`}>
                  {/* RANGKAP 1: LEMBAR TOKO / PENERIMA */}
                  {chunks.map((chunkItems, chunkIdx) => (
                    <div
                      key={`a4-penerima-${storeIdx}-${chunkIdx}`}
                      className="surat-jalan-print-page surat-jalan-a4-single-page bg-white text-black p-4 rounded-xl border border-slate-400 shadow-xl mb-4"
                      style={{
                        width: '210mm',
                        minHeight: '282mm',
                        boxSizing: 'border-box',
                      }}
                    >
                      {renderFullA4Sheet(
                        true,
                        chunkItems,
                        chunkIdx + 1,
                        chunks.length,
                        chunkIdx * A4_MAX_ITEMS_PER_PAGE
                      )}
                    </div>
                  ))}

                  {/* RANGKAP 2: LEMBAR PENGIRIM / ARSIP GUDANG */}
                  {chunks.map((chunkItems, chunkIdx) => (
                    <div
                      key={`a4-pengirim-${storeIdx}-${chunkIdx}`}
                      className="surat-jalan-print-page surat-jalan-a4-single-page bg-white text-black p-4 rounded-xl border border-slate-400 shadow-xl mb-4"
                      style={{
                        width: '210mm',
                        minHeight: '282mm',
                        boxSizing: 'border-box',
                      }}
                    >
                      {renderFullA4Sheet(
                        false,
                        chunkItems,
                        chunkIdx + 1,
                        chunks.length,
                        chunkIdx * A4_MAX_ITEMS_PER_PAGE
                      )}
                    </div>
                  ))}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-blue-500 shrink-0" />
            <span>
              Mode saat ini:{' '}
              <strong className="text-slate-900 dark:text-white">
                {layoutMode === 'a5_half'
                  ? 'A5 x 2 (1 Lembar A4 bagi dua)'
                  : layoutMode === 'a4_full'
                  ? 'A4 x 2 (Full Halaman Rangkap 2)'
                  : 'Otomatis (Adaptif A5/A4)'}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer"
            >
              Tutup
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={isPrinting}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 flex items-center gap-2 cursor-pointer transition active:scale-95 disabled:opacity-50"
            >
              {isPrinting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              <span>{isPrinting ? 'Menyiapkan Cetak...' : 'Cetak Surat Jalan Sekarang'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
