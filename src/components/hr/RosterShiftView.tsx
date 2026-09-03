import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Search,
  Users,
  Filter,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { UserSession, RosterShiftRecord, KaryawanRecord } from '../../types';
import { fetchRosterShiftList, fetchKaryawanDirectory } from '../../services/supabase';

interface RosterShiftViewProps {
  session: UserSession | null;
  onShowToast: (msg: string, type?: 'success' | 'error' | 'info' | 'warning') => void;
}

export const RosterShiftView: React.FC<RosterShiftViewProps> = ({ session, onShowToast }) => {
  const [loading, setLoading] = useState<boolean>(true);
  const [rosterList, setRosterList] = useState<RosterShiftRecord[]>([]);
  const [karyawanList, setKaryawanList] = useState<KaryawanRecord[]>([]);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedShift, setSelectedShift] = useState<string>('all');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });

  const loadData = async () => {
    setLoading(true);
    try {
      const [roster, employees] = await Promise.all([
        fetchRosterShiftList(),
        fetchKaryawanDirectory(),
      ]);
      setRosterList(roster);
      setKaryawanList(employees);
    } catch (err) {
      console.warn('Gagal memuat jadwal roster:', err);
      onShowToast('Gagal memuat jadwal roster', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Map NIK to employee name
  const empMap = useMemo(() => {
    const map: Record<string, KaryawanRecord> = {};
    karyawanList.forEach((k) => {
      map[k.nik] = k;
    });
    return map;
  }, [karyawanList]);

  // Filtered Roster
  const filteredRoster = useMemo(() => {
    return rosterList.filter((r) => {
      // Date filter (if selected, filter by this date; if empty, show all)
      if (selectedDate && r.tanggal !== selectedDate) {
        return false;
      }
      // Shift filter
      if (selectedShift !== 'all' && !r.shift.toLowerCase().includes(selectedShift.toLowerCase())) {
        return false;
      }
      // Search
      if (searchQuery.trim()) {
        const emp = empMap[r.nik];
        const text = `${r.nik} ${emp?.nama || ''} ${r.shift} ${r.keterangan || ''}`.toLowerCase();
        if (!text.includes(searchQuery.toLowerCase())) {
          return false;
        }
      }
      return true;
    });
  }, [rosterList, selectedDate, selectedShift, searchQuery, empMap]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* HEADER BANNER */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#131d31] shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#ff7a00]/10 border border-[#ff7a00]/20 flex items-center justify-center text-[#ff7a00]">
            <Calendar className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-900 dark:text-white">
                Jadwal Roster Shift Gudang
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-[#ff7a00]/15 text-[#ff7a00] border border-[#ff7a00]/30">
                {rosterList.length} Jadwal
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Monitoring pembagian jam kerja dan jadwal piket tim warehouse
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-extrabold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer"
        >
          <RotateCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Data</span>
        </button>
      </div>

      {/* FILTERS & SEARCH BAR */}
      <div className="p-5 rounded-3xl bg-white dark:bg-[#131d31] shadow-sm border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Cari NIK atau Nama Staf..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-[#ff7a00] dark:text-white"
            />
          </div>

          {/* Date Picker */}
          <div className="relative">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-[#ff7a00] dark:text-white font-mono"
            />
          </div>

          {/* Shift Filter Dropdown */}
          <div>
            <select
              value={selectedShift}
              onChange={(e) => setSelectedShift(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 focus:outline-none focus:border-[#ff7a00] dark:text-white font-extrabold"
            >
              <option value="all">Semua Shift & Libur</option>
              <option value="Shift 1">Shift 1 (08:00 - 17:00)</option>
              <option value="Shift 2">Shift 2 (09:00 - 18:00)</option>
              <option value="Shift 3">Shift 3 (12:00 - 21:00)</option>
              <option value="Libur">Libur</option>
            </select>
          </div>
        </div>

        {/* Quick Date Shortcuts */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1 text-xs">
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              setSelectedDate(now.toISOString().slice(0, 10));
            }}
            className="px-3 py-1.5 rounded-lg bg-[#ff7a00]/10 text-[#ff7a00] font-bold hover:bg-[#ff7a00]/20 cursor-pointer transition-all whitespace-nowrap"
          >
            Hari Ini
          </button>
          <button
            type="button"
            onClick={() => {
              const tmrw = new Date();
              tmrw.setDate(tmrw.getDate() + 1);
              setSelectedDate(tmrw.toISOString().slice(0, 10));
            }}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 cursor-pointer transition-all whitespace-nowrap"
          >
            Besok
          </button>
          <button
            type="button"
            onClick={() => setSelectedDate('')}
            className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-200 cursor-pointer transition-all whitespace-nowrap"
          >
            Tampilkan Semua Tanggal
          </button>
        </div>
      </div>

      {/* ROSTER TABLE / LIST */}
      <div className="bg-white dark:bg-[#131d31] rounded-3xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#ff7a00]" />
            <span className="text-xs font-extrabold text-slate-900 dark:text-white uppercase tracking-wider">
              Daftar Roster ({filteredRoster.length})
            </span>
          </div>
          {selectedDate && (
            <span className="text-xs text-slate-500 font-mono font-bold">
              Tanggal: {selectedDate}
            </span>
          )}
        </div>

        {filteredRoster.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs">
            Tidak ada jadwal roster yang sesuai dengan filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 font-black uppercase text-[10px] tracking-wider">
                  <th className="py-3.5 px-4">Tanggal</th>
                  <th className="py-3.5 px-4">Staf & NIK</th>
                  <th className="py-3.5 px-4">Divisi</th>
                  <th className="py-3.5 px-4">Shift Kerja</th>
                  <th className="py-3.5 px-4">Jam Masuk - Pulang</th>
                  <th className="py-3.5 px-4">Keterangan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredRoster.map((r) => {
                  const emp = empMap[r.nik];
                  const isLibur = r.shift.toLowerCase().includes('libur');

                  return (
                    <tr
                      key={r.id || `${r.nik}-${r.tanggal}`}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 font-mono font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {r.tanggal}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-extrabold text-slate-900 dark:text-white">
                          {emp?.nama || r.nik}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400">{r.nik}</div>
                      </td>
                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        {emp?.divisi || 'Warehouse'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                            isLibur
                              ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900'
                              : r.shift === 'Shift 1'
                              ? 'bg-blue-100 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-900'
                              : r.shift === 'Shift 2'
                              ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900'
                              : 'bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-900'
                          }`}
                        >
                          {r.shift}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {isLibur ? '-' : `${r.jam_masuk || '08:00'} - ${r.jam_pulang || '17:00'}`}
                      </td>
                      <td className="py-3 px-4 text-slate-500 italic max-w-xs truncate">
                        {r.keterangan || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
