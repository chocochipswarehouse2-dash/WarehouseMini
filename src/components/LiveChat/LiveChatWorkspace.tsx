import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  MessageSquare,
  Users,
  Plus,
  Send,
  Image as ImageIcon,
  Hash,
  Search,
  Check,
  CheckCheck,
  Edit3,
  Trash2,
  Reply,
  X,
  Maximize2,
  Minimize2,
  Lock,
  UserPlus,
  UserMinus,
  RefreshCw,
  ArrowLeft,
  Clock,
  Ban,
  ShieldCheck,
  Sparkles,
  Tag,
  Package,
  AtSign,
  FileText,
  ExternalLink,
  Crown,
  LogOut,
} from 'lucide-react';
import { ProductItem, UserSession } from '../../types';
import {
  liveChatManager,
  LiveChatState,
  ChatRoom,
  ChatMessage,
  ChatContextTag,
  ChatContextTagType,
  ChatOrderContext,
  ChatReplyQuote,
  ChatParticipantProfile,
  canModifyMessage,
  hasOtherUserReadMessage,
  compressAndUploadChatImage,
} from '../../services/liveChatService';
import { canManageChatGroups } from '../../services/permissions';
import { getUserPersonName } from '../../utils/userResolver';

interface LiveChatWorkspaceProps {
  session: UserSession | null;
  productCatalog?: ProductItem[];
  mode: 'full' | 'floating';
  initialRoomId?: string | null;
  allSkus?: string[];
  onQuickSearchContext?: (tagLabel: string) => void;
  onCloseFloating?: () => void;
  onExpandToFullPage?: () => void;
  onNotify?: (msg: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const LiveChatWorkspace: React.FC<LiveChatWorkspaceProps> = ({
  session,
  productCatalog = [],
  mode,
  initialRoomId,
  onCloseFloating,
  onExpandToFullPage,
  onNotify,
}) => {
  const [chatState, setChatState] = useState<LiveChatState>(() => liveChatManager.getSnapshot());
  const [activeTab, setActiveTab] = useState<'all' | 'groups' | 'online'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [showMessageSearch, setShowMessageSearch] = useState(false);

  // Composer states
  const [inputText, setInputText] = useState('');
  const [replyTo, setReplyTo] = useState<ChatReplyQuote | null>(null);
  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [selectedTags, setSelectedTags] = useState<ChatContextTag[]>([]);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [pendingAttachmentUrl, setPendingAttachmentUrl] = useState<string>('');
  const [isSending, setIsSending] = useState(false);

  // Tag Picker Popover
  const [isTagPickerOpen, setIsTagPickerOpen] = useState(false);
  const [tagType, setTagType] = useState<ChatContextTagType>('SKU');
  const [tagSearchInput, setTagSearchInput] = useState('');

  // Group Creation / Member Management Modal (Admin & Superadmin only)
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [isGroupInfoModalOpen, setIsGroupInfoModalOpen] = useState(false);
  const [groupInfoSearch, setGroupInfoSearch] = useState('');
  const [isRemovingMember, setIsRemovingMember] = useState<string | null>(null);

  // Mention (@) Autocomplete State
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionIndex, setMentionIndex] = useState<number>(-1);

  // Shopee-style Attached Order Context
  const [pendingOrderContext, setPendingOrderContext] = useState<ChatOrderContext | null>(
    liveChatManager.pendingOrderContext
  );

  // Manual Sync Spinner State
  const [isSyncingRooms, setIsSyncingRooms] = useState(false);
  const [groupModalMode, setGroupModalMode] = useState<'create' | 'manage'>('create');
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupTopicInput, setGroupTopicInput] = useState('');
  const [groupThemeInput, setGroupThemeInput] = useState<'indigo' | 'emerald' | 'amber' | 'rose' | 'purple'>('indigo');
  const [selectedMemberUsernames, setSelectedMemberUsernames] = useState<Set<string>>(new Set());
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [isSavingGroup, setIsSavingGroup] = useState(false);

  // Lightbox image preview, Read Receipt Detail Modal & Room Delete Confirmation
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [inspectReadMessage, setInspectReadMessage] = useState<ChatMessage | null>(null);
  const [confirmDeleteRoom, setConfirmDeleteRoom] = useState<ChatRoom | null>(null);
  const [isDeletingRoom, setIsDeletingRoom] = useState(false);

  // Tick every 5 seconds so 5-minute edit/delete countdown badges stay accurate
  const [, setNowTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNowTick((n) => n + 1), 5000);
    return () => clearInterval(timer);
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const myUsername = String(session?.username || '').trim().toLowerCase();
  const isAdminGroupManager = canManageChatGroups(session);

