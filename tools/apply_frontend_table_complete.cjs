const fs = require('fs');
const path = require('path');

const pswPath = path.join(__dirname, '../src/components/penerimaan/ProduksiSpreadsheetView.tsx');
let psw = fs.readFileSync(pswPath, 'utf8');

// 1. Replace the header section (lines ~2360 to 2392)
const oldHeader = `                        {/* TOTAL DATANG (NET) */}
                        <th rowSpan={2} className="py-2.5 px-3 min-w-[95px] bg-[#fce8e6] dark:bg-[#3d1e22]">
                          TOTAL<br />{isCMT ? 'DATANG (NET)' : 'DITERIMA'}
                        </th>

                        {/* KOLOM QTY NOTA (DIISI BUYER DI SPREADSHEET / FRONTEND) & SELISIH NOTA */}
                        <th
                          rowSpan={2}
                          className="py-2.5 px-3 min-w-[95px] bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200"
                          title="Qty Nota diisi oleh Buyer di Google Sheet (atau langsung di tabel ini)"
                        >
                          QTY<br />NOTA
                        </th>
                        <th
                          rowSpan={2}
                          className="py-2.5 px-3 min-w-[90px] bg-sky-100 dark:bg-sky-950/60 text-sky-950 dark:text-sky-200"
                          title="Formula Otomatis: Total Diterima - Qty Nota (Jika selisih !== 0 otomatis masuk Antrian Hitung Ulang)"
                        >
                          SELISIH<br />NOTA
                        </th>

                        {/* KOLOM AUDIT / HASIL HITUNG ULANG FISIK */}
                        <th rowSpan={2} className="py-2.5 px-3 min-w-[90px] bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200">
                          FISIK<br />HITUNG
                        </th>
                        <th rowSpan={2} className="py-2.5 px-3 min-w-[80px] bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
                          SELISIH<br />FISIK
                        </th>
                        <th rowSpan={2} className="py-2.5 px-3 min-w-[105px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                          STATUS
                        </th>`;

const newHeader = `                        {/* 1. TOTAL DATANG PER ROW (UNMERGED) */}
                        <th rowSpan={2} className="py-2.5 px-2.5 min-w-[70px] bg-[#fdf2f1] dark:bg-[#341b1e] text-slate-800 dark:text-rose-200">
                          TOTAL<br />DATANG
                        </th>

                        {/* 2. TOTAL AWAL (NET BLOK) */}
                        <th rowSpan={2} className="py-2.5 px-3 min-w-[85px] bg-[#fce8e6] dark:bg-[#3d1e22]">
                          TOTAL AWAL<br />{isCMT ? '(NET)' : 'DITERIMA'}
                        </th>

                        {/* 3. QTY NOTA (BLOK) */}
                        <th
                          rowSpan={2}
                          className="py-2.5 px-3 min-w-[95px] bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200"
                          title="Qty Nota diisi oleh Buyer di Google Sheet (atau langsung di tabel ini)"
                        >
                          QTY<br />NOTA
                        </th>

                        {/* 4. TOTAL HITUNG ULANG (BLOK) */}
                        <th
                          rowSpan={2}
                          className="py-2.5 px-3 min-w-[95px] bg-emerald-50 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200"
                          title="Total Fisik Hasil Audit Hitung Ulang (Keseluruhan Ukuran Model Ini)"
                        >
                          TOTAL<br />HITUNG ULANG
                        </th>

                        {/* 5. SELISIH NOTA (BLOK) */}
                        <th
                          rowSpan={2}
                          className="py-2.5 px-3 min-w-[95px] bg-sky-100 dark:bg-sky-950/60 text-sky-950 dark:text-sky-200"
                          title="Formula Selisih: Total Hitung - Nota, atau Total Awal - Nota, atau Total Hitung - Awal jika Nota kosong"
                        >
                          SELISIH<br />NOTA
                        </th>

                        {/* 6-8. KOLOM RINCIAN AUDIT PER ROW */}
                        <th rowSpan={2} className="py-2.5 px-2.5 min-w-[75px] bg-blue-50 dark:bg-blue-950/40 text-blue-900 dark:text-blue-200">
                          FISIK<br />HITUNG
                        </th>
                        <th rowSpan={2} className="py-2.5 px-2.5 min-w-[75px] bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200">
                          SELISIH<br />FISIK
                        </th>
                        <th rowSpan={2} className="py-2.5 px-3 min-w-[90px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                          STATUS
                        </th>`;

