import React, { useMemo, useState } from 'react';
import {
  Package,
  ZoomIn,
  Edit,
  Camera,
  Trash2,
  ChevronDown,
  ChevronUp,
  QrCode,
  Play,
  MoreHorizontal,
} from 'lucide-react';
import {
  ProductItem,
  PenerimaanProduksiItem,
} from '../../types';
import { buildProductLookupMap } from '../../utils/productLookup';
import { ProduksiActionSheet } from './ProduksiActionSheet';

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
  const [isActionOpen, setIsActionOpen] = useState(false);

  // Cari produk katalog yang cocok secara O(1) via Map (tanpa .find() 28.000 item per kartu)
  const matchedProduct = useMemo(() => {
    if (!productCatalog || productCatalog.length === 0) return undefined;
    const cleanCode = prod.kode_produksi.trim().toUpperCase();
    const map = buildProductLookupMap(productCatalog);
    return map.get(cleanCode);
  }, [productCatalog, prod.kode_produksi]);

  const productName: string =
    matchedProduct && typeof matchedProduct.nama_produk === 'string'
      ? matchedProduct.nama_produk
      : matchedProduct && typeof matchedProduct.n === 'string'
      ? matchedProduct.n
      : prod.kode_produksi;

  const activePhotoUrl = prod.foto_url || '';

  const productPrice =
    matchedProduct && typeof matchedProduct.harga_jual === 'number'
      ? matchedProduct.harga_jual
      : matchedProduct && typeof matchedProduct.price === 'number'
      ? matchedProduct.price
      : undefined;

  const uniqueSizes = useMemo(
    () => Array.from(new Set(prod.items.map((i) => i.size || 'Default'))),
    [prod.items]
  );

  return (
    <>
      <div
        id={`prod-card-${group.no_surat_jalan}-${prod.kode_produksi}`}
        className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/90 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col overflow-hidden group"
      >
        {/* Thumbnail & Product Identity */}
        <div className="p-3 sm:p-3.5 flex gap-3 items-start">
          {/* Square Thumbnail */}
          <button
            id={`img-wrap-${prod.kode_produksi}`}
            type="button"
            onClick={onOpenLightbox}
            className="relative w-20 h-20 sm:w-22 sm:h-22 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700/70 overflow-hidden shrink-0 flex items-center justify-center group/img cursor-zoom-in"
            title="Lihat foto penuh"
          >
            {activePhotoUrl ? (
              <img
                src={activePhotoUrl}
                alt={prod.kode_produksi}
                className="w-full h-full object-cover object-top transition-transform duration-300 group-hover/img:scale-105"
                crossOrigin="anonymous"
                loading="lazy"
              />
            ) : (
              <Package className="w-7 h-7 text-slate-300 dark:text-slate-600" />
            )}
            <span className="absolute inset-0 bg-black/25 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center text-white">
              <ZoomIn className="w-4 h-4" />
            </span>
          </button>

          {/* Identity & Qty */}
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-mono text-xs font-bold text-indigo-700 dark:text-indigo-300">
                    #{prod.kode_produksi}
                  </span>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="font-mono text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate">
                    {group.no_surat_jalan}
                  </span>
                </div>
                <h3
                  className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2 mt-0.5"
                  title={productName}
                >
                  {productName}
                </h3>
              </div>

              <div className="text-right shrink-0">
                <div className="text-base font-extrabold text-slate-900 dark:text-white tabular-nums leading-none">
                  {prod.totalQty.toLocaleString('id-ID')}
                </div>
                <div className="text-[10px] font-medium text-slate-400 mt-0.5">pcs</div>
              </div>
            </div>

            {/* Subtle Metadata Line */}
            <div className="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-500 dark:text-slate-400">
              <span
                className={`font-semibold ${
                  group.kategori === 'Lokal CMT'
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-amber-600 dark:text-amber-400'
                }`}
              >
                {group.kategori}
              </span>
              {productPrice !== undefined && (
                <>
                  <span className="text-slate-300 dark:text-slate-700">·</span>
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                    Rp {Number(productPrice).toLocaleString('id-ID')}
                  </span>
                </>
              )}
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="tabular-nums">{prod.items.length} varian</span>
            </div>

            {prod.keterangan && (
              <p
                className="text-[11px] text-slate-500 dark:text-slate-400 italic line-clamp-1"
                title={prod.keterangan}
              >
                Catatan: {prod.keterangan}
              </p>
            )}
          </div>
        </div>

        {/* Variant Summary / Collapsible Toggle */}
        <div className="border-t border-slate-100 dark:border-slate-800/80">
          <button
            id={`btn-toggle-table-${prod.kode_produksi}`}
            type="button"
            onClick={onToggleTable}
            className="w-full px-3.5 py-2 flex items-center justify-between gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer min-h-[40px]"
          >
            <span className="truncate text-left">
              {prod.warnas.slice(0, 3).join(', ')}
              {prod.warnas.length > 3 ? ` +${prod.warnas.length - 3}` : ''}
              <span className="text-slate-400 font-normal">
                {' '}· Size {uniqueSizes.join(', ')}
              </span>
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
              <span>{isTableVisible ? 'Tutup' : 'Rincian'}</span>
              {isTableVisible ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </span>
          </button>

          {isTableVisible && (
            <div className="px-3 pb-3">
              <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 divide-y divide-slate-100 dark:divide-slate-800/80 max-h-56 overflow-y-auto">
                {prod.items.map((it, vIdx) => (
                  <div
                    key={it.id || `${it.kode_produksi}-${it.warna}-${it.size}-${vIdx}`}
                    className="px-3 py-2 flex items-center justify-between gap-2 text-xs hover:bg-white/80 dark:hover:bg-slate-800/50 transition-colors group/row"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {it.warna || '-'}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-[10px] font-bold text-slate-700 dark:text-slate-300 font-mono shrink-0">
                        {it.size || 'Default'}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                        {it.qty} pcs
                      </span>
                      <button
                        type="button"
                        onClick={() => onDeleteVariant(it)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Hapus varian ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Clean 2-Control Native Footer (Max 1 Primary CTA + Action Sheet) */}
        <div className="mt-auto px-3 py-2.5 bg-slate-50/70 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
          {onOpenQcJob ? (
            <button
              type="button"
              onClick={() => onOpenQcJob(prod.kode_produksi, group.no_surat_jalan)}
              className="flex-1 min-h-[40px] px-3 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-xs"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>Kerjakan QC</span>
            </button>
          ) : (
            <button
              id={`btn-barcode-${prod.kode_produksi}`}
              type="button"
              onClick={onPrintBarcode}
              className="flex-1 min-h-[40px] px-3 py-2 bg-indigo-600 hover:bg-indigo-700 active:scale-[0.99] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-xs"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span>Cetak Barcode</span>
            </button>
          )}

          {onOpenQcJob && (
            <button
              id={`btn-barcode-${prod.kode_produksi}`}
              type="button"
              onClick={onPrintBarcode}
              className="min-h-[40px] px-3 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-colors shrink-0"
              title="Cetak label barcode thermal"
            >
              <QrCode className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Barcode</span>
            </button>
          )}

          <button
            id={`btn-aksi-prod-${prod.kode_produksi}`}
            type="button"
            onClick={() => setIsActionOpen(true)}
            aria-label="Menu aksi produk"
            className="min-h-[40px] min-w-[40px] px-2.5 py-2 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold flex items-center justify-center gap-1 cursor-pointer transition-colors shrink-0"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      <ProduksiActionSheet
        isOpen={isActionOpen}
        onClose={() => setIsActionOpen(false)}
        title={`#${prod.kode_produksi}`}
        subtitle={`${productName} · ${prod.totalQty.toLocaleString('id-ID')} pcs · SJ ${group.no_surat_jalan}`}
        groups={[
          {
            title: 'Aksi Produk',
            items: [
              ...(onOpenQcJob
                ? [
                    {
                      id: 'qc',
                      label: 'Kerjakan QC Produk',
                      description: 'Buka lembar pemeriksaan QC untuk kode ini',
                      icon: <Play className="w-4 h-4 fill-current" />,
                      tone: 'primary' as const,
                      onClick: () => onOpenQcJob(prod.kode_produksi, group.no_surat_jalan),
                    },
                  ]
                : []),
              {
                id: 'barcode',
                label: 'Cetak Barcode Thermal',
                description: 'Cetak label SKU & ukuran untuk varian produk ini',
                icon: <QrCode className="w-4 h-4" />,
                onClick: onPrintBarcode,
              },
              {
                id: 'photo',
                label: 'Lihat Foto Penuh',
                description: activePhotoUrl ? 'Buka preview foto resolusi penuh' : 'Foto belum tersedia',
                icon: <Camera className="w-4 h-4" />,
                disabled: !activePhotoUrl,
                onClick: onOpenLightbox,
              },
            ],
          },
          {
            title: 'Kelola Data',
            items: [
              {
                id: 'edit',
                label: 'Edit Produk & Surat Jalan',
                description: 'Ubah jumlah, warna, ukuran, foto, atau catatan SJ',
                icon: <Edit className="w-4 h-4" />,
                onClick: onEditProduct,
              },
              {
                id: 'delete',
                label: 'Hapus Produk dari SJ',
                description: `Hapus ${prod.items.length} varian (${prod.totalQty} pcs) dari Surat Jalan ini`,
                icon: <Trash2 className="w-4 h-4" />,
                tone: 'danger',
                onClick: onDeleteProduct,
              },
            ],
          },
        ]}
      />
    </>
  );
};
