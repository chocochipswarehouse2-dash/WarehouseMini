import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Printer,
  Layers,
  Image as ImageIcon,
  ExternalLink,
  Check,
  X,
  FileSpreadsheet,
  Download,
  Loader2,
  Plus,
  Trash2,
  Calendar,
  Save,
  Edit3,
  Undo2,
} from 'lucide-react';
import { PenerimaanProduksiItem, ProductItem } from '../../types';
import { exportProduksiToModernExcel } from '../../utils/excelProduksiExporter';

interface ProduksiSpreadsheetViewProps {
  dataList: PenerimaanProduksiItem[];
  productCatalog?: ProductItem[];
  onOpenLightbox: (img: { url: string; title: string; subtitle?: string }) => void;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
  onOpenHitungUlang?: (kode?: string, tanggal?: string) => void;
}

export interface MatrixSizeItem {
  id?: string | number;
  size: string;
  qtyByDate: Record<string, number>; // dateString -> qty datang
  qtyReturByDate?: Record<string, number>; // dateString -> qty retur (Khusus CMT)
  totalSizeQty: number;
  totalSizeRetur?: number;
}

export interface MatrixColorGroup {
  color: string;
  sizes: MatrixSizeItem[];
  totalColorQty: number;
  totalColorRetur?: number;
}

// Model per Product Block for Independent Spreadsheet Matrix
export interface MatrixProductBlock {
  id: string; // unique block id (kode_produksi)
  rowNumber: number;
  code: string; // Kode input kedatangan
  productName: string; // Optional nama produk
  upVendor: string; // Optional UP
  kategori: string; // 'Lokal CMT' | 'Kargo'
  photoUrl?: string; // Hasil upload GDrive
  colorGroups: MatrixColorGroup[];
  dateSlots: string[]; // 10 slots of arrival dates
  returDateSlots?: string[]; // 5 slots of return dates (for CMT)
  totalDatang: number; // Gross datang
  totalRetur?: number; // Total retur
  totalNet: number; // Datang - Retur
  // Kesimpulan metrics
  kg: number;
  ongkirPerKg: number;
  totalOngkir: number;
  ongkirPerPcs: number;
}

const STORAGE_KEY_METRICS = 'wms_produksi_matrix_metrics_cache';
const STORAGE_KEY_TAB = 'wms_produksi_spreadsheet_tab';
const FIXED_DATE_COLUMNS_COUNT = 10;
const FIXED_RETUR_COLUMNS_COUNT = 5;