psw = psw.replace(oldHeader, newHeader);

// 2. Replace the body section for Total Datang, Total Awal, Qty Nota, Total Hitung, Selisih Nota
const oldBodySection = `                              {/* 10. TOTAL DATANG (NET) */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-3 px-2 text-center align-middle font-mono font-black text-sm text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/60"
                                >
                                  <div>{block.totalNet}</div>
                                  {isCMT && block.totalRetur ? (
                                    <div className="text-[10px] font-normal text-slate-500">
                                      ({block.totalDatang} - {block.totalRetur})
                                    </div>
                                  ) : null}
                                </td>
                              )}

                              {/* 10b. QTY NOTA (BUYER) — Merged Per Block, Editable & Auto-Synced with Sheet + Supabase */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-2 px-2 text-center align-middle font-mono bg-amber-50/40 dark:bg-amber-950/20"
                                >
                                  <div className="flex flex-col items-center justify-center gap-1">
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      defaultValue={
                                        block.qtyNota !== null && block.qtyNota !== undefined
                                          ? String(block.qtyNota)
                                          : ''
                                      }
                                      key={\`nota-\${block.code}-\${block.qtyNota ?? 'empty'}\`}
                                      placeholder="Isi Nota..."
                                      title="Qty Nota Buyer (otomatis tersinkron dengan Google Sheet & dibackup ke Supabase. Tekan Enter atau klik di luar untuk simpan)"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          (e.target as HTMLInputElement).blur();
                                        }
                                      }}
                                      onBlur={(e) => {
                                        const val = e.target.value.trim();
                                        const currentStr =
                                          block.qtyNota !== null && block.qtyNota !== undefined
                                            ? String(block.qtyNota)
                                            : '';
                                        if (val !== currentStr) {
                                          handleUpdateBlockQtyNota(block.code, val, block.kategori);
                                        }
                                      }}
                                      className="w-20 px-2 py-1 text-center font-mono font-black text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-200 focus:ring-2 focus:ring-amber-500 outline-none shadow-2xs"
                                    />
                                    {qtyNotaMap[block.code]?.source_sheet && (
                                      <span className="text-[9px] text-slate-400 truncate max-w-[85px]" title={\`Sumber: \${qtyNotaMap[block.code]?.source_sheet}\`}>
                                        {qtyNotaMap[block.code]?.source_sheet}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              )}

                              {/* 10c. SELISIH NOTA (= Total Diterima - Qty Nota) — Merged Per Block */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-2 px-2 text-center align-middle font-mono bg-sky-50/20 dark:bg-sky-950/10"
                                >
                                  {block.qtyNota !== null && block.qtyNota !== undefined ? (
                                    (() => {
                                      const diffNota = block.totalNet - Number(block.qtyNota);
                                      if (diffNota === 0) {
                                        return (
                                          <div className="flex flex-col items-center gap-1">
                                            <span className="inline-block px-2 py-0.5 rounded-lg text-xs font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
                                              0
                                            </span>
                                            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">
                                              ✅ Klop Nota
                                            </span>
                                          </div>
                                        );
                                      }
                                      const isKurang = diffNota < 0;
                                      return (
                                        <div className="flex flex-col items-center gap-1">
                                          <span
                                            className={\`inline-block px-2 py-0.5 rounded-lg text-xs font-black border \${
                                              isKurang
                                                ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                                                : 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                                            }\`}
                                          >
                                            {diffNota > 0 ? \`+\${diffNota}\` : diffNota}
                                          </span>
                                          <span
                                            className={\`text-[9px] font-bold \${
                                              isKurang ? 'text-rose-600 dark:text-rose-400' : 'text-blue-600 dark:text-blue-400'
                                            }\`}
                                          >
                                            {isKurang ? \`Kurang \${Math.abs(diffNota)}\` : \`Lebih +\${diffNota}\`}
                                          </span>
                                          {onOpenHitungUlang && (
                                            <button
                                              type="button"
                                              onClick={() => onOpenHitungUlang(block.code)}
                                              className="mt-0.5 px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-bold transition cursor-pointer shadow-2xs"
                                              title="Kode ini otomatis masuk Antrian Audit Hitung Ulang. Klik untuk buka lembar hitung ulang."
                                            >
                                              📋 Audit Antrian
                                            </button>
                                          )}
                                        </div>
                                      );
                                    })()
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-700 text-xs">-</span>
                                  )}
                                </td>
                              )}`;

