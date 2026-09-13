import React from 'react';
import { 
  Truck, ClipboardCheck, ArrowRight, Package, Box, RefreshCw, 
  Scissors, CheckCircle2, AlertTriangle, Users, Clock, ShieldCheck, 
  Search, FileText, FileSpreadsheet, ScanLine
} from 'lucide-react';

const WorkflowStep = ({ icon: Icon, title, desc, color }: { icon: any, title: string, desc: string, color: string }) => (
  <div className="flex flex-col items-center text-center p-4 rounded-xl bg-white dark:bg-[#131d31] border border-slate-200 dark:border-slate-800 shadow-sm relative z-10 w-44 shrink-0">
    <div className={`w-10 h-10 rounded-full flex items-center justify-center mb-3 ${color}`}>
      <Icon className="w-5 h-5" />
    </div>
    <h4 className="font-bold text-slate-800 dark:text-slate-100 text-sm mb-1">{title}</h4>
    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{desc}</p>
  </div>
);

const Arrow = () => (
  <div className="flex-1 h-0.5 bg-slate-200 dark:bg-slate-700 relative min-w-[20px] shrink-0 z-0 hidden md:block">
    <ArrowRight className="absolute -right-2 -top-2 w-4 h-4 text-slate-300 dark:text-slate-600" />
  </div>
);

const DownArrow = () => (
  <div className="h-6 w-0.5 bg-slate-200 dark:bg-slate-700 relative my-1 z-0 md:hidden block">
    <ArrowRight className="absolute -bottom-2 -left-2 w-4 h-4 text-slate-300 dark:text-slate-600 rotate-90" />
  </div>
);

export default function SystemWorkflow() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 bg-slate-50 dark:bg-[#0a0f1c] h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto w-full space-y-8">
        
        {/* WORKFLOW 1: INBOUND & QC */}
        <div className="bg-white/50 dark:bg-[#131d31]/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <Truck className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-lg">1. Inbound & Quality Control</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Alur penerimaan barang produksi hingga inspeksi mutu.</p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-between">
            <WorkflowStep 
              icon={Truck} 
              title="Penerimaan Produksi" 
              desc="Kedatangan barang Lokal CMT atau Kargo. Input Qty & Warna." 
              color="bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={ClipboardCheck} 
              title="Inspeksi QC" 
              desc="Pemeriksaan mutu barang. Hitung jumlah barang OKE dan REJECT." 
              color="bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" 
            />
            <Arrow /><DownArrow />
            <div className="flex flex-col gap-4 w-44 shrink-0">
               <WorkflowStep 
                icon={CheckCircle2} 
                title="Barang OKE" 
                desc="Masuk stok fisik gudang reguler." 
                color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" 
              />
              <WorkflowStep 
                icon={AlertTriangle} 
                title="Barang REJECT" 
                desc="Generate Tiket Perbaikan otomatis." 
                color="bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400" 
              />
            </div>
          </div>
        </div>

        {/* WORKFLOW 2: PERBAIKAN */}
        <div className="bg-white/50 dark:bg-[#131d31]/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <Scissors className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-lg">2. Modul Perbaikan (Repair)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Penanganan barang reject (kotor, robek, cacat).</p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-between">
            <WorkflowStep 
              icon={AlertTriangle} 
              title="Tiket REJECT" 
              desc="Barang menunggu disortir oleh kepala tim QC." 
              color="bg-rose-50 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={RefreshCw} 
              title="Proses Perbaikan" 
              desc="Masuk tahap CUCI (noda) atau PERMAK (jahit)." 
              color="bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" 
            />
            <Arrow /><DownArrow />
            <div className="flex flex-col gap-2 w-44 shrink-0">
               <WorkflowStep 
                icon={CheckCircle2} 
                title="Grade A" 
                desc="Sembuh total, kembali ke stok reguler." 
                color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" 
              />
               <WorkflowStep 
                icon={Search} 
                title="Defect Sale" 
                desc="Cacat permanen ringan, dijual obral." 
                color="bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" 
              />
            </div>
          </div>
        </div>

        {/* WORKFLOW 3: TARIKAN MD */}
        <div className="bg-white/50 dark:bg-[#131d31]/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-lg">3. Pengecekan Surat Jalan (Tarikan MD)</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Komparasi dokumen SJ vs stok fisik saat kedatangan.</p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-between">
            <WorkflowStep 
              icon={FileText} 
              title="Upload CSV" 
              desc="Upload file Tarikan Surat Jalan dari MD." 
              color="bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={ScanLine} 
              title="Scan Fisik" 
              desc="Scan barcode barang aktual yang datang." 
              color="bg-purple-50 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={ClipboardCheck} 
              title="Komparasi" 
              desc="Hasil COCOK, SELISIH, LEBIH, atau KURANG." 
              color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" 
            />
          </div>
        </div>

        {/* WORKFLOW 4: PICKING & OUTBOUND */}
        <div className="bg-white/50 dark:bg-[#131d31]/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-lg">4. Picking & Outbound</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Pengambilan barang dari rak hingga dikirim.</p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-between">
            <WorkflowStep 
              icon={FileText} 
              title="Request Picking" 
              desc="Pembuatan daftar ambil barang dari pesanan." 
              color="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={Box} 
              title="Checker Ambil" 
              desc="Tim gudang mengambil barang dari lokasi." 
              color="bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={ScanLine} 
              title="Packing" 
              desc="Scan ulang validasi saat pengemasan." 
              color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" 
            />
          </div>
        </div>

        {/* WORKFLOW 5: HR */}
        <div className="bg-white/50 dark:bg-[#131d31]/50 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-slate-800 dark:text-white text-lg">5. HR & Kepegawaian</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Siklus presensi, shift, lembur, dan approval HR.</p>
            </div>
          </div>
          
          <div className="flex flex-col md:flex-row items-center justify-between">
            <WorkflowStep 
              icon={Clock} 
              title="Shift & Presensi" 
              desc="Jadwal roster tim dan absen harian." 
              color="bg-blue-50 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={FileText} 
              title="Lembur & Cuti" 
              desc="Karyawan mengajukan lembur atau cuti." 
              color="bg-amber-50 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400" 
            />
            <Arrow /><DownArrow />
            <WorkflowStep 
              icon={ShieldCheck} 
              title="Approval & Rekap" 
              desc="HR/SPV menyetujui dan rekap kehadiran." 
              color="bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400" 
            />
          </div>
        </div>

      </div>
    </div>
  );
}
