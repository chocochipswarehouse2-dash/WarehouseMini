import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Printer,
  FileText,
  LayoutGrid,
  Rows3,
  Check,
  CheckSquare,
  Square,
  Layers,
  Image as ImageIcon,
  BookOpen,
  Filter,
} from 'lucide-react';
import { KatalogBatch, KatalogItem } from '../../types';

interface KatalogA4PrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  batches?: KatalogBatch[];
  initialSelectedBatchIds?: string[];
  items?: KatalogItem[];
  catalogNames?: string[];
}

export const KatalogA4PrintModal: React.FC<KatalogA4PrintModalProps> = ({
  isOpen,
  onClose,
  batches = [],
  initialSelectedBatchIds,
  items: fallbackItems,
  catalogNames: fallbackCatalogNames,
}) => {
  const [layoutMode, setLayoutMode] = useState<'grid4' | 'grid2'>('grid4'); // 4 produk per lembar vs 2 produk per lembar
  const [showVariantsTable, setShowVariantsTable] = useState(true);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);
  const [pageBreakPerCatalog, setPageBreakPerCatalog] = useState(false);

  // Inisialisasi pilihan katalog saat modal dibuka
  useEffect(() => {
    if (isOpen) {
      if (initialSelectedBatchIds && initialSelectedBatchIds.length > 0) {
        setSelectedBatchIds(initialSelectedBatchIds);
      } else if (batches.length > 0) {
        setSelectedBatchIds(batches.map((b) => b.id));
      } else {
        setSelectedBatchIds([]);
      }
    }
  }, [isOpen, initialSelectedBatchIds, batches]);

  // Daftar batch yang dipilih
  const activeBatches = useMemo(() => {
    if (batches.length > 0) {
      return batches.filter((b) => selectedBatchIds.includes(b.id));
    }
    return [];
  }, [batches, selectedBatchIds]);

  // Semua items dari katalog terpilih
  const printableItems: KatalogItem[] = useMemo(() => {
    if (batches.length > 0) {
      return activeBatches.flatMap((b) =>
        b.items.map((it) => ({
          ...it,
          catalog_name: it.catalog_name || b.name,
        }))
      );
    }
    return fallbackItems || [];
  }, [batches, activeBatches, fallbackItems]);

  const activeCatalogNames: string[] = useMemo(() => {
    if (batches.length > 0) {
      return activeBatches.map((b) => b.name);
    }
    return fallbackCatalogNames || ['Katalog Produk'];
  }, [batches, activeBatches, fallbackCatalogNames]);

  // Helper toggle selection
  const toggleBatchSelect = (batchId: string) => {
    setSelectedBatchIds((prev) => {
      if (prev.includes(batchId)) {
        if (prev.length === 1) return prev; // Pertahankan minimal 1 terpilih
        return prev.filter((id) => id !== batchId);
      } else {
        return [...prev, batchId];
      }
    });
  };

  const handleSelectAll = () => {
    setSelectedBatchIds(batches.map((b) => b.id));
  };

  const totalVariants = useMemo(() => {
    return printableItems.reduce((sum, it) => sum + (it.variants?.length || 0), 0);
  }, [printableItems]);

  const totalQty = useMemo(() => {
    return printableItems.reduce(
      (sum, it) => sum + (it.variants?.reduce((vSum, v) => vSum + (v.qty || 0), 0) || 0),
      0
    );
  }, [printableItems]);

  if (!isOpen) return null;

  const escapeHtml = (str: string) => {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  };

  const handlePrint = () => {
    if (printableItems.length === 0) return;

    // Helper membuat kartu produk
    const renderCardHtml = (prod: KatalogItem, idx: number) => {
      const totalVarian = prod.variants?.length || 0;
      const totalStok = prod.variants?.reduce((s, v) => s + (v.qty || 0), 0) || 0;

      let variantRows = '';
      if (showVariantsTable && prod.variants && prod.variants.length > 0) {
        variantRows = `
          <div style="margin-top: 2mm; border-top: 0.5px solid #ddd; padding-top: 1.5mm;">
            <table style="width: 100%; font-size: 7.5pt; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="border-bottom: 1px solid #ccc; color: #555;">
                  <th style="padding: 1px 0;">Warna</th>
                  <th style="padding: 1px 0;">Size</th>
                  <th style="padding: 1px 0;">SKU</th>
                  <th style="padding: 1px 0; text-align: right;">Qty</th>
                </tr>
              </thead>
              <tbody>
                ${prod.variants
                  .map(
                    (v) => `
                  <tr style="border-bottom: 0.5px solid #eee;">
                    <td style="padding: 1px 0; font-weight: 600;">${escapeHtml(v.warna || '-')}</td>
                    <td style="padding: 1px 0;">${escapeHtml(v.size || 'Default')}</td>
                    <td style="padding: 1px 0; font-family: monospace; font-weight: bold;">${escapeHtml(v.sku || '-')}</td>
                    <td style="padding: 1px 0; text-align: right; font-weight: bold;">${v.qty}</td>
                  </tr>
                `
                  )
                  .join('')}
              </tbody>
            </table>
          </div>
        `;
      }

      const imgTag = prod.image_url
        ? `<img src="${prod.image_url}" alt="${escapeHtml(prod.deskripsi)}" style="width: 24mm; height: 30mm; object-fit: cover; border-radius: 3px; border: 1px solid #ddd;" />`
        : `<div style="width: 24mm; height: 30mm; background: #f3f4f6; border-radius: 3px; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; font-size: 7pt; color: #888;">No Photo</div>`;

      return `
        <div class="product-card">
          <div class="card-header">
            <span class="catalog-tag">Katalog ${escapeHtml(prod.catalog_name || '325 B')}</span>
            <span class="nomor-tag">#${escapeHtml(prod.nomor || String(idx + 1))}</span>
          </div>
          <div class="card-body">
            ${imgTag}
            <div class="card-info">
              <div class="product-name">${escapeHtml(prod.deskripsi)}</div>
              <div class="product-price">Rp ${escapeHtml(String(prod.price || '-'))}</div>
              <div class="product-meta">${totalVarian} Varian • Total ${totalStok} pcs</div>
            </div>
          </div>
          ${variantRows}
        </div>
      `;
    };

    let contentHtml = '';

    if (pageBreakPerCatalog && activeBatches.length > 0) {
      // Grouping per katalog dengan page break antar katalog
      contentHtml = activeBatches
        .map((batch, bIdx) => {
          const batchVariants = batch.items.reduce((s, it) => s + (it.variants?.length || 0), 0);
          const batchQty = batch.items.reduce(
            (s, it) => s + (it.variants?.reduce((vSum, v) => vSum + (v.qty || 0), 0) || 0),
            0
          );
          const cards = batch.items
            .map((prod, pIdx) => renderCardHtml({ ...prod, catalog_name: batch.name }, pIdx))
            .join('');

          return `
            <div class="catalog-section" style="${bIdx > 0 ? 'page-break-before: always; break-before: page;' : ''}">
              <div class="page-header">
                <div>
                  <div class="title">Katalog Produk WMS</div>
                  <div class="subtitle">Koleksi: <strong>${escapeHtml(batch.name)}</strong> • Total ${batch.items.length} Produk (${batchVariants} Varian • ${batchQty} pcs)</div>
                </div>
                <div class="date">
                  ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                </div>
              </div>
              <div class="grid-container">
                ${cards}
              </div>
            </div>
          `;
        })
        .join('');
    } else {
      // Continuous grid untuk seluruh item katalog terpilih
      const cards = printableItems.map((prod, idx) => renderCardHtml(prod, idx)).join('');
      contentHtml = `
        <div class="page-header">
          <div>
            <div class="title">Katalog Produk WMS</div>
            <div class="subtitle">Koleksi: <strong>${escapeHtml(activeCatalogNames.join(', ')) || 'Semua'}</strong> • Total ${printableItems.length} Produk (${totalVariants} Varian • ${totalQty} pcs)</div>
          </div>
          <div class="date">
            ${new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>
        <div class="grid-container">
          ${cards}
        </div>
      `;
    }

    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <title>Cetak Katalog Produk WMS</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 10mm !important;
            }
            *, *::before, *::after {
              box-sizing: border-box !important;
              margin: 0;
              padding: 0;
            }
            body {
              font-family: Arial, Helvetica, sans-serif !important;
              color: #000000 !important;
              background: #ffffff !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .page-header {
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              border-bottom: 2px solid #000000 !important;
              padding-bottom: 3mm !important;
              margin-bottom: 4mm !important;
            }
            .title {
              font-size: 15pt !important;
              font-weight: 900 !important;
              text-transform: uppercase !important;
            }
            .subtitle {
              font-size: 8.5pt !important;
              color: #444444 !important;
              margin-top: 1mm !important;
            }
            .date {
              font-size: 8.5pt !important;
              font-weight: bold !important;
              color: #333333 !important;
              text-align: right !important;
            }
            .grid-container {
              display: grid !important;
              grid-template-columns: ${layoutMode === 'grid4' ? '1fr 1fr' : '1fr'} !important;
              gap: 4mm !important;
            }
            .product-card {
              border: 1px solid #999999 !important;
              border-radius: 4px !important;
              padding: 3mm !important;
              background: #ffffff !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
            .card-header {
              display: flex !important;
              justify-content: space-between !important;
              align-items: center !important;
              border-bottom: 1px solid #cccccc !important;
              padding-bottom: 1.5mm !important;
              margin-bottom: 2mm !important;
            }
            .catalog-tag {
              font-size: 8pt !important;
              font-weight: 900 !important;
              background: #000000 !important;
              color: #ffffff !important;
              padding: 1px 5px !important;
              border-radius: 3px !important;
              text-transform: uppercase !important;
            }
            .nomor-tag {
              font-size: 8.5pt !important;
              font-family: monospace !important;
              font-weight: bold !important;
              color: #555555 !important;
            }
            .card-body {
              display: flex !important;
              gap: 3mm !important;
            }
            .card-info {
              flex: 1 !important;
              min-width: 0 !important;
            }
            .product-name {
              font-size: 10pt !important;
              font-weight: 900 !important;
              color: #000000 !important;
              line-height: 1.2 !important;
            }
            .product-price {
              font-size: 9pt !important;
              font-weight: bold !important;
              color: #047857 !important;
              margin-top: 1mm !important;
            }
            .product-meta {
              font-size: 7.5pt !important;
              color: #555555 !important;
              margin-top: 0.5mm !important;
            }
          </style>
        </head>
        <body>
          ${contentHtml}
        </body>
      </html>
    `;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '-9999px';
    iframe.style.left = '-9999px';
    iframe.style.width = '210mm';
    iframe.style.height = '297mm';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document;
    if (!doc) return;

    doc.open();
    doc.write(fullHtml);
    doc.close();

    setTimeout(() => {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (document.body.contains(iframe)) {
          document.body.removeChild(iframe);
        }
      }, 2000);
    }, 300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[94vh] rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Dialog */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <span>Cetak Katalog Produk</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 font-semibold">
                  Multi-Katalog
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pilih satu atau lebih katalog untuk dicetak ke format A4 / PDF.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Pilihan Multi-Katalog (Checkboxes & Badge Pills) */}
        {batches.length > 0 && (
          <div className="px-6 py-3 bg-blue-50/50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                <Filter className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                <span>Pilih Katalog yang Ingin Dicetak ({selectedBatchIds.length}/{batches.length} Terpilih):</span>
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  Pilih Semua Katalog
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {batches.map((b) => {
                const isSelected = selectedBatchIds.includes(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => toggleBatchSelect(b.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border ${
                      isSelected
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                    }`}
                  >
                    {isSelected ? (
                      <CheckSquare className="w-4 h-4 text-white shrink-0" />
                    ) : (
                      <Square className="w-4 h-4 text-slate-400 shrink-0" />
                    )}
                    <span>Katalog {b.name}</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                        isSelected
                          ? 'bg-blue-700/80 text-white'
                          : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {b.items.length} produk
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Toolbar Pengaturan Format & Opsi */}
        <div className="px-6 py-3 bg-slate-100/70 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <span className="font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
              Tata Letak:
            </span>
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
                <span>4 Produk / Lembar (Grid 2x2)</span>
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
                <span>2 Produk / Lembar (Format Besar)</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={showVariantsTable}
                onChange={(e) => setShowVariantsTable(e.target.checked)}
                className="rounded text-blue-600 focus:ring-blue-500"
              />
              <span>Tabel Rincian Varian (Warna, Size, SKU, Qty)</span>
            </label>

            {activeBatches.length > 1 && (
              <label className="flex items-center gap-2 cursor-pointer font-semibold text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={pageBreakPerCatalog}
                  onChange={(e) => setPageBreakPerCatalog(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500"
                />
                <span>Halaman Baru Per Katalog (Page Break)</span>
              </label>
            )}
          </div>
        </div>

        {/* Preview A4 Container */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-200 dark:bg-slate-950/80 flex justify-center">
          {printableItems.length === 0 ? (
            <div className="p-12 text-center text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 my-auto">
              <BookOpen className="w-12 h-12 mx-auto mb-2 text-slate-400" />
              <p className="font-bold text-sm">Tidak ada katalog yang dipilih</p>
              <p className="text-xs mt-1">Silakan centang minimal satu katalog di atas untuk dicetak.</p>
            </div>
          ) : (
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
                        Koleksi:{' '}
                        <strong className="text-slate-900">
                          {activeCatalogNames.join(', ') || 'Semua Katalog'}
                        </strong>
                      </p>
                    </div>
                  </div>
                  <div className="text-right text-xs text-slate-600">
                    <p className="font-bold text-slate-900">
                      {new Date().toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })}
                    </p>
                    <p>
                      {printableItems.length} Model • {totalVariants} Varian • Total {totalQty} pcs
                    </p>
                  </div>
                </div>

                {/* Grid Produk di A4 */}
                <div
                  className={`grid gap-4 ${
                    layoutMode === 'grid4' ? 'grid-cols-2' : 'grid-cols-1'
                  }`}
                >
                  {printableItems.map((prod, pIdx) => (
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
                                    <td className="py-0.5 font-mono text-slate-600 font-semibold">
                                      {v.sku || '-'}
                                    </td>
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
                <span>
                  Dicetak {new Date().toLocaleDateString('id-ID')} • {printableItems.length} Produk
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Modal */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/60">
          <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
            Siap mencetak <strong>{printableItems.length}</strong> produk dari{' '}
            <strong>{activeCatalogNames.length}</strong> katalog ({totalVariants} varian, {totalQty} pcs)
          </div>

          <div className="flex items-center gap-3">
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
              disabled={printableItems.length === 0}
              className="px-6 py-2.5 text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Cetak Katalog ({printableItems.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
