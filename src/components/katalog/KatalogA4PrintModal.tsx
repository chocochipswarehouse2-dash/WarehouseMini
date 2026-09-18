import React, { useState } from 'react';
import { X, Printer, FileText, LayoutGrid, Rows3, Check, Layers, Image as ImageIcon } from 'lucide-react';
import { KatalogItem } from '../../types';

interface KatalogA4PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: KatalogItem[];
  catalogNames: string[];
}

export const KatalogA4PrintModal: React.FC<KatalogA4PrintModalProps> = ({
  isOpen,
  onClose,
  items,
  catalogNames,
}) => {
  const [layoutMode, setLayoutMode] = useState<'grid4' | 'grid2'>('grid4'); // 4 produk per lembar vs 2 produk per lembar
  const [showVariantsTable, setShowVariantsTable] = useState(true);

  if (!isOpen) return null;

  const handlePrint = () => {
    window.print();
  };

  const totalVariants = items.reduce((sum, it) => sum + (it.variants?.length || 0), 0);
  const totalQty = items.reduce(
    (sum, it) => sum + (it.variants?.reduce((vSum, v) => vSum + (v.qty || 0), 0) || 0),
    0
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[94vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Dialog */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>Cetak Katalog Format Standar A4</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold">
                  A4 Portrait Layout
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Katalog: <strong className="text-slate-700 dark:text-slate-300">{catalogNames.join(', ') || 'Semua'}</strong> •{' '}
                {items.length} Produk • {totalVariants} Varian • Total {totalQty} pcs
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

        {/* Toolbar Pengaturan Format */}
        <div className="px-6 py-3 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-4">
            <span className="font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Format Halaman:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setLayoutMode('grid4')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold transition-all cursor-pointer ${
                  layoutMode === 'grid4'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>4 Produk / Halaman (Grid 2x2)</span>
              </button>
              <button
                type="button"
                onClick={() => setLayoutMode('grid2')}
                className={`px-3 py-1.5 rounded-lg flex items-center gap-1.5 font-semibold transition-all cursor-pointer ${
                  layoutMode === 'grid2'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-600'
                }`}
              >
                <Rows3 className="w-3.5 h-3.5" />
                <span>2 Produk / Halaman (Format Besar)</span>
              </button>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={showVariantsTable}
              onChange={(e) => setShowVariantsTable(e.target.checked)}
              className="rounded text-blue-600 focus:ring-blue-500"
            />
            <span>Sertakan Tabel Rincian Varian (Warna, Size, SKU, Qty)</span>
          </label>
        </div>

        {/* Preview A4 Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-200 dark:bg-slate-950/80 flex justify-center">
          <div className="w-[210mm] min-h-[297mm] bg-white text-black shadow-2xl p-[12mm] box-border font-sans transition-all flex flex-col justify-between">
            {/* Header Cetak A4 */}
            <div>
              <div className="flex items-center justify-between border-b-2 border-slate-900 pb-3 mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center font-black text-lg">
                    CC
                  </div>
                  <div>
                    <h1 className="text-xl font-black tracking-tight text-slate-900 uppercase">
                      Katalog Produk WMS
                    </h1>
                    <p className="text-xs text-slate-600 font-medium">
                      Koleksi: <strong className="text-slate-900">{catalogNames.join(', ') || 'Semua Katalog'}</strong>
                    </p>
                  </div>
                </div>
                <div className="text-right text-xs text-slate-600">
                  <p className="font-bold text-slate-900">
                    {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                  <p>{items.length} Model • {totalVariants} Varian</p>
                </div>
              </div>

              {/* Grid Produk di A4 */}
              <div
                className={`grid gap-4 ${
                  layoutMode === 'grid4' ? 'grid-cols-2' : 'grid-cols-1'
                }`}
              >
                {items.map((prod, pIdx) => (
                  <div
                    key={prod.id || pIdx}
                    className="border border-slate-300 rounded-lg p-3 bg-white flex flex-col justify-between page-break-inside-avoid"
                  >
                    <div>
                      {/* Badge Katalog & Nomor */}
                      <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-slate-200">
                        <span className="px-2 py-0.5 rounded text-[10px] font-black tracking-wide bg-slate-900 text-white uppercase">
                          Katalog {prod.catalog_name || '325 B'}
                        </span>
                        <span className="text-xs font-mono font-bold text-slate-500">
                          #{prod.nomor || pIdx + 1}
                        </span>
                      </div>

                      {/* Konten Produk: Foto + Nama + Harga */}
                      <div className="flex gap-3">
                        {/* Foto Produk */}
                        <div className="w-24 h-28 shrink-0 bg-slate-100 rounded-md border border-slate-200 overflow-hidden flex items-center justify-center">
                          {prod.image_url ? (
                            <img
                              src={prod.image_url}
                              alt={prod.deskripsi}
                              className="w-full h-full object-cover object-top"
                              crossOrigin="anonymous"
                            />
                          ) : (
                            <div className="text-center text-slate-400 p-2">
                              <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-50" />
                              <span className="text-[9px]">Tanpa Foto</span>
                            </div>
                          )}
                        </div>

                        {/* Nama & Harga */}
                        <div className="flex-1 min-w-0">
                          <h2 className="text-sm font-black text-slate-900 leading-tight">
                            {prod.deskripsi}
                          </h2>
                          <div className="text-xs font-black text-emerald-700 mt-1">
                            Rp {prod.price || '-'}
                          </div>
                          <div className="text-[10px] text-slate-500 mt-1">
                            {prod.variants?.length || 0} Varian • Total{' '}
                            {prod.variants?.reduce((s, v) => s + (v.qty || 0), 0) || 0} pcs
                          </div>
                        </div>
                      </div>

                      {/* Tabel Rincian Varian jika dicentang */}
                      {showVariantsTable && prod.variants && prod.variants.length > 0 && (
                        <div className="mt-2.5 pt-2 border-t border-slate-200">
                          <table className="w-full text-left text-[9px] border-collapse">
                            <thead>
                              <tr className="border-b border-slate-300 text-slate-500 font-bold uppercase">
                                <th className="py-0.5">Warna</th>
                                <th className="py-0.5">Size</th>
                                <th className="py-0.5">SKU</th>
                                <th className="py-0.5 text-right">Qty</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {prod.variants.map((v, vIdx) => (
                                <tr key={vIdx} className="text-slate-800">
                                  <td className="py-0.5 font-medium">{v.warna || '-'}</td>
                                  <td className="py-0.5">{v.size || 'Default'}</td>
                                  <td className="py-0.5 font-mono text-slate-600 font-semibold">{v.sku || '-'}</td>
                                  <td className="py-0.5 text-right font-bold">{v.qty}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer A4 */}
            <div className="mt-6 pt-2 border-t border-slate-300 flex items-center justify-between text-[9px] text-slate-500">
              <span>Chocochips WMS • Dokumen Katalog Resmi Gudang & Retail</span>
              <span>Halaman 1</span>
            </div>
          </div>
        </div>

        {/* Footer Modal */}
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
            className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak Dokumen A4 / Simpan PDF</span>
          </button>
        </div>
      </div>

      {/* HIDDEN PRINT-ONLY CONTAINER (FOR WINDOW.PRINT A4) */}
      <div id="katalog-a4-print-area" className="hidden print:block">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * {
              visibility: hidden !important;
            }
            #katalog-a4-print-area, #katalog-a4-print-area * {
              visibility: visible !important;
            }
            #katalog-a4-print-area {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              background: white !important;
              color: black !important;
            }
            @page {
              size: A4 portrait;
              margin: 10mm;
            }
            .page-break-inside-avoid {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        `}} />

        <div style={{ width: '100%', fontFamily: 'Arial, sans-serif', color: 'black' }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid black', paddingBottom: '3mm', marginBottom: '4mm' }}>
            <div>
              <h1 style={{ fontSize: '16pt', fontWeight: '900', margin: 0, textTransform: 'uppercase' }}>
                Katalog Produk WMS
              </h1>
              <div style={{ fontSize: '9pt', color: '#444', marginTop: '1mm' }}>
                Koleksi: <strong>{catalogNames.join(', ') || 'Semua'}</strong> • Total {items.length} Produk ({totalVariants} Varian)
              </div>
            </div>
            <div style={{ textAlign: 'right', fontSize: '9pt', color: '#444' }}>
              <strong>{new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
            </div>
          </div>

          {/* Grid Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: layoutMode === 'grid4' ? '1fr 1fr' : '1fr',
            gap: '4mm',
          }}>
            {items.map((prod, idx) => (
              <div
                key={idx}
                className="page-break-inside-avoid"
                style={{
                  border: '1px solid #999',
                  borderRadius: '4px',
                  padding: '3mm',
                  background: 'white',
                  marginBottom: '2mm',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #ccc', paddingBottom: '1.5mm', marginBottom: '2mm' }}>
                  <span style={{ fontSize: '8pt', fontWeight: '900', background: '#000', color: '#fff', padding: '1px 5px', borderRadius: '3px', textTransform: 'uppercase' }}>
                    Katalog {prod.catalog_name || '325 B'}
                  </span>
                  <span style={{ fontSize: '8.5pt', fontFamily: 'monospace', fontWeight: 'bold', color: '#666' }}>
                    #{prod.nomor || idx + 1}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '3mm' }}>
                  {prod.image_url ? (
                    <img
                      src={prod.image_url}
                      alt={prod.deskripsi}
                      style={{ width: '22mm', height: '28mm', objectFit: 'cover', borderRadius: '3px', border: '1px solid #ddd' }}
                    />
                  ) : (
                    <div style={{ width: '22mm', height: '28mm', background: '#eee', borderRadius: '3px', border: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '7pt', color: '#888' }}>
                      No Photo
                    </div>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '10.5pt', fontWeight: '900', color: '#000', lineHeight: 1.2 }}>
                      {prod.deskripsi}
                    </div>
                    <div style={{ fontSize: '9.5pt', fontWeight: 'bold', color: '#047857', marginTop: '1mm' }}>
                      Rp {prod.price || '-'}
                    </div>
                    <div style={{ fontSize: '8pt', color: '#555', marginTop: '0.5mm' }}>
                      {prod.variants?.length || 0} Varian • Total {prod.variants?.reduce((s, v) => s + (v.qty || 0), 0) || 0} pcs
                    </div>
                  </div>
                </div>

                {showVariantsTable && prod.variants && prod.variants.length > 0 && (
                  <div style={{ marginTop: '2.5mm', borderTop: '0.5px solid #ddd', paddingTop: '1.5mm' }}>
                    <table style={{ width: '100%', fontSize: '7.5pt', borderCollapse: 'collapse', textAlign: 'left' }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #ccc', color: '#666' }}>
                          <th style={{ padding: '1px 0' }}>Warna</th>
                          <th style={{ padding: '1px 0' }}>Size</th>
                          <th style={{ padding: '1px 0' }}>SKU</th>
                          <th style={{ padding: '1px 0', textAlign: 'right' }}>Qty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {prod.variants.map((v, vIdx) => (
                          <tr key={vIdx} style={{ borderBottom: '0.5px solid #eee' }}>
                            <td style={{ padding: '1px 0', fontWeight: '500' }}>{v.warna || '-'}</td>
                            <td style={{ padding: '1px 0' }}>{v.size || 'Default'}</td>
                            <td style={{ padding: '1px 0', fontFamily: 'monospace', fontWeight: 'bold' }}>{v.sku || '-'}</td>
                            <td style={{ padding: '1px 0', textAlign: 'right', fontWeight: 'bold' }}>{v.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
