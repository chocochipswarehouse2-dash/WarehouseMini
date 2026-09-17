import React, { useState, useEffect, useMemo, useDeferredValue } from 'react';
import {
  Printer,
  X,
  Copy,
  Check,
  Info,
  Layers,
  MapPin,
  Search,
  CheckSquare,
  Square,
  AlertCircle,
  Eye,
  RotateCcw,
  Sparkles,
  Plus,
  Minus,
  SlidersHorizontal,
  RotateCw,
} from 'lucide-react';
import QRCode from 'qrcode';

export interface ThermalTicketItem {
  id?: string | number;
  ticket_no: string;
  sku: string;
  nama_produk: string;
  size?: string;
  qty: number;
  kategori_rusak?: string;
  detail_kerusakan?: string;
  lokasi_sekarang?: string;
  tanggal?: string;
  acc_harga_defect?: number;
  acc_harga_by?: string;
  tahap?: string;
}

export interface ThermalStickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  // Single ticket mode
  ticket?: ThermalTicketItem | null;
  // Bulk / massal tickets mode
  tickets?: ThermalTicketItem[] | null;
  // Initial location filter (e.g. 'DF001' or 'DF-01')
  initialLocationFilter?: string;
  // Pool of all tickets for location switching
  allTickets?: ThermalTicketItem[];
}

// Normalizer for flexible location matching (e.g. DF001 matches DF-01, DF-001, etc.)
export const normalizeLocation = (loc?: string): string => {
  if (!loc) return '';
  const cleaned = loc.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  const match = cleaned.match(/^([A-Z]+)0*(\d+)$/);
  if (match) {
    return `${match[1]}${match[2]}`; // e.g. DF001 -> DF1, DF-01 -> DF1
  }
  return cleaned;
};

export const isLocationMatch = (locA?: string, locB?: string): boolean => {
  if (!locA || !locB) return false;
  if (locB === 'ALL') return true;
  const normA = normalizeLocation(locA);
  const normB = normalizeLocation(locB);
  if (normA && normB && normA === normB) return true;
  const rawA = locA.toUpperCase().replace(/[^a-zA-Z0-9]/g, '');
  const rawB = locB.toUpperCase().replace(/[^a-zA-Z0-9]/g, '');
  return rawA.includes(rawB) || rawB.includes(rawA);
};

export interface TicketDisplayData {
  sku: string;
  nama: string;
  size: string;
  lokasi: string;
  ticketNo: string;
}

export const getTicketDisplayData = (t?: ThermalTicketItem | null): TicketDisplayData => {
  if (!t) {
    return { sku: '', nama: '', size: '-', lokasi: '', ticketNo: '' };
  }

  const cleanSku = (t.sku || '').trim();
  let nama = (t.nama_produk || '').trim();

  // Bersihkan size
  let size = (t.size || '').trim();
  const isDummySize =
    !size ||
    size === '-' ||
    size.toLowerCase() === 'default' ||
    size.toLowerCase() === 'none';

  if (isDummySize) {
    // 1. Cek apakah size tertulis di akhir SKU (cth: ...PWS -> S, ...WHL -> L)
    const skuSizeRegex = /([A-Z0-9]+)(XS|S|M|L|XL|XXL|XXXL|2XL|3XL)$/i;
    // 2. Cek apakah size ada di ujung nama produk (cth: "Tifara Dress S", "Torin Skirt Cream XL")
    const sizeEndRegex =
      /(?:[\s\-_/|(),]+)(xs|s|m|l|xl|xxl|xxxl|2xl|3xl|all\s*size|onesize|free\s*size)(?:[\s\-_/|()]*)$/i;
    const matchName = nama.match(sizeEndRegex);

    if (matchName) {
      size = matchName[1].trim().toUpperCase();
    } else {
      const matchSku = cleanSku.match(skuSizeRegex);
      if (matchSku) {
        size = matchSku[2].trim().toUpperCase();
      } else {
        size = 'ALL SIZE';
      }
    }
  } else {
    size = size.toUpperCase();
  }

  // Format Lokasi Rak
  let lokasi = (t.lokasi_sekarang || '').trim().toUpperCase();
  if (lokasi === 'DEFAULT' || lokasi === 'NONE') lokasi = '';

  return {
    sku: cleanSku,
    nama,
    size,
    lokasi,
    ticketNo: (t.ticket_no || '').trim(),
  };
};