  useEffect(() => {
    const unsub = liveChatManager.subscribe((next) => {
      setChatState(next);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (initialRoomId) {
      void liveChatManager.selectRoom(initialRoomId);
    }
  }, [initialRoomId]);

  useEffect(() => {
    const handleOpenOrder = (e: any) => {
      if (e.detail?.orderData) {
        setPendingOrderContext(e.detail.orderData);
        setInputText((prev) =>
          prev
            ? prev
            : `Halo Tim Gudang, mau konfirmasi mengenai pesanan #${e.detail.orderData.order_id} (${e.detail.orderData.store_name || ''}) ini...`
        );
        setTimeout(() => textareaRef.current?.focus(), 100);
      }
    };
    window.addEventListener('wms:open_order_chat', handleOpenOrder);

    if (liveChatManager.pendingOrderContext) {
      const oc = liveChatManager.pendingOrderContext;
      setPendingOrderContext(oc);
      setInputText((prev) =>
        prev
          ? prev
          : `Halo Tim Gudang, mau konfirmasi mengenai pesanan #${oc.order_id} (${oc.store_name || ''}) ini...`
      );
      setTimeout(() => textareaRef.current?.focus(), 250);
    }

    return () => window.removeEventListener('wms:open_order_chat', handleOpenOrder);
  }, []);

  const activeRoom = useMemo(
    () => chatState.rooms.find((r) => r.id === chatState.activeRoomId) || null,
    [chatState.rooms, chatState.activeRoomId]
  );

  const activeMessages = useMemo(() => {
    if (!activeRoom) return [];
    const list = chatState.messagesByRoom[activeRoom.id] || [];
    if (!messageSearchQuery.trim()) return list;
    const q = messageSearchQuery.trim().toLowerCase();
    return list.filter(
      (m) =>
        m.text?.toLowerCase().includes(q) ||
        m.sender_name?.toLowerCase().includes(q) ||
        m.context_tags?.some((t) => t.code.toLowerCase().includes(q))
    );
  }, [activeRoom, chatState.messagesByRoom, messageSearchQuery]);

  // Auto-scroll to bottom when messages change in active room
  useEffect(() => {
    if (!showMessageSearch) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [activeMessages.length, activeRoom?.id, showMessageSearch]);

  // Helper to resolve display title and online status of a room
  const getRoomDisplayMeta = (room: ChatRoom) => {
    if (room.type === 'group') {
      const onlineInGroup = room.participants.filter((u) => Boolean(chatState.onlineUsers[u.toLowerCase()])).length;
      return {
        title: room.name || 'Ruang Diskusi Grup',
        subtitle: room.topic || `${room.participants.length} anggota · ${onlineInGroup} online`,
        isOnline: onlineInGroup > 0,
        roleBadge: 'GRUP',
        otherUsername: '',
      };
    }

    const otherUname =
      room.participants.find((u) => u.toLowerCase() !== myUsername)?.toLowerCase() || myUsername;
    const profile =
      room.participant_profiles?.[otherUname] ||
      chatState.allUsersDirectory.find((u) => u.username.toLowerCase() === otherUname);
    const onlineInfo = chatState.onlineUsers[otherUname];

    const displayName =
      onlineInfo?.name || profile?.name || getUserPersonName(otherUname) || room.name || otherUname;
    const roleLabel = onlineInfo?.role || profile?.role || 'Tim WMS';
    const storeLabel = onlineInfo?.store_name || profile?.store_name;

    return {
      title: displayName,
      subtitle: storeLabel ? `${roleLabel} · ${storeLabel}` : roleLabel,
      isOnline: Boolean(onlineInfo),
      roleBadge: roleLabel,
      otherUsername: otherUname,
    };
  };

  // Typing users in active room
  const typingUsersInActiveRoom = useMemo(() => {
    if (!activeRoom) return [];
    const list: string[] = [];
    for (const [uname, pres] of Object.entries(chatState.onlineUsers)) {
      if (uname !== myUsername && pres.typing_room_id === activeRoom.id) {
        list.push(pres.name || uname);
      }
    }
    return list;
  }, [activeRoom, chatState.onlineUsers, myUsername]);

  // Filtered rooms list
  const filteredRooms = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return chatState.rooms.filter((r) => {
      if (activeTab === 'groups' && r.type !== 'group') return false;
      if (!q) return true;
      const meta = getRoomDisplayMeta(r);
      return (
        meta.title.toLowerCase().includes(q) ||
        meta.subtitle.toLowerCase().includes(q) ||
        (r.last_message_text || '').toLowerCase().includes(q)
      );
    });
  }, [chatState.rooms, activeTab, searchQuery, chatState.onlineUsers, chatState.allUsersDirectory]);

  // Online & Directory users list
  const sortedDirectoryUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const map = new Map<string, ChatParticipantProfile & { isOnline: boolean; activePage?: string }>();

    for (const u of chatState.allUsersDirectory) {
      const uname = u.username.toLowerCase();
      if (uname === myUsername) continue;
      const online = chatState.onlineUsers[uname];
      map.set(uname, {
        ...u,
        isOnline: Boolean(online),
        activePage: online?.active_page,
      });
    }

    for (const [uname, online] of Object.entries(chatState.onlineUsers)) {
      if (uname === myUsername) continue;
      if (!map.has(uname)) {
        map.set(uname, {
          username: uname,
          name: online.name,
          role: online.role,
          store_name: online.store_name,
          isOnline: true,
          activePage: online.active_page,
        });
      }
    }

    return Array.from(map.values())
      .filter((u) => {
        if (!q) return true;
        return (
          u.name.toLowerCase().includes(q) ||
          u.username.toLowerCase().includes(q) ||
          u.role.toLowerCase().includes(q) ||
          (u.store_name || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return a.name.localeCompare(b.name, 'id');
      });
  }, [chatState.allUsersDirectory, chatState.onlineUsers, searchQuery, myUsername]);

  const onlineOthersCount = useMemo(
    () => sortedDirectoryUsers.filter((u) => u.isOnline).length,
    [sortedDirectoryUsers]
  );

  // Quick SKU suggestions from local productCatalog (0 Egress!)
  const skuSuggestions = useMemo(() => {
    if (tagType !== 'SKU' || !tagSearchInput.trim()) return [];
    const q = tagSearchInput.trim().toUpperCase();
    const seen = new Set<string>();
    const results: Array<{ sku: string; nama: string }> = [];
    for (const p of productCatalog) {
      const sku = String(p.sku || '').trim().toUpperCase();
      if (!sku || seen.has(sku)) continue;
      if (sku.includes(q) || String(p.namaProduk || '').toUpperCase().includes(q)) {
        seen.add(sku);
        results.push({ sku, nama: String(p.namaProduk || '') });
        if (results.length >= 6) break;
      }
    }
    return results;
  }, [productCatalog, tagType, tagSearchInput]);

  // Mention candidates for active room
  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null || !activeRoom) return [];
    const q = mentionQuery.toLowerCase();
    const list: Array<{ username: string; name: string; role: string; isAll?: boolean }> = [];

