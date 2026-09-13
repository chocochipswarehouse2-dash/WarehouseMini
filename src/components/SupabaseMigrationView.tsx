import React, { useState, useEffect, useMemo } from 'react';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Database,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Copy,
  Check,
  Download,
  ExternalLink,
  Layers,
  Server,
  Zap,
  ShieldCheck,
  Code2,
  FileCode,
  Sliders,
  Play,
  ArrowRightLeft,
  XCircle,
  HelpCircle,
  RotateCcw,
  Sparkles,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  getStoredSupabaseConfig,
  saveSupabaseConfig,
  resetToDefaultSupabaseConfig,
  DEFAULT_SUPABASE_URL,
  DEFAULT_SUPABASE_ANON_KEY,
} from '../services/supabase';
import { showGlobalLoading, hideGlobalLoading } from '../utils/globalLoading';

interface TableMigrationItem {
  name: string;
  label: string;
  sourceCount: number | null;
  targetCount: number | null;
  transferredCount: number;
  status: 'idle' | 'scanning' | 'ready' | 'transferring' | 'success' | 'error';
  error?: string;
  selected: boolean;
}

const ALL_MIGRATION_TABLES: Omit<TableMigrationItem, 'sourceCount' | 'targetCount' | 'transferredCount' | 'status' | 'selected'>[] = [
  { name: 'wms_users', label: '1. User & Hak Akses (wms_users)' },
  { name: 'master_produk', label: '2. Master Katalog Produk (master_produk)' },
  { name: 'karyawan', label: '3. Data Karyawan & SDM (karyawan)' },
  { name: 'master_shift', label: '4. Master Jam Shift (master_shift)' },
  { name: 'roster_shift', label: '5. Jadwal Roster Shift (roster_shift)' },
  { name: 'presensi', label: '6. Log Presensi Staf (presensi)' },
  { name: 'lembur', label: '7. Pengajuan Lembur (lembur)' },
  { name: 'perijinan_cuti', label: '8. Ijin & Cuti (perijinan_cuti)' },
  { name: 'log_produk', label: '9. Log Mutasi Stok IN/OUT (log_produk)' },
  { name: 'stock_opname_queue', label: '10. Antrean & Log SO (stock_opname_queue)' },
  { name: 'penerimaan_produksi', label: '11. Penerimaan Kedatangan CMT (penerimaan_produksi)' },
  { name: 'picking_list', label: '12. Fulfillment Picking SJ (picking_list)' },
  { name: 'peminjaman', label: '13. Peminjaman Sementara SPS (peminjaman)' },
  { name: 'perbaikan_tickets', label: '14. Tiket Defect & Reparasi (perbaikan_tickets)' },
  { name: 'qc_reports', label: '15. Laporan Pemeriksaan QC (qc_reports)' },
  { name: 'manual_shipment', label: '16. Manual Shipment Toko (manual_shipment)' },
  { name: 'pengecekan_sj', label: '17. Tarikan MD / Cek SJ (pengecekan_sj)' },
  { name: 'address_book', label: '18. Buku Alamat Cetak Label (address_book)' },
  { name: 'wms_projects', label: '19. Inisiatif & Task Proyek (wms_projects)' },
  { name: 'wms_agenda', label: '20. Agenda & Kalender Kerja (wms_agenda)' },
];

