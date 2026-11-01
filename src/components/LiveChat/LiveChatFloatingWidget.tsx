import React, { useState, useEffect } from 'react';
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

  const hasAccess = canAccessLiveChat(session);

  useEffect(() => {
    liveChatManager.setFloatingOpen(isOpen);
  }, [isOpen]);

  useEffect(() => {
    if (!hasAccess) return;
    const unsubState = liveChatManager.subscribe(() => {
      setRooms([...liveChatManager.getVisibleRooms()]);
      setOnlineUsers([...liveChatManager.getOnlineUsers()]);
    });

    const unsubIncoming = liveChatManager.subscribeIncomingMessage((room, message) => {
      // Only show toast if drawer isn't currently viewing that exact room or user is not on full live_chat page
      if (activePage === 'live_chat') return;
      if (isOpen && selectedRoomId === room.id) return;
      setToastMsg({ room, message });
    });

    // Listen to custom event from SW notification click to open room directly
    const handleOpenRoomEvent = (e: Event) => {
      const custom = e as CustomEvent<{ roomId?: string; openFullPage?: boolean }>;
      const targetRoomId = custom.detail?.roomId;
      if (targetRoomId) {
        setSelectedRoomId(targetRoomId);
        void liveChatManager.selectRoom(targetRoomId);
        if (custom.detail?.openFullPage) {
          onSelectPage('live_chat');
        } else {
          setIsOpen(true);
        }
      }
    };
    window.addEventListener('wms_open_live_chat_room', handleOpenRoomEvent as EventListener);

    return () => {
      unsubState();
      unsubIncoming();
      window.removeEventListener('wms_open_live_chat_room', handleOpenRoomEvent as EventListener);
    };
  }, [hasAccess, activePage, isOpen, selectedRoomId, onSelectPage]);

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

  return (
    <>
      {/* Incoming Message Pop-Up Toast */}
      {toastMsg && !isOpen && (
        <div className="fixed bottom-36 right-4 sm:right-6 lg:bottom-20 z-[85] max-w-sm w-[calc(100vw-2rem)] bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white rounded-2xl shadow-2xl border border-indigo-500/40 p-3.5 animate-in slide-in-from-bottom-4 duration-200 print:hidden">
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
              onClick={() => setToastMsg(null)}
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
              onClick={() => {
                const rid = toastMsg.room.id;
                setToastMsg(null);
                setSelectedRoomId(rid);
                void liveChatManager.selectRoom(rid);
                setIsOpen(true);
              }}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold flex items-center gap-1 transition-colors"
            >
              Balas Cepat <ArrowRight className="w-3 h-3" />
            </button>
            <button
              onClick={() => {
                const rid = toastMsg.room.id;
                setToastMsg(null);
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
            onCloseFloating={() => setIsOpen(false)}
            onExpandToFullPage={() => {
              setIsOpen(false);
              onSelectPage('live_chat');
            }}
            allSkus={allSkus}
            onQuickSearchContext={onQuickSearchContext}
          />
        </div>
      )}

      {/* Floating Action Button (FAB) - Positioned above Mobile Nav Button on <1024px, bottom-right on Desktop lg: */}
      {!isOpen && (
        <div className="fixed bottom-[5.25rem] right-5 sm:bottom-24 sm:right-6 lg:bottom-5 lg:right-6 z-40 flex items-center gap-2 print:hidden">
          <button
            onClick={() => setIsOpen(true)}
            className="group relative flex items-center justify-center gap-2.5 p-3.5 sm:px-3.5 sm:py-2.5 rounded-full sm:rounded-2xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white shadow-lg shadow-indigo-600/30 border border-indigo-400/30 transition-all cursor-pointer"
            title="Buka Live Chat & Diskusi Tim"
          >
            <div className="relative flex items-center justify-center">
              <MessageSquare className="w-6 h-6 sm:w-5 sm:h-5" />
              {otherOnlineCount > 0 && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-indigo-600" />
              )}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-xs font-bold tracking-tight">Live Chat</span>
              <span className="text-[10px] text-indigo-200 font-medium">
                {otherOnlineCount > 0 ? `${otherOnlineCount} rekan online` : 'Diskusi Tim'}
              </span>
            </div>

            {totalUnread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 sm:static sm:ml-0.5 min-w-[20px] h-5 px-1.5 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-extrabold shadow-sm flex items-center justify-center animate-bounce ring-2 ring-white dark:ring-slate-900 sm:ring-0">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
        </div>
      )}
    </>
  );
};
