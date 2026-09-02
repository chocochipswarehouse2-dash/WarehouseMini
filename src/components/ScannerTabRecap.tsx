import React, { useState, useEffect } from 'react';
import { fetchRecentLogs, fetchStockOpnameQueue } from '../services/supabase';
import { LogProdukItem, StockOpnameQueueItem } from '../types';
import { Clock, User, Package, FileText, ChevronDown, ChevronUp, MapPin } from 'lucide-react';
import { format } from 'date-fns';
import { id } from 'date-fns/locale';

interface RecapInvoiceGroup {
  invoice: string;
  timestamp: string;
  operator: string;
  totalItems: number;
  type: 'MUTASI' | 'STOCK_OPNAME';
  items: Array<{
    sku: string;
    nama_produk: string;
    qty: number;
    lokasi: string;
  }>;
}

export function ScannerTabRecap() {
  const [isLoading, setIsLoading] = useState(true);
  const [groups, setGroups] = useState<RecapInvoiceGroup[]>([]);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [mutasiLogs, soQueue] = await Promise.all([
        fetchRecentLogs(1000), // Get last 1000 mutasi logs
        fetchStockOpnameQueue(1000) // Get last 1000 SO items
      ]);

      const groupMap = new Map<string, RecapInvoiceGroup>();

      // Process Mutasi Logs
      mutasiLogs.forEach(log => {
        if (!log.invoice) return;
        if (!groupMap.has(log.invoice)) {
          groupMap.set(log.invoice, {
            invoice: log.invoice,
            timestamp: log.created_at,
            operator: log.operator || 'Unknown',
            totalItems: 0,
            type: 'MUTASI',
            items: []
          });
        }
        const group = groupMap.get(log.invoice)!;
        group.totalItems += Math.abs(log.qty);
        group.items.push({
          sku: log.sku,
          nama_produk: log.nama_produk,
          qty: Math.abs(log.qty),
          lokasi: log.lokasi
        });
      });

      // Process Stock Opname
      soQueue.forEach(so => {
        if (!so.invoice) return;
        if (!groupMap.has(so.invoice)) {
          groupMap.set(so.invoice, {
            invoice: so.invoice,
            timestamp: so.created_at || so.tanggal,
            operator: so.operator || 'Unknown',
            totalItems: 0,
            type: 'STOCK_OPNAME',
            items: []
          });
        }
        const group = groupMap.get(so.invoice)!;
        // In SO, the scanned quantity is qty_fisik
        group.totalItems += Math.abs(so.qty_fisik);
        group.items.push({
          sku: so.sku,
          nama_produk: so.nama_produk,
          qty: Math.abs(so.qty_fisik),
          lokasi: so.lokasi
        });
      });

      // Sort by timestamp descending
      const sortedGroups = Array.from(groupMap.values()).sort((a, b) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });

      setGroups(sortedGroups);
    } catch (err) {
      console.error('Error loading scan recap:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const toggleExpand = (invoice: string) => {
    setExpandedInvoice(prev => prev === invoice ? null : invoice);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mb-4"></div>
        <p>Memuat rekap scan...</p>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 bg-white dark:bg-[#09090B] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm mt-4">
        <FileText size={48} className="text-slate-300 mb-4" />
        <p>Belum ada data scan yang tersimpan.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 mt-4 pb-16">
      {groups.map((group) => {
        const isExpanded = expandedInvoice === group.invoice;
        
        return (
          <div 
            key={group.invoice} 
            className={`bg-white dark:bg-[#09090B] rounded-xl border ${isExpanded ? 'border-indigo-300 dark:border-indigo-700 ring-1 ring-indigo-200 dark:ring-indigo-900/50' : 'border-slate-200 dark:border-slate-800'} shadow-sm overflow-hidden transition-all duration-200`}
          >
            {/* Header / Summary Card */}
            <div 
              className="p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between"
              onClick={() => toggleExpand(group.invoice)}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2 rounded-lg ${group.type === 'STOCK_OPNAME' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30'}`}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    {group.invoice}
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${group.type === 'STOCK_OPNAME' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                      {group.type === 'STOCK_OPNAME' ? 'SO' : 'Mutasi'}
                    </span>
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Clock size={12} />
                      {group.timestamp ? format(new Date(group.timestamp), 'dd MMM yyyy, HH:mm', { locale: id }) : '-'}
                    </span>
                    <span className="flex items-center gap-1">
                      <User size={12} />
                      {group.operator}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-lg">
                  <Package size={14} className="text-slate-600 dark:text-slate-400" />
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    {group.totalItems} <span className="text-xs font-normal text-slate-500">pcs</span>
                  </span>
                </div>
                
                <div className="text-slate-400">
                  {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
                </div>
              </div>
            </div>

            {/* Detailed Items Popup/Bubble View */}
            {isExpanded && (
              <div className="bg-slate-50 dark:bg-[#111115] border-t border-slate-100 dark:border-slate-800 p-4">
                <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Detail Barang Scan</h4>
                <div className="space-y-2">
                  {group.items.map((item, idx) => (
                    <div key={`${group.invoice}-${item.sku}-${idx}`} className="flex justify-between items-center bg-white dark:bg-[#1A1A20] p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{item.sku}</span>
                        </div>
                        <p className="text-sm text-slate-500 truncate">{item.nama_produk}</p>
                        <div className="flex items-center gap-1 mt-1 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                          <MapPin size={12} />
                          {item.lokasi || 'Tidak ada lokasi'}
                        </div>
                      </div>
                      <div className="ml-4 text-right shrink-0">
                        <div className="inline-flex items-center justify-center bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 font-bold rounded-lg min-w-[3rem] px-2 py-1 shadow-sm">
                          {item.qty}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