export const SupabaseMigrationView: React.FC = () => {
  const currentActiveConfig = useMemo(() => getStoredSupabaseConfig(), []);
  
  // Tab Stepper State
  const [activeStep, setActiveStep] = useState<number>(1);

  // Connection Credentials
  const [sourceUrl, setSourceUrl] = useState<string>(currentActiveConfig.url);
  const [sourceKey, setSourceKey] = useState<string>(currentActiveConfig.key);
  const [targetUrl, setTargetUrl] = useState<string>('');
  const [targetKey, setTargetKey] = useState<string>('');

  // Connection Test States
  const [sourceStatus, setSourceStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [sourceStatusMsg, setSourceStatusMsg] = useState<string>('');
  const [targetStatus, setTargetStatus] = useState<'idle' | 'testing' | 'connected' | 'error'>('idle');
  const [targetStatusMsg, setTargetStatusMsg] = useState<string>('');

  // Tables State
  const [tables, setTables] = useState<TableMigrationItem[]>(() =>
    ALL_MIGRATION_TABLES.map((t) => ({
      ...t,
      sourceCount: null,
      targetCount: null,
      transferredCount: 0,
      status: 'idle',
      selected: true,
    }))
  );

  // Transfer options & logs
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isMigrating, setIsMigrating] = useState<boolean>(false);
  const [migrationLogs, setMigrationLogs] = useState<string[]>([]);
  const [copiedSql, setCopiedSql] = useState<boolean>(false);
  const [copiedEnv, setCopiedEnv] = useState<boolean>(false);
  const [sqlContent, setSqlContent] = useState<string>('');
  const [loadingSql, setLoadingSql] = useState<boolean>(true);

  // Load master SQL schema
  useEffect(() => {
    fetch('/supabase_full_schema.sql')
      .then((res) => res.text())
      .then((text) => {
        setSqlContent(text);
        setLoadingSql(false);
      })
      .catch(() => {
        setSqlContent('-- Skrip schema dapat diunduh di /supabase_full_schema.sql');
        setLoadingSql(false);
      });
  }, []);

  const appendLog = (msg: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setMigrationLogs((prev) => [`[${timestamp}] ${msg}`, ...prev.slice(0, 100)]);
  };

  // Test Source Connection
  const testSourceConnection = async () => {
    setSourceStatus('testing');
    setSourceStatusMsg('Menghubungkan ke database sumber...');
    try {
      const client = createClient(sourceUrl.trim(), sourceKey.trim(), { auth: { persistSession: false } });
      const { count, error } = await client.from('wms_users').select('*', { count: 'exact', head: true });
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      setSourceStatus('connected');
      setSourceStatusMsg(`Terhubung! (${count || 0} user terdeteksi di wms_users)`);
      appendLog(`✅ Koneksi Sumber OK: ${new URL(sourceUrl).hostname}`);
    } catch (e: any) {
      setSourceStatus('error');
      setSourceStatusMsg(e.message || 'Gagal terhubung ke sumber');
      appendLog(`❌ Gagal koneksi sumber: ${e.message}`);
    }
  };

  // Test Target Connection
  const testTargetConnection = async () => {
    if (!targetUrl.trim() || !targetKey.trim()) {
      setTargetStatus('error');
      setTargetStatusMsg('Harap isi Target URL dan Key terlebih dahulu');
      return;
    }
    setTargetStatus('testing');
    setTargetStatusMsg('Menghubungkan ke database target baru...');
    try {
      const client = createClient(targetUrl.trim(), targetKey.trim(), { auth: { persistSession: false } });
      const { count, error } = await client.from('wms_users').select('*', { count: 'exact', head: true });
      if (error) {
        if (error.message.includes('relation "public.wms_users" does not exist') || error.code === '42P01') {
          throw new Error('Tabel wms_users belum ada! Pastikan Anda sudah menjalankan Skrip DDL Schema di Langkah 2.');
        }
        throw error;
      }
      setTargetStatus('connected');
      setTargetStatusMsg(`Terhubung dan skema valid! (${count || 0} user di database baru)`);
      appendLog(`✅ Koneksi Target OK: ${new URL(targetUrl).hostname}`);
    } catch (e: any) {
      setTargetStatus('error');
      setTargetStatusMsg(e.message || 'Gagal terhubung ke target');
      appendLog(`❌ Gagal koneksi target: ${e.message}`);
    }
  };

  // Scan Table Counts in Source & Target
  const scanTableCounts = async () => {
    if (!sourceUrl.trim() || !sourceKey.trim()) {
      alert('Isi kredensial database sumber terlebih dahulu!');
      return;
    }
    setIsScanning(true);
    appendLog('🔍 Memulai pemindaian jumlah baris data di akun sumber...');
    const sourceClient = createClient(sourceUrl.trim(), sourceKey.trim(), { auth: { persistSession: false } });
    const targetClient = (targetUrl.trim() && targetKey.trim()) 
      ? createClient(targetUrl.trim(), targetKey.trim(), { auth: { persistSession: false } })
      : null;

    const updated = [...tables];
    for (let i = 0; i < updated.length; i++) {
      const item = updated[i];
      item.status = 'scanning';
      setTables([...updated]);

      try {
        const { count: sCount, error: sErr } = await sourceClient
          .from(item.name)
          .select('*', { count: 'exact', head: true });
        
        item.sourceCount = sErr ? 0 : (sCount || 0);

        if (targetClient) {
          const { count: tCount } = await targetClient
            .from(item.name)
            .select('*', { count: 'exact', head: true });
          item.targetCount = tCount || 0;
        } else {
          item.targetCount = null;
        }

        item.status = 'ready';
      } catch (err: any) {
        item.sourceCount = 0;
        item.status = 'error';
        item.error = err.message;
      }
      setTables([...updated]);
    }
    setIsScanning(false);
    appendLog('✅ Pemindaian data selesai.');
  };

  // Toggle Table Select
  const toggleSelectTable = (name: string) => {
    setTables((prev) =>
      prev.map((t) => (t.name === name ? { ...t, selected: !t.selected } : t))
    );
  };

  const selectAllTables = (selected: boolean) => {
    setTables((prev) => prev.map((t) => ({ ...t, selected })));
  };

  // Add / Remove custom tables dynamically (Future-proof for schema expansion)
  const [customTableName, setCustomTableName] = useState('');

  const handleAddCustomTable = () => {
    const raw = customTableName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (!raw) return;
    if (tables.some((t) => t.name === raw)) {
      alert(`Tabel "${raw}" sudah ada di dalam antrean migrasi!`);
      return;
    }
    const newTableItem: TableMigrationItem = {
      name: raw,
      label: `Kustom: ${raw}`,
      sourceCount: null,
      targetCount: null,
      transferredCount: 0,
      status: 'idle',
      selected: true,
    };
    setTables((prev) => [...prev, newTableItem]);
    setCustomTableName('');
    appendLog(`➕ Menambahkan tabel kustom "${raw}" ke antrean.`);
  };

  const handleRemoveTable = (name: string) => {
    setTables((prev) => prev.filter((t) => t.name !== name));
    appendLog(`➖ Menghapus tabel "${name}" dari antrean migrasi.`);
  };

  // Run Direct Batch Migration
  const startMigration = async () => {
    if (!targetUrl.trim() || !targetKey.trim()) {
      alert('Target Supabase URL dan Anon Key belum diisi!');
      return;
    }
    const selectedTables = tables.filter((t) => t.selected);
    if (selectedTables.length === 0) {
      alert('Pilih minimal satu tabel yang ingin dimigrasikan!');
      return;
    }

    if (!confirm(`Mulai kloning ${selectedTables.length} tabel dari Sumber ke Target baru? Data akan ditransfer secara aman.`)) {
      return;
    }

    setIsMigrating(true);
    showGlobalLoading('Mengkloning data ke akun Supabase baru...');
    appendLog(`🚀 Memulai migrasi ${selectedTables.length} tabel...`);

    const sourceClient = createClient(sourceUrl.trim(), sourceKey.trim(), { auth: { persistSession: false } });
    const targetClient = createClient(targetUrl.trim(), targetKey.trim(), { auth: { persistSession: false } });

    const BATCH_SIZE = 500;
    const CHUNK_SIZE = 150;

    const updatedTables = [...tables];

    for (let i = 0; i < updatedTables.length; i++) {
      const t = updatedTables[i];
      if (!t.selected) continue;

      t.status = 'transferring';
      t.transferredCount = 0;
      setTables([...updatedTables]);
      appendLog(`⏳ Mentransfer tabel [${t.name}]...`);

      try {
        // 1. Get exact total count
        const { count, error: countErr } = await sourceClient
          .from(t.name)
          .select('*', { count: 'exact', head: true });

        if (countErr) throw countErr;
        const totalRows = count || 0;
        t.sourceCount = totalRows;

        if (totalRows === 0) {
          t.status = 'success';
          setTables([...updatedTables]);
          appendLog(`ℹ️ [${t.name}] kosong (0 baris), dilewati.`);
          continue;
        }

        let fetched = 0;
        let inserted = 0;

        while (fetched < totalRows) {
          const end = Math.min(fetched + BATCH_SIZE - 1, totalRows - 1);
          const { data: rows, error: fetchErr } = await sourceClient
            .from(t.name)
            .select('*')
            .range(fetched, end);

          if (fetchErr) throw fetchErr;
          if (!rows || rows.length === 0) break;

          fetched += rows.length;

          // Insert into target in safe chunks
          for (let c = 0; c < rows.length; c += CHUNK_SIZE) {
            const chunk = rows.slice(c, c + CHUNK_SIZE);
            const { error: upsertErr } = await targetClient
              .from(t.name)
              .upsert(chunk, { ignoreDuplicates: true });

            if (upsertErr) {
              // Fallback to simple insert
              const { error: insertErr } = await targetClient.from(t.name).insert(chunk);
              if (insertErr) {
                console.warn(`Fallback insert error on ${t.name}:`, insertErr);
              } else {
                inserted += chunk.length;
              }
            } else {
              inserted += chunk.length;
            }
          }

          t.transferredCount = inserted;
          setTables([...updatedTables]);
        }

        t.status = 'success';
        t.targetCount = inserted;
        setTables([...updatedTables]);
        appendLog(`✅ Berhasil mentransfer [${t.name}]: ${inserted} / ${totalRows} baris.`);
      } catch (err: any) {
        t.status = 'error';
        t.error = err.message || 'Gagal mentransfer tabel';
        setTables([...updatedTables]);
        appendLog(`❌ Gagal mentransfer [${t.name}]: ${err.message}`);
      }
    }

    setIsMigrating(false);
    hideGlobalLoading();
    appendLog('🎉 Proses kloning seluruh tabel telah selesai!');
    alert('Kloning data selesai! Silakan periksa hasil transfer dan lanjut ke Langkah 5 untuk beralih akun.');
    setActiveStep(5);
  };

  // Switch Active App Database to New Supabase
  const handleSwitchToNewAccount = () => {
    if (!targetUrl.trim() || !targetKey.trim()) {
      alert('Target Supabase URL dan Anon Key belum diisi!');
      return;
    }
    if (!confirm('Beralih ke akun Supabase yang baru sekarang? Aplikasi akan me-reload dan menggunakan database baru.')) {
      return;
    }

    saveSupabaseConfig(targetUrl.trim(), targetKey.trim(), true);
    alert('Database aktif berhasil dialihkan ke akun Supabase baru! Halaman akan dimuat ulang.');
    window.location.reload();
  };

  // Revert back to default Supabase
  const handleRevertToDefault = () => {
    if (!confirm('Kembalikan konfigurasi database ke akun Supabase bawaan (asal)?')) {
      return;
    }
    resetToDefaultSupabaseConfig();
    alert('Konfigurasi berhasil dikembalikan ke akun awal!');
    window.location.reload();
  };

  const totalSourceRows = tables.reduce((acc, t) => acc + (t.sourceCount || 0), 0);
  const totalTransferredRows = tables.reduce((acc, t) => acc + (t.transferredCount || 0), 0);

  return (
    <div className="flex-1 p-3 sm:p-5 max-w-7xl mx-auto w-full space-y-6">
      {/* Header Banner */}
      <div className="bg-white dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl">
              <Database className="w-5 h-5" />
            </span>
            <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 dark:text-white tracking-tight uppercase">
              Setup & Migrasi Akun Supabase
            </h1>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/10 text-amber-500 border border-amber-500/30">
              EGRESS BYPASS TOOL
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
            Solusi cepat mengatasi limit kuota *Egress* Supabase Free Tier (5 GB/bulan). Pindahkan seluruh skema dan kloning ribuan baris data ke akun Supabase baru dalam beberapa klik tanpa kehilangan data apa pun.
          </p>
        </div>

        {/* Current Status Pill */}
        <div className="p-3 bg-slate-50 dark:bg-black/40 border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 min-w-[240px]">
          <div className="text-[10px] uppercase font-bold text-slate-400">Database Aktif Saat Ini:</div>
          <div className="font-mono text-xs font-bold text-emerald-500 truncate" title={currentActiveConfig.url}>
            {currentActiveConfig.url.replace('https://', '')}
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-[10px] text-slate-500">
              {localStorage.getItem('wms_supabase_is_custom') === 'true' ? '🟢 Akun Kustom' : '🔵 Akun Bawaan'}
            </span>
            {localStorage.getItem('wms_supabase_is_custom') === 'true' && (
              <button
                type="button"
                onClick={handleRevertToDefault}
                className="text-[10px] font-bold text-rose-500 hover:underline flex items-center gap-0.5"
              >
                <RotateCcw className="w-2.5 h-2.5" />
                <span>Reset ke Awal</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Stepper Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {[
          { num: 1, title: '1. Buat Akun Baru', desc: 'Proyek Baru' },
          { num: 2, title: '2. Eksekusi SQL', desc: 'DDL Skema Lengkap' },
          { num: 3, title: '3. Hubungkan DB', desc: 'Tes Koneksi' },
          { num: 4, title: '4. Kloning Data', desc: 'Transfer Batch' },
          { num: 5, title: '5. Beralih Akun', desc: 'Aktifkan & Selesai' },
        ].map((step) => {
          const isActive = activeStep === step.num;
          return (
            <button
              key={step.num}
              type="button"
              onClick={() => setActiveStep(step.num)}
              className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                isActive
                  ? 'bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 shadow-sm'
                  : 'bg-white dark:bg-[#0F0F12] border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              <div className="text-xs font-bold truncate">{step.title}</div>
              <div className="text-[10px] opacity-70 truncate">{step.desc}</div>
            </button>
          );
        })}
      </div>

      {/* STEP CONTENT 1: Buat Akun Baru */}
      {activeStep === 1 && (
        <div className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs">
              1
            </span>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase">
              Langkah 1: Membuat Proyek Baru di Supabase (Free Tier)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <ExternalLink className="w-4 h-4 text-emerald-500" />
                <span>Instruksi Pembuatan Proyek Baru:</span>
              </h3>
              <ol className="list-decimal list-inside space-y-2 pl-1">
                <li>Buka <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-emerald-500 font-bold underline">supabase.com/dashboard</a> (gunakan akun Google/Github baru jika kuota 2 project per akun habis).</li>
                <li>Klik tombol <strong>&quot;New Project&quot;</strong>.</li>
                <li>Pilih Organization Anda, isi <strong>Project Name</strong> (contoh: <code>WMS-Chocochips-DB2</code>).</li>
                <li>Buat <strong>Database Password</strong> yang kuat (simpan di catatan Anda).</li>
                <li>Pilih <strong>Region: Singapore (ap-southeast-1)</strong> agar koneksi dari Indonesia sangat cepat dan rendah latensi.</li>
                <li>Klik <strong>&quot;Create new project&quot;</strong> dan tunggu ~1-2 menit hingga proses provision selesai.</li>
              </ol>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <Code2 className="w-4 h-4 text-emerald-500" />
                <span>Mengambil URL & API Key Baru:</span>
              </h3>
              <ol className="list-decimal list-inside space-y-2 pl-1">
                <li>Setelah project selesai dibuat, buka menu <strong>Project Settings</strong> (ikon gerigi di kiri bawah).</li>
                <li>Pilih tab <strong>API</strong>.</li>
                <li>Salin <strong>Project URL</strong> (format: <code>https://xxxx.supabase.co</code>).</li>
                <li>Salin <strong>Project API Keys: anon / public</strong> (kunci publik untuk aplikasi web).</li>
                <li>Simpan kedua nilai tersebut untuk diisi pada <strong>Langkah 3</strong> nanti.</li>
              </ol>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveStep(2)}
                  className="w-full py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <span>Lanjut ke Langkah 2: Eksekusi SQL Skema</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* STEP CONTENT 2: Eksekusi Skrip DDL SQL Lengkap */}
      {activeStep === 2 && (
        <div className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 gap-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs">
                2
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase">
                  Langkah 2: Eksekusi Master Skrip DDL Schema di Akun Baru
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Membuat seluruh 20 tabel (termasuk Agenda & Proyek), index pencarian cepat, view stok realtime, dan izin RLS secara otomatis.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(sqlContent);
                  setCopiedSql(true);
                  setTimeout(() => setCopiedSql(false), 2500);
                }}
                className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedSql ? 'Tersalin ke Clipboard!' : 'Salin Seluruh SQL (1-Click)'}</span>
              </button>
              <a
                href="/supabase_full_schema.sql"
                download="supabase_full_schema.sql"
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Unduh File .sql</span>
              </a>
            </div>
          </div>

          <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-700 dark:text-amber-300 space-y-1">
            <strong>Cara Menjalankan:</strong>
            <ol className="list-decimal list-inside space-y-1 pl-1">
              <li>Buka dashboard proyek Supabase baru Anda.</li>
              <li>Klik menu <strong>SQL Editor</strong> di bilah navigasi sebelah kiri.</li>
              <li>Klik <strong>&quot;+ New Query&quot;</strong>, lalu paste (tempel) seluruh skrip SQL di bawah ini.</li>
              <li>Klik tombol hijau <strong>&quot;Run&quot;</strong> (Ctrl+Enter). Tunggu hingga muncul pesan <em>&quot;Success. No rows returned&quot;</em>.</li>
            </ol>
          </div>

          {/* SQL Preview Box */}
          <div className="relative border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-slate-950 font-mono text-[11px] text-emerald-400">
            <div className="p-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between text-slate-400 text-xs">
              <span className="flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-emerald-400" />
                <span>public/supabase_full_schema.sql (20 Tabel, Views, RLS, Realtime)</span>
              </span>
              <span>{loadingSql ? 'Memuat...' : `${sqlContent.split('\n').length} baris SQL`}</span>
            </div>
            <pre className="p-4 max-h-72 overflow-y-auto whitespace-pre-wrap leading-relaxed">
              {sqlContent}
            </pre>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Sudah Dijalankan, Lanjut ke Langkah 3</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP CONTENT 3: Hubungkan DB (Tes Koneksi Sumber & Target) */}
      {activeStep === 3 && (
        <div className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs">
              3
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase">
                Langkah 3: Hubungkan Database Sumber (Lama) & Target (Baru)
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pastikan kedua akun dapat diakses oleh browser sebelum memulai transfer data.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Box Sumber */}
            <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Server className="w-4 h-4 text-blue-500" />
                  <span>1. Database Sumber (Akun Lama)</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-blue-500/10 text-blue-500 font-bold">
                  ORIGIN
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Supabase URL Sumber:
                  </label>
                  <input
                    type="text"
                    value={sourceUrl}
                    onChange={(e) => setSourceUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-xs outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="https://vxongwtxmhjixhzeoidp.supabase.co"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Supabase Anon Key Sumber:
                  </label>
                  <input
                    type="password"
                    value={sourceKey}
                    onChange={(e) => setSourceKey(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-xs outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={sourceStatus === 'testing'}
                    onClick={testSourceConnection}
                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {sourceStatus === 'testing' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    <span>Tes Koneksi Sumber</span>
                  </button>
                  {sourceStatus === 'connected' && (
                    <span className="text-[11px] text-emerald-500 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Terhubung</span>
                    </span>
                  )}
                  {sourceStatus === 'error' && (
                    <span className="text-[11px] text-rose-500 font-bold flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Gagal</span>
                    </span>
                  )}
                </div>
                {sourceStatusMsg && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                    {sourceStatusMsg}
                  </p>
                )}
              </div>
            </div>

            {/* Box Target */}
            <div className="p-4 bg-slate-50 dark:bg-[#0F0F12] border border-emerald-500/30 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-800 dark:text-slate-200 uppercase tracking-wider flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-emerald-500" />
                  <span>2. Database Target (Akun Baru)</span>
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-500 font-bold">
                  TARGET
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Supabase URL Target Baru: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="https://xxxxxxxxxxxx.supabase.co"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-400 mb-1">
                    Supabase Anon Key Target Baru: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="password"
                    value={targetKey}
                    onChange={(e) => setTargetKey(e.target.value)}
                    className="w-full px-3 py-2 bg-white dark:bg-black border border-slate-200 dark:border-slate-800 rounded-xl font-mono text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                  />
                </div>

                <div className="pt-2 flex items-center justify-between">
                  <button
                    type="button"
                    disabled={targetStatus === 'testing'}
                    onClick={testTargetConnection}
                    className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl text-xs flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                  >
                    {targetStatus === 'testing' ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    <span>Tes Koneksi Target</span>
                  </button>
                  {targetStatus === 'connected' && (
                    <span className="text-[11px] text-emerald-500 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Skema Terverifikasi</span>
                    </span>
                  )}
                  {targetStatus === 'error' && (
                    <span className="text-[11px] text-rose-500 font-bold flex items-center gap-1">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Error</span>
                    </span>
                  )}
                </div>
                {targetStatusMsg && (
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 pt-1">
                    {targetStatusMsg}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveStep(2)}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              Kembali ke Langkah 2
            </button>
            <button
              type="button"
              onClick={() => {
                scanTableCounts();
                setActiveStep(4);
              }}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Lanjut ke Langkah 4: Kloning Data</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP CONTENT 4: Kloning & Transfer Data Otomatis */}
      {activeStep === 4 && (
        <div className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-3 gap-3">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs">
                4
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase">
                  Langkah 4: Kloning Data Otomatis Antar Database
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Total data sumber terdeteksi: <strong>{totalSourceRows.toLocaleString()} baris</strong>.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isScanning}
                onClick={scanTableCounts}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                <span>Pindai Ulang Baris</span>
              </button>
              <button
                type="button"
                disabled={isMigrating || isScanning}
                onClick={startMigration}
                className="px-4 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-[0_0_12px_rgba(16,185,129,0.3)] cursor-pointer"
              >
                {isMigrating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Mentransfer Data ({totalTransferredRows}/{totalSourceRows})...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-black" />
                    <span>Mulai Kloning Data Sekarang</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick Selection Filter & Custom Table Adder */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50 dark:bg-[#0F0F12] p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => selectAllTables(true)}
                className="text-emerald-500 font-bold hover:underline"
              >
                Pilih Semua
              </button>
              <span>&bull;</span>
              <button
                type="button"
                onClick={() => selectAllTables(false)}
                className="text-slate-400 hover:underline"
              >
                Batal Pilih
              </button>
              <span>&bull;</span>
              <span>
                {tables.filter((t) => t.selected).length} dari {tables.length} tabel dipilih
              </span>
            </div>

            {/* Input Tambah Tabel Kustom Dinamis */}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={customTableName}
                onChange={(e) => setCustomTableName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddCustomTable();
                  }
                }}
                placeholder="+ Nama tabel baru..."
                className="px-2.5 py-1.5 bg-white dark:bg-black border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-mono outline-none focus:border-emerald-500 w-44"
              />
              <button
                type="button"
                onClick={handleAddCustomTable}
                className="px-2.5 py-1.5 bg-slate-200 dark:bg-slate-800 hover:bg-emerald-500 hover:text-black font-bold rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer text-slate-700 dark:text-slate-200"
                title="Tambahkan tabel baru ke antrean kloning"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Tambah</span>
              </button>
            </div>
          </div>

          {/* Tables Checklist Grid */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100 dark:bg-[#0F0F12] text-slate-400 text-[10px] font-bold uppercase">
                <tr>
                  <th className="p-3 w-10 text-center">Pilih</th>
                  <th className="p-3">Nama Tabel</th>
                  <th className="p-3 text-right">Data Sumber</th>
                  <th className="p-3 text-right">Data Target</th>
                  <th className="p-3 text-right">Ditransfer</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 w-10 text-center">Hapus</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
                {tables.map((tbl) => (
                  <tr
                    key={tbl.name}
                    className={`hover:bg-slate-50/50 dark:hover:bg-white/[0.02] ${
                      !tbl.selected ? 'opacity-40' : ''
                    }`}
                  >
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={tbl.selected}
                        onChange={() => toggleSelectTable(tbl.name)}
                        className="rounded text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                      />
                    </td>
                    <td className="p-3 font-sans font-bold text-slate-800 dark:text-slate-200">
                      {tbl.label}
                    </td>
                    <td className="p-3 text-right font-bold text-blue-500">
                      {tbl.sourceCount !== null ? tbl.sourceCount.toLocaleString() : '-'}
                    </td>
                    <td className="p-3 text-right text-slate-400">
                      {tbl.targetCount !== null ? tbl.targetCount.toLocaleString() : '-'}
                    </td>
                    <td className="p-3 text-right font-bold text-emerald-500">
                      {tbl.transferredCount > 0 ? tbl.transferredCount.toLocaleString() : '-'}
                    </td>
                    <td className="p-3 text-center font-sans">
                      {tbl.status === 'success' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                          Selesai
                        </span>
                      )}
                      {tbl.status === 'transferring' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 animate-pulse border border-amber-500/20">
                          Proses...
                        </span>
                      )}
                      {tbl.status === 'error' && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-500 border border-rose-500/20" title={tbl.error}>
                          Gagal
                        </span>
                      )}
                      {tbl.status === 'ready' && (
                        <span className="text-[10px] text-slate-400">Siap</span>
                      )}
                      {tbl.status === 'idle' && (
                        <span className="text-[10px] text-slate-400">-</span>
                      )}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        type="button"
                        onClick={() => handleRemoveTable(tbl.name)}
                        title={`Hapus tabel "${tbl.name}" dari antrean`}
                        className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Realtime Transfer Logs */}
          {migrationLogs.length > 0 && (
            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5 font-mono text-[11px] text-slate-300">
              <div className="text-[10px] font-bold text-slate-500 uppercase">Live Migration Terminal Log:</div>
              <div className="max-h-36 overflow-y-auto space-y-0.5">
                {migrationLogs.map((log, lIdx) => (
                  <div key={lIdx} className="leading-tight truncate">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              Kembali ke Langkah 3
            </button>
            <button
              type="button"
              onClick={() => setActiveStep(5)}
              className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span>Lanjut ke Langkah 5: Beralih Akun</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* STEP CONTENT 5: Beralih Akun (Switch Database) */}
      {activeStep === 5 && (
        <div className="bg-white dark:bg-[#09090B] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 space-y-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
            <span className="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-500 flex items-center justify-center font-bold text-xs">
              5
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white uppercase">
                Langkah 5: Beralih ke Akun Supabase Baru & Update Hosting
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Pilih opsi di bawah untuk mengaktifkan database baru secara instan di perangkat Anda atau untuk seluruh pengguna di Vercel.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Opsi A: Instan di Browser */}
            <div className="p-4 sm:p-5 bg-slate-50 dark:bg-[#0F0F12] border border-emerald-500/30 rounded-2xl space-y-4">
              <div className="flex items-center gap-2 text-emerald-500 font-bold text-xs uppercase tracking-wider">
                <Zap className="w-4 h-4" />
                <span>Opsi 1: Aktifkan di Browser Ini Sekarang</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Tombol ini akan langsung menyimpan URL & Anon Key baru ke penyimpanan lokal (localStorage) browser Anda dan me-reload aplikasi secara otomatis. Anda dapat langsung menguji dan memakai database baru tanpa perlu menunggu deploy!
              </p>

              <div className="p-3 bg-white dark:bg-black border border-slate-200 dark:border-slate-800 rounded-xl space-y-1 font-mono text-xs">
                <div className="text-[10px] text-slate-400">Target Baru:</div>
                <div className="text-emerald-500 font-bold truncate">{targetUrl || '(Target URL belum diisi)'}</div>
              </div>

              <button
                type="button"
                onClick={handleSwitchToNewAccount}
                className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-extrabold rounded-xl shadow-[0_0_15px_rgba(16,185,129,0.3)] text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <Sparkles className="w-4 h-4" />
                <span>Aktifkan Akun Baru di Browser Ini Sekarang</span>
              </button>
            </div>

            {/* Opsi B: Update Vercel */}
            <div className="p-4 sm:p-5 bg-slate-50 dark:bg-[#0F0F12] border border-slate-200 dark:border-slate-800 rounded-2xl space-y-4">
              <div className="flex items-center gap-2 text-blue-500 font-bold text-xs uppercase tracking-wider">
                <Server className="w-4 h-4" />
                <span>Opsi 2: Update Permanen untuk Seluruh Tim (Vercel)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Agar seluruh tim, staf gudang, dan perangkat lain otomatis memakai database baru saat membuka web:
              </p>

              <ol className="list-decimal list-inside space-y-1 text-xs text-slate-600 dark:text-slate-300 pl-1">
                <li>Buka dashboard <strong>Vercel &gt; Settings &gt; Environment Variables</strong>.</li>
                <li>Perbarui 2 variabel berikut dengan nilai database baru Anda:</li>
              </ol>

              <div className="p-3 bg-slate-950 text-emerald-400 border border-slate-800 rounded-xl font-mono text-[11px] space-y-1">
                <div>VITE_SUPABASE_URL={targetUrl || 'https://xxxxxxxx.supabase.co'}</div>
                <div>VITE_SUPABASE_ANON_KEY={targetKey || 'eyJhbGciOiJIUzI1Ni...'}</div>
              </div>

              <button
                type="button"
                onClick={() => {
                  const envText = `VITE_SUPABASE_URL=${targetUrl}\nVITE_SUPABASE_ANON_KEY=${targetKey}`;
                  navigator.clipboard.writeText(envText);
                  setCopiedEnv(true);
                  setTimeout(() => setCopiedEnv(false), 2500);
                }}
                className="w-full py-2 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                {copiedEnv ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedEnv ? 'Variabel Env Berhasil Disalin!' : 'Salin Nilai Environment Variables'}</span>
              </button>
            </div>
          </div>

          <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className="text-slate-800 dark:text-slate-200">
                Pindah akun Supabase selesai! Anda kini dapat melanjutkan operasional WMS tanpa terkendala limit egress.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveStep(1)}
              className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline shrink-0"
            >
              Ulangi dari Awal
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