    if (activeRoom.type === 'group') {
      if ('semua'.includes(q) || 'all'.includes(q) || q === '') {
        list.push({
          username: 'semua',
          name: 'Semua Anggota Grup',
          role: 'Tag All',
          isAll: true,
        });
      }
      for (const uname of activeRoom.participants) {
        const uLower = uname.toLowerCase();
        if (uLower === myUsername) continue;
        const prof =
          activeRoom.participant_profiles?.[uLower] ||
          chatState.allUsersDirectory.find((u) => u.username.toLowerCase() === uLower);
        const name = prof?.name || getUserPersonName(uLower) || uLower;
        if (uLower.includes(q) || name.toLowerCase().includes(q) || q === '') {
          list.push({
            username: uLower,
            name,
            role: prof?.role || 'Operator',
          });
        }
      }
    } else {
      for (const u of chatState.allUsersDirectory) {
        const uLower = u.username.toLowerCase();
        if (uLower === myUsername) continue;
        if (uLower.includes(q) || u.name.toLowerCase().includes(q)) {
          list.push({
            username: uLower,
            name: u.name,
            role: u.role,
          });
        }
      }
    }
    return list.slice(0, 8);
  }, [mentionQuery, activeRoom, myUsername, chatState.allUsersDirectory]);

  const handleSelectMention = (candidate: { username: string }) => {
    if (mentionIndex < 0) return;
    const before = inputText.slice(0, mentionIndex);
    const after = inputText.slice(mentionIndex + (mentionQuery?.length || 0) + 1);
    const newText = `${before}@${candidate.username} ${after}`;
    setInputText(newText);
    setMentionQuery(null);
    setMentionIndex(-1);
    textareaRef.current?.focus();
  };

  const renderMessageTextWithMentions = (text: string, isMine: boolean) => {
    if (!text) return null;
    const tokens = text.split(/(\s+)/);
    return tokens.map((word, wIdx) => {
      if (word.startsWith('@') && word.length > 1) {
        const cleanWord = word.replace(/^[^\w@]+|[^\w]+$/g, '');
        const targetUname = cleanWord.slice(1).toLowerCase();
        const isMe = targetUname === myUsername || targetUname === 'semua' || targetUname === 'all';
        return (
          <span
            key={wIdx}
            className={`inline-flex items-center px-1.5 py-0.5 rounded-md font-semibold text-[11px] mx-0.5 ${
              isMe
                ? 'bg-amber-300 dark:bg-amber-900/80 text-amber-950 dark:text-amber-100 font-bold border border-amber-400 dark:border-amber-700'
                : isMine
                ? 'bg-indigo-700/90 text-white font-bold border border-indigo-400/40'
                : 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
            }`}
          >
            {word}
          </span>
        );
      }
      return <span key={wIdx}>{word}</span>;
    });
  };

  // Handlers
  const handleOpenCreateGroupModal = () => {
    setGroupModalMode('create');
    setGroupNameInput('');
    setGroupTopicInput('');
    setGroupThemeInput('indigo');
    setSelectedMemberUsernames(new Set());
    setMemberSearchQuery('');
    void liveChatManager.refreshUsersDirectory(true);
    setIsGroupModalOpen(true);
  };

  const handleOpenManageGroupModal = () => {
    if (!activeRoom || activeRoom.type !== 'group') return;
    setGroupModalMode('manage');
    setGroupNameInput(activeRoom.name);
    setGroupTopicInput(activeRoom.topic || '');
    setGroupThemeInput(activeRoom.theme_color || 'indigo');
    setSelectedMemberUsernames(
      new Set(activeRoom.participants.map((u) => u.toLowerCase()).filter((u) => u !== myUsername))
    );
    setMemberSearchQuery('');
    void liveChatManager.refreshUsersDirectory(true);
    setIsGroupModalOpen(true);
  };

  const handleSaveGroupModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingGroup) return;
    setIsSavingGroup(true);

    try {
      const members = Array.from(selectedMemberUsernames);
      if (groupModalMode === 'create') {
        const res = await liveChatManager.createGroupRoom({
          name: groupNameInput,
          topic: groupTopicInput,
          theme_color: groupThemeInput,
          participantUsernames: members,
        });
        if (!res.success) {
          onNotify?.(res.error || 'Gagal membuat ruang diskusi', 'error');
        } else {
          onNotify?.(`Ruang diskusi "${groupNameInput}" berhasil dibuat!`, 'success');
          setIsGroupModalOpen(false);
        }
      } else if (activeRoom) {
        const res = await liveChatManager.updateGroupMembers(
          activeRoom.id,
          members,
          groupNameInput,
          groupTopicInput
        );
        if (!res.success) {
          onNotify?.(res.error || 'Gagal memperbarui anggota grup', 'error');
        } else {
          onNotify?.('Anggota & detail Ruang Diskusi berhasil diperbarui!', 'success');
          setIsGroupModalOpen(false);
        }
      }
    } finally {
      setIsSavingGroup(false);
    }
  };

  const handleAddContextTag = (code: string, label?: string) => {
    const cleanCode = String(code || '').trim().toUpperCase();
    if (!cleanCode) return;
    setSelectedTags((prev) => {
      if (prev.some((t) => t.type === tagType && t.code === cleanCode)) return prev;
      return [...prev, { type: tagType, code: cleanCode, label }];
    });
    setTagSearchInput('');
    setIsTagPickerOpen(false);
    textareaRef.current?.focus();
  };

  const handleImageFileSelect = async (file: File) => {
    if (!file || isUploadingImage) return;
    setIsUploadingImage(true);
    try {
      const res = await compressAndUploadChatImage(file, myUsername);
      if (!res.success || !res.url) {
        onNotify?.(res.error || 'Gagal mengunggah gambar ke Google Drive', 'error');
      } else {
        setPendingAttachmentUrl(res.url);
        onNotify?.('Foto berhasil dikompresi & diunggah ke Google Drive CDN (0 Byte Supabase)', 'success');
      }
    } finally {
      setIsUploadingImage(false);
    }
  };

  const handlePasteClipboard = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (blob) {
          await handleImageFileSelect(blob);
        }
        return;
      }
    }
  };

  const handleSendOrSaveEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeRoom || isSending) return;

    // If editing an existing message (within 5-min & unread rule)
    if (editingMessage) {
      const cleanEdit = inputText.trim();
      if (!cleanEdit) return;
      setIsSending(true);
      try {
        const res = await liveChatManager.editMessage(activeRoom.id, editingMessage.id, cleanEdit);
        if (!res.success) {
          onNotify?.(res.error || 'Pesan tidak dapat diedit', 'warning');
        } else {
          setEditingMessage(null);
          setInputText('');
        }
      } finally {
        setIsSending(false);
      }
      return;
    }

    if (!inputText.trim() && !pendingAttachmentUrl && selectedTags.length === 0 && !pendingOrderContext) {
      return;
    }

    setIsSending(true);
    try {
      const res = await liveChatManager.sendMessage({
        roomId: activeRoom.id,
        text: inputText,
        attachmentUrl: pendingAttachmentUrl || undefined,
        contextTags: selectedTags.length > 0 ? selectedTags : undefined,
        orderContext: pendingOrderContext || undefined,
        replyTo: replyTo || undefined,
      });

      if (!res.success) {
        onNotify?.(res.error || 'Gagal mengirim pesan', 'error');
      } else {
        setInputText('');
        setPendingAttachmentUrl('');
        setSelectedTags([]);
        setPendingOrderContext(null);
        setReplyTo(null);
        setMentionQuery(null);
      }
    } finally {
      setIsSending(false);
    }
  };

  const handleStartEditMessage = (msg: ChatMessage) => {
    const check = canModifyMessage(msg, myUsername);
    if (!check.allowed) {
      onNotify?.(check.reason || 'Pesan tidak dapat diedit', 'warning');
      return;
    }
    setEditingMessage(msg);
    setReplyTo(null);
    setInputText(msg.text);
    textareaRef.current?.focus();
  };

  const handleDeleteMessage = async (msg: ChatMessage) => {
    if (!activeRoom) return;
    const check = canModifyMessage(msg, myUsername);
    if (!check.allowed) {
      onNotify?.(check.reason || 'Pesan tidak dapat dihapus', 'warning');
      return;
    }
    const res = await liveChatManager.deleteMessage(activeRoom.id, msg.id);
    if (!res.success) {
      onNotify?.(res.error || 'Gagal menghapus pesan', 'warning');
    } else {
      onNotify?.('Pesan telah ditarik/dihapus.', 'info');
    }
  };

  const formatTimeShort = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDateBadge = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return '';
    }
  };

  const isFloating = mode === 'floating';
  const showMobileDetail = Boolean(activeRoom);

  return (
    <div
      className={
        isFloating
          ? 'flex flex-col w-full h-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 overflow-hidden'
          : 'w-full max-w-full px-3 sm:px-4 lg:px-6 py-3'
      }
    >
      <div
        className={
          isFloating
            ? 'flex-1 flex flex-col min-h-0 overflow-hidden'
            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs overflow-hidden flex flex-col lg:grid lg:grid-cols-12 h-[calc(100vh-110px)] min-h-[540px]'
        }
      >
        {/* LEFT PANE: ROOMS & ONLINE USERS DIRECTORY */}
        <div
          className={`${
            isFloating
              ? showMobileDetail
                ? 'hidden'
                : 'flex-1 flex flex-col min-h-0 h-full overflow-hidden'
              : `${
                  showMobileDetail ? 'hidden lg:flex' : 'flex'
                } lg:col-span-4 xl:col-span-4 flex-col border-r border-slate-200 dark:border-slate-800 min-h-0 h-full overflow-hidden`
          }`}
        >
          {/* Left Header */}
          <div className="p-3 sm:p-3.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 flex items-center justify-between gap-2 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <h2 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  Live Chat & Diskusi
                </h2>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                <span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                  {onlineOthersCount + 1}
                </span>{' '}
                user online aktif · Riwayat permanen
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {isAdminGroupManager && (
                <button
                  type="button"
                  onClick={handleOpenCreateGroupModal}
                  className="px-2.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
                  title="Buat Ruang Diskusi Grup & Tambah Beberapa User (Khusus Admin/Superadmin)"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Buat Grup</span>
                </button>
              )}

              <button
                type="button"
                disabled={isSyncingRooms}
                onClick={async () => {
                  setIsSyncingRooms(true);
                  try {
                    await liveChatManager.syncRoomsFromServer(true);
                    await liveChatManager.refreshUsersDirectory(true);
                    onNotify?.('Daftar percakapan & user berhasil disegarkan.', 'success');
                  } finally {
                    setIsSyncingRooms(false);
                  }
                }}
                className="p-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition-colors cursor-pointer"
                title="Segarkan daftar chat & user online (Sinkronisasi Supabase)"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncingRooms || chatState.isLoadingRooms ? 'animate-spin text-indigo-600' : ''}`} />
              </button>

              {isFloating && onExpandToFullPage && (
                <button
                  type="button"
                  onClick={onExpandToFullPage}
                  className="p-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition-colors cursor-pointer"
                  title="Buka di Halaman Penuh"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              )}

              {isFloating && onCloseFloating && (
                <button
                  type="button"
                  onClick={onCloseFloating}
                  className="p-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-rose-600 transition-colors cursor-pointer"
                  title="Tutup panel chat"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Horizontal Swipe Sub-Navigation Tabs */}
          <div className="px-3 pt-2.5 pb-2 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 rounded-xl overflow-x-auto no-scrollbar whitespace-nowrap">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Semua Chat ({chatState.rooms.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('groups')}
                className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'groups'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Grup Diskusi ({chatState.rooms.filter((r) => r.type === 'group').length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('online')}
                className={`flex-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 ${
                  activeTab === 'online'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span>User ({onlineOthersCount})</span>
              </button>
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  activeTab === 'online'
                    ? 'Cari nama user, role, atau store...'
                    : 'Cari ruang diskusi atau rekan...'
                }
                className="w-full pl-8 pr-7 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Left Scrollable Content */}
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-slate-800/60">
            {activeTab === 'online' ? (
              sortedDirectoryUsers.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
                  Tidak ada user yang cocok dengan pencarian.
                </div>
              ) : (
                sortedDirectoryUsers.map((u) => (
                  <button
                    key={u.username}
                    type="button"
                    onClick={() => {
                      void liveChatManager.openOrCreateDirectRoom(u);
                      setActiveTab('all');
                    }}
                    className="w-full px-3.5 py-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="relative shrink-0">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200 uppercase">
                          {u.name.slice(0, 2)}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                            u.isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                          }`}
                          title={u.isOnline ? 'Sedang Online' : 'Offline'}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {u.name}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          <span>{u.role}</span>
                          {u.store_name ? ` · ${u.store_name}` : ''}
                          {u.isOnline ? ' · Online' : ''}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                      Chat →
                    </span>
                  </button>
                ))
              )
            ) : filteredRooms.length === 0 ? (
              <div className="p-6 text-center space-y-3">
                <div className="w-10 h-10 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-400">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    Belum ada percakapan aktif
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Pilih tab <strong>User</strong> untuk mulai chat 1-on-1
                    {isAdminGroupManager ? ' atau klik "+ Buat Grup" untuk membuka Ruang Diskusi.' : '.'}
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveTab('online')}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-indigo-500 transition-colors cursor-pointer"
                  >
                    Lihat User Online ({onlineOthersCount})
                  </button>
                  {isAdminGroupManager && (
                    <button
                      type="button"
                      onClick={handleOpenCreateGroupModal}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                    >
                      + Buat Grup
                    </button>
                  )}
                </div>
              </div>
            ) : (
              filteredRooms.map((room) => {
                const meta = getRoomDisplayMeta(room);
                const isSelected = activeRoom?.id === room.id;
                const unreadCount =
                  room.unread_counts?.[myUsername] ||
                  (Array.isArray(room.unread_by) && room.unread_by.includes(myUsername) ? 1 : 0);
                const canDeleteThisRoom = room.type === 'direct' || isAdminGroupManager;

                return (
                  <div
                    key={room.id}
                    onClick={() => void liveChatManager.selectRoom(room.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        void liveChatManager.selectRoom(room.id);
                      }
                    }}
                    className={`group w-full px-3.5 py-3 flex items-start justify-between gap-2.5 transition-colors text-left cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/80 dark:bg-indigo-950/40'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0 flex-1">
                      <div className="relative shrink-0 mt-0.5">
                        <div
                          className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold uppercase border ${
                            room.type === 'group'
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-300'
                              : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                          }`}
                        >
                          {room.type === 'group' ? <Users className="w-4 h-4" /> : meta.title.slice(0, 2)}
                        </div>
                        {meta.isOnline && (
                          <span
                            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-slate-900"
                            title="Online"
                          />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {meta.title}
                          </span>
                          {room.last_message_at && (
                            <span className="text-[10px] font-mono tabular-nums text-slate-400 shrink-0">
                              {formatTimeShort(room.last_message_at)}
                            </span>
                          )}
                        </div>

                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {meta.subtitle}
                        </div>

                        {room.last_message_text && (
                          <div
                            className={`text-xs truncate mt-0.5 ${
                              unreadCount > 0
                                ? 'font-semibold text-slate-900 dark:text-white'
                                : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {room.last_message_sender &&
                            room.last_message_sender.toLowerCase() === myUsername
                              ? 'Anda: '
                              : room.type === 'group' && room.last_message_sender_name
                              ? `${room.last_message_sender_name}: `
                              : ''}
                            {room.last_message_text}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 mt-0.5">
                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 min-w-[20px] rounded-full bg-indigo-600 text-white text-[10px] font-mono tabular-nums font-bold text-center shrink-0">
                          {unreadCount}
                        </span>
                      )}

                      {canDeleteThisRoom && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setConfirmDeleteRoom(room);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                          title={
                            room.type === 'group'
                              ? 'Hapus Ruang Diskusi Grup'
                              : `Hapus Chat dengan ${meta.title}`
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* RIGHT PANE: ACTIVE CONVERSATION WORKSPACE */}
        <div
          className={`${
            isFloating
              ? showMobileDetail
                ? 'flex-1 flex flex-col min-h-0'
                : 'hidden'
              : `${
                  showMobileDetail ? 'flex' : 'hidden lg:flex'
                } lg:col-span-8 xl:col-span-8 flex-col min-h-0 h-full bg-slate-50/40 dark:bg-slate-950/40`
          }`}
        >
          {!activeRoom ? (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/60 flex items-center justify-center text-indigo-600 dark:text-indigo-400 mb-3">
                <MessageSquare className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Pilih Percakapan atau User Online
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mt-1">
                Klik nama rekan di daftar sebelah kiri untuk memulai chat langsung, atau buka Ruang Diskusi Grup untuk koordinasi lintas divisi.
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <span>✓✓ Status Baca Akurat</span>
                <span aria-hidden="true">·</span>
                <span>Edit/Hapus &le; 5 Menit (Sebelum Dibaca)</span>
                <span aria-hidden="true">·</span>
                <span>Foto via Google Drive CDN</span>
              </div>
            </div>
          ) : (
            <>
              {/* Active Room Header */}
              {(() => {
                const meta = getRoomDisplayMeta(activeRoom);
                return (
                  <div className="px-3.5 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <button
                        type="button"
                        onClick={() => void liveChatManager.selectRoom(null)}
                        className={`${
                          isFloating ? 'flex' : 'lg:hidden flex'
                        } p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 cursor-pointer shrink-0`}
                        title="Kembali ke daftar chat"
                      >
                        <ArrowLeft className="w-4 h-4" />
                      </button>

                      <div
                        onClick={() => {
                          if (activeRoom.type === 'group') setIsGroupInfoModalOpen(true);
                        }}
                        className={`min-w-0 ${activeRoom.type === 'group' ? 'cursor-pointer group/hdr' : ''}`}
                        title={activeRoom.type === 'group' ? 'Klik untuk melihat Info & Anggota Grup' : undefined}
                      >
                        <div className="flex items-center gap-2">
                          <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate group-hover/hdr:text-indigo-600 transition-colors">
                            {meta.title}
                          </h3>
                          {meta.isOnline && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Online" />
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {typingUsersInActiveRoom.length > 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              {typingUsersInActiveRoom.join(', ')} sedang mengetik...
                            </span>
                          ) : activeRoom.type === 'group' ? (
                            <span>
                              {meta.subtitle} · <span className="text-indigo-600 dark:text-indigo-400 font-semibold">Klik Info</span>
                            </span>
                          ) : (
                            meta.subtitle
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setShowMessageSearch((v) => !v);
                          if (showMessageSearch) setMessageSearchQuery('');
                        }}
                        className={`p-1.5 rounded-xl border text-xs transition-colors cursor-pointer ${
                          showMessageSearch
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                        }`}
                        title="Cari pesan di riwayat ruang ini"
                      >
                        <Search className="w-3.5 h-3.5" />
                      </button>

                      {activeRoom.type === 'group' && (
                        <button
                          type="button"
                          onClick={() => setIsGroupInfoModalOpen(true)}
                          className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-indigo-500 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                          title="Lihat info grup, daftar anggota & kelola obrolan"
                        >
                          <Users className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                          <span className="hidden sm:inline">Info ({activeRoom.participants.length})</span>
                        </button>
                      )}

                      {(activeRoom.type === 'direct' ||
                        isAdminGroupManager ||
                        String(activeRoom.created_by || '').trim().toLowerCase() === myUsername) && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteRoom(activeRoom)}
                          className="p-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:border-rose-300 transition-colors cursor-pointer"
                          title={activeRoom.type === 'group' ? 'Hapus Ruang Diskusi Grup' : 'Hapus Percakapan Ini'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {activeRoom.type === 'group' &&
                        !isAdminGroupManager &&
                        String(activeRoom.created_by || '').trim().toLowerCase() !== myUsername && (
                          <button
                            type="button"
                            onClick={async () => {
                              if (!confirm(`Yakin ingin keluar dari ruang diskusi "${activeRoom.name}"?`)) return;
                              const res = await liveChatManager.leaveGroupRoom(activeRoom.id);
                              if (!res.success) {
                                onNotify?.(res.error || 'Gagal keluar dari grup', 'error');
                              } else {
                                onNotify?.(`Anda telah keluar dari ruang diskusi "${activeRoom.name}".`, 'info');
                                void liveChatManager.selectRoom(null);
                              }
                            }}
                            className="p-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-rose-600 hover:border-rose-300 transition-colors cursor-pointer"
                            title="Keluar dari Ruang Diskusi Grup ini"
                          >
                            <LogOut className="w-3.5 h-3.5 text-rose-500" />
                          </button>
                        )}

                      {isFloating && onExpandToFullPage && (
                        <button
                          type="button"
                          onClick={onExpandToFullPage}
                          className="p-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 cursor-pointer"
                          title="Perbesar ke Halaman Penuh"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {isFloating && onCloseFloating && (
                        <button
                          type="button"
                          onClick={onCloseFloating}
                          className="p-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-rose-600 cursor-pointer"
                          title="Tutup panel chat"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* In-Room Message Search Bar */}
              {showMessageSearch && (
                <div className="px-3.5 py-2 bg-slate-100 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2 shrink-0">
                  <Search className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={messageSearchQuery}
                    onChange={(e) => setMessageSearchQuery(e.target.value)}
                    placeholder="Cari kata kunci, SKU, atau nomor SJ di riwayat pesan..."
                    className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white focus:outline-none"
                    autoFocus
                  />
                  {messageSearchQuery && (
                    <span className="text-[10px] font-mono tabular-nums text-slate-500">
                      {activeMessages.length} hasil
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setMessageSearchQuery('');
                      setShowMessageSearch(false);
                    }}
                    className="text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Messages Stream */}
              <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3">
                {activeMessages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-12">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      {messageSearchQuery
                        ? 'Tidak ada pesan yang cocok dengan kata kunci.'
                        : 'Belum ada pesan di ruang ini. Kirim pesan pertama Anda di bawah!'}
                    </p>
                  </div>
                ) : (
                  activeMessages.map((msg, idx) => {
                    const isMine = msg.sender_username.toLowerCase() === myUsername;
                    const prevMsg = idx > 0 ? activeMessages[idx - 1] : null;
                    const showDateDivider =
                      !prevMsg ||
                      formatDateBadge(prevMsg.created_at) !== formatDateBadge(msg.created_at);

                    const modCheck = isMine
                      ? canModifyMessage(msg, myUsername)
                      : { allowed: false, remainingSeconds: 0, isReadByOthers: false };
                    const isReadByOthers = hasOtherUserReadMessage(msg, msg.sender_username);
                    const otherReaders = (msg.read_by || []).filter(
                      (r) => r.username.toLowerCase() !== msg.sender_username.toLowerCase()
                    );

                    return (
                      <React.Fragment key={msg.id}>
                        {showDateDivider && (
                          <div className="flex items-center justify-center my-2">
                            <span className="px-2.5 py-0.5 rounded-lg bg-slate-200/70 dark:bg-slate-800 text-[10px] font-mono tabular-nums text-slate-600 dark:text-slate-400">
                              {formatDateBadge(msg.created_at)}
                            </span>
                          </div>
                        )}

                        <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                          <div
                            className={`max-w-[86%] sm:max-w-[75%] rounded-2xl px-3.5 py-2.5 border transition-all ${
                              msg.is_deleted
                                ? 'bg-slate-100/80 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-500 italic'
                                : isMine
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100'
                            }`}
                          >
                            {/* Sender Name Header (for others in group or direct) */}
                            {!isMine && (
                              <div className="flex items-center gap-1.5 mb-1 text-[11px]">
                                <span className="font-bold text-indigo-600 dark:text-indigo-400">
                                  {msg.sender_name}
                                </span>
                                <span className="text-slate-400" aria-hidden="true">
                                  ·
                                </span>
                                <span className="text-slate-500 dark:text-slate-400">
                                  {msg.sender_store || msg.sender_role}
                                </span>
                              </div>
                            )}

                            {/* Deleted Message Audit Trail */}
                            {msg.is_deleted ? (
                              <div className="flex items-center gap-1.5 text-xs">
                                <Ban className="w-3.5 h-3.5 shrink-0" />
                                <span>
                                  Pesan ini telah dihapus oleh {msg.deleted_by || msg.sender_name}
                                  {msg.deleted_at ? ` · ${formatTimeShort(msg.deleted_at)}` : ''}
                                </span>
                              </div>
                            ) : (
                              <>
                                {/* Quoted Reply Block */}
                                {msg.reply_to && (
                                  <div
                                    className={`mb-2 px-2.5 py-1.5 rounded-xl text-[11px] border ${
                                      isMine
                                        ? 'bg-indigo-700/70 border-indigo-500/50 text-indigo-100'
                                        : 'bg-slate-100 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    <div className="font-bold truncate">{msg.reply_to.sender_name}</div>
                                    <div className="truncate opacity-90">{msg.reply_to.text}</div>
                                  </div>
                                )}

                                {/* Operational Context Tags (#SKU / #SJ / #Order) */}
                                {Array.isArray(msg.context_tags) && msg.context_tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5 mb-2">
                                    {msg.context_tags.map((tag, tIdx) => (
                                      <div
                                        key={`${tag.type}_${tag.code}_${tIdx}`}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-mono tabular-nums border ${
                                          isMine
                                            ? 'bg-indigo-700/80 border-indigo-400/40 text-white'
                                            : 'bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-300'
                                        }`}
                                      >
                                        <span className="font-bold">{tag.type}:</span>
                                        <span>{tag.code}</span>
                                        {tag.label && (
                                          <span className="font-sans opacity-80 truncate max-w-[140px]">
                                            ({tag.label})
                                          </span>
                                        )}

                                 </div>
                                    ))}
                                  </div>
                                )}

                                {/* Google Drive Image Attachment */}
                                {msg.attachment_url && (
                                  <div className="mb-2">
                                    <button
                                      type="button"
                                      onClick={() => setPreviewImageUrl(msg.attachment_url!)}
                                      className="block rounded-xl overflow-hidden border border-black/10 dark:border-white/10 max-w-[240px] cursor-pointer group relative"
                                    >
                                      <img
                                        src={msg.attachment_url}
                                        alt="Lampiran Chat"
                                        referrerPolicy="no-referrer"
                                        className="w-full max-h-52 object-cover group-hover:opacity-95 transition-opacity"
                                      />
                                    </button>
                                  </div>
                                )}

                                {/* Shopee-Style Attached Order Context Card */}
                                {msg.order_context && (
                                  <div
                                    className={`mb-2 p-2.5 rounded-xl border text-left ${
                                      isMine
                                        ? 'bg-indigo-700/80 border-indigo-400/40 text-white'
                                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 shadow-2xs'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between gap-2 border-b border-white/20 dark:border-slate-800 pb-1.5 mb-1.5">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                        <Package className={`w-3.5 h-3.5 shrink-0 ${isMine ? 'text-amber-300' : 'text-indigo-600 dark:text-indigo-400'}`} />
                                        <span className="text-xs font-mono font-bold truncate">
                                          #{msg.order_context.order_id}
                                        </span>
                                      </div>
                                      {msg.order_context.status && (
                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                                          isMine ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                                        }`}>
                                          {msg.order_context.status}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] space-y-0.5">
                                      {msg.order_context.store_name && (
                                        <div className="truncate">
                                          <span className="opacity-75">Toko:</span> <span className="font-semibold">{msg.order_context.store_name}</span>
                                        </div>
                                      )}
                                      {msg.order_context.items_summary && (
                                        <div className="truncate">
                                          <span className="opacity-75">Item:</span> <span className="font-semibold">{msg.order_context.items_summary}</span>
                                        </div>
                                      )}
                                      {msg.order_context.no_resi && (
                                        <div className="font-mono text-[10px] truncate">
                                          <span className="opacity-75">Resi:</span> {msg.order_context.no_resi}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {/* Message Text Body */}
                                {msg.text && (
                                  <div className="text-xs sm:text-sm whitespace-pre-wrap break-words leading-relaxed">
                                    {renderMessageTextWithMentions(msg.text, isMine)}
                                  </div>
                                )}
                              </>
                            )}

                            {/* Footer: Timestamp, (Diedit) badge, ✓/✓✓ Read Receipt & Actions */}
                            <div
                              className={`mt-1.5 flex items-center justify-between gap-3 text-[10px] ${
                                isMine ? 'text-indigo-100/90' : 'text-slate-400 dark:text-slate-500'
                              }`}
                            >
                              <div className="flex items-center gap-1.5 font-mono tabular-nums">
                                <span>{formatTimeShort(msg.created_at)}</span>
                                {msg.is_edited && !msg.is_deleted && (
                                  <span title={msg.edited_at ? `Diedit pada ${formatTimeShort(msg.edited_at)}` : 'Diedit'}>
                                    · Diedit {msg.edited_at ? formatTimeShort(msg.edited_at) : ''}
                                  </span>
                                )}
                              </div>

                              {!msg.is_deleted && (
                                <div className="flex items-center gap-2">
                                  {/* Reply button */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReplyTo({
                                        id: msg.id,
                                        sender_username: msg.sender_username,
                                        sender_name: msg.sender_name,
                                        text: msg.text || '📷 Foto Lampiran',
                                        attachment_url: msg.attachment_url,
                                      });
                                      textareaRef.current?.focus();
                                    }}
                                    className="hover:underline flex items-center gap-0.5 cursor-pointer opacity-85 hover:opacity-100"
                                    title="Balas pesan ini"
                                  >
                                    <Reply className="w-3 h-3" />
                                    <span>Balas</span>
                                  </button>

                                  {/* Edit & Delete Controls (Strict: <= 5 min AND unread by others) */}
                                  {isMine && modCheck.allowed && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditMessage(msg)}
                                        className="hover:underline flex items-center gap-0.5 cursor-pointer text-amber-200 hover:text-white"
                                        title={`Edit pesan (Sisa waktu ${Math.floor(modCheck.remainingSeconds / 60)}m ${modCheck.remainingSeconds % 60}d sebelum dibaca)`}
                                      >
                                        <Edit3 className="w-3 h-3" />
                                        <span>Edit</span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => void handleDeleteMessage(msg)}
                                        className="hover:underline flex items-center gap-0.5 cursor-pointer text-rose-200 hover:text-white"
                                        title="Tarik / Hapus pesan (Sebelum dibaca)"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                        <span>Hapus</span>
                                      </button>
                                    </>
                                  )}

                                 
{/* Read Receipt Checkmarks (✓ Sent vs ✓✓ Read) */}
                                  {isMine && (
                                    <button
                                      type="button"
                                      onClick={() => setInspectReadMessage(msg)}
                                      className="inline-flex items-center gap-0.5 cursor-pointer"
                                      title={
                                        isReadByOthers
                                          ? `Sudah dibaca (✓✓) oleh: ${otherReaders.map((r) => `${r.name} (${formatTimeShort(r.read_at)})`).join(', ')} — Edit/Hapus terkunci`
                                          : 'Terkirim (✓) belum dibaca — Klik untuk info'
                                      }
                                    >
                                      {isReadByOthers ? (
                                        <CheckCheck className="w-3.5 h-3.5 text-emerald-300" />
                                      ) : (
                                        <Check className="w-3.5 h-3.5 text-indigo-200" />
                                      )}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Composer Area */}
              <div className="p-2.5 sm:p-3 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
                {/* Active Edit Banner */}
                {editingMessage && (
                  <div className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0 text-amber-800 dark:text-amber-300">
                      <Edit3 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">
                        Mengedit pesan: <strong>{editingMessage.text}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingMessage(null);
                        setInputText('');
                      }}
                      className="text-amber-700 dark:text-amber-300 hover:underline text-[11px] font-semibold cursor-pointer shrink-0"
                    >
                      Batal
                    </button>
                  </div>
                )}

                {/* Active Reply Quote Banner */}
                {replyTo && !editingMessage && (
                  <div className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        Membalas {replyTo.sender_name}:
                      </span>{' '}
                      <span className="text-slate-600 dark:text-slate-300 truncate">{replyTo.text}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setReplyTo(null)}
                      className="text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Attached Order Context Card (Shopee-Style "Tanya Pesanan") */}
                {pendingOrderContext && (
                  <div className="mb-2 px-3 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800/80 flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                        <Package className="w-4 h-4 text-amber-300" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                          <span>Diskusi Pesanan #{pendingOrderContext.order_id}</span>
                          {pendingOrderContext.status && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-semibold">
                              {pendingOrderContext.status}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                          {pendingOrderContext.store_name || ''}{pendingOrderContext.items_summary ? ` · ${pendingOrderContext.items_summary}` : ''}
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPendingOrderContext(null)}
                      className="p-1 rounded-lg text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                      title="Batal lampirkan pesanan"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* Selected Context Tags & Pending Photo Attachment Preview */}
                {(selectedTags.length > 0 || pendingAttachmentUrl) && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selectedTags.map((t, idx) => (
                      <div
                        key={`${t.type}_${t.code}_${idx}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-[11px] font-mono tabular-nums"
                      >
                        <span className="font-bold">{t.type}:</span>
                        <span>{t.code}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedTags((prev) => prev.filter((_, i) => i !== idx))
                          }
                          className="hover:text-rose-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}

                    {pendingAttachmentUrl && (
                      <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px]">
                        <img
                          src={pendingAttachmentUrl}
                          alt="Preview"
                          referrerPolicy="no-referrer"
                          className="w-6 h-6 rounded object-cover"
                        />
                        <span>Foto siap dikirim (Google Drive CDN)</span>
                        <button
                          type="button"
                          onClick={() => setPendingAttachmentUrl('')}
                          className="hover:text-rose-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Tag Picker Popover (#SKU / #SJ / #Order / #Retur) */}
                {isTagPickerOpen && (
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                        {(['SKU', 'SJ', 'ORDER', 'RETUR'] as ChatContextTagType[]).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => setTagType(t)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                              tagType === t
                                ? 'bg-indigo-600 text-white'
                                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            #{t}
                          </button>
                        ))}
                      </div>
                      <button
                        type="button"
                        onClick={() => setIsTagPickerOpen(false)}
                        className="text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={tagSearchInput}
                        onChange={(e) => setTagSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddContextTag(tagSearchInput);
                          }
                        }}
                        placeholder={
                          tagType === 'SKU'
                            ? 'Ketik kode SKU atau nama produk (contoh: F26KTN07BAD)...'
                            : tagType === 'SJ'
                            ? 'Ketik No. Surat Jalan (contoh: 26.10.00315)...'
                            : tagType === 'ORDER'
                            ? 'Ketik No. Pesanan Store (contoh: MSMKG-261024)...'
                            : 'Ketik No. Retur (contoh: RTR-261027)...'
                        }
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleAddContextTag(tagSearchInput)}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer shrink-0"
                      >
                        Sisipkan
                      </button>
                    </div>

                    {skuSuggestions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {skuSuggestions.map((item) => (
                          <button
                            key={item.sku}
                            type="button"
                            onClick={() => handleAddContextTag(item.sku, item.nama)}
                            className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-[11px] text-left cursor-pointer"
                          >
                            <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                              {item.sku}
                            </span>{' '}
                            <span className="text-slate-500 dark:text-slate-400">{item.nama}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Input Row */}
                <form onSubmit={handleSendOrSaveEdit} className="flex items-end gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleImageFileSelect(file);
                      e.target.value = '';
                    }}
                  />

                  {!editingMessage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setInputText((prev) => `${prev}@`);
                          setMentionQuery('');
                          setMentionIndex(inputText.length);
                          textareaRef.current?.focus();
                        }}
                        className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition-colors cursor-pointer"
                        title="Tag Pengguna / Sebut Anggota (@)"
                      >
                        <AtSign className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        onClick={() => setIsTagPickerOpen((v) => !v)}
                        className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                          isTagPickerOpen
                            ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-300'
                            : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600'
                        }`}
                        title="Sisipkan Tag Nomor Order, SJ, atau SKU Produk"
                      >
                        <Hash className="w-4 h-4" />
                      </button>

                      <button
                        type="button"
                        disabled={isUploadingImage}
                        onClick={() => fileInputRef.current?.click()}
                        className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-600 transition-colors cursor-pointer disabled:opacity-50"
                        title="Lampirkan Foto / Screenshot Kendala (Otomatis disimpan di Google Drive CDN)"
                      >
                        {isUploadingImage ? (
                          <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
                        ) : (
                          <ImageIcon className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  )}

                  <div className="flex-1 relative min-w-0">
                    {/* Mention (@) Autocomplete Popover */}
                    {mentionQuery !== null && mentionCandidates.length > 0 && (
                      <div className="absolute bottom-full left-0 mb-2 w-64 max-h-52 overflow-y-auto rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-30 divide-y divide-slate-100 dark:divide-slate-800">
                        <div className="p-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                          <span>Sebut Pengguna (@)</span>
                          <span className="text-[9px] font-normal text-slate-400">Tab / Enter</span>
                        </div>
                        {mentionCandidates.map((c) => (
                          <button
                            key={c.username}
                            type="button"
                            onClick={() => handleSelectMention(c)}
                            className="w-full px-3 py-2 flex items-center justify-between gap-2 text-left hover:bg-indigo-50 dark:hover:bg-indigo-950/50 cursor-pointer transition-colors"
                          >
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {c.name}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono truncate">
                                @{c.username}
                              </div>
                            </div>
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold shrink-0">
                              {c.role}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <textarea
                      ref={textareaRef}
                      rows={1}
                      value={inputText}
                      onPaste={handlePasteClipboard}
                      onChange={(e) => {
                        const val = e.target.value;
                        setInputText(val);
                        if (activeRoom) {
                          liveChatManager.sendTypingIndicator(val.trim() ? activeRoom.id : null);
                        }
                        const cursorPos = e.target.selectionStart || val.length;
                        const textUpToCursor = val.slice(0, cursorPos);
                        const match = textUpToCursor.match(/@([a-zA-Z0-9_\-]*)$/);
                        if (match) {
                          setMentionQuery(match[1]);
                          setMentionIndex(cursorPos - match[0].length);
                        } else {
                          setMentionQuery(null);
                          setMentionIndex(-1);
                        }
                      }}
                      onKeyDown={(e) => {
                        if (mentionQuery !== null && mentionCandidates.length > 0) {
                          if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                            e.preventDefault();
                            handleSelectMention(mentionCandidates[0]);
                            return;
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            setMentionQuery(null);
                            return;
                          }
                        }
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          void handleSendOrSaveEdit();
                        }
                      }}
                      placeholder={
                        editingMessage
                          ? 'Ketik perubahan pesan...'
                          : 'Ketik pesan... (@tag user, #tag dokumen, paste foto)'
                      }
                      className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-indigo-500 resize-none max-h-28"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={
                      isSending ||
                      isUploadingImage ||
                      (!inputText.trim() && !pendingAttachmentUrl && selectedTags.length === 0)
                    }
                    className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">
                      {editingMessage ? 'Simpan' : 'Kirim'}
                    </span>
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>

      {/* MODAL: CREATE OR MANAGE GROUP DISCUSSION ROOM (ADMIN & SUPERADMIN ONLY) */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-3 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg max-h-[90vh] flex flex-col shadow-xl overflow-hidden">
            <div className="px-4 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {groupModalMode === 'create'
                    ? 'Buat Ruang Diskusi Grup Baru'
                    : 'Kelola Anggota & Ruang Diskusi'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Pilih beberapa user untuk dimasukkan ke dalam ruang diskusi ini
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsGroupModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGroupModal} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="p-4 space-y-3 overflow-y-auto flex-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Nama Ruang Diskusi *
                  </label>
                  <input
                    type="text"
                    required
                    value={groupNameInput}
                    onChange={(e) => setGroupNameInput(e.target.value)}
                    placeholder="Contoh: Koordinasi SO Blok A / Urgent Kiriman Store"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Topik / Deskripsi Singkat (Opsional)
                  </label>
                  <input
                    type="text"
                    value={groupTopicInput}
                    onChange={(e) => setGroupTopicInput(e.target.value)}
                    placeholder="Contoh: Diskusi percepatan picking & resi cabang"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Member Checklist */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Pilih Anggota Grup ({selectedMemberUsernames.size} dipilih)
                    </label>
                    <div className="flex items-center gap-2 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          const allUnames = sortedDirectoryUsers.map((u) => u.username.toLowerCase());
                          setSelectedMemberUsernames(new Set(allUnames));
                        }}
                        className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                      >
                        Pilih Semua
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => setSelectedMemberUsernames(new Set())}
                        className="text-slate-500 hover:underline cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={memberSearchQuery}
                      onChange={(e) => setMemberSearchQuery(e.target.value)}
                      placeholder="Cari nama user, role, atau store..."
                      className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800">
                    {sortedDirectoryUsers
                      .filter((u) => {
                        if (!memberSearchQuery.trim()) return true;
                        const q = memberSearchQuery.trim().toLowerCase();
                        return (
                          u.name.toLowerCase().includes(q) ||
                          u.username.toLowerCase().includes(q) ||
                          u.role.toLowerCase().includes(q) ||
                          (u.store_name || '').toLowerCase().includes(q)
                        );
                      })
                      .map((u) => {
                        const uname = u.username.toLowerCase();
                        const isChecked = selectedMemberUsernames.has(uname);
                        return (
                          <label
                            key={uname}
                            className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  setSelectedMemberUsernames((prev) => {
                                    const next = new Set(prev);
                                    if (e.target.checked) next.add(uname);
                                    else next.delete(uname);
                                    return next;
                                  });
                                }}
                                className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate flex items-center gap-1.5">
                                  <span>{u.name}</span>
                                  {u.isOnline && (
                                    <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online" />
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                  {u.role}
                                  {u.store_name ? ` · ${u.store_name}` : ''} · @{u.username}
                                </div>
                              </div>
                            </div>
                            {u.isOnline && (
                              <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                                Online
                              </span>
                            )}
                          </label>
                        );
                      })}
                  </div>
                </div>
              </div>

              <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between gap-2">
                {groupModalMode === 'manage' && activeRoom ? (
                  <button
                    type="button"
                    onClick={async () => {
                      const res = await liveChatManager.deleteGroupRoom(activeRoom.id);
                      if (res.success) {
                        onNotify?.('Ruang diskusi grup telah dihapus.', 'info');
                        setIsGroupModalOpen(false);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-rose-200 dark:border-rose-900/60 text-rose-600 dark:text-rose-400 text-xs font-semibold hover:bg-rose-50 cursor-pointer"
                  >
                    Hapus Grup
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsGroupModalOpen(false)}
                    className="px-3.5 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingGroup || !groupNameInput.trim() || selectedMemberUsernames.size === 0}
                    className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
                  >
                    {isSavingGroup
                      ? 'Menyimpan...'
                      : groupModalMode === 'create'
                      ? 'Buat Ruang Diskusi'
                      : 'Simpan Perubahan'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: READ RECEIPT & AUDIT STATUS INSPECTOR */}
      {inspectReadMessage && (
        <div
          className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          onClick={() => setInspectReadMessage(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-4 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                <CheckCheck className="w-4 h-4 text-emerald-500" />
                <span>Info Status Baca & Audit Pesan</span>
              </h4>
              <button
                type="button"
                onClick={() => setInspectReadMessage(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200">
              {inspectReadMessage.text || '📷 Lampiran Foto'}
            </div>

            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Dibaca oleh (✓✓):
              </div>
              {inspectReadMessage.read_by.filter(
                (r) => r.username.toLowerCase() !== inspectReadMessage.sender_username.toLowerCase()
              ).length === 0 ? (
                <p className="text-xs text-slate-500">
                  Belum dibaca oleh penerima (Status: ✓ Terkirim).
                </p>
              ) : (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {inspectReadMessage.read_by
                    .filter(
                      (r) =>
                        r.username.toLowerCase() !== inspectReadMessage.sender_username.toLowerCase()
                    )
                    .map((r) => (
                      <div
                        key={r.username}
                        className="flex items-center justify-between text-xs py-1 border-b border-slate-100 dark:border-slate-800"
                      >
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {r.name}
                        </span>
                        <span className="font-mono tabular-nums text-[11px] text-emerald-600 dark:text-emerald-400">
                          ✓✓ {formatTimeShort(r.read_at)}
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </div>

            <div className="pt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 shrink-0 text-amber-500" />
              <span>
                Aturan Akuntabilitas: Pesan hanya dapat diedit/dihapus dalam 5 menit & sebelum dibaca penerima.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE CHAT ROOM */}
      {confirmDeleteRoom && (
        <div
          className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
          onClick={() => !isDeletingRoom && setConfirmDeleteRoom(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-sm p-4 space-y-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800/60 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                    {confirmDeleteRoom.type === 'group'
                      ? 'Hapus Ruang Diskusi Grup?'
                      : 'Hapus Percakapan Chat?'}
                  </h4>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {getRoomDisplayMeta(confirmDeleteRoom).title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={isDeletingRoom}
                onClick={() => setConfirmDeleteRoom(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Seluruh daftar dan riwayat pesan pada percakapan{' '}
              <strong>{getRoomDisplayMeta(confirmDeleteRoom).title}</strong> akan dihapus secara permanen.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={isDeletingRoom}
                onClick={() => setConfirmDeleteRoom(null)}
                className="px-3.5 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeletingRoom}
                onClick={async () => {
                  setIsDeletingRoom(true);
                  try {
                    const res = await liveChatManager.deleteChatRoom(confirmDeleteRoom.id);
                    if (!res.success) {
                      onNotify?.(res.error || 'Gagal menghapus percakapan', 'error');
                    } else {
                      onNotify?.('Percakapan berhasil dihapus.', 'info');
                      setConfirmDeleteRoom(null);
                    }
                  } finally {
                    setIsDeletingRoom(false);
                  }
                }}
                className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingRoom ? 'Menghapus...' : 'Ya, Hapus Chat'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GROUP INFO & MEMBER MANAGEMENT */}
      {isGroupInfoModalOpen && activeRoom && activeRoom.type === 'group' && (() => {
        const isCreator = String(activeRoom.created_by || '').trim().toLowerCase() === myUsername;
        const canManageMembers = isAdminGroupManager || isCreator;
        const filteredMembers = activeRoom.participants.filter((uname) => {
          if (!groupInfoSearch.trim()) return true;
          const q = groupInfoSearch.trim().toLowerCase();
          const prof = activeRoom.participant_profiles?.[uname.toLowerCase()];
          const name = prof?.name || getUserPersonName(uname) || uname;
          return uname.toLowerCase().includes(q) || name.toLowerCase().includes(q);
        });

        return (
          <div
            className="fixed inset-0 z-[125] flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-4"
            onClick={() => setIsGroupInfoModalOpen(false)}
          >
            <div
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-slate-50/70 dark:bg-slate-800/40">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center text-sm font-bold shadow-xs shrink-0">
                    <Users className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white truncate">
                      {activeRoom.name}
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {activeRoom.topic || `${activeRoom.participants.length} Anggota`}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsGroupInfoModalOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Info Meta */}
              <div className="px-4 py-2.5 bg-indigo-50/60 dark:bg-indigo-950/30 border-b border-indigo-100 dark:border-indigo-900/50 flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300 shrink-0">
                <div className="flex items-center gap-1.5 truncate">
                  <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="truncate">
                    Pembuat: <strong>{activeRoom.created_by_name || activeRoom.created_by}</strong>
                    {isCreator && ' (Anda)'}
                  </span>
                </div>
                <span className="font-mono text-[10px] text-slate-400 shrink-0">
                  {formatDateBadge(activeRoom.created_at)}
                </span>
              </div>

              {/* Member Search Bar */}
              <div className="p-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={groupInfoSearch}
                    onChange={(e) => setGroupInfoSearch(e.target.value)}
                    placeholder="Cari anggota dalam grup..."
                    className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Scrollable Members List */}
              <div className="flex-1 min-h-0 overflow-y-auto p-2 divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredMembers.map((uname) => {
                  const uLower = uname.toLowerCase();
                  const prof =
                    activeRoom.participant_profiles?.[uLower] ||
                    chatState.allUsersDirectory.find((u) => u.username.toLowerCase() === uLower);
                  const isOnline = Boolean(chatState.onlineUsers[uLower]);
                  const isTargetCreator = uLower === String(activeRoom.created_by || '').trim().toLowerCase();
                  const isMe = uLower === myUsername;

                  return (
                    <div
                      key={uLower}
                      className="p-2.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 rounded-xl transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0">
                          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-xs font-bold text-slate-700 dark:text-slate-200 uppercase">
                            {(prof?.name || uLower).slice(0, 2)}
                          </div>
                          <span
                            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                              isOnline ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                            title={isOnline ? 'Online' : 'Offline'}
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                              {prof?.name || getUserPersonName(uLower) || uLower}
                            </span>
                            {isTargetCreator && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded-md bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 text-[10px] font-bold shrink-0">
                                <Crown className="w-2.5 h-2.5" /> Pembuat
                              </span>
                            )}
                            {isMe && (
                              <span className="text-[10px] font-semibold text-slate-400 shrink-0">
                                (Anda)
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            <span>@{uLower}</span>
                            {prof?.role && <span> · {prof.role}</span>}
                            {prof?.store_name && <span> ({prof.store_name})</span>}
                            {isOnline && <span className="text-emerald-600 dark:text-emerald-400"> · Online</span>}
                          </div>
                        </div>
                      </div>

                      {/* Remove member button (Creator or Admin only, cannot remove creator) */}
                      {canManageMembers && !isTargetCreator && !isMe && (
                        <button
                          type="button"
                          disabled={isRemovingMember === uLower}
                          onClick={async () => {
                            if (!confirm(`Keluarkan ${prof?.name || uLower} dari ruang diskusi ini?`)) return;
                            setIsRemovingMember(uLower);
                            try {
                              const remaining = activeRoom.participants.filter((p) => p.toLowerCase() !== uLower);
                              const res = await liveChatManager.updateGroupMembers(activeRoom.id, remaining);
                              if (!res.success) {
                                onNotify?.(res.error || 'Gagal mengeluarkan anggota', 'error');
                              } else {
                                onNotify?.(`${prof?.name || uLower} telah dikeluarkan dari grup.`, 'info');
                              }
                            } finally {
                              setIsRemovingMember(null);
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors cursor-pointer shrink-0"
                          title="Keluarkan dari grup"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Modal Action Footer */}
              <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex flex-wrap items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-1.5">
                  {canManageMembers ? (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setIsGroupInfoModalOpen(false);
                          handleOpenManageGroupModal();
                        }}
                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <UserPlus className="w-3.5 h-3.5" />
                        <span>Tambah / Edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setIsGroupInfoModalOpen(false);
                          setConfirmDeleteRoom(activeRoom);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus Grup</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        if (!confirm(`Yakin ingin keluar dari ruang diskusi "${activeRoom.name}"?`)) return;
                        const res = await liveChatManager.leaveGroupRoom(activeRoom.id);
                        if (!res.success) {
                          onNotify?.(res.error || 'Gagal keluar dari grup', 'error');
                        } else {
                          onNotify?.(`Anda telah keluar dari ruang diskusi "${activeRoom.name}".`, 'info');
                          setIsGroupInfoModalOpen(false);
                          void liveChatManager.selectRoom(null);
                        }
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Keluar dari Grup</span>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setIsGroupInfoModalOpen(false)}
                  className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* LIGHTBOX IMAGE PREVIEW */}
      {previewImageUrl && (
        <div
          className="fixed inset-0 z-[130] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]">
            <button
              type="button"
              onClick={() => setPreviewImageUrl(null)}
              className="absolute -top-10 right-0 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold cursor-pointer"
            >
              Tutup ✕
            </button>
            <img
              src={previewImageUrl}
              alt="Preview Lampiran Chat"
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[85vh] rounded-2xl object-contain shadow-2xl"
            />
          </div>
        </div>
      )}
    </div>
  );
};
