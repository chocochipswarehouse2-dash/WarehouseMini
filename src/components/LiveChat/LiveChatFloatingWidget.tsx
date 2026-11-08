import React, { useState, useEffect, useRef } from 'react';
import { MessageSquare, X, Maximize2, ArrowRight, Volume2 } from 'lucide-react';
import { UserSession, ActivePage, ProductItem } from '../../types';
import {
  liveChatManager,
  ChatRoom,
  ChatMessage,
  ChatPresenceUser
} from '../../services/liveChatService';
import { canAccessLiveChat } from '../../services/permissions';
import { LiveChatWorkspace } from './LiveChatWorkspace';

interface LiveChatFloatingWidgetProps {
  session: UserSession;
  activePage: ActivePage;
  onSelectPage: (page: ActivePage) => void;
  productCatalog?: ProductItem[];
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
  allSkus?: string[];
  onQuickSearchContext?: (tagLabel: string) => void;
}

export const LiveChatFloatingWidget: React.FC<LiveChatFloatingWidgetProps> = ({
  session,
  activePage,
  onSelectPage,
  productCatalog = [],
  onNotify,
  allSkus = [],
  onQuickSearchContext
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [, setRooms] = useState<ChatRoom[]>(() => liveChatManager.getVisibleRooms());
  const [onlineUsers, setOnlineUsers] = useState<ChatPresenceUser[]>(() => liveChatManager.getOnlineUsers());
  const [toastMsg, setToastMsg] = useState<{ room: ChatRoom; message: ChatMessage } | null>(null);

  const [fabPos, setFabPos] = useState<{ right: number; bottom: number }>(() => {
    if (typeof window === 'undefined') return { right: 16, bottom: 20 };
    try {
      const saved = localStorage.getItem('wms_live_chat_fab_pos_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (typeof parsed?.right === 'number' && typeof parsed?.bottom === 'number') {
          return {
            right: Math.max(8, Math.min(window.innerWidth - 68, parsed.right)),
            bottom: Math.max(8, Math.min(window.innerHeight - 68, parsed.bottom)),
          };
        }
      }
    } catch {}
    return { right: 16, bottom: 20 };
  });

  const dragRef = useRef<{
    isDragging: boolean;
    hasMoved: boolean;
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
  }>({
    isDragging: false,
    hasMoved: false,
    startX: 0,
    startY: 0,
    startRight: 16,
    startBottom: 20,
  });

  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  const selectedRoomIdRef = useRef(selectedRoomId);
  selectedRoomIdRef.current = selectedRoomId;

  const hasAccess = canAccessLiveChat(session);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setFabPos((prev) => ({
        right: Math.max(8, Math.min(window.innerWidth - 68, prev.right)),
        bottom: Math.max(8, Math.min(window.innerHeight - 68, prev.bottom)),
      }));
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const setFloatingDrawerOpen = (open: boolean) => {
    isOpenRef.current = open;
    setIsOpen(open);
    liveChatManager.setFloatingOpen(open);
  };

  useEffect(() => {
    if (!hasAccess) return;
    const unsubState = liveChatManager.subscribe((state) => {
      setRooms([...liveChatManager.getVisibleRooms()]);
      setOnlineUsers([...liveChatManager.getOnlineUsers()]);
      if (typeof state.isFloatingOpen === 'boolean' && state.isFloatingOpen !== isOpenRef.current) {
        isOpenRef.current = state.isFloatingOpen;
        setIsOpen(state.isFloatingOpen);
      }
      if (state.activeRoomId !== selectedRoomIdRef.current) {
        selectedRoomIdRef.current = state.activeRoomId;
        setSelectedRoomId(state.activeRoomId);
      }
      setToastMsg((prev) =>
        prev && !state.rooms.some((r) => r.id === prev.room.id) ? null : prev
      );
    });

    const unsubIncoming = liveChatManager.subscribeIncomingMessage((room, message) => {
      // Only show toast if drawer isn't currently viewing that exact room or user is not on full live_chat page
      if (activePage === 'live_chat') return;
      if (isOpenRef.current && selectedRoomIdRef.current === room.id) return;
      setToastMsg({ room, message });
    });

    // Listen to custom event from SW notification click to open room directly
    const handleOpenRoomEvent = (e: Event) => {
      const custom = e as CustomEvent<{ roomId?: string; openFullPage?: boolean }>;
      const targetRoomId = custom.detail?.roomId;
      if (targetRoomId) {
        setToastMsg(null);
        selectedRoomIdRef.current = targetRoomId;
        setSelectedRoomId(targetRoomId);
        void liveChatManager.selectRoom(targetRoomId);
        if (custom.detail?.openFullPage) {
          setFloatingDrawerOpen(false);
          onSelectPage('live_chat');
        } else {
          setFloatingDrawerOpen(true);
        }
      }
    };
    window.addEventListener('wms_open_live_chat_room', handleOpenRoomEvent as EventListener);

    return () => {
      unsubState();
      unsubIncoming();
      window.removeEventListener('wms_open_live_chat_room', handleOpenRoomEvent as EventListener);
    };
  }, [hasAccess, activePage, onSelectPage]);

  useEffect(() => {
    if (!toastMsg) return;
    const timer = setTimeout(() => {
      setToastMsg(null);
    }, 6500);
    return () => clearTimeout(timer);
  }, [toastMsg]);

  // Hide floating widget when user is already on the full-page Live Chat screen
  if (!hasAccess || activePage === 'live_chat') {
    return null;
  }

  const totalUnread = liveChatManager.getTotalUnreadCount();
  const otherOnlineCount = onlineUsers.filter(
    u => u.username.toLowerCase() !== session.username.toLowerCase()
  ).length;

  // Bubble Live Chat HANYA muncul ketika ada pesan baru masuk / belum dibaca
  const shouldShowBubble = !isOpen && (totalUnread > 0 || Boolean(toastMsg));

  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    dragRef.current = {
      isDragging: true,
      hasMoved: false,
      startX: e.clientX,
      startY: e.clientY,
      startRight: fabPos.right,
      startBottom: fabPos.bottom,
    };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) {
      dragRef.current.hasMoved = true;
    }
    if (!dragRef.current.hasMoved) return;

    const maxRight = Math.max(16, (typeof window !== 'undefined' ? window.innerWidth : 400) - 64);
    const maxBottom = Math.max(16, (typeof window !== 'undefined' ? window.innerHeight : 700) - 64);

    const nextRight = Math.max(8, Math.min(maxRight, dragRef.current.startRight - dx));
    const nextBottom = Math.max(8, Math.min(maxBottom, dragRef.current.startBottom - dy));

    setFabPos({ right: nextRight, bottom: nextBottom });
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.isDragging) return;
    dragRef.current.isDragging = false;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    if (dragRef.current.hasMoved) {
      try {
        localStorage.setItem('wms_live_chat_fab_pos_v1', JSON.stringify(fabPos));
      } catch {}
    }
  };

  const handleBubbleClick = () => {
    if (dragRef.current.hasMoved) {
      dragRef.current.hasMoved = false;
      return;
    }
    if (toastMsg?.room?.id) {
      const rid = toastMsg.room.id;
      setToastMsg(null);
      selectedRoomIdRef.current = rid;
      setSelectedRoomId(rid);
      void liveChatManager.selectRoom(rid);
    } else {
      const myUname = String(session?.username || '').trim().toLowerCase();
      const unreadRoom = liveChatManager
        .getVisibleRooms()
        .find(
          (r) =>
            (r.unread_counts?.[myUname] || 0) > 0 ||
            (Array.isArray(r.unread_by) && r.unread_by.includes(myUname))
        );
      if (unreadRoom?.id) {
        selectedRoomIdRef.current = unreadRoom.id;
        setSelectedRoomId(unreadRoom.id);
        void liveChatManager.selectRoom(unreadRoom.id);
      }
    }
    setFloatingDrawerOpen(true);
  };

  return (
    <>
      {/* Incoming Message Pop-Up Toast */}
      {toastMsg && !isOpen && (
        <div
          onClick={() => {
            const rid = toastMsg.room.id;
            setToastMsg(null);
            selectedRoomIdRef.current = rid;
            setSelectedRoomId(rid);
            setFloatingDrawerOpen(true);
            void liveChatManager.selectRoom(rid);
          }}
          style={{
            bottom: `${Math.min((typeof window !== 'undefined' ? window.innerHeight : 700) - 140, fabPos.bottom + 64)}px`,
            right: `${Math.max(12, Math.min((typeof window !== 'undefined' ? window.innerWidth : 400) - 300, fabPos.right))}px`,
          }}
          className="fixed z-[85] max-w-sm w-[calc(100vw-1.5rem)] sm:w-80 bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-indigo-500/40 p-3.5 animate-in slide-in-from-bottom-4 duration-200 print:hidden cursor-pointer"
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0 font-bold text-xs shadow-inner">
                {toastMsg.message.sender_name.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-200 flex items-center gap-1">
                    <Volume2 className="w-2.5 h-2.5" /> Pesan Baru
                  </span>
                  {toastMsg.room.type === 'group' && (
                    <span className="text-[10px] text-slate-300 truncate font-medium">
                      • {toastMsg.room.name}
                    </span>
                  )}
                </div>
                <p className="text-xs font-bold text-white truncate mt-0.5">
                  {toastMsg.message.sender_name}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setToastMsg(null);
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-xs text-slate-200 line-clamp-2 mt-2 pl-11">
            {toastMsg.message.text || (toastMsg.message.attachment_url ? '📷 Mengirim lampiran foto' : 'Pesan baru')}
          </p>

          <div className="mt-2.5 pl-11 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const rid = toastMsg.room.id;
                setToastMsg(null);
                selectedRoomIdRef.current = rid;
                setSelectedRoomId(rid);
                setFloatingDrawerOpen(true);
                void liveChatManager.selectRoom(rid);
              }}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
            >
              Balas Cepat <ArrowRight className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const rid = toastMsg.room.id;
                setToastMsg(null);
                selectedRoomIdRef.current = rid;
                setSelectedRoomId(rid);
                void liveChatManager.selectRoom(rid);
                onSelectPage('live_chat');
              }}
              className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-medium flex items-center gap-1 transition-colors border border-slate-700"
              title="Buka Layar Penuh"
            >
              <Maximize2 className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Floating Drawer Panel */}
      {isOpen && (
        <div className="fixed bottom-3 right-3 left-3 sm:left-auto sm:bottom-4 sm:right-6 z-[90] sm:w-[430px] md:w-[460px] h-[calc(100dvh-1.5rem)] max-h-[560px] sm:h-[580px] sm:max-h-[calc(100vh-2rem)] flex flex-col shadow-2xl rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in zoom-in-95 duration-150 print:hidden">
          <LiveChatWorkspace
            session={session}
            productCatalog={productCatalog}
            onNotify={onNotify}
            mode="floating"
            initialRoomId={selectedRoomId}
            onCloseFloating={() => setFloatingDrawerOpen(false)}
            onExpandToFullPage={() => {
              setFloatingDrawerOpen(false);
              onSelectPage('live_chat');
            }}
            allSkus={allSkus}
            onQuickSearchContext={onQuickSearchContext}
          />
        </div>
      )}

      {/* Draggable Floating Bubble - ONLY shown when there are unread messages or a new message toast */}
      {shouldShowBubble && (
        <div
          style={{
            right: `${fabPos.right}px`,
            bottom: `${fabPos.bottom}px`,
          }}
          className="fixed z-40 flex items-center gap-2 print:hidden select-none touch-none"
        >
          <button
            type="button"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrCancel}
            onPointerCancel={handlePointerUpOrCancel}
            onClick={handleBubbleClick}
            className="group relative flex items-center justify-center gap-2.5 p-3.5 sm:px-3.5 sm:py-2.5 rounded-full sm:rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white shadow-lg shadow-indigo-600/35 border border-indigo-400/40 transition-transform cursor-grab active:cursor-grabbing touch-none select-none"
            title="Pesan Baru Masuk — Ketuk untuk buka, tahan & geser untuk memindahkan posisi tombol"
          >
            <div className="relative flex items-center justify-center pointer-events-none">
              <MessageSquare className="w-6 h-6 sm:w-5 sm:h-5" />
              {otherOnlineCount > 0 && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-indigo-600" />
              )}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight pointer-events-none">
              <span className="text-xs font-bold tracking-tight">Pesan Baru</span>
              <span className="text-[10px] text-indigo-200 font-medium">
                {totalUnread > 0 ? `${totalUnread} belum dibaca` : 'Ketuk untuk baca'}
              </span>
            </div>

            {totalUnread > 0 && (
              <span className="pointer-events-none absolute -top-1.5 -right-1.5 sm:static sm:ml-0.5 min-w-[20px] h-5 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-extrabold shadow-sm flex items-center justify-center animate-bounce ring-2 ring-white dark:ring-slate-900 sm:ring-0">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
        </div>
      )}
    </>
  );
};
