import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell,
  CheckCheck,
  Trash2,
  X,
  ShoppingBag,
  ClipboardList,
  RotateCcw,
  Factory,
  CalendarClock,
  MessageSquare,
  Boxes,
  ArrowRight,
  Check,
  Inbox,
} from 'lucide-react';
import {
  WmsNotificationHubItem,
  WmsNotificationTarget,
  WmsNotifCategory,
  getNotificationHubItems,
  getUnreadNotificationCount,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotificationItem,
  clearAllNotifications,
  subscribeNotificationHub,
} from '../../services/notificationHubService';

interface NotificationHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigateTarget: (target: WmsNotificationTarget) => void;
  username?: string;
}

function formatRelativeTime(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 45) return 'Baru saja';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} jam lalu`;
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getCategoryMeta(cat: WmsNotifCategory): {
  label: string;
  icon: React.ElementType;
  badgeClass: string;
  iconBgClass: string;
} {
  switch (cat) {
    case 'pesanan':
      return {
        label: 'Pesanan Store',
        icon: ShoppingBag,
        badgeClass: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800',
        iconBgClass: 'bg-indigo-600 text-white',
      };
    case 'picking':
      return {
        label: 'Tugas Picking',
        icon: ClipboardList,
        badgeClass: 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border-amber-200 dark:border-amber-800',
        iconBgClass: 'bg-amber-500 text-white',
      };
    case 'sps':
      return {
        label: 'Peminjaman SPS',
        icon: Boxes,
        badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
        iconBgClass: 'bg-emerald-600 text-white',
      };
    case 'retur':
      return {
        label: 'Pusat Resolusi',
        icon: RotateCcw,
        badgeClass: 'bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-300 border-rose-200 dark:border-rose-800',
        iconBgClass: 'bg-rose-600 text-white',
      };
    case 'produksi':
      return {
        label: 'Produksi & Audit',
        icon: Factory,
        badgeClass: 'bg-purple-100 text-purple-700 dark:bg-purple-950/80 dark:text-purple-300 border-purple-200 dark:border-purple-800',
        iconBgClass: 'bg-purple-600 text-white',
      };
    case 'hr':
      return {
        label: 'HR / Ijin & Cuti',
        icon: CalendarClock,
        badgeClass: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/80 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800',
        iconBgClass: 'bg-cyan-600 text-white',
      };
    case 'chat':
      return {
        label: 'Live Chat',
        icon: MessageSquare,
        badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-950/80 dark:text-blue-300 border-blue-200 dark:border-blue-800',
        iconBgClass: 'bg-blue-600 text-white',
      };
    case 'so':
      return {
        label: 'Stock Opname',
        icon: Boxes,
        badgeClass: 'bg-teal-100 text-teal-700 dark:bg-teal-950/80 dark:text-teal-300 border-teal-200 dark:border-teal-800',
        iconBgClass: 'bg-teal-600 text-white',
      };
    default:
      return {
        label: 'Sistem WMS',
        icon: Bell,
        badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border-slate-200 dark:border-slate-700',
        iconBgClass: 'bg-slate-600 text-white',
      };
  }
}

export const NotificationHubButton: React.FC<{
  onClick: () => void;
  username?: string;
  compact?: boolean;
}> = ({ onClick, username, compact = false }) => {
  const [unreadCount, setUnreadCount] = useState<number>(() => getUnreadNotificationCount(username));

  useEffect(() => {
    const sync = () => setUnreadCount(getUnreadNotificationCount(username));
    sync();
    return subscribeNotificationHub(sync);
  }, [username]);

  return (
    <button
      type="button"
      onClick={onClick}
      title="Buka Notification Hub (Riwayat Notifikasi & Belum Dibaca)"
      className={`relative flex items-center gap-1.5 rounded-xl border transition-all cursor-pointer active:scale-95 ${
        unreadCount > 0
          ? 'bg-indigo-50/90 dark:bg-indigo-950/50 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60'
          : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
      } ${compact ? 'p-2' : 'px-2.5 py-1.5 text-xs font-bold'}`}
    >
      <Bell className={`w-4 h-4 ${unreadCount > 0 ? 'text-indigo-600 dark:text-indigo-400 animate-bounce' : ''}`} />
      {!compact && <span className="hidden xl:inline">Notifikasi</span>}
      {unreadCount > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center shadow-xs">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );
};

export const NotificationHubModal: React.FC<NotificationHubModalProps> = ({
  isOpen,
  onClose,
  onNavigateTarget,
  username,
}) => {
  const [items, setItems] = useState<WmsNotificationHubItem[]>([]);
  const [filterTab, setFilterTab] = useState<'unread' | 'all'>('unread');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    const sync = () => {
      const list = getNotificationHubItems(username);
      setItems(list);
    };
    if (isOpen) {
      sync();
      // Jika tidak ada yang unread saat dibuka pertama kali, otomatis tampilkan tab 'all'
      const currentUnread = getUnreadNotificationCount(username);
      if (currentUnread === 0) {
        setFilterTab('all');
      } else {
        setFilterTab('unread');
      }
    }
    return subscribeNotificationHub(sync);
  }, [isOpen, username]);

  const unreadCount = useMemo(() => items.filter((i) => !i.read).length, [items]);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      if (filterTab === 'unread' && item.read) return false;
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      return true;
    });
  }, [items, filterTab, selectedCategory]);

  if (!isOpen) return null;

  const handleClickItem = (item: WmsNotificationHubItem) => {
    markNotificationAsRead(item.id);
    onClose();
    if (item.target && (item.target.page || item.target.roomId || item.target.orderId)) {
      onNavigateTarget(item.target);
    }
  };

  return (
    <div className="fixed inset-0 z-[10050] flex justify-end bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      {/* Backdrop click to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Slide-over Hub Drawer */}
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl border-l border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-4 py-3.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Bell className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-sm sm:text-base font-black text-slate-900 dark:text-white truncate">
                  Notification Hub
                </h2>
                {unreadCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-black">
                    {unreadCount} Baru
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Popup menutup otomatis 10 dtk • Cek kembali di sini
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            title="Tutup Notification Hub"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Tabs (Belum Dibaca vs Semua) + Mark All as Read */}
        <div className="px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setFilterTab('unread')}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterTab === 'unread'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Belum Dibaca</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  unreadCount > 0
                    ? 'bg-rose-600 text-white'
                    : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {unreadCount}
              </span>
            </button>
            <button
              type="button"
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold transition-all cursor-pointer flex items-center gap-1.5 ${
                filterTab === 'all'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Semua</span>
              <span className="px-1.5 py-0.2 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] font-mono">
                {items.length}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllNotificationsAsRead()}
                className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-extrabold flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
                title="Tandai semua notifikasi sebagai sudah dibaca"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark All Read</span>
              </button>
            )}
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => clearAllNotifications()}
                className="p-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-rose-600 hover:border-rose-300 transition-colors cursor-pointer"
                title="Bersihkan seluruh riwayat notifikasi"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Category Sub-Filter Pills (Horizontal Swipe) */}
        <div className="px-4 py-2 bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto no-scrollbar whitespace-nowrap shrink-0">
          {[
            { id: 'all', label: 'Semua Kategori' },
            { id: 'pesanan', label: '🛍️ Pesanan' },
            { id: 'picking', label: '📋 Picking' },
            { id: 'sps', label: '📦 SPS' },
            { id: 'retur', label: '🔄 Retur' },
            { id: 'produksi', label: '🏭 Produksi' },
            { id: 'hr', label: '🌴 HR/Ijin' },
            { id: 'chat', label: '💬 Chat' },
          ].map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Notification List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
          {filteredItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
                <Inbox className="w-7 h-7" />
              </div>
              <p className="text-sm font-extrabold text-slate-800 dark:text-slate-200 mb-1">
                {filterTab === 'unread'
                  ? 'Tidak ada notifikasi yang belum dibaca'
                  : 'Belum ada riwayat notifikasi'}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                {filterTab === 'unread' && items.length > 0
                  ? 'Semua notifikasi Anda telah ditandai sudah dibaca. Klik tab "Semua" untuk melihat riwayat sebelumnya.'
                  : 'Notifikasi pesanan, picking, SPS, retur, hitung ulang, dan chat yang relevan dengan akun Anda akan tersimpan otomatis di sini.'}
              </p>
              {filterTab === 'unread' && items.length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilterTab('all')}
                  className="mt-4 px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:border-indigo-400 cursor-pointer"
                >
                  Lihat Semua Riwayat ({items.length})
                </button>
              )}
            </div>
          ) : (
            filteredItems.map((item) => {
              const meta = getCategoryMeta(item.category);
              const Icon = meta.icon;
              const isActionable = Boolean(
                item.target && (item.target.page || item.target.roomId || item.target.orderId)
              );

              return (
                <div
                  key={item.id}
                  onClick={() => handleClickItem(item)}
                  className={`p-3.5 transition-colors relative group ${
                    isActionable ? 'cursor-pointer' : ''
                  } ${
                    !item.read
                      ? 'bg-indigo-50/50 dark:bg-indigo-950/25 hover:bg-indigo-50/90 dark:hover:bg-indigo-950/40'
                      : 'bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {/* Category Icon */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 shadow-2xs mt-0.5 ${meta.iconBgClass}`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Content */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5 min-w-0">
                          {!item.read && (
                            <span
                              className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 shrink-0"
                              title="Belum dibaca"
                            />
                          )}
                          <span
                            className={`px-1.5 py-0.2 rounded text-[10px] font-bold border ${meta.badgeClass}`}
                          >
                            {meta.label}
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500 shrink-0">
                          {formatRelativeTime(item.timestamp)}
                        </span>
                      </div>

                      <h4
                        className={`text-xs leading-snug mb-1 ${
                          !item.read
                            ? 'font-black text-slate-900 dark:text-white'
                            : 'font-bold text-slate-700 dark:text-slate-300'
                        }`}
                      >
                        {item.title}
                      </h4>

                      {item.body && (
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
                          {item.body}
                        </p>
                      )}

                      <div className="mt-2 flex items-center justify-between gap-2">
                        {isActionable ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400 group-hover:underline">
                            <span>Buka Halaman Tujuan</span>
                            <ArrowRight className="w-3 h-3" />
                          </span>
                        ) : (
                          <span />
                        )}

                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {!item.read && (
                            <button
                              type="button"
                              onClick={() => markNotificationAsRead(item.id)}
                              className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 hover:border-indigo-300 flex items-center gap-1 cursor-pointer"
                              title="Tandai sudah dibaca"
                            >
                              <Check className="w-3 h-3" />
                              <span>Tandai Dibaca</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => deleteNotificationItem(item.id)}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                            title="Hapus notifikasi ini"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
