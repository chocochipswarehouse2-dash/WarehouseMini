import React, { useMemo } from 'react';
import { X, Printer } from 'lucide-react';
import { BatchBarcodePrintItem, printHtmlInHiddenIframe } from '../../utils/csvToolsUtils';

interface ChecklistPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  itemsByOutlet: Map<string, BatchBarcodePrintItem[]>;
  selectedOutlets: string[];
}

function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const ChecklistPrintModal: React.FC<ChecklistPrintModalProps> = ({
  isOpen,
  onClose,
  title,
  subtitle,
  itemsByOutlet,
  selectedOutlets,
}) => {
  const sections = useMemo(() => {
    return selectedOutlets
      .map((outlet) => {
        const items = (itemsByOutlet.get(outlet) || []).filter((it) => it.qty > 0);
        const totalPcs = items.reduce((s, it) => s + it.qty, 0);
        return { outlet, items, totalPcs };
      })
      .filter((sec) => sec.items.length > 0);
  }, [itemsByOutlet, selectedOutlets]);

  if (!isOpen) return null;

  const handlePrint = () => {
    const pagesHtml = sections
      .map((sec) => {
        const rowsHtml = sec.items
          .map(
            (it, idx) => `
            <tr>
              <td class="c">${idx + 1}</td>
              <td class="mono">${escapeHtml(it.sku)}</td>
              <td>${escapeHtml(it.name || '-')}</td>
              <td class="c">${escapeHtml(it.variant || '-')}</td>
              <td class="r b">${it.qty}</td>
              <td class="c">[ &nbsp; ]</td>
            </tr>`
          )
          .join('');
        return `
          <div class="sheet">
            <div class="header">
              <div>
                <div class="title">${escapeHtml(title)} — ${escapeHtml(sec.outlet)}</div>
                ${subtitle ? `<div class="sub">${escapeHtml(subtitle)}</div>` : ''}
              </div>
              <div class="meta">
                <div>Total SKU: <b>${sec.items.length}</b></div>
                <div>Total Qty: <b>${sec.totalPcs.toLocaleString('id-ID')} pcs</b></div>
              </div>
            </div>
            <table>
              <thead>
                <tr>
                  <th style="width:32px">No</th>
                  <th style="width:120px">SKU</th>
                  <th>Nama Produk</th>
                  <th style="width:70px">Size</th>
                  <th style="width:60px">Qty</th>
                  <th style="width:65px">Ceklis</th>
                </tr>
              </thead>
              <tbody>${rowsHtml}</tbody>
            </table>
          </div>
        `;
      })
      .join('');

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 12mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 10pt; }
    .sheet { page-break-after: always; break-after: page; }
    .sheet:last-child { page-break-after: auto; break-after: auto; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 6px; margin-bottom: 10px; }
    .title { font-size: 13pt; font-weight: 800; }
    .sub { font-size: 9pt; color: #555; margin-top: 2px; }
    .meta { text-align: right; font-size: 9.5pt; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #cbd5e1; padding: 5px 6px; font-size: 9pt; }
    th { background: #f1f5f9; text-align: left; font-weight: 700; }
    .c { text-align: center; }
    .r { text-align: right; }
    .b { font-weight: 700; }
    .mono { font-family: 'Courier New', monospace; font-weight: 700; }
  </style>
</head>
<body>${pagesHtml}</body>
</html>`;

    printHtmlInHiddenIframe(html);
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">{title}</h3>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {sections.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              Tidak ada item dengan Qty &gt; 0 pada outlet/store yang dipilih.
            </div>
          ) : (
            sections.map((sec) => (
              <div key={sec.outlet} className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <span className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white">{sec.outlet}</span>
                  <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    {sec.items.length} SKU • {sec.totalPcs.toLocaleString('id-ID')} pcs
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50/60 dark:bg-slate-800/30 text-slate-500">
                      <tr>
                        <th className="py-2 px-3 text-left w-10">No</th>
                        <th className="py-2 px-3 text-left">SKU</th>
                        <th className="py-2 px-3 text-left">Nama Produk</th>
                        <th className="py-2 px-3 text-center">Size</th>
                        <th className="py-2 px-3 text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sec.items.map((it, idx) => (
                        <tr key={`${sec.outlet}-${it.sku}-${idx}`}>
                          <td className="py-1.5 px-3 text-slate-400">{idx + 1}</td>
                          <td className="py-1.5 px-3 font-mono font-bold text-slate-800 dark:text-slate-100">{it.sku}</td>
                          <td className="py-1.5 px-3 text-slate-700 dark:text-slate-300">{it.name}</td>
                          <td className="py-1.5 px-3 text-center text-slate-500">{it.variant || '-'}</td>
                          <td className="py-1.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">{it.qty}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="px-4 sm:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200"
          >
            Tutup
          </button>
          <button
            type="button"
            disabled={sections.length === 0}
            onClick={handlePrint}
            className="px-5 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 disabled:opacity-50"
          >
            <Printer className="w-4 h-4" />
            <span>Cetak A4 Sekarang</span>
          </button>
        </div>
      </div>
    </div>
  );
};
