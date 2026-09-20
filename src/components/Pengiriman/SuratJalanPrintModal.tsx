import React, { useRef } from 'react';
import { Printer, X, FileText, CheckSquare, Store, Calendar, User } from 'lucide-react';
import { PengirimanStoreReport, PengirimanStoreTrip } from '../../types';

interface SuratJalanPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  trip?: Partial<PengirimanStoreTrip> | null;
  reports: PengirimanStoreReport[];
}

export const SuratJalanPrintModal: React.FC<SuratJalanPrintModalProps> = ({
  isOpen,
  onClose,
  trip,
  reports,
}) => {
  const printAreaRef = useRef<HTMLDivElement>(null);

  if (!isOpen || reports.length === 0) return null;

  // Kelompokkan reports berdasarkan store_tujuan (agar tiap store memiliki 1 lembar A4 rangkap 2 tersendiri)
  const storeGroups: Record<string, PengirimanStoreReport[]> = {};
  reports.forEach((r) => {
    if (!storeGroups[r.store_tujuan]) {
      storeGroups[r.store_tujuan] = [];
    }
    storeGroups[r.store_tujuan].push(r);
  });

  const stores = Object.keys(storeGroups);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      {/* Print Specific CSS */}
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
            margin: 6mm 8mm;
          }
          .surat-jalan-a4-page {
            page-break-after: always;
            break-after: page;
            height: 285mm !important;
            box-sizing: border-box !important;
            display: flex !important;
            flex-direction: column !important;
            justify-content: space-between !important;
          }
        }
      `}</style>

      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                Cetak Surat Jalan & Tanda Terima Pengiriman Store
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Format A4 bagi dua (Rangkap 2: Lembar 1 untuk Penerima/Toko, Lembar 2 untuk Pengirim/Gudang) • Lengkap Ceklis Fisik
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toolbar Info */}
        <div className="px-4 py-2 bg-blue-50/80 dark:bg-blue-950/40 border-b border-blue-100 dark:border-blue-900/50 flex flex-wrap items-center justify-between text-xs text-blue-900 dark:text-blue-200 gap-2">
          <span>
            Tujuan: <strong>{stores.join(', ')}</strong> ({reports.length} Laporan,{' '}
            {reports.reduce((acc, r) => acc + r.total_koli, 0)} Koli)
          </span>
          <span className="text-[11px] opacity-80 flex items-center gap-1">
            <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
            Dilengkapi kotak ceklis serah terima fisik barang
          </span>
        </div>

        {/* Live Preview Area */}
        <div className="flex-1 p-4 overflow-y-auto bg-slate-200/70 dark:bg-slate-950/70 flex justify-center">
          <div id="printable-surat-jalan-area" ref={printAreaRef} className="w-full flex flex-col items-center gap-8">
            {stores.map((storeName, pageIdx) => {
              const storeReports = storeGroups[storeName];
              const allItems = storeReports.flatMap((r) => r.items);
              const totalKoli = storeReports.reduce((acc, r) => acc + r.total_koli, 0);

              const docNo =
                trip?.id || storeReports[0]?.trip_id || storeReports[0]?.id || `SJ-${Date.now().toString().slice(-6)}`;
              const tglKirim =
                trip?.tanggal_kirim || storeReports[0]?.tanggal_kirim || storeReports[0]?.tanggal_laporan || '-';
              const driver = trip?.dikirim_oleh || storeReports[0]?.dikirim_oleh || 'Kurir Toko / Driver';
              const catatan = trip?.catatan || storeReports[0]?.catatan_kirim || '-';
              const picGudang = trip?.created_by_nama || storeReports[0]?.pic_nama || 'Admin Gudang';

              // Helper render 1 half (setengah halaman A4)
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
                          No: {docNo}
                        </div>
                      </div>
                    </div>

                    {/* Metadata Grid (Hanya memuat: Toko Tujuan, Tgl Kirim, PIC Gudang, Dikirim Oleh, Catatan, Total Muatan) */}
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
                          <span className="font-black text-black">: {totalKoli} Koli ({allItems.length} Macam Barang)</span>
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
                        {allItems.slice(0, 7).map((it, itIdx) => (
                          <tr key={it.id || itIdx} className="border-b border-slate-300">
                            <td className="border border-black px-1.5 py-1 text-center font-bold">
                              {itIdx + 1}
                            </td>
                            {/* Kotak Ceklis Fisik */}
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
                              {it.hitung_koli} Koli
                            </td>
                            <td className="border border-black px-1.5 py-1 text-slate-600 truncate">
                              {it.keterangan || '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-black border-t-2 border-black">
                          <td colSpan={4} className="border border-black px-2 py-1 text-right">
                            TOTAL KOLI PENGIRIMAN:
                          </td>
                          <td className="border border-black px-1.5 py-1 text-center">
                            {allItems.reduce((a, b) => a + Number(b.qty || 0), 0)}
                          </td>
                          <td className="border border-black px-1.5 py-1 text-center text-[9.5px]">
                            {totalKoli} Koli
                          </td>
                          <td className="border border-black px-1.5 py-1 text-center text-[8px]">
                            {allItems.length} Jenis Barang
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Footer & Tanda Tangan */}
                  <div className="mt-2 pt-1 border-t border-slate-200">
                    <div className="text-[7.5px] text-slate-500 mb-2 italic">
                      * Harap diceklis saat barang diserahterimakan. Segala ketidaksesuaian/kerusakan wajib dicatat pada lembar tanda terima ini.
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center text-[8.5px]">
                      <div>
                        <div className="font-bold text-slate-700">Dibuat Oleh (Gudang):</div>
                        <div className="h-10 border-b border-black flex items-end justify-center pb-0.5 font-bold">
                          ({picGudang})
                        </div>
                      </div>

                      <div>
                        <div className="font-bold text-slate-700">Diserahkan Oleh (Driver):</div>
                        <div className="h-10 border-b border-black flex items-end justify-center pb-0.5 font-bold">
                          ({driver})
                        </div>
                      </div>

                      <div>
                        <div className="font-bold text-slate-700">Diterima Oleh (Toko):</div>
                        <div className="h-10 border-b border-black flex items-end justify-center pb-0.5 font-bold">
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
                  key={`page-${pageIdx}`}
                  className="surat-jalan-a4-page bg-white text-black p-4 rounded-xl border border-slate-400 shadow-xl"
                  style={{
                    width: '210mm',
                    minHeight: '285mm',
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  {/* Bagian Atas: Lembar 1 untuk Penerima (Toko) */}
                  {renderHalfSheet(true)}

                  {/* Garis Potong Tengah Simetris */}
                  <div className="my-2 py-1 border-t-2 border-dashed border-slate-400 flex items-center justify-between text-[8px] text-slate-400 font-mono select-none">
                    <span>✂ Potong disini (Format A4 bagi 2)</span>
                    <span>- - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</span>
                    <span>✂ Rangkap 2 (Penerima & Pengirim)</span>
                  </div>

                  {/* Bagian Bawah: Lembar 2 untuk Pengirim (Arsip Gudang) */}
                  {renderHalfSheet(false)}
                </div>
              );
            })}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between">
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Format: <strong className="text-slate-800 dark:text-slate-200">A4 Portrait Bagi 2 (Rangkap 2 + Kotak Ceklis)</strong>
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
              className="px-5 py-2 rounded-xl text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 shadow-md shadow-blue-600/20 flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Surat Jalan ({stores.length} Lembar A4)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
