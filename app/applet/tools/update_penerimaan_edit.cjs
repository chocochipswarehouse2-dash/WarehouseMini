const fs = require('fs');

let code = fs.readFileSync('src/components/PenerimaanProduksiView.tsx', 'utf8');

// 1. Add convertPenerimaanItemsToProductBlocks helper above PenerimaanProduksiView if not present
if (!code.includes('export function convertPenerimaanItemsToProductBlocks')) {
  const helperCode = `
export function convertPenerimaanItemsToProductBlocks(items: PenerimaanProduksiItem[]): FormProductBlock[] {
  const blocksMap = new Map<string, FormProductBlock>();

  items.forEach((it, idx) => {
    const rawCode = (it.kode_produksi || '').trim().toUpperCase();
    const blockKey = rawCode || ('BLOCK_' + idx);

    if (!blocksMap.has(blockKey)) {
      blocksMap.set(blockKey, {
        id: 'block_' + Date.now() + '_' + idx + '_' + Math.random().toString(36).substring(2, 6),
        kode_produksi: it.kode_produksi || '',
        nama_produk: it.nama_produk || '',
        foto_url: it.foto_url || '',
        catatan: it.keterangan || (it as any).catatan || '',
        warnas: [],
      });
    }

    const block = blocksMap.get(blockKey)!;
    if (!block.foto_url && it.foto_url) {
      block.foto_url = it.foto_url;
    }
    if (!block.nama_produk && it.nama_produk) {
      block.nama_produk = it.nama_produk;
    }

    const warnaName = (it.warna || '').trim().toUpperCase() || '-';
    let warnaObj = block.warnas.find((w) => w.warna.trim().toUpperCase() === warnaName);
    if (!warnaObj) {
      warnaObj = {
        id: 'warna_' + Date.now() + '_' + block.warnas.length + '_' + Math.random().toString(36).substring(2, 6),
        warna: warnaName,
        sizes: [],
      };
      block.warnas.push(warnaObj);
    }

    const sizeName = (it.size || 'ALL SIZE').trim().toUpperCase();
    warnaObj.sizes.push({
      id: 'size_' + Date.now() + '_' + warnaObj.sizes.length + '_' + Math.random().toString(36).substring(2, 6),
      size: sizeName,
      qty: Number(it.qty) || 0,
    });
  });

  const result = Array.from(blocksMap.values());
  return result.length > 0 ? result : [createNewProductBlock()];
}
`;

  code = code.replace(
    'export const PenerimaanProduksiView: React.FC<PenerimaanProduksiViewProps> = ({',
    helperCode + '\nexport const PenerimaanProduksiView: React.FC<PenerimaanProduksiViewProps> = ({'
  );
}

// 2. Add editingOriginalSJ state
if (!code.includes('editingOriginalSJ')) {
  code = code.replace(
    '  const [editingBatch, setEditingBatch] = useState<{',
    '  const [editingOriginalSJ, setEditingOriginalSJ] = useState<string | null>(null);\n  const [editingBatch, setEditingBatch] = useState<{'
  );
}

// 3. Update loadData signature to accept forceRefresh
code = code.replace(
  `  const loadData = async () => {\n    setIsLoading(true);\n    try {\n      // Auto-cleanup any mismatched global notes (e.g. BIS Florence accidentally copied to other codes)\n      await cleanMismatchedPenerimaanNotesInSupabase();\n      const res = await fetchPenerimaanProduksiFromSupabase({\n        kategori: filterKategori !== 'Semua' ? filterKategori : undefined,\n        startDate: filterStartDate || undefined,\n        endDate: filterEndDate || undefined,\n      });`,
  `  const loadData = async (forceRefresh?: boolean) => {\n    setIsLoading(true);\n    try {\n      // Auto-cleanup any mismatched global notes (e.g. BIS Florence accidentally copied to other codes)\n      await cleanMismatchedPenerimaanNotesInSupabase();\n      const res = await fetchPenerimaanProduksiFromSupabase({\n        kategori: filterKategori !== 'Semua' ? filterKategori : undefined,\n        startDate: filterStartDate || undefined,\n        endDate: filterEndDate || undefined,\n        forceRefresh: forceRefresh === true,\n      });`
);

// 4. Update handleOpenEditBatch
const oldOpenEditBatch = `  // Open Edit Batch Modal
  const handleOpenEditBatch = (noSuratJalan: string) => {
    const cleanSJ = (noSuratJalan || '').trim().toUpperCase();
    const rows = dataList.filter((d) => (d.no_surat_jalan || '').trim().toUpperCase() === cleanSJ);

    if (rows.length === 0) {
      onShowToast('Data surat jalan tidak ditemukan!', 'error');
      return;
    }

    const first = rows[0];
    setEditingBatch({
      orig_no_surat_jalan: cleanSJ,
      no_surat_jalan: cleanSJ,
      kategori: first.kategori || 'Lokal CMT',
      tanggal: first.tanggal_penerimaan || new Date().toISOString().split('T')[0],
      keterangan: first.keterangan || '',
      items: rows.map((r, idx) => ({ ...r, tempId: r.id || \`temp_\${Date.now()}_\${idx}\` })),
    });
  };`;