export const ProduksiSpreadsheetView: React.FC<ProduksiSpreadsheetViewProps> = ({
  dataList,
  onOpenLightbox,
  onShowToast,
  onOpenHitungUlang,
}) => {
  // Tab State: 'CMT' | 'Kargo'
  const [activeTab, setActiveTab] = useState<'CMT' | 'Kargo'>(() => {
    try {
      return (localStorage.getItem(STORAGE_KEY_TAB) as 'CMT' | 'Kargo') || 'CMT';
    } catch {
      return 'CMT';
    }
  });

  const [search, setSearch] = useState<string>('');

  // Track which block is currently in Edit Mode: { [blockId: string]: boolean }
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  // Backup of block before editing for Cancel/Undo
  const [backupBlock, setBackupBlock] = useState<MatrixProductBlock | null>(null);

  // Custom metrics (KG & Ongkir) per Kode Produksi
  const [customMetrics, setCustomMetrics] = useState<Record<string, { kg: number; ongkir: number }>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_METRICS);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  // Master local state of product blocks
  const [blocks, setBlocks] = useState<MatrixProductBlock[]>([]);

  // Format date helper: "2026-07-13" -> "13 Jul"
  const formatDateHeader = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const day = d.getDate();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
      return `${day} ${monthNames[d.getMonth()]}`;
    } catch {
      return dateStr;
    }
  };

  const standardSizeOrder = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', 'ALL SIZE', 'FREE SIZE'];

  // Initialize or re-sync Blocks from dataList when dataList or activeTab changes
  useEffect(() => {
    if (!dataList) return;

    const isCMT = activeTab === 'CMT';
    const targetCategory = isCMT ? 'Lokal CMT' : 'Kargo';

    const tabFilteredItems = dataList.filter((it) => {
      const kat = (it.kategori || '').trim();
      if (isCMT) {
        return kat.toLowerCase().includes('cmt') || kat.toLowerCase().includes('lokal') || !kat || kat === 'Lokal CMT';
      } else {
        return kat.toLowerCase().includes('kargo') || kat === 'Kargo';
      }
    });

    // Group items by Kode Produksi
    const codeMap = new Map<string, PenerimaanProduksiItem[]>();
    tabFilteredItems.forEach((it) => {
      const code = (it.kode_produksi || 'TANPA_KODE').trim().toUpperCase();
      if (!codeMap.has(code)) {
        codeMap.set(code, []);
      }
      codeMap.get(code)!.push(it);
    });

    const parsedBlocks: MatrixProductBlock[] = [];
    let rowNumber = 1;

    codeMap.forEach((items, code) => {
      const photoUrl = items.find((i) => i.foto_url && i.foto_url.trim().length > 0)?.foto_url;
      const firstItem = items[0];

      // Extract unique arrival dates
      const distinctDatangDates = Array.from(
        new Set(items.map((i) => i.tanggal_penerimaan).filter(Boolean))
      ).sort();

      const dateSlots: string[] = Array.from(
        { length: FIXED_DATE_COLUMNS_COUNT },
        (_, i) => distinctDatangDates[i] || ''
      );

      // Extract unique return dates (Khusus CMT)
      const distinctReturDates = Array.from(
        new Set(items.map((i) => i.tanggal_retur).filter(Boolean) as string[])
      ).sort();

      const returDateSlots: string[] = Array.from(
        { length: FIXED_RETUR_COLUMNS_COUNT },
        (_, i) => distinctReturDates[i] || ''
      );

      // Group by Color
      const colorMap = new Map<string, PenerimaanProduksiItem[]>();
      items.forEach((it) => {
        const color = (it.warna || 'DEFAULT').trim().toUpperCase();
        if (!colorMap.has(color)) {
          colorMap.set(color, []);
        }
        colorMap.get(color)!.push(it);
      });

      const colorGroups: MatrixColorGroup[] = [];
      let totalDatang = 0;
      let totalRetur = 0;

      colorMap.forEach((cItems, color) => {
        const sizeMap = new Map<string, PenerimaanProduksiItem[]>();
        cItems.forEach((it) => {
          const sz = (it.size || 'Default').trim().toUpperCase();
          if (!sizeMap.has(sz)) {
            sizeMap.set(sz, []);
          }
          sizeMap.get(sz)!.push(it);
        });

        const sortedSizes = Array.from(sizeMap.keys()).sort((a, b) => {
          const idxA = standardSizeOrder.indexOf(a);
          const idxB = standardSizeOrder.indexOf(b);
          if (idxA !== -1 && idxB !== -1) return idxA - idxB;
          if (idxA !== -1) return -1;
          if (idxB !== -1) return 1;
          return a.localeCompare(b);
        });

        let totalColorQty = 0;
        let totalColorRetur = 0;

        const sizes: MatrixSizeItem[] = sortedSizes.map((sz) => {
          const sItems = sizeMap.get(sz)!;
          const qtyByDate: Record<string, number> = {};
          const qtyReturByDate: Record<string, number> = {};
          let totalSizeQty = 0;
          let totalSizeRetur = 0;

          sItems.forEach((it) => {
            const d = it.tanggal_penerimaan;
            const q = Number(it.qty) || 0;
            if (d && q > 0) {
              qtyByDate[d] = (qtyByDate[d] || 0) + q;
              totalSizeQty += q;
            }

            const rDate = it.tanggal_retur;
            const rQty = Number(it.qty_retur) || 0;
            if (rDate && rQty > 0) {
              qtyReturByDate[rDate] = (qtyReturByDate[rDate] || 0) + rQty;
              totalSizeRetur += rQty;
            }
          });

          totalColorQty += totalSizeQty;
          totalColorRetur += totalSizeRetur;

          return {
            id: sItems[0]?.id,
            size: sz,
            qtyByDate,
            qtyReturByDate,
            totalSizeQty,
            totalSizeRetur,
          };
        });

        totalDatang += totalColorQty;
        totalRetur += totalColorRetur;

        colorGroups.push({
          color,
          sizes,
          totalColorQty,
          totalColorRetur,
        });
      });

      const totalNet = Math.max(0, totalDatang - (isCMT ? totalRetur : 0));

      // Kesimpulan metrics
      const savedM = customMetrics[code] || {
        kg: Math.round(totalNet * 0.28 * 10) / 10,
        ongkir: 0,
      };

      const kg = savedM.kg !== undefined ? savedM.kg : Math.round(totalNet * 0.28 * 10) / 10;
      const ongkirPerKg = savedM.ongkir || 0;
      const totalOngkir = Math.round(kg * ongkirPerKg);
      const ongkirPerPcs = totalNet > 0 ? Math.round(totalOngkir / totalNet) : 0;

      parsedBlocks.push({
        id: code,
        rowNumber: rowNumber++,
        code,
        productName: firstItem?.nama_produk || '',
        upVendor: firstItem?.kategori === 'Lokal CMT' ? 'BIS' : (firstItem?.keterangan || ''),
        kategori: targetCategory,
        photoUrl,
        colorGroups,
        dateSlots,
        returDateSlots,
        totalDatang,
        totalRetur,
        totalNet,
        kg,
        ongkirPerKg,
        totalOngkir,
        ongkirPerPcs,
      });
    });

    setBlocks(parsedBlocks);
  }, [dataList, activeTab]);

  // Recalculate block totals
  const recalculateBlock = (block: MatrixProductBlock): MatrixProductBlock => {
    const isCMT = activeTab === 'CMT';
    let blockTotalDatang = 0;
    let blockTotalRetur = 0;

    const updatedColorGroups = block.colorGroups.map((cg) => {
      let colorTotalDatang = 0;
      let colorTotalRetur = 0;

      const updatedSizes = cg.sizes.map((sz) => {
        let sizeTotalDatang = 0;
        let sizeTotalRetur = 0;

        Object.values(sz.qtyByDate || {}).forEach((v) => {
          sizeTotalDatang += Number(v) || 0;
        });

        if (isCMT) {
          Object.values(sz.qtyReturByDate || {}).forEach((v) => {
            sizeTotalRetur += Number(v) || 0;
          });
        }

        colorTotalDatang += sizeTotalDatang;
        colorTotalRetur += sizeTotalRetur;

        return {
          ...sz,
          totalSizeQty: sizeTotalDatang,
          totalSizeRetur: sizeTotalRetur,
        };
      });

      blockTotalDatang += colorTotalDatang;
      blockTotalRetur += colorTotalRetur;

      return {
        ...cg,
        sizes: updatedSizes,
        totalColorQty: colorTotalDatang,
        totalColorRetur: colorTotalRetur,
      };
    });

    const totalNet = Math.max(0, blockTotalDatang - (isCMT ? blockTotalRetur : 0));
    const kg = block.kg !== undefined ? block.kg : Math.round(totalNet * 0.28 * 10) / 10;
    const totalOngkir = Math.round(kg * (block.ongkirPerKg || 0));
    const ongkirPerPcs = totalNet > 0 ? Math.round(totalOngkir / totalNet) : 0;

    return {
      ...block,
      colorGroups: updatedColorGroups,
      totalDatang: blockTotalDatang,
      totalRetur: blockTotalRetur,
      totalNet,
      totalOngkir,
      ongkirPerPcs,
    };
  };

  // Start Edit Mode for a Block
  const handleStartEditBlock = (block: MatrixProductBlock) => {
    setBackupBlock(JSON.parse(JSON.stringify(block)));
    setEditingBlockId(block.id);
  };

  // Cancel Edit Mode
  const handleCancelEditBlock = (blockId: string) => {
    if (backupBlock && backupBlock.id === blockId) {
      setBlocks((prev) => prev.map((b) => (b.id === blockId ? backupBlock : b)));
    }
    setEditingBlockId(null);
    setBackupBlock(null);
    onShowToast('Perubahan dibatalkan.', 'info');
  };

  // Save Block Changes & Synchronize
  const handleSaveBlockChanges = (blockId: string) => {
    const targetBlock = blocks.find((b) => b.id === blockId);
    if (!targetBlock) return;

    // Save metrics
    const updatedMetrics = {
      ...customMetrics,
      [targetBlock.code]: { kg: targetBlock.kg, ongkir: targetBlock.ongkirPerKg },
    };
    setCustomMetrics(updatedMetrics);
    try {
      localStorage.setItem(STORAGE_KEY_METRICS, JSON.stringify(updatedMetrics));
    } catch {}

    // Flatten block items to local master
    const nowStr = new Date().toISOString();
    const isCMT = activeTab === 'CMT';
    const newItems: PenerimaanProduksiItem[] = [];

    targetBlock.colorGroups.forEach((cg) => {
      cg.sizes.forEach((sz) => {
        // Datang
        Object.entries(sz.qtyByDate || {}).forEach(([dateStr, qty]) => {
          if (dateStr && Number(qty) > 0) {
            newItems.push({
              tanggal_penerimaan: dateStr,
              kategori: targetBlock.kategori || (isCMT ? 'Lokal CMT' : 'Kargo'),
              no_surat_jalan: `SJ-${targetBlock.code}`,
              kode_produksi: targetBlock.code,
              nama_produk: targetBlock.productName || '',
              warna: cg.color,
              size: sz.size,
              qty: Number(qty),
              foto_url: targetBlock.photoUrl || '',
              keterangan: targetBlock.upVendor ? `UP: ${targetBlock.upVendor}` : '',
              operator: 'Spreadsheet Editor',
              created_at: nowStr,
            });
          }
        });

        // Retur (CMT)
        if (isCMT) {
          Object.entries(sz.qtyReturByDate || {}).forEach(([returDate, rQty]) => {
            if (returDate && Number(rQty) > 0) {
              newItems.push({
                tanggal_penerimaan: returDate,
                tanggal_retur: returDate,
                qty_retur: Number(rQty),
                kategori: 'Lokal CMT',
                no_surat_jalan: `RETUR-${targetBlock.code}`,
                kode_produksi: targetBlock.code,
                nama_produk: targetBlock.productName || '',
                warna: cg.color,
                size: sz.size,
                qty: 0,
                foto_url: targetBlock.photoUrl || '',
                keterangan: `RETUR UP: ${targetBlock.upVendor || 'BIS'}`,
                operator: 'Spreadsheet Editor',
                created_at: nowStr,
              });
            }
          });
        }
      });
    });

    // Update LocalStorage cache
    try {
      const cached = localStorage.getItem('wms_local_penerimaan_produksi');
      let list: PenerimaanProduksiItem[] = cached ? JSON.parse(cached) : [];
      // Remove previous items for this specific code
      list = list.filter((it) => (it.kode_produksi || '').trim().toUpperCase() !== targetBlock.code);
      list = [...list, ...newItems];
      localStorage.setItem('wms_local_penerimaan_produksi', JSON.stringify(list));
    } catch {}

    // Dispatch global event for instant reactivity
    if (typeof window !== 'undefined') {
      try {
        window.dispatchEvent(
          new CustomEvent('wms_penerimaan_produksi_updated', {
            detail: { action: 'block_save', code: targetBlock.code },
          })
        );
      } catch {}
    }

    setEditingBlockId(null);
    setBackupBlock(null);
    onShowToast(`Tabel Kode ${targetBlock.code} berhasil disimpan!`, 'success');
  };

  // Switch Tab
  const handleTabChange = (tab: 'CMT' | 'Kargo') => {
    if (editingBlockId) {
      if (!window.confirm('Ada tabel yang sedang diedit. Yakin ingin berpindah tab? Perubahan yang belum disimpan akan hilang.')) {
        return;
      }
      setEditingBlockId(null);
      setBackupBlock(null);
    }
    setActiveTab(tab);
    try {
      localStorage.setItem(STORAGE_KEY_TAB, tab);
    } catch {}
  };

  // Cell Text/Number Typing (Datang) - Pure text input
  const handleTypeQtyDatang = (
    blockId: string,
    colorIndex: number,
    sizeIndex: number,
    dateStr: string,
    rawText: string
  ) => {
    if (!dateStr) return;
    const cleanDigits = rawText.replace(/\D/g, ''); // only numbers
    const numVal = cleanDigits === '' ? 0 : parseInt(cleanDigits, 10);

    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const newColors = [...b.colorGroups];
        const targetColor = { ...newColors[colorIndex] };
        const newSizes = [...targetColor.sizes];
        const targetSize = { ...newSizes[sizeIndex] };

        const newQtyByDate = { ...targetSize.qtyByDate };
        if (numVal === 0) {
          delete newQtyByDate[dateStr];
        } else {
          newQtyByDate[dateStr] = numVal;
        }

        targetSize.qtyByDate = newQtyByDate;
        newSizes[sizeIndex] = targetSize;
        targetColor.sizes = newSizes;
        newColors[colorIndex] = targetColor;

        return recalculateBlock({ ...b, colorGroups: newColors });
      })
    );
  };

  // Cell Text/Number Typing (Retur - Khusus CMT)
  const handleTypeQtyRetur = (
    blockId: string,
    colorIndex: number,
    sizeIndex: number,
    dateStr: string,
    rawText: string
  ) => {
    if (!dateStr) return;
    const cleanDigits = rawText.replace(/\D/g, '');
    const numVal = cleanDigits === '' ? 0 : parseInt(cleanDigits, 10);

    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const newColors = [...b.colorGroups];
        const targetColor = { ...newColors[colorIndex] };
        const newSizes = [...targetColor.sizes];
        const targetSize = { ...newSizes[sizeIndex] };

        const newQtyReturByDate = { ...targetSize.qtyReturByDate };
        if (numVal === 0) {
          delete newQtyReturByDate[dateStr];
        } else {
          newQtyReturByDate[dateStr] = numVal;
        }

        targetSize.qtyReturByDate = newQtyReturByDate;
        newSizes[sizeIndex] = targetSize;
        targetColor.sizes = newSizes;
        newColors[colorIndex] = targetColor;

        return recalculateBlock({ ...b, colorGroups: newColors });
      })
    );
  };

  // Date Header Direct Prompt/Input
  const handleEditDatePrompt = (blockId: string, slotIndex: number, type: 'datang' | 'retur', currentVal: string) => {
    const isDatang = type === 'datang';
    const title = isDatang ? 'Tanggal Barang Datang' : 'Tanggal Barang Retur';
    const input = window.prompt(
      `Masukkan ${title} (Format YYYY-MM-DD, contoh: 2026-07-15):`,
      currentVal || new Date().toISOString().split('T')[0]
    );
    if (input === null) return; // Cancelled

    const cleanDate = input.trim();

    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        if (isDatang) {
          const oldDate = b.dateSlots[slotIndex];
          const newSlots = [...b.dateSlots];
          newSlots[slotIndex] = cleanDate;

          const updatedColors = b.colorGroups.map((cg) => ({
            ...cg,
            sizes: cg.sizes.map((sz) => {
              const newQtyByDate = { ...sz.qtyByDate };
              if (oldDate && newQtyByDate[oldDate] !== undefined) {
                if (cleanDate) {
                  newQtyByDate[cleanDate] = newQtyByDate[oldDate];
                }
                delete newQtyByDate[oldDate];
              }
              return { ...sz, qtyByDate: newQtyByDate };
            }),
          }));

          return recalculateBlock({ ...b, dateSlots: newSlots, colorGroups: updatedColors });
        } else {
          const oldDate = b.returDateSlots ? b.returDateSlots[slotIndex] : '';
          const newSlots = [...(b.returDateSlots || [])];
          newSlots[slotIndex] = cleanDate;

          const updatedColors = b.colorGroups.map((cg) => ({
            ...cg,
            sizes: cg.sizes.map((sz) => {
              const newQtyReturByDate = { ...sz.qtyReturByDate };
              if (oldDate && newQtyReturByDate[oldDate] !== undefined) {
                if (cleanDate) {
                  newQtyReturByDate[cleanDate] = newQtyReturByDate[oldDate];
                }
                delete newQtyReturByDate[oldDate];
              }
              return { ...sz, qtyReturByDate: newQtyReturByDate };
            }),
          }));

          return recalculateBlock({ ...b, returDateSlots: newSlots, colorGroups: updatedColors });
        }
      })
    );
  };

  // Add Size Row
  const handleAddSizeRow = (blockId: string, colorIndex: number) => {
    const sizeName = window.prompt('Masukkan nama size baru (contoh: XL, XXL, 3XL):', '');
    if (!sizeName || !sizeName.trim()) return;

    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const newColors = [...b.colorGroups];
        const targetColor = { ...newColors[colorIndex] };
        targetColor.sizes = [
          ...targetColor.sizes,
          {
            size: sizeName.trim().toUpperCase(),
            qtyByDate: {},
            qtyReturByDate: {},
            totalSizeQty: 0,
            totalSizeRetur: 0,
          },
        ];
        newColors[colorIndex] = targetColor;
        return recalculateBlock({ ...b, colorGroups: newColors });
      })
    );
  };

  // Add Color
  const handleAddColor = (blockId: string) => {
    const colorName = window.prompt('Masukkan nama warna baru (contoh: WHITE, BLACK, SAGE):', '');
    if (!colorName || !colorName.trim()) return;

    setBlocks((prev) =>
      prev.map((b) => {
        if (b.id !== blockId) return b;
        const newCG: MatrixColorGroup = {
          color: colorName.trim().toUpperCase(),
          sizes: [
            { size: 'S', qtyByDate: {}, qtyReturByDate: {}, totalSizeQty: 0, totalSizeRetur: 0 },
            { size: 'M', qtyByDate: {}, qtyReturByDate: {}, totalSizeQty: 0, totalSizeRetur: 0 },
            { size: 'L', qtyByDate: {}, qtyReturByDate: {}, totalSizeQty: 0, totalSizeRetur: 0 },
          ],
          totalColorQty: 0,
          totalColorRetur: 0,
        };
        return recalculateBlock({ ...b, colorGroups: [...b.colorGroups, newCG] });
      })
    );
  };

  // Add New Block Table
  const handleAddNewBlock = () => {
    const newCode = window.prompt('Masukkan Kode Input Kedatangan baru (contoh: 1028):', '');
    if (!newCode || !newCode.trim()) return;
    const cleanCode = newCode.trim().toUpperCase();

    if (blocks.some((b) => b.code === cleanCode)) {
      onShowToast(`Kode ${cleanCode} sudah ada!`, 'warning');
      return;
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const newBlock: MatrixProductBlock = {
      id: cleanCode,
      rowNumber: blocks.length + 1,
      code: cleanCode,
      productName: '',
      upVendor: activeTab === 'CMT' ? 'BIS' : '',
      kategori: activeTab === 'CMT' ? 'Lokal CMT' : 'Kargo',
      colorGroups: [
        {
          color: 'DEFAULT',
          sizes: [
            { size: 'S', qtyByDate: { [todayStr]: 0 }, qtyReturByDate: {}, totalSizeQty: 0, totalSizeRetur: 0 },
            { size: 'M', qtyByDate: { [todayStr]: 0 }, qtyReturByDate: {}, totalSizeQty: 0, totalSizeRetur: 0 },
            { size: 'L', qtyByDate: { [todayStr]: 0 }, qtyReturByDate: {}, totalSizeQty: 0, totalSizeRetur: 0 },
          ],
          totalColorQty: 0,
          totalColorRetur: 0,
        },
      ],
      dateSlots: [todayStr, '', '', '', '', '', '', '', '', ''],
      returDateSlots: ['', '', '', '', ''],
      totalDatang: 0,
      totalRetur: 0,
      totalNet: 0,
      kg: 0,
      ongkirPerKg: 0,
      totalOngkir: 0,
      ongkirPerPcs: 0,
    };

    setBlocks((prev) => [...prev, newBlock]);
    setEditingBlockId(cleanCode); // automatically enter edit mode for new block
    onShowToast(`Tabel Kode ${cleanCode} dibuat. Silakan ketik datanya dan simpan.`, 'info');
  };

  // Delete Block
  const handleDeleteBlock = (blockId: string) => {
    if (!window.confirm(`Yakin ingin menghapus seluruh tabel Kode ${blockId}?`)) return;
    setBlocks((prev) => prev.filter((b) => b.id !== blockId));
    if (editingBlockId === blockId) setEditingBlockId(null);
    onShowToast(`Tabel Kode ${blockId} telah dihapus.`, 'info');
  };

  // Change Photo URL
  const handleEditPhoto = (blockId: string) => {
    const current = blocks.find((b) => b.id === blockId)?.photoUrl || '';
    const url = window.prompt('Masukkan Link Foto GDrive / Gambar Produk:', current);
    if (url !== null) {
      setBlocks((prev) =>
        prev.map((b) => (b.id === blockId ? { ...b, photoUrl: url.trim() } : b))
      );
    }
  };

  // Filter blocks
  const filteredBlocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return blocks;
    return blocks.filter(
      (b) =>
        b.code.toLowerCase().includes(q) ||
        b.colorGroups.some((cg) => cg.color.toLowerCase().includes(q))
    );
  }, [blocks, search]);

  // Export Excel
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);
  const [exportProgressMsg, setExportProgressMsg] = useState<string>('');

  const handleExportModernExcel = async () => {
    if (filteredBlocks.length === 0) {
      onShowToast('Tidak ada data untuk diekspor', 'warning');
      return;
    }

    try {
      setIsExportingExcel(true);
      await exportProduksiToModernExcel(filteredBlocks, activeTab, (msg) => {
        setExportProgressMsg(msg);
      });
      onShowToast(`File Excel ${activeTab} Modern (.xlsx) berhasil diunduh!`, 'success');
    } catch (err: any) {
      console.error('Error exporting modern excel:', err);
      onShowToast(err?.message || 'Gagal mengekspor file Excel', 'error');
    } finally {
      setIsExportingExcel(false);
      setExportProgressMsg('');
    }
  };

  const isCMT = activeTab === 'CMT';

  return (
    <div className="space-y-4 font-sans">
      {/* TAB SELECTOR: CMT vs KARGO */}
      <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-2 sm:p-2.5 shadow-xs">
        <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => handleTabChange('CMT')}
            className={`px-4 py-2 rounded-lg text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'CMT'
                ? 'bg-rose-500 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>🧵</span>
            <span>Lokal CMT</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === 'CMT'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              Datang & Retur
            </span>
          </button>

          <button
            type="button"
            onClick={() => handleTabChange('Kargo')}
            className={`px-4 py-2 rounded-lg text-xs font-black transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'Kargo'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>📦</span>
            <span>Kargo</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                activeTab === 'Kargo'
                  ? 'bg-white/20 text-white'
                  : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
              }`}
            >
              10 Tanggal Datang
            </span>
          </button>
        </div>

        <button
          type="button"
          onClick={handleAddNewBlock}
          className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-200 dark:border-slate-700"
          title="Tambah Tabel Kode Baru"
        >
          <Plus className="w-3.5 h-3.5 text-rose-500" />
          <span>Tambah Kode Baru</span>
        </button>
      </div>

      {/* TOOLBAR FILTER & ACTIONS */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-3 shadow-xs space-y-3 print:hidden">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder={`Cari Kode atau Warna di Tab ${activeTab}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-semibold text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-rose-400"
            />
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Lembar Hitung Ulang Button */}
            {onOpenHitungUlang && (
              <button
                type="button"
                onClick={() => onOpenHitungUlang()}
                className="px-3 py-2 bg-rose-50 dark:bg-rose-950/60 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-rose-200 dark:border-rose-800"
                title="Buka Lembar Verifikasi & Hitung Ulang Fisik"
              >
                <Layers className="w-3.5 h-3.5 text-rose-500" />
                <span>Lembar Hitung Ulang</span>
              </button>
            )}

            {/* Export Modern Excel */}
            <button
              type="button"
              disabled={isExportingExcel}
              onClick={handleExportModernExcel}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition cursor-pointer"
              title={`Download Excel Modern ${activeTab} (.xlsx)`}
            >
              {isExportingExcel ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>{exportProgressMsg || 'Mengunduh...'}</span>
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>Export Excel ({activeTab})</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border border-slate-200 dark:border-slate-700"
              title="Cetak Lanskap Spreadsheet"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Cetak</span>
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500 pt-1 border-t border-slate-100 dark:border-slate-800 flex-wrap gap-2">
          <div>
            Menampilkan <strong className="text-slate-900 dark:text-white">{filteredBlocks.length} Tabel Kode</strong> pada Tab{' '}
            <strong className="text-rose-600 dark:text-rose-400">{activeTab}</strong>
          </div>
          <div className="text-[11px] text-slate-500 font-medium">
            💡 Klik tombol <strong>&ldquo;✏️ Edit Tabel&rdquo;</strong> pada masing-masing tabel untuk mengetik perubahan data dan konfirmasi simpan.
          </div>
        </div>
      </div>

      {/* EMPTY STATE */}
      {filteredBlocks.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-2xl p-16 text-center text-slate-400 space-y-3">
          <Layers className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-600" />
          <div>
            <p className="font-bold text-sm text-slate-600 dark:text-slate-300">
              Belum ada data barang kedatangan pada Tab {activeTab}
            </p>
            <p className="text-xs text-slate-400">
              Klik tombol di bawah untuk menambahkan tabel kode kedatangan baru.
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddNewBlock}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Tambah Kode {activeTab} Baru</span>
          </button>
        </div>
      ) : (
        /* SPREADSHEET MASTER TABLES */
        <div className="space-y-6">
          {filteredBlocks.map((block) => {
            const isEditingThisBlock = editingBlockId === block.id;

            const totalSubRows = block.colorGroups.reduce(
              (acc, c) => acc + Math.max(1, c.sizes.length),
              0
            );

            let renderedRowsCount = 0;
            const returSlots = isCMT ? block.returDateSlots || ['', '', '', '', ''] : [];

            return (
              <div
                key={block.id}
                className={`bg-white dark:bg-slate-900 rounded-xl shadow-xs overflow-hidden transition-all print:border-black ${
                  isEditingThisBlock
                    ? 'border-2 border-rose-500 ring-4 ring-rose-500/10'
                    : 'border border-slate-300 dark:border-slate-700'
                }`}
              >
                {/* Block Header Toolbar */}
                <div
                  className={`px-3.5 py-2.5 border-b flex items-center justify-between text-xs font-bold flex-wrap gap-2 ${
                    isEditingThisBlock
                      ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-200 dark:border-rose-800'
                      : 'bg-slate-50 dark:bg-slate-800/90 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200 font-mono text-[11px] border border-rose-300 dark:border-rose-800">
                      KODE: {block.code}
                    </span>

                    {isEditingThisBlock && (
                      <span className="px-2 py-0.5 rounded bg-amber-500 text-white text-[10px] font-black uppercase tracking-wider animate-pulse">
                        MODE EDIT AKTIF
                      </span>
                    )}

                    <span className="text-slate-400">•</span>
                    <span>Total Datang: <strong className="text-slate-900 dark:text-white">{block.totalDatang} pcs</strong></span>
                    {isCMT && (
                      <>
                        <span className="text-slate-400">•</span>
                        <span>Retur: <strong className="text-red-600 dark:text-red-400">{block.totalRetur || 0} pcs</strong></span>
                        <span className="text-slate-400">•</span>
                        <span>Net: <strong className="text-emerald-600 dark:text-emerald-400">{block.totalNet} pcs</strong></span>
                      </>
                    )}
                  </div>

                  {/* Mode Edit & Save Controls */}
                  <div className="flex items-center gap-1.5">
                    {isEditingThisBlock ? (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAddColor(block.id)}
                          className="px-2.5 py-1.5 bg-white dark:bg-slate-800 hover:bg-slate-100 text-slate-700 dark:text-slate-200 rounded-lg text-[11px] font-bold border border-slate-300 dark:border-slate-600 transition flex items-center gap-1 cursor-pointer"
                          title="Tambah Warna Baru"
                        >
                          <Plus className="w-3.5 h-3.5 text-emerald-600" />
                          <span>+ Warna</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleSaveBlockChanges(block.id)}
                          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black transition flex items-center gap-1.5 shadow-sm cursor-pointer"
                          title="Konfirmasi & Simpan Perubahan"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Simpan</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCancelEditBlock(block.id)}
                          className="px-2.5 py-1.5 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                          title="Batal Edit"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Batal</span>
                        </button>
                      </>
                    ) : (
                      <>
                        {onOpenHitungUlang && (
                          <button
                            type="button"
                            onClick={() => onOpenHitungUlang(block.code)}
                            className="px-2.5 py-1.5 bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-100 text-rose-700 dark:text-rose-300 rounded-lg text-xs font-bold border border-rose-200 dark:border-rose-800 transition flex items-center gap-1 cursor-pointer"
                            title={`Buka Lembar Hitung Ulang Fisik untuk Kode ${block.code}`}
                          >
                            <Layers className="w-3.5 h-3.5 text-rose-500" />
                            <span>Hitung Ulang</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleStartEditBlock(block)}
                          className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-black border border-rose-300 dark:border-rose-800 transition flex items-center gap-1.5 shadow-2xs cursor-pointer"
                          title="Buka Mode Edit untuk tabel ini"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit Tabel</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeleteBlock(block.id)}
                          className="p-1.5 hover:bg-red-100 dark:hover:bg-red-950/60 text-slate-400 hover:text-red-600 rounded-lg transition cursor-pointer"
                          title="Hapus Tabel Ini"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-center border-collapse text-xs select-text border border-slate-300 dark:border-slate-700 min-w-[1100px]">
                    {/* SPREADSHEET HEADER */}
                    <thead>
                      {/* HEADER ROW 1 */}
                      <tr className="bg-[#fce8e6] dark:bg-[#3d1e22] text-slate-900 dark:text-rose-100 font-bold uppercase text-[11px] tracking-wider border-b border-slate-300 dark:border-slate-700 divide-x divide-slate-300 dark:divide-slate-700">
                        <th rowSpan={2} className="py-2.5 px-2.5 w-12 border-r border-slate-300 dark:border-slate-700">
                          NO
                        </th>
                        <th rowSpan={2} className="py-2.5 px-3 min-w-[80px]">
                          CODE
                        </th>
                        <th rowSpan={2} className="py-2.5 px-3 min-w-[120px]">
                          PRODUCT NAME
                        </th>
                        <th rowSpan={2} className="py-2.5 px-2.5 w-16">
                          UP
                        </th>
                        <th rowSpan={2} className="py-2.5 px-3 min-w-[130px]">
                          PHOTO
                        </th>
                        <th rowSpan={2} className="py-2.5 px-3 min-w-[100px]">
                          COLOR
                        </th>
                        <th rowSpan={2} className="py-2.5 px-2.5 w-14">
                          SIZE
                        </th>

                        {/* 10 KOLOM QTY BARANG DATANG SPAN */}
                        <th
                          colSpan={FIXED_DATE_COLUMNS_COUNT}
                          className="py-1.5 px-3 bg-[#fce8e6] dark:bg-[#3d1e22] text-center border-b border-slate-300 dark:border-slate-700"
                        >
                          QTY BARANG DATANG
                        </th>

                        {/* KHUSUS CMT: 5 KOLOM QTY BARANG RETUR SPAN */}
                        {isCMT && (
                          <th
                            colSpan={FIXED_RETUR_COLUMNS_COUNT}
                            className="py-1.5 px-3 bg-[#ffe4e6] dark:bg-[#4c1d24] text-red-900 dark:text-red-200 text-center border-b border-slate-300 dark:border-slate-700 font-black"
                          >
                            QTY BARANG RETUR
                          </th>
                        )}

                        {/* TOTAL DATANG */}
                        <th rowSpan={2} className="py-2.5 px-3 min-w-[80px] bg-[#fce8e6] dark:bg-[#3d1e22]">
                          TOTAL<br />{isCMT ? 'DATANG (NET)' : 'DATANG'}
                        </th>

                        {/* SPACER */}
                        <th rowSpan={2} className="w-3 bg-[#fce8e6] dark:bg-[#3d1e22] border-none">
                          {/* Spacer */}
                        </th>

                        {/* KESIMPULAN SPAN */}
                        <th
                          colSpan={5}
                          className="py-1.5 px-3 bg-[#fce8e6] dark:bg-[#3d1e22] text-center border-b border-slate-300 dark:border-slate-700"
                        >
                          KESIMPULAN
                        </th>
                      </tr>

                      {/* HEADER ROW 2 */}
                      <tr className="bg-[#fce8e6] dark:bg-[#3d1e22] text-slate-800 dark:text-rose-200 font-bold uppercase text-[10px] border-b-2 border-slate-400 dark:border-slate-600 divide-x divide-slate-300 dark:divide-slate-700">
                        {/* 10 Date Columns Header */}
                        {block.dateSlots.map((dStr, idx) => (
                          <th
                            key={`datang-${idx}`}
                            onClick={() => {
                              if (isEditingThisBlock) {
                                handleEditDatePrompt(block.id, idx, 'datang', dStr);
                              }
                            }}
                            className={`py-1 px-1.5 min-w-[48px] max-w-[55px] font-mono text-[10px] font-bold text-slate-800 dark:text-slate-200 ${
                              isEditingThisBlock ? 'cursor-pointer hover:bg-rose-300/80 bg-rose-100 dark:bg-rose-900/60' : ''
                            }`}
                            title={isEditingThisBlock ? 'Klik untuk ubah tanggal datang' : undefined}
                          >
                            {dStr ? formatDateHeader(dStr) : <span className="text-slate-400 font-normal">Tgl {idx + 1}</span>}
                          </th>
                        ))}

                        {/* Retur Date Headers (CMT) */}
                        {isCMT &&
                          returSlots.map((rStr, rIdx) => (
                            <th
                              key={`retur-${rIdx}`}
                              onClick={() => {
                                if (isEditingThisBlock) {
                                  handleEditDatePrompt(block.id, rIdx, 'retur', rStr);
                                }
                              }}
                              className={`py-1 px-1.5 min-w-[48px] max-w-[55px] font-mono text-[10px] font-bold bg-[#ffe4e6] dark:bg-[#4c1d24] text-red-800 dark:text-red-200 ${
                                isEditingThisBlock ? 'cursor-pointer hover:bg-red-300/80' : ''
                              }`}
                              title={isEditingThisBlock ? 'Klik untuk ubah tanggal retur' : undefined}
                            >
                              {rStr ? formatDateHeader(rStr) : <span className="text-red-400/80 font-normal">Ret {rIdx + 1}</span>}
                            </th>
                          ))}

                        {/* Kesimpulan Subheaders */}
                        <th className="py-1 px-2 min-w-[50px] text-red-600 dark:text-red-400 font-bold">PCS</th>
                        <th className="py-1 px-2 min-w-[65px] text-blue-600 dark:text-blue-400 font-bold">KG</th>
                        <th className="py-1 px-2 min-w-[60px]">ONGKIR</th>
                        <th className="py-1 px-2 min-w-[75px]">TOTAL ONGKIR</th>
                        <th className="py-1 px-2 min-w-[70px]">ONGKIR/PCS</th>
                      </tr>
                    </thead>

                    {/* TABLE BODY */}
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                      {block.colorGroups.map((colorGroup, colorIndex) => {
                        const colorSubRows = colorGroup.sizes.length;

                        return colorGroup.sizes.map((sizeItem, sizeIndex) => {
                          const isFirstRowOfBlock = renderedRowsCount === 0;
                          const isFirstRowOfColor = sizeIndex === 0;
                          renderedRowsCount++;

                          return (
                            <tr
                              key={`${block.id}-${colorGroup.color}-${sizeItem.size}`}
                              className="border-b border-slate-200 dark:border-slate-800 hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition divide-x divide-slate-200 dark:divide-slate-800"
                            >
                              {/* 1. NO */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-3 px-2 font-bold text-slate-900 dark:text-white text-center align-top bg-white dark:bg-slate-900 border-r border-slate-300 dark:border-slate-700"
                                >
                                  {block.rowNumber}
                                </td>
                              )}

                              {/* 2. CODE */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-3 px-2.5 font-bold text-slate-900 dark:text-white text-center align-top"
                                >
                                  {block.code}
                                </td>
                              )}

                              {/* 3. PRODUCT NAME */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-3 px-2 text-center align-top bg-white dark:bg-slate-900"
                                >
                                  {isEditingThisBlock ? (
                                    <input
                                      type="text"
                                      placeholder="Nama produk..."
                                      value={block.productName || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setBlocks((prev) =>
                                          prev.map((b) => (b.id === block.id ? { ...b, productName: val } : b))
                                        );
                                      }}
                                      className="w-full text-center bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-xs font-semibold outline-none focus:ring-1 focus:ring-rose-500"
                                    />
                                  ) : (
                                    <span>{block.productName || ''}</span>
                                  )}
                                </td>
                              )}

                              {/* 4. UP */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-3 px-2 text-center align-top bg-white dark:bg-slate-900"
                                >
                                  {isEditingThisBlock ? (
                                    <input
                                      type="text"
                                      placeholder="UP..."
                                      value={block.upVendor || ''}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setBlocks((prev) =>
                                          prev.map((b) => (b.id === block.id ? { ...b, upVendor: val } : b))
                                        );
                                      }}
                                      className="w-full text-center bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded px-1.5 py-1 text-xs font-bold outline-none focus:ring-1 focus:ring-rose-500"
                                    />
                                  ) : (
                                    <span>{block.upVendor || ''}</span>
                                  )}
                                </td>
                              )}

                              {/* 5. PHOTO */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="p-2.5 text-center align-middle bg-slate-50/50 dark:bg-slate-850/50"
                                >
                                  {block.photoUrl ? (
                                    <div className="relative group w-24 h-24 sm:w-28 sm:h-28 mx-auto rounded-lg overflow-hidden border border-slate-300 dark:border-slate-700 shadow-xs bg-white dark:bg-slate-800">
                                      <img
                                        src={block.photoUrl}
                                        alt={block.code}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200 cursor-pointer"
                                        referrerPolicy="no-referrer"
                                        onClick={() =>
                                          onOpenLightbox({
                                            url: block.photoUrl!,
                                            title: `Kode Produksi: ${block.code}`,
                                            subtitle: `Total Net: ${block.totalNet} pcs`,
                                          })
                                        }
                                      />
                                      {isEditingThisBlock && (
                                        <button
                                          type="button"
                                          onClick={() => handleEditPhoto(block.id)}
                                          className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 hover:bg-black text-white rounded text-[10px] font-bold transition cursor-pointer"
                                        >
                                          Ganti
                                        </button>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={!isEditingThisBlock}
                                      onClick={() => handleEditPhoto(block.id)}
                                      className={`w-20 h-20 mx-auto rounded-lg border border-dashed border-slate-300 dark:border-slate-700 flex flex-col items-center justify-center text-slate-400 bg-slate-100/50 dark:bg-slate-800/40 transition ${
                                        isEditingThisBlock ? 'hover:text-rose-600 hover:border-rose-400 cursor-pointer' : ''
                                      }`}
                                    >
                                      <ImageIcon className="w-5 h-5 mb-1" />
                                      <span className="text-[9px]">{isEditingThisBlock ? '+ Foto' : 'No Photo'}</span>
                                    </button>
                                  )}
                                </td>
                              )}

                              {/* 6. COLOR */}
                              {isFirstRowOfColor && (
                                <td
                                  rowSpan={colorSubRows}
                                  className="py-2.5 px-3 font-bold text-slate-900 dark:text-white text-center align-middle bg-white dark:bg-slate-900 text-xs"
                                >
                                  <div className="flex flex-col items-center justify-center gap-1">
                                    <span>{colorGroup.color}</span>
                                    {isEditingThisBlock && (
                                      <button
                                        type="button"
                                        onClick={() => handleAddSizeRow(block.id, colorIndex)}
                                        className="text-[10px] text-emerald-600 dark:text-emerald-400 hover:underline font-bold cursor-pointer"
                                      >
                                        + Size
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}

                              {/* 7. SIZE */}
                              <td className="py-2 px-2 text-center font-bold text-slate-800 dark:text-slate-200 text-xs bg-slate-50/40 dark:bg-slate-800/40">
                                {sizeItem.size}
                              </td>

                              {/* 8. QTY BARANG DATANG (Ketik Tanpa Panah Stepper) */}
                              {block.dateSlots.map((dStr, slotIdx) => {
                                const qtyVal = dStr ? sizeItem.qtyByDate[dStr] : undefined;
                                return (
                                  <td
                                    key={`slot-datang-${slotIdx}`}
                                    className={`p-0 text-center font-mono font-bold text-xs ${
                                      qtyVal
                                        ? 'bg-[#fff2cc] dark:bg-[#38311d] text-amber-950 dark:text-amber-100 border border-[#ffe599]/60 dark:border-amber-800/40'
                                        : 'text-slate-300 dark:text-slate-700'
                                    }`}
                                  >
                                    {isEditingThisBlock ? (
                                      <input
                                        type="text"
                                        inputMode="numeric"
                                        pattern="[0-9]*"
                                        disabled={!dStr}
                                        value={qtyVal !== undefined && qtyVal !== 0 ? String(qtyVal) : ''}
                                        onChange={(e) =>
                                          handleTypeQtyDatang(block.id, colorIndex, sizeIndex, dStr, e.target.value)
                                        }
                                        placeholder={dStr ? '-' : ''}
                                        className="w-full h-8 text-center bg-transparent border-none outline-none font-bold text-xs focus:bg-amber-200 dark:focus:bg-amber-900/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                      />
                                    ) : (
                                      <div className="py-2 px-1">
                                        {qtyVal || ''}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}

                              {/* 9. QTY BARANG RETUR (Khusus CMT - Ketik Tanpa Panah Stepper) */}
                              {isCMT &&
                                returSlots.map((rStr, rIdx) => {
                                  const rQtyVal = rStr ? sizeItem.qtyReturByDate?.[rStr] : undefined;
                                  return (
                                    <td
                                      key={`slot-retur-${rIdx}`}
                                      className={`p-0 text-center font-mono font-bold text-xs ${
                                        rQtyVal
                                          ? 'bg-[#ffe4e6] dark:bg-[#4c1d24] text-red-900 dark:text-red-100 border border-red-200 dark:border-red-900'
                                          : 'text-slate-300 dark:text-slate-700'
                                      }`}
                                    >
                                      {isEditingThisBlock ? (
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          pattern="[0-9]*"
                                          disabled={!rStr}
                                          value={rQtyVal !== undefined && rQtyVal !== 0 ? String(rQtyVal) : ''}
                                          onChange={(e) =>
                                            handleTypeQtyRetur(block.id, colorIndex, sizeIndex, rStr, e.target.value)
                                          }
                                          placeholder={rStr ? '-' : ''}
                                          className="w-full h-8 text-center bg-transparent border-none outline-none font-bold text-xs text-red-600 dark:text-red-400 focus:bg-red-200 dark:focus:bg-red-900/60 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                        />
                                      ) : (
                                        <div className="py-2 px-1 text-red-600 dark:text-red-400">
                                          {rQtyVal || ''}
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}

                              {/* 10. TOTAL DATANG (NET) */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-3 px-2 text-center align-middle font-mono font-bold text-sm text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/60"
                                >
                                  <div>{block.totalNet}</div>
                                  {isCMT && block.totalRetur ? (
                                    <div className="text-[10px] font-normal text-slate-500">
                                      ({block.totalDatang} - {block.totalRetur})
                                    </div>
                                  ) : null}
                                </td>
                              )}

                              {/* 11. SPACER */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="w-3 bg-slate-100/60 dark:bg-slate-850/60 border-none"
                                >
                                  {/* Spacer */}
                                </td>
                              )}

                              {/* 12. KESIMPULAN: PCS */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-3 px-2 text-center align-middle font-mono font-bold text-sm text-red-600 dark:text-red-400 bg-white dark:bg-slate-900"
                                >
                                  {block.totalNet}
                                </td>
                              )}

                              {/* 13. KESIMPULAN: KG */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-3 px-2 text-center align-middle bg-white dark:bg-slate-900"
                                >
                                  {isEditingThisBlock ? (
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={String(block.kg || '')}
                                      onChange={(e) => {
                                        const clean = e.target.value.replace(/[^0-9.]/g, '');
                                        const val = parseFloat(clean) || 0;
                                        setBlocks((prev) =>
                                          prev.map((b) =>
                                            b.id === block.id ? recalculateBlock({ ...b, kg: val }) : b
                                          )
                                        );
                                      }}
                                      placeholder="0.0"
                                      className="w-16 px-1.5 py-1 text-center font-bold text-blue-600 border border-blue-400 rounded text-xs outline-none bg-blue-50/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                  ) : (
                                    <span className="font-mono font-bold text-xs text-blue-700 dark:text-blue-300">
                                      {block.kg.toFixed(1)}
                                    </span>
                                  )}
                                </td>
                              )}

                              {/* 14. KESIMPULAN: ONGKIR */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-3 px-2 text-center align-middle font-mono font-bold text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900"
                                >
                                  {isEditingThisBlock ? (
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={String(block.ongkirPerKg || '')}
                                      onChange={(e) => {
                                        const clean = e.target.value.replace(/\D/g, '');
                                        const val = parseInt(clean, 10) || 0;
                                        setBlocks((prev) =>
                                          prev.map((b) =>
                                            b.id === block.id ? recalculateBlock({ ...b, ongkirPerKg: val }) : b
                                          )
                                        );
                                      }}
                                      placeholder="0"
                                      className="w-16 px-1.5 py-1 text-center font-bold text-slate-800 border border-emerald-400 rounded text-xs outline-none bg-emerald-50/50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                    />
                                  ) : (
                                    <span>{block.ongkirPerKg.toLocaleString('id-ID')}</span>
                                  )}
                                </td>
                              )}

                              {/* 15. KESIMPULAN: TOTAL ONGKIR */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-3 px-2 text-center align-middle font-mono font-bold text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900"
                                >
                                  {block.totalOngkir.toLocaleString('id-ID')}
                                </td>
                              )}

                              {/* 16. KESIMPULAN: ONGKIR/PCS */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-3 px-2 text-center align-middle font-mono font-bold text-xs text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900"
                                >
                                  {block.ongkirPerPcs.toLocaleString('id-ID')}
                                </td>
                              )}
                            </tr>
                          );
                        });
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
