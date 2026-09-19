import React, { useState, useEffect, useRef } from 'react';
import { 
  Printer, 
  Plus, 
  Trash2, 
  QrCode, 
  Layers, 
  Grid, 
  Copy, 
  FileSpreadsheet, 
  Sparkles, 
  Download, 
  Upload, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  X, 
  Eye, 
  Settings2, 
  Sliders, 
  ChevronRight, 
  Tag, 
  FileText, 
  Edit3, 
  HelpCircle,
  Scissors
} from 'lucide-react';
import Papa from 'papaparse';
import QRCode from 'qrcode';

export interface CustomLabelItem {
  id: string;
  judul: string;
  deskripsi: string;
  qr_content: string;
  tag_badge?: string;
  copies: number;
  qr_data_url?: string;
}

export type A6GridMode = 1 | 2 | 4 | 6 | 8;

const STORAGE_KEY = 'wms_custom_label_a6_draft';

export const createQrDataUrl = async (text: string): Promise<string> => {
  try {
    return await QRCode.toDataURL(text || ' ', {
      width: 300,
      margin: 1,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    });
  } catch (err) {
    console.error('Error generating QR code:', err);
    return '';
  }
};

const DEFAULT_ITEMS: CustomLabelItem[] = [
  {
    id: 'item-1',
    judul: 'RAK A-01',
    deskripsi: 'Zona Sepatu & Sandal (Lantai 1)',
    qr_content: 'RAK-A-01',
    tag_badge: 'ZONA A',
    copies: 1,
  },
  {
    id: 'item-2',
    judul: 'RAK A-02',
    deskripsi: 'Zona Sepatu & Sandal (Lantai 1)',
    qr_content: 'RAK-A-02',
    tag_badge: 'ZONA A',
    copies: 1,
  },
  {
    id: 'item-3',
    judul: 'RAK A-03',
    deskripsi: 'Zona Sepatu & Sandal (Lantai 1)',
    qr_content: 'RAK-A-03',
    tag_badge: 'ZONA A',
    copies: 1,
  },
  {
    id: 'item-4',
    judul: 'RAK A-04',
    deskripsi: 'Zona Sepatu & Sandal (Lantai 1)',
    qr_content: 'RAK-A-04',
    tag_badge: 'ZONA A',
    copies: 1,
  },
];