export const ThermalStickerModal: React.FC<ThermalStickerModalProps> = ({
  isOpen,
  onClose,
  ticket,
  tickets,
  initialLocationFilter = 'ALL',
  allTickets = [],
}) => {
  // Determine if this is initially bulk mode
  const hasMultipleInput = Boolean(tickets && tickets.length > 0);
  const [isBulkMode, setIsBulkMode] = useState<boolean>(hasMultipleInput);

  // Single ticket state: Defaults to ticket.qty (1 per physical piece)
  const [singleCopies, setSingleCopies] = useState<number>(1);
  const [isCopied, setIsCopied] = useState(false);

  // Print orientation & rotation settings
  const [printOrientation, setPrintOrientation] = useState<'landscape' | 'portrait'>('landscape');
  const [isRotated180, setIsRotated180] = useState<boolean>(false);

  // Bulk mode state
  const [selectedLocation, setSelectedLocation] = useState<string>(initialLocationFilter || 'ALL');
  const [bulkSearchQuery, setBulkSearchQuery] = useState<string>('');
  const deferredSearch = useDeferredValue(bulkSearchQuery);
  // Default format: BY_QTY (sejumlah barang fisik, misal DF001 ada 48 pcs -> cetak 48 stiker)
  const [bulkCopyMode, setBulkCopyMode] = useState<'BY_QTY' | 'ONE_PER_TICKET'>('BY_QTY');
  const [selectedTicketNos, setSelectedTicketNos] = useState<Set<string>>(new Set());
  // Custom copies per ticket: ticket_no -> copies
  const [ticketCopiesMap, setTicketCopiesMap] = useState<Record<string, number>>({});
  const [previewIndex, setPreviewIndex] = useState<number>(0);

  // Filter mode: 'ALL' or 'ONLY_SELECTED'
  const [listTabFilter, setListTabFilter] = useState<'ALL' | 'SELECTED'>('ALL');

  // QR Code store map: ticket_no -> dataUrl
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [isGeneratingQr, setIsGeneratingQr] = useState<boolean>(false);

  // Combined pool of available tickets for bulk selection (allow searching/filtering full pool)
  const rawTicketPool = useMemo(() => {
    if (allTickets && allTickets.length > 0) return allTickets;
    if (tickets && tickets.length > 0) return tickets;
    if (ticket) return [ticket];
    return [];
  }, [allTickets, tickets, ticket]);

  // Unique list of locations available in the pool
  const availableLocations = useMemo(() => {
    const set = new Set<string>();
    rawTicketPool.forEach((t) => {
      const loc = t.lokasi_sekarang?.trim().toUpperCase();
      if (loc) set.add(loc);
    });
    return Array.from(set).sort();
  }, [rawTicketPool]);

  // Sync state whenever modal opens or props change
  useEffect(() => {
    if (isOpen) {
      const isMulti = Boolean(tickets && tickets.length > 0);
      setIsBulkMode(isMulti);
      if (ticket) {
        // In single mode, default to ticket.qty (e.g. 5 pcs = 5 stiker)
        setSingleCopies(Math.max(1, ticket.qty || 1));
      } else {
        setSingleCopies(1);
      }
      setSelectedLocation(initialLocationFilter || 'ALL');
      setBulkSearchQuery('');
      setPreviewIndex(0);
      setBulkCopyMode('BY_QTY');
      setListTabFilter('ALL');
    }
  }, [isOpen, ticket, tickets, initialLocationFilter]);

  // Filtered tickets based on location & search query in bulk mode
  const filteredBulkTickets = useMemo(() => {
    return rawTicketPool.filter((t) => {
      // Location matching (DF001 matches DF-01, DF-001, etc.)
      if (selectedLocation !== 'ALL') {
        if (!isLocationMatch(t.lokasi_sekarang, selectedLocation)) {
          return false;
        }
      }

      // Search query matching (SKU, Nama, No Tiket, Size, Warna, Lokasi)
      if (deferredSearch.trim()) {
        const q = deferredSearch.toUpperCase().trim();
        const noMatch = t.ticket_no.toUpperCase().includes(q);
        const skuMatch = t.sku.toUpperCase().includes(q);
        const namaMatch = t.nama_produk.toUpperCase().includes(q);
        const sizeMatch = (t.size || '').toUpperCase().includes(q);
        const lokMatch = (t.lokasi_sekarang || '').toUpperCase().includes(q);
        const katMatch = (t.kategori_rusak || '').toUpperCase().includes(q);
        if (!noMatch && !skuMatch && !namaMatch && !sizeMatch && !lokMatch && !katMatch) {
          return false;
        }
      }

      return true;
    });
  }, [rawTicketPool, selectedLocation, deferredSearch]);

  // Automatically select all filtered tickets & initialize copies to ticket.qty when location changes
  useEffect(() => {
    if (isBulkMode && filteredBulkTickets.length > 0) {
      setSelectedTicketNos(new Set(filteredBulkTickets.map((t) => t.ticket_no)));
      setTicketCopiesMap((prev) => {
        const next = { ...prev };
        filteredBulkTickets.forEach((t) => {
          if (next[t.ticket_no] === undefined) {
            next[t.ticket_no] = Math.max(1, t.qty || 1);
          }
        });
        return next;
      });
      setPreviewIndex(0);
    }
  }, [isBulkMode, selectedLocation, filteredBulkTickets]);

  // When bulkCopyMode changes, update ticketCopiesMap
  const handleBulkCopyModeChange = (mode: 'BY_QTY' | 'ONE_PER_TICKET') => {
    setBulkCopyMode(mode);
    setTicketCopiesMap((prev) => {
      const next = { ...prev };
      filteredBulkTickets.forEach((t) => {
        next[t.ticket_no] = mode === 'BY_QTY' ? Math.max(1, t.qty || 1) : 1;
      });
      return next;
    });
  };

  // Adjust copies for a single ticket
  const handleTicketCopiesChange = (ticketNo: string, newCopies: number) => {
    const val = Math.max(1, Math.min(999, newCopies));
    setTicketCopiesMap((prev) => ({
      ...prev,
      [ticketNo]: val,
    }));
  };

  // Generate QR Codes whenever tickets change
  useEffect(() => {
    if (!isOpen) return;
    let isMounted = true;

    const ticketsToProcess = isBulkMode
      ? filteredBulkTickets
      : ticket
      ? [ticket]
      : [];

    if (ticketsToProcess.length === 0) return;

    // Filter tickets that don't have QR yet
    const needed = ticketsToProcess.filter((t) => !qrMap[t.ticket_no]);
    if (needed.length === 0) return;

    setIsGeneratingQr(true);

    Promise.all(
      needed.map(async (t) => {
        try {
          const url = await QRCode.toDataURL(t.ticket_no, {
            margin: 0,
            width: 80,
            errorCorrectionLevel: 'M',
          });
          return { ticket_no: t.ticket_no, url };
        } catch (err) {
          console.error('QR generation error for', t.ticket_no, err);
          return null;
        }
      })
    )
      .then((results) => {
        if (!isMounted) return;
        const updates: Record<string, string> = {};
        results.forEach((r) => {
          if (r) updates[r.ticket_no] = r.url;
        });
        setQrMap((prev) => ({ ...prev, ...updates }));
      })
      .finally(() => {
        if (isMounted) setIsGeneratingQr(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, isBulkMode, filteredBulkTickets, ticket]);

  // Calculate printable sticker list (including multi-copies if configured)
  interface PrintableItem {
    ticket: ThermalTicketItem;
    copyIndex: number;
    totalCopies: number;
  }

  const printableStickers: PrintableItem[] = useMemo(() => {
    if (!isBulkMode) {
      if (!ticket) return [];
      const count = Math.max(1, singleCopies);
      return Array.from({ length: count }, (_, i) => ({
        ticket,
        copyIndex: i + 1,
        totalCopies: count,
      }));
    }

    // Bulk Mode: Print for each selected ticket using its copy count
    const items: PrintableItem[] = [];
    filteredBulkTickets.forEach((t) => {
      if (!selectedTicketNos.has(t.ticket_no)) return;
      const copies = Math.max(1, ticketCopiesMap[t.ticket_no] ?? (t.qty || 1));
      for (let i = 0; i < copies; i++) {
        items.push({
          ticket: t,
          copyIndex: i + 1,
          totalCopies: copies,
        });
      }
    });

    return items;
  }, [isBulkMode, ticket, singleCopies, filteredBulkTickets, selectedTicketNos, ticketCopiesMap]);

  // Total physical pieces in currently filtered tickets
  const totalPhysicalPcsFiltered = useMemo(() => {
    return filteredBulkTickets.reduce((sum, t) => sum + (t.qty || 1), 0);
  }, [filteredBulkTickets]);

  // Total physical pieces among selected tickets
  const totalPhysicalPcsSelected = useMemo(() => {
    return filteredBulkTickets
      .filter((t) => selectedTicketNos.has(t.ticket_no))
      .reduce((sum, t) => sum + (t.qty || 1), 0);
  }, [filteredBulkTickets, selectedTicketNos]);

  if (!isOpen || (!ticket && (!tickets || tickets.length === 0) && allTickets.length === 0)) {
    return null;
  }

  const handlePrint = () => {
    if (printableStickers.length === 0) {
      alert('Tidak ada stiker tiket yang dipilih untuk dicetak!');
      return;
    }

    // Direct Thermal Iframe Printing (Guarantees true 50x20mm page cuts without browser style bleed)
    try {
      const iframeId = 'thermal-direct-print-iframe';
      let printFrame = document.getElementById(iframeId) as HTMLIFrameElement | null;
      if (printFrame) {
        document.body.removeChild(printFrame);
      }
      printFrame = document.createElement('iframe');
      printFrame.id = iframeId;
      printFrame.style.position = 'fixed';
      printFrame.style.top = '-9999px';
      printFrame.style.left = '-9999px';
      const isPortrait = printOrientation === 'portrait';
      const pageW = isPortrait ? '20mm' : '50mm';
      const pageH = isPortrait ? '50mm' : '20mm';
      const orientMode = isPortrait ? 'portrait' : 'landscape';

      printFrame.style.width = pageW;
      printFrame.style.height = pageH;
      printFrame.style.border = 'none';
      document.body.appendChild(printFrame);

      const doc = printFrame.contentDocument || printFrame.contentWindow?.document;
      if (doc) {
        let stickersHtml = '';
        printableStickers.forEach((item, idx) => {
          const t = item.ticket;
          const qrSrc = qrMap[t.ticket_no] || '';
          const isLast = idx === printableStickers.length - 1;
          const copyBadge = item.totalCopies > 1 ? ` (${item.copyIndex}/${item.totalCopies})` : '';
          const data = getTicketDisplayData(t);

          stickersHtml += `
            <div class="thermal-page-wrapper" style="page-break-after: ${isLast ? 'auto' : 'always'}; break-after: ${isLast ? 'auto' : 'page'};">
              <div class="thermal-page-inner">
                <div class="thermal-qr-container">
                  ${qrSrc ? `<img src="${qrSrc}" alt="QR" />` : '<div style="font-size:7pt;text-align:center;">QR</div>'}
                </div>
                <div class="thermal-text-container">
                  <div class="thermal-sku-title">${data.sku}</div>
                  <div class="thermal-name-title">${data.nama}</div>
                  <div class="thermal-meta-details">
                    <span class="thermal-meta-size">SZ: ${data.size}</span>
                    ${data.lokasi ? `<span class="thermal-meta-dot">•</span><span class="thermal-meta-loc">Rak: ${data.lokasi}</span>` : ''}
                  </div>
                  <div class="thermal-ticket-row">
                    <span class="thermal-ticket-no">#${data.ticketNo}${copyBadge}</span>
                  </div>
                </div>
              </div>
            </div>
          `;
        });

        const fullHtml = `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8" />
            <title>Cetak Label Barcode 50x20mm</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@600;700&family=Quicksand:wght@500;600;700;800&display=swap" rel="stylesheet">
            <style>
              @page {
                size: ${pageW} ${pageH} ${orientMode};
                margin: 0mm !important;
              }
              *, *::before, *::after {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
              }
              html, body {
                width: ${pageW} !important;
                height: ${pageH} !important;
                margin: 0 !important;
                padding: 0 !important;
                background: #ffffff !important;
                color: #000000 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
              }
              .thermal-page-wrapper {
                display: block !important;
                position: relative !important;
                width: ${pageW} !important;
                height: ${pageH} !important;
                max-width: ${pageW} !important;
                max-height: ${pageH} !important;
                page-break-before: auto !important;
                page-break-inside: avoid !important;
                break-before: auto !important;
                break-inside: avoid !important;
                
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box !important;
                ${isRotated180 ? 'transform: rotate(180deg); transform-origin: center center;' : ''}
              }
              .thermal-page-inner {
                width: ${pageW} !important;
                height: ${pageH} !important;
                max-width: ${pageW} !important;
                max-height: ${pageH} !important;
                box-sizing: border-box !important;
                padding: ${isPortrait ? '1.0mm 1.2mm' : '0.8mm 1.5mm'} !important;
                display: flex !important;
                flex-direction: ${isPortrait ? 'column' : 'row'} !important;
                align-items: center !important;
                justify-content: ${isPortrait ? 'center' : 'flex-start'} !important;
                
                background: #ffffff !important;
                color: #000000 !important;
              }
              .thermal-qr-container {
                width: ${isPortrait ? '13.0mm' : '13.5mm'} !important;
                height: ${isPortrait ? '13.0mm' : '13.5mm'} !important;
                margin-right: ${isPortrait ? '0' : '1.5mm'} !important;
                margin-bottom: ${isPortrait ? '1mm' : '0'} !important;
                flex-shrink: 0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
              }
              .thermal-qr-container img {
                width: 100% !important;
                height: 100% !important;
                object-fit: contain !important;
                image-rendering: pixelated !important;
              }
              .thermal-text-container {
                flex: 1 !important;
                min-width: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: center !important;
                
                line-height: 1.15 !important;
                ${isPortrait ? 'text-align: center; width: 100%;' : ''}
              }
              .thermal-sku-title {
                font-size: ${isPortrait ? '6.8pt' : '7.5pt'} !important;
                font-weight: 800 !important;
                line-height: 1.15 !important;
                word-break: break-word !important; white-space: normal !important;
                
                
                letter-spacing: -0.1px !important;
                color: #000000 !important;
              }
              .thermal-name-title {
                font-size: ${isPortrait ? '5.8pt' : '6.2pt'} !important;
                font-weight: 600 !important;
                line-height: 1.15 !important;
                color: #111111 !important;
                display: block !important;
                
                
                
                word-break: break-word !important;
              }
              .thermal-meta-details {
                font-size: ${isPortrait ? '5.8pt' : '6.2pt'} !important;
                font-weight: 700 !important;
                line-height: 1.15 !important;
                display: flex !important;
                align-items: center !important;
                gap: 3px !important;
                margin-top: 0.3mm !important;
                color: #111111 !important;
                ${isPortrait ? 'justify-content: center;' : ''}
              }
              .thermal-meta-size {
                word-break: break-word !important; white-space: normal !important;
              }
              .thermal-meta-dot {
                color: #666666 !important;
                font-size: 5.5pt !important;
              }
              .thermal-meta-loc {
                word-break: break-word !important; white-space: normal !important;
              }
              .thermal-ticket-row {
                margin-top: 0.3mm !important;
                line-height: 1.1 !important;
                ${isPortrait ? 'text-align: center;' : ''}
              }
              .thermal-ticket-no {
                font-size: ${isPortrait ? '5.6pt' : '6.0pt'} !important;
                font-family: 'JetBrains Mono', monospace !important;
                font-weight: 700 !important;
                color: #000000 !important;
                word-break: break-word !important; white-space: normal !important;
                letter-spacing: -0.1px !important;
              }
            </style>
          </head>
          <body>
            ${stickersHtml}
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
          } catch {
            window.print();
          }
        }, 300);
        return;
      }
    } catch (e) {
      console.warn('Iframe print failed, falling back to window.print():', e);
    }

    // Fallback: window.print()
    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.error('Print trigger error:', err);
      }
    }, 150);
  };

  const handleCopyTicket = (ticketNo: string) => {
    navigator.clipboard.writeText(ticketNo);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const toggleSelectTicket = (ticketNo: string) => {
    setSelectedTicketNos((prev) => {
      const next = new Set(prev);
      if (next.has(ticketNo)) next.delete(ticketNo);
      else next.add(ticketNo);
      return next;
    });
  };

  const selectAll = () => {
    setSelectedTicketNos(new Set(filteredBulkTickets.map((t) => t.ticket_no)));
  };

  const deselectAll = () => {
    setSelectedTicketNos(new Set());
  };

  const selectOnlyCurrentSearch = () => {
    setSelectedTicketNos(new Set(filteredBulkTickets.map((t) => t.ticket_no)));
  };

  // Preview ticket currently displayed on screen
  const currentPreviewTicket: ThermalTicketItem | null = isBulkMode
    ? filteredBulkTickets[previewIndex] || filteredBulkTickets[0] || null
    : ticket || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in">
      {/* 
        =======================================================================
        HIDDEN PRINT CONTAINER FOR THERMAL PRINTER (50mm x 20mm)
        =======================================================================
      */}
      <div id="thermal-sticker-50x20-print" className="hidden print:block">
        <style
          dangerouslySetInnerHTML={{
            __html: `
            @media print {
              @page {
                size: ${printOrientation === 'portrait' ? '20mm 50mm portrait' : '50mm 20mm landscape'};
                margin: 0mm !important;
              }
              body {
                margin: 0 !important;
                padding: 0 !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                background: white !important;
              }
              body * {
                visibility: hidden !important;
              }
              #thermal-sticker-50x20-print, #thermal-sticker-50x20-print * {
                visibility: visible !important;
              }
              #thermal-sticker-50x20-print {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: ${printOrientation === 'portrait' ? '20mm' : '50mm'} !important;
                display: block !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .thermal-page-wrapper {
                display: block !important;
                position: relative !important;
                width: ${printOrientation === 'portrait' ? '20mm' : '50mm'} !important;
                height: ${printOrientation === 'portrait' ? '50mm' : '20mm'} !important;
                max-width: ${printOrientation === 'portrait' ? '20mm' : '50mm'} !important;
                max-height: ${printOrientation === 'portrait' ? '50mm' : '20mm'} !important;
                page-break-before: auto !important;
                page-break-inside: avoid !important;
                break-before: auto !important;
                break-inside: avoid !important;
                
                margin: 0 !important;
                padding: 0 !important;
                box-sizing: border-box !important;
                ${isRotated180 ? 'transform: rotate(180deg); transform-origin: center center;' : ''}
              }
              .thermal-page-inner {
                width: ${printOrientation === 'portrait' ? '20mm' : '50mm'} !important;
                height: ${printOrientation === 'portrait' ? '50mm' : '20mm'} !important;
                max-width: ${printOrientation === 'portrait' ? '20mm' : '50mm'} !important;
                max-height: ${printOrientation === 'portrait' ? '50mm' : '20mm'} !important;
                box-sizing: border-box !important;
                padding: ${printOrientation === 'portrait' ? '1.0mm 1.2mm' : '0.8mm 1.5mm'} !important;
                display: flex !important;
                flex-direction: ${printOrientation === 'portrait' ? 'column' : 'row'} !important;
                align-items: center !important;
                justify-content: ${printOrientation === 'portrait' ? 'center' : 'flex-start'} !important;
                background: white !important;
                color: black !important;
                font-family: 'Quicksand', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif !important;
                
              }
              .thermal-qr-container {
                width: ${printOrientation === 'portrait' ? '13.0mm' : '13.5mm'} !important;
                height: ${printOrientation === 'portrait' ? '13.0mm' : '13.5mm'} !important;
                margin-right: ${printOrientation === 'portrait' ? '0' : '1.5mm'} !important;
                margin-bottom: ${printOrientation === 'portrait' ? '1mm' : '0'} !important;
                flex-shrink: 0 !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
              }
              .thermal-qr-container img {
                width: 100% !important;
                height: 100% !important;
                object-fit: contain !important;
                image-rendering: pixelated !important;
              }
              .thermal-text-container {
                flex: 1 !important;
                min-width: 0 !important;
                display: flex !important;
                flex-direction: column !important;
                justify-content: center !important;
                
                line-height: 1.15 !important;
                ${printOrientation === 'portrait' ? 'text-align: center; width: 100%;' : ''}
              }
              .thermal-sku-title {
                font-size: ${printOrientation === 'portrait' ? '6.8pt' : '7.5pt'} !important;
                font-weight: 800 !important;
                line-height: 1.15 !important;
                word-break: break-word !important; white-space: normal !important;
                
                
                letter-spacing: -0.1px !important;
                color: #000000 !important;
              }
              .thermal-name-title {
                font-size: ${printOrientation === 'portrait' ? '5.8pt' : '6.2pt'} !important;
                font-weight: 600 !important;
                line-height: 1.15 !important;
                color: #111111 !important;
                display: block !important;
                
                
                
                word-break: break-word !important;
              }
              .thermal-meta-details {
                font-size: ${printOrientation === 'portrait' ? '5.8pt' : '6.2pt'} !important;
                font-weight: 700 !important;
                line-height: 1.15 !important;
                display: flex !important;
                align-items: center !important;
                gap: 3px !important;
                margin-top: 0.3mm !important;
                color: #111111 !important;
                ${printOrientation === 'portrait' ? 'justify-content: center;' : ''}
              }
              .thermal-meta-size {
                word-break: break-word !important; white-space: normal !important;
              }
              .thermal-meta-dot {
                color: #666666 !important;
                font-size: 5.5pt !important;
              }
              .thermal-meta-loc {
                word-break: break-word !important; white-space: normal !important;
              }
              .thermal-ticket-row {
                margin-top: 0.3mm !important;
                line-height: 1.1 !important;
                ${printOrientation === 'portrait' ? 'text-align: center;' : ''}
              }
              .thermal-ticket-no {
                font-size: ${printOrientation === 'portrait' ? '5.6pt' : '6.0pt'} !important;
                font-family: 'JetBrains Mono', monospace !important;
                font-weight: 700 !important;
                color: #000000 !important;
                word-break: break-word !important; white-space: normal !important;
                letter-spacing: -0.1px !important;
              }
            }
          `,
          }}
        />

        {printableStickers.map((item, idx) => {
          const t = item.ticket;
          const qrSrc = qrMap[t.ticket_no];
          const isLast = idx === printableStickers.length - 1;
          const copyBadge = item.totalCopies > 1 ? ` (${item.copyIndex}/${item.totalCopies})` : '';
          const data = getTicketDisplayData(t);

          return (
            <div
              key={`print-stk-${t.ticket_no}-${item.copyIndex}-${idx}`}
              className="thermal-page-wrapper"
              style={{
                pageBreakAfter: isLast ? 'auto' : 'always',
                breakAfter: isLast ? 'auto' : 'page',
              }}
            >
              <div className="thermal-page-inner">
                <div className="thermal-qr-container">
                  {qrSrc ? (
                    <img src={qrSrc} alt="QR" />
                  ) : (
                    <div style={{ fontSize: '7pt', textAlign: 'center' }}>QR</div>
                  )}
                </div>

                <div className="thermal-text-container">
                  <div className="thermal-sku-title">
                    {data.sku}
                  </div>

                  <div className="thermal-name-title">
                    {data.nama}
                  </div>

                  <div className="thermal-meta-details">
                    <span className="thermal-meta-size">SZ: {data.size}</span>
                    {data.lokasi && (
                      <>
                        <span className="thermal-meta-dot">•</span>
                        <span className="thermal-meta-loc">Rak: {data.lokasi}</span>
                      </>
                    )}
                  </div>

                  <div className="thermal-ticket-row">
                    <span className="thermal-ticket-no">
                      #{data.ticketNo}{copyBadge}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 
        =======================================================================
        INTERACTIVE MODAL DIALOG (DESKTOP / MOBILE)
        =======================================================================
      */}
      <div className="bg-white dark:bg-slate-900 w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0 border border-purple-200 dark:border-purple-800">
              <Printer className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 dark:text-white">
                  {isBulkMode ? 'Cetak Barcode Massal Thermal (50×20 mm)' : 'Cetak Stiker Barcode (50×20 mm)'}
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                  {isBulkMode ? `${printableStickers.length} Stiker Siap Cetak` : 'Thermal Label'}
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {isBulkMode
                  ? 'Cetak label barcode per fisik barang di rak atau pilih produk tertentu'
                  : 'Stiker barcode label tempel untuk fisik pakaian defect/perbaikan'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="space-y-3.5 overflow-y-auto pr-1 flex-1 py-3">
          {/* ========================================================= */}
          {/* BULK MODE CONTROLS: Location Filter, Search & Options    */}
          {/* ========================================================= */}
          {isBulkMode ? (
            <div className="space-y-2.5 p-3 bg-purple-50/60 dark:bg-purple-950/20 rounded-xl border border-purple-200/80 dark:border-purple-900/50">
              {/* Row 1: Location Dropdown + Search Produk Tertentu */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 justify-between">
                {/* Filter Lokasi Rak */}
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <MapPin className="w-4 h-4 text-purple-600 shrink-0" />
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300 shrink-0">Lokasi:</span>
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-xs font-bold font-mono text-purple-700 dark:text-purple-300 outline-none cursor-pointer"
                  >
                    <option value="ALL">Semua Lokasi ({rawTicketPool.length} Tiket)</option>
                    {availableLocations.map((loc) => {
                      const matchingTickets = rawTicketPool.filter((t) =>
                        isLocationMatch(t.lokasi_sekarang, loc)
                      );
                      const totalPcs = matchingTickets.reduce((sum, t) => sum + (t.qty || 1), 0);
                      return (
                        <option key={loc} value={loc}>
                          Rak {loc} ({totalPcs} pcs • {matchingTickets.length} tiket)
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* Search Bar Produk Tertentu */}
                <div className="relative flex-1 min-w-0 sm:max-w-[240px]">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={bulkSearchQuery}
                    onChange={(e) => setBulkSearchQuery(e.target.value)}
                    placeholder="Cari SKU / Produk / Tiket..."
                    className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-slate-800 border border-purple-300 dark:border-purple-700 rounded-lg text-xs text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  {bulkSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setBulkSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Row 2: Summary Stats Card (Total Barang, Tiket, Stiker) */}
              <div className="grid grid-cols-3 gap-2 p-2 bg-white dark:bg-slate-900 rounded-lg border border-purple-200 dark:border-purple-900/60 text-center">
                <div>
                  <div className="text-[10px] uppercase font-bold text-slate-400">Total Fisik Baju</div>
                  <div className="text-sm font-black text-slate-800 dark:text-slate-100 font-mono">
                    {totalPhysicalPcsSelected} pcs
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-purple-600">Tiket Terpilih</div>
                  <div className="text-sm font-black text-purple-600 dark:text-purple-400 font-mono">
                    {selectedTicketNos.size} / {filteredBulkTickets.length}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] uppercase font-bold text-emerald-600">Stiker Dicetak</div>
                  <div className="text-sm font-black text-emerald-600 dark:text-emerald-400 font-mono">
                    {printableStickers.length} Lembar
                  </div>
                </div>
              </div>

              {/* Row 3: Mode Lembar Cetak Per Tiket */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-purple-200/50 dark:border-purple-900/40 text-xs">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-bold text-slate-600 dark:text-slate-300">Format Cetak:</span>
                  <div className="inline-flex rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 p-0.5">
                    <button
                      type="button"
                      onClick={() => handleBulkCopyModeChange('BY_QTY')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                        bulkCopyMode === 'BY_QTY'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-purple-600'
                      }`}
                      title="Cetak stiker sejumlah fisik barang pada masing-masing tiket (misal 48 pcs = 48 lembar)"
                    >
                      ✨ Sejumlah Fisik Barang ({totalPhysicalPcsSelected} Lembar)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleBulkCopyModeChange('ONE_PER_TICKET')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                        bulkCopyMode === 'ONE_PER_TICKET'
                          ? 'bg-purple-600 text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-300 hover:text-purple-600'
                      }`}
                      title="Cetak hanya 1 stiker untuk setiap nomor tiket"
                    >
                      1 Stiker per Tiket ({selectedTicketNos.size} Lembar)
                    </button>
                  </div>
                </div>

                {/* Seleksi Checkbox All / None / Filtered */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={selectAll}
                    className="text-[11px] font-bold text-purple-600 hover:underline cursor-pointer"
                  >
                    Pilih Semua ({filteredBulkTickets.length})
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={deselectAll}
                    className="text-[11px] font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    Batal Pilih
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* ========================================================= */
            /* SINGLE TICKET CONTROLS                                    */
            /* ========================================================= */
            <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 space-y-2">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-slate-700 dark:text-slate-300">
                  Jumlah Cetak Stiker untuk Tiket #{ticket?.ticket_no}:
                </span>
                <span className="font-mono text-purple-600 dark:text-purple-400">
                  {singleCopies} Lembar Stiker
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {ticket && (
                  <button
                    type="button"
                    onClick={() => setSingleCopies(Math.max(1, ticket.qty || 1))}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                      singleCopies === ticket.qty
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300'
                    }`}
                  >
                    Sesuai Qty Barang ({ticket.qty} Lembar)
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSingleCopies(1)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg cursor-pointer transition-all ${
                    singleCopies === 1
                      ? 'bg-purple-600 text-white shadow-xs'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-300'
                  }`}
                >
                  1 Lembar Saja
                </button>

                <div className="flex items-center gap-1.5 ml-auto">
                  <span className="text-xs text-slate-500 font-semibold">Atur Manual:</span>
                  <div className="flex items-center border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
                    <button
                      type="button"
                      onClick={() => setSingleCopies((prev) => Math.max(1, prev - 1))}
                      className="px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <input
                      type="number"
                      min={1}
                      max={999}
                      value={singleCopies}
                      onChange={(e) => setSingleCopies(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-12 px-1 py-1 text-center font-mono font-bold text-xs bg-transparent text-slate-900 dark:text-white outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setSingleCopies((prev) => prev + 1)}
                      className="px-2 py-1 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex items-start gap-1.5 text-[10px] text-slate-500 leading-snug">
                <Info className="w-3.5 h-3.5 text-purple-500 shrink-0 mt-0.5" />
                <span>
                  Tiket ini memiliki <b>{ticket?.qty || 1} pcs</b> baju di lokasi <b>{ticket?.lokasi_sekarang || 'DF-01'}</b>. Pilih <i>"Sesuai Qty Barang"</i> untuk mencetak 1 stiker per helai baju, atau <i>"1 Lembar Saja"</i> jika hanya butuh 1 stiker barcode.
                </span>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* REALISTIC SCREEN PREVIEW (50x20 mm aspect ratio 2.5:1)    */}
          {/* ========================================================= */}
          <div className="space-y-2">
            {/* Control Bar: Orientasi Kertas Cetak & Rotasi */}
            <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-purple-50/70 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-900/50 rounded-xl text-xs">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="font-extrabold text-slate-700 dark:text-slate-300">Orientasi Kertas:</span>
                <div className="inline-flex rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 p-0.5">
                  <button
                    type="button"
                    onClick={() => setPrintOrientation('landscape')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                      printOrientation === 'landscape'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-purple-600'
                    }`}
                    title="Orientasi mendatar 50×20 mm (Standar Roll Thermal)"
                  >
                    ↔️ Lanskap (50×20 mm)
                  </button>
                  <button
                    type="button"
                    onClick={() => setPrintOrientation('portrait')}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-bold cursor-pointer transition-all ${
                      printOrientation === 'portrait'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-300 hover:text-purple-600'
                    }`}
                    title="Pilih jika driver printer thermal Anda mewajibkan cetak tegak / vertikal"
                  >
                    ↕️ Portret (20×50 mm)
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsRotated180((prev) => !prev)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer flex items-center gap-1 ${
                    isRotated180
                      ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                      : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700 hover:bg-slate-50'
                  }`}
                  title="Putar balik 180 derajat jika label terpasang terbalik pada printer"
                >
                  <RotateCw className={`w-3 h-3 transition-transform duration-200 ${isRotated180 ? 'rotate-180' : ''}`} />
                  <span>{isRotated180 ? 'Rotasi 180° Aktif' : 'Putar 180°'}</span>
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
              <span className="flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5 text-purple-500" />
                <span>
                  Pratinjau Fisik Stiker ({printOrientation === 'portrait' ? '20 × 50 mm Portret' : '50 × 20 mm Lanskap'})
                  {isBulkMode && filteredBulkTickets.length > 1 && (
                    <span className="ml-1 text-purple-600 font-normal">
                      [Tiket {previewIndex + 1} dari {filteredBulkTickets.length}]
                    </span>
                  )}
                </span>
              </span>

              {currentPreviewTicket && (
                <button
                  type="button"
                  onClick={() => handleCopyTicket(currentPreviewTicket.ticket_no)}
                  className="flex items-center gap-1 text-purple-600 hover:underline cursor-pointer"
                >
                  {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{isCopied ? 'Tersalin' : `Salin #${currentPreviewTicket.ticket_no}`}</span>
                </button>
              )}
            </div>

            <div className="flex flex-col items-center justify-center p-3 bg-slate-100 dark:bg-slate-950 rounded-xl border border-dashed border-slate-300 dark:border-slate-800">
              {currentPreviewTicket ? (() => {
                const previewData = getTicketDisplayData(currentPreviewTicket);
                return (
                  <div
                    className={`bg-white text-black p-2.5 rounded-xl shadow-md border border-slate-300 flex select-none gap-2 relative overflow-hidden transition-all ${
                      printOrientation === 'portrait'
                        ? 'w-[150px] h-[270px] flex-col items-center justify-center text-center'
                        : 'w-[310px] h-[124px] flex-row items-center justify-between'
                    } ${isRotated180 ? 'rotate-180' : ''}`}
                    style={{ fontFamily: "'Quicksand', -apple-system, BlinkMacSystemFont, sans-serif" }}
                  >
                    <div
                      className={`${
                        printOrientation === 'portrait'
                          ? 'w-[84px] h-[84px] mb-1'
                          : 'w-[84px] h-[84px]'
                      } shrink-0 flex items-center justify-center bg-white p-1 rounded-lg border border-slate-100`}
                    >
                      {qrMap[currentPreviewTicket.ticket_no] ? (
                        <img
                          src={qrMap[currentPreviewTicket.ticket_no]}
                          alt="QR Code"
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <div className="text-[10px] text-slate-400 animate-pulse">Membuat QR...</div>
                      )}
                    </div>
                    <div
                      className={`flex flex-col justify-center overflow-hidden flex-1 ${
                        printOrientation === 'portrait' ? 'w-full text-center' : ''
                      }`}
                    >
                      <div className="text-[12px] font-extrabold tracking-tight truncate leading-tight text-slate-950">
                        {previewData.sku}
                      </div>
                      <div className="text-[10.5px] font-semibold text-slate-700 leading-snug line-clamp-2 mt-0.5">
                        {previewData.nama}
                      </div>
                      <div
                        className={`flex items-center gap-1.5 text-[9.5px] font-bold text-slate-800 mt-1 ${
                          printOrientation === 'portrait' ? 'justify-center' : ''
                        }`}
                      >
                        <span className="bg-slate-100 px-1 py-0.5 rounded text-slate-900 border border-slate-200">
                          SZ: {previewData.size}
                        </span>
                        {previewData.lokasi && (
                          <span className="bg-blue-50 text-blue-700 px-1 py-0.5 rounded border border-blue-200">
                            Rak: {previewData.lokasi}
                          </span>
                        )}
                      </div>
                      <div
                        className={`mt-1 font-mono text-[9.5px] font-bold text-slate-900 tracking-tight ${
                          printOrientation === 'portrait' ? 'text-center' : ''
                        }`}
                      >
                        #{previewData.ticketNo}
                      </div>
                    </div>
                  </div>
                );
              })() : (
                <div className="text-xs text-slate-400 py-6">Tidak ada tiket yang dipilih untuk dipratinjau</div>
              )}

              {/* Navigation for Bulk Preview */}
              {isBulkMode && filteredBulkTickets.length > 1 && (
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    disabled={previewIndex <= 0}
                    onClick={() => setPreviewIndex((prev) => Math.max(0, prev - 1))}
                    className="px-2 py-0.5 text-[11px] font-bold rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                  >
                    ← Sebelumnya
                  </button>
                  <span className="text-[11px] font-mono font-bold text-slate-500">
                    {previewIndex + 1} / {filteredBulkTickets.length}
                  </span>
                  <button
                    type="button"
                    disabled={previewIndex >= filteredBulkTickets.length - 1}
                    onClick={() => setPreviewIndex((prev) => Math.min(filteredBulkTickets.length - 1, prev + 1))}
                    className="px-2 py-0.5 text-[11px] font-bold rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 disabled:opacity-40 cursor-pointer"
                  >
                    Berikutnya →
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ========================================================= */}
          {/* BULK MODE: Table list of tickets with per-ticket qty      */}
          {/* ========================================================= */}
          {isBulkMode && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs font-bold text-slate-700 dark:text-slate-300">
                <span>
                  Pilih Produk Tertentu ({selectedTicketNos.size} dari {filteredBulkTickets.length} tiket):
                </span>
                <span className="text-purple-600 font-mono font-black">
                  Total: {printableStickers.length} Lembar Stiker
                </span>
              </div>

              <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredBulkTickets.length === 0 ? (
                  <div className="p-4 text-center text-slate-400">
                    Tidak ada tiket yang cocok dengan lokasi / pencarian ini.
                  </div>
                ) : (
                  filteredBulkTickets.map((t, idx) => {
                    const isSelected = selectedTicketNos.has(t.ticket_no);
                    const isCurrentPreview = idx === previewIndex;
                    const copies = ticketCopiesMap[t.ticket_no] ?? (t.qty || 1);

                    return (
                      <div
                        key={`row-t-${t.ticket_no}`}
                        className={`p-2.5 flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors ${
                          isCurrentPreview ? 'bg-purple-50/70 dark:bg-purple-950/40 ring-1 ring-purple-300 dark:ring-purple-700' : ''
                        }`}
                      >
                        {/* Checkbox & Product Info */}
                        <div
                          className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer"
                          onClick={() => toggleSelectTicket(t.ticket_no)}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectTicket(t.ticket_no)}
                            className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 cursor-pointer shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-mono font-black text-purple-600 dark:text-purple-400">
                                #{t.ticket_no}
                              </span>
                              <span className="font-mono font-bold text-slate-900 dark:text-slate-100 truncate">
                                {t.sku}
                              </span>
                              <span className="px-1.5 py-0.2 text-[10px] font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                📍 {t.lokasi_sekarang || 'DF-01'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 truncate mt-0.5">
                              {t.nama_produk} {t.size ? `• SZ: ${t.size}` : ''} • Fisik: <b className="text-slate-800 dark:text-slate-200">{t.qty} pcs</b>
                            </div>
                          </div>
                        </div>

                        {/* Controls: Stepper for custom copies + Preview button */}
                        <div className="flex items-center gap-2 shrink-0">
                          {/* Stepper Jumlah Cetak */}
                          <div className="flex items-center border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden bg-white dark:bg-slate-800">
                            <button
                              type="button"
                              disabled={!isSelected}
                              onClick={() => handleTicketCopiesChange(t.ticket_no, copies - 1)}
                              className="px-1.5 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                              title="Kurangi lembar cetak"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <input
                              type="number"
                              min={1}
                              max={999}
                              disabled={!isSelected}
                              value={copies}
                              onChange={(e) =>
                                handleTicketCopiesChange(t.ticket_no, parseInt(e.target.value) || 1)
                              }
                              className="w-10 px-1 py-1 text-center font-mono font-bold text-[11px] bg-transparent text-purple-700 dark:text-purple-300 disabled:opacity-40 outline-none"
                              title="Jumlah stiker yang akan dicetak untuk tiket ini"
                            />
                            <button
                              type="button"
                              disabled={!isSelected}
                              onClick={() => handleTicketCopiesChange(t.ticket_no, copies + 1)}
                              className="px-1.5 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 cursor-pointer"
                              title="Tambah lembar cetak"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400">lbr</span>

                          <button
                            type="button"
                            onClick={() => setPreviewIndex(idx)}
                            className="px-2 py-1 rounded-lg text-[10px] font-bold text-purple-600 hover:bg-purple-100 dark:hover:bg-purple-950/60 cursor-pointer shrink-0"
                            title="Lihat Pratinjau Stiker"
                          >
                            Lihat
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* SINGLE MODE: Info Detail */}
          {!isBulkMode && ticket && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 text-xs space-y-1">
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Nama Produk:</span>
                <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">
                  {ticket.nama_produk}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Lokasi Rak Saat Ini:</span>
                <span className="font-mono font-bold text-purple-600">
                  {ticket.lokasi_sekarang || 'DF-01'}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600 dark:text-slate-400">
                <span>Jumlah Fisik Baju:</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">{ticket.qty} pcs</span>
              </div>
            </div>
          )}
        </div>

        {/* Tips Setting Thermal Printer & Orientasi Cetak */}
        <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded-xl text-[11px] text-amber-900 dark:text-amber-100 space-y-1.5 shrink-0">
          <div className="flex items-center gap-1.5 font-black text-amber-950 dark:text-amber-50">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Panduan Cetak Thermal 50×20 mm (Agar Tidak Miring / Posisi Portret):</span>
          </div>
          <ul className="list-disc pl-5 space-y-0.5 text-[10.5px] leading-relaxed text-amber-900/90 dark:text-amber-200">
            <li>
              <b>Penyebab Cetak Miring/Tegak:</b> Di dialog cetak Chrome/Edge, pilihan <b>"Tata Letak / Layout"</b> bawaan sering kali masih terpilih <i>"Portret"</i>.
            </li>
            <li>
              <b>Cara Atasi di Dialog Cetak:</b> Pastikan pilih <b>Tata Letak: Lanskap (Landscape)</b>, <b>Ukuran: 50×20 mm</b>, <b>Margin: None</b>, dan <b>Skala: 100%</b>.
            </li>
            <li>
              <b>Jika Roll Printer Anda Berjalan Tegak:</b> Anda dapat langsung klik tombol <b>"↕️ Portret"</b> di atas sebelum menekan Cetak.
            </li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            disabled={printableStickers.length === 0}
            className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-700 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-purple-600/30 transition-all cursor-pointer active:scale-95 disabled:cursor-not-allowed"
          >
            <Printer className="w-4 h-4" />
            <span>
              Cetak {printableStickers.length} Lembar Barcode (50×20 mm)
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-2.5 px-4 rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
