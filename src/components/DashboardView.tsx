import React from 'react';
import { Package, Truck, Boxes, TrendingUp, AlertCircle, Clock } from 'lucide-react';
import { ConstructionBanner } from './ConstructionBanner';

export const DashboardView: React.FC = () => {
  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto pb-24">
      <ConstructionBanner />
      {/* Header Section */}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-black text-slate-900 dark:text-white">Dashboard Operasional</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Ringkasan aktivitas dan metrik gudang hari ini.
        </p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Pesanan Diproses', value: '1,284', trend: '+12%', icon: Package, color: 'text-blue-500', bg: 'bg-blue-100 dark:bg-blue-900/30' },
          { label: 'Barang Masuk', value: '8,432', trend: '+5%', icon: Truck, color: 'text-emerald-500', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
          { label: 'Stok Kritis', value: '24', trend: '-2%', icon: AlertCircle, color: 'text-rose-500', bg: 'bg-rose-100 dark:bg-rose-900/30' },
          { label: 'Tugas Picking', value: '45', trend: 'Selesai', icon: Boxes, color: 'text-amber-500', bg: 'bg-amber-100 dark:bg-amber-900/30' }
        ].map((stat, i) => (
          <div key={i} className="bg-white dark:bg-[#1a2332] p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-start justify-between">
            <div>
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">{stat.label}</p>
              <h3 className="text-2xl font-black text-slate-900 dark:text-white">{stat.value}</h3>
              <div className="text-[10px] font-bold text-emerald-500 mt-2 flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                {stat.trend} dari hari sebelumnya
              </div>
            </div>
            <div className={`p-3 rounded-xl ${stat.bg} ${stat.color}`}>
              <stat.icon className="w-6 h-6" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Activity */}
        <div className="lg:col-span-2 bg-white dark:bg-[#1a2332] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
            <h2 className="text-sm font-black text-slate-900 dark:text-white">Aktivitas Terkini</h2>
            <button className="text-xs font-bold text-primary-500 hover:text-primary-600">Lihat Semua</button>
          </div>
          <div className="p-5 space-y-4">
            {[1, 2, 3, 4].map((_, i) => (
              <div key={i} className="flex gap-4 items-start">
                <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                  <Clock className="w-4 h-4 text-slate-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Pesanan #ORD-{8000 + i} Selesai di Packing</p>
                  <p className="text-xs text-slate-500 mt-0.5">Oleh: Budi Santoso • Area: Meja 4</p>
                </div>
                <div className="text-[10px] font-bold text-slate-400">{i * 15 + 5} mnt lalu</div>
              </div>
            ))}
          </div>
        </div>

        {/* Action Panel */}
        <div className="bg-gradient-to-br from-primary-500 to-[#ff9e40] p-6 rounded-2xl text-white flex flex-col justify-between">
          <div>
            <h3 className="text-lg font-black mb-2">Pusat Notifikasi</h3>
            <p className="text-sm opacity-90 leading-relaxed">
              Anda memiliki 3 tugas picking prioritas tinggi yang membutuhkan penyelesaian segera.
            </p>
          </div>
          <button className="mt-6 w-full bg-white text-primary-600 font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transition-shadow">
            Mulai Tugas Sekarang
          </button>
        </div>
      </div>
    </div>
  );
};