export const LabelCustomTab: React.FC = () => {
  // State Label Items
  const [items, setItems] = useState<CustomLabelItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return DEFAULT_ITEMS;
  });

  // State Grid Mode A6 (1, 2, 4, 6, 8)
  const [gridMode, setGridMode] = useState<A6GridMode>(4);

  // Form Tambah Satuan
  const [formJudul, setFormJudul] = useState('');
  const [formDeskripsi, setFormDeskripsi] = useState('');
  const [formQrContent, setFormQrContent] = useState('');
  const [formTagBadge, setFormTagBadge] = useState('');
  const [formCopies, setFormCopies] = useState<number>(1);

  // Batch Sequence Generator Modal / Drawer
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [seqPrefix, setSeqPrefix] = useState('RAK-A-');
  const [seqStart, setSeqStart] = useState<number>(1);
  const [seqEnd, setSeqEnd] = useState<number>(12);
  const [seqPadDigits, setSeqPadDigits] = useState<number>(2);
  const [seqJudulFormat, setSeqJudulFormat] = useState('RAK {N} - ZONA A');
  const [seqDeskripsiFormat, setSeqDeskripsiFormat] = useState('Area Penyimpanan Utama');
  const [seqQrFormat, setSeqQrFormat] = useState('RAK-A-{N}');
  const [seqBadgeFormat, setSeqBadgeFormat] = useState('ZONA A');
  const [seqCopies, setSeqCopies] = useState<number>(1);

  // Quick Paste / Bulk Input Modal
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // Styling & Print Settings
  const [showQrPayloadText, setShowQrPayloadText] = useState(true);
  const [showCutLines, setShowCutLines] = useState(true);
  const [borderStyle, setBorderStyle] = useState<'solid' | 'dashed' | 'minimal' | 'none'>('solid');
  const [headerTheme, setHeaderTheme] = useState<'dark' | 'light' | 'outline'>('dark');

  // Preview & Notice
  const [previewZoom, setPreviewZoom] = useState<'compact' | 'normal' | 'large'>('normal');
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Generate QR code data URLs for items
  useEffect(() => {
    let isCancelled = false;

    const renderQrCodes = async () => {
      const updated = await Promise.all(
        items.map(async (it) => {
          if (it.qr_data_url && it.qr_data_url.length > 50) return it;
          const url = await createQrDataUrl(it.qr_content || it.judul);
          return { ...it, qr_data_url: url };
        })
      );

      if (!isCancelled) {
        // Only update if there are newly generated URLs
        const hasChanges = updated.some((it, idx) => it.qr_data_url !== items[idx]?.qr_data_url);
        if (hasChanges) {
          setItems(updated);
        }
      }
    };

    renderQrCodes();
    return () => {
      isCancelled = true;
    };
  }, [items]);

  // Persist items to local storage
  useEffect(() => {
    try {
      const cleanToSave = items.map(it => ({
        id: it.id,
        judul: it.judul,
        deskripsi: it.deskripsi,
        qr_content: it.qr_content,
        tag_badge: it.tag_badge,
        copies: it.copies,
      }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanToSave));
    } catch {}
  }, [items]);

  // Tambah Single Item
  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formJudul.trim() && !formQrContent.trim()) {
      alert('Mohon isi Judul Label atau Isi QR Code.');
      return;
    }

    const payload = formQrContent.trim() || formJudul.trim();
    const qrUrl = await createQrDataUrl(payload);

    const newItem: CustomLabelItem = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      judul: formJudul.trim() || payload,
      deskripsi: formDeskripsi.trim(),
      qr_content: payload,
      tag_badge: formTagBadge.trim(),
      copies: Math.max(1, formCopies || 1),
      qr_data_url: qrUrl,
    };

    setItems((prev) => [...prev, newItem]);

    // Reset Form
    setFormJudul('');
    setFormDeskripsi('');
    setFormQrContent('');
    setFormTagBadge('');
    setFormCopies(1);

    setNotice({ type: 'success', message: 'Label custom berhasil ditambahkan ke antrean!' });
    setTimeout(() => setNotice(null), 4000);
  };

  // Generate Urutan Massal
  const handleGenerateSequence = async () => {
    const start = Number(seqStart) || 1;
    const end = Number(seqEnd) || 1;

    if (start > end) {
      alert('Nomor Awal tidak boleh lebih besar dari Nomor Akhir.');
      return;
    }

    const totalCount = end - start + 1;
    if (totalCount > 200) {
      if (!confirm(`Anda akan membuat ${totalCount} label sekaligus. Lanjutkan?`)) return;
    }

    const generated: CustomLabelItem[] = [];

    for (let i = start; i <= end; i++) {
      const numStr = String(i).padStart(seqPadDigits, '0');
      const judul = seqJudulFormat.replace(/\{N\}/g, numStr).replace(/\{PREFIX\}/g, seqPrefix);
      const deskripsi = seqDeskripsiFormat.replace(/\{N\}/g, numStr).replace(/\{PREFIX\}/g, seqPrefix);
      const qrContent = seqQrFormat.replace(/\{N\}/g, numStr).replace(/\{PREFIX\}/g, seqPrefix);
      const badge = seqBadgeFormat.replace(/\{N\}/g, numStr).replace(/\{PREFIX\}/g, seqPrefix);

      const qrUrl = await createQrDataUrl(qrContent || judul);

      generated.push({
        id: `seq_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
        judul,
        deskripsi,
        qr_content: qrContent,
        tag_badge: badge,
        copies: Math.max(1, seqCopies || 1),
        qr_data_url: qrUrl,
      });
    }

    setItems((prev) => [...prev, ...generated]);
    setShowBatchModal(false);
    setNotice({
      type: 'success',
      message: `Berhasil generate ${generated.length} label secara berurutan!`,
    });
    setTimeout(() => setNotice(null), 5000);
  };

  // Quick Paste Multi-Line
  const handleApplyPaste = async () => {
    if (!pasteText.trim()) return;

    const lines = pasteText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    if (lines.length === 0) return;

    const parsedItems: CustomLabelItem[] = [];

    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      // Format support: Judul | Deskripsi | Isi_QR | Badge atau Judul | Isi_QR
      const parts = line.split('|').map((p) => p.trim());

      let judul = '';
      let deskripsi = '';
      let qrContent = '';
      let badge = '';

      if (parts.length === 1) {
        judul = parts[0];
        qrContent = parts[0];
      } else if (parts.length === 2) {
        judul = parts[0];
        qrContent = parts[1];
      } else if (parts.length === 3) {
        judul = parts[0];
        deskripsi = parts[1];
        qrContent = parts[2];
      } else {
        judul = parts[0];
        deskripsi = parts[1];
        qrContent = parts[2];
        badge = parts[3];
      }

      const payload = qrContent || judul;
      const qrUrl = await createQrDataUrl(payload);

      parsedItems.push({
        id: `paste_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
        judul: judul || payload,
        deskripsi,
        qr_content: payload,
        tag_badge: badge,
        copies: 1,
        qr_data_url: qrUrl,
      });
    }

    setItems((prev) => [...prev, ...parsedItems]);
    setPasteText('');
    setShowPasteModal(false);
    setNotice({
      type: 'success',
      message: `Berhasil menambahkan ${parsedItems.length} label dari teks!`,
    });
    setTimeout(() => setNotice(null), 5000);
  };

  // Preset Template Quick Click
  const applyPreset = (presetKey: string) => {
    if (presetKey === 'rak') {
      setSeqPrefix('RAK-A-');
      setSeqStart(1);
      setSeqEnd(8);
      setSeqPadDigits(2);
      setSeqJudulFormat('RAK {N} (ZONA A)');
      setSeqDeskripsiFormat('Area Rak Utama Gudang');
      setSeqQrFormat('RAK-A-{N}');
      setSeqBadgeFormat('ZONA A');
      setShowBatchModal(true);
    } else if (presetKey === 'bin') {
      setSeqPrefix('BIN-A1-');
      setSeqStart(1);
      setSeqEnd(6);
      setSeqPadDigits(2);
      setSeqJudulFormat('BIN BOX #{N}');
      setSeqDeskripsiFormat('Rak A Level 1 - Partisi Box');
      setSeqQrFormat('BIN-A1-{N}');
      setSeqBadgeFormat('BIN LOKASI');
      setShowBatchModal(true);
    } else if (presetKey === 'packing') {
      const packingItems: CustomLabelItem[] = [
        { id: 'pk-1', judul: 'MEJA PACKING 01', deskripsi: 'Stasiun Pengemasan Reguler', qr_content: 'STATION-PACK-01', tag_badge: 'PACKING', copies: 1 },
        { id: 'pk-2', judul: 'MEJA PACKING 02', deskripsi: 'Stasiun Pengemasan Reguler', qr_content: 'STATION-PACK-02', tag_badge: 'PACKING', copies: 1 },
        { id: 'pk-3', judul: 'STASIUN QC 01', deskripsi: 'Meja Quality Control & Defect', qr_content: 'STATION-QC-01', tag_badge: 'QC AREA', copies: 1 },
        { id: 'pk-4', judul: 'LOADING DOCK IN', deskripsi: 'Penerimaan Ekspedisi Masuk', qr_content: 'DOCK-INBOUND-01', tag_badge: 'INBOUND', copies: 1 },
      ];
      setItems(prev => [...prev, ...packingItems]);
      setNotice({ type: 'success', message: 'Template Stasiun Kerja & Packing berhasil ditambahkan!' });
      setTimeout(() => setNotice(null), 4000);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    if (items.length === 0) {
      alert('Antrean label custom masih kosong.');
      return;
    }

    const headers = ['judul', 'deskripsi', 'isi_qr_code', 'tag_badge', 'jumlah_copy'];
    const rows = items.map((it) => [
      it.judul,
      it.deskripsi || '',
      it.qr_content,
      it.tag_badge || '',
      String(it.copies || 1),
    ]);

    const csvContent = '\uFEFF' + [
      headers.join(','),
      ...rows.map((r) => r.map((val) => `"${String(val).replace(/"/g, '""')}"`).join(',')),
    ].join('\r\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `label_custom_qr_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Import CSV
  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as Record<string, any>[];
          if (!rows || rows.length === 0) {
            setNotice({ type: 'error', message: 'File CSV kosong atau format tidak sesuai.' });
            return;
          }

          const imported: CustomLabelItem[] = [];

          for (let i = 0; i < rows.length; i++) {
            const r = rows[i];
            const judul = r.judul || r.nama || r.title || r.label || '';
            const deskripsi = r.deskripsi || r.keterangan || r.desc || '';
            const qrContent = r.isi_qr_code || r.qr_content || r.qr || r.code || r.barcode || judul;
            const badge = r.tag_badge || r.badge || r.kategori || '';
            const copies = Math.max(1, parseInt(r.jumlah_copy || r.qty || '1', 10) || 1);

            if (!judul && !qrContent) continue;

            const qrUrl = await createQrDataUrl(qrContent || judul);

            imported.push({
              id: `imp_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 5)}`,
              judul: judul || qrContent,
              deskripsi,
              qr_content: qrContent || judul,
              tag_badge: badge,
              copies,
              qr_data_url: qrUrl,
            });
          }

          if (imported.length === 0) {
            setNotice({ type: 'error', message: 'Tidak ada baris valid yang ditemukan dalam CSV.' });
            return;
          }

          setItems((prev) => [...prev, ...imported]);
          setNotice({ type: 'success', message: `Berhasil mengimpor ${imported.length} label custom!` });
          setTimeout(() => setNotice(null), 5000);
        } catch (err: any) {
          setNotice({ type: 'error', message: `Gagal membaca CSV: ${err.message}` });
        } finally {
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
    });
  };

  // Flattened items list taking `copies` into account
  const flattenedItems: CustomLabelItem[] = [];
  items.forEach((it) => {
    const count = Math.max(1, it.copies || 1);
    for (let c = 0; c < count; c++) {
      flattenedItems.push(it);
    }
  });

  // Calculate pages
  const itemsPerPage = gridMode;
  const totalSheets = Math.ceil(flattenedItems.length / itemsPerPage) || 1;

  // Split into sheet groups
  const sheets: CustomLabelItem[][] = [];
  for (let s = 0; s < totalSheets; s++) {
    const slice = flattenedItems.slice(s * itemsPerPage, (s + 1) * itemsPerPage);
    if (slice.length > 0) sheets.push(slice);
  }

  const handlePrint = () => {
    if (flattenedItems.length === 0) {
      alert('Antrean label custom kosong!');
      return;
    }

    setTimeout(() => {
      try {
        window.print();
      } catch (err) {
        console.error('Print error:', err);
        alert('Gagal membuka dialog cetak. Silakan coba buka aplikasi di tab baru jika menggunakan iframe.');
      }
    }, 250);
  };

  return (
    <>
      {/* 
        ========================================================
        CSS PRINT A6 KHUSUS LABEL CUSTOM
        ========================================================
      */}
      <style>{`
        @media print {
          :root {
            color-scheme: light !important;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            color-scheme: light !important;
            width: 105mm !important;
            height: 148mm !important;
            overflow: visible !important;
          }
          body * {
            visibility: hidden !important;
          }
          #print-area-custom, #print-area-custom * {
            visibility: visible !important;
          }
          #print-area-custom {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 105mm !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #000000 !important;
            z-index: 999999 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: 105mm 148mm;
            margin: 0 !important;
          }
          .page-break-custom {
            box-sizing: border-box !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            width: 105mm !important;
            height: 148mm !important;
            padding: 3mm !important;
          }
          .page-break-custom:not(:last-child) {
            page-break-after: always !important;
            break-after: page !important;
          }
          .page-break-custom:last-child {
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      `}</style>

      <div className="space-y-4 print:hidden">
        {/* Hidden CSV Input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={handleImportCsv}
        />

        {/* Top Notification */}
        {notice && (
          <div
            className={`p-3.5 rounded-xl flex items-center justify-between gap-3 text-xs font-bold border transition-all ${
              notice.type === 'success'
                ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800'
                : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800'
            }`}
          >
            <div className="flex items-center gap-2">
              {notice.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
              )}
              <span>{notice.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 
          ========================================================
          CONTROL BAR: PILIHAN GRID A6 (1, 2, 4, 6, 8) & TOOLBAR
          ========================================================
        */}
        <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-md text-[10px] font-black uppercase tracking-wider">
                Layout Kertas A6 (105×148 mm)
              </span>
            </div>
            <h2 className="text-base font-black text-slate-900 dark:text-white mt-1">
              Pilih Jumlah Label QR per Lembar A6
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Sesuaikan kerapatan label: 1 Full A6 (Besar), 4 per A6 (Standar Rak), atau 6 per A6 (Box Bin).
            </p>
          </div>

          {/* Grid Mode Selector Pills */}
          <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/80 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-x-auto">
            {(
              [
                { mode: 1, label: '1 A6 Full', desc: '1 QR Besar' },
                { mode: 2, label: '2 per A6', desc: 'Besar' },
                { mode: 4, label: '4 per A6', desc: '2×2 Rak' },
                { mode: 6, label: '6 per A6', desc: '2×3 Bin' },
                { mode: 8, label: '8 per A6', desc: '2×4 Mini' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.mode}
                type="button"
                onClick={() => setGridMode(opt.mode)}
                className={`px-3 py-2 rounded-lg text-xs font-black transition-all cursor-pointer select-none whitespace-nowrap flex flex-col items-center justify-center min-w-[72px] ${
                  gridMode === opt.mode
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30 ring-1 ring-indigo-400'
                    : 'bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-900'
                }`}
              >
                <span>{opt.label}</span>
                <span className={`text-[9px] font-medium opacity-80 ${gridMode === opt.mode ? 'text-indigo-100' : 'text-slate-400'}`}>
                  {opt.desc}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* 
          ========================================================
          MAIN 2-COLUMN WORKSPACE: FORM & PREVIEW
          ========================================================
        */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          
          {/* ====================================================
              KOLOM KIRI: INPUT FORM & QUICK GENERATORS (5 COLS)
             ==================================================== */}
          <div className="lg:col-span-5 space-y-3">
            
            {/* 1. Form Input Satuan */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 overflow-hidden">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Tag className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Input Label Satuan
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFormJudul('');
                    setFormDeskripsi('');
                    setFormQrContent('');
                    setFormTagBadge('');
                    setFormCopies(1);
                  }}
                  className="text-[10.5px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  Reset Form
                </button>
              </div>

              <form onSubmit={handleAddItem} className="p-3.5 space-y-3">
                {/* Judul Label */}
                <div>
                  <label className="block text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Judul Label <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formJudul}
                    onChange={(e) => setFormJudul(e.target.value)}
                    placeholder="Contoh: RAK SEPATU A-01"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-1">
                    Teks judul yang tercetak tebal di atas label QR.
                  </p>
                </div>

                {/* Isi QR Code (Scan Payload) */}
                <div className="bg-indigo-50/60 dark:bg-indigo-950/30 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900/50 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[11px] font-black text-indigo-950 dark:text-indigo-200 uppercase flex items-center gap-1.5">
                      <QrCode className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      Isi Teks QR Code (Hasil Scan) <span className="text-rose-500">*</span>
                    </label>
                    {formJudul && (
                      <button
                        type="button"
                        onClick={() => setFormQrContent(formJudul)}
                        className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        Sama dg Judul
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formQrContent}
                    onChange={(e) => setFormQrContent(e.target.value)}
                    placeholder="Contoh: RAK-A-01 (Teks yang keluar saat barcode scanner scan)"
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded-lg text-xs font-mono font-bold text-indigo-700 dark:text-indigo-300 focus:ring-2 focus:ring-indigo-500"
                    required
                  />
                  <p className="text-[10px] text-indigo-800 dark:text-indigo-300">
                    💡 <strong>Isi payload QR terpisah</strong> dari judul & deskripsi. Scanner akan membaca teks ini persis.
                  </p>
                </div>

                {/* Deskripsi & Tag Badge */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Deskripsi / Sub-text
                    </label>
                    <input
                      type="text"
                      value={formDeskripsi}
                      onChange={(e) => setFormDeskripsi(e.target.value)}
                      placeholder="Lantai 1 - Fast Moving"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Badge / Tag (Opsional)
                    </label>
                    <input
                      type="text"
                      value={formTagBadge}
                      onChange={(e) => setFormTagBadge(e.target.value)}
                      placeholder="Misal: ZONA A / BIN"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-medium text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Jumlah Cetak / Copies & Submit */}
                <div className="flex items-center gap-2 pt-1">
                  <div className="w-24">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1">Salinan (Qty)</label>
                    <input
                      type="number"
                      min={1}
                      max={99}
                      value={formCopies}
                      onChange={(e) => setFormCopies(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      className="w-full px-2 py-2 text-center bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-bold text-slate-900 dark:text-white"
                    />
                  </div>
                  <button
                    type="submit"
                    className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer mt-4.5"
                  >
                    <Plus className="w-4 h-4" />
                    Tambah ke Antrean
                  </button>
                </div>
              </form>
            </div>

            {/* 2. Quick Generators Box */}
            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-500" />
                  <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Generator Massal & Preset
                  </h3>
                </div>
              </div>

              {/* Action Buttons Grid */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(true)}
                  className="p-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-xl border border-indigo-200 dark:border-indigo-800 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black">Urutan Massal</span>
                    <ChevronRight className="w-3.5 h-3.5 text-indigo-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-[10px] text-indigo-600/80 dark:text-indigo-400/80 mt-0.5 leading-snug">
                    Generate RAK-01 s/d RAK-24 otomatis
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setShowPasteModal(true)}
                  className="p-2.5 bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl border border-slate-200 dark:border-slate-700 text-left transition-all cursor-pointer group"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black">Paste / Teks</span>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                  </div>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">
                    Input banyak baris teks (Judul|QR)
                  </p>
                </button>
              </div>

              {/* Quick Preset Buttons */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">
                  Preset Cepat Gudang:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyPreset('rak')}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    🏢 Rak Gudang A (1-8)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('bin')}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    📦 Bin Partisi (1-6)
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('packing')}
                    className="px-2.5 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-bold transition-colors cursor-pointer"
                  >
                    🏷️ Meja Packing & QC
                  </button>
                </div>
              </div>

              {/* CSV Import / Export Tools */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 py-1.5 px-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Upload className="w-3 h-3 text-indigo-500" />
                  Import CSV
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="flex-1 py-1.5 px-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Download className="w-3 h-3 text-emerald-500" />
                  Export CSV
                </button>
              </div>
            </div>

            {/* 3. Pengaturan Tampilan & Format Cetak */}
            <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-slate-500" />
                <h3 className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                  Pengaturan Cetak
                </h3>
              </div>

              <div className="space-y-2 text-xs">
                {/* Show QR Text */}
                <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
                  <span className="text-slate-700 dark:text-slate-300 font-bold">
                    Tampilkan Teks QR di Bawah Kode
                  </span>
                  <input
                    type="checkbox"
                    checked={showQrPayloadText}
                    onChange={(e) => setShowQrPayloadText(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                </label>

                {/* Show Cut Line Guides */}
                <label className="flex items-center justify-between p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 cursor-pointer">
                  <span className="text-slate-700 dark:text-slate-300 font-bold flex items-center gap-1.5">
                    <Scissors className="w-3.5 h-3.5 text-slate-400" />
                    Garis Panduan Potong (Gunting)
                  </span>
                  <input
                    type="checkbox"
                    checked={showCutLines}
                    onChange={(e) => setShowCutLines(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded cursor-pointer"
                  />
                </label>

                {/* Border Style */}
                <div className="p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40 space-y-1.5">
                  <span className="text-slate-700 dark:text-slate-300 font-bold block">
                    Gaya Garis Bingkai Label
                  </span>
                  <div className="grid grid-cols-3 gap-1">
                    {(['solid', 'dashed', 'none'] as const).map((b) => (
                      <button
                        key={b}
                        type="button"
                        onClick={() => setBorderStyle(b)}
                        className={`py-1 px-2 rounded-lg text-[10.5px] font-bold capitalize transition-colors cursor-pointer ${
                          borderStyle === b
                            ? 'bg-indigo-600 text-white shadow-xs'
                            : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {b === 'solid' ? 'Tebal' : b === 'dashed' ? 'Garis Putus' : 'Polos'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ====================================================
              KOLOM KANAN: LIVE PREVIEW LEMBAR A6 & PRINT (7 COLS)
             ==================================================== */}
          <div className="lg:col-span-7 space-y-3">
            
            {/* Header Toolbar Preview & Print Button */}
            <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 sticky top-2 z-20">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider">
                    Antrean Cetak Label
                  </span>
                  <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 rounded-full text-[10px] font-black">
                    {flattenedItems.length} Label ({totalSheets} Lembar A6)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Layout: <strong>{gridMode} label per lembar A6</strong>
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {items.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Kosongkan semua label custom?')) setItems([]);
                    }}
                    className="px-2.5 py-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    Hapus Semua
                  </button>
                )}

                {/* Print Button */}
                <button
                  type="button"
                  onClick={handlePrint}
                  disabled={flattenedItems.length === 0}
                  className="py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-black text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  Cetak {flattenedItems.length} Label A6
                </button>
              </div>
            </div>

            {/* Live Sheets Container (Mockup Lembaran A6) */}
            <div className="space-y-6 max-h-[800px] overflow-y-auto pr-1 pb-10">
              {flattenedItems.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-800 rounded-2xl p-12 text-center text-slate-400 dark:text-slate-500 space-y-3">
                  <QrCode className="w-12 h-12 mx-auto stroke-1 text-slate-300 dark:text-slate-600" />
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">
                    Belum Ada Label Custom
                  </p>
                  <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
                    Gunakan formulir di sebelah kiri atau klik <strong>Urutan Massal</strong> untuk membuat label penomoran rak/bin secara otomatis.
                  </p>
                </div>
              ) : (
                sheets.map((sheetItems, sheetIdx) => (
                  <div key={`sheet-${sheetIdx}`} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-500 font-bold px-1">
                      <span>📄 Lembar A6 ke-{sheetIdx + 1} dari {totalSheets}</span>
                      <span>{sheetItems.length} Label</span>
                    </div>

                    {/* A6 Canvas Simulation Box */}
                    <div className="bg-slate-100 dark:bg-slate-950 p-2 sm:p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-inner flex justify-center">
                      <div
                        style={{
                          width: '100%',
                          maxWidth: '420px',
                          aspectRatio: '105 / 148',
                        }}
                        className="bg-white text-black shadow-lg rounded-sm p-3 flex flex-col justify-between box-border border border-slate-300"
                      >
                        {/* Grid Container for Sheet */}
                        <div
                          className={`w-full h-full grid gap-2 ${
                            gridMode === 1
                              ? 'grid-cols-1 grid-rows-1'
                              : gridMode === 2
                              ? 'grid-cols-1 grid-rows-2'
                              : gridMode === 4
                              ? 'grid-cols-2 grid-rows-2'
                              : gridMode === 6
                              ? 'grid-cols-2 grid-rows-3'
                              : 'grid-cols-2 grid-rows-4'
                          }`}
                        >
                          {sheetItems.map((lbl, idx) => (
                            <div
                              key={`${lbl.id}-${sheetIdx}-${idx}`}
                              className={`h-full flex flex-col justify-between p-2 relative box-border bg-white ${
                                borderStyle === 'solid'
                                  ? 'border-[2px] border-black rounded-sm'
                                  : borderStyle === 'dashed'
                                  ? 'border-[1.5px] border-dashed border-black rounded-sm'
                                  : 'border border-gray-200'
                              }`}
                            >
                              {/* Header Label: Judul & Badge */}
                              <div className="border-b-[1.5px] border-black pb-1 mb-1">
                                <div className="flex items-start justify-between gap-1">
                                  <h4
                                    className={`font-black uppercase text-black leading-tight truncate ${
                                      gridMode === 1
                                        ? 'text-xl'
                                        : gridMode === 2
                                        ? 'text-base'
                                        : gridMode === 4
                                        ? 'text-xs'
                                        : 'text-[10px]'
                                    }`}
                                  >
                                    {lbl.judul || 'LABEL RAK'}
                                  </h4>
                                  {lbl.tag_badge && (
                                    <span
                                      className={`px-1 py-0.2 bg-black text-white font-black uppercase rounded-xs shrink-0 ${
                                        gridMode === 1 ? 'text-xs' : 'text-[8px]'
                                      }`}
                                    >
                                      {lbl.tag_badge}
                                    </span>
                                  )}
                                </div>
                                {lbl.deskripsi && (
                                  <p
                                    className={`text-gray-700 font-medium truncate ${
                                      gridMode === 1
                                        ? 'text-sm mt-1'
                                        : gridMode === 2
                                        ? 'text-xs mt-0.5'
                                        : 'text-[9px] mt-0.2'
                                    }`}
                                  >
                                    {lbl.deskripsi}
                                  </p>
                                )}
                              </div>

                              {/* Center QR Code Image */}
                              <div className="flex-1 flex flex-col items-center justify-center p-0.5">
                                {lbl.qr_data_url ? (
                                  <img
                                    src={lbl.qr_data_url}
                                    alt="QR"
                                    className={`block object-contain ${
                                      gridMode === 1
                                        ? 'w-44 h-44 max-w-[70%]'
                                        : gridMode === 2
                                        ? 'w-24 h-24'
                                        : gridMode === 4
                                        ? 'w-16 h-16'
                                        : gridMode === 6
                                        ? 'w-12 h-12'
                                        : 'w-9 h-9'
                                    }`}
                                  />
                                ) : (
                                  <div className="w-12 h-12 bg-gray-100 flex items-center justify-center text-[8px] text-gray-400">
                                    QR...
                                  </div>
                                )}

                                {/* QR Payload Text Under Code */}
                                {showQrPayloadText && (
                                  <div
                                    className={`font-mono font-black text-center text-black break-all tracking-tight leading-none mt-1 ${
                                      gridMode === 1
                                        ? 'text-base'
                                        : gridMode === 2
                                        ? 'text-xs'
                                        : gridMode === 4
                                        ? 'text-[10px]'
                                        : 'text-[8px]'
                                    }`}
                                  >
                                    {lbl.qr_content || lbl.judul}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* List Detail Antrean Item */}
            {items.length > 0 && (
              <div className="bg-white dark:bg-slate-900 p-3.5 rounded-2xl shadow-xs border border-slate-200 dark:border-slate-800 space-y-2">
                <h3 className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-wider mb-2">
                  Daftar Master Item Label ({items.length} Tipe)
                </h3>
                <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                  {items.map((it, idx) => (
                    <div key={it.id} className="py-2 flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400 font-mono">
                            #{idx + 1}
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-100 truncate">
                            {it.judul}
                          </span>
                          {it.tag_badge && (
                            <span className="px-1.5 py-0.2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[9px] font-bold rounded">
                              {it.tag_badge}
                            </span>
                          )}
                          <span className="px-1.5 py-0.2 bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[9px] font-bold rounded">
                            {it.copies}x Salinan
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[10.5px] text-slate-500 mt-0.5 font-mono truncate">
                          <span>QR: {it.qr_content}</span>
                          {it.deskripsi && <span className="text-slate-400 font-sans">&bull; {it.deskripsi}</span>}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setItems(items.filter((x) => x.id !== it.id))}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                        title="Hapus label ini"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

      {/* 
        ========================================================
        MODAL: GENERATOR URUTAN MASSAL (AUTO SEQUENCE)
        ========================================================
      */}
      {showBatchModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="p-4 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-300" />
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Generator Urutan Label Massal
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3.5 text-xs max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Prefix Nomor (Opsional)
                  </label>
                  <input
                    type="text"
                    value={seqPrefix}
                    onChange={(e) => setSeqPrefix(e.target.value)}
                    placeholder="Misal: RAK-A-"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Digit Padding
                  </label>
                  <select
                    value={seqPadDigits}
                    onChange={(e) => setSeqPadDigits(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-white"
                  >
                    <option value={1}>1 Digit (1, 2, 3...)</option>
                    <option value={2}>2 Digit (01, 02, 03...)</option>
                    <option value={3}>3 Digit (001, 002, 003...)</option>
                  </select>
                </div>
              </div>

              {/* Range Nomor */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Dari Nomor:
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={seqStart}
                    onChange={(e) => setSeqStart(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-center text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                    Sampai Nomor:
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={seqEnd}
                    onChange={(e) => setSeqEnd(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-bold text-center text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Format Fields */}
              <div className="space-y-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Format Judul Label <code className="text-indigo-600 font-bold">{'{N}'}</code> = Nomor
                  </label>
                  <input
                    type="text"
                    value={seqJudulFormat}
                    onChange={(e) => setSeqJudulFormat(e.target.value)}
                    placeholder="RAK {N} - ZONA A"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-bold text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                    Format Isi QR Code (Scan Result)
                  </label>
                  <input
                    type="text"
                    value={seqQrFormat}
                    onChange={(e) => setSeqQrFormat(e.target.value)}
                    placeholder="RAK-A-{N}"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono font-bold text-indigo-600 dark:text-indigo-400"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Deskripsi
                    </label>
                    <input
                      type="text"
                      value={seqDeskripsiFormat}
                      onChange={(e) => setSeqDeskripsiFormat(e.target.value)}
                      placeholder="Area Rak Utama"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
                      Tag Badge
                    </label>
                    <input
                      type="text"
                      value={seqBadgeFormat}
                      onChange={(e) => setSeqBadgeFormat(e.target.value)}
                      placeholder="ZONA A"
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>

              {/* Preview Hint */}
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800 text-[11px] text-indigo-900 dark:text-indigo-200 space-y-1">
                <span className="font-bold">Contoh Hasil Generate:</span>
                <div className="font-mono text-[10.5px]">
                  #1 &rarr; Judul: <strong>{seqJudulFormat.replace(/\{N\}/g, String(seqStart).padStart(seqPadDigits, '0'))}</strong> | QR: <strong>{seqQrFormat.replace(/\{N\}/g, String(seqStart).padStart(seqPadDigits, '0'))}</strong>
                </div>
                <div className="text-[10px] text-indigo-700 dark:text-indigo-300">
                  Total yang akan dibuat: <strong>{Math.max(0, (seqEnd - seqStart + 1))} label</strong>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleGenerateSequence}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black transition-colors cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <Sparkles className="w-4 h-4" />
                Generate {Math.max(0, (seqEnd - seqStart + 1))} Label
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 
        ========================================================
        MODAL: QUICK PASTE TEXT / MULTI-LINE
        ========================================================
      */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-150">
            <div className="p-4 bg-slate-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <h3 className="text-sm font-black uppercase tracking-wider">
                  Quick Paste Teks Massal
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                Tempel teks baris demi baris. Format yang didukung:
                <br />
                <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono text-indigo-600 font-bold">
                  Judul | Deskripsi | Isi_QR_Code | Badge
                </code>{' '}
                atau{' '}
                <code className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded font-mono text-indigo-600 font-bold">
                  Judul | Isi_QR_Code
                </code>
              </p>

              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={`Contoh:\nRAK SEPATU A-01 | Lantai 1 | RAK-A-01 | ZONA A\nRAK SEPATU A-02 | Lantai 1 | RAK-A-02 | ZONA A\nBIN BOX 01 | Rak B Level 2 | BIN-B2-01 | BIN`}
                rows={8}
                className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-xs text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleApplyPaste}
                disabled={!pasteText.trim()}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-black transition-colors cursor-pointer shadow-sm"
              >
                Terapkan & Tambah ke Antrean
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 
        ========================================================
        ELEMEN CETAK A6 KHUSUS CUSTOM (Hanya aktif saat window.print())
        ========================================================
      */}
      <div id="print-area-custom" className="hidden print:block text-black bg-white">
        {sheets.map((sheetItems, sheetIdx) => (
          <div
            key={`print-sheet-${sheetIdx}`}
            className="page-break-custom w-[105mm] h-[148mm] box-border p-[3.5mm] bg-white flex flex-col justify-between relative overflow-hidden"
          >
            <div
              className={`w-full h-full grid gap-[2.5mm] ${
                gridMode === 1
                  ? 'grid-cols-1 grid-rows-1'
                  : gridMode === 2
                  ? 'grid-cols-1 grid-rows-2'
                  : gridMode === 4
                  ? 'grid-cols-2 grid-rows-2'
                  : gridMode === 6
                  ? 'grid-cols-2 grid-rows-3'
                  : 'grid-cols-2 grid-rows-4'
              }`}
            >
              {sheetItems.map((lbl, idx) => (
                <div
                  key={`print-item-${sheetIdx}-${idx}`}
                  className={`h-full flex flex-col justify-between p-[2.5mm] relative box-border bg-white ${
                    borderStyle === 'solid'
                      ? 'border-[2px] border-black'
                      : borderStyle === 'dashed'
                      ? 'border-[1.5px] border-dashed border-black'
                      : 'border-[0.5px] border-gray-400'
                  }`}
                >
                  {/* Header Item */}
                  <div className="border-b-[1.5px] border-black pb-[1mm] mb-[1mm]">
                    <div className="flex items-start justify-between gap-1">
                      <div
                        className={`font-black uppercase text-black leading-tight truncate ${
                          gridMode === 1
                            ? 'text-[20pt]'
                            : gridMode === 2
                            ? 'text-[14pt]'
                            : gridMode === 4
                            ? 'text-[11pt]'
                            : gridMode === 6
                            ? 'text-[9pt]'
                            : 'text-[7.5pt]'
                        }`}
                      >
                        {lbl.judul || 'LABEL RAK'}
                      </div>
                      {lbl.tag_badge && (
                        <div
                          className={`px-[1.5mm] py-[0.5mm] bg-black text-white font-black uppercase shrink-0 ${
                            gridMode === 1
                              ? 'text-[10pt]'
                              : gridMode === 2
                              ? 'text-[8pt]'
                              : 'text-[6.5pt]'
                          }`}
                        >
                          {lbl.tag_badge}
                        </div>
                      )}
                    </div>
                    {lbl.deskripsi && (
                      <div
                        className={`text-gray-800 font-semibold truncate ${
                          gridMode === 1
                            ? 'text-[12pt] mt-[1mm]'
                            : gridMode === 2
                            ? 'text-[9.5pt] mt-[0.5mm]'
                            : 'text-[7pt] mt-[0.2mm]'
                        }`}
                      >
                        {lbl.deskripsi}
                      </div>
                    )}
                  </div>

                  {/* QR Code Matrix */}
                  <div className="flex-1 flex flex-col items-center justify-center p-[1mm]">
                    {lbl.qr_data_url && (
                      <img
                        src={lbl.qr_data_url}
                        alt="QR"
                        className={`block object-contain ${
                          gridMode === 1
                            ? 'w-[52mm] h-[52mm]'
                            : gridMode === 2
                            ? 'w-[32mm] h-[32mm]'
                            : gridMode === 4
                            ? 'w-[24mm] h-[24mm]'
                            : gridMode === 6
                            ? 'w-[17mm] h-[17mm]'
                            : 'w-[13mm] h-[13mm]'
                        }`}
                      />
                    )}

                    {showQrPayloadText && (
                      <div
                        className={`font-mono font-black text-center text-black break-all tracking-tight leading-none mt-[1mm] ${
                          gridMode === 1
                            ? 'text-[13pt]'
                            : gridMode === 2
                            ? 'text-[10pt]'
                            : gridMode === 4
                            ? 'text-[8.5pt]'
                            : gridMode === 6
                            ? 'text-[7pt]'
                            : 'text-[6pt]'
                        }`}
                      >
                        {lbl.qr_content || lbl.judul}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
};