const newBodySection = `                              {/* 10a. TOTAL DATANG PER ROW (UNMERGED) */}
                              <td className="py-2 px-2 text-center font-mono font-bold text-xs bg-slate-50/80 dark:bg-slate-800/40 text-slate-800 dark:text-slate-200 border-r border-slate-300 dark:border-slate-700">
                                {sizeItem.totalSizeQty}
                              </td>

                              {/* 10b. TOTAL AWAL (NET BLOK) — Merged Per Block */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-3 px-2 text-center align-middle font-mono font-black text-sm text-slate-900 dark:text-white bg-slate-100/60 dark:bg-slate-800/60 border-r border-slate-300 dark:border-slate-700"
                                >
                                  <div>{block.totalNet}</div>
                                  {isCMT && block.totalRetur ? (
                                    <div className="text-[10px] font-normal text-slate-500">
                                      ({block.totalDatang} - {block.totalRetur})
                                    </div>
                                  ) : null}
                                </td>
                              )}

                              {/* 10c. QTY NOTA (BUYER) — Merged Per Block */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-2 px-2 text-center align-middle font-mono bg-amber-50/40 dark:bg-amber-950/20 border-r border-slate-300 dark:border-slate-700"
                                >
                                  <div className="flex flex-col items-center justify-center gap-1">
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      pattern="[0-9]*"
                                      defaultValue={
                                        block.qtyNota !== null && block.qtyNota !== undefined
                                          ? String(block.qtyNota)
                                          : ''
                                      }
                                      key={\`nota-\${block.code}-\${block.qtyNota ?? 'empty'}\`}
                                      placeholder="Isi Nota..."
                                      title="Qty Nota Buyer (otomatis tersinkron dengan Google Sheet & dibackup ke Supabase. Tekan Enter atau klik di luar untuk simpan)"
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          (e.target as HTMLInputElement).blur();
                                        }
                                      }}
                                      onBlur={(e) => {
                                        const val = e.target.value.trim();
                                        const currentStr =
                                          block.qtyNota !== null && block.qtyNota !== undefined
                                            ? String(block.qtyNota)
                                            : '';
                                        if (val !== currentStr) {
                                          handleUpdateBlockQtyNota(block.code, val, block.kategori);
                                        }
                                      }}
                                      className="w-20 px-2 py-1 text-center font-mono font-black text-xs rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-900 text-amber-900 dark:text-amber-200 focus:ring-2 focus:ring-amber-500 outline-none shadow-2xs"
                                    />
                                    {qtyNotaMap[block.code]?.source_sheet && (
                                      <span className="text-[9px] text-slate-400 truncate max-w-[85px]" title={\`Sumber: \${qtyNotaMap[block.code]?.source_sheet}\`}>
                                        {qtyNotaMap[block.code]?.source_sheet}
                                      </span>
                                    )}
                                  </div>
                                </td>
                              )}

                              {/* 10d. TOTAL HITUNG ULANG (FISIK) — Merged Per Block */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-2 px-2 text-center align-middle font-mono bg-emerald-50/30 dark:bg-emerald-950/10 border-r border-slate-300 dark:border-slate-700"
                                  title="Total Fisik Hasil Audit Hitung Ulang untuk seluruh ukuran model ini"
                                >
                                  {block.hasRecount && block.totalRecountFisik !== null && block.totalRecountFisik !== undefined ? (
                                    <div className="flex flex-col items-center">
                                      <span className="font-mono font-black text-sm text-emerald-800 dark:text-emerald-300">
                                        {block.totalRecountFisik}
                                      </span>
                                      <span className="text-[9px] text-slate-400">pcs fisik</span>
                                    </div>
                                  ) : (
                                    <span className="text-slate-300 dark:text-slate-700 text-xs">-</span>
                                  )}
                                </td>
                              )}

                              {/* 10e. SELISIH NOTA — Merged Per Block (Mengikuti 4 Kondisi Pasti) */}
                              {isFirstRowOfBlock && (
                                <td
                                  rowSpan={totalSubRows}
                                  className="py-2 px-2 text-center align-middle font-mono bg-sky-50/20 dark:bg-sky-950/10 border-r border-slate-300 dark:border-slate-700"
                                >
                                  {(() => {
                                    const hasNota = block.qtyNota !== null && block.qtyNota !== undefined;
                                    const hasRecount = block.hasRecount && block.totalRecountFisik !== null && block.totalRecountFisik !== undefined;
                                    let selisih: number | null = null;
                                    let label = '';

                                    // Kondisi 1 & 2: Jika Qty Nota terisi
                                    if (hasNota) {
                                      const base = hasRecount ? block.totalRecountFisik! : block.totalNet;
                                      selisih = base - block.qtyNota!;
                                      label = selisih === 0 ? '✅ Klop Nota' : (selisih < 0 ? \`Kurang \${Math.abs(selisih)}\` : \`Lebih +\${selisih}\`);
                                    } 
                                    // Kondisi 3: Jika Qty Nota KOSONG tapi sudah ada Hitung Ulang
                                    else if (hasRecount) {
                                      selisih = block.totalRecountFisik! - block.totalNet;
                                      label = selisih === 0 ? '✅ Klop SJ' : (selisih < 0 ? \`Kurang \${Math.abs(selisih)}\` : \`Lebih +\${selisih}\`);
                                    }

                                    // Kondisi 4: Jika Qty Nota KOSONG dan belum hitung ulang
                                    if (selisih === null) {
                                      return <span className="text-slate-300 dark:text-slate-700 text-xs">-</span>;
                                    }

                                    const isMatch = selisih === 0;
                                    const isKurang = selisih < 0;
                                    return (
                                      <div className="flex flex-col items-center gap-1">
                                        <span
                                          className={\`inline-block px-2 py-0.5 rounded-lg text-xs font-black border \${
                                            isMatch
                                              ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
                                              : isKurang
                                              ? 'bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
                                              : 'bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/60 dark:text-blue-300 dark:border-blue-800'
                                          }\`}
                                        >
                                          {selisih > 0 ? \`+\${selisih}\` : selisih}
                                        </span>
                                        <span
                                          className={\`text-[9px] font-bold \${
                                            isMatch
                                              ? 'text-emerald-600 dark:text-emerald-400'
                                              : isKurang
                                              ? 'text-rose-600 dark:text-rose-400'
                                              : 'text-blue-600 dark:text-blue-400'
                                          }\`}
                                        >
                                          {label}
                                        </span>
                                        {!isMatch && onOpenHitungUlang && (
                                          <button
                                            type="button"
                                            onClick={() => onOpenHitungUlang(block.code)}
                                            className="mt-0.5 px-1.5 py-0.5 rounded bg-rose-600 hover:bg-rose-700 text-white text-[9px] font-bold transition cursor-pointer shadow-2xs"
                                            title="Kode ini otomatis masuk Antrian Audit Hitung Ulang. Klik untuk buka lembar hitung ulang."
                                          >
                                            📋 Audit Antrian
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })()}
                                </td>
                              )}`;

psw = psw.replace(oldBodySection, newBodySection);

fs.writeFileSync(pswPath, psw, 'utf8');
console.log('ProduksiSpreadsheetView.tsx updated successfully with complete layout & formulas.');

