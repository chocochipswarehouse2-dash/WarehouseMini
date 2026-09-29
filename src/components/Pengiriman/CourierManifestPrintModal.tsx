import React, { useRef } from 'react';
import { Printer, X, Download, Package, CheckCircle2 } from 'lucide-react';
import { RiwayatHandoverPaket } from '../../types';

interface CourierManifestPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  manifest: RiwayatHandoverPaket | null;
}

export const CourierManifestPrintModal: React.FC<CourierManifestPrintModalProps> = ({
  isOpen,
  onClose,
  manifest,
}) => {
  const printContainerRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !manifest) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#101726] rounded-2xl max-w-3xl w-full border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[95vh] overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded-xl">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Cetak Lembar Manifest Serah Terima
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                {manifest.no_manifest} • {manifest.ekspedisi}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-md shadow-blue-600/25 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak / Print</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white rounded-xl cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Modal Body / Printable Area */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100 dark:bg-slate-950">
          <div
            ref={printContainerRef}
            id="courier-manifest-print-area"
            className="bg-white text-slate-900 p-6 sm:p-8 rounded-xl shadow-md border border-slate-200 max-w-2xl mx-auto text-xs space-y-6 print:shadow-none print:border-none print:p-0 print:m-0"
          >
            {/* Header Manifest */}
            <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between">
              <div>
                <h1 className="text-xl font-black uppercase tracking-wider text-slate-900">
                  BUKTI SERAH TERIMA PAKET (MANIFEST)
                </h1>
                <p className="text-xs text-slate-600 font-semibold">
                  WMS LOGISTICS & WAREHOUSE DISPATCH
                </p>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded border border-slate-300 inline-block">
                  {manifest.no_manifest}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Tgl: {manifest.tgl_kirim} | Jam: {manifest.waktu_handover || '-'}
                </div>
              </div>
            </div>

            {/* Info Section */}
            <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-lg border border-slate-200">
              <div className="space-y-1">
                <div>
                  <span className="text-slate-500 text-[11px]">Jasa Ekspedisi / Kurir:</span>
                  <p className="font-extrabold text-sm text-blue-700">{manifest.ekspedisi}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Nama Driver / Kurir Pick Up:</span>
                  <p className="font-bold">{manifest.driver_kurir || '-'}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Nomor Kendaraan:</span>
                  <p className="font-mono font-bold">{manifest.no_kendaraan || '-'}</p>
                </div>
              </div>
              <div className="space-y-1 text-right sm:text-left">
                <div>
                  <span className="text-slate-500 text-[11px]">Total Jumlah Paket:</span>
                  <p className="font-black text-base text-slate-900">
                    {manifest.total_paket} Paket (Koli/Pcs)
                  </p>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Petugas Warehouse (PIC):</span>
                  <p className="font-bold">{manifest.pic_nama}</p>
                </div>
                <div>
                  <span className="text-slate-500 text-[11px]">Keterangan:</span>
                  <p className="italic text-slate-600">{manifest.keterangan || '-'}</p>
                </div>
              </div>
            </div>

            {/* Resi Items List */}
            <div className="space-y-2">
              <div className="flex items-center justify-between border-b border-slate-300 pb-1">
                <span className="font-extrabold uppercase text-[11px] text-slate-800">
                  Rincian Nomor Resi / Tracking Number ({manifest.resi_list.length} item)
                </span>
                <span className="text-[10px] text-slate-500">Urut berdasarkan urutan scan</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {manifest.resi_list.map((resi, index) => (
                  <div
                    key={index}
                    className="p-2 bg-slate-50 border border-slate-200 rounded font-mono text-xs flex items-center justify-between"
                  >
                    <span className="text-slate-400 font-sans text-[10px] font-bold w-5">
                      {index + 1}.
                    </span>
                    <span className="font-bold text-slate-900 tracking-wider flex-1 text-center">
                      {resi}
                    </span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  </div>
                ))}
              </div>
            </div>

            {/* Signature Box */}
            <div className="pt-6 border-t-2 border-slate-900 grid grid-cols-2 gap-8">
              <div className="text-center space-y-16">
                <p className="text-[11px] font-bold text-slate-700">Diserahkan Oleh (Warehouse WMS)</p>
                <div className="border-t border-dashed border-slate-400 pt-1">
                  <p className="font-bold">{manifest.pic_nama}</p>
                  <p className="text-[10px] text-slate-500">Petugas Dispatch</p>
                </div>
              </div>

              <div className="text-center space-y-16">
                <p className="text-[11px] font-bold text-slate-700">Diterima Oleh (Kurir Ekspedisi)</p>
                <div className="border-t border-dashed border-slate-400 pt-1">
                  <p className="font-bold">{manifest.driver_kurir || '.....................................'}</p>
                  <p className="text-[10px] text-slate-500">Kurir / Driver Pick Up</p>
                </div>
              </div>
            </div>

            {/* Footer Notice */}
            <div className="text-center text-[10px] text-slate-400 pt-2 italic">
              Dokumen ini adalah bukti serah terima resmi barang antara Warehouse dan pihak Ekspedisi.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