const newOpenEditBatch = `  // Open Edit Batch: Mengisi ulang form input asli kedatangan agar format persis dan bebas bug
  const handleOpenEditBatch = (noSuratJalan: string) => {
    const cleanSJ = (noSuratJalan || '').trim().toUpperCase();
    const rows = dataList.filter((d) => (d.no_surat_jalan || '').trim().toUpperCase() === cleanSJ);

    if (rows.length === 0) {
      onShowToast('Data surat jalan tidak ditemukan!', 'error');
      return;
    }

    const first = rows[0];
    setFormKategori(first.kategori === 'Kargo' ? 'Kargo' : 'Lokal CMT');
    setFormTanggal(first.tanggal_penerimaan || new Date().toISOString().split('T')[0]);
    setFormNoSuratJalan(cleanSJ);
    setFormKeteranganGlobal(first.keterangan || '');
    setProductBlocks(convertPenerimaanItemsToProductBlocks(rows));
    setEditingOriginalSJ(cleanSJ);
    setActiveTab('input');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    onShowToast('Membuka form edit untuk Surat Jalan ' + cleanSJ, 'info');
  };

  const handleCancelEdit = () => {
    setEditingOriginalSJ(null);
    handleResetForm();
    setActiveTab('riwayat');
    onShowToast('Edit Surat Jalan dibatalkan', 'info');
  };`;

if (code.includes(oldOpenEditBatch)) {
  code = code.replace(oldOpenEditBatch, newOpenEditBatch);
}

// 5. Update handleSubmitPenerimaan to handle updateBatch when editingOriginalSJ is set
const oldSubmitSaveBlock = `      const operatorName = session?.name || session?.username || 'Operator Gudang';
      const savedItems = await simpanBatchPenerimaanProduksiToSupabase(payload, operatorName);

      onShowToast(
        \`Sukses menyimpan kedatangan \${cleanedBlocks.length} kode produksi (\${formSummary.totalPcs} pcs)!\`,
        'success'
      );`;

const newSubmitSaveBlock = `      const operatorName = session?.name || session?.username || 'Operator Gudang';
      let savedItems: PenerimaanProduksiItem[] = [];

      if (editingOriginalSJ) {
        savedItems = await updateBatchPenerimaanProduksiInSupabase(
          editingOriginalSJ,
          payload,
          operatorName
        );
        onShowToast(
          'Sukses memperbarui Surat Jalan ' + formNoSuratJalan.trim().toUpperCase() + ' (' + formSummary.totalPcs + ' pcs)!',
          'success'
        );
        setEditingOriginalSJ(null);
      } else {
        savedItems = await simpanBatchPenerimaanProduksiToSupabase(payload, operatorName);
        onShowToast(
          \`Sukses menyimpan kedatangan \${cleanedBlocks.length} kode produksi (\${formSummary.totalPcs} pcs)!\`,
          'success'
        );
      }`;

if (code.includes(oldSubmitSaveBlock)) {
  code = code.replace(oldSubmitSaveBlock, newSubmitSaveBlock);
}

// 6. Add Banner to activeTab === 'input'
const oldTabInputStart = `{activeTab === 'input' && (
        <form onSubmit={handleSubmitPenerimaan} className="space-y-2 sm:space-y-3">`;

const newTabInputStart = `{activeTab === 'input' && (
        <form onSubmit={handleSubmitPenerimaan} className="space-y-2 sm:space-y-3">
          {/* BANNER MODE EDIT SURAT JALAN */}
          {editingOriginalSJ && (
            <div className="p-3.5 sm:p-4 bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-400 dark:border-amber-600 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md animate-fadeIn">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center font-black text-lg shrink-0 shadow-xs">
                  ✏️
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-amber-900 dark:text-amber-100 uppercase tracking-wide flex items-center gap-2">
                    <span>Mode Edit Surat Jalan:</span>
                    <span className="font-mono px-2 py-0.5 bg-amber-200 dark:bg-amber-900 text-amber-950 dark:text-amber-100 rounded-md">{editingOriginalSJ}</span>
                  </h3>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                    Format persis formulir kedatangan. Anda bebas mengubah warna, menambah/menghapus size, upload foto, atau menghapus produk.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  className="flex-1 sm:flex-initial px-3.5 py-2 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Batal Edit</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleConfirmDeleteBatch(editingOriginalSJ)}
                  className="px-3.5 py-2 bg-rose-100 hover:bg-rose-200 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                  title="Hapus seluruh surat jalan ini dari database"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Hapus SJ</span>
                </button>
              </div>
            </div>
          )}`;

if (code.includes(oldTabInputStart)) {
  code = code.replace(oldTabInputStart, newTabInputStart);
}

// 7. Update submit buttons in form footer
const oldSubmitButtons = `<button
                type="button"
                onClick={handleResetForm}
                disabled={isSaving}
                className="flex-1 sm:flex-initial px-2 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
              >
                Reset Form
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-black text-white bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-600/30 transition disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyimpan Seluruh Data...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Simpan Semua Penerimaan</span>
                  </>
                )}
              </button>`;

const newSubmitButtons = `<button
                type="button"
                onClick={editingOriginalSJ ? handleCancelEdit : handleResetForm}
                disabled={isSaving}
                className="flex-1 sm:flex-initial px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
              >
                {editingOriginalSJ ? 'Batal Edit' : 'Reset Form'}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className={\`flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-black text-white shadow-lg transition disabled:opacity-50 cursor-pointer \${
                  editingOriginalSJ
                    ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-600/30'
                    : 'bg-emerald-600 hover:bg-emerald-700 shadow-emerald-600/30'
                }\`}
              >
                {isSaving ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Menyimpan Perubahan...</span>
                  </>
                ) : editingOriginalSJ ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Perbarui Surat Jalan ({editingOriginalSJ})</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Simpan Semua Penerimaan</span>
                  </>
                )}
              </button>`;

if (code.includes(oldSubmitButtons)) {
  code = code.replace(oldSubmitButtons, newSubmitButtons);
}

fs.writeFileSync('src/components/PenerimaanProduksiView.tsx', code, 'utf8');
console.log('SUCCESS_APPLIED_PENERIMAAN_EDIT_FORM');
