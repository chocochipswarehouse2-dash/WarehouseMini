import React, { useMemo } from 'react';
import {
  Package,
  ZoomIn,
  Edit,
  Camera,
  Trash2,
  Eye,
  EyeOff,
  QrCode,
  Play,
} from 'lucide-react';
import {
  ProductItem,
  PenerimaanProduksiItem,
} from '../../types';

export interface ProductCardGroup {
  kode_produksi: string;
  foto_url?: string;
  warnas: string[];
  keterangan?: string;
  items: PenerimaanProduksiItem[];
  totalQty: number;
}

export interface SuratJalanGroupInfo {
  no_surat_jalan: string;
  kategori: string;
  tanggal_penerimaan: string;
  keterangan?: string;
}

interface PenerimaanProductCardItemProps {
  prod: ProductCardGroup;
  group: SuratJalanGroupInfo;
  productCatalog?: ProductItem[];
  isTableVisible: boolean;
  onToggleTable: () => void;
  onPrintBarcode: () => void;
  onOpenLightbox: () => void;
  onEditProduct: () => void;
  onDeleteProduct: () => void;
  onDeleteVariant: (item: PenerimaanProduksiItem) => void;
  onOpenQcJob?: (kodeProduksi: string, noSuratJalan: string) => void;
}

export const PenerimaanProductCardItem: React.FC<PenerimaanProductCardItemProps> = ({
  prod,
  group,
  productCatalog,
  isTableVisible,
  onToggleTable,
  onPrintBarcode,
  onOpenLightbox,
  onEditProduct,
  onDeleteProduct,
  onDeleteVariant,
  onOpenQcJob,
}) => {
  // Cari produk katalog yang cocok untuk mengambil nama produk asli & harga jual jika ada
  const matchedProduct = useMemo(() => {
    if (!productCatalog || productCatalog.length === 0) return undefined;
    const cleanCode = prod.kode_produksi.trim().toUpperCase();
    return productCatalog.find((p) => {
      const pSku = typeof p.k === 'string' ? p.k : typeof p.sku === 'string' ? (p.sku as string) : '';
      const pCode = typeof p.kode_produksi === 'string' ? (p.kode_produksi as string) : '';
      return (
        (pCode && pCode.trim().toUpperCase() === cleanCode) ||
        (pSku && pSku.trim().toUpperCase() === cleanCode)
      );
    });
  }, [productCatalog, prod.kode_produksi]);

  const productName: string =
    matchedProduct && typeof matchedProduct.nama_produk === 'string'
      ? matchedProduct.nama_produk
      : matchedProduct && typeof matchedProduct.n === 'string'
      ? matchedProduct.n
      : prod.kode_produksi;

  const productPrice =
    matchedProduct && typeof matchedProduct.harga_jual === 'number'
      ? matchedProduct.harga_jual
      : matchedProduct && typeof matchedProduct.price === 'number'
      ? matchedProduct.price
      : undefined;

  return (
    <div
      id={`prod-card-${group.no_surat_jalan}-${prod.kode_produksi}`}
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group relative h-[560px]"
    >
      {/* BAGIAN ATAS: Header Bar, Foto, Info Produk */}
      <div className="flex flex-col shrink-0">
        {/* BARIS HEADER KARTU (Sama persis seperti Katalog Produk) */}
        <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/70 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 h-11 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="px-2 py-0.5 rounded-md text-[11px] font-black uppercase tracking-wider bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shrink-0 shadow-2xs">
              SJ {group.no_surat_jalan}
            </span>
            <span className="px-1.5 py-0.5 rounded-md text-xs font-mono font-bold bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 shrink-0 truncate max-w-[120px]">
              #{prod.kode_produksi}
            </span>
          </div>

          {/* Tombol Aksi di Baris Atas: Edit & Foto */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              id={`btn-edit-head-${prod.kode_produksi}`}
              type="button"
              onClick={onEditProduct}
              className="px-2 py-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              title="Edit Surat Jalan & Produk ini"
            >
              <Edit className="w-3.5 h-3.5" />
              <span>Edit</span>
            </button>
            <button
              id={`btn-foto-head-${prod.kode_produksi}`}
              type="button"
              onClick={onOpenLightbox}
              className="px-2 py-1 text-xs font-semibold text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              title="Perbesar / Lihat Foto Produk"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Foto</span>
            </button>
          </div>
        </div>

        {/* CONTAINER GAMBAR PRODUK (aspect 4:3 / fixed h-44 dengan overlay Fullscreen) */}
        <div
          id={`img-wrap-${prod.kode_produksi}`}
          onClick={onOpenLightbox}
          className="relative h-44 w-full bg-slate-100 dark:bg-slate-800/60 overflow-hidden border-b border-slate-100 dark:border-slate-800 flex items-center justify-center cursor-zoom-in group/img shrink-0"
          title="Klik foto untuk melihat tampilan penuh"
        >
          {prod.foto_url ? (
            <img
              src={prod.foto_url}
              alt={prod.kode_produksi}
              className="w-full h-full object-cover object-top transition-transform duration-300 group-hover/img:scale-105"
              crossOrigin="anonymous"
              loading="lazy"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-slate-400 p-4">
              <Package className="w-10 h-10 mb-1 opacity-50" />
              <span className="text-xs font-semibold">Foto Belum Tersedia</span>
            </div>
          )}

          {/* Hover Overlay: Buka Fullscreen */}
          <div className="absolute inset-0 bg-black/25 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center gap-1.5 text-white pointer-events-none">
            <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-xs text-xs font-semibold flex items-center gap-1.5 shadow-md">
              <ZoomIn className="w-3.5 h-3.5" />
              <span>Buka Fullscreen</span>
            </span>
          </div>

          {/* Badge Total Pcs di pojok kanan atas foto */}
          <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none">
            <span className="px-2.5 py-1 rounded-full bg-emerald-600/95 text-white font-black text-xs shadow-md border border-emerald-400/40 backdrop-blur-xs">
              {prod.totalQty.toLocaleString()} pcs
            </span>
          </div>
        </div>

        {/* Info Nama Produk, Kategori, & Tombol Barcode */}
        <div className="px-3.5 pt-3 pb-2 space-y-2 shrink-0">
          <div className="flex items-start justify-between gap-2.5">
            <div className="min-w-0 flex-1">
              <h3
                className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug truncate"
                title={productName}
              >
                {productName}
              </h3>
              <div className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">
                {productPrice !== undefined
                  ? `Rp ${Number(productPrice).toLocaleString('id-ID')}`
                  : `${prod.totalQty.toLocaleString()} pcs diterima`}
              </div>
            </div>

            {/* Tombol Cetak Barcode (Persis seperti Katalog Produk) */}
            <button
              id={`btn-barcode-${prod.kode_produksi}`}
              type="button"
              onClick={onPrintBarcode}
              className="px-2.5 py-1.5 text-xs font-bold text-violet-700 dark:text-violet-300 bg-violet-50 hover:bg-violet-100 dark:bg-violet-950/50 rounded-xl border border-violet-200 dark:border-violet-800 transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
              title="Cetak label / barcode thermal untuk produk ini"
            >
              <QrCode className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              <span>Barcode</span>
            </button>
          </div>

          {/* Badges: Kategori & Tanggal & Keterangan */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                group.kategori === 'Lokal CMT'
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
              }`}
            >
              {group.kategori}
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
              {group.tanggal_penerimaan}
            </span>
            {prod.keterangan && (
              <span
                className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 italic max-w-[140px] truncate"
                title={prod.keterangan}
              >
                "{prod.keterangan}"
              </span>
            )}
          </div>

          {/* Baris Ringkasan Varian + Tombol Sembunyikan/Tampilkan Varian */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span>{prod.items.length} Varian</span>
              <span className="mx-1">•</span>
              <strong className="text-slate-700 dark:text-slate-300">
                Total {prod.totalQty} pcs
              </strong>
            </div>

            {/* Tombol Hide / Unhide Rincian Varian (Sama persis Katalog) */}
            <button
              id={`btn-toggle-table-${prod.kode_produksi}`}
              type="button"
              onClick={onToggleTable}
              className={`px-2 py-0.5 text-[11px] font-bold rounded-lg border transition-all flex items-center gap-1 cursor-pointer ${
                isTableVisible
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                  : 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100'
              }`}
              title={isTableVisible ? 'Sembunyikan tabel rincian varian' : 'Tampilkan tabel rincian varian'}
            >
              {isTableVisible ? (
                <>
                  <EyeOff className="w-3 h-3 text-slate-500" />
                  <span>Sembunyikan Varian</span>
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  <span>Lihat Varian</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* BAGIAN TENGAH: Data Scrollable (Varian Ukuran, Warna, SKU, Qty) */}
      <div className="flex-1 min-h-0 px-3.5 pb-2 flex flex-col overflow-hidden">
        {isTableVisible ? (
          <div className="flex-1 min-h-0 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50/50 dark:bg-slate-900/40">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-100/90 dark:bg-slate-800/90 sticky top-0 z-10 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <tr>
                  <th className="py-1.5 px-2.5">WARNA</th>
                  <th className="py-1.5 px-2">SIZE</th>
                  <th className="py-1.5 px-2">SKU</th>
                  <th className="py-1.5 px-2 text-right">QTY</th>
                  <th className="py-1.5 px-1.5 w-6 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {prod.items.map((it, vIdx) => {
                  const skuDisplay = `${prod.kode_produksi}-${(it.warna || 'DEF').slice(0, 3).toUpperCase()}-${it.size || 'S'}`;
                  return (
                    <tr
                      key={it.id || `${it.kode_produksi}-${it.warna}-${it.size}-${vIdx}`}
                      className="hover:bg-slate-100/50 dark:hover:bg-slate-800/40 transition-colors group/row"
                    >
                      <td className="py-1.5 px-2.5 font-semibold text-slate-800 dark:text-slate-200">
                        {it.warna || '-'}
                      </td>
                      <td className="py-1.5 px-2 text-slate-600 dark:text-slate-400 font-bold">
                        {it.size || 'Default'}
                      </td>
                      <td
                        className="py-1.5 px-2 font-mono text-[11px] text-violet-700 dark:text-violet-400 font-semibold truncate max-w-[100px]"
                        title={skuDisplay}
                      >
                        {skuDisplay}
                      </td>
                      <td className="py-1.5 px-2 text-right font-bold text-slate-800 dark:text-slate-200">
                        {it.qty}
                      </td>
                      <td className="py-1.5 px-1.5 text-center">
                        <button
                          type="button"
                          onClick={() => onDeleteVariant(it)}
                          className="text-slate-300 hover:text-rose-500 opacity-0 group-hover/row:opacity-100 transition cursor-pointer p-0.5"
                          title="Hapus varian ini"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto p-2.5 bg-slate-50/50 dark:bg-slate-900/40 rounded-lg border border-slate-200 dark:border-slate-700/80 space-y-2">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Warna Tersedia:
              </span>
              <div className="flex flex-wrap gap-1">
                {prod.warnas.map((w) => (
                  <span
                    key={w}
                    className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 shadow-2xs"
                  >
                    {w}
                  </span>
                ))}
              </div>
            </div>
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Ukuran:
              </span>
              <div className="flex flex-wrap gap-1">
                {Array.from(new Set(prod.items.map((i) => i.size || 'Default'))).map((s) => (
                  <span
                    key={s}
                    className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800"
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BAGIAN BAWAH: Aksi Edit & Hapus Produk & Kerjakan QC */}
      <div className="px-3.5 py-2 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-[11px] text-slate-500 shrink-0 h-10 gap-2">
        <div className="flex items-center gap-3">
          <button
            id={`btn-edit-bot-${prod.kode_produksi}`}
            type="button"
            onClick={onEditProduct}
            className="text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-300 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Edit className="w-3 h-3" />
            <span>Edit</span>
          </button>
          <button
            id={`btn-del-bot-${prod.kode_produksi}`}
            type="button"
            onClick={onDeleteProduct}
            className="text-rose-500 hover:text-rose-700 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            <span>Hapus</span>
          </button>
        </div>

        {onOpenQcJob && (
          <button
            type="button"
            onClick={() => onOpenQcJob(prod.kode_produksi, group.no_surat_jalan)}
            className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10px] font-black uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all shadow-xs active:scale-95"
          >
            <Play className="w-3 h-3 fill-current" />
            <span>Kerjakan QC</span>
          </button>
        )}
      </div>
    </div>
  );
};
